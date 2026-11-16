import {
  WhatsAppStatus,
  WhatsAppAccountInfo,
  WhatsAppDevice,
  QRState,
  Contact,
  Conversation,
  Message,
  DashboardStats,
  User,
  IdentifierType,
  ExtractedGroup,
  ExtractedMember,
  BulkLidSummary,
  BulkCampaign,
  BulkCampaignSettings,
  BulkCampaignRecipient,
  DailyQuotaStats,
  MessageTemplate,
  BroadcastSchedule,
  BroadcastRecipient,
  SubscriptionPlan,
  UserSubscriptionDetails,
  LicenseKeyRecord,
  ExtractionQuotaInfo,
  ResellerInfo,
  ResellerStats,
  VaultLogItem,
  VaultRecordDetail,
  AdminOverviewStats,
  GroupInviteMetadata,
  JoinGroupResult,
  GroupJoinCampaign,
  GroupJoinerSettings,
  AdminSessionItem,
  AdminStorageStats,
  UserDataSummary,
  LiveCampaignItem,
  LeadRecord,
  LeadStatus,
  ExtractionJobRecord,
  ExtractionSourceRecord,
  LeadFilterOptions,
  LeadAnalyticsStats,
  LeadNoteItem,
  UserWallet,
  WalletTransaction,
  MarketplaceExtension,
  MarketplaceModule,
  VirtualNumberCountry,
  VirtualNumberItem,
  VirtualNumberRental,
  VirtualNumberOrder,
  VirtualNumberMessage,
  VirtualNumberCall,
  VirtualNumberAnalytics,
  VirtualNumberPricingRule,
  VirtualNumberProviderRecord,
  FiveSimProfile,
  FiveSimOrderItem,
  FiveSimPaymentItem,
  FiveSimMaxPriceItem,
  FiveSimConfig,
  FiveSimProductsMap,
  BestOperatorRecommendation,
  BuyActivationParams,
  FiveSimHostingSmsItem,
  FiveSimFlashNotification,
  FiveSimVendorWallets,
  FiveSimVendorPriceItem,
  FiveSimVendorPricesResponse,
  FiveSimVendorWithdrawParams,
  FiveSimSpecialCountryMapping,
  FiveSimSpecialProductMapping,
  FiveSimDiagnosticsReport,
  NumberCountry,
  NumberProduct,
  NumberOperatorRate,
  NumberOrder,
  MarginRule,
  PricingSettings,
  ProfitReport,
  HiddenItem,
  CurrencyRecord,
  CustomCommissionRule
} from '../types';

const getApiBase = (): string => {
  const envUrl = ((import.meta as any).env?.VITE_API_URL as string)?.trim();
  if (envUrl) {
    const clean = envUrl.replace(/\/+$/, '');
    return clean.endsWith('/api') ? clean : `${clean}/api`;
  }
  return '/api';
};

const API_BASE = getApiBase();

export function getAuthToken(): string | null {
  return localStorage.getItem('wa_auth_token');
}

export function setAuthToken(token: string): void {
  localStorage.setItem('wa_auth_token', token);
}

export function removeAuthToken(): void {
  localStorage.removeItem('wa_auth_token');
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  const text = await response.text();
  let data: any = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!response.ok) {
    const errorMsg = data.error || data.message || `Request failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return data as T;
}

export const api = {
  // WhatsApp Connection
  whatsapp: {
    getStatus: () =>
      request<{
        status: WhatsAppStatus;
        provider: string;
        connected: boolean;
        accountInfo: WhatsAppAccountInfo | null;
        hasQr: boolean;
        qrExpiresIn: number;
      }>('/whatsapp/status'),

    getQR: () =>
      request<{
        status: WhatsAppStatus;
        qr: string | null;
        qrDataUrl: string | null;
        message?: string;
        expiresInSeconds?: number;
      }>('/whatsapp/qr'),

    connect: () =>
      request<{ success: boolean; status: WhatsAppStatus; message: string }>('/whatsapp/connect', {
        method: 'POST'
      }),

    disconnect: () =>
      request<{ success: boolean; status: WhatsAppStatus; message: string }>('/whatsapp/disconnect', {
        method: 'POST'
      }),

    resetSession: () =>
      request<{ success: boolean; status: WhatsAppStatus; message: string }>('/whatsapp/reset', {
        method: 'POST'
      }),

    checkNumber: (phone: string) =>
      request<{ exists: boolean; jid?: string }>(`/whatsapp/check-number?phone=${encodeURIComponent(phone)}`),

    // Multi-Device Endpoints
    getDevices: () =>
      request<{
        success: boolean;
        devices: WhatsAppDevice[];
        activeSessionId: string;
      }>('/whatsapp/devices'),

    createDevice: (alias?: string) =>
      request<{
        success: boolean;
        device: WhatsAppDevice;
        message: string;
      }>('/whatsapp/devices', {
        method: 'POST',
        body: JSON.stringify({ alias })
      }),

    deleteDevice: (sessionId: string) =>
      request<{ success: boolean; message: string }>(`/whatsapp/devices/${sessionId}`, {
        method: 'DELETE'
      }),

    setDefaultDevice: (sessionId: string) =>
      request<{ success: boolean; message: string }>(`/whatsapp/devices/${sessionId}/default`, {
        method: 'POST'
      }),

    renameDevice: (sessionId: string, alias: string) =>
      request<{ success: boolean; message: string }>(`/whatsapp/devices/${sessionId}/alias`, {
        method: 'PUT',
        body: JSON.stringify({ alias })
      }),

    getDeviceQR: (sessionId: string) =>
      request<{
        sessionId: string;
        status: WhatsAppStatus;
        qr: string | null;
        qrDataUrl: string | null;
        expiresInSeconds?: number;
      }>(`/whatsapp/devices/${sessionId}/qr`),

    connectDevice: (sessionId: string) =>
      request<{ success: boolean; status: WhatsAppStatus; message: string }>(`/whatsapp/devices/${sessionId}/connect`, {
        method: 'POST'
      }),

    disconnectDevice: (sessionId: string) =>
      request<{ success: boolean; status: WhatsAppStatus; message: string }>(`/whatsapp/devices/${sessionId}/disconnect`, {
        method: 'POST'
      }),

    resetDevice: (sessionId: string) =>
      request<{ success: boolean; status: WhatsAppStatus; message: string }>(`/whatsapp/devices/${sessionId}/reset`, {
        method: 'POST'
      })
  },

  // Messages
  messages: {
    send: (recipient: string, message: string, identifierType?: IdentifierType, sessionId?: string, useRoundRobin?: boolean) =>
      request<{ success: boolean; message: string; data: Message }>('/messages/send', {
        method: 'POST',
        body: JSON.stringify({ recipient, message, identifierType, sessionId, useRoundRobin })
      }),

    sendPhone: (phoneNumber: string, message: string, sessionId?: string, useRoundRobin?: boolean) =>
      request<{ success: boolean; message: string; data: Message }>('/messages/send-phone', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber, message, sessionId, useRoundRobin })
      }),

    sendLid: (lid: string, message: string, sessionId?: string, useRoundRobin?: boolean) =>
      request<{ success: boolean; message: string; data: Message }>('/messages/send-lid', {
        method: 'POST',
        body: JSON.stringify({ lid, message, sessionId, useRoundRobin })
      }),

    sendBulkLid: (lids: string[], message: string, delayMs = 1500) =>
      request<{ success: boolean; message: string; data: BulkLidSummary }>('/messages/bulk-lid', {
        method: 'POST',
        body: JSON.stringify({ lids, message, delayMs })
      }),

    getMessages: (conversationId?: string, limit = 50, offset = 0) => {
      const q = new URLSearchParams();
      if (conversationId) q.set('conversationId', conversationId);
      q.set('limit', limit.toString());
      q.set('offset', offset.toString());
      return request<{ data: Message[]; count: number }>(`/messages?${q.toString()}`);
    },

    getDashboardStats: () => request<DashboardStats>('/dashboard/stats'),

    // Daily Quota & Anti-Ban
    getDailyQuota: () =>
      request<{ success: boolean; data: DailyQuotaStats }>('/messages/daily-quota'),

    updateDailyQuota: (limit: number) =>
      request<{ success: boolean; message: string; data: DailyQuotaStats }>('/messages/daily-quota', {
        method: 'PUT',
        body: JSON.stringify({ limit })
      }),

    // Bulk Campaigns
    createCampaign: (data: {
      name?: string;
      lids: string[];
      templateMessage: string;
      settings?: Partial<BulkCampaignSettings>;
      autoStart?: boolean;
    }) =>
      request<{ success: boolean; message: string; data: BulkCampaign }>('/messages/bulk-campaigns', {
        method: 'POST',
        body: JSON.stringify(data)
      }),

    listCampaigns: (limit = 30) =>
      request<{ success: boolean; data: BulkCampaign[] }>(`/messages/bulk-campaigns?limit=${limit}`),

    getCampaignDetails: (id: string, status?: string, search?: string) => {
      const q = new URLSearchParams();
      if (status && status !== 'all') q.set('status', status);
      if (search) q.set('search', search);
      const queryStr = q.toString() ? `?${q.toString()}` : '';
      return request<{
        success: boolean;
        data: { campaign: BulkCampaign; recipients: BulkCampaignRecipient[] };
      }>(`/messages/bulk-campaigns/${id}${queryStr}`);
    },

    startCampaign: (id: string, maxToSend?: number) =>
      request<{ success: boolean; message: string; data: BulkCampaign }>(
        `/messages/bulk-campaigns/${id}/start`,
        {
          method: 'POST',
          body: JSON.stringify({ maxToSend })
        }
      ),

    checkDuplicates: (lids: string[], scope: 'none' | 'today' | 'last_7_days' | 'all_time' = 'all_time') =>
      request<{ success: boolean; data: import('../types').DuplicateCheckResult }>('/messages/bulk-campaigns/check-duplicates', {
        method: 'POST',
        body: JSON.stringify({ lids, scope })
      }),

    pauseCampaign: (id: string) =>
      request<{ success: boolean; message: string; data: BulkCampaign }>(
        `/messages/bulk-campaigns/${id}/pause`,
        { method: 'POST' }
      ),

    stopCampaign: (id: string) =>
      request<{ success: boolean; message: string; data: BulkCampaign }>(
        `/messages/bulk-campaigns/${id}/stop`,
        { method: 'POST' }
      ),

    retryFailed: (id: string) =>
      request<{ success: boolean; message: string; data: BulkCampaign }>(
        `/messages/bulk-campaigns/${id}/retry-failed`,
        { method: 'POST' }
      ),

    retryRecipient: (campaignId: string, recipientId: string) =>
      request<{ success: boolean; message: string; data: BulkCampaignRecipient }>(
        `/messages/bulk-campaigns/${campaignId}/recipients/${recipientId}/retry`,
        { method: 'POST' }
      ),

    deleteCampaign: (id: string) =>
      request<{ success: boolean; message: string }>(`/messages/bulk-campaigns/${id}`, {
        method: 'DELETE'
      })
  },

  // Conversations
  conversations: {
    list: (search?: string) => {
      const q = search ? `?search=${encodeURIComponent(search)}` : '';
      return request<{ data: Conversation[]; count: number }>(`/conversations${q}`);
    },

    getMessages: (id: string, limit = 100, offset = 0) =>
      request<{
        conversation: Conversation & { notes?: string };
        messages: Message[];
        count: number;
      }>(`/conversations/${id}/messages?limit=${limit}&offset=${offset}`),

    markAsRead: (id: string) =>
      request<{ success: boolean }>(`/conversations/${id}/read`, {
        method: 'POST'
      }),

    delete: (id: string) =>
      request<{ success: boolean; message: string }>(`/conversations/${id}`, {
        method: 'DELETE'
      }),

    deleteAll: () =>
      request<{ success: boolean; message: string; deletedConvs: number; deletedMsgs: number }>('/conversations', {
        method: 'DELETE'
      })
  },

  // Contacts
  contacts: {
    list: (search?: string) => {
      const q = search ? `?search=${encodeURIComponent(search)}` : '';
      return request<{ data: Contact[]; count: number }>(`/contacts${q}`);
    },

    get: (id: string) => request<Contact>(`/contacts/${id}`),

    create: (data: { name: string; phone_number?: string | null; lid?: string | null; notes?: string | null }) =>
      request<{ success: boolean; data: Contact }>('/contacts', {
        method: 'POST',
        body: JSON.stringify(data)
      }),

    update: (id: string, data: Partial<Contact>) =>
      request<{ success: boolean; data: Contact }>(`/contacts/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      }),

    delete: (id: string) =>
      request<{ success: boolean; message: string }>(`/contacts/${id}`, {
        method: 'DELETE'
      }),

    importCsv: (csvContent: string) =>
      request<{
        success: boolean;
        message: string;
        data: { total: number; imported: number; skipped: number; errors: any[] };
      }>('/contacts/import', {
        method: 'POST',
        body: JSON.stringify({ csvContent })
      }),

    resolveLids: (lids: string[]) =>
      request<{
        success: boolean;
        total: number;
        resolved: number;
        unresolved: number;
        results: Array<{
          lid: string;
          phone: string | null;
          jid: string | null;
          name: string | null;
          status: 'resolved' | 'unresolved';
          source?: string;
        }>;
      }>('/contacts/resolve-lids', {
        method: 'POST',
        body: JSON.stringify({ lids })
      }),

    syncGroupLids: () =>
      request<{
        success: boolean;
        message: string;
        data: {
          totalGroups: number;
          totalScanned: number;
          newMappings: number;
          totalMappings: number;
        };
      }>('/contacts/sync-group-lids', {
        method: 'POST'
      }),

    getLidMappings: (search?: string, limit = 100, offset = 0) => {
      const q = new URLSearchParams();
      if (search) q.set('search', search);
      q.set('limit', limit.toString());
      q.set('offset', offset.toString());
      return request<{
        data: Array<{
          lid: string;
          phone_number: string | null;
          jid: string | null;
          display_name: string | null;
          updated_at: string;
        }>;
        total: number;
        limit: number;
        offset: number;
      }>(`/contacts/lid-mappings?${q.toString()}`);
    }
  },

  // Groups & Communities Extractor
  groups: {
    getQuota: () =>
      request<{ success: boolean; quota: ExtractionQuotaInfo }>('/groups/quota'),

    list: (sessionId?: string, fresh?: boolean) => {
      const q = new URLSearchParams();
      if (sessionId) q.set('sessionId', sessionId);
      if (fresh) q.set('fresh', 'true');
      const queryStr = q.toString() ? `?${q.toString()}` : '';
      return request<{ data: ExtractedGroup[]; count: number }>(`/groups${queryStr}`);
    },

    getMembers: (id: string, sessionId?: string, fresh?: boolean) => {
      const q = new URLSearchParams();
      if (sessionId) q.set('sessionId', sessionId);
      if (fresh) q.set('fresh', 'true');
      const queryStr = q.toString() ? `?${q.toString()}` : '';
      return request<{
        groupId: string;
        total: number;
        totalLids: number;
        totalPhones: number;
        members: ExtractedMember[];
      }>(`/groups/${id}/members${queryStr}`);
    },

    getMultiMembers: (groupIds: string[], sessionId?: string) =>
      request<{
        success: boolean;
        groupCount: number;
        total: number;
        totalLids: number;
        totalPhones: number;
        members: ExtractedMember[];
      }>('/groups/multi/members', {
        method: 'POST',
        body: JSON.stringify({ groupIds, sessionId })
      }),

    resolveLids: (id: string, sessionId?: string) =>
      request<{
        success: boolean;
        groupId: string;
        total: number;
        totalResolved: number;
        totalLids: number;
        resolvedCount: number;
        members: ExtractedMember[];
      }>(`/groups/${id}/resolve-lids`, {
        method: 'POST',
        body: JSON.stringify({ sessionId })
      }),

    syncAllLids: (sessionId?: string) =>
      request<{
        success: boolean;
        message: string;
        data: {
          totalGroups: number;
          totalScanned: number;
          newMappings: number;
          totalMappings: number;
        };
      }>('/groups/sync-all-lids', {
        method: 'POST',
        body: JSON.stringify({ sessionId })
      }),

    exportToContacts: (id: string, sessionId?: string) =>
      request<{
        success: boolean;
        message: string;
        imported: number;
        skipped: number;
      }>(`/groups/${id}/export-contacts`, {
        method: 'POST',
        body: JSON.stringify({ sessionId })
      }),

    exportMultiToContacts: (members: ExtractedMember[], sessionId?: string) =>
      request<{
        success: boolean;
        message: string;
        imported: number;
        skipped: number;
      }>('/groups/multi/export-contacts', {
        method: 'POST',
        body: JSON.stringify({ members, sessionId })
      }),

    trackAction: (data: {
      groupId?: string | null;
      groupName?: string | null;
      action: 'download_csv' | 'download_json' | 'copied_numbers' | 'export_contacts';
      members: any[];
    }) =>
      request<{ success: boolean }>('/groups/track-action', {
        method: 'POST',
        body: JSON.stringify(data)
      }).catch(() => ({ success: true }))
  },

  // Auth
  auth: {
    login: (usernameOrEmail: string, password: string) =>
      request<{ success: boolean; token: string; user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: usernameOrEmail, password })
      }),

    register: (data: {
      username: string;
      password: string;
      name?: string;
      email?: string;
      company_name?: string;
      phone?: string;
      plan_tier?: string;
    }) =>
      request<{ success: boolean; token: string; user: User }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(data)
      }),

    getMe: () => request<{ user: User }>('/auth/me'),

    updateProfile: (data: { name?: string; email?: string; company_name?: string; phone?: string }) =>
      request<{ success: boolean; message: string; user: User }>('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify(data)
      }),

    changePassword: (oldPassword: string, newPassword: string) =>
      request<{ success: boolean; message: string }>('/auth/password', {
        method: 'PUT',
        body: JSON.stringify({ oldPassword, newPassword })
      })
  },

  // Subscriptions & SaaS Billing
  subscriptions: {
    getPlans: () =>
      request<{ success: boolean; plans: SubscriptionPlan[] }>('/subscriptions/plans'),

    getMyPlan: () =>
      request<{ success: boolean; subscription: UserSubscriptionDetails }>('/subscriptions/my-plan'),

    upgrade: (planTier: string, billingCycle: 'monthly' | 'yearly' = 'monthly') =>
      request<{ success: boolean; message: string; subscription: UserSubscriptionDetails }>(
        '/subscriptions/upgrade',
        {
          method: 'POST',
          body: JSON.stringify({ planTier, billingCycle })
        }
      ),

    redeemCode: (code: string) =>
      request<{ success: boolean; message: string; subscription: UserSubscriptionDetails }>(
        '/subscriptions/redeem-code',
        {
          method: 'POST',
          body: JSON.stringify({ code })
        }
      ),

    adminListCustomers: () =>
      request<{ success: boolean; customers: any[] }>('/subscriptions/admin/customers'),

    adminListKeys: () =>
      request<{ success: boolean; keys: LicenseKeyRecord[] }>('/subscriptions/admin/keys'),

    adminGenerateKey: (
      planTier: string,
      durationDays: number,
      options?: { note?: string; maxDevices?: number; dailyLimit?: number }
    ) =>
      request<{ success: boolean; message: string; key: LicenseKeyRecord }>(
        '/subscriptions/admin/generate-key',
        {
          method: 'POST',
          body: JSON.stringify({ planTier, durationDays, ...options })
        }
      ),

    adminBulkGenerateKeys: (
      planTier: string,
      durationDays: number,
      count: number,
      options?: { note?: string; maxDevices?: number; dailyLimit?: number }
    ) =>
      request<{ success: boolean; message: string; keys: LicenseKeyRecord[] }>(
        '/subscriptions/admin/bulk-generate-keys',
        {
          method: 'POST',
          body: JSON.stringify({ planTier, durationDays, count, ...options })
        }
      ),

    adminRevokeKey: (keyId: string) =>
      request<{ success: boolean; message: string }>('/subscriptions/admin/revoke-key', {
        method: 'POST',
        body: JSON.stringify({ keyId })
      }),

    adminDeleteKey: (keyId: string) =>
      request<{ success: boolean; message: string }>(`/subscriptions/admin/keys/${keyId}`, {
        method: 'DELETE'
      }),

    adminUpdateCustomer: (data: {
      targetUserId: string;
      planTier: string;
      subscriptionStatus?: string;
      durationDays?: number;
      maxDevices?: number;
      dailyLimit?: number;
      extractionLimit?: number;
    }) =>
      request<{ success: boolean; message: string; subscription: UserSubscriptionDetails }>(
        '/subscriptions/admin/update-customer',
        {
          method: 'PUT',
          body: JSON.stringify(data)
        }
      ),

    adminUpdatePlan: (planId: string, data: import('../types').PlanUpdateDTO) =>
      request<{ success: boolean; message: string; plan: SubscriptionPlan }>(
        `/subscriptions/admin/plans/${planId}`,
        {
          method: 'PUT',
          body: JSON.stringify(data)
        }
      ),

    adminGetSettings: () =>
      request<{ success: boolean; settings: Record<string, string> }>('/subscriptions/admin/settings'),

    adminUpdateSettings: (settings: Record<string, string>) =>
      request<{ success: boolean; message: string; settings: Record<string, string> }>(
        '/subscriptions/admin/settings',
        {
          method: 'POST',
          body: JSON.stringify({ settings })
        }
      ),

    // Reseller
    resellerGetStats: () =>
      request<{ success: boolean; stats: ResellerStats }>('/subscriptions/reseller/stats'),

    resellerListKeys: () =>
      request<{ success: boolean; keys: LicenseKeyRecord[] }>('/subscriptions/reseller/keys'),

    resellerGenerateKey: (
      planTier: string,
      durationDays: number,
      options?: { note?: string; maxDevices?: number; dailyLimit?: number }
    ) =>
      request<{ success: boolean; message: string; key: LicenseKeyRecord }>(
        '/subscriptions/reseller/generate-key',
        {
          method: 'POST',
          body: JSON.stringify({ planTier, durationDays, ...options })
        }
      ),

    resellerBulkGenerateKeys: (
      planTier: string,
      durationDays: number,
      count: number,
      options?: { note?: string; maxDevices?: number; dailyLimit?: number }
    ) =>
      request<{ success: boolean; message: string; keys: LicenseKeyRecord[] }>(
        '/subscriptions/reseller/bulk-generate-keys',
        {
          method: 'POST',
          body: JSON.stringify({ planTier, durationDays, count, ...options })
        }
      ),

    resellerRevokeKey: (keyId: string) =>
      request<{ success: boolean; message: string }>('/subscriptions/reseller/revoke-key', {
        method: 'POST',
        body: JSON.stringify({ keyId })
      }),

    // Admin Reseller Management
    adminListResellers: () =>
      request<{ success: boolean; resellers: ResellerInfo[] }>('/subscriptions/admin/resellers'),

    adminSetResellerQuota: (targetUserId: string, quota: number) =>
      request<{ success: boolean; message: string }>('/subscriptions/admin/resellers', {
        method: 'POST',
        body: JSON.stringify({ targetUserId, quota })
      }),

    adminAddResellerCredits: (targetUserId: string, additionalCredits: number) =>
      request<{ success: boolean; message: string; newQuota: number }>(
        '/subscriptions/admin/resellers/add-credits',
        {
          method: 'POST',
          body: JSON.stringify({ targetUserId, additionalCredits })
        }
      ),

    adminDemoteReseller: (userId: string) =>
      request<{ success: boolean; message: string }>(`/subscriptions/admin/resellers/${userId}`, {
        method: 'DELETE'
      })
  },

  // Templates
  templates: {
    list: (category?: string, search?: string) => {
      const q = new URLSearchParams();
      if (category && category !== 'all') q.set('category', category);
      if (search) q.set('search', search);
      const str = q.toString() ? `?${q.toString()}` : '';
      return request<{ success: boolean; data: MessageTemplate[]; count: number }>(`/templates${str}`);
    },

    get: (id: string) =>
      request<{ success: boolean; data: MessageTemplate }>(`/templates/${id}`),

    create: (data: { name: string; category?: string; content: string }) =>
      request<{ success: boolean; message: string; data: MessageTemplate }>('/templates', {
        method: 'POST',
        body: JSON.stringify(data)
      }),

    update: (id: string, data: { name?: string; category?: string; content?: string }) =>
      request<{ success: boolean; message: string; data: MessageTemplate }>(`/templates/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      }),

    delete: (id: string) =>
      request<{ success: boolean; message: string }>(`/templates/${id}`, {
        method: 'DELETE'
      })
  },

  // Broadcast Scheduler
  scheduler: {
    list: () =>
      request<{ success: boolean; data: BroadcastSchedule[]; count: number }>('/scheduler'),

    get: (id: string, status?: string) => {
      const q = status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';
      return request<{
        success: boolean;
        data: { schedule: BroadcastSchedule; recipients: BroadcastRecipient[] };
      }>(`/scheduler/${id}${q}`);
    },

    create: (data: {
      name: string;
      templateId?: string;
      templateContent: string;
      dailyLimit: number;
      scheduledTime?: string;
      recipients: Array<{
        lid: string;
        phone_number?: string;
        name?: string;
        custom_data?: Record<string, any>;
      }>;
      settings?: Partial<BulkCampaignSettings>;
    }) =>
      request<{ success: boolean; message: string; data: BroadcastSchedule }>('/scheduler', {
        method: 'POST',
        body: JSON.stringify(data)
      }),

    pause: (id: string) =>
      request<{ success: boolean; message: string; data: BroadcastSchedule }>(`/scheduler/${id}/pause`, {
        method: 'POST'
      }),

    resume: (id: string) =>
      request<{ success: boolean; message: string; data: BroadcastSchedule }>(`/scheduler/${id}/resume`, {
        method: 'POST'
      }),

    runNow: (id: string) =>
      request<{
        success: boolean;
        message: string;
        data: { sent: number; failed: number; remaining: number };
      }>(`/scheduler/${id}/run-now`, {
        method: 'POST'
      }),

    delete: (id: string) =>
      request<{ success: boolean; message: string }>(`/scheduler/${id}`, {
        method: 'DELETE'
      })
  },

  // Super Admin Control Center
  admin: {
    getOverview: () =>
      request<{ success: boolean; stats: AdminOverviewStats }>('/admin/overview'),

    impersonate: (targetUserId: string) =>
      request<{ success: boolean; message: string; token: string; user: User }>('/admin/impersonate', {
        method: 'POST',
        body: JSON.stringify({ targetUserId })
      }),

    resetPassword: (userId: string, newPassword: string) =>
      request<{ success: boolean; message: string }>(`/admin/users/${userId}/password`, {
        method: 'PUT',
        body: JSON.stringify({ newPassword })
      }),

    toggleUserStatus: (userId: string, isActive: boolean) =>
      request<{ success: boolean; message: string }>(`/admin/users/${userId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ isActive })
      }),

    deleteUser: (userId: string) =>
      request<{ success: boolean; message: string }>(`/admin/users/${userId}`, {
        method: 'DELETE'
      }),

    listVault: (userId?: string) => {
      const q = userId ? `?userId=${encodeURIComponent(userId)}` : '';
      return request<{ success: boolean; logs: VaultLogItem[]; count: number }>(`/admin/vault${q}`);
    },

    getVaultRecord: (id: string) =>
      request<{ success: boolean; record: VaultRecordDetail }>(`/admin/vault/${id}`),

    downloadVaultCsvUrl: (id: string) => `${API_BASE}/admin/vault/${id}/csv`,

    deleteVaultRecord: (id: string) =>
      request<{ success: boolean; message: string }>(`/admin/vault/${id}`, {
        method: 'DELETE'
      }),

    clearVault: () =>
      request<{ success: boolean; message: string }>('/admin/vault', {
        method: 'DELETE'
      }),

    // Session Controller & Device Terminator
    listSessions: () =>
      request<{ success: boolean; sessions: AdminSessionItem[]; diskStats: any }>('/admin/sessions'),

    disconnectSession: (sessionId: string) =>
      request<{ success: boolean; message: string }>(`/admin/sessions/${sessionId}/disconnect`, {
        method: 'POST'
      }),

    reconnectSession: (sessionId: string) =>
      request<{ success: boolean; message: string }>(`/admin/sessions/${sessionId}/reconnect`, {
        method: 'POST'
      }),

    terminateSession: (sessionId: string) =>
      request<{ success: boolean; message: string }>(`/admin/sessions/${sessionId}`, {
        method: 'DELETE'
      }),

    terminateUserDevices: (userId: string) =>
      request<{ success: boolean; message: string; terminatedCount: number }>(`/admin/users/${userId}/terminate-devices`, {
        method: 'POST'
      }),

    // Website Storage & Data Manager
    getStorageStats: () =>
      request<{ success: boolean; storage: AdminStorageStats }>('/admin/storage'),

    vacuumDatabase: () =>
      request<{ success: boolean; message: string }>('/admin/storage/vacuum', {
        method: 'POST'
      }),

    purgeOldMessages: (data: { olderThanDays?: number; onlyFailed?: boolean }) =>
      request<{ success: boolean; message: string; deletedMessages: number }>('/admin/storage/purge-old-messages', {
        method: 'POST',
        body: JSON.stringify(data)
      }),

    purgeOrphanSessions: () =>
      request<{ success: boolean; message: string; deletedCount: number; freedBytes: number }>('/admin/storage/purge-orphan-sessions', {
        method: 'POST'
      }),

    downloadDbBackupUrl: () => `${API_BASE}/admin/storage/download-db`,

    // Particular User Data & Message History Eraser
    getUserDataSummary: (userId: string) =>
      request<{ success: boolean; summary: UserDataSummary }>(`/admin/users/${userId}/data-summary`),

    deleteUserMessages: (userId: string) =>
      request<{ success: boolean; message: string; deletedMsgs: number; deletedConvs: number }>(`/admin/users/${userId}/messages`, {
        method: 'DELETE'
      }),

    deleteUserContacts: (userId: string) =>
      request<{ success: boolean; message: string }>(`/admin/users/${userId}/contacts`, {
        method: 'DELETE'
      }),

    deleteUserCampaigns: (userId: string) =>
      request<{ success: boolean; message: string }>(`/admin/users/${userId}/campaigns`, {
        method: 'DELETE'
      }),

    factoryResetUser: (userId: string) =>
      request<{ success: boolean; message: string }>(`/admin/users/${userId}/factory-reset`, {
        method: 'POST'
      }),

    // Live Global Campaigns Monitor
    listLiveCampaigns: () =>
      request<{ success: boolean; campaigns: LiveCampaignItem[] }>('/admin/live-campaigns'),

    stopLiveCampaign: (type: 'bulk' | 'joiner', id: string) =>
      request<{ success: boolean; message: string }>(`/admin/live-campaigns/${type}/${id}/stop`, {
        method: 'POST'
      })
  },

  // Advanced Group & Community Joiner
  groupJoiner: {
    parseLinks: (text: string) =>
      request<{ success: boolean; count: number; links: string[] }>('/group-joiner/parse-links', {
        method: 'POST',
        body: JSON.stringify({ text })
      }),

    inspectLinks: (links: string[], sessionId?: string) =>
      request<{ success: boolean; count: number; results: GroupInviteMetadata[] }>('/group-joiner/inspect-links', {
        method: 'POST',
        body: JSON.stringify({ links, sessionId })
      }),

    joinSingle: (link: string, sessionId?: string) =>
      request<{ success: boolean; result: JoinGroupResult }>('/group-joiner/join-single', {
        method: 'POST',
        body: JSON.stringify({ link, sessionId })
      }),

    listCampaigns: () =>
      request<{ success: boolean; campaigns: GroupJoinCampaign[]; count: number }>('/group-joiner/campaigns'),

    createCampaign: (data: {
      name?: string;
      links: string[];
      settings?: Partial<GroupJoinerSettings>;
      autoStart?: boolean;
    }) =>
      request<{ success: boolean; message: string; campaign: GroupJoinCampaign }>('/group-joiner/campaigns', {
        method: 'POST',
        body: JSON.stringify(data)
      }),

    getCampaign: (id: string) =>
      request<{ success: boolean; campaign: GroupJoinCampaign }>(`/group-joiner/campaigns/${id}`),

    startCampaign: (id: string) =>
      request<{ success: boolean; message: string }>(`/group-joiner/campaigns/${id}/start`, {
        method: 'POST'
      }),

    pauseCampaign: (id: string) =>
      request<{ success: boolean; message: string }>(`/group-joiner/campaigns/${id}/pause`, {
        method: 'POST'
      }),

    stopCampaign: (id: string) =>
      request<{ success: boolean; message: string }>(`/group-joiner/campaigns/${id}/stop`, {
        method: 'POST'
      }),

    deleteCampaign: (id: string) =>
      request<{ success: boolean; message: string }>(`/group-joiner/campaigns/${id}`, {
        method: 'DELETE'
      })
  },

  leads: {
    list: (filters: LeadFilterOptions = {}) => {
      const params = new URLSearchParams();
      if (filters.search) params.append('search', filters.search);
      if (filters.source) params.append('source', filters.source);
      if (filters.status && filters.status !== 'all') params.append('status', filters.status);
      if (filters.industry) params.append('industry', filters.industry);
      if (filters.city) params.append('city', filters.city);
      if (filters.tagId) params.append('tagId', filters.tagId);
      if (filters.hasPhone) params.append('hasPhone', 'true');
      if (filters.hasEmail) params.append('hasEmail', 'true');
      if (filters.hasWebsite) params.append('hasWebsite', 'true');
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.page) params.append('page', String(filters.page));
      if (filters.limit) params.append('limit', String(filters.limit));
      if (filters.sortBy) params.append('sortBy', filters.sortBy);
      if (filters.sortOrder) params.append('sortOrder', filters.sortOrder);
      const query = params.toString();
      return request<{
        leads: LeadRecord[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>(`/leads${query ? `?${query}` : ''}`);
    },

    getStats: () => request<LeadAnalyticsStats>('/leads/stats'),

    getById: (id: string) => request<LeadRecord>(`/leads/${id}`),

    create: (data: Partial<LeadRecord>) =>
      request<LeadRecord>('/leads', {
        method: 'POST',
        body: JSON.stringify(data)
      }),

    batchSync: (leads: Partial<LeadRecord>[], jobId?: string) =>
      request<{ created: LeadRecord[]; duplicates: number; failed: number }>('/leads/batch', {
        method: 'POST',
        body: JSON.stringify({ leads, jobId })
      }),

    update: (id: string, data: Partial<LeadRecord>) =>
      request<LeadRecord>(`/leads/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      }),

    delete: (id: string) =>
      request<{ success: boolean; message: string }>(`/leads/${id}`, {
        method: 'DELETE'
      }),

    bulkDelete: (ids: string[]) =>
      request<{ success: boolean; deletedCount: number }>('/leads/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids })
      }),

    bulkUpdateStatus: (ids: string[], status: LeadStatus) =>
      request<{ success: boolean; updatedCount: number }>('/leads/bulk-status', {
        method: 'POST',
        body: JSON.stringify({ ids, status })
      }),

    enrich: (id: string) =>
      request<LeadRecord>(`/leads/${id}/enrich`, {
        method: 'POST'
      }),

    listTags: () => request<Array<{ id: string; name: string; color: string }>>('/leads/tags'),

    createTag: (name: string, color?: string) =>
      request<{ id: string; name: string; color: string }>('/leads/tags', {
        method: 'POST',
        body: JSON.stringify({ name, color })
      }),

    tagLead: (leadId: string, tagId: string) =>
      request<{ success: boolean }>('/leads/tags/assign', {
        method: 'POST',
        body: JSON.stringify({ leadId, tagId })
      }),

    untagLead: (leadId: string, tagId: string) =>
      request<{ success: boolean }>('/leads/tags/unassign', {
        method: 'POST',
        body: JSON.stringify({ leadId, tagId })
      }),

    listNotes: (leadId: string) => request<LeadNoteItem[]>(`/leads/${leadId}/notes`),

    addNote: (leadId: string, content: string) =>
      request<LeadNoteItem>(`/leads/${leadId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ content })
      })
  },

  extractionJobs: {
    list: (limit?: number) =>
      request<ExtractionJobRecord[]>(`/extraction-jobs${limit ? `?limit=${limit}` : ''}`),

    listSources: () => request<ExtractionSourceRecord[]>('/extraction-jobs/sources/all'),

    getById: (id: string) => request<ExtractionJobRecord>(`/extraction-jobs/${id}`),

    create: (data: {
      source: string;
      keyword?: string;
      location?: string;
      requested_count?: number;
      settings?: any;
    }) =>
      request<ExtractionJobRecord>('/extraction-jobs', {
        method: 'POST',
        body: JSON.stringify(data)
      }),

    start: (id: string) =>
      request<ExtractionJobRecord>(`/extraction-jobs/${id}/start`, {
        method: 'POST'
      }),

    pause: (id: string) =>
      request<ExtractionJobRecord>(`/extraction-jobs/${id}/pause`, {
        method: 'POST'
      }),

    resume: (id: string) =>
      request<ExtractionJobRecord>(`/extraction-jobs/${id}/resume`, {
        method: 'POST'
      }),

    cancel: (id: string) =>
      request<ExtractionJobRecord>(`/extraction-jobs/${id}/cancel`, {
        method: 'POST'
      }),

    delete: (id: string) =>
      request<{ success: boolean }>(`/extraction-jobs/${id}`, {
        method: 'DELETE'
      })
  },

  extension: {
    ping: () => request<{ status: string; version: string; user: any }>('/extension/ping'),

    getToken: () => request<{ token: string; userId: string; created_at: string }>('/extension/token'),

    getProfile: () =>
      request<{
        user: {
          id: string;
          username: string;
          name: string;
          email?: string;
          role: string;
          plan_tier: string;
          subscription_status: string;
          daily_extraction_limit: number;
          leads_extracted_today: number;
          total_leads: number;
        };
      }>('/extension/profile'),

    syncBatch: (leads: Partial<LeadRecord>[], jobId?: string, source?: string) =>
      request<{
        success: boolean;
        syncedCount: number;
        duplicates: number;
        failed: number;
        remainingToday: number;
      }>('/extension/sync', {
        method: 'POST',
        body: JSON.stringify({ leads, jobId, source })
      })
  },

  wallet: {
    get: () => request<UserWallet>('/wallet'),

    transactions: (limit: number = 50) =>
      request<WalletTransaction[]>(`/wallet/transactions?limit=${limit}`),

    topUp: (amount: number, description?: string, referenceId?: string) =>
      request<{
        success: boolean;
        newBalance: number;
        transaction: WalletTransaction;
      }>('/wallet/topup', {
        method: 'POST',
        body: JSON.stringify({ amount, description, referenceId })
      }),

    adminAdjust: (targetUserId: string, amount: number, reason: string) =>
      request<{
        success: boolean;
        newBalance: number;
        transaction: WalletTransaction;
      }>('/wallet/admin/adjust', {
        method: 'POST',
        body: JSON.stringify({ targetUserId, amount, reason })
      })
  },

  marketplace: {
    listExtensions: (category?: string, search?: string) => {
      const params = new URLSearchParams();
      if (category && category !== 'all') params.append('category', category);
      if (search) params.append('search', search);
      const query = params.toString() ? `?${params.toString()}` : '';
      return request<MarketplaceExtension[]>(`/marketplace/extensions${query}`);
    },

    getExtension: (id: string) =>
      request<MarketplaceExtension>(`/marketplace/extensions/${id}`),

    listModules: (extensionId: string) =>
      request<MarketplaceModule[]>(`/marketplace/extensions/${extensionId}/modules`),

    getMyExtensions: () =>
      request<{
        activations: Array<{
          id: string;
          extension_id: string;
          status: string;
          activated_at: string;
          expires_at?: string;
          extension_name: string;
          extension_slug: string;
          category: string;
          icon?: string;
          version: string;
        }>;
        modules: Array<{
          id: string;
          module_id: string;
          extension_id: string;
          status: string;
          activated_at: string;
          expires_at?: string;
          custom_quota_override?: number;
          custom_usage_price_override?: number;
          name: string;
          slug: string;
          description: string;
          icon?: string;
          category?: string;
          usage_charging_model: string;
          usage_price: number;
          period_quota_limit: number;
          quota_period: string;
          per_job_limit: number;
        }>;
      }>('/marketplace/my-extensions'),

    activateExtension: (extensionId: string) =>
      request<{
        success: boolean;
        activation: any;
        newBalance: number;
      }>(`/marketplace/extensions/${extensionId}/activate`, {
        method: 'POST'
      }),

    activateModule: (moduleId: string) =>
      request<{
        success: boolean;
        activation: any;
        newBalance: number;
      }>(`/marketplace/modules/${moduleId}/activate`, {
        method: 'POST'
      }),

    adminCreateModule: (data: any) =>
      request<{ success: boolean; module: MarketplaceModule }>('/marketplace/admin/modules', {
        method: 'POST',
        body: JSON.stringify(data)
      }),

    adminUpdateModule: (id: string, data: any) =>
      request<{ success: boolean; module: MarketplaceModule }>(`/marketplace/admin/modules/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      }),

    adminDeleteModule: (id: string) =>
      request<{ success: boolean }>(`/marketplace/admin/modules/${id}`, {
        method: 'DELETE'
      }),

    adminSetOverride: (data: {
      userId: string;
      moduleId: string;
      quotaOverride?: number;
      priceOverride?: number;
      status?: string;
    }) =>
      request<{ success: boolean }>('/marketplace/admin/entitlements/override', {
        method: 'POST',
        body: JSON.stringify(data)
      })
  },

  virtualNumbers: {
    getCountries: () =>
      request<{ countries: VirtualNumberCountry[] }>('/virtual-numbers/countries'),

    searchNumbers: (params: {
      country?: string;
      type?: string;
      whatsapp?: boolean;
      search?: string;
      limit?: number;
      offset?: number;
    }) => {
      const query = new URLSearchParams();
      if (params.country) query.set('country', params.country);
      if (params.type) query.set('type', params.type);
      if (params.whatsapp) query.set('whatsapp', 'true');
      if (params.search) query.set('search', params.search);
      if (params.limit) query.set('limit', String(params.limit));
      if (params.offset) query.set('offset', String(params.offset));
      return request<{
        total: number;
        limit: number;
        offset: number;
        numbers: VirtualNumberItem[];
      }>(`/virtual-numbers/search?${query.toString()}`);
    },

    purchaseNumber: (data: {
      inventoryId: string;
      rentalDuration?: string;
      idempotencyKey?: string;
    }) =>
      request<{
        success: boolean;
        rentalId: string;
        orderId: string;
        phoneNumber: string;
        message: string;
      }>('/virtual-numbers/purchase', {
        method: 'POST',
        body: JSON.stringify(data)
      }),

    getMyRentals: (status?: string) => {
      const qs = status ? `?status=${encodeURIComponent(status)}` : '';
      return request<{ rentals: VirtualNumberRental[] }>(`/virtual-numbers/rentals${qs}`);
    },

    renewRental: (rentalId: string, durationDays: number = 30) =>
      request<{
        success: boolean;
        newExpiresAt: string;
        newRenewalDate: string;
        charged: number;
        newBalance: number;
      }>(`/virtual-numbers/rentals/${rentalId}/renew`, {
        method: 'POST',
        body: JSON.stringify({ durationDays })
      }),

    toggleAutoRenew: (rentalId: string, autoRenew: boolean) =>
      request<{ success: boolean; autoRenew: boolean }>(`/virtual-numbers/rentals/${rentalId}/auto-renew`, {
        method: 'PATCH',
        body: JSON.stringify({ autoRenew })
      }),

    releaseRental: (rentalId: string) =>
      request<{ success: boolean; message: string }>(`/virtual-numbers/rentals/${rentalId}/release`, {
        method: 'POST'
      }),

    getMessages: (params?: { rentalId?: string; phone?: string; limit?: number }) => {
      const query = new URLSearchParams();
      if (params?.rentalId) query.set('rentalId', params.rentalId);
      if (params?.phone) query.set('phone', params.phone);
      if (params?.limit) query.set('limit', String(params.limit));
      return request<{ messages: VirtualNumberMessage[] }>(`/virtual-numbers/messages?${query.toString()}`);
    },

    markMessageRead: (messageId: string) =>
      request<{ success: boolean }>(`/virtual-numbers/messages/${messageId}/read`, {
        method: 'PATCH'
      }),

    getCallLogs: (params?: { rentalId?: string; phone?: string; limit?: number }) => {
      const query = new URLSearchParams();
      if (params?.rentalId) query.set('rentalId', params.rentalId);
      if (params?.phone) query.set('phone', params.phone);
      if (params?.limit) query.set('limit', String(params.limit));
      return request<{ calls: VirtualNumberCall[] }>(`/virtual-numbers/calls?${query.toString()}`);
    },

    getOrderHistory: () =>
      request<{ orders: VirtualNumberOrder[] }>('/virtual-numbers/orders'),

    getAnalytics: () =>
      request<{ analytics: VirtualNumberAnalytics }>('/virtual-numbers/analytics'),

    // --- Admin Virtual Numbers API ---
    getAdminOverview: () =>
      request<{ overview: any }>('/virtual-numbers/admin/overview'),

    getAdminProviders: () =>
      request<{ providers: VirtualNumberProviderRecord[] }>('/virtual-numbers/admin/providers'),

    saveAdminProvider: (data: any) =>
      request<{ success: boolean; id: string }>('/virtual-numbers/admin/providers', {
        method: 'POST',
        body: JSON.stringify(data)
      }),

    getAdminInventory: (params?: { country?: string; status?: string; limit?: number; offset?: number }) => {
      const query = new URLSearchParams();
      if (params?.country) query.set('country', params.country);
      if (params?.status) query.set('status', params.status);
      if (params?.limit) query.set('limit', String(params.limit));
      if (params?.offset) query.set('offset', String(params.offset));
      return request<{ total: number; rows: any[] }>(`/virtual-numbers/admin/inventory?${query.toString()}`);
    },

    addAdminInventory: (data: any) =>
      request<{ success: boolean; id: string }>('/virtual-numbers/admin/inventory', {
        method: 'POST',
        body: JSON.stringify(data)
      }),

    getAdminPricing: () =>
      request<{ rules: VirtualNumberPricingRule[] }>('/virtual-numbers/admin/pricing'),

    saveAdminPricing: (data: any) =>
      request<{ success: boolean; id: string }>('/virtual-numbers/admin/pricing', {
        method: 'POST',
        body: JSON.stringify(data)
      }),

    getAdminRentals: (params?: { status?: string; search?: string; limit?: number; offset?: number }) => {
      const query = new URLSearchParams();
      if (params?.status) query.set('status', params.status);
      if (params?.search) query.set('search', params.search);
      if (params?.limit) query.set('limit', String(params.limit));
      if (params?.offset) query.set('offset', String(params.offset));
      return request<{ total: number; rows: any[] }>(`/virtual-numbers/admin/rentals?${query.toString()}`);
    },

    refundAdminOrder: (orderId: string, reason: string) =>
      request<{ success: boolean; refundedAmount: number; newBalance: number }>(`/virtual-numbers/admin/orders/${orderId}/refund`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      })
  },

  fiveSim: {
    getConfig: () =>
      request<{ success: boolean; config: FiveSimConfig | null }>('/fivesim/config'),

    updateConfig: (data: {
      apiKey?: string;
      baseUrl?: string;
      isEnabled?: boolean;
      autoSync?: boolean;
      maxRequestsPerSec?: number;
    }) =>
      request<{ success: boolean; message: string; config: FiveSimConfig }>('/fivesim/config', {
        method: 'POST',
        body: JSON.stringify(data)
      }),

    testConnection: (apiKey?: string) =>
      request<{ success: boolean; profile?: FiveSimProfile; latencyMs: number; message: string }>('/fivesim/test-connection', {
        method: 'POST',
        body: JSON.stringify({ apiKey })
      }),

    getProfile: () =>
      request<{ success: boolean; profile: FiveSimProfile }>('/fivesim/profile'),

    getOrders: (params: {
      category?: 'activation' | 'hosting';
      source?: 'live' | 'cached';
      limit?: number;
      offset?: number;
      search?: string;
      status?: string;
      order?: string;
      reverse?: boolean;
    }) => {
      const query = new URLSearchParams();
      if (params.category) query.set('category', params.category);
      if (params.source) query.set('source', params.source);
      if (params.limit) query.set('limit', String(params.limit));
      if (params.offset) query.set('offset', String(params.offset));
      if (params.search) query.set('search', params.search);
      if (params.status) query.set('status', params.status);
      if (params.order) query.set('order', params.order);
      if (params.reverse !== undefined) query.set('reverse', String(params.reverse));
      return request<{
        success: boolean;
        source: 'live' | 'cached';
        total: number;
        orders: FiveSimOrderItem[];
        productNames?: string[];
        statuses?: string[];
      }>(`/fivesim/orders?${query.toString()}`);
    },

    getPayments: (params?: {
      source?: 'live' | 'cached';
      limit?: number;
      offset?: number;
      order?: string;
      reverse?: boolean;
    }) => {
      const query = new URLSearchParams();
      if (params?.source) query.set('source', params.source);
      if (params?.limit) query.set('limit', String(params.limit));
      if (params?.offset) query.set('offset', String(params.offset));
      if (params?.order) query.set('order', params.order);
      if (params?.reverse !== undefined) query.set('reverse', String(params.reverse));
      return request<{
        success: boolean;
        source: 'live' | 'cached';
        total: number;
        payments: FiveSimPaymentItem[];
      }>(`/fivesim/payments?${query.toString()}`);
    },

    getMaxPrices: (source?: 'live' | 'cached') => {
      const qs = source ? `?source=${source}` : '';
      return request<{ success: boolean; source: string; maxPrices: FiveSimMaxPriceItem[] }>(`/fivesim/max-prices${qs}`);
    },

    setMaxPrice: (data: { product: string; price: number }) =>
      request<{ success: boolean; message: string; item: FiveSimMaxPriceItem }>('/fivesim/max-prices', {
        method: 'POST',
        body: JSON.stringify(data)
      }),

    deleteMaxPrice: (product: string) =>
      request<{ success: boolean; message: string; product: string }>(`/fivesim/max-prices?product=${encodeURIComponent(product)}`, {
        method: 'DELETE'
      }),

    syncAll: () =>
      request<{
        success: boolean;
        message: string;
        summary: {
          balance: number;
          rating: number;
          activationsCount: number;
          hostingCount: number;
          paymentsCount: number;
          maxPricesCount: number;
          syncedAt: string;
        };
      }>('/fivesim/sync', { method: 'POST' }),

    // --- Part 4: Guest Products & Prices ---
    getGuestCountries: (refresh?: boolean) => {
      const qs = refresh ? '?refresh=true' : '';
      return request<{ success: boolean; countries: Record<string, any> }>(`/fivesim/guest/countries${qs}`);
    },

    getGuestProducts: (country = 'any', operator = 'any') =>
      request<{ success: boolean; products: FiveSimProductsMap }>(`/fivesim/guest/products/${encodeURIComponent(country)}/${encodeURIComponent(operator)}`),

    getGuestPrices: (params?: { country?: string; product?: string }) => {
      const query = new URLSearchParams();
      if (params?.country) query.set('country', params.country);
      if (params?.product) query.set('product', params.product);
      return request<{ success: boolean; prices: any }>(`/fivesim/guest/prices?${query.toString()}`);
    },

    getBestOperator: (country = 'any', product = 'whatsapp') => {
      const query = new URLSearchParams();
      query.set('country', country);
      query.set('product', product);
      return request<{
        success: boolean;
        operators: BestOperatorRecommendation[];
        recommended: BestOperatorRecommendation | null;
      }>(`/fivesim/guest/best-operator?${query.toString()}`);
    },

    // --- Part 5: Purchase Flows ---
    buyActivation: (data: BuyActivationParams) =>
      request<{ success: boolean; message: string; order: FiveSimOrderItem }>('/fivesim/buy/activation', {
        method: 'POST',
        body: JSON.stringify(data)
      }),

    buyHosting: (data: { country?: string; operator?: string; product?: string }) =>
      request<{ success: boolean; message: string; order: FiveSimOrderItem }>('/fivesim/buy/hosting', {
        method: 'POST',
        body: JSON.stringify(data)
      }),

    reuseNumber: (data: { product: string; number: string }) =>
      request<{ success: boolean; message: string; order: FiveSimOrderItem }>('/fivesim/buy/reuse', {
        method: 'POST',
        body: JSON.stringify(data)
      }),

    // --- Part 6: Order Management & SMS ---
    checkOrder: (id: number | string) =>
      request<{ success: boolean; order: FiveSimOrderItem }>(`/fivesim/orders/${id}/check`),

    finishOrder: (id: number | string) =>
      request<{ success: boolean; message: string; order: FiveSimOrderItem }>(`/fivesim/orders/${id}/finish`, {
        method: 'POST'
      }),

    cancelOrder: (id: number | string) =>
      request<{ success: boolean; message: string; order: FiveSimOrderItem }>(`/fivesim/orders/${id}/cancel`, {
        method: 'POST'
      }),

    banOrder: (id: number | string) =>
      request<{ success: boolean; message: string; order: FiveSimOrderItem }>(`/fivesim/orders/${id}/ban`, {
        method: 'POST'
      }),

    getHostingInbox: (id: number | string) =>
      request<{ success: boolean; total: number; messages: FiveSimHostingSmsItem[] }>(`/fivesim/orders/${id}/inbox`),

    // --- Part 7: Flash Notifications ---
    getFlash: (lang = 'en') =>
      request<{ success: boolean; flash: FiveSimFlashNotification }>(`/fivesim/flash/${encodeURIComponent(lang)}`),

    // --- Part 8: Vendor API ---
    getVendorStats: () =>
      request<{ success: boolean; stats: FiveSimProfile }>('/fivesim/vendor/stats'),

    getVendorWallets: () =>
      request<{ success: boolean; wallets: FiveSimVendorWallets }>('/fivesim/vendor/wallets'),

    getVendorOrders: (params?: {
      category?: 'activation' | 'hosting';
      limit?: number;
      offset?: number;
      order?: string;
      reverse?: boolean;
    }) => {
      const query = new URLSearchParams();
      if (params?.category) query.set('category', params.category);
      if (params?.limit) query.set('limit', String(params.limit));
      if (params?.offset) query.set('offset', String(params.offset));
      if (params?.order) query.set('order', params.order);
      if (params?.reverse !== undefined) query.set('reverse', String(params.reverse));
      return request<{ success: boolean; orders: any }>(`/fivesim/vendor/orders?${query.toString()}`);
    },

    getVendorPayments: (params?: {
      limit?: number;
      offset?: number;
      order?: string;
      reverse?: boolean;
    }) => {
      const query = new URLSearchParams();
      if (params?.limit) query.set('limit', String(params.limit));
      if (params?.offset) query.set('offset', String(params.offset));
      if (params?.order) query.set('order', params.order);
      if (params?.reverse !== undefined) query.set('reverse', String(params.reverse));
      return request<{ success: boolean; payments: any }>(`/fivesim/vendor/payments?${query.toString()}`);
    },

    requestVendorWithdraw: (data: FiveSimVendorWithdrawParams) =>
      request<{ success: boolean; message: string; result: any }>('/fivesim/vendor/withdraw', {
        method: 'POST',
        body: JSON.stringify(data)
      }),

    getVendorPrices: (params?: {
      source?: 'live' | 'cached';
      country?: string;
      product?: string;
      operator?: string;
      enabled?: boolean;
      page?: number;
      perPage?: number;
      limit?: number;
      offset?: number;
      sortDir?: string;
      sortField?: string;
      filters?: any;
    }) => {
      const query = new URLSearchParams();
      if (params?.source) query.set('source', params.source);
      if (params?.country) query.set('country', params.country);
      if (params?.product) query.set('product', params.product);
      if (params?.operator) query.set('operator', params.operator);
      if (params?.enabled !== undefined) query.set('enabled', String(params.enabled));
      if (params?.page !== undefined) query.set('page', String(params.page));
      if (params?.perPage !== undefined) query.set('perPage', String(params.perPage));
      if (params?.limit !== undefined) query.set('limit', String(params.limit));
      if (params?.offset !== undefined) query.set('offset', String(params.offset));
      if (params?.sortDir) query.set('sortDir', params.sortDir);
      if (params?.sortField) query.set('sortField', params.sortField);
      if (params?.filters) query.set('filters', JSON.stringify(params.filters));
      return request<{
        success: boolean;
        source: 'live' | 'cached';
        total?: number;
        prices?: FiveSimVendorPriceItem[];
        data?: FiveSimVendorPricesResponse;
      }>(`/fivesim/vendor/prices?${query.toString()}`);
    },

    createVendorPrice: (data: { Price: number; ProductName: string; CountryName: string; OperatorName: string }) =>
      request<{ success: boolean; message: string; result: any }>('/fivesim/vendor/prices', {
        method: 'PUT',
        body: JSON.stringify(data)
      }),

    updateVendorPrice: (data: { Price: number; Product: string; Country: string; Operator: string }) =>
      request<{ success: boolean; message: string; result: any }>('/fivesim/vendor/prices', {
        method: 'POST',
        body: JSON.stringify(data)
      }),

    toggleVendorPrice: (data: { Disable: boolean; List?: number[] }) =>
      request<{ success: boolean; message: string; result: any }>('/fivesim/vendor/prices/disable', {
        method: 'POST',
        body: JSON.stringify(data)
      }),

    // --- Part 9: Reference Catalog ---
    getReferenceCountries: () =>
      request<{ success: boolean; count: number; countries: FiveSimSpecialCountryMapping[] }>('/fivesim/reference/countries'),

    getReferenceProducts: (params?: { category?: string; search?: string }) => {
      const query = new URLSearchParams();
      if (params?.category) query.set('category', params.category);
      if (params?.search) query.set('search', params.search);
      return request<{ success: boolean; count: number; products: FiveSimSpecialProductMapping[] }>(`/fivesim/reference/products?${query.toString()}`);
    },

    resolveReference: (queryText: string, type: 'product' | 'country' = 'product') => {
      const query = new URLSearchParams();
      query.set('query', queryText);
      query.set('type', type);
      return request<{ success: boolean; query: string; resolvedSlug: string }>(`/fivesim/reference/resolve?${query.toString()}`);
    },

    // --- Part 10: 10-Point System Diagnostics ---
    getDiagnostics: () =>
      request<{ success: boolean; report: FiveSimDiagnosticsReport }>('/fivesim/diagnostics')
  },

  // =========================================================================
  // USER: LIVE VIRTUAL NUMBER PURCHASE & OTP (5SIM + MARGIN ENGINE)
  // =========================================================================
  numbers: {
    getCountries: () =>
      request<{ success: boolean; count: number; countries: NumberCountry[] }>('/numbers/countries'),

    getProducts: (country = 'any') => {
      const q = new URLSearchParams({ country });
      return request<{ success: boolean; count: number; products: NumberProduct[] }>(`/numbers/products?${q.toString()}`);
    },

    getPrices: (country: string, product: string, currency?: string) => {
      const q = new URLSearchParams({ country, product });
      if (currency) q.set('currency', currency);
      return request<{
        success: boolean;
        country: string;
        product: string;
        currency: string;
        currency_symbol?: string;
        operators: NumberOperatorRate[];
        bestOperator: NumberOperatorRate | null;
      }>(`/numbers/prices?${q.toString()}`);
    },

    buyNumber: (data: { country: string; operator?: string; product: string; idempotencyKey?: string }) =>
      request<{ success: boolean; message: string; order: NumberOrder }>('/numbers/buy', {
        method: 'POST',
        body: JSON.stringify(data)
      }),

    getOrder: (orderId: string) =>
      request<{ success: boolean; order: NumberOrder }>(`/numbers/orders/${orderId}`),

    cancelOrder: (orderId: string) =>
      request<{ success: boolean; message: string; order: NumberOrder }>(`/numbers/orders/${orderId}/cancel`, {
        method: 'POST'
      }),

    finishOrder: (orderId: string) =>
      request<{ success: boolean; message: string; order: NumberOrder }>(`/numbers/orders/${orderId}/finish`, {
        method: 'POST'
      }),

    banOrder: (orderId: string) =>
      request<{ success: boolean; message: string; order: NumberOrder }>(`/numbers/orders/${orderId}/ban`, {
        method: 'POST'
      }),

    getUserOrders: (params?: { limit?: number; offset?: number; status?: string }) => {
      const q = new URLSearchParams();
      if (params?.limit) q.set('limit', String(params.limit));
      if (params?.offset) q.set('offset', String(params.offset));
      if (params?.status) q.set('status', params.status);
      return request<{ success: boolean; total: number; orders: NumberOrder[] }>(`/numbers/orders?${q.toString()}`);
    }
  },

  // =========================================================================
  // ADMIN: MARGIN RULES, PRICING SETTINGS & PROFIT ANALYTICS
  // =========================================================================
  margin: {
    getRules: (params?: { scope?: string; enabled?: boolean }) => {
      const q = new URLSearchParams();
      if (params?.scope) q.set('scope', params.scope);
      if (params?.enabled !== undefined) q.set('enabled', String(params.enabled));
      return request<{ success: boolean; count: number; rules: MarginRule[] }>(`/admin/margin/rules?${q.toString()}`);
    },

    createRule: (data: {
      scope: 'global' | 'country' | 'product' | 'country_product' | 'country_product_operator';
      country?: string | null;
      product?: string | null;
      operator?: string | null;
      type: 'percent' | 'fixed' | 'percent_plus_fixed';
      percent_value?: number;
      fixed_value?: number;
      enabled?: boolean;
    }) =>
      request<{ success: boolean; rule: MarginRule }>('/admin/margin/rules', {
        method: 'POST',
        body: JSON.stringify(data)
      }),

    updateRule: (
      id: string,
      data: {
        scope?: 'global' | 'country' | 'product' | 'country_product' | 'country_product_operator';
        country?: string | null;
        product?: string | null;
        operator?: string | null;
        type?: 'percent' | 'fixed' | 'percent_plus_fixed';
        percent_value?: number;
        fixed_value?: number;
        enabled?: boolean;
      }
    ) =>
      request<{ success: boolean; rule: MarginRule }>(`/admin/margin/rules/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      }),

    deleteRule: (id: string) =>
      request<{ success: boolean; message: string }>(`/admin/margin/rules/${id}`, {
        method: 'DELETE'
      }),

    getSettings: () =>
      request<{ success: boolean; settings: PricingSettings }>('/admin/margin/settings'),

    updateSettings: (data: Partial<PricingSettings>) =>
      request<{ success: boolean; settings: PricingSettings }>('/admin/margin/settings', {
        method: 'PUT',
        body: JSON.stringify(data)
      }),

    pricePreview: (data: { cost: number; country?: string; product?: string; operator?: string }) =>
      request<{ success: boolean; preview: any }>('/admin/margin/price-preview', {
        method: 'POST',
        body: JSON.stringify(data)
      }),

    getOrders: (params?: { limit?: number; offset?: number; status?: string; country?: string; product?: string; userId?: string }) => {
      const q = new URLSearchParams();
      if (params?.limit) q.set('limit', String(params.limit));
      if (params?.offset) q.set('offset', String(params.offset));
      if (params?.status) q.set('status', params.status);
      if (params?.country) q.set('country', params.country);
      if (params?.product) q.set('product', params.product);
      if (params?.userId) q.set('userId', params.userId);
      return request<{ success: boolean; total: number; orders: NumberOrder[] }>(`/admin/margin/orders?${q.toString()}`);
    },

    getProfitReport: (period: 'daily' | 'weekly' | 'monthly' = 'daily') =>
      request<{ success: boolean; report: ProfitReport }>(`/admin/margin/profit-report?period=${period}`),

    getFiveSimBalance: () =>
      request<{ success: boolean; profile: FiveSimProfile; isLowBalance: boolean; lowBalanceThreshold: number }>('/admin/margin/fivesim-balance'),

    getHiddenItems: () =>
      request<{ success: boolean; count: number; items: HiddenItem[] }>('/admin/margin/hidden-items'),

    addHiddenItem: (type: 'country' | 'product', value: string) =>
      request<{ success: boolean; item: HiddenItem }>('/admin/margin/hidden-items', {
        method: 'POST',
        body: JSON.stringify({ type, value })
      }),

    removeHiddenItem: (id: string) =>
      request<{ success: boolean; message: string }>(`/admin/margin/hidden-items/${id}`, {
        method: 'DELETE'
      })
  },

  // =========================================================================
  // MULTI-CURRENCY CONVERSION SYSTEM (USER & ADMIN)
  // =========================================================================
  currency: {
    list: () =>
      request<{ success: boolean; count: number; currencies: CurrencyRecord[] }>('/currency/list'),

    getUserCurrency: () =>
      request<{ success: boolean; currency: string; symbol: string; balance: number }>('/currency/user'),

    switch: (currency: string) =>
      request<{
        success: boolean;
        message: string;
        oldCurrency: string;
        newCurrency: string;
        oldBalance: number;
        newBalance: number;
        rate: number;
      }>('/currency/switch', {
        method: 'POST',
        body: JSON.stringify({ currency })
      }),

    admin: {
      getAll: () =>
        request<{ success: boolean; count: number; currencies: CurrencyRecord[] }>('/admin/currency'),

      add: (data: {
        code: string;
        name: string;
        symbol: string;
        rate_from_5sim_base: number;
        is_default?: boolean;
        is_active?: boolean;
      }) =>
        request<{ success: boolean; message: string; currency: CurrencyRecord }>('/admin/currency', {
          method: 'POST',
          body: JSON.stringify(data)
        }),

      update: (
        code: string,
        data: Partial<{
          name: string;
          symbol: string;
          rate_from_5sim_base: number;
          is_default: boolean;
          is_active: boolean;
        }>
      ) =>
        request<{ success: boolean; message: string; currency: CurrencyRecord }>(`/admin/currency/${code}`, {
          method: 'PUT',
          body: JSON.stringify(data)
        }),

      delete: (code: string) =>
        request<{ success: boolean; message: string }>(`/admin/currency/${code}`, {
          method: 'DELETE'
        })
    }
  },

  commissions: {
    list: () =>
      request<{ success: boolean; count: number; rules: CustomCommissionRule[] }>('/commissions'),

    getProductTypes: () =>
      request<{ success: boolean; productTypes: string[] }>('/commissions/products'),

    create: (data: Partial<CustomCommissionRule>) =>
      request<{ success: boolean; message: string; rule: CustomCommissionRule }>('/commissions', {
        method: 'POST',
        body: JSON.stringify(data)
      }),

    update: (id: string, data: Partial<CustomCommissionRule>) =>
      request<{ success: boolean; message: string; rule: CustomCommissionRule }>(`/commissions/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      }),

    delete: (id: string) =>
      request<{ success: boolean; message: string }>(`/commissions/${id}`, {
        method: 'DELETE'
      }),

    calculate: (data: { basePrice: number; product_type?: string; user_id?: string; role?: string }) =>
      request<{
        success: boolean;
        result: {
          basePrice: number;
          commission: number;
          sellPrice: number;
          profitMarginPercent: number;
          ruleUsed: any;
        };
      }>('/commissions/calculate', {
        method: 'POST',
        body: JSON.stringify(data)
      })
  },

  // =========================================================================
  // DATA EXTRACTION MARKETPLACE
  // =========================================================================
  dataMarketplace: {
    listProducts: (category?: string) => {
      const qs = category && category !== 'All' ? `?category=${encodeURIComponent(category)}` : '';
      return request<{ success: boolean; products: any[] }>(`/marketplace/products${qs}`);
    },

    getProduct: (slug: string) =>
      request<{ success: boolean; product: any }>(`/marketplace/products/${slug}`),

    estimatePrice: (slug: string, items: number, currency?: string) =>
      request<{ success: boolean; sellPrice: number; currency: string; minChargeApplied: boolean; requestedItems: number }>('/marketplace/estimate', {
        method: 'POST',
        body: JSON.stringify({ slug, items, currency })
      }),

    createQuote: (slug: string, requestedItems: number, currency?: string) =>
      request<{ success: boolean; quote: any }>('/marketplace/quote', {
        method: 'POST',
        body: JSON.stringify({ slug, requestedItems, currency })
      }),

    listUserPresets: (slug: string) =>
      request<{ success: boolean; presets: any[] }>(`/marketplace/products/${slug}/presets`),

    saveUserPreset: (slug: string, name: string, inputData: Record<string, any>, presetId?: string) =>
      request<{ success: boolean; preset: any }>(`/marketplace/products/${slug}/presets`, {
        method: 'POST',
        body: JSON.stringify({ name, inputData, presetId })
      }),

    deleteUserPreset: (presetId: string) =>
      request<{ success: boolean }>(`/marketplace/presets/${presetId}`, {
        method: 'DELETE'
      }),

    createJob: (productSlug: string, inputValues: Record<string, any>, requestedItems: number, currency?: string) =>
      request<{ success: boolean; job: any }>('/marketplace/jobs', {
        method: 'POST',
        body: JSON.stringify({ productSlug, inputValues, requestedItems, currency })
      }),

    listUserJobs: (params?: { status?: string; limit?: number; offset?: number }) => {
      const query = new URLSearchParams();
      if (params?.status) query.set('status', params.status);
      if (params?.limit) query.set('limit', String(params.limit));
      if (params?.offset) query.set('offset', String(params.offset));
      return request<{ success: boolean; jobs: any[]; total: number }>(`/marketplace/jobs?${query.toString()}`);
    },

    getJob: (id: string) =>
      request<{ success: boolean; job: any }>(`/marketplace/jobs/${id}`),

    getJobResults: (id: string, params?: { page?: number; limit?: number }) => {
      const query = new URLSearchParams();
      if (params?.page) query.set('page', String(params.page));
      if (params?.limit) query.set('limit', String(params.limit));
      return request<{ success: boolean; items: any[]; total: number; page: number; limit: number }>(
        `/marketplace/jobs/${id}/results?${query.toString()}`
      );
    },

    getExportUrl: (jobId: string, format: string) => {
      const token = getAuthToken() || '';
      return `${API_BASE}/marketplace/jobs/${jobId}/export?format=${format}&token=${encodeURIComponent(token)}`;
    },

    listJobFiles: (jobId: string) =>
      request<{ success: boolean; files: any[] }>(`/marketplace/jobs/${jobId}/files`),

    getFileDownloadUrl: (fileId: string, token: string) =>
      `${API_BASE}/marketplace/files/${fileId}/download?token=${encodeURIComponent(token)}`,

    getCurrencyMatrix: (slug: string) =>
      request<{ success: boolean; matrix: Record<string, Record<number, number>> }>(`/marketplace/products/${slug}/currency-matrix`),

    parseBulkInput: (text: string, mode?: 'string' | 'url', maxLimit?: number) =>
      request<{ success: boolean; items: string[]; duplicatesRemoved: number; invalidRows: any[]; totalParsed: number }>('/marketplace/parse-bulk-input', {
        method: 'POST',
        body: JSON.stringify({ text, mode: mode || 'string', maxLimit })
      }),

    abortJob: (jobId: string) =>
      request<{ success: boolean; message: string }>(`/marketplace/jobs/${jobId}/abort`, {
        method: 'POST'
      }),

    adminListProducts: () =>
      request<{ success: boolean; products: any[] }>('/marketplace/admin/products'),

    adminSaveProduct: (product: any, changelog?: string) =>
      request<{ success: boolean; message: string; product: any }>('/marketplace/admin/products', {
        method: 'POST',
        body: JSON.stringify({ product, changelog })
      }),

    adminImportProvider: (providerType: string, actorIdOrUrl: string) =>
      request<{ success: boolean; product: any }>('/marketplace/admin/import-provider', {
        method: 'POST',
        body: JSON.stringify({ providerType, actorIdOrUrl, actorId: actorIdOrUrl })
      }),

    adminBulkImport: (links: string[], providerType?: string) =>
      request<{ success: boolean; drafts: any[]; existing: string[]; errors: any[] }>('/marketplace/admin/bulk-import', {
        method: 'POST',
        body: JSON.stringify({ links, providerType: providerType || 'apify' })
      }),

    adminCheckDrift: (slug: string) =>
      request<{ success: boolean; drift: any }>(`/marketplace/admin/products/${slug}/drift`, {
        method: 'POST'
      }),

    adminUpdateWizardGate: (slug: string, gateKey: string, value: boolean) =>
      request<{ success: boolean; product: any }>(`/marketplace/admin/products/${slug}/gates`, {
        method: 'POST',
        body: JSON.stringify({ gateKey, value })
      }),

    adminOverrideClassification: (slug: string, classification: string, reason: string) =>
      request<{ success: boolean; product: any }>(`/marketplace/admin/products/${slug}/override-classification`, {
        method: 'POST',
        body: JSON.stringify({ classification, reason })
      }),

    adminDuplicateProduct: (slug: string) =>
      request<{ success: boolean; product: any }>(`/marketplace/admin/products/${slug}/duplicate`, {
        method: 'POST'
      }),

    adminDeleteProduct: (slug: string) =>
      request<{ success: boolean }>(`/marketplace/admin/products/${slug}`, {
        method: 'DELETE'
      }),

    adminTestRun: (slug: string, inputValues?: any) =>
      request<{ success: boolean; job: any; message?: string }>(`/marketplace/admin/products/${slug}/test-run`, {
        method: 'POST',
        body: JSON.stringify({ input: inputValues })
      }),

    adminListJobs: (params?: any) => {
      const query = new URLSearchParams(params || {});
      return request<{ success: boolean; jobs: any[]; total: number }>(`/marketplace/admin/jobs?${query.toString()}`);
    },

    adminFinanceStats: () =>
      request<{ success: boolean; stats: any }>('/marketplace/admin/finance'),

    adminProviderHealth: () =>
      request<{ success: boolean; health: any }>('/marketplace/admin/provider-health'),

    adminGetSettings: () =>
      request<{ success: boolean; settings: Record<string, string> }>('/marketplace/admin/settings'),

    adminUpdateSettings: (settings: Record<string, string>) =>
      request<{ success: boolean }>('/marketplace/admin/settings', {
        method: 'POST',
        body: JSON.stringify({ settings })
      }),

    adminTestProviderAuth: (token?: string) =>
      request<{ success: boolean; username?: string; email?: string; error?: string }>('/marketplace/admin/test-provider-auth', {
        method: 'POST',
        body: JSON.stringify({ token })
      })
  }
};
