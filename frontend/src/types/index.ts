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
  is_active?: boolean;
  total_messages_sent?: number;
  total_extracted_contacts?: number;
  connected_devices?: number;
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

export interface VaultLogItem {
  id: string;
  user_id: string;
  group_id?: string | null;
  group_name?: string | null;
  extraction_type: string;
  total_contacts: number;
  phone_count: number;
  lid_count: number;
  source_action: string;
  created_at: string;
  username?: string;
  user_name?: string;
  user_email?: string | null;
  user_plan?: string;
}

export interface VaultRecordDetail extends VaultLogItem {
  contacts_data: string;
  contacts: Array<{
    name?: string | null;
    phone?: string | null;
    lid?: string | null;
    role?: string | null;
    groupSubject?: string | null;
  }>;
}

export interface AdminOverviewStats {
  totalUsers: number;
  activeUsers: number;
  trialUsers: number;
  paidUsers: number;
  connectedDevices: number;
  totalMessages: number;
  sentMessages: number;
  totalCampaigns: number;
  vault: {
    totalExtractions: number;
    totalContactsCaptured: number;
    totalPhonesCaptured: number;
    totalLidsCaptured: number;
  };
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

export interface GroupJoinerSettings {
  minDelaySeconds: number;
  maxDelaySeconds: number;
  batchSize: number;
  batchPauseSeconds: number;
  autoExtractMembers: boolean;
  skipAlreadyMember: boolean;
  senderDeviceId?: string;
  deviceMode?: 'single' | 'round_robin';
}

export interface GroupJoinCampaign {
  id: string;
  user_id?: string | null;
  name: string;
  total_links: number;
  joined_count: number;
  failed_count: number;
  skipped_count: number;
  pending_approval_count: number;
  status: 'draft' | 'running' | 'paused' | 'completed' | 'stopped' | 'failed';
  settings: GroupJoinerSettings;
  current_index: number;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  items?: GroupJoinItem[];
}

export interface GroupJoinItem {
  id: string;
  campaign_id: string;
  invite_code: string;
  raw_link: string;
  group_name?: string | null;
  group_jid?: string | null;
  participant_count: number;
  is_community: boolean;
  status: 'pending' | 'inspecting' | 'joining' | 'joined' | 'already_member' | 'pending_approval' | 'invalid_link' | 'group_full' | 'failed';
  error_message?: string | null;
  joined_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface JoinerProgressEvent {
  campaignId: string;
  total: number;
  joined: number;
  failed: number;
  skipped: number;
  pendingApproval: number;
  percentage: number;
  status: string;
  phase: string;
  currentCode?: string;
  groupName?: string;
  countdownSeconds?: number;
  pauseReason?: string;
  error?: string;
}

export interface AdminSessionItem {
  id: string;
  session_id: string;
  user_id?: string | null;
  username: string;
  user_name: string;
  user_email?: string | null;
  user_plan?: string;
  alias: string;
  is_default: boolean;
  status: WhatsAppStatus;
  phone_number?: string | null;
  jid?: string | null;
  display_name?: string | null;
  platform?: string | null;
  connected_at?: string | null;
  last_active_at?: string | null;
  created_at: string;
  disk_bytes: number;
}

export interface AdminStorageStats {
  server: {
    uptimeSeconds: number;
    nodeVersion: string;
    platform: string;
    cpus: number;
    loadAvg: number[];
    memory: {
      totalBytes: number;
      freeBytes: number;
      usedBytes: number;
      processRss: number;
      processHeapUsed: number;
      processHeapTotal: number;
    };
  };
  database: {
    dbPath: string;
    dbSizeBytes: number;
    walSizeBytes: number;
    shmSizeBytes: number;
    totalDbBytes: number;
    tables: Record<string, number>;
  };
  sessionsStorage: {
    totalFolders: number;
    totalBytes: number;
    orphanFoldersCount: number;
    orphanBytes: number;
  };
}

export interface UserDataSummary {
  messages: number;
  conversations: number;
  contacts: number;
  bulkCampaigns: number;
  broadcastSchedules: number;
  joinCampaigns: number;
  templates: number;
  devices: number;
  vaultExtractions: number;
}

export interface LiveCampaignItem {
  id: string;
  name: string;
  user_id?: string | null;
  username?: string;
  user_name?: string;
  total: number;
  done: number;
  failed: number;
  status: string;
  type: 'bulk' | 'joiner';
  created_at: string;
}

// =========================================================================
// LEAD EXTRACTION & PROSPECTING INTELLIGENCE TYPES
// =========================================================================

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'interested'
  | 'converted'
  | 'not_interested'
  | 'archived';

export interface SocialProfiles {
  linkedin?: string;
  facebook?: string;
  instagram?: string;
  twitter?: string;
  youtube?: string;
  github?: string;
}

export interface LeadRecord {
  id: string;
  user_id: string;
  job_id?: string | null;
  business_name: string;
  category?: string | null;
  industry?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postal_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  rating?: number | null;
  reviews_count?: number;
  operating_status?: string | null;
  place_id?: string | null;
  listing_url?: string | null;
  source: string;
  source_url?: string | null;
  social_profiles?: SocialProfiles | null;
  status: LeadStatus;
  is_verified?: boolean;
  notes?: string | null;
  metadata?: Record<string, any> | null;
  tags?: Array<{ id: string; name: string; color: string }>;
  created_at: string;
  updated_at: string;
}

export type ExtractionJobStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'partially_completed'
  | 'failed'
  | 'cancelled';

export interface ExtractionJobRecord {
  id: string;
  user_id: string;
  source: string;
  keyword?: string | null;
  location?: string | null;
  requested_count: number;
  collected_count: number;
  duplicate_count: number;
  failed_count: number;
  status: ExtractionJobStatus;
  current_progress: number;
  settings?: Record<string, any> | null;
  error_message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExtractionSourceRecord {
  id: string;
  name: string;
  category: string;
  description?: string;
  icon?: string;
  badge?: string;
  is_active: boolean;
  supported_fields: string[];
}

export interface LeadFilterOptions {
  search?: string;
  source?: string;
  status?: LeadStatus | 'all';
  industry?: string;
  city?: string;
  tagId?: string;
  hasPhone?: boolean;
  hasEmail?: boolean;
  hasWebsite?: boolean;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  sortBy?: 'created_at' | 'business_name' | 'rating' | 'reviews_count';
  sortOrder?: 'asc' | 'desc';
}

export interface LeadAnalyticsStats {
  totalLeads: number;
  leadsToday: number;
  verifiedLeads: number;
  withPhone: number;
  withEmail: number;
  bySource: Record<string, number>;
  byStatus: Record<string, number>;
  byIndustry: Record<string, number>;
  byCity: Record<string, number>;
}

export interface LeadNoteItem {
  id: string;
  content: string;
  created_at: string;
}

// =========================================================================
// WALLET, EXTENSIONS MARKETPLACE & MODULE LICENSING TYPES
// =========================================================================

export interface UserWallet {
  user_id: string;
  balance: number;
  currency: string;
  reserved_balance: number;
  total_spent: number;
  total_topped_up: number;
  updated_at: string;
}

export type WalletTransactionType =
  | 'extension_activation'
  | 'module_activation'
  | 'usage_deduction'
  | 'usage_refund'
  | 'wallet_topup'
  | 'promotional_credit'
  | 'admin_adjustment'
  | 'usage_reservation'
  | 'reservation_release'
  | 'renewal_charge';

export interface WalletTransaction {
  id: string;
  user_id: string;
  workspace_id?: string | null;
  extension_id?: string | null;
  module_id?: string | null;
  transaction_type: WalletTransactionType;
  amount: number;
  currency: string;
  previous_balance: number;
  new_balance: number;
  reference_id?: string | null;
  description: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded' | 'reversed';
  metadata?: any;
  created_at: string;
}

export interface MarketplaceModule {
  id: string;
  extension_id: string;
  name: string;
  slug: string;
  description: string;
  icon?: string;
  category?: string;
  version: string;
  features: string[];
  activation_fee: number;
  usage_charging_model: 'free' | 'per_record' | 'per_request' | 'per_api_call' | 'per_scan' | 'per_enrichment' | 'per_job' | 'per_thousand_records' | 'fixed_fee' | 'time_based';
  usage_price: number;
  free_quota: number;
  period_quota_limit: number;
  quota_period: string;
  per_job_limit: number;
  status: string;
  is_visible: boolean;
  sort_order: number;
  // User context fields
  is_activated?: boolean;
  activation_status?: string;
  fee_paid?: number;
  used_in_period?: number;
  remaining_quota?: number;
  effective_price?: number;
  effective_limit?: number;
  unlimited_quota?: boolean;
}

export interface MarketplaceExtension {
  id: string;
  name: string;
  slug: string;
  category: string;
  short_description: string;
  description?: string;
  icon?: string;
  logo_url?: string;
  screenshots: string[];
  features: string[];
  supported_browsers: string[];
  version: string;
  activation_fee: number;
  pricing_model: 'free' | 'one_time' | 'recurring_monthly' | 'recurring_yearly' | 'custom';
  is_featured: boolean;
  is_popular: boolean;
  is_published: boolean;
  status: string;
  rating: number;
  reviews_count: number;
  sort_order: number;
  documentation?: string;
  installation_guide?: string;
  modules?: MarketplaceModule[];
  // User context fields
  is_activated?: boolean;
  activated_at?: string;
  expires_at?: string;
  active_modules_count?: number;
  total_modules_count?: number;
}

// ==========================================
// Virtual Number Marketplace & Management Types
// ==========================================

export interface VirtualNumberCountry {
  iso_code: string;
  name: string;
  dial_code: string;
  flag_emoji: string;
  continent?: string;
  is_active: number;
  available_count: number;
}

export interface VirtualNumberItem {
  id: string;
  phoneNumber: string;
  countryCode: string;
  countryName: string;
  flagEmoji: string;
  dialCode: string;
  numberType: 'mobile' | 'geographic' | 'toll_free' | 'dedicated' | 'temporary';
  capabilities: string[];
  whatsappCompatible: boolean;
  otpCompatible: boolean;
  pricing: {
    activationFee: number;
    monthlyPrice: number;
    totalFirstCharge: number;
    renewalPrice: number;
    currency: string;
  };
  status: string;
}

export interface VirtualNumberRental {
  id: string;
  phoneNumber: string;
  countryCode: string;
  countryName: string;
  flagEmoji: string;
  numberType: string;
  capabilities: string[];
  whatsappCompatible: boolean;
  rentalDuration: string;
  purchasedAt: string;
  activatedAt: string;
  expiresAt: string;
  renewalDate: string;
  renewalPrice: number;
  autoRenew: boolean;
  status: 'pending' | 'processing' | 'active' | 'renewal_due' | 'expired' | 'suspended' | 'releasing' | 'released' | 'failed';
  daysRemaining: number;
  isExpiringSoon: boolean;
  totalCharges: number;
}

export interface VirtualNumberOrder {
  id: string;
  user_id: string;
  phone_number: string;
  country_code: string;
  country_name?: string;
  flag_emoji?: string;
  rental_duration: string;
  duration_days: number;
  activation_fee: number;
  rental_fee: number;
  total_amount: number;
  currency: string;
  wallet_transaction_id?: string;
  status: 'pending' | 'reserved' | 'allocated' | 'failed' | 'cancelled' | 'refunded';
  failure_reason?: string;
  created_at: string;
}

export interface VirtualNumberMessage {
  id: string;
  rental_id: string;
  phone_number: string;
  sender: string;
  message_content: string;
  is_read: number;
  received_at: string;
  country_code?: string;
}

export interface VirtualNumberCall {
  id: string;
  rental_id: string;
  phone_number: string;
  caller_number: string;
  direction: 'inbound' | 'outbound';
  duration_seconds: number;
  call_status: string;
  fee_charged: number;
  started_at: string;
  country_code?: string;
}

export interface VirtualNumberAnalytics {
  totalPurchased: number;
  activeNumbers: number;
  expiringSoon: number;
  totalRentalExpenditure: number;
  smsReceivedCount: number;
  voiceCallsCount: number;
  walletBalance: number;
  currency: string;
}

export interface VirtualNumberProviderRecord {
  id: string;
  name: string;
  slug: string;
  provider_key?: string;
  adapter_class?: string;
  description?: string;
  api_base_url?: string;
  base_url?: string;
  auth_type: string;
  priority: number;
  status: string;
  is_active?: number;
  is_mock: number;
  supported_countries: string;
  capabilities: string;
  health_status: string;
  created_at: string;
}

export interface VirtualNumberPricingRule {
  id: string;
  rule_name?: string;
  provider_id?: string;
  provider_name?: string;
  country_code?: string;
  country_name?: string;
  flag_emoji?: string;
  customer_name?: string;
  pricing_model: string;
  markup_type?: string;
  markup_value?: number;
  base_cost: number;
  activation_fee: number;
  fixed_activation_fee?: number;
  fixed_weekly_fee?: number;
  fixed_monthly_fee?: number;
  fixed_annual_fee?: number;
  minimum_wallet_balance?: number;
  markup_amount: number;
  markup_percentage: number;
  monthly_rental_price: number;
  renewal_price: number;
  is_active: number;
}

// ============================================================================
// 5SIM.NET API Types (Parts 1 - 3)
// ============================================================================

export interface FiveSimProfile {
  id: number;
  email: string;
  vendor: string;
  default_forwarding_number: string;
  balance: number;
  rating: number;
  default_country: {
    name: string;
    iso: string;
    prefix: string;
  };
  default_operator: {
    name: string;
  };
  frozen_balance: number;
}

export interface FiveSimSmsItem {
  id?: number;
  created_at: string;
  date: string;
  sender: string;
  text: string;
  code: string;
}

export interface FiveSimOrderItem {
  id: number;
  phone: string;
  operator: string;
  product: string;
  price: number;
  status: string;
  expires: string;
  sms: FiveSimSmsItem[] | null;
  created_at: string;
  country: string;
  forwarding?: boolean;
  forwarding_number?: string;
}

export interface FiveSimPaymentItem {
  ID: number;
  TypeName: string;
  ProviderName: string;
  Amount: number;
  Balance: number;
  CreatedAt: string;
}

export interface FiveSimMaxPriceItem {
  id: number;
  product: string;
  price: number;
  CreatedAt?: string;
}

export interface FiveSimConfig {
  id: string;
  apiKey: string;
  apiKeyMasked?: string;
  baseUrl: string;
  isEnabled: boolean;
  autoSync: boolean;
  maxRequestsPerSec: number;
  balance: number;
  frozenBalance: number;
  rating: number;
  email?: string;
  vendor?: string;
  defaultCountry?: {
    name: string;
    iso: string;
    prefix: string;
  };
  defaultOperator?: {
    name: string;
  };
  defaultForwardingNumber?: string;
  lastSyncAt?: string;
  lastError?: string;
  lastErrorAt?: string;
}

// Parts 4 - 6 Types
export interface FiveSimProductInfo {
  Category: 'activation' | 'hosting';
  Qty: number;
  Price: number;
}

export type FiveSimProductsMap = Record<string, FiveSimProductInfo>;

export interface FiveSimOperatorPrice {
  cost: number;
  count: number;
  rate?: number;
}

export interface BestOperatorRecommendation {
  operator: string;
  cost: number;
  count: number;
  rate?: number;
  recommended: boolean;
}

export interface BuyActivationParams {
  country: string;
  operator: string;
  product: string;
  forwarding?: boolean;
  number?: string;
  reuse?: number;
  voice?: number;
  ref?: string;
  maxPrice?: number;
}

export interface FiveSimHostingSmsItem {
  ID: number;
  created_at: string;
  date: string;
  sender: string;
  text: string;
  code: string;
}

// Parts 7 & 8 Types
export interface FiveSimFlashNotification {
  text: string;
}

export interface FiveSimVendorWallets {
  fkwallet?: number;
  payeer?: number;
  unitpay?: number;
  [wallet: string]: number | undefined;
}

export interface FiveSimVendorPriceItem {
  ID: number;
  CountryName: string;
  ProductName: string;
  OperatorName: string;
  Price: number;
  Count?: number;
  Rate?: number;
  Hours?: number;
  Enabled?: boolean;
  AutoDisabled?: boolean;
  DeletedAt?: string;
}

export interface FiveSimVendorPricesResponse {
  Prices: FiveSimVendorPriceItem[];
  Products: string[];
  Country: string[];
  Operators: string[];
  Total: number;
}

export interface FiveSimVendorWithdrawParams {
  receiver: string;
  method: string;
  amount: string | number;
  fee: string;
}

// Parts 9 & 10 Types
export interface FiveSimSpecialCountryMapping {
  slug: string;
  officialName: string;
  iso: string;
  prefix: string;
  flag: string;
  aliases: string[];
}

export interface FiveSimSpecialProductMapping {
  slug: string;
  name: string;
  category: 'messaging' | 'social' | 'ai' | 'ecommerce' | 'delivery' | 'travel' | 'finance' | 'entertainment' | 'hosting' | 'other';
  aliases: string[];
  popular?: boolean;
}

export interface FiveSimChecklistItem {
  id: string;
  title: string;
  part: string;
  status: 'passed' | 'warning' | 'failed';
  details: string;
  recommendation?: string;
}

export interface FiveSimDiagnosticsReport {
  timestamp: string;
  overallHealth: 'optimal' | 'attention_needed' | 'critical';
  checklist: FiveSimChecklistItem[];
  accountStats: {
    balance: number;
    rating: number;
    email?: string;
    vendor?: string;
  };
  sampleCodeSnippets: {
    nodejs: string;
    curl: string;
    python: string;
  };
}










