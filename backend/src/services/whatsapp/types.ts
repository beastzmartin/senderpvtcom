export type WhatsAppConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export type IdentifierType = 'phone' | 'lid';

export interface WhatsAppAccountInfo {
  id?: string;
  jid?: string;
  lid?: string;
  name?: string;
  phone?: string;
  platform?: string;
}

export interface QRState {
  qr: string;
  qrDataUrl: string;
  generatedAt: number;
  expiresInSeconds?: number;
}

export interface SendMessageResult {
  success: boolean;
  messageId: string;
  providerMessageId?: string;
  recipient: string;
  identifierType: IdentifierType;
  timestamp: string;
  status: 'sent' | 'failed';
  error?: string;
  rawResponse?: Record<string, unknown>;
}

export interface IncomingMessageEvent {
  providerMessageId: string;
  from: string; // remote JID or LID
  senderIdentifier: string; // normalized phone or pure LID
  identifierType: IdentifierType;
  body: string;
  timestamp: string;
  pushName?: string;
  fromMe: boolean;
  rawMessage?: unknown;
}

export interface MessageContentUpdateEvent {
  providerMessageId: string;
  remoteJid: string;
  senderIdentifier: string;
  identifierType: IdentifierType;
  body: string;
  timestamp?: string;
  rawMessage?: unknown;
}

export interface MessageStatusUpdateEvent {
  providerMessageId: string;
  remoteJid: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
}

export interface NormalizedRecipient {
  identifier: string; // The formatted address for WhatsApp protocol e.g. "919876543210@s.whatsapp.net" or "7757465940199@lid"
  rawIdentifier: string; // Clean display identifier e.g. "+919876543210" or "7757465940199@lid"
  identifierType: IdentifierType;
  isValid: boolean;
  errorMessage?: string;
}

export interface ExtractedMember {
  jid: string;
  phone?: string | null;
  lid?: string | null;
  isLid: boolean;
  name?: string | null;
  role: 'superadmin' | 'admin' | 'member';
  groupId?: string;
  groupSubject?: string;
}

export interface ExtractedGroup {
  id: string; // e.g. 1203630281928@g.us
  subject: string;
  desc?: string | null;
  size: number;
  isCommunity: boolean;
  isCommunityAnnounce: boolean;
  linkedParent?: string | null;
  addressingMode?: 'pn' | 'lid' | string;
  creation?: number;
  participantsCount?: number;
  lidParticipantsCount?: number;
  phoneParticipantsCount?: number;
}

export interface BulkLidProgressEvent {
  total: number;
  sent: number;
  failed: number;
  currentLid: string;
  status: 'sent' | 'failed';
  providerMessageId?: string;
  error?: string;
  percentage: number;
  isCompleted: boolean;
}

export interface GroupInviteMetadata {
  id?: string;
  code: string;
  subject: string;
  desc?: string | null;
  size?: number;
  creation?: number;
  owner?: string | null;
  isCommunity?: boolean;
  isCommunityAnnounce?: boolean;
  membershipApprovalMode?: boolean;
  restrict?: boolean;
  announce?: boolean;
  status: 'valid' | 'already_joined' | 'invalid_or_revoked' | 'group_full' | 'error';
  errorMessage?: string;
}

export interface JoinGroupResult {
  success: boolean;
  code: string;
  groupJid?: string;
  groupSubject?: string;
  status: 'joined' | 'already_member' | 'pending_approval' | 'invalid_link' | 'group_full' | 'failed';
  error?: string;
  participantCount?: number;
}

