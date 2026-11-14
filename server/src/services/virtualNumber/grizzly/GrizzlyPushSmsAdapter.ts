import crypto from 'crypto';
import { getDatabase } from '../../../db/database.js';
import { GrizzlyPushSmsPayload, GrizzlyPushSmsResult } from './types.js';

/**
 * Dedicated PUSH_SMS Adapter Interface
 * Architectural responsibility:
 * When an incoming SMS is received on an allocated GrizzlySMS number,
 * this adapter records the incoming message internally and prepares it for
 * dispatch to GrizzlySMS once official documentation for PUSH_SMS is provided.
 */
export interface IGrizzlyPushSmsAdapter {
  pushSms(payload: GrizzlyPushSmsPayload): Promise<GrizzlyPushSmsResult>;
  getPendingMessages(): Promise<any[]>;
}

export class GrizzlyPushSmsAdapter implements IGrizzlyPushSmsAdapter {
  /**
   * Internal SMS message receiver and tracking engine
   * Prepares incoming messages for GrizzlySMS without inventing fictitious outbound endpoints.
   */
  public async pushSms(payload: GrizzlyPushSmsPayload): Promise<GrizzlyPushSmsResult> {
    const db = getDatabase();

    const messageId = crypto.randomUUID();
    const receivedTime = payload.receivedTimestamp || new Date().toISOString();

    try {
      // 1. Record incoming message into grizzly_sms_messages
      db.prepare(`
        INSERT INTO grizzly_sms_messages (
          id, activation_id, phone_number, sender, message_content,
          received_timestamp, processing_status, forwarding_status, retry_count
        ) VALUES (?, ?, ?, ?, ?, ?, 'queued', 'pending_docs', 0)
      `).run(
        messageId,
        payload.activationId,
        payload.phoneNumber,
        payload.sender,
        payload.messageContent,
        receivedTime
      );

      // 2. Update activation state to 'sms_received'
      db.prepare(`
        UPDATE grizzly_activations
        SET status = 'sms_received', sms_received_at = ?
        WHERE activation_id = ?
      `).run(receivedTime, payload.activationId);

      console.log(`[Grizzly PUSH_SMS] Queued incoming SMS for activation #${payload.activationId} from ${payload.sender}. Awaiting official PUSH_SMS documentation.`);

      return {
        success: true,
        status: 'pending_docs',
        providerResponse: {
          note: 'Recorded locally in grizzly_sms_messages. Outbound HTTP dispatch pending GrizzlySMS PUSH_SMS documentation.'
        }
      };
    } catch (err: any) {
      console.error('[Grizzly PUSH_SMS] Failed to record incoming SMS:', err);
      return {
        success: false,
        status: 'failed',
        error: err.message
      };
    }
  }

  /**
   * Returns all pending/queued messages awaiting dispatch
   */
  public async getPendingMessages(): Promise<any[]> {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM grizzly_sms_messages
      ORDER BY received_timestamp DESC
      LIMIT 100
    `).all();
  }
}

export const grizzlyPushSmsAdapter = new GrizzlyPushSmsAdapter();
