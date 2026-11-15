import { getDatabase } from '../../../db/database.js';
import { FiveSimConfigService } from './FiveSimConfigService.js';
import {
  FiveSimProfile,
  FiveSimOrdersResponse,
  FiveSimOrderItem,
  FiveSimPaymentsResponse,
  FiveSimPaymentItem
} from './types.js';

export class FiveSimUserService {
  private configService: FiveSimConfigService;

  constructor() {
    this.configService = FiveSimConfigService.getInstance();
  }

  private get client() {
    return this.configService.getClient();
  }

  // =========================================================================
  // 2.1 Profile / Balance / Rating
  // =========================================================================

  /**
   * Fetch live 5SIM user profile and update local telemetry
   */
  public async getProfile(): Promise<FiveSimProfile> {
    const profile = await this.client.getProfile();
    this.configService.updateProfileStats(profile);
    return profile;
  }

  // =========================================================================
  // 2.2 Order History
  // =========================================================================

  /**
   * Fetch live orders from 5SIM and optionally sync to database cache
   */
  public async fetchOrders(params: {
    category: 'activation' | 'hosting';
    limit?: number;
    offset?: number;
    order?: string;
    reverse?: boolean;
    syncToDb?: boolean;
  }): Promise<FiveSimOrdersResponse> {
    const response = await this.client.getOrders({
      category: params.category,
      limit: params.limit,
      offset: params.offset,
      order: params.order,
      reverse: params.reverse
    });

    if (params.syncToDb !== false && response.Data && Array.isArray(response.Data)) {
      this.saveOrdersToDb(params.category, response.Data);
    }

    return response;
  }

  /**
   * Batch upsert 5SIM orders into database
   */
  public saveOrdersToDb(category: 'activation' | 'hosting', orders: FiveSimOrderItem[]): void {
    if (!orders || orders.length === 0) return;
    try {
      const db = getDatabase();
      const insert = db.prepare(`
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
          forwarding = excluded.forwarding,
          forwarding_number = excluded.forwarding_number,
          raw_data = excluded.raw_data,
          updated_at = datetime('now')
      `);

      const tx = db.transaction((rows: FiveSimOrderItem[]) => {
        for (const o of rows) {
          const smsPayload = JSON.stringify(o.sms || []);
          const smsCount = Array.isArray(o.sms) ? o.sms.length : 0;
          insert.run(
            o.id,
            category,
            o.phone,
            o.operator || '',
            o.product,
            o.price,
            o.status,
            o.expires || '',
            o.country || '',
            smsPayload,
            smsCount,
            o.forwarding ? 1 : 0,
            o.forwarding_number || '',
            JSON.stringify(o),
            o.created_at || new Date().toISOString()
          );
        }
      });

      tx(orders);
    } catch (err) {
      console.error('[5SIM User] Error saving orders to DB:', err);
    }
  }

  /**
   * Get cached orders from database with pagination and optional search
   */
  public getCachedOrders(params: {
    category?: 'activation' | 'hosting';
    status?: string;
    product?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): { total: number; rows: FiveSimOrderItem[] } {
    try {
      const db = getDatabase();
      const conditions: string[] = [];
      const queryParams: any[] = [];

      if (params.category && (params.category as string) !== 'all') {
        conditions.push('category = ?');
        queryParams.push(params.category);
      }
      if (params.status) {
        if (params.status === 'active') {
          conditions.push("status IN ('PENDING', 'RECEIVED')");
        } else {
          conditions.push('status = ?');
          queryParams.push(params.status);
        }
      }
      if (params.product) {
        conditions.push('product = ?');
        queryParams.push(params.product);
      }
      if (params.search) {
        conditions.push('(phone LIKE ? OR product LIKE ? OR operator LIKE ?)');
        const s = `%${params.search}%`;
        queryParams.push(s, s, s);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countRow = db.prepare(`SELECT COUNT(*) as count FROM fivesim_orders ${whereClause}`).get(...queryParams) as { count: number };
      const total = countRow?.count || 0;

      const limit = params.limit || 50;
      const offset = params.offset || 0;

      const rows = db.prepare(`
        SELECT * FROM fivesim_orders
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `).all(...queryParams, limit, offset) as any[];

      const formatted: FiveSimOrderItem[] = rows.map((r) => {
        let sms: any[] = [];
        try {
          if (r.sms_payload) sms = JSON.parse(r.sms_payload);
        } catch {}
        return {
          id: r.id,
          phone: r.phone,
          operator: r.operator,
          product: r.product,
          price: r.price,
          status: r.status,
          expires: r.expires_at,
          sms,
          created_at: r.created_at,
          country: r.country,
          forwarding: Boolean(r.forwarding),
          forwarding_number: r.forwarding_number
        };
      });

      return { total, rows: formatted };
    } catch (err) {
      console.error('[5SIM User] Error getting cached orders:', err);
      return { total: 0, rows: [] };
    }
  }

  // =========================================================================
  // 2.3 Payments History
  // =========================================================================

  /**
   * Fetch live payments from 5SIM and optionally sync to database cache
   */
  public async fetchPayments(params?: {
    limit?: number;
    offset?: number;
    order?: string;
    reverse?: boolean;
    syncToDb?: boolean;
  }): Promise<FiveSimPaymentsResponse> {
    const response = await this.client.getPayments(params);

    if (params?.syncToDb !== false && response.Data && Array.isArray(response.Data)) {
      this.savePaymentsToDb(response.Data);
    }

    return response;
  }

  /**
   * Batch upsert 5SIM payments into database
   */
  public savePaymentsToDb(payments: FiveSimPaymentItem[]): void {
    if (!payments || payments.length === 0) return;
    try {
      const db = getDatabase();
      const insert = db.prepare(`
        INSERT INTO fivesim_payments (
          id, type_name, provider_name, amount, balance, raw_data, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          amount = excluded.amount,
          balance = excluded.balance,
          raw_data = excluded.raw_data
      `);

      const tx = db.transaction((rows: FiveSimPaymentItem[]) => {
        for (const p of rows) {
          insert.run(
            p.ID,
            p.TypeName || '',
            p.ProviderName || '',
            p.Amount,
            p.Balance,
            JSON.stringify(p),
            p.CreatedAt || new Date().toISOString()
          );
        }
      });

      tx(payments);
    } catch (err) {
      console.error('[5SIM User] Error saving payments to DB:', err);
    }
  }

  /**
   * Get cached payments from database with pagination
   */
  public getCachedPayments(params?: { limit?: number; offset?: number }): { total: number; rows: FiveSimPaymentItem[] } {
    try {
      const db = getDatabase();
      const countRow = db.prepare('SELECT COUNT(*) as count FROM fivesim_payments').get() as { count: number };
      const total = countRow?.count || 0;

      const limit = params?.limit || 50;
      const offset = params?.offset || 0;

      const rows = db.prepare(`
        SELECT * FROM fivesim_payments
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `).all(limit, offset) as any[];

      const formatted: FiveSimPaymentItem[] = rows.map((r) => ({
        ID: r.id,
        TypeName: r.type_name,
        ProviderName: r.provider_name,
        Amount: r.amount,
        Balance: r.balance,
        CreatedAt: r.created_at
      }));

      return { total, rows: formatted };
    } catch (err) {
      console.error('[5SIM User] Error getting cached payments:', err);
      return { total: 0, rows: [] };
    }
  }
}

