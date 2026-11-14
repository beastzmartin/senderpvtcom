import crypto from 'crypto';
import { getDatabase } from '../../db/database.js';
import { getSocketIO } from '../../socket/socketManager.js';
import { IncomingMessageItem, CallRecordItem } from './types.js';

export class VirtualNumberMessageService {
  private static instance: VirtualNumberMessageService | null = null;

  public static getInstance(): VirtualNumberMessageService {
    if (!VirtualNumberMessageService.instance) {
      VirtualNumberMessageService.instance = new VirtualNumberMessageService();
    }
    return VirtualNumberMessageService.instance;
  }

  /**
   * Fetch incoming SMS messages for a customer
   */
  public getMessages(userId: string, filter?: { rentalId?: string; phoneNumber?: string; limit?: number }) {
    const db = getDatabase();
    const { rentalId, phoneNumber, limit = 50 } = filter || {};

    let query = `
      SELECT m.*, r.country_code
      FROM virtual_number_messages m
      LEFT JOIN virtual_number_rentals r ON m.rental_id = r.id
      WHERE m.user_id = ?
    `;
    const params: any[] = [userId];

    if (rentalId) {
      query += ' AND m.rental_id = ?';
      params.push(rentalId);
    }
    if (phoneNumber) {
      query += ' AND m.phone_number = ?';
      params.push(phoneNumber);
    }

    query += ' ORDER BY m.received_at DESC LIMIT ?';
    params.push(limit);

    return db.prepare(query).all(...params);
  }

  /**
   * Record an incoming SMS message (called by webhooks or provider polling)
   */
  public recordIncomingSMS(item: IncomingMessageItem): { success: boolean; messageId: string } {
    const db = getDatabase();

    // Find active rental matching the recipient virtual number
    const rental = db
      .prepare("SELECT * FROM virtual_number_rentals WHERE phone_number = ? AND status IN ('active', 'renewal_due')")
      .get(item.toPhoneNumber) as any;

    if (!rental) {
      console.warn(`[Virtual Number SMS] Received message for unassigned or inactive number: ${item.toPhoneNumber}`);
      return { success: false, messageId: 'unassigned' };
    }

    const messageId = item.messageId || `msg_${crypto.randomUUID()}`;
    const receivedAt = item.receivedAt || new Date().toISOString();

    db.prepare(`
      INSERT INTO virtual_number_messages (
        id, rental_id, user_id, phone_number, sender, message_content,
        is_read, provider_message_ref, received_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
      messageId,
      rental.id,
      rental.user_id,
      rental.phone_number,
      item.fromSender,
      item.messageText,
      item.rawPayload?.ref || null,
      receivedAt
    );

    // Update daily usage count
    const today = receivedAt.slice(0, 10);
    db.prepare(`
      INSERT INTO virtual_number_usage (id, rental_id, user_id, period_date, sms_received_count, updated_at)
      VALUES (?, ?, ?, ?, 1, datetime('now'))
      ON CONFLICT(rental_id, period_date) DO UPDATE SET
        sms_received_count = sms_received_count + 1,
        updated_at = datetime('now')
    `).run(`use_${crypto.randomUUID()}`, rental.id, rental.user_id, today);

    // Real-time notification via Socket.IO
    try {
      getSocketIO()?.to(`user:${rental.user_id}`).emit('virtual_number:sms_received', {
        id: messageId,
        rentalId: rental.id,
        phoneNumber: rental.phone_number,
        sender: item.fromSender,
        content: item.messageText,
        receivedAt
      });
    } catch {}

    return { success: true, messageId };
  }

  /**
   * Mark a message as read
   */
  public markMessageAsRead(userId: string, messageId: string) {
    const db = getDatabase();
    db.prepare('UPDATE virtual_number_messages SET is_read = 1 WHERE id = ? AND user_id = ?').run(messageId, userId);
    return { success: true };
  }

  /**
   * Fetch voice call logs
   */
  public getCallLogs(userId: string, filter?: { rentalId?: string; phoneNumber?: string; limit?: number }) {
    const db = getDatabase();
    const { rentalId, phoneNumber, limit = 50 } = filter || {};

    let query = `
      SELECT c.*, r.country_code
      FROM virtual_number_calls c
      LEFT JOIN virtual_number_rentals r ON c.rental_id = r.id
      WHERE c.user_id = ?
    `;
    const params: any[] = [userId];

    if (rentalId) {
      query += ' AND c.rental_id = ?';
      params.push(rentalId);
    }
    if (phoneNumber) {
      query += ' AND c.phone_number = ?';
      params.push(phoneNumber);
    }

    query += ' ORDER BY c.started_at DESC LIMIT ?';
    params.push(limit);

    return db.prepare(query).all(...params);
  }
}
