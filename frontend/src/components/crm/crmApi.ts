import { getAuthToken } from '../../services/api';

const getApiBase = (): string => {
  const envUrl = ((import.meta as any).env?.VITE_API_URL as string)?.trim();
  if (envUrl) {
    const clean = envUrl.replace(/\/+$/, '');
    return clean.endsWith('/api') ? clean : `${clean}/api`;
  }
  return '/api';
};

const API_BASE = getApiBase();

async function crmRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
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

export interface CrmContact {
  id: string;
  workspace_id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  email_normalized?: string;
  phone?: string;
  phone_e164?: string;
  company_id?: string;
  company_name?: string;
  title?: string;
  country?: string;
  city?: string;
  source: string;
  lead_score: number;
  status: 'lead' | 'prospect' | 'customer' | 'churned' | 'unqualified';
  custom_fields: Record<string, any>;
  email_status: 'valid' | 'invalid' | 'risky' | 'unknown';
  verified_at?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  tags?: { id: string; name: string; color: string }[];
}

export interface CrmList {
  id: string;
  workspace_id: string;
  name: string;
  description?: string;
  is_dynamic: boolean;
  filter_definition?: any;
  cached_count: number;
  last_counted_at?: string;
  created_at: string;
}

export interface CrmCompany {
  id: string;
  workspace_id: string;
  name: string;
  domain?: string;
  industry?: string;
  size?: string;
  created_at: string;
}

export interface CrmTag {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface CrmCustomFieldDefinition {
  id: string;
  workspace_id: string;
  field_name: string;
  field_label: string;
  data_type: 'text' | 'number' | 'date' | 'boolean' | 'dropdown' | 'multi_select';
  options?: string[];
  is_required: boolean;
}

export interface CrmActivity {
  id: string;
  workspace_id: string;
  contact_id: string;
  user_id?: string;
  type: 'note' | 'call' | 'email' | 'meeting' | 'whatsapp' | 'status_change';
  title: string;
  details: Record<string, any>;
  created_at: string;
}

export interface CrmImportJob {
  id: string;
  workspace_id: string;
  file_name: string;
  total_rows: number;
  processed_rows: number;
  created_rows: number;
  updated_rows: number;
  skipped_rows: number;
  error_rows: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message?: string;
  created_at: string;
}

export interface CrmExportJob {
  id: string;
  workspace_id: string;
  format: 'csv' | 'xlsx' | 'json';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  file_path?: string;
  total_records: number;
  error_message?: string;
  created_at: string;
}

export interface CrmSuppressionItem {
  id: string;
  workspace_id: string;
  identifier_type: 'email' | 'phone';
  identifier_value: string;
  reason?: string;
  created_at: string;
}

export interface CrmApiKey {
  id: string;
  workspace_id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  is_test: boolean;
  rate_limit_per_minute: number;
  monthly_quota: number;
  usage_count: number;
  is_revoked: boolean;
  created_at: string;
}

export interface CrmWebhook {
  id: string;
  workspace_id: string;
  url: string;
  secret: string;
  events: string[];
  is_active: boolean;
  failure_count: number;
  created_at: string;
}

export interface CrmWebhookDelivery {
  id: string;
  webhook_id: string;
  event: string;
  response_status?: number;
  attempts: number;
  success: boolean;
  created_at: string;
}

export interface ContactListQuery {
  limit?: number;
  cursor?: string;
  direction?: 'next' | 'prev';
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  search?: string;
  list_id?: string;
  tag_id?: string;
  status?: string;
  email_status?: string;
  filter_definition?: any;
}

export const crmApi = {
  // CONTACTS
  fetchContacts: (query: ContactListQuery = {}) => {
    const params = new URLSearchParams();
    if (query.limit) params.set('limit', String(query.limit));
    if (query.cursor) params.set('cursor', query.cursor);
    if (query.direction) params.set('direction', query.direction);
    if (query.sort_by) params.set('sort_by', query.sort_by);
    if (query.sort_order) params.set('sort_order', query.sort_order);
    if (query.search) params.set('search', query.search);
    if (query.list_id) params.set('list_id', query.list_id);
    if (query.tag_id) params.set('tag_id', query.tag_id);
    if (query.status) params.set('status', query.status);
    if (query.email_status) params.set('email_status', query.email_status);
    if (query.filter_definition) params.set('filter_definition', JSON.stringify(query.filter_definition));

    return crmRequest<{
      success: boolean;
      contacts: CrmContact[];
      next_cursor: string | null;
      prev_cursor: string | null;
      has_more: boolean;
      total_approx: number;
    }>(`/crm/contacts?${params.toString()}`);
  },

  getContact: (id: string) =>
    crmRequest<{ success: boolean; contact: CrmContact; activities: CrmActivity[] }>(`/crm/contacts/${id}`),

  createContact: (data: Partial<CrmContact>) =>
    crmRequest<{ success: boolean; contact: CrmContact }>('/crm/contacts', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  updateContact: (id: string, data: Partial<CrmContact>) =>
    crmRequest<{ success: boolean; contact: CrmContact }>(`/crm/contacts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),

  deleteContact: (id: string, permanent: boolean = false) =>
    crmRequest<{ success: boolean; message: string }>(`/crm/contacts/${id}?permanent=${permanent}`, {
      method: 'DELETE'
    }),

  restoreContact: (id: string) =>
    crmRequest<{ success: boolean; message: string }>(`/crm/contacts/${id}/restore`, {
      method: 'POST'
    }),

  bulkUpdate: (contactIds: string[], updates: Partial<CrmContact>, addTagIds?: string[], removeTagIds?: string[]) =>
    crmRequest<{ success: boolean; updated_count: number }>('/crm/contacts/bulk/update', {
      method: 'POST',
      body: JSON.stringify({ contact_ids: contactIds, updates, add_tag_ids: addTagIds, remove_tag_ids: removeTagIds })
    }),

  bulkDelete: (contactIds: string[], permanent: boolean = false) =>
    crmRequest<{ success: boolean; deleted_count: number }>('/crm/contacts/bulk/delete', {
      method: 'POST',
      body: JSON.stringify({ contact_ids: contactIds, permanent })
    }),

  // DEDUPE & MERGE
  findDuplicates: (field: 'email' | 'phone' = 'email', limit: number = 20) =>
    crmRequest<{
      success: boolean;
      duplicate_groups: Array<{
        group_key: string;
        field: string;
        count: number;
        contacts: CrmContact[];
      }>;
    }>(`/crm/duplicates?field=${field}&limit=${limit}`),

  mergeContacts: (primaryContactId: string, duplicateContactId: string, fieldOverrides: Partial<CrmContact>) =>
    crmRequest<{ success: boolean; merged_contact: CrmContact }>('/crm/duplicates/merge', {
      method: 'POST',
      body: JSON.stringify({
        primary_contact_id: primaryContactId,
        duplicate_contact_id: duplicateContactId,
        field_overrides: fieldOverrides
      })
    }),

  // LISTS & SEGMENTS
  listLists: () =>
    crmRequest<{ success: boolean; lists: CrmList[] }>('/crm/lists'),

  createList: (data: { name: string; description?: string; is_dynamic?: boolean; filter_definition?: any }) =>
    crmRequest<{ success: boolean; list: CrmList }>('/crm/lists', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  updateList: (id: string, data: Partial<CrmList>) =>
    crmRequest<{ success: boolean; list: CrmList }>(`/crm/lists/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),

  deleteList: (id: string) =>
    crmRequest<{ success: boolean; message: string }>(`/crm/lists/${id}`, {
      method: 'DELETE'
    }),

  refreshListCount: (id: string) =>
    crmRequest<{ success: boolean; count: number }>(`/crm/lists/${id}/refresh-count`, {
      method: 'POST'
    }),

  addContactsToList: (listId: string, contactIds: string[]) =>
    crmRequest<{ success: boolean; added_count: number }>(`/crm/lists/${listId}/members`, {
      method: 'POST',
      body: JSON.stringify({ contact_ids: contactIds })
    }),

  removeContactsFromList: (listId: string, contactIds: string[]) =>
    crmRequest<{ success: boolean; removed_count: number }>(`/crm/lists/${listId}/members`, {
      method: 'DELETE',
      body: JSON.stringify({ contact_ids: contactIds })
    }),

  // TAGS
  listTags: () =>
    crmRequest<{ success: boolean; tags: CrmTag[] }>('/crm/tags'),

  createTag: (name: string, color: string = '#3b82f6') =>
    crmRequest<{ success: boolean; tag: CrmTag }>('/crm/tags', {
      method: 'POST',
      body: JSON.stringify({ name, color })
    }),

  deleteTag: (id: string) =>
    crmRequest<{ success: boolean; message: string }>(`/crm/tags/${id}`, {
      method: 'DELETE'
    }),

  // CUSTOM FIELDS
  listCustomFields: () =>
    crmRequest<{ success: boolean; fields: CrmCustomFieldDefinition[] }>('/crm/custom-fields'),

  createCustomField: (data: Partial<CrmCustomFieldDefinition>) =>
    crmRequest<{ success: boolean; field: CrmCustomFieldDefinition }>('/crm/custom-fields', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  deleteCustomField: (id: string) =>
    crmRequest<{ success: boolean; message: string }>(`/crm/custom-fields/${id}`, {
      method: 'DELETE'
    }),

  // COMPANIES
  listCompanies: () =>
    crmRequest<{ success: boolean; companies: CrmCompany[] }>('/crm/companies'),

  createCompany: (data: Partial<CrmCompany>) =>
    crmRequest<{ success: boolean; company: CrmCompany }>('/crm/companies', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  // ACTIVITIES & NOTES
  listActivities: (contactId: string) =>
    crmRequest<{ success: boolean; activities: CrmActivity[] }>(`/crm/contacts/${contactId}/activities`),

  logActivity: (contactId: string, data: { type: string; title: string; details?: any }) =>
    crmRequest<{ success: boolean; activity: CrmActivity }>(`/crm/contacts/${contactId}/activities`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  // IMPORTS
  uploadImportFile: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return crmRequest<{ success: boolean; file_path: string; original_name: string; headers: string[]; preview_rows: any[] }>(
      '/crm/imports/upload',
      {
        method: 'POST',
        body: formData
      }
    );
  },

  executeImport: (data: {
    file_path: string;
    file_name: string;
    column_mapping: Record<string, string>;
    dedupe_policy: 'skip' | 'update' | 'merge';
    target_list_id?: string;
  }) =>
    crmRequest<{ success: boolean; import_job_id: string; message: string }>('/crm/imports/execute', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  getImportStatus: (id: string) =>
    crmRequest<{ success: boolean; import: CrmImportJob }>(`/crm/imports/${id}`),

  // EXPORTS
  createExport: (format: 'csv' | 'xlsx' | 'json', filterDefinition?: any) =>
    crmRequest<{ success: boolean; export: CrmExportJob }>('/crm/exports', {
      method: 'POST',
      body: JSON.stringify({ format, filter_definition: filterDefinition })
    }),

  listExports: () =>
    crmRequest<{ success: boolean; exports: CrmExportJob[] }>('/crm/exports'),

  // SUPPRESSION LIST
  listSuppression: () =>
    crmRequest<{ success: boolean; suppression: CrmSuppressionItem[] }>('/crm/suppression'),

  addSuppression: (data: { identifier_type: 'email' | 'phone'; identifier_value: string; reason?: string }) =>
    crmRequest<{ success: boolean; suppression: CrmSuppressionItem }>('/crm/suppression', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  removeSuppression: (id: string) =>
    crmRequest<{ success: boolean; message: string }>(`/crm/suppression/${id}`, {
      method: 'DELETE'
    }),

  // API KEYS
  listApiKeys: () =>
    crmRequest<{ success: boolean; api_keys: CrmApiKey[] }>('/crm/api-keys'),

  createApiKey: (name: string, scopes: string[], isTest: boolean = false) =>
    crmRequest<{ success: boolean; api_key: CrmApiKey; secret_key: string }>('/crm/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name, scopes, is_test: isTest })
    }),

  revokeApiKey: (id: string) =>
    crmRequest<{ success: boolean; message: string }>(`/crm/api-keys/${id}`, {
      method: 'DELETE'
    }),

  // WEBHOOKS
  listWebhooks: () =>
    crmRequest<{ success: boolean; webhooks: CrmWebhook[] }>('/crm/webhooks'),

  createWebhook: (url: string, events: string[], secret?: string) =>
    crmRequest<{ success: boolean; webhook: CrmWebhook }>('/crm/webhooks', {
      method: 'POST',
      body: JSON.stringify({ url, events, secret })
    }),

  deleteWebhook: (id: string) =>
    crmRequest<{ success: boolean; message: string }>(`/crm/webhooks/${id}`, {
      method: 'DELETE'
    }),

  listWebhookDeliveries: (webhookId: string) =>
    crmRequest<{ success: boolean; deliveries: CrmWebhookDelivery[] }>(`/crm/webhooks/${webhookId}/deliveries`),

  // USAGE & STATS
  getUsageStats: () =>
    crmRequest<{
      success: boolean;
      stats: {
        total_calls: number;
        total_credits: number;
        recent_logs: any[];
      };
    }>('/crm/usage'),

  getOpenApiSpec: () =>
    crmRequest<any>('/crm/openapi.json')
};

