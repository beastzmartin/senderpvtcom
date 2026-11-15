import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';
import pino from 'pino';
import NodeCache from '@cacheable/node-cache';
import makeWASocket, {
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  normalizeMessageContent,
  DisconnectReason,
  Browsers,
  isLidUser,
  WAMessageStatus,
  WASocket,
  proto,
  ConnectionState,
  WAVersion
} from '@whiskeysockets/baileys';
import { USyncQuery, USyncUser } from '@whiskeysockets/baileys/lib/WAUSync/index.js';
import { Boom } from '@hapi/boom';
import { config } from '../../config.js';
import { getDatabase } from '../../db/database.js';
import { ContactService } from '../contactService.js';
import { IWhatsAppProvider } from './IWhatsAppProvider.js';
import {
  WhatsAppConnectionStatus,
  WhatsAppAccountInfo,
  QRState,
  SendMessageResult,
  IncomingMessageEvent,
  MessageContentUpdateEvent,
  MessageStatusUpdateEvent,
  ExtractedGroup,
  ExtractedMember,
  GroupInviteMetadata,
  JoinGroupResult
} from './types.js';

export class BaileysWhatsAppProvider extends EventEmitter implements IWhatsAppProvider {
  public readonly name = 'Baileys Multi-Device WhatsApp Provider';
  public readonly sessionId: string;

  private sock: WASocket | null = null;
  private status: WhatsAppConnectionStatus = 'disconnected';
  private qrState: QRState | null = null;
  private accountInfo: WhatsAppAccountInfo | null = null;
  private isConnecting: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 15;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private sessionDir: string;

  // Caches for Signal retry counters, placeholder resends, user devices and message store
  private msgRetryCounterCache: any = new NodeCache({ stdTTL: 3600, useClones: false });
  private placeholderResendCache: any = new NodeCache({ stdTTL: 3600, useClones: false });
  private userDevicesCache: any = new NodeCache({ stdTTL: 300, useClones: false });
  private messageCache = new NodeCache({ stdTTL: 86400, maxKeys: 10000, useClones: false });

  // In-memory cache for groups and group metadata to prevent slow Baileys network requests
  private groupsCache: { data: ExtractedGroup[]; timestamp: number } | null = null;
  private groupMembersCache = new Map<string, { data: ExtractedMember[]; timestamp: number }>();
  private static readonly GROUPS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache
  private static readonly MEMBERS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

  private logger = pino({
    level: 'warn'
  });

  constructor(sessionId: string = 'default') {
    super();
    this.sessionId = sessionId;
    this.sessionDir = path.resolve(config.sessionsDir, `baileys_${sessionId}`);
  }

  public getStatus(): WhatsAppConnectionStatus {
    return this.status;
  }

  public getQR(): QRState | null {
    return this.qrState;
  }

  public getAccountInfo(): WhatsAppAccountInfo | null {
    return this.accountInfo;
  }

  private setStatus(newStatus: WhatsAppConnectionStatus) {
    if (this.status !== newStatus) {
      console.log(`[WhatsApp Provider Diagnostic][${this.sessionId}] Status changed from ${this.status} to ${newStatus}`);
      this.status = newStatus;
      this.emit('status', this.status, this.accountInfo, this.sessionId);
    }
  }

  /**
   * Cache a message protobuf in memory for retry handling
   */
  public cacheMessage(id: string, remoteJid: string, message: proto.IMessage): void {
    if (!id || !message) return;
    this.messageCache.set(id, message);
    if (remoteJid) {
      this.messageCache.set(`${remoteJid}:${id}`, message);
    }
  }

  /**
   * Retrieve message for WhatsApp retry request
   * Solves "Waiting for this message. This may take a while."
   */
  public async getMessage(key: proto.IMessageKey): Promise<proto.IMessage | undefined> {
    const id = key.id;
    if (!id) return undefined;

    // 1. Check in-memory message cache
    let cached = this.messageCache.get(id) as proto.IMessage | undefined;
    if (!cached && key.remoteJid) {
      cached = this.messageCache.get(`${key.remoteJid}:${id}`) as proto.IMessage | undefined;
    }
    if (cached) {
      console.log(`[WhatsApp Provider Diagnostic] getMessage: Resolved message ${id} from cache for retry request.`);
      return cached;
    }

    // 2. Fallback to SQLite messages table
    try {
      const db = getDatabase();
      const row = db.prepare(`
        SELECT body, provider_response FROM messages
        WHERE provider_message_id = ? OR id = ?
        LIMIT 1
      `).get(id, id) as { body: string; provider_response: string | null } | undefined;

      if (row) {
        if (row.provider_response) {
          try {
            const parsed = JSON.parse(row.provider_response);
            const protoMsg = parsed.message || (parsed.key ? undefined : parsed);
            if (protoMsg && typeof protoMsg === 'object' && Object.keys(protoMsg).length > 0) {
              console.log(`[WhatsApp Provider Diagnostic] getMessage: Resolved message ${id} from DB provider_response.`);
              this.cacheMessage(id, key.remoteJid || '', protoMsg);
              return protoMsg;
            }
          } catch {
            // Ignore parse errors
          }
        }

        // 3. Fallback: Reconstruct text message from body if valid
        if (row.body && !row.body.startsWith('Waiting for this message')) {
          console.log(`[WhatsApp Provider Diagnostic] getMessage: Reconstructed conversation message ${id} from DB body.`);
          const reconstructed: proto.IMessage = {
            conversation: row.body
          };
          this.cacheMessage(id, key.remoteJid || '', reconstructed);
          return reconstructed;
        }
      }
    } catch (err: any) {
      console.error(`[WhatsApp Provider Diagnostic] Error looking up message ${id} in DB:`, err.message);
    }

    console.warn(`[WhatsApp Provider Diagnostic] getMessage: Message ${id} not found in cache or DB for retry request.`);
    return undefined;
  }

  /**
   * Robust message text extraction unwrapping future-proof wrappers (ephemeral, viewOnce, etc.)
   */
  public extractMessageText(message: proto.IMessage | null | undefined): string {
    if (!message) return '';

    const normalized = normalizeMessageContent(message);
    if (!normalized) return '';

    // Direct text conversation
    if (normalized.conversation) {
      return normalized.conversation;
    }

    // Extended text message
    if (normalized.extendedTextMessage?.text) {
      return normalized.extendedTextMessage.text;
    }

    // Captions on media messages
    if (normalized.imageMessage?.caption) {
      return normalized.imageMessage.caption;
    }
    if (normalized.videoMessage?.caption) {
      return normalized.videoMessage.caption;
    }
    if (normalized.documentMessage?.caption) {
      return normalized.documentMessage.caption;
    }

    // Edited messages
    const editedMsg = normalized.protocolMessage?.editedMessage;
    if (editedMsg) {
      const editedText = this.extractMessageText(editedMsg);
      if (editedText) return editedText;
    }

    // Interactive button / list responses
    if (normalized.buttonsResponseMessage?.selectedDisplayText) {
      return normalized.buttonsResponseMessage.selectedDisplayText;
    }
    if (normalized.listResponseMessage?.title) {
      return normalized.listResponseMessage.title;
    }
    if (normalized.templateButtonReplyMessage?.selectedDisplayText) {
      return normalized.templateButtonReplyMessage.selectedDisplayText;
    }

    // Non-text message placeholders for UI representation
    if (normalized.imageMessage) return '[Image]';
    if (normalized.videoMessage) return '[Video]';
    if (normalized.audioMessage) return '[Audio]';
    if (normalized.documentMessage) return `[Document: ${normalized.documentMessage.fileName || 'file'}]`;
    if (normalized.stickerMessage) return '[Sticker]';
    if (normalized.contactMessage || normalized.contactsArrayMessage) return '[Contact Card]';
    if (normalized.locationMessage || normalized.liveLocationMessage) return '[Location]';

    return '';
  }

  public async connect(): Promise<void> {
    if (this.isConnecting || this.status === 'connected') {
      console.log(`[WhatsApp Provider Diagnostic] Already ${this.status} or connecting. Skipping duplicate connect.`);
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.isConnecting = true;
    this.setStatus('connecting');

    try {
      fs.mkdirSync(this.sessionDir, { recursive: true });
      const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir);

      // Fetch latest compatible WhatsApp Web version
      let version: WAVersion = [2, 3000, 1015901307];
      try {
        const fetched = await fetchLatestBaileysVersion();
        version = fetched.version;
        console.log(`[WhatsApp Provider Diagnostic] Using WhatsApp Web version: ${version.join('.')} (latest: ${fetched.isLatest})`);
      } catch (verErr) {
        console.warn('[WhatsApp Provider Diagnostic] Could not fetch latest WA version, using fallback:', verErr);
      }

      // Initialize socket with full E2EE caches and getMessage handler
      const sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, this.logger)
        },
        printQRInTerminal: false,
        logger: this.logger,
        browser: Browsers.ubuntu('Chrome'),
        syncFullHistory: true,
        shouldSyncHistoryMessage: () => true,
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
        msgRetryCounterCache: this.msgRetryCounterCache,
        placeholderResendCache: this.placeholderResendCache,
        userDevicesCache: this.userDevicesCache,
        getMessage: async (key) => this.getMessage(key),
        retryRequestDelayMs: 250,
        maxMsgRetryCount: 5
      });

      this.sock = sock;

      // Handle credentials save with proper async try/catch
      sock.ev.on('creds.update', async () => {
        try {
          await saveCreds();
          console.log('[WhatsApp Provider Diagnostic] Credentials update persisted to storage successfully.');
        } catch (saveErr) {
          console.error('[WhatsApp Provider Diagnostic] Failed to save updated credentials:', saveErr);
        }
      });

      // Handle connection updates
      sock.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            const qrDataUrl = await QRCode.toDataURL(qr, {
              margin: 2,
              width: 300,
              color: {
                dark: '#111827',
                light: '#ffffff'
              }
            });

            this.qrState = {
              qr,
              qrDataUrl,
              generatedAt: Date.now(),
              expiresInSeconds: 60
            };

            console.log(`[WhatsApp Provider Diagnostic][${this.sessionId}] New QR code generated for pairing.`);
            this.emit('qr', this.qrState, this.sessionId);
          } catch (qrErr) {
            console.error('[WhatsApp Provider Diagnostic] Failed to generate QR data URL:', qrErr);
          }
        }

        if (connection === 'close') {
          this.isConnecting = false;
          this.qrState = null;
          this.emit('qr', null, this.sessionId);

          const boomError = lastDisconnect?.error as Boom | undefined;
          const statusCode = boomError?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

          console.log(`[WhatsApp Provider Diagnostic] Connection closed. Reason statusCode: ${statusCode}, message: ${boomError?.message || 'none'}, shouldReconnect: ${shouldReconnect}`);

          if (statusCode === DisconnectReason.loggedOut) {
            console.warn('[WhatsApp Provider Diagnostic] Account was logged out from WhatsApp. Resetting session to allow new pairing QR.');
            this.accountInfo = null;
            this.setStatus('disconnected');
            this.reconnectAttempts = 0;
            try {
              delete state.creds.me;
              delete state.creds.account;
              await saveCreds();
              console.log('[WhatsApp Provider Diagnostic] Cleared logged out credentials to enable fresh QR generation.');
            } catch (err) {
              console.error('[WhatsApp Provider Diagnostic] Error saving cleared creds:', err);
            }
          } else if (statusCode === DisconnectReason.restartRequired) {
            console.log('[WhatsApp Provider Diagnostic] WhatsApp signaled restartRequired. Reconnecting immediately...');
            this.setStatus('reconnecting');
            setTimeout(() => {
              this.connect().catch((err) => {
                console.error('[WhatsApp Provider Diagnostic] Restart required reconnect error:', err);
              });
            }, 500);
          } else {
            this.setStatus('reconnecting');
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
              this.reconnectAttempts++;
              const delay = Math.min(1500 * Math.pow(1.4, this.reconnectAttempts), 25000);
              console.log(`[WhatsApp Provider Diagnostic] Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${Math.round(delay)}ms`);
              this.reconnectTimer = setTimeout(() => {
                this.connect().catch((err) => {
                  console.error('[WhatsApp Provider Diagnostic] Reconnect error:', err);
                });
              }, delay);
            } else {
              console.error('[WhatsApp Provider Diagnostic] Reached maximum reconnection attempts. Resetting counter and waiting.');
              this.reconnectAttempts = 0;
              this.setStatus('disconnected');
            }
          }
        } else if (connection === 'open') {
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.qrState = null;
          this.emit('qr', null, this.sessionId);

          const user = sock.user;
          const userJid = user?.id || '';
          const phone = userJid.split('@')[0]?.split(':')[0] || '';
          const lid = user?.lid || undefined;

          this.accountInfo = {
            id: userJid,
            jid: userJid,
            lid,
            name: user?.name || 'WhatsApp Account',
            phone: phone ? `+${phone}` : undefined,
            platform: 'WhatsApp Multi-Device Web'
          };

          console.log(`[WhatsApp Provider Diagnostic] WhatsApp connected successfully as: ${this.accountInfo.phone || this.accountInfo.name} (LID: ${this.accountInfo.lid || 'none'})`);
          this.setStatus('connected');
        }
      });

      // Handle history synchronization
      sock.ev.on('messaging-history.set', async ({ chats, contacts, messages, isLatest }) => {
        console.log(`[WhatsApp Provider Diagnostic] History sync received: ${chats?.length || 0} chats, ${contacts?.length || 0} contacts, ${messages?.length || 0} messages (isLatest: ${isLatest})`);

        // 1. Cache historical messages for retry resolution
        if (Array.isArray(messages)) {
          for (const msg of messages) {
            if (msg.key?.id && msg.message) {
              this.cacheMessage(msg.key.id, msg.key.remoteJid || '', msg.message);
            }
          }
        }

        // 2. Synchronize contacts and LID mappings
        if (Array.isArray(contacts)) {
          const contactService = ContactService.getInstance();
          for (const c of contacts) {
            const rawId = c.id || c.jid || '';
            const lid = c.lid || (rawId.endsWith('@lid') ? rawId : null);
            const phoneJid = rawId.endsWith('@s.whatsapp.net') ? rawId : (c.jid?.endsWith('@s.whatsapp.net') ? c.jid : null);
            const phone = phoneJid ? phoneJid.replace('@s.whatsapp.net', '') : null;

            if (lid && phone) {
              contactService.upsertLidMapping(lid, phone, phoneJid, c.name || c.notify);
            }
          }
        }
      });

      // Handle contact updates and phone number shares
      sock.ev.on('chats.phoneNumberShare', ({ lid, jid }) => {
        console.log(`[WhatsApp Provider Diagnostic] Phone number share event: LID ${lid} <-> JID ${jid}`);
        const phone = jid.replace('@s.whatsapp.net', '');
        ContactService.getInstance().upsertLidMapping(lid, phone, jid);
      });

      sock.ev.on('contacts.upsert', (contacts) => {
        const contactService = ContactService.getInstance();
        for (const c of contacts) {
          const rawId = c.id || c.jid || '';
          const lid = c.lid || (rawId.endsWith('@lid') ? rawId : null);
          const phoneJid = rawId.endsWith('@s.whatsapp.net') ? rawId : (c.jid?.endsWith('@s.whatsapp.net') ? c.jid : null);
          const phone = phoneJid ? phoneJid.replace('@s.whatsapp.net', '') : null;

          if (lid && phone) {
            contactService.upsertLidMapping(lid, phone, phoneJid, c.name || c.notify);
          }
        }
      });

      sock.ev.on('contacts.update', (updates) => {
        const contactService = ContactService.getInstance();
        for (const c of updates) {
          const rawId = c.id || c.jid || '';
          const lid = c.lid || (rawId.endsWith('@lid') ? rawId : null);
          const phoneJid = rawId.endsWith('@s.whatsapp.net') ? rawId : (c.jid?.endsWith('@s.whatsapp.net') ? c.jid : null);
          const phone = phoneJid ? phoneJid.replace('@s.whatsapp.net', '') : null;

          if (lid && phone) {
            contactService.upsertLidMapping(lid, phone, phoneJid, c.name || c.notify);
          }
        }
      });

      // Handle incoming messages
      sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (!messages || messages.length === 0) return;

        console.log(`[WhatsApp Provider Diagnostic] messages.upsert received ${messages.length} message(s) (type: ${type})`);

        for (const msg of messages) {
          try {
            const remoteJid = msg.key.remoteJid;
            if (!remoteJid || remoteJid === 'status@broadcast') continue;

            const fromMe = Boolean(msg.key.fromMe);
            const isLid = isLidUser(remoteJid);
            const identifierType = isLid ? 'lid' : 'phone';

            // Cache raw message if present
            if (msg.message && msg.key.id) {
              this.cacheMessage(msg.key.id, remoteJid, msg.message);
            }

            // Extract and save any LID <-> Phone mappings from message key attributes
            try {
              const keyAny = msg.key as any;
              const contactService = ContactService.getInstance();
              if (keyAny.senderLid && keyAny.senderPn) {
                contactService.upsertLidMapping(keyAny.senderLid, keyAny.senderPn, undefined, msg.pushName || undefined);
              }
              if (keyAny.participantLid && keyAny.participantPn) {
                contactService.upsertLidMapping(keyAny.participantLid, keyAny.participantPn, undefined, msg.pushName || undefined);
              }
            } catch (err) {
              // Ignore mapping extraction errors
            }

            const isCiphertext = msg.messageStubType === proto.WebMessageInfo.StubType.CIPHERTEXT;
            let body = this.extractMessageText(msg.message);

            if (isCiphertext && !body) {
              console.warn(`[WhatsApp Provider Diagnostic] Message ${msg.key.id} from ${remoteJid} arrived as CIPHERTEXT (undecrypted). Waiting for retry/resend.`);
              body = 'Waiting for this message. This may take a while. Learn More';
            }

            if (!body) {
              // Non-content protocol message (e.g. app state sync keys)
              continue;
            }

            // Normalization of remote identifier
            const cleanRemote = isLid ? remoteJid : remoteJid.replace('@s.whatsapp.net', '');
            const normalizedRemote = isLid
              ? cleanRemote
              : (cleanRemote.startsWith('+') ? cleanRemote : `+${cleanRemote}`);

            const timestamp = msg.messageTimestamp
              ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
              : new Date().toISOString();

            const incomingEvent: IncomingMessageEvent = {
              providerMessageId: msg.key.id || `msg_${Date.now()}`,
              from: remoteJid,
              senderIdentifier: normalizedRemote,
              identifierType,
              body,
              timestamp,
              pushName: msg.pushName || undefined,
              fromMe,
              rawMessage: msg.message || undefined
            };

            this.emit('message', incomingEvent, this.sessionId);
          } catch (err) {
            console.error('[WhatsApp Provider Diagnostic] Error handling incoming upsert message:', err);
          }
        }
      });

      // Handle message updates (decryption resolution, edits, delivery/read statuses)
      sock.ev.on('messages.update', async (updates) => {
        if (!updates || updates.length === 0) return;

        for (const update of updates) {
          const remoteJid = update.key.remoteJid;
          const msgId = update.key.id;
          if (!remoteJid || !msgId) continue;

          // 1. Content update (placeholder resend resolved or edited message)
          if (update.update?.message) {
            const body = this.extractMessageText(update.update.message);
            if (body) {
              console.log(`[WhatsApp Provider Diagnostic] Message ${msgId} content updated/decrypted: "${body.slice(0, 40)}"`);
              this.cacheMessage(msgId, remoteJid, update.update.message);

              const isLid = isLidUser(remoteJid);
              const cleanRemote = isLid ? remoteJid : remoteJid.replace('@s.whatsapp.net', '');
              const normalizedRemote = isLid
                ? cleanRemote
                : (cleanRemote.startsWith('+') ? cleanRemote : `+${cleanRemote}`);

              const contentUpdateEvent: MessageContentUpdateEvent = {
                providerMessageId: msgId,
                remoteJid,
                senderIdentifier: normalizedRemote,
                identifierType: isLid ? 'lid' : 'phone',
                body,
                timestamp: new Date().toISOString(),
                rawMessage: update.update.message
              };

              this.emit('message_update', contentUpdateEvent, this.sessionId);
            }
          }

          // 2. Status update (sent, delivered, read, failed)
          if (update.update?.status !== undefined) {
            let status: 'sent' | 'delivered' | 'read' | 'failed' | null = null;
            const wsStatus = update.update.status;

            if (wsStatus === WAMessageStatus.SERVER_ACK) {
              status = 'sent';
            } else if (wsStatus === WAMessageStatus.DELIVERY_ACK) {
              status = 'delivered';
            } else if (wsStatus === WAMessageStatus.READ || wsStatus === WAMessageStatus.PLAYED) {
              status = 'read';
            } else if (wsStatus === WAMessageStatus.ERROR) {
              status = 'failed';
            }

            if (status) {
              const statusEvent: MessageStatusUpdateEvent = {
                providerMessageId: msgId,
                remoteJid,
                status,
                timestamp: new Date().toISOString()
              };
              this.emit('message_status', statusEvent, this.sessionId);
            }
          }
        }
      });
    } catch (err) {
      this.isConnecting = false;
      this.setStatus('disconnected');
      console.error('[WhatsApp Provider Diagnostic] Failed to initialize connection:', err);
      throw err;
    }
  }

  public async disconnect(): Promise<void> {
    console.log('[WhatsApp Provider Diagnostic] Disconnect requested (preserving credentials and Signal keys)');
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.sock) {
      try {
        this.sock.end(undefined);
      } catch (err) {
        console.warn('[WhatsApp Provider Diagnostic] Error ending socket connection:', err);
      }
      this.sock = null;
    }

    // Preserve credentials on gentle disconnect, but reset state
    this.clearGroupCaches();
    this.accountInfo = null;
    this.qrState = null;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.emit('qr', null, this.sessionId);
    this.setStatus('disconnected');
  }

  public async clearSessionFiles(): Promise<void> {
    try {
      if (fs.existsSync(this.sessionDir)) {
        fs.rmSync(this.sessionDir, { recursive: true, force: true });
      }
      fs.mkdirSync(this.sessionDir, { recursive: true });
      console.log(`[WhatsApp Provider Diagnostic] Cleared session files at ${this.sessionDir}`);
    } catch (err) {
      console.error('[WhatsApp Provider Diagnostic] Error clearing session files:', err);
    }
  }

  public async resetSession(): Promise<void> {
    console.log('[WhatsApp Provider Diagnostic] Resetting WhatsApp session to link another/fresh account...');
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.sock) {
      try {
        await this.sock.logout().catch(() => {});
      } catch {
        try {
          this.sock.end(undefined);
        } catch {}
      }
      this.sock = null;
    }

    await this.clearSessionFiles();
    this.clearGroupCaches();
    this.accountInfo = null;
    this.qrState = null;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.emit('qr', null, this.sessionId);
    this.setStatus('disconnected');

    // Automatically trigger fresh connect to generate and emit the new QR code
    try {
      await this.connect();
    } catch (err) {
      console.error('[WhatsApp Provider Diagnostic] Connect error after session reset:', err);
    }
  }

  public async checkNumberExists(phoneNumber: string): Promise<{ exists: boolean; jid?: string }> {
    if (!this.sock || this.status !== 'connected') {
      throw new Error('WhatsApp is not connected. Please connect before checking phone numbers.');
    }

    const clean = phoneNumber.replace(/\D/g, '');
    const jid = `${clean}@s.whatsapp.net`;

    try {
      const results = await this.sock.onWhatsApp(jid);
      const result = results && results.length > 0 ? results[0] : null;
      if (result && result.exists) {
        return { exists: true, jid: result.jid };
      }
      return { exists: false };
    } catch (err: any) {
      console.warn(`[WhatsApp Provider Diagnostic] onWhatsApp check failed for ${phoneNumber}:`, err.message);
      return { exists: true, jid }; // Fallback to attempting delivery
    }
  }

  public async sendMessageToPhone(phoneNumber: string, message: string): Promise<SendMessageResult> {
    if (!this.sock || this.status !== 'connected') {
      throw new Error('WhatsApp is not connected. Cannot send message.');
    }

    if (!message || message.trim().length === 0) {
      throw new Error('Message body cannot be empty.');
    }

    const cleanDigits = phoneNumber.replace(/\D/g, '');
    if (cleanDigits.length < 7 || cleanDigits.length > 15) {
      throw new Error(`Invalid phone number format: "${phoneNumber}". Must be valid international format (7-15 digits).`);
    }

    const targetJid = `${cleanDigits}@s.whatsapp.net`;

    try {
      console.log(`[WhatsApp Provider Diagnostic] Sending phone message to ${targetJid}`);
      const response = await this.sock.sendMessage(targetJid, { text: message.trim() });

      if (!response || !response.key || !response.key.id) {
        throw new Error('WhatsApp provider did not return message confirmation.');
      }

      // Cache the message for retry handling
      if (response.message) {
        this.cacheMessage(response.key.id, targetJid, response.message);
      }

      return {
        success: true,
        messageId: response.key.id,
        providerMessageId: response.key.id,
        recipient: `+${cleanDigits}`,
        identifierType: 'phone',
        timestamp: new Date().toISOString(),
        status: 'sent',
        rawResponse: {
          key: response.key,
          messageTimestamp: response.messageTimestamp,
          status: response.status,
          message: response.message
        }
      };
    } catch (err: any) {
      console.error(`[WhatsApp Provider Diagnostic] Error sending to phone ${targetJid}:`, err);
      return {
        success: false,
        messageId: `err_${Date.now()}`,
        recipient: `+${cleanDigits}`,
        identifierType: 'phone',
        timestamp: new Date().toISOString(),
        status: 'failed',
        error: err.message || 'Failed to send message through WhatsApp provider.'
      };
    }
  }

  public async sendMessageToLid(
    lid: string,
    message: string,
    options?: { simulateTyping?: boolean; typingDelayMs?: number }
  ): Promise<SendMessageResult> {
    if (!this.sock || this.status !== 'connected') {
      throw new Error('WhatsApp is not connected. Cannot send message.');
    }

    if (!message || message.trim().length === 0) {
      throw new Error('Message body cannot be empty.');
    }

    const trimmedLid = lid.trim();
    let lidJid: string;

    if (trimmedLid.endsWith('@lid')) {
      const numericPart = trimmedLid.replace('@lid', '').trim();
      if (!/^\d+$/.test(numericPart)) {
        throw new Error(`Invalid LID identifier: "${lid}". Numeric portion must contain digits only.`);
      }
      lidJid = trimmedLid;
    } else if (/^\d+$/.test(trimmedLid)) {
      lidJid = `${trimmedLid}@lid`;
    } else {
      throw new Error(`Invalid LID format: "${lid}". Must be digits or formatted as <numeric>@lid (e.g. 7757465940199@lid).`);
    }

    if (!isLidUser(lidJid)) {
      throw new Error(`The provided address "${lidJid}" is not recognized as a valid WhatsApp LID.`);
    }

    // Anti-ban typing simulation
    if (options?.simulateTyping) {
      try {
        await this.sock.sendPresenceUpdate('available');
        await this.sock.sendPresenceUpdate('composing', lidJid);
        const typingWait = options.typingDelayMs || Math.min(Math.max(message.length * 25, 1200), 3000);
        await new Promise((r) => setTimeout(r, typingWait));
        await this.sock.sendPresenceUpdate('paused', lidJid);
      } catch (presenceErr) {
        console.warn('[WhatsApp Provider Diagnostic] Typing simulation notice:', presenceErr);
      }
    }

    try {
      console.log(`[WhatsApp Provider Diagnostic] Sending LID message to ${lidJid}`);
      const response = await this.sock.sendMessage(lidJid, { text: message.trim() });

      if (!response || !response.key || !response.key.id) {
        throw new Error('WhatsApp provider rejected or did not confirm LID message submission.');
      }

      // Cache the message for retry handling
      if (response.message) {
        this.cacheMessage(response.key.id, lidJid, response.message);
      }

      return {
        success: true,
        messageId: response.key.id,
        providerMessageId: response.key.id,
        recipient: lidJid,
        identifierType: 'lid',
        timestamp: new Date().toISOString(),
        status: 'sent',
        rawResponse: {
          key: response.key,
          messageTimestamp: response.messageTimestamp,
          status: response.status,
          message: response.message
        }
      };
    } catch (err: any) {
      console.error(`[WhatsApp Provider Diagnostic] Error sending to LID ${lidJid}:`, err);
      return {
        success: false,
        messageId: `err_${Date.now()}`,
        recipient: lidJid,
        identifierType: 'lid',
        timestamp: new Date().toISOString(),
        status: 'failed',
        error: err.message || 'WhatsApp provider failed to dispatch to LID address.'
      };
    }
  }

  public clearGroupCaches(): void {
    this.groupsCache = null;
    this.groupMembersCache.clear();
  }

  public async getGroups(forceRefresh: boolean = false): Promise<ExtractedGroup[]> {
    if (!this.sock || this.status !== 'connected') {
      throw new Error('WhatsApp is not connected. Connect before fetching groups.');
    }

    if (!forceRefresh && this.groupsCache && Date.now() - this.groupsCache.timestamp < BaileysWhatsAppProvider.GROUPS_CACHE_TTL_MS) {
      return this.groupsCache.data;
    }

    try {
      const groupsMap = await this.sock.groupFetchAllParticipating();
      const groups: ExtractedGroup[] = [];
      const contactService = ContactService.getInstance();
      const knownLidMap = contactService.getAllKnownLidMap();
      const batchMappings: Array<{ lid: string; phone: string; jid?: string | null; name?: string | null }> = [];

      for (const [id, metadata] of Object.entries(groupsMap)) {
        let lidCount = 0;
        let phoneCount = 0;

        if (Array.isArray(metadata.participants)) {
          for (const p of metadata.participants) {
            const rawId = p.id || '';
            const isLid = rawId.endsWith('@lid') || Boolean(p.lid);
            const lid = p.lid || (rawId.endsWith('@lid') ? rawId : null);
            let phone = p.jid
              ? p.jid.replace('@s.whatsapp.net', '')
              : (rawId.endsWith('@s.whatsapp.net') ? rawId.replace('@s.whatsapp.net', '') : null);

            if (lid && phone) {
              batchMappings.push({
                lid,
                phone,
                jid: p.jid || `${phone.replace(/\D/g, '')}@s.whatsapp.net`,
                name: p.name || p.notify || null
              });
              knownLidMap.set(lid, phone);
            }

            if (isLid || lid) {
              lidCount++;
            }
            if (phone || (lid && knownLidMap.has(lid))) {
              phoneCount++;
            }
          }
        }

        groups.push({
          id,
          subject: metadata.subject || 'Unnamed Group',
          desc: typeof metadata.desc === 'string' ? metadata.desc : undefined,
          size: metadata.size || metadata.participants?.length || 0,
          isCommunity: Boolean(metadata.isCommunity),
          isCommunityAnnounce: Boolean(metadata.isCommunityAnnounce),
          linkedParent: metadata.linkedParent || null,
          addressingMode: metadata.addressingMode || 'pn',
          creation: metadata.creation,
          participantsCount: metadata.participants?.length || 0,
          lidParticipantsCount: lidCount,
          phoneParticipantsCount: phoneCount
        });
      }

      groups.sort((a, b) => {
        if (a.isCommunity !== b.isCommunity) return a.isCommunity ? -1 : 1;
        return a.subject.localeCompare(b.subject);
      });

      if (batchMappings.length > 0) {
        Promise.resolve().then(() => {
          contactService.bulkUpsertLidMappings(batchMappings);
        }).catch((e) => console.warn('[WhatsApp Provider Diagnostic] Background bulk upsert error:', e));
      }

      this.groupsCache = {
        data: groups,
        timestamp: Date.now()
      };

      return groups;
    } catch (err: any) {
      console.error('[WhatsApp Provider Diagnostic] Failed to fetch participating groups:', err);
      throw new Error(`Failed to extract WhatsApp groups: ${err.message}`);
    }
  }

  public async getGroupMembers(groupJid: string, forceRefresh: boolean = false): Promise<ExtractedMember[]> {
    if (!this.sock || this.status !== 'connected') {
      throw new Error('WhatsApp is not connected. Connect before extracting members.');
    }

    if (!forceRefresh && this.groupMembersCache.has(groupJid)) {
      const cached = this.groupMembersCache.get(groupJid)!;
      if (Date.now() - cached.timestamp < BaileysWhatsAppProvider.MEMBERS_CACHE_TTL_MS) {
        return cached.data;
      }
    }

    try {
      const metadata = await this.sock.groupMetadata(groupJid);
      const members: ExtractedMember[] = [];
      const contactService = ContactService.getInstance();
      const knownLidMap = contactService.getAllKnownLidMap();
      const batchMappings: Array<{ lid: string; phone: string; jid?: string | null; name?: string | null }> = [];

      for (const p of metadata.participants) {
        const rawId = p.id || '';
        const isLid = rawId.endsWith('@lid') || Boolean(p.lid);
        const lidAddress = rawId.endsWith('@lid')
          ? rawId
          : (p.lid ? (p.lid.endsWith('@lid') ? p.lid : `${p.lid}@lid`) : null);

        let phone = rawId.endsWith('@s.whatsapp.net')
          ? rawId.replace('@s.whatsapp.net', '')
          : (p.jid ? p.jid.replace('@s.whatsapp.net', '') : null);

        if (!phone && (p as any).phoneNumber) {
          phone = String((p as any).phoneNumber).replace(/\D/g, '');
        }
        if (!phone && (p as any).pn) {
          phone = String((p as any).pn).replace(/\D/g, '');
        }

        // Automatic DB/cache lookup fallback for LIDs
        if (!phone && lidAddress) {
          const mapped = knownLidMap.get(lidAddress);
          if (mapped) {
            phone = mapped.replace(/\D/g, '');
          }
        }

        let role: 'superadmin' | 'admin' | 'member' = 'member';
        if (p.admin === 'superadmin') role = 'superadmin';
        else if (p.admin === 'admin') role = 'admin';

        if (lidAddress && phone) {
          batchMappings.push({
            lid: lidAddress,
            phone,
            jid: p.jid || `${phone.replace(/\D/g, '')}@s.whatsapp.net`,
            name: p.name || p.notify || null
          });
          knownLidMap.set(lidAddress, phone);
        }

        members.push({
          jid: rawId,
          phone: phone ? (phone.startsWith('+') ? phone : `+${phone}`) : null,
          lid: lidAddress,
          isLid,
          name: p.name || p.notify || null,
          role,
          groupId: groupJid,
          groupSubject: metadata.subject || undefined
        });
      }

      if (batchMappings.length > 0) {
        Promise.resolve().then(() => {
          contactService.bulkUpsertLidMappings(batchMappings);
        }).catch((e) => console.warn('[WhatsApp Provider Diagnostic] Background bulk upsert error:', e));
      }

      this.groupMembersCache.set(groupJid, {
        data: members,
        timestamp: Date.now()
      });

      return members;
    } catch (err: any) {
      console.error(`[WhatsApp Provider Diagnostic] Error extracting members for ${groupJid}:`, err);
      throw new Error(`Failed to extract group members: ${err.message}`);
    }
  }

  /**
   * Bulk scan all participating groups and harvest all known LID <-> Phone number mappings
   */
  public async syncAllGroupLids(): Promise<{
    totalGroups: number;
    totalScanned: number;
    newMappings: number;
    totalMappings: number;
  }> {
    if (!this.sock || this.status !== 'connected') {
      throw new Error('WhatsApp is not connected. Connect before syncing group LIDs.');
    }

    const contactService = ContactService.getInstance();
    const db = getDatabase();
    const beforeCount = (db.prepare('SELECT count(*) as count FROM lid_mappings').get() as { count: number }).count;

    console.log('[WhatsApp Provider Diagnostic] Starting fast bulk sync of all participating groups for LID mappings...');
    const groupsMap = await this.sock.groupFetchAllParticipating();
    const groupEntries = Object.entries(groupsMap);
    let totalScanned = 0;
    const batchMappings: Array<{ lid: string; phone: string; jid?: string | null; name?: string | null }> = [];

    for (const [groupId, metadata] of groupEntries) {
      if (!Array.isArray(metadata.participants)) continue;

      for (const p of metadata.participants) {
        totalScanned++;
        const rawId = p.id || '';
        const lid = p.lid || (rawId.endsWith('@lid') ? rawId : null);
        const jid = p.jid || (rawId.endsWith('@s.whatsapp.net') ? rawId : null);

        let phone: string | null = null;
        if (jid) {
          phone = jid.replace('@s.whatsapp.net', '');
        } else if (rawId.endsWith('@s.whatsapp.net')) {
          phone = rawId.replace('@s.whatsapp.net', '');
        } else if ((p as any).phoneNumber) {
          phone = String((p as any).phoneNumber).replace(/\D/g, '');
        } else if ((p as any).pn) {
          phone = String((p as any).pn).replace(/\D/g, '');
        }

        const name = p.name || p.notify || null;

        if (lid && phone) {
          batchMappings.push({
            lid,
            phone,
            jid: jid || `${phone.replace(/\D/g, '')}@s.whatsapp.net`,
            name
          });
        }
      }
    }

    contactService.bulkUpsertLidMappings(batchMappings);
    this.clearGroupCaches();

    const afterCount = (db.prepare('SELECT count(*) as count FROM lid_mappings').get() as { count: number }).count;
    const newMappings = Math.max(0, afterCount - beforeCount);

    console.log(
      `[WhatsApp Provider Diagnostic] Bulk group LID sync completed: scanned ${totalScanned} participants across ${groupEntries.length} groups. Discovered ${newMappings} new mappings. Total in DB: ${afterCount}`
    );

    return {
      totalGroups: groupEntries.length,
      totalScanned,
      newMappings,
      totalMappings: afterCount
    };
  }

  /**
   * Bulk resolve a list of WhatsApp LIDs to real WhatsApp phone numbers
   */
  public async resolveLidsToPhones(lids: string[]): Promise<
    Array<{
      lid: string;
      phone: string | null;
      jid: string | null;
      name: string | null;
      status: 'resolved' | 'unresolved';
      source?: string;
    }>
  > {
    const contactService = ContactService.getInstance();

    // 1. Normalize and deduplicate incoming LIDs
    const cleanLids: string[] = [];
    const seen = new Set<string>();

    for (const raw of lids) {
      const normalized = contactService.normalizeLid(raw);
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        cleanLids.push(normalized);
      }
    }

    if (cleanLids.length === 0) {
      return [];
    }

    // 2. Resolve against local database first
    const resolvedMap = new Map<
      string,
      {
        lid: string;
        phone: string | null;
        jid: string | null;
        name: string | null;
        status: 'resolved' | 'unresolved';
        source?: string;
      }
    >();

    const localResults = contactService.bulkResolveLidsLocally(cleanLids);
    const unresolved: string[] = [];

    for (const item of localResults) {
      if (item.status === 'resolved') {
        resolvedMap.set(item.lid, item);
      } else {
        unresolved.push(item.lid);
      }
    }

    console.log(
      `[WhatsApp Provider Diagnostic] Bulk LID resolution: ${cleanLids.length} total, ${resolvedMap.size} resolved locally, ${unresolved.length} unresolved.`
    );

    // 3. If there are unresolved LIDs and WhatsApp is connected, perform cross-group scan
    if (unresolved.length > 0 && this.sock && this.status === 'connected') {
      try {
        await this.syncAllGroupLids();

        // Re-check newly updated database
        const afterGroupScan = contactService.bulkResolveLidsLocally(unresolved);
        const stillUnresolved: string[] = [];

        for (const item of afterGroupScan) {
          if (item.status === 'resolved') {
            resolvedMap.set(item.lid, { ...item, source: 'group_cross_reference' });
          } else {
            stillUnresolved.push(item.lid);
          }
        }

        console.log(
          `[WhatsApp Provider Diagnostic] After group scan: ${resolvedMap.size} resolved, ${stillUnresolved.length} still unresolved.`
        );

        // 4. For remaining unresolved LIDs, attempt USync query in batches of 50
        if (stillUnresolved.length > 0) {
          const batchSize = 50;
          for (let i = 0; i < stillUnresolved.length; i += batchSize) {
            const batch = stillUnresolved.slice(i, i + batchSize);
            try {
              const usync = new USyncQuery()
                .withContactProtocol()
                .withLIDProtocol()
                .withStatusProtocol();

              for (const lid of batch) {
                usync.withUser(new USyncUser().withId(lid));
              }

              const usyncRes = await (this.sock as any).executeUSyncQuery(usync);
              if (usyncRes && Array.isArray(usyncRes.list)) {
                for (const item of usyncRes.list) {
                  const itemLid = item.lid || (item.id?.endsWith('@lid') ? item.id : null);
                  const itemJid = item.id?.endsWith('@s.whatsapp.net') ? item.id : (item.jid || null);
                  const phone = itemJid ? itemJid.replace('@s.whatsapp.net', '') : null;

                  if (itemLid && phone) {
                    contactService.upsertLidMapping(itemLid, phone, itemJid);
                    const norm = contactService.normalizeLid(itemLid);
                    resolvedMap.set(norm, {
                      lid: norm,
                      phone: phone.startsWith('+') ? phone : `+${phone}`,
                      jid: itemJid,
                      name: null,
                      status: 'resolved',
                      source: 'whatsapp_usync'
                    });
                  }
                }
              }
            } catch (usyncErr) {
              console.warn('[WhatsApp Provider Diagnostic] USync batch query error (non-fatal):', usyncErr);
            }
          }
        }
      } catch (scanErr) {
        console.warn('[WhatsApp Provider Diagnostic] Group scan error during LID resolution (non-fatal):', scanErr);
      }
    }

    // Update in-memory group members cache with freshly resolved phone numbers
    if (resolvedMap.size > 0 && this.groupMembersCache.size > 0) {
      for (const [groupId, cacheEntry] of this.groupMembersCache.entries()) {
        let changed = false;
        const updated = cacheEntry.data.map((m) => {
          if (m.lid && !m.phone && resolvedMap.has(m.lid)) {
            const r = resolvedMap.get(m.lid)!;
            if (r.phone) {
              changed = true;
              return { ...m, phone: r.phone };
            }
          }
          return m;
        });
        if (changed) {
          this.groupMembersCache.set(groupId, { data: updated, timestamp: Date.now() });
        }
      }
    }

    // 5. Construct final results matching input order
    return cleanLids.map((lid) => {
      const match = resolvedMap.get(lid);
      if (match) return match;
      return {
        lid,
        phone: null,
        jid: null,
        name: null,
        status: 'unresolved' as const,
        source: 'unresolved'
      };
    });
  }

  /**
   * Extract a pure invite code from any WhatsApp URL or raw code
   */
  public extractInviteCode(input: string): string {
    const trimmed = input.trim();
    const match = trimmed.match(/(?:chat\.whatsapp\.com\/(?:invite\/)?|invite\/)?([a-zA-Z0-9_-]{15,35})/);
    return match ? match[1] : trimmed.replace(/[^a-zA-Z0-9_-]/g, '');
  }

  /**
   * Inspect a WhatsApp Group or Community invite link without joining
   */
  public async getGroupInviteInfo(codeOrLink: string): Promise<GroupInviteMetadata> {
    if (!this.sock || this.status !== 'connected') {
      throw new Error('WhatsApp device is not connected. Please connect before inspecting links.');
    }

    const cleanCode = this.extractInviteCode(codeOrLink);
    if (!cleanCode) {
      return {
        code: codeOrLink,
        subject: 'Invalid Link Format',
        status: 'invalid_or_revoked',
        errorMessage: 'Could not parse a valid WhatsApp invite code from this URL.'
      };
    }

    try {
      const info = await this.sock.groupGetInviteInfo(cleanCode);

      // Check if this WhatsApp account is already in this group
      let isAlreadyJoined = false;
      try {
        const participating = await this.sock.groupFetchAllParticipating();
        if (info.id && participating[info.id]) {
          isAlreadyJoined = true;
        }
      } catch {}

      return {
        id: info.id,
        code: cleanCode,
        subject: info.subject || 'WhatsApp Group',
        desc: info.desc || null,
        size: info.size,
        creation: info.creation,
        owner: info.owner || null,
        isCommunity: !!(info as any).isCommunity,
        isCommunityAnnounce: !!(info as any).isCommunityAnnounce,
        membershipApprovalMode: !!(info as any).membershipApprovalMode,
        restrict: !!info.restrict,
        announce: !!info.announce,
        status: isAlreadyJoined ? 'already_joined' : (info.size && info.size >= 1024 ? 'group_full' : 'valid')
      };
    } catch (err: any) {
      const msg = err.message || '';
      let status: 'invalid_or_revoked' | 'error' = 'invalid_or_revoked';
      if (msg.includes('not-authorized') || msg.includes('item-not-found') || err.output?.statusCode === 404) {
        status = 'invalid_or_revoked';
      }
      return {
        code: cleanCode,
        subject: 'Unavailable Group',
        status,
        errorMessage: msg || 'Invite link is expired, revoked, or invalid.'
      };
    }
  }

  /**
   * Join a WhatsApp Group or Community via invite code or link
   */
  public async acceptGroupInvite(codeOrLink: string): Promise<JoinGroupResult> {
    if (!this.sock || this.status !== 'connected') {
      throw new Error('WhatsApp device is not connected. Please connect before joining.');
    }

    const cleanCode = this.extractInviteCode(codeOrLink);
    if (!cleanCode) {
      return {
        success: false,
        code: codeOrLink,
        status: 'invalid_link',
        error: 'Invalid WhatsApp invite link or code format.'
      };
    }

    try {
      const groupJid = await this.sock.groupAcceptInvite(cleanCode);
      this.clearGroupCaches();

      return {
        success: true,
        code: cleanCode,
        groupJid: groupJid || undefined,
        status: 'joined'
      };
    } catch (err: any) {
      const msg = (err.message || '').toLowerCase();
      const code = err.output?.statusCode;

      if (code === 409 || msg.includes('conflict') || msg.includes('already in group')) {
        return {
          success: true,
          code: cleanCode,
          status: 'already_member',
          error: 'You are already a participant in this group.'
        };
      }

      if (msg.includes('request') || msg.includes('approval') || msg.includes('membership-approval')) {
        return {
          success: true,
          code: cleanCode,
          status: 'pending_approval',
          error: 'Join request sent. Awaiting admin approval.'
        };
      }

      if (code === 404 || code === 410 || msg.includes('item-not-found') || msg.includes('not-authorized')) {
        return {
          success: false,
          code: cleanCode,
          status: 'invalid_link',
          error: 'Invite link is invalid, expired, or reset by admin.'
        };
      }

      if (code === 401 || code === 403 || msg.includes('full')) {
        return {
          success: false,
          code: cleanCode,
          status: 'group_full',
          error: 'Group is full or participation is restricted.'
        };
      }

      return {
        success: false,
        code: cleanCode,
        status: 'failed',
        error: err.message || 'Failed to join group.'
      };
    }
  }
}
