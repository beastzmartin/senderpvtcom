import {
  WhatsAppConnectionStatus,
  WhatsAppAccountInfo,
  QRState,
  SendMessageResult,
  IncomingMessageEvent,
  MessageContentUpdateEvent,
  MessageStatusUpdateEvent
} from './types.js';

export interface IWhatsAppProvider {
  readonly name: string;
  readonly sessionId?: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  resetSession(): Promise<void>;
  getStatus(): WhatsAppConnectionStatus;
  getQR(): QRState | null;
  getAccountInfo(): WhatsAppAccountInfo | null;
  sendMessageToPhone(phoneNumber: string, message: string): Promise<SendMessageResult>;
  sendMessageToLid(lid: string, message: string, options?: { simulateTyping?: boolean; typingDelayMs?: number }): Promise<SendMessageResult>;
  checkNumberExists(phoneNumber: string): Promise<{ exists: boolean; jid?: string }>;
  getGroups(): Promise<import('./types.js').ExtractedGroup[]>;
  getGroupMembers(groupJid: string): Promise<import('./types.js').ExtractedMember[]>;
  syncAllGroupLids(): Promise<{ totalGroups: number; totalScanned: number; newMappings: number; totalMappings: number }>;
  resolveLidsToPhones(lids: string[]): Promise<Array<{
    lid: string;
    phone: string | null;
    jid: string | null;
    name: string | null;
    status: 'resolved' | 'unresolved';
    source?: string;
  }>>;
  
  // Event listeners
  on(event: 'status', listener: (status: WhatsAppConnectionStatus, accountInfo?: WhatsAppAccountInfo | null, sessionId?: string) => void): this;
  on(event: 'qr', listener: (qrState: QRState | null, sessionId?: string) => void): this;
  on(event: 'message', listener: (msg: IncomingMessageEvent, sessionId?: string) => void): this;
  on(event: 'message_update', listener: (update: MessageContentUpdateEvent, sessionId?: string) => void): this;
  on(event: 'message_status', listener: (update: MessageStatusUpdateEvent, sessionId?: string) => void): this;
  
  removeListener(event: string, listener: (...args: any[]) => void): this;
}

