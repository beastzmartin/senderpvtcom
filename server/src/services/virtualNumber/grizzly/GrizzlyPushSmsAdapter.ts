import { GrizzlySmsQueueService } from './GrizzlySmsQueueService.js';
import { getDatabase } from '../../../db/database.js';

export interface GrizzlyPushSmsParams {
  activationId: number;
  phoneNumber: string | number;
  sender: string;
  messageContent: string;
  receivedTimestamp?: string;
  smsId?: number;
}

export class GrizzlyPushSmsAdapter {
  /**
   * Internal SMS message receiver and tracking engine
   * Forwards incoming SMS directly to GrizzlySMS using durable queue
   */
  public async pushSms(payload: GrizzlyPushSmsParams) {
    return GrizzlySmsQueueService.enqueueAndSendSms({
      phone: payload.phoneNumber,
      phoneFrom: payload.sender,
      text: payload.messageContent,
      activationId: payload.activationId,
      smsId: payload.smsId
    });
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
