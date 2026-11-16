export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'read_only';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  owner_user_id: string;
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  created_at: string;
  updated_at: string;
}

export type ContactStatus = 'new' | 'contacted' | 'qualified' | 'customer' | 'unresponsive' | 'unqualified';
export type ContactEmailStatus = 'valid' | 'invalid' | 'risky' | 'unknown';
export type ContactSource = 'extractor_job' | 'import' | 'api' | 'manual';

export interface Contact {
  id: string;
  workspace_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  email_normalized: string | null;
  phone: string | null;
  phone_e164: string | null;
  company_id: string | null;
  company_name?: string | null;
  title: string | null;
  country: string | null;
  city: string | null;
  source: ContactSource | string;
  source_id: string | null;
  lead_score: number;
  status: ContactStatus;
  custom_fields: Record<string, any>;
  email_status: ContactEmailStatus;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  tags?: string[];
  lists?: string[];
}

export interface Company {
  id: string;
  workspace_id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  size_range: string | null;
  country: string | null;
  city: string | null;
  phone: string | null;
  website: string | null;
  linkedin_url: string | null;
  custom_fields: Record<string, any>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  contacts_count?: number;
}

export interface CrmList {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  is_dynamic: boolean;
  filter_definition: FilterGroup | null;
  cached_count: number;
  last_counted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrmTag {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
  created_at: string;
  contacts_count?: number;
}

export type CustomFieldType = 'text' | 'number' | 'date' | 'dropdown' | 'multi_select' | 'boolean';

export interface CustomFieldDefinition {
  id: string;
  workspace_id: string;
  target_entity: 'contact' | 'company';
  name: string;
  field_key: string;
  field_type: CustomFieldType;
  options: string[];
  is_required: boolean;
  created_at: string;
  updated_at: string;
}

export type ActivityType =
  | 'note'
  | 'task'
  | 'call'
  | 'email'
  | 'extraction'
  | 'imported'
  | 'api_update'
  | 'tag_added'
  | 'status_change';

export interface ActivityTimelineItem {
  id: string;
  workspace_id: string;
  contact_id: string;
  user_id: string | null;
  type: ActivityType;
  title: string;
  details: Record<string, any>;
  created_at: string;
}

export type ImportDedupeRule = 'skip' | 'update' | 'merge';
export type ImportStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface CrmImport {
  id: string;
  workspace_id: string;
  user_id: string;
  filename: string;
  file_path: string | null;
  total_rows: number;
  processed_rows: number;
  imported_rows: number;
  updated_rows: number;
  skipped_rows: number;
  error_rows: number;
  dedupe_rule: ImportDedupeRule;
  column_mapping: Record<string, string>;
  list_id: string | null;
  status: ImportStatus;
  error_report_url: string | null;
  error_details: string | null;
  created_at: string;
  completed_at: string | null;
}

export type ExportFormat = 'csv' | 'xlsx' | 'json';
export type ExportStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface CrmExport {
  id: string;
  workspace_id: string;
  user_id: string;
  format: ExportFormat;
  total_records: number;
  filter_definition: FilterGroup | null;
  status: ExportStatus;
  file_path: string | null;
  download_url: string | null;
  expires_at: string | null;
  created_at: string;
  completed_at: string | null;
}

export type ApiKeyScope =
  | 'contacts:read'
  | 'contacts:write'
  | 'lists:write'
  | 'imports:run'
  | 'extractions:run';

export interface CrmApiKey {
  id: string;
  workspace_id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  scopes: ApiKeyScope[];
  rate_limit_rpm: number;
  monthly_quota: number;
  monthly_usage: number;
  is_test: boolean;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

export interface CrmApiUsageLog {
  id: string;
  workspace_id: string;
  api_key_id: string | null;
  endpoint: string;
  method: string;
  status_code: number;
  response_time_ms: number;
  credits_charged: number;
  currency: string;
  ip_address: string | null;
  created_at: string;
}

export interface CrmWebhook {
  id: string;
  workspace_id: string;
  url: string;
  description: string | null;
  events: string[];
  secret: string;
  is_active: boolean;
  failure_count: number;
  last_triggered_at: string | null;
  created_at: string;
}

export interface CrmWebhookDelivery {
  id: string;
  workspace_id: string;
  webhook_id: string;
  event_type: string;
  payload: Record<string, any>;
  status_code: number | null;
  response_body: string | null;
  duration_ms: number | null;
  attempt: number;
  success: boolean;
  delivered_at: string;
}

export type SuppressionType = 'email' | 'phone' | 'domain';
export type SuppressionReason =
  | 'unsubscribe'
  | 'bounce'
  | 'spam_complaint'
  | 'manual_request'
  | 'gdpr_deletion';

export interface SuppressionRecord {
  id: string;
  workspace_id: string;
  type: SuppressionType;
  value_normalized: string;
  reason: SuppressionReason;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  workspace_id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  changes: Record<string, any> | null;
  ip_address: string | null;
  created_at: string;
}

export type FilterOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'is_set'
  | 'is_not_set'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'not_in';

export interface FilterCondition {
  field: string;
  operator: FilterOperator;
  value?: any;
}

export interface FilterGroup {
  combinator: 'AND' | 'OR';
  conditions: (FilterCondition | FilterGroup)[];
}

export interface KeysetCursor {
  created_at: string;
  id: string;
}

export interface KeysetPaginationParams {
  limit?: number;
  cursor?: string; // base64 encoded { created_at, id }
  direction?: 'next' | 'prev';
  sortBy?: 'created_at' | 'last_name' | 'lead_score' | 'updated_at';
  sortOrder?: 'ASC' | 'DESC';
}

export interface PaginatedResult<T> {
  data: T[];
  next_cursor: string | null;
  prev_cursor: string | null;
  has_more: boolean;
  approximate_total?: number;
}

