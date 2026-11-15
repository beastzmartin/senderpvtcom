import crypto from 'crypto';
import { getDatabase } from '../../../db/database.js';
import { GrizzlyProviderConfigService } from './GrizzlyProviderConfigService.js';
import {
  GrizzlyPushCallOutboundRequest,
  GrizzlyPushCallResponse,
  GrizzlyPushCallRecordData
} from './types.js';

export class GrizzlyVoiceQueueService {
  private static workerInterval: NodeJS.Timeout | null = null;
  private static isProcessing = false;

  /**
   * Start durable voice background retry worker
   */
  public static startWorker(): void {
    if (this.workerInterval) return;
    this.workerInterval = setInterval(() => {
      this.processPendingDeliveries().catch((err) => {
        console.error('[Grizzly Voice Worker] Error in retry loop:', err);
      });
    }, 3000); // Polls every 3 seconds for items due for 10s retry
    console.log('[Grizzly Voice Worker] Durable voice delivery worker started.');
  }

  public static stopWorker(): void {
    if (this.workerInterval) {
      clearInterval(this.workerInterval);
      this.workerInterval = null;
    }
  }

  /**
   * Generates a stable unique integer callId
   */
  private static generateCallId(): number {
    const db = getDatabase();
    for (let i = 0; i < 10; i++) {
      const candidate = Math.floor(100000 + Math.random() * 900000);
      const exists = db.prepare('SELECT 1 FROM grizzly_voice_calls WHERE call_id = ?').get(candidate);
      if (!exists) return candidate;
    }
    return Math.floor(Date.now() % 900000) + 100000;
  }

  /**
   * Enqueue and immediately attempt PUSH_CALL delivery
   */
  public static async enqueueAndSendCall(params: {
    phone: string | number;
    phoneFrom: string;
    activationId?: number;
    callId?: number;
  }): Promise<{ callId: number; success: boolean; status: string }> {
    const db = getDatabase();
    const config = GrizzlyProviderConfigService.getConfig();

    const numericPhoneStr = String(params.phone).replace(/\D/g, '');
    const numericPhone = parseInt(numericPhoneStr, 10);
    const cleanPhoneFrom = String(params.phoneFrom).replace(/[^\d+]/g, '');

    const callId = params.callId || this.generateCallId();
    const id = crypto.randomUUID();

    // 1. Persist call state before delivery attempt (durable queue)
    db.prepare(`
      INSERT INTO grizzly_voice_calls (
        id, call_id, activation_id, phone, phone_from, delivery_status, retry_count, next_retry_at
      ) VALUES (?, ?, ?, ?, ?, 'pending', 0, datetime('now', '+10 seconds'))
    `).run(
      id,
      callId,
      params.activationId || null,
      String(numericPhone),
      cleanPhoneFrom
    );

    // 2. Immediate delivery attempt
    const sendSuccess = await this.deliverSingleCall(callId, numericPhone, cleanPhoneFrom, config);

    return {
      callId,
      success: sendSuccess,
      status: sendSuccess ? 'delivered' : 'pending_retry'
    };
  }

  /**
   * Internal HTTP delivery execution for PUSH_CALL
   */
  private static async deliverSingleCall(
    callId: number,
    phone: number,
    phoneFrom: string,
    config: any
  ): Promise<boolean> {
    const db = getDatabase();
    const payload: GrizzlyPushCallOutboundRequest = {
      action: 'PUSH_CALL',
      key: config.protocol_key,
      callId,
      phone,
      phoneFrom
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

      const data = (await response.json()) as GrizzlyPushCallResponse;

      if (data && data.status === 'SUCCESS') {
        db.prepare(`
          UPDATE grizzly_voice_calls
          SET delivery_status = 'delivered',
              provider_response = ?,
              delivered_at = datetime('now')
          WHERE call_id = ?
        `).run(JSON.stringify(data), callId);
        return true;
      } else {
        const errorMsg = data?.error || `HTTP ${response.status}: Delivery rejected`;
        db.prepare(`
          UPDATE grizzly_voice_calls
          SET retry_count = retry_count + 1,
              next_retry_at = datetime('now', '+10 seconds'),
              last_error = ?,
              provider_response = ?
          WHERE call_id = ?
        `).run(errorMsg, JSON.stringify(data || {}), callId);
        return false;
      }
    } catch (err: any) {
      db.prepare(`
        UPDATE grizzly_voice_calls
        SET retry_count = retry_count + 1,
            next_retry_at = datetime('now', '+10 seconds'),
            last_error = ?
        WHERE call_id = ?
      `).run(err.message, callId);
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

      // Query pending calls due for retry (next_retry_at <= now)
      const pendingCalls = db.prepare(`
        SELECT * FROM grizzly_voice_calls
        WHERE delivery_status = 'pending'
          AND (next_retry_at IS NULL OR next_retry_at <= datetime('now'))
        ORDER BY created_at ASC
        LIMIT 25
      `).all() as any[];

      for (const call of pendingCalls) {
        const numericPhone = parseInt(String(call.phone).replace(/\D/g, ''), 10);
        await this.deliverSingleCall(call.call_id, numericPhone, call.phone_from, config);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Enqueue and deliver PUSH_CALL_RECORD (multipart/form-data)
   */
  public static async enqueueAndSendCallRecord(params: GrizzlyPushCallRecordData): Promise<{ recordId: number; success: boolean }> {
    const db = getDatabase();
    const config = GrizzlyProviderConfigService.getConfig();

    const recordId = params.recordId || this.generateCallId();
    const id = crypto.randomUUID();

    db.prepare(`
      INSERT INTO grizzly_call_records (
        id, record_id, call_id, activation_id, phone, phone_from, file_path, delivery_status, retry_count, next_retry_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, datetime('now', '+10 seconds'))
    `).run(
      id,
      recordId,
      params.callId || null,
      params.activationId || null,
      String(params.phone),
      params.phoneFrom,
      params.filePath || null
    );

    // Build FormData multipart
    const formData = new FormData();
    formData.append('action', 'PUSH_CALL_RECORD');
    formData.append('key', config.protocol_key);
    formData.append('recordId', String(recordId));
    formData.append('phone', String(params.phone));
    formData.append('phoneFrom', params.phoneFrom);

    if (params.fileBuffer) {
      const blob = new Blob([params.fileBuffer], { type: params.contentType || 'audio/mpeg' });
      formData.append('record', blob, params.fileName || 'call_record.mp3');
    }

    try {
      const response = await fetch(config.outbound_api_url, {
        method: 'POST',
        headers: {
          'User-Agent': config.user_agent
        },
        body: formData
      });

      const data = (await response.json()) as any;
      const isSuccess = data?.status === 'SUCCESS';

      if (isSuccess) {
        db.prepare(`
          UPDATE grizzly_call_records
          SET delivery_status = 'delivered', provider_response = ?, delivered_at = datetime('now')
          WHERE record_id = ?
        `).run(JSON.stringify(data), recordId);
      } else {
        db.prepare(`
          UPDATE grizzly_call_records
          SET retry_count = retry_count + 1, next_retry_at = datetime('now', '+10 seconds'), last_error = ?, provider_response = ?
          WHERE record_id = ?
        `).run(data?.error || 'Rejected by provider', JSON.stringify(data || {}), recordId);
      }

      return { recordId, success: isSuccess };
    } catch (err: any) {
      db.prepare(`
        UPDATE grizzly_call_records
        SET retry_count = retry_count + 1, next_retry_at = datetime('now', '+10 seconds'), last_error = ?
        WHERE record_id = ?
      `).run(err.message, recordId);
      return { recordId, success: false };
    }
  }
}
