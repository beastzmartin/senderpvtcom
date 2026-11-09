export type WhatsAppStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export type IdentifierType = 'phone' | 'lid';

export interface WhatsAppAccountInfo {
  id?: string;
  jid?: string;
  lid?: string;
  name?: string;
  phone?: string;
  platform?: string;
}

export interface WhatsAppDevice {
  id: string;
  session_id: string;
  alias: string;
  is_default: boolean;
  status: WhatsAppStatus;
  phone_number?: string | null;
  jid?: string | null;
  lid?: string | null;
  display_name?: string | null;
  platform?: string | null;
  connected_at?: string | null;
  last_active_at?: string | null;
  created_at: string;
  updated_at: string;
  hasQr?: boolean;
  qrExpiresIn?: number;
}

export interface QRState {
  qr: string;
  qrDataUrl: string;
  generatedAt: number;
  expiresInSeconds?: number;
}

export interface Contact {
  id: string;
  name: string;
  phone_number?: string | null;
  lid?: string | null;
  avatar_url?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  recipient_identifier: string;
  raw_identifier: string;
  identifier_type: IdentifierType;
  contact_id?: string | null;
  contact_name?: string | null;
  avatar_url?: string | null;
  display_name?: string | null;
  notes?: string | null;
  last_message_at?: string | null;
  last_message_text?: string | null;
  unread_count: number;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
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

export interface DashboardStats {
  totalSent: number;
  totalReceived: number;
  activeConversations: number;
  failedMessages: number;
  connectionStatus: WhatsAppStatus;
  accountInfo?: WhatsAppAccountInfo | null;
  recentMessages: Array<Message & { display_name?: string; raw_identifier?: string }>;
}

export interface User {
  id: string;
  username: string;
  name: string;
  email?: string | null;
  company_name?: string | null;
  phone?: string | null;
  role: string;
  plan_tier?: string;
  subscription_status?: string;
  subscription_expires_at?: string | null;
  max_devices?: number;
  daily_message_limit?: number;
  daily_extraction_limit?: number;
  reseller_license_quota?: number;
  days_remaining?: number | null;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  tagline: string;
  price_monthly: number;
  price_yearly: number;
  currency: string;
  max_devices: number;
  daily_message_limit: number;
  daily_extraction_limit: number;
  features: string[];
  is_popular: boolean;
  trial_days?: number;
}

export interface UserSubscriptionDetails {
  userId: string;
  username: string;
  name: string;
  email?: string | null;
  companyName?: string | null;
  role: string;
  planTier: string;
  planName: string;
  status: 'active' | 'trialing' | 'expired' | 'cancelled';
  expiresAt: string | null;
  daysRemaining: number | null;
  isLifetime: boolean;
  isTrial?: boolean;
  activeLicenseCode?: string | null;
  maxDevices: number;
  connectedDevices: number;
  dailyMessageLimit: number;
  messagesSentToday: number;
  remainingMessagesToday: number;
  dailyExtractionLimit: number;
  extractionsToday: number;
  remainingExtractionsToday: number;
  resellerQuota?: number;
  resellerCreatedKeysCount?: number;
  resellerRemainingQuota?: number;
  features: string[];
}

export interface LicenseKeyRecord {
  id: string;
  code: string;
  plan_tier: string;
  duration_days: number;
  max_devices_override?: number | null;
  daily_limit_override?: number | null;
  extraction_limit_override?: number | null;
  status: 'available' | 'used' | 'revoked' | 'expired';
  is_used: number;
  used_by_user_id?: string | null;
  used_by_username?: string | null;
  used_by_name?: string | null;
  used_at?: string | null;
  created_by?: string | null;
  created_by_user_id?: string | null;
  note?: string | null;
  created_at: string;
}

export interface ResellerInfo {
  id: string;
  username: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  role: string;
  reseller_license_quota: number;
  keys_created_count: number;
  remaining_quota: number;
  keys_used_count: number;
  created_at: string;
}

export interface ResellerStats {
  totalQuota: number;
  keysCreated: number;
  remainingQuota: number;
  keysUsed: number;
  isReseller: boolean;
}

export interface ExtractionQuotaInfo {
  dailyExtractionLimit: number;
  extractionsToday: number;
  remaining: number;
  isUnlimited: boolean;
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
  groups?: string[];
}

export interface ExtractedGroup {
  id: string;
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

export interface PlanUpdateDTO {
  name?: string;
  tagline?: string;
  maxDevices?: number;
  dailyMessageLimit?: number;
  dailyExtractionLimit?: number;
  priceMonthly?: number;
  priceYearly?: number;
  features?: string[];
  trialDays?: number;
}

export interface BulkLidProgress {
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

export interface BulkCampaignSettings {
  minDelaySeconds: number;
  maxDelaySeconds: number;
  batchSize: number;
  batchPauseSeconds: number;
  simulateTyping: boolean;
  skipAlreadySentToday: boolean;
  antiDuplicateScope?: 'none' | 'today' | 'last_7_days' | 'all_time';
  dailyLimit: number;
  senderDeviceId?: string;
  deviceMode?: 'single' | 'round_robin';
}

export interface DuplicateCheckResult {
  totalInput: number;
  uniqueLidsCount: number;
  duplicateInListCount: number;
  alreadySentCount: number;
  cleanEligibleCount: number;
  alreadySentLids: string[];
  cleanEligibleLids: string[];
}

export interface BatchCompletedEvent {
  campaignId: string;
  sentInBatch: number;
  remaining: number;
  reason?: string;
}

export interface BulkCampaign {
  id: string;
  name: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  status: 'draft' | 'running' | 'paused' | 'completed' | 'stopped' | 'failed';
  template_message: string;
  settings: BulkCampaignSettings;
  current_index: number;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

export interface BulkCampaignRecipient {
  id: string;
  campaign_id: string;
  lid: string;
  phone_number?: string | null;
  name?: string | null;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';
  sent_message?: string | null;
  provider_message_id?: string | null;
  error_message?: string | null;
  sent_at?: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
}

export interface DailyQuotaStats {
  sentTodayLid: number;
  sentTodayTotal: number;
  dailyLimit: number;
  remainingLid: number;
  dateStr: string;
  isLimitReached: boolean;
  planTier?: string;
  planName?: string;
  isTrial?: boolean;
  daysRemaining?: number | null;
  subscriptionStatus?: string;
}

export interface CampaignProgressEvent {
  campaignId: string;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  pending: number;
  percentage: number;
  status: string;
  currentLid?: string;
  phase?: 'idle' | 'sending' | 'typing' | 'delay' | 'cooldown' | 'completed' | 'paused';
  phaseCountdownSeconds?: number;
  pauseReason?: string;
}

export interface MessageTemplate {
  id: string;
  name: string;
  category: string;
  content: string;
  variables: string[];
  created_at: string;
  updated_at: string;
}

export interface BroadcastSchedule {
  id: string;
  name: string;
  template_id?: string | null;
  template_content: string;
  daily_limit: number;
  scheduled_time: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  total_recipients: number;
  sent_recipients: number;
  failed_recipients: number;
  skipped_recipients: number;
  last_run_at?: string | null;
  next_run_at?: string | null;
  settings: BulkCampaignSettings;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

export interface BroadcastRecipient {
  id: string;
  schedule_id: string;
  lid: string;
  phone_number?: string | null;
  name?: string | null;
  custom_data?: Record<string, any> | null;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';
  batch_day: number;
  sent_at?: string | null;
  error_message?: string | null;
  provider_message_id?: string | null;
  sent_message?: string | null;
  created_at: string;
  updated_at: string;
}



