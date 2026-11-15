import crypto from 'crypto';
import { getDatabase } from '../../../db/database.js';
import { GrizzlyProviderConfigService } from './GrizzlyProviderConfigService.js';
import {
  GrizzlyPushSmsOutboundRequest,
  GrizzlyPushSmsResponse
} from './types.js';

export class GrizzlySmsQueueService {
  private static workerInterval: NodeJS.Timeout | null = null;
  private static isProcessing = false;

  /**
   * Start durable SMS background retry worker
   */
  public static startWorker(): void {
    if (this.workerInterval) return;
    this.workerInterval = setInterval(() => {
      this.processPendingDeliveries().catch((err) => {
        console.error('[Grizzly SMS Worker] Error in retry loop:', err);
      });
    }, 3000);
    console.log('[Grizzly SMS Worker] Durable SMS delivery worker started.');
  }

  public static stopWorker(): void {
    if (this.workerInterval) {
      clearInterval(this.workerInterval);
      this.workerInterval = null;
    }
  }

  /**
   * Generates a unique Ulong smsId
   */
  private static generateSmsId(): number {
    const db = getDatabase();
    for (let i = 0; i < 10; i++) {
      const candidate = Math.floor(100000 + Math.random() * 900000);
      const exists = db.prepare('SELECT 1 FROM grizzly_sms_messages WHERE sms_id = ?').get(candidate);
      if (!exists) return candidate;
    }
    return Math.floor(Date.now() % 900000) + 100000;
  }

  /**
   * Enqueue and immediately attempt PUSH_SMS delivery
   */
  public static async enqueueAndSendSms(params: {
    phone: string | number;
    phoneFrom: string;
    text: string;
    activationId: number;
    smsId?: number;
  }): Promise<{ smsId: number; success: boolean; status: string }> {
    const db = getDatabase();
    const config = GrizzlyProviderConfigService.getConfig();

    const numericPhoneStr = String(params.phone).replace(/\D/g, '');
    const numericPhone = parseInt(numericPhoneStr, 10);
    const smsId = params.smsId || this.generateSmsId();
    const id = crypto.randomUUID();

    // 1. Persist state in SQLite before delivery attempt
    db.prepare(`
      INSERT INTO grizzly_sms_messages (
        id, sms_id, activation_id, phone_number, sender, message_content,
        delivery_status, processing_status, forwarding_status, retry_count, next_retry_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 'received', 'queued', 0, datetime('now', '+10 seconds'))
    `).run(
      id,
      smsId,
      params.activationId,
      String(numericPhone),
      params.phoneFrom,
      params.text
    );

    // Update activation status to 'sms_received'
    db.prepare(`
      UPDATE grizzly_activations
      SET status = 'sms_received', sms_received_at = datetime('now')
      WHERE activation_id = ?
    `).run(params.activationId);

    // 2. Immediate delivery attempt
    const sendSuccess = await this.deliverSingleSms(smsId, numericPhone, params.phoneFrom, params.text, config);

    return {
      smsId,
      success: sendSuccess,
      status: sendSuccess ? 'delivered' : 'pending_retry'
    };
  }

  /**
   * Internal HTTP delivery execution for PUSH_SMS
   */
  private static async deliverSingleSms(
    smsId: number,
    phone: number,
    phoneFrom: string,
    text: string,
    config: any
  ): Promise<boolean> {
    const db = getDatabase();
    const payload: GrizzlyPushSmsOutboundRequest = {
      action: 'PUSH_SMS',
      key: config.protocol_key,
      smsId,
      phone,
      phoneFrom,
      text
    };

    try {
      const response = await fetch(config.outbound_api_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': config.user_agent
        },
        body: JSON.stringify(payload)
      });

      const data = (await response.json()) as GrizzlyPushSmsResponse;

      if (data && data.status === 'SUCCESS') {
        db.prepare(`
          UPDATE grizzly_sms_messages
          SET delivery_status = 'delivered',
              forwarding_status = 'forwarded',
              provider_response = ?,
              delivered_at = datetime('now')
          WHERE sms_id = ?
        `).run(JSON.stringify(data), smsId);
        return true;
      } else {
        const errorMsg = data?.error || `HTTP ${response.status}: Delivery rejected`;
        db.prepare(`
          UPDATE grizzly_sms_messages
          SET retry_count = retry_count + 1,
              next_retry_at = datetime('now', '+10 seconds'),
              last_error = ?,
              provider_response = ?
          WHERE sms_id = ?
        `).run(errorMsg, JSON.stringify(data || {}), smsId);
        return false;
      }
    } catch (err: any) {
      db.prepare(`
        UPDATE grizzly_sms_messages
        SET retry_count = retry_count + 1,
            next_retry_at = datetime('now', '+10 seconds'),
            last_error = ?
        WHERE sms_id = ?
      `).run(err.message, smsId);
      return false;
    }
  }

  /**
   * Process pending retries due after 10-second delay
   */
  public static async processPendingDeliveries(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const db = getDatabase();
      const config = GrizzlyProviderConfigService.getConfig();

      const pendingMessages = db.prepare(`
        SELECT * FROM grizzly_sms_messages
        WHERE delivery_status = 'pending'
          AND (next_retry_at IS NULL OR next_retry_at <= datetime('now'))
        ORDER BY created_at ASC
        LIMIT 25
      `).all() as any[];

      for (const msg of pendingMessages) {
        const numericPhone = parseInt(String(msg.phone_number).replace(/\D/g, ''), 10);
        await this.deliverSingleSms(msg.sms_id, numericPhone, msg.sender, msg.message_content, config);
      }
    } finally {
      this.isProcessing = false;
    }
  }
}
