import crypto from 'crypto';
import { getDatabase } from '../db/database.js';
import { WhatsAppManager } from './whatsapp/WhatsAppManager.js';
import { ContactService } from './contactService.js';
import { SubscriptionService } from './subscriptionService.js';
import {
  IdentifierType,
  SendMessageResult,
  IncomingMessageEvent,
  MessageContentUpdateEvent,
  MessageStatusUpdateEvent,
  BulkLidProgressEvent
} from './whatsapp/types.js';

export interface BulkLidOptions {
  lids: string[];
  message: string;
  delayMs?: number;
  onProgress?: (progress: BulkLidProgressEvent) => void;
}

export interface BulkLidSummary {
  total: number;
  sent: number;
  failed: number;
  results: Array<{
    lid: string;
    success: boolean;
    messageId?: string;
    providerMessageId?: string;
    error?: string;
  }>;
}

export interface SendMessageOptions {
  recipient: string;
  message: string;
  identifierType?: IdentifierType;
  simulateTyping?: boolean;
  typingDelayMs?: number;
  sessionId?: string;
  useRoundRobin?: boolean;
  userId?: string;
}

export interface ConversationRecord {
  id: string;
  user_id?: string | null;
  recipient_identifier: string;
  raw_identifier: string;
  identifier_type: IdentifierType;
  contact_id?: string | null;
  contact_name?: string | null;
  display_name?: string | null;
  last_message_at?: string | null;
  last_message_text?: string | null;
  unread_count: number;
  created_at: string;
  updated_at: string;
}

export interface MessageRecord {
  id: string;
  user_id?: string | null;
  conversation_id: string;
  sender_identifier: string;
  recipient_identifier: string;
  identifier_type: IdentifierType;
  body: string;
  direction: 'incoming' | 'outgoing';
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  provider_message_id?: string | null;
  provider_response?: string | null;
  error_message?: string | null;
  timestamp: string;
  created_at: string;
}

export class MessageService {
  private static instance: MessageService | null = null;
  private whatsappManager: WhatsAppManager;

  private constructor() {
    this.whatsappManager = WhatsAppManager.getInstance();
    this.setupListeners();
  }

  public static getInstance(): MessageService {
    if (!MessageService.instance) {
      MessageService.instance = new MessageService();
    }
    return MessageService.instance;
  }

  private setupListeners(): void {
    this.whatsappManager.on('message', async (incoming: IncomingMessageEvent, sessionId?: string, userId?: string) => {
      try {
        await this.handleIncomingMessage(incoming, sessionId, userId);
      } catch (err) {
        console.error('[Message Service] Error processing incoming message:', err);
      }
    });

    this.whatsappManager.on('message_update', async (update: MessageContentUpdateEvent, sessionId?: string, userId?: string) => {
      try {
        await this.handleMessageContentUpdate(update, sessionId, userId);
      } catch (err) {
        console.error('[Message Service] Error processing message content update:', err);
      }
    });

    this.whatsappManager.on('message_status', async (update: MessageStatusUpdateEvent, sessionId?: string, userId?: string) => {
      try {
        await this.handleMessageStatusUpdate(update, sessionId, userId);
      } catch (err) {
        console.error('[Message Service] Error updating message status:', err);
      }
    });
  }

  /**
   * Automatically detect if an identifier is a WhatsApp LID
   */
  public detectIdentifierType(identifier: string): IdentifierType {
    const trimmed = identifier.trim().toLowerCase();
    if (trimmed.endsWith('@lid') || trimmed.includes('@lid')) {
      return 'lid';
    }
    return 'phone';
  }

  /**
   * Find or create conversation for the given recipient, isolated per user account
   */
  public getOrCreateConversation(
    rawIdentifier: string,
    identifierType: IdentifierType,
    displayName?: string,
    userId?: string
  ): ConversationRecord {
    const db = getDatabase();
    
    // Format recipient_identifier for unique lookup
    let recipientIdentifier = rawIdentifier.trim();
    if (identifierType === 'phone') {
      const cleanDigits = rawIdentifier.replace(/\D/g, '');
      recipientIdentifier = `${cleanDigits}@s.whatsapp.net`;
      rawIdentifier = `+${cleanDigits}`;
    } else {
      if (!rawIdentifier.endsWith('@lid')) {
        rawIdentifier = `${rawIdentifier.trim()}@lid`;
      }
      recipientIdentifier = rawIdentifier;
    }

    const selectStmt = userId
      ? db.prepare(`
          SELECT c.*, ct.name as contact_name
          FROM conversations c
          LEFT JOIN contacts ct ON c.contact_id = ct.id
          WHERE c.recipient_identifier = ? AND c.user_id = ?
        `)
      : db.prepare(`
          SELECT c.*, ct.name as contact_name
          FROM conversations c
          LEFT JOIN contacts ct ON c.contact_id = ct.id
          WHERE c.recipient_identifier = ?
        `);

    let conversation = (userId ? selectStmt.get(recipientIdentifier, userId) : selectStmt.get(recipientIdentifier)) as ConversationRecord | undefined;

    if (!conversation) {
      // Check if contact exists by phone or LID
      let contactId: string | null = null;
      let contactName: string | null = displayName || null;

      if (identifierType === 'phone') {
        const cleanPhone = rawIdentifier.replace(/\D/g, '');
        const contactStmt = userId
          ? db.prepare(`
              SELECT id, name FROM contacts
              WHERE user_id = ?
                AND (REPLACE(REPLACE(REPLACE(phone_number, '+', ''), '-', ''), ' ', '') = ?
                 OR REPLACE(REPLACE(REPLACE(phone_number, '+', ''), '-', ''), ' ', '') LIKE ?)
              LIMIT 1
            `)
          : db.prepare(`
              SELECT id, name FROM contacts
              WHERE REPLACE(REPLACE(REPLACE(phone_number, '+', ''), '-', ''), ' ', '') = ?
                 OR REPLACE(REPLACE(REPLACE(phone_number, '+', ''), '-', ''), ' ', '') LIKE ?
              LIMIT 1
            `);
        const found = (userId ? contactStmt.get(userId, cleanPhone, `%${cleanPhone}`) : contactStmt.get(cleanPhone, `%${cleanPhone}`)) as { id: string; name: string } | undefined;
        if (found) {
          contactId = found.id;
          contactName = found.name;
        } else {
          // Check if phone has a mapped LID in lid_mappings
          const mappedLid = ContactService.getInstance().getLidForPhone(rawIdentifier);
          if (mappedLid) {
            const lidStmt = userId
              ? db.prepare('SELECT id, name FROM contacts WHERE lid = ? AND user_id = ? LIMIT 1')
              : db.prepare('SELECT id, name FROM contacts WHERE lid = ? LIMIT 1');
            const lidContact = (userId ? lidStmt.get(mappedLid, userId) : lidStmt.get(mappedLid)) as { id: string; name: string } | undefined;
            if (lidContact) {
              contactId = lidContact.id;
              contactName = lidContact.name;
            }
          }
        }
      } else {
        const contactStmt = userId
          ? db.prepare('SELECT id, name FROM contacts WHERE lid = ? AND user_id = ? LIMIT 1')
          : db.prepare('SELECT id, name FROM contacts WHERE lid = ? LIMIT 1');
        const found = (userId ? contactStmt.get(rawIdentifier, userId) : contactStmt.get(rawIdentifier)) as { id: string; name: string } | undefined;
        if (found) {
          contactId = found.id;
          contactName = found.name;
        } else {
          // Check if LID has a mapped phone in lid_mappings
          const mappedPhone = ContactService.getInstance().getPhoneForLid(rawIdentifier);
          if (mappedPhone) {
            const cleanPhone = mappedPhone.replace(/\D/g, '');
            const phoneStmt = userId
              ? db.prepare(`
                  SELECT id, name FROM contacts
                  WHERE user_id = ?
                    AND (REPLACE(REPLACE(REPLACE(phone_number, '+', ''), '-', ''), ' ', '') = ?
                     OR REPLACE(REPLACE(REPLACE(phone_number, '+', ''), '-', ''), ' ', '') LIKE ?)
                  LIMIT 1
                `)
              : db.prepare(`
                  SELECT id, name FROM contacts
                  WHERE REPLACE(REPLACE(REPLACE(phone_number, '+', ''), '-', ''), ' ', '') = ?
                     OR REPLACE(REPLACE(REPLACE(phone_number, '+', ''), '-', ''), ' ', '') LIKE ?
                  LIMIT 1
                `);
            const phoneContact = (userId ? phoneStmt.get(userId, cleanPhone, `%${cleanPhone}`) : phoneStmt.get(cleanPhone, `%${cleanPhone}`)) as { id: string; name: string } | undefined;
            if (phoneContact) {
              contactId = phoneContact.id;
              contactName = phoneContact.name;
            }
          }
        }
      }

      const newId = crypto.randomUUID();
      const now = new Date().toISOString();

      const insertStmt = db.prepare(`
        INSERT INTO conversations (
          id, user_id, recipient_identifier, raw_identifier, identifier_type,
          contact_id, display_name, last_message_at, unread_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `);

      insertStmt.run(
        newId,
        userId || null,
        recipientIdentifier,
        rawIdentifier,
        identifierType,
        contactId,
        contactName || rawIdentifier,
        now,
        now,
        now
      );

      conversation = (userId ? selectStmt.get(recipientIdentifier, userId) : selectStmt.get(recipientIdentifier)) as ConversationRecord;
    }

    return conversation;
  }

  /**
   * Dedicated function: sendMessageToPhone(phoneNumber, message)
   */
  public async sendMessageToPhone(
    phoneNumber: string,
    message: string,
    sessionId?: string,
    useRoundRobin?: boolean,
    userId?: string
  ): Promise<MessageRecord> {
    return this.dispatchMessage({
      recipient: phoneNumber,
      message,
      identifierType: 'phone',
      sessionId,
      useRoundRobin,
      userId
    });
  }

  /**
   * Dedicated function: sendMessageToLid(lid, message)
   */
  public async sendMessageToLid(
    lid: string,
    message: string,
    options?: { simulateTyping?: boolean; typingDelayMs?: number; sessionId?: string; useRoundRobin?: boolean; userId?: string },
    userId?: string
  ): Promise<MessageRecord> {
    const finalUserId = userId || options?.userId;
    return this.dispatchMessage({
      recipient: lid,
      message,
      identifierType: 'lid',
      simulateTyping: options?.simulateTyping,
      typingDelayMs: options?.typingDelayMs,
      sessionId: options?.sessionId,
      useRoundRobin: options?.useRoundRobin,
      userId: finalUserId
    }, finalUserId);
  }

  /**
   * Bulk LID Dispatcher with anti-rate-limit delay and live progress reporting
   */
  public async sendBulkLidMessages(
    options: BulkLidOptions & { userId?: string },
    userId?: string
  ): Promise<BulkLidSummary> {
    const effectiveUserId = userId || options.userId;
    const { lids, message, delayMs = 1500, onProgress } = options;

    if (!lids || lids.length === 0) {
      throw new Error('At least one WhatsApp LID must be provided for bulk sending.');
    }

    if (!message || message.trim().length === 0) {
      throw new Error('Message content cannot be empty.');
    }

    // Filter and sanitize LIDs
    const cleanLids: string[] = [];
    for (const raw of lids) {
      const trimmed = (raw || '').trim();
      if (!trimmed) continue;
      let target = trimmed;
      if (!target.endsWith('@lid') && /^\d+$/.test(target)) {
        target = `${target}@lid`;
      }
      if (target.endsWith('@lid') && !cleanLids.includes(target)) {
        cleanLids.push(target);
      }
    }

    if (cleanLids.length === 0) {
      throw new Error('No valid WhatsApp LIDs found in the provided list. LIDs must match format <digits>@lid.');
    }

    const summary: BulkLidSummary = {
      total: cleanLids.length,
      sent: 0,
      failed: 0,
      results: []
    };

    console.log(`[Message Service] Starting bulk dispatch to ${cleanLids.length} LIDs with ${delayMs}ms delay...`);

    for (let i = 0; i < cleanLids.length; i++) {
      const currentLid = cleanLids[i];
      // Replace personalization tags
      const personalizedMessage = message
        .replace(/\{lid\}/gi, currentLid)
        .replace(/\{index\}/gi, String(i + 1))
        .replace(/\{total\}/gi, String(cleanLids.length));

      let success = false;
      let providerMessageId: string | undefined;
      let error: string | undefined;
      let messageId: string | undefined;

      try {
        const record = await this.sendMessageToLid(currentLid, personalizedMessage, { userId });
        success = record.status === 'sent';
        providerMessageId = record.provider_message_id || undefined;
        messageId = record.id;
        summary.sent++;
      } catch (err: any) {
        success = false;
        error = err.message || 'Dispatch failed';
        summary.failed++;
      }

      summary.results.push({
        lid: currentLid,
        success,
        messageId,
        providerMessageId,
        error
      });

      // Emit progress callback
      if (onProgress) {
        onProgress({
          total: cleanLids.length,
          sent: summary.sent,
          failed: summary.failed,
          currentLid,
          status: success ? 'sent' : 'failed',
          providerMessageId,
          error,
          percentage: Math.round(((i + 1) / cleanLids.length) * 100),
          isCompleted: i === cleanLids.length - 1
        });
      }

      // Delay between iterations (except after the final one)
      if (i < cleanLids.length - 1 && delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    console.log(`[Message Service] Bulk LID dispatch completed. Sent: ${summary.sent}, Failed: ${summary.failed}`);
    return summary;
  }

  /**
   * Generic unified sender handling both Phone and LID
   */
  public async dispatchMessage(options: SendMessageOptions, userId?: string): Promise<MessageRecord> {
    const effectiveUserId = userId || options.userId;
    const { message } = options;
    let { recipient } = options;

    if (!recipient || recipient.trim().length === 0) {
      throw new Error('Recipient identifier is required.');
    }

    if (!message || message.trim().length === 0) {
      throw new Error('Message body cannot be empty.');
    }

    if (effectiveUserId) {
      const sub = SubscriptionService.getInstance().getUserSubscription(effectiveUserId);
      if (sub.status === 'expired' && sub.role !== 'admin') {
        const err: any = new Error('Your license has expired. Please activate a valid license key in the License System.');
        err.statusCode = 403;
        err.licenseExpired = true;
        throw err;
      }
      if (sub.role !== 'admin' && sub.messagesSentToday >= sub.dailyMessageLimit) {
        const err: any = new Error(
          `Daily broadcast limit reached (${sub.messagesSentToday}/${sub.dailyMessageLimit} messages today as per your ${sub.planName} license). Please upgrade or extend your license to send more.`
        );
        err.statusCode = 403;
        err.broadcastLimitReached = true;
        throw err;
      }
    }

    // Auto-detect identifier type if not provided
    const identifierType: IdentifierType = options.identifierType || this.detectIdentifierType(recipient);

    // Get or create conversation record
    const conversation = this.getOrCreateConversation(recipient, identifierType, undefined, effectiveUserId);

    const db = getDatabase();
    const messageId = crypto.randomUUID();
    const now = new Date().toISOString();

    const senderAccount = this.whatsappManager.getAccountInfo(options.sessionId, effectiveUserId);
    const senderIdentifier = senderAccount?.phone || senderAccount?.lid || 'me';

    // Insert pending message into database
    const insertMessageStmt = db.prepare(`
      INSERT INTO messages (
        id, user_id, conversation_id, sender_identifier, recipient_identifier,
        identifier_type, body, direction, status, timestamp, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'outgoing', 'pending', ?, ?)
    `);

    insertMessageStmt.run(
      messageId,
      effectiveUserId || null,
      conversation.id,
      senderIdentifier,
      conversation.raw_identifier,
      identifierType,
      message.trim(),
      now,
      now
    );

    // Insert initial status log
    this.logMessageStatus(messageId, 'pending', 'Message queued for dispatch via WhatsApp provider');

    let sendResult: SendMessageResult;

    try {
      if (identifierType === 'lid') {
        sendResult = await this.whatsappManager.sendMessageToLid(
          conversation.raw_identifier,
          message.trim(),
          {
            simulateTyping: options.simulateTyping,
            typingDelayMs: options.typingDelayMs
          },
          options.sessionId,
          options.useRoundRobin,
          effectiveUserId
        );
      } else {
        sendResult = await this.whatsappManager.sendMessageToPhone(
          conversation.raw_identifier,
          message.trim(),
          options.sessionId,
          options.useRoundRobin,
          effectiveUserId
        );
      }
    } catch (err: any) {
      sendResult = {
        success: false,
        messageId,
        recipient: conversation.raw_identifier,
        identifierType,
        timestamp: new Date().toISOString(),
        status: 'failed',
        error: err.message || 'Unknown provider transmission error'
      };
    }

    // Update message record with provider result
    const finalStatus = sendResult.success ? 'sent' : 'failed';
    const providerMsgId = sendResult.providerMessageId || null;
    const providerResponseStr = sendResult.rawResponse ? JSON.stringify(sendResult.rawResponse) : null;
    const errorMsg = sendResult.error || null;

    const updateMessageStmt = db.prepare(`
      UPDATE messages
      SET
        status = ?,
        provider_message_id = ?,
        provider_response = ?,
        error_message = ?,
        timestamp = ?
      WHERE id = ?
    `);

    updateMessageStmt.run(
      finalStatus,
      providerMsgId,
      providerResponseStr,
      errorMsg,
      sendResult.timestamp,
      messageId
    );

    // Update conversation last message details
    const updateConvStmt = db.prepare(`
      UPDATE conversations
      SET
        last_message_at = ?,
        last_message_text = ?,
        updated_at = ?
      WHERE id = ?
    `);

    updateConvStmt.run(
      sendResult.timestamp,
      message.trim(),
      now,
      conversation.id
    );

    // Log final status
    this.logMessageStatus(
      messageId,
      finalStatus,
      sendResult.success
        ? `Provider acknowledged transmission with ID: ${providerMsgId}`
        : `Provider error: ${errorMsg}`
    );

    const finalRecord = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as MessageRecord;

    if (!sendResult.success) {
      const err = new Error(errorMsg || 'Failed to send message via WhatsApp provider');
      (err as any).messageRecord = finalRecord;
      throw err;
    }

    return finalRecord;
  }

  /**
   * Handle incoming message from real WhatsApp connection
   */
  public async handleIncomingMessage(incoming: IncomingMessageEvent, sessionId?: string, userId?: string): Promise<MessageRecord> {
    const db = getDatabase();
    const effectiveUserId = userId || (sessionId ? this.whatsappManager.getSessionUserId(sessionId) : null);
    const conversation = this.getOrCreateConversation(
      incoming.senderIdentifier,
      incoming.identifierType,
      incoming.pushName,
      effectiveUserId || undefined
    );

    const messageId = incoming.providerMessageId || crypto.randomUUID();
    const now = incoming.timestamp || new Date().toISOString();

    // Check if message already exists
    const existing = db.prepare('SELECT * FROM messages WHERE id = ? OR provider_message_id = ?').get(
      messageId,
      incoming.providerMessageId
    ) as MessageRecord | undefined;

    if (existing) {
      // If existing message was stuck in undecrypted/placeholder state, update with decrypted content
      if (existing.body.startsWith('Waiting for this message') && !incoming.body.startsWith('Waiting for this message')) {
        console.log(`[Message Service Diagnostic] Updating previously undecrypted message ${existing.id} with incoming text: "${incoming.body.slice(0, 35)}..."`);
        const updateStmt = db.prepare(`
          UPDATE messages
          SET body = ?, status = 'delivered', provider_response = ?, timestamp = ?
          WHERE id = ?
        `);
        const responseJson = incoming.rawMessage ? JSON.stringify({ message: incoming.rawMessage }) : existing.provider_response;
        updateStmt.run(incoming.body, responseJson, now, existing.id);

        const updateConvStmt = db.prepare(`
          UPDATE conversations
          SET last_message_text = ?, updated_at = ?
          WHERE id = ?
        `);
        updateConvStmt.run(incoming.body, now, conversation.id);

        this.logMessageStatus(
          existing.id,
          'delivered',
          `Message decrypted and content updated from ${incoming.senderIdentifier}`
        );

        return db.prepare('SELECT * FROM messages WHERE id = ?').get(existing.id) as MessageRecord;
      }
      return existing;
    }

    const insertStmt = db.prepare(`
      INSERT INTO messages (
        id, user_id, conversation_id, sender_identifier, recipient_identifier,
        identifier_type, body, direction, status, provider_message_id,
        provider_response, timestamp, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'delivered', ?, ?, ?, ?)
    `);

    const direction = incoming.fromMe ? 'outgoing' : 'incoming';
    const myPhone = this.whatsappManager.getAccountInfo(sessionId, effectiveUserId || undefined)?.phone || 'me';
    const senderId = incoming.fromMe ? myPhone : incoming.senderIdentifier;
    const recipientId = incoming.fromMe ? incoming.senderIdentifier : (conversation.raw_identifier || myPhone);
    const providerResponseStr = incoming.rawMessage ? JSON.stringify({ message: incoming.rawMessage }) : null;

    insertStmt.run(
      messageId,
      effectiveUserId || null,
      conversation.id,
      senderId,
      recipientId,
      incoming.identifierType,
      incoming.body,
      direction,
      incoming.providerMessageId,
      providerResponseStr,
      now,
      now
    );

    // Update conversation metadata
    const updateConvStmt = db.prepare(`
      UPDATE conversations
      SET
        last_message_at = ?,
        last_message_text = ?,
        unread_count = CASE WHEN ? = 'incoming' THEN unread_count + 1 ELSE unread_count END,
        updated_at = ?
      WHERE id = ?
    `);

    updateConvStmt.run(now, incoming.body, direction, now, conversation.id);

    this.logMessageStatus(
      messageId,
      'delivered',
      `Message received from ${incoming.senderIdentifier} (${incoming.identifierType})`
    );

    return db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as MessageRecord;
  }

  /**
   * Handle content update (decryption resolution or message edit)
   */
  public async handleMessageContentUpdate(
    update: MessageContentUpdateEvent,
    sessionId?: string,
    userId?: string
  ): Promise<MessageRecord | null> {
    const db = getDatabase();
    const existing = db.prepare('SELECT * FROM messages WHERE provider_message_id = ? OR id = ?').get(
      update.providerMessageId,
      update.providerMessageId
    ) as MessageRecord | undefined;

    if (!existing) {
      // If message wasn't tracked yet, process as incoming message
      return this.handleIncomingMessage({
        providerMessageId: update.providerMessageId,
        from: update.remoteJid,
        senderIdentifier: update.senderIdentifier,
        identifierType: update.identifierType,
        body: update.body,
        timestamp: update.timestamp || new Date().toISOString(),
        fromMe: false,
        rawMessage: update.rawMessage
      }, sessionId, userId);
    }

    const now = update.timestamp || new Date().toISOString();
    const responseJson = update.rawMessage ? JSON.stringify({ message: update.rawMessage }) : existing.provider_response;

    console.log(`[Message Service Diagnostic] Updating message content for ${existing.id} (decrypted text: "${update.body.slice(0, 35)}...")`);

    const updateStmt = db.prepare(`
      UPDATE messages
      SET body = ?, status = 'delivered', provider_response = ?, timestamp = ?
      WHERE id = ?
    `);
    updateStmt.run(update.body, responseJson, now, existing.id);

    const updateConvStmt = db.prepare(`
      UPDATE conversations
      SET last_message_text = ?, updated_at = ?
      WHERE id = ?
    `);
    updateConvStmt.run(update.body, now, existing.conversation_id);

    this.logMessageStatus(
      existing.id,
      'delivered',
      `Message decrypted and content updated: ${update.providerMessageId}`
    );

    return db.prepare('SELECT * FROM messages WHERE id = ?').get(existing.id) as MessageRecord;
  }

  /**
   * Handle delivery/read status updates from WhatsApp provider
   */
  public async handleMessageStatusUpdate(
    update: MessageStatusUpdateEvent,
    sessionId?: string,
    userId?: string
  ): Promise<void> {
    const db = getDatabase();

    const findStmt = db.prepare(`
      SELECT id, status FROM messages
      WHERE provider_message_id = ?
    `);

    const msg = findStmt.get(update.providerMessageId) as { id: string; status: string } | undefined;
    if (!msg) return;

    // Only update if progression is forward (pending -> sent -> delivered -> read)
    const statusOrder: Record<string, number> = {
      pending: 0,
      failed: 0,
      sent: 1,
      delivered: 2,
      read: 3
    };

    if (statusOrder[update.status] > (statusOrder[msg.status] || 0)) {
      const updateStmt = db.prepare(`
        UPDATE messages
        SET status = ?
        WHERE id = ?
      `);
      updateStmt.run(update.status, msg.id);

      this.logMessageStatus(
        msg.id,
        update.status,
        `Status updated by provider receipt from ${update.remoteJid}`
      );
    }
  }

  private logMessageStatus(messageId: string, status: string, details?: string): void {
    try {
      const db = getDatabase();
      const logId = crypto.randomUUID();
      const insertLogStmt = db.prepare(`
        INSERT INTO message_status_logs (id, message_id, status, details, timestamp)
        VALUES (?, ?, ?, ?, datetime('now'))
      `);
      insertLogStmt.run(logId, messageId, status, details || null);
    } catch (err) {
      console.error('[Message Service] Failed to insert status log:', err);
    }
  }

  public getMessages(
    options: {
      conversationId?: string;
      limit?: number;
      offset?: number;
      userId?: string;
    },
    userId?: string
  ): MessageRecord[] {
    const effectiveUserId = userId || options.userId;
    const db = getDatabase();
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    if (options.conversationId) {
      if (effectiveUserId) {
        const stmt = db.prepare(`
          SELECT * FROM messages
          WHERE conversation_id = ? AND (user_id = ? OR user_id IS NULL)
          ORDER BY timestamp ASC
          LIMIT ? OFFSET ?
        `);
        return stmt.all(options.conversationId, effectiveUserId, limit, offset) as MessageRecord[];
      }
      const stmt = db.prepare(`
        SELECT * FROM messages
        WHERE conversation_id = ?
        ORDER BY timestamp ASC
        LIMIT ? OFFSET ?
      `);
      return stmt.all(options.conversationId, limit, offset) as MessageRecord[];
    } else {
      if (effectiveUserId) {
        const stmt = db.prepare(`
          SELECT * FROM messages
          WHERE user_id = ?
          ORDER BY timestamp DESC
          LIMIT ? OFFSET ?
        `);
        return stmt.all(effectiveUserId, limit, offset) as MessageRecord[];
      }
      const stmt = db.prepare(`
        SELECT * FROM messages
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
      `);
      return stmt.all(limit, offset) as MessageRecord[];
    }
  }

  public getConversations(search?: string, userId?: string): ConversationRecord[] {
    const db = getDatabase();
    if (userId) {
      if (search && search.trim()) {
        const term = `%${search.trim().toLowerCase()}%`;
        const stmt = db.prepare(`
          SELECT c.*, ct.name as contact_name, ct.avatar_url
          FROM conversations c
          LEFT JOIN contacts ct ON c.contact_id = ct.id
          WHERE c.user_id = ?
            AND (LOWER(c.display_name) LIKE ?
             OR LOWER(c.raw_identifier) LIKE ?
             OR LOWER(COALESCE(ct.name, '')) LIKE ?)
          ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
        `);
        return stmt.all(userId, term, term, term) as ConversationRecord[];
      }

      const stmt = db.prepare(`
        SELECT c.*, ct.name as contact_name, ct.avatar_url
        FROM conversations c
        LEFT JOIN contacts ct ON c.contact_id = ct.id
        WHERE c.user_id = ?
        ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
      `);
      return stmt.all(userId) as ConversationRecord[];
    }

    if (search && search.trim()) {
      const term = `%${search.trim().toLowerCase()}%`;
      const stmt = db.prepare(`
        SELECT c.*, ct.name as contact_name, ct.avatar_url
        FROM conversations c
        LEFT JOIN contacts ct ON c.contact_id = ct.id
        WHERE LOWER(c.display_name) LIKE ?
           OR LOWER(c.raw_identifier) LIKE ?
           OR LOWER(COALESCE(ct.name, '')) LIKE ?
        ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
      `);
      return stmt.all(term, term, term) as ConversationRecord[];
    }

    const stmt = db.prepare(`
      SELECT c.*, ct.name as contact_name, ct.avatar_url
      FROM conversations c
      LEFT JOIN contacts ct ON c.contact_id = ct.id
      ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
    `);
    return stmt.all() as ConversationRecord[];
  }

  public markConversationAsRead(conversationId: string, userId?: string): void {
    const db = getDatabase();
    if (userId) {
      const stmt = db.prepare(`
        UPDATE conversations
        SET unread_count = 0, updated_at = datetime('now')
        WHERE id = ? AND user_id = ?
      `);
      stmt.run(conversationId, userId);
    } else {
      const stmt = db.prepare(`
        UPDATE conversations
        SET unread_count = 0, updated_at = datetime('now')
        WHERE id = ?
      `);
      stmt.run(conversationId);
    }
  }

  public getDashboardStats(userId?: string) {
    const db = getDatabase();

    if (userId) {
      const sentCount = (db.prepare("SELECT COUNT(*) as count FROM messages WHERE direction = 'outgoing' AND user_id = ?").get(userId) as any).count;
      const receivedCount = (db.prepare("SELECT COUNT(*) as count FROM messages WHERE direction = 'incoming' AND user_id = ?").get(userId) as any).count;
      const activeConversations = (db.prepare('SELECT COUNT(*) as count FROM conversations WHERE user_id = ?').get(userId) as any).count;
      const failedCount = (db.prepare("SELECT COUNT(*) as count FROM messages WHERE status = 'failed' AND user_id = ?").get(userId) as any).count;

      const recentMessages = db.prepare(`
        SELECT m.*, c.display_name, c.raw_identifier
        FROM messages m
        JOIN conversations c ON m.conversation_id = c.id
        WHERE m.user_id = ?
        ORDER BY m.timestamp DESC
        LIMIT 10
      `).all(userId);

      return {
        totalSent: sentCount,
        totalReceived: receivedCount,
        activeConversations,
        failedMessages: failedCount,
        recentMessages,
        connectionStatus: this.whatsappManager.getStatus(undefined, userId),
        accountInfo: this.whatsappManager.getAccountInfo(undefined, userId)
      };
    }

    const sentCount = (db.prepare("SELECT COUNT(*) as count FROM messages WHERE direction = 'outgoing'").get() as any).count;
    const receivedCount = (db.prepare("SELECT COUNT(*) as count FROM messages WHERE direction = 'incoming'").get() as any).count;
    const activeConversations = (db.prepare('SELECT COUNT(*) as count FROM conversations').get() as any).count;
    const failedCount = (db.prepare("SELECT COUNT(*) as count FROM messages WHERE status = 'failed'").get() as any).count;

    const recentMessages = db.prepare(`
      SELECT m.*, c.display_name, c.raw_identifier
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      ORDER BY m.timestamp DESC
      LIMIT 10
    `).all();

    return {
      totalSent: sentCount,
      totalReceived: receivedCount,
      activeConversations,
      failedMessages: failedCount,
      recentMessages,
      connectionStatus: this.whatsappManager.getStatus(),
      accountInfo: this.whatsappManager.getAccountInfo()
    };
  }
}

