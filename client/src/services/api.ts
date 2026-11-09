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
  ResellerStats
} from '../types';

const LIVE_BACKEND_URL = 'https://taken-rough-hydrocodone-empirical.trycloudflare.com';

const getApiBase = (): string => {
  const envUrl = ((import.meta as any).env?.VITE_API_URL as string)?.trim();
  if (envUrl) {
    const clean = envUrl.replace(/\/+$/, '');
    return clean.endsWith('/api') ? clean : `${clean}/api`;
  }
  // In production (e.g. Vercel deployment), point directly to the live Cloudflare HTTPS tunnel
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return `${LIVE_BACKEND_URL}/api`;
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
      })
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
  }
};

