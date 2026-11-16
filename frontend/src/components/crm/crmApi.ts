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
  getStatus: () =>
    crmRequest<{ success: boolean; is_postgres: boolean; engine: string }>('/crm/status'),

  // CONTACTS
  fetchContacts: async (query: ContactListQuery = {}) => {
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

    const res = await crmRequest<any>(`/crm/contacts?${params.toString()}`);
    return {
      success: Boolean(res?.success),
      contacts: (res?.contacts || res?.data || []) as CrmContact[],
      next_cursor: res?.next_cursor || res?.pagination?.next_cursor || null,
      prev_cursor: res?.prev_cursor || null,
      has_more: Boolean(res?.has_more || res?.pagination?.has_more),
      total_approx: Number(res?.total_approx || res?.pagination?.approximate_total || 0)
    };
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
  findDuplicates: async (field: 'email' | 'phone' = 'email', limit: number = 20) => {
    const res = await crmRequest<any>(`/crm/duplicates?field=${field}&limit=${limit}`);
    return {
      success: Boolean(res?.success),
      duplicate_groups: (res?.duplicate_groups || res?.duplicates || []) as Array<{
        group_key: string;
        field: string;
        count: number;
        contacts: CrmContact[];
      }>
    };
  },

  mergeContacts: async (primaryContactId: string, duplicateContactId: string, fieldOverrides: Partial<CrmContact>) => {
    const res = await crmRequest<any>('/crm/duplicates/merge', {
      method: 'POST',
      body: JSON.stringify({
        primary_id: primaryContactId,
        primary_contact_id: primaryContactId,
        duplicate_id: duplicateContactId,
        duplicate_contact_id: duplicateContactId,
        field_resolutions: fieldOverrides,
        field_overrides: fieldOverrides
      })
    });
    return {
      success: Boolean(res?.success),
      merged_contact: (res?.merged_contact || res?.contact) as CrmContact
    };
  },

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
    crmRequest<any>('/crm/openapi.json'),

  // =========================================================================
  // CRM V2 PHASE 2: DATA HEALTH & VERIFICATION
  // =========================================================================
  getDataHealth: () =>
    crmRequest<{ success: boolean; metrics: any }>('/crm/health'),

  runHealthClean: () =>
    crmRequest<{ success: boolean; result: { examined: number; fixed: number } }>('/crm/health/clean', {
      method: 'POST'
    }),

  // =========================================================================
  // CRM V2 PHASE 4: AI LAYER & SMART ENGINES
  // =========================================================================
  generateContactBrief: (contactId: string) =>
    crmRequest<{ success: boolean; brief: { summary: string; highlights: string[]; sentiment: string; next_best_action: string } }>('/crm/ai/contact-brief', {
      method: 'POST',
      body: JSON.stringify({ contact_id: contactId })
    }),

  smartCompose: (contactId: string, channel: 'whatsapp' | 'email', tone?: string, language?: string) =>
    crmRequest<{ success: boolean; composition: { channel: string; subject?: string; message: string; estimated_tokens: number } }>('/crm/ai/smart-compose', {
      method: 'POST',
      body: JSON.stringify({ contact_id: contactId, channel, tone, language })
    }),

  // =========================================================================
  // CRM V2 PHASE 6: SALES PIPELINE & KANBAN
  // =========================================================================
  getKanbanBoard: (pipelineId?: string) =>
    crmRequest<{
      success: boolean;
      kanban: {
        pipeline_id: string;
        pipeline_name: string;
        total_deals: number;
        total_value_usd: number;
        stages: Array<{
          id: string;
          name: string;
          win_probability: number;
          deals_count: number;
          stage_value_usd: number;
          deals: any[];
        }>;
      };
    }>(`/crm/kanban${pipelineId ? `?pipeline_id=${pipelineId}` : ''}`),

  createDeal: (data: any) =>
    crmRequest<{ success: boolean; deal: any }>('/crm/deals', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  updateDeal: (id: string, updates: any) =>
    crmRequest<{ success: boolean; deal: any }>(`/crm/deals/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    }),

  // =========================================================================
  // CRM V2 PHASE 6: PRESENCE COLLISION DETECTION
  // =========================================================================
  presenceHeartbeat: (entityType: 'contact' | 'deal', entityId: string) =>
    crmRequest<{ success: boolean }>('/crm/presence/heartbeat', {
      method: 'POST',
      body: JSON.stringify({ entity_type: entityType, entity_id: entityId })
    }),

  getPresenceCollisions: (entityType: 'contact' | 'deal', entityId: string) =>
    crmRequest<{ success: boolean; collisions: any[] }>(`/crm/presence/${entityType}/${entityId}`),

  presenceLeave: (entityType: 'contact' | 'deal', entityId: string) =>
    crmRequest<{ success: boolean }>('/crm/presence/leave', {
      method: 'POST',
      body: JSON.stringify({ entity_type: entityType, entity_id: entityId })
    }),

  // =========================================================================
  // CRM V2 PHASE 9: ANALYTICS, FUNNELS & ATTRIBUTION
  // =========================================================================
  getFunnelMetrics: (pipelineId?: string) =>
    crmRequest<{ success: boolean; funnel: any }>(`/crm/analytics/funnel${pipelineId ? `?pipeline_id=${pipelineId}` : ''}`),

  getAttributionMetrics: () =>
    crmRequest<{ success: boolean; attribution: any }>('/crm/analytics/attribution'),

  getCohortRetention: (months?: number) =>
    crmRequest<{ success: boolean; cohorts: any[] }>(`/crm/analytics/cohorts${months ? `?months=${months}` : ''}`),

  runCustomReport: (spec: { dimension: string; metrics: string[]; chart_type?: string }) =>
    crmRequest<{ success: boolean; report: any }>('/crm/analytics/report', {
      method: 'POST',
      body: JSON.stringify(spec)
    }),

  // =========================================================================
  // CRM V2: BOARDS (KANBAN)
  // =========================================================================
  listBoards: (includeArchived: boolean = false) =>
    crmRequest<{ success: boolean; boards: any[] }>(`/crm/boards${includeArchived ? '?include_archived=true' : ''}`),

  getBoard: (id: string) =>
    crmRequest<{ success: boolean; board: any }>(`/crm/boards/${id}`),

  listBoardTemplates: () =>
    crmRequest<{ success: boolean; templates: any[] }>('/crm/boards/templates'),

  createBoard: (data: any) =>
    crmRequest<{ success: boolean; board: any }>('/crm/boards', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  createBoardFromTemplate: (templateId: string, name?: string) =>
    crmRequest<{ success: boolean; board: any }>('/crm/boards/from-template', {
      method: 'POST',
      body: JSON.stringify({ template_id: templateId, name })
    }),

  updateBoard: (id: string, updates: any) =>
    crmRequest<{ success: boolean; board: any }>(`/crm/boards/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    }),

  deleteBoard: (id: string) =>
    crmRequest<{ success: boolean; deleted: boolean }>(`/crm/boards/${id}`, {
      method: 'DELETE'
    }),

  duplicateBoard: (id: string, name?: string) =>
    crmRequest<{ success: boolean; board: any }>(`/crm/boards/${id}/duplicate`, {
      method: 'POST',
      body: JSON.stringify({ name })
    }),

  listBoardColumns: (boardId: string) =>
    crmRequest<{ success: boolean; columns: any[] }>(`/crm/boards/${boardId}/columns`),

  createBoardColumn: (boardId: string, data: any) =>
    crmRequest<{ success: boolean; column: any }>(`/crm/boards/${boardId}/columns`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  updateBoardColumn: (boardId: string, columnId: string, updates: any) =>
    crmRequest<{ success: boolean; column: any }>(`/crm/boards/${boardId}/columns/${columnId}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    }),

  deleteBoardColumn: (boardId: string, columnId: string, fallbackColumnId?: string) =>
    crmRequest<{ success: boolean; deleted: boolean }>(`/crm/boards/${boardId}/columns/${columnId}`, {
      method: 'DELETE',
      body: JSON.stringify({ fallback_column_id: fallbackColumnId })
    }),

  reorderBoardColumns: (boardId: string, columnIds: string[]) =>
    crmRequest<{ success: boolean }>(`/crm/boards/${boardId}/columns/reorder`, {
      method: 'POST',
      body: JSON.stringify({ column_ids: columnIds })
    }),

  listBoardCards: (boardId: string, columnId?: string, cursor?: string, limit: number = 50) => {
    const params = new URLSearchParams();
    if (columnId) params.append('column_id', columnId);
    if (cursor) params.append('cursor', cursor);
    params.append('limit', String(limit));
    return crmRequest<{ success: boolean; cards: any[]; next_cursor: string | null; total: number }>(
      `/crm/boards/${boardId}/cards?${params.toString()}`
    );
  },

  addBoardCard: (boardId: string, data: any) =>
    crmRequest<{ success: boolean; card: any }>(`/crm/boards/${boardId}/cards`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  moveBoardCard: (cardId: string, targetColumnId: string, prevRank?: string | null, nextRank?: string | null) =>
    crmRequest<{ success: boolean; card: any }>('/crm/boards/cards/move', {
      method: 'POST',
      body: JSON.stringify({
        card_id: cardId,
        target_column_id: targetColumnId,
        prev_rank: prevRank,
        next_rank: nextRank
      })
    }),

  removeBoardCard: (boardId: string, entityType: string, entityId: string) =>
    crmRequest<{ success: boolean; removed: boolean }>(`/crm/boards/${boardId}/cards/${entityType}/${entityId}`, {
      method: 'DELETE'
    }),

  getBoardStats: (boardId: string) =>
    crmRequest<{ success: boolean; stats: any }>(`/crm/boards/${boardId}/stats`),

  // =========================================================================
  // CRM V2: TAGS EXTENDED
  // =========================================================================
  listTagsWithCounts: () =>
    crmRequest<{ success: boolean; tags: any[] }>('/crm/tags/with-counts'),

  mergeTags: (sourceTagId: string, targetTagId: string) =>
    crmRequest<{ success: boolean; affected_contacts: number }>('/crm/tags/merge', {
      method: 'POST',
      body: JSON.stringify({ source_tag_id: sourceTagId, target_tag_id: targetTagId })
    }),

  listTagGroups: () =>
    crmRequest<{ success: boolean; groups: any[] }>('/crm/tags/groups'),

  saveTagGroup: (group: any) =>
    crmRequest<{ success: boolean; group: any }>('/crm/tags/groups', {
      method: 'POST',
      body: JSON.stringify(group)
    }),

  listAutoTagRules: () =>
    crmRequest<{ success: boolean; rules: any[] }>('/crm/tags/rules'),

  saveAutoTagRule: (rule: any) =>
    crmRequest<{ success: boolean; rule: any }>('/crm/tags/rules', {
      method: 'POST',
      body: JSON.stringify(rule)
    }),

  // =========================================================================
  // CRM V2: SUPER FIELDS
  // =========================================================================
  listSuperFields: (entityType: string = 'contact') =>
    crmRequest<{ success: boolean; fields: any[] }>(`/crm/super-fields?entity_type=${entityType}`),

  getSuperField: (id: string) =>
    crmRequest<{ success: boolean; field: any }>(`/crm/super-fields/${id}`),

  createSuperField: (data: any) =>
    crmRequest<{ success: boolean; field: any }>('/crm/super-fields', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  updateSuperField: (id: string, updates: any) =>
    crmRequest<{ success: boolean; field: any }>(`/crm/super-fields/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    }),

  deleteSuperField: (id: string) =>
    crmRequest<{ success: boolean; deleted: boolean }>(`/crm/super-fields/${id}`, {
      method: 'DELETE'
    }),

  promoteSuperField: (id: string, isPromoted: boolean) =>
    crmRequest<{ success: boolean; field: any }>(`/crm/super-fields/${id}/promote`, {
      method: 'POST',
      body: JSON.stringify({ is_promoted: isPromoted })
    }),

  evaluateFormula: (expression: string, context: Record<string, any>) =>
    crmRequest<{ success: boolean; value: any }>('/crm/super-fields/evaluate-formula', {
      method: 'POST',
      body: JSON.stringify({ expression, context })
    }),

  // =========================================================================
  // CRM V2: PLAN-BASED BILLING & HARD ENTITLEMENTS (WALLET-ONLY)
  // =========================================================================
  listBillingPlans: () =>
    crmRequest<{ success: boolean; plans: any[] }>('/crm/billing/plans'),

  listBillingAddons: () =>
    crmRequest<{ success: boolean; addons: any[] }>('/crm/billing/addons'),

  getActiveSubscription: () =>
    crmRequest<{ success: boolean; subscription: any; usage: any[] }>('/crm/billing/subscription'),

  subscribeToPlan: (
    planId: string,
    couponCode?: string,
    autoRenew: boolean = true,
    clientExpectedPrice?: number,
    idempotencyKey?: string
  ) =>
    crmRequest<{ success: boolean; message: string; subscription: any; invoice: any }>('/crm/billing/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        plan_id: planId,
        coupon_code: couponCode,
        auto_renew: autoRenew,
        client_expected_price: clientExpectedPrice,
        idempotency_key: idempotencyKey
      })
    }),

  purchaseAddon: (addonId: string, idempotencyKey?: string) =>
    crmRequest<{ success: boolean; message: string; invoice: any }>('/crm/billing/addons/purchase', {
      method: 'POST',
      body: JSON.stringify({ addon_id: addonId, idempotency_key: idempotencyKey })
    }),

  getWallet: () =>
    crmRequest<{ success: boolean; wallet: any }>('/wallet'),

  getWalletTransactions: (limit: number = 50) =>
    crmRequest<{ success: boolean; transactions: any[] }>(`/wallet/transactions?limit=${limit}`),

  grantComplimentaryPlan: (data: { workspace_id: string; plan_id: string; duration_days: number; reason: string }) =>
    crmRequest<{ success: boolean; message: string; subscription: any; invoice: any }>('/crm/admin/billing/grant-plan', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  refundSubscription: (data: { workspace_id: string; subscription_id: string; reason: string }) =>
    crmRequest<{ success: boolean; message: string; refund_tx_id: string; new_balance: number }>('/crm/admin/billing/refund', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  listInvoices: () =>
    crmRequest<{ success: boolean; invoices: any[] }>('/crm/billing/invoices'),

  getUsageCounters: () =>
    crmRequest<{ success: boolean; usage: any[] }>('/crm/billing/usage'),

  reconcileUsageCounters: () =>
    crmRequest<{ success: boolean; reconciled: any }>('/crm/billing/usage/reconcile', {
      method: 'POST'
    }),

  checkCoupon: (code: string) =>
    crmRequest<{ success: boolean; coupon: any }>(`/crm/billing/coupon/${encodeURIComponent(code)}`),

  getBillingSettings: () =>
    crmRequest<{ success: boolean; settings: any }>('/crm/admin/billing/settings'),

  updateBillingSettings: (settings: any) =>
    crmRequest<{ success: boolean; settings: any }>('/crm/admin/billing/settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    }),

  saveBillingPlan: (plan: any) =>
    crmRequest<{ success: boolean; plan: any }>('/crm/admin/billing/plans', {
      method: 'POST',
      body: JSON.stringify(plan)
    })
};

