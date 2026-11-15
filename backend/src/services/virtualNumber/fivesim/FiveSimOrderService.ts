import { getDatabase } from '../../../db/database.js';
import { getSocketIO } from '../../../socket/socketManager.js';
import { FiveSimConfigService } from './FiveSimConfigService.js';
import {
  FiveSimOrderItem,
  BuyActivationParams,
  BuyHostingParams,
  ReuseNumberParams,
  FiveSimHostingInboxResponse
} from './types.js';

export class FiveSimOrderService {
  private static instance: FiveSimOrderService | null = null;
  private configService: FiveSimConfigService;
  private activePollingWatchers: Map<number, NodeJS.Timeout> = new Map();
  private pollingStartTimes: Map<number, number> = new Map();

  private constructor() {
    this.configService = FiveSimConfigService.getInstance();
  }

  public static getInstance(): FiveSimOrderService {
    if (!FiveSimOrderService.instance) {
      FiveSimOrderService.instance = new FiveSimOrderService();
    }
    return FiveSimOrderService.instance;
  }

  private get client() {
    return this.configService.getClient();
  }

  // =========================================================================
  // PART 5: PURCHASE (ACTIVATION, HOSTING, RE-BUY)
  // =========================================================================

  /**
   * 5.1 Purchase activation virtual number for OTP
   */
  public async buyActivation(params: BuyActivationParams, userId?: string): Promise<FiveSimOrderItem> {
    const order = await this.client.buyActivation(params);

    // Save order record to local database
    this.persistOrder('activation', order);

    // Start background polling for SMS arrival
    this.startSmsWatcher(order.id, userId);

    // Emit real-time notification
    const io = getSocketIO();
    if (io) {
      const eventData = { order, userId, category: 'activation' };
      if (userId) {
        io.to(`user:${userId}`).emit('fivesim:order_created', eventData);
      }
      io.emit('fivesim:order_created', eventData);
    }

    return order;
  }

  /**
   * 5.2 Purchase hosting (rental) virtual number
   */
  public async buyHosting(params: BuyHostingParams, userId?: string): Promise<FiveSimOrderItem> {
    const order = await this.client.buyHosting(params);

    this.persistOrder('hosting', order);

    const io = getSocketIO();
    if (io) {
      const eventData = { order, userId, category: 'hosting' };
      if (userId) {
        io.to(`user:${userId}`).emit('fivesim:order_created', eventData);
      }
      io.emit('fivesim:order_created', eventData);
    }

    return order;
  }

  /**
   * 5.3 Re-buy previous number
   */
  public async reuseNumber(params: ReuseNumberParams, userId?: string): Promise<FiveSimOrderItem> {
    const order = await this.client.reuseNumber(params);

    this.persistOrder('activation', order);
    this.startSmsWatcher(order.id, userId);

    return order;
  }

  // =========================================================================
  // PART 6: ORDER MANAGEMENT & SMS INBOX
  // =========================================================================

  /**
   * 6.1 Check Order status and poll for incoming SMS
   */
  public async checkOrder(orderId: number | string, userId?: string): Promise<FiveSimOrderItem> {
    const id = typeof orderId === 'string' ? parseInt(orderId, 10) : orderId;
    const order = await this.client.checkOrder(id);

    // Update database record
    this.updateOrderInDb(order, userId);

    return order;
  }

  /**
   * 6.2 Finish Order (Mark complete after SMS received)
   * Boosts rating by +0.5 points
   */
  public async finishOrder(orderId: number | string, userId?: string): Promise<FiveSimOrderItem> {
    const id = typeof orderId === 'string' ? parseInt(orderId, 10) : orderId;
    this.stopSmsWatcher(id);

    const order = await this.client.finishOrder(id);
    this.updateOrderInDb(order, userId);

    const io = getSocketIO();
    if (io) {
      if (userId) {
        io.to(`user:${userId}`).emit('fivesim:order_finished', { orderId: id, order });
      }
      io.emit('fivesim:order_finished', { orderId: id, order });
    }

    return order;
  }

  /**
   * 6.3 Cancel Order (Before SMS arrives)
   * Prevents timeout penalty (-0.15 vs -0.1)
   */
  public async cancelOrder(orderId: number | string, userId?: string): Promise<FiveSimOrderItem> {
    const id = typeof orderId === 'string' ? parseInt(orderId, 10) : orderId;
    this.stopSmsWatcher(id);

    const order = await this.client.cancelOrder(id);
    this.updateOrderInDb(order, userId);

    const io = getSocketIO();
    if (io) {
      if (userId) {
        io.to(`user:${userId}`).emit('fivesim:order_canceled', { orderId: id, order });
      }
      io.emit('fivesim:order_canceled', { orderId: id, order });
    }

    return order;
  }

  /**
   * 6.4 Ban Order (Number already used by someone else)
   */
  public async banOrder(orderId: number | string, userId?: string): Promise<FiveSimOrderItem> {
    const id = typeof orderId === 'string' ? parseInt(orderId, 10) : orderId;
    this.stopSmsWatcher(id);

    const order = await this.client.banOrder(id);
    this.updateOrderInDb(order, userId);

    const io = getSocketIO();
    if (io) {
      if (userId) {
        io.to(`user:${userId}`).emit('fivesim:order_banned', { orderId: id, order });
      }
      io.emit('fivesim:order_banned', { orderId: id, order });
    }

    return order;
  }

  /**
   * 6.5 Retrieve SMS inbox for hosting / rental lines
   */
  public async getHostingInbox(orderId: number | string): Promise<FiveSimHostingInboxResponse> {
    return this.client.getHostingInbox(orderId);
  }

  // =========================================================================
  // BACKGROUND POLLING & REAL-TIME DISPATCH
  // =========================================================================

  /**
   * Smart OTP Code Extractor from SMS text
   */
  public static extractOtpFromText(text: string): string {
    if (!text) return '';
    // 1. Google style "G-123456"
    const gMatch = text.match(/\bG-(\d{4,8})\b/i);
    if (gMatch) return gMatch[1];

    // 2. WhatsApp style hyphenated "123-456"
    const hyphenMatch = text.match(/\b(\d{3}-\d{3})\b/);
    if (hyphenMatch) return hyphenMatch[1];

    // 3. Keyword followed by digits: "code is 123456", "verification code: 123456", "OTP: 1234"
    const kwMatch = text.match(/(?:code|otp|pin|verification|password|código|код)[^\d\r\n]{1,15}(\d{4,8})\b/i);
    if (kwMatch) return kwMatch[1];

    // 4. Standalone 4 to 8 digit number
    const standaloneMatch = text.match(/\b(\d{4,8})\b/);
    if (standaloneMatch) return standaloneMatch[1];

    return '';
  }

  /**
   * Start 3.5s polling loop for incoming SMS
   */
  public startSmsWatcher(orderId: number, userId?: string): void {
    if (this.activePollingWatchers.has(orderId)) return;

    this.pollingStartTimes.set(orderId, Date.now());

    console.log(`[5SIM Watcher] Starting background SMS watcher for Order #${orderId}...`);

    const interval = setInterval(async () => {
      try {
        const startTime = this.pollingStartTimes.get(orderId) || Date.now();
        const elapsedMs = Date.now() - startTime;

        const order = await this.client.checkOrder(orderId);

        // Sanitize & enhance SMS array with smart OTP extractor
        if (Array.isArray(order.sms)) {
          for (const s of order.sms) {
            if (!s.code && s.text) {
              s.code = FiveSimOrderService.extractOtpFromText(s.text);
            }
          }
        }

        const hasSms = Array.isArray(order.sms) && order.sms.length > 0;

        // Check if SMS arrived
        if (hasSms) {
          console.log(`[5SIM Watcher] SMS ARRIVED for Order #${orderId}! Code: [${order.sms![0].code}]`);
          this.updateOrderInDb(order, userId, true);
          // Once SMS is received, stop polling
          this.stopSmsWatcher(orderId);
          return;
        }

        // Auto-cancellation safeguard at 14 minutes:
        // Automatically cancels order to prevent the harsh -0.15 rating timeout penalty
        // (Cancellation only costs -0.1 rating points and refunds balance immediately)
        if (elapsedMs >= 14 * 60 * 1000 && !hasSms) {
          console.log(`[5SIM Watcher] Order #${orderId} reached 14 minutes without SMS. Auto-canceling to protect rating (-0.1 vs -0.15)...`);
          try {
            await this.cancelOrder(orderId, userId);
            const io = getSocketIO();
            if (io) {
              const payload = {
                orderId,
                message: 'Order auto-canceled at 14 minutes to protect account rating (-0.1 vs -0.15 timeout). Balance refunded.'
              };
              if (userId) io.to(`user:${userId}`).emit('fivesim:order_autocanceled', payload);
              io.emit('fivesim:order_autocanceled', payload);
            }
          } catch (cancelErr: any) {
            console.warn(`[5SIM Watcher] Failed to auto-cancel #${orderId}:`, cancelErr.message);
          }
          this.stopSmsWatcher(orderId);
          return;
        }

        // Auto-stop after 15 minutes max waiting time
        if (elapsedMs > 15 * 60 * 1000) {
          console.log(`[5SIM Watcher] Order #${orderId} exceeded 15min max waiting window. Stopping watcher.`);
          this.stopSmsWatcher(orderId);
          return;
        }

        // Terminal statuses check
        if (['FINISHED', 'CANCELED', 'TIMEOUT', 'BANNED'].includes(order.status)) {
          console.log(`[5SIM Watcher] Order #${orderId} reached terminal state: ${order.status}. Stopping watcher.`);
          this.updateOrderInDb(order, userId);
          this.stopSmsWatcher(orderId);
          return;
        }
      } catch (err: any) {
        console.warn(`[5SIM Watcher] Poll error for #${orderId}:`, err.message);
      }
    }, 3500); // Safe 3.5s interval well under 100 req/sec

    this.activePollingWatchers.set(orderId, interval);
  }

  /**
   * Stop polling loop for an order
   */
  public stopSmsWatcher(orderId: number): void {
    const timer = this.activePollingWatchers.get(orderId);
    if (timer) {
      clearInterval(timer);
      this.activePollingWatchers.delete(orderId);
    }
    this.pollingStartTimes.delete(orderId);
  }

  // =========================================================================
  // DB PERSISTENCE HELPERS
  // =========================================================================

  private persistOrder(category: 'activation' | 'hosting', order: FiveSimOrderItem): void {
    try {
      const db = getDatabase();
      db.prepare(`
        INSERT INTO fivesim_orders (
          id, category, phone, operator, product, price, status,
          expires_at, country, sms_payload, sms_count, forwarding,
          forwarding_number, raw_data, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          price = excluded.price,
          expires_at = excluded.expires_at,
          sms_payload = excluded.sms_payload,
          sms_count = excluded.sms_count,
          raw_data = excluded.raw_data,
          updated_at = datetime('now')
      `).run(
        order.id,
        category,
        order.phone,
        order.operator || '',
        order.product,
        order.price,
        order.status,
        order.expires || '',
        order.country || '',
        JSON.stringify(order.sms || []),
        Array.isArray(order.sms) ? order.sms.length : 0,
        order.forwarding ? 1 : 0,
        order.forwarding_number || '',
        JSON.stringify(order),
        order.created_at || new Date().toISOString()
      );
    } catch (err) {
      console.error('[5SIM OrderService] Error persisting order to DB:', err);
    }
  }

  private updateOrderInDb(order: FiveSimOrderItem, userId?: string, isNewSms = false): void {
    try {
      // Auto-extract OTP if missing from SMS text
      if (Array.isArray(order.sms)) {
        for (const s of order.sms) {
          if (!s.code && s.text) {
            s.code = FiveSimOrderService.extractOtpFromText(s.text);
          }
        }
      }

      const db = getDatabase();
      const existing = db.prepare('SELECT sms_count FROM fivesim_orders WHERE id = ?').get(order.id) as any;
      const prevSmsCount = existing?.sms_count || 0;
      const newSmsCount = Array.isArray(order.sms) ? order.sms.length : 0;

      db.prepare(`
        UPDATE fivesim_orders
        SET status = ?,
            sms_payload = ?,
            sms_count = ?,
            expires_at = ?,
            raw_data = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(
        order.status,
        JSON.stringify(order.sms || []),
        newSmsCount,
        order.expires || '',
        JSON.stringify(order),
        order.id
      );

      const io = getSocketIO();
      if (io) {
        // Emit SMS arrival notification if new SMS arrived
        if (newSmsCount > prevSmsCount || isNewSms) {
          const latestSms = order.sms && order.sms.length > 0 ? order.sms[order.sms.length - 1] : null;
          const payload = {
            orderId: order.id,
            phone: order.phone,
            product: order.product,
            sms: latestSms,
            allSms: order.sms,
            order
          };
          if (userId) {
            io.to(`user:${userId}`).emit('fivesim:sms_received', payload);
          }
          io.emit('fivesim:sms_received', payload);
        }

        // Emit general order update
        const updatePayload = { orderId: order.id, status: order.status, order };
        if (userId) {
          io.to(`user:${userId}`).emit('fivesim:order_updated', updatePayload);
        }
        io.emit('fivesim:order_updated', updatePayload);
      }
    } catch (err) {
      console.error('[5SIM OrderService] Error updating order in DB:', err);
    }
  }
}

