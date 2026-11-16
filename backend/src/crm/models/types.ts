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
  is_archived?: boolean;
  archived_at?: string | null;
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
  | 'whatsapp'
  | 'message'
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
  combinator: 'AND' | 'OR' | 'NOT';
  conditions: (FilterCondition | FilterGroup)[];
  not?: boolean;
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

// ============================================================================
// CRM V2 PHASE 1: CUSTOM OBJECTS, RELATIONSHIPS, FIELD HISTORY & OUTBOX
// ============================================================================

export type V2CustomFieldDataType =
  | 'text'
  | 'number'
  | 'date'
  | 'currency'
  | 'dropdown'
  | 'multi_select'
  | 'url'
  | 'user'
  | 'formula';

export interface CustomObjectDefinition {
  id: string;
  workspace_id: string;
  name: string; // e.g. "Property"
  singular_label: string; // "Property"
  plural_label: string; // "Properties"
  slug: string; // "properties"
  description: string | null;
  icon: string; // Lucide icon identifier
  primary_field_key: string;
  created_at: string;
  updated_at: string;
}

export interface CustomObjectFieldDefinition {
  id: string;
  workspace_id: string;
  object_id: string;
  name: string;
  field_key: string;
  field_type: V2CustomFieldDataType;
  options?: string[];
  currency_code?: string;
  formula_expression?: string | null;
  is_required: boolean;
  is_unique?: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomObjectRecord {
  id: string;
  workspace_id: string;
  object_id: string;
  properties: Record<string, any>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type RelationshipType = 'one_to_one' | 'one_to_many' | 'many_to_many';

export interface ObjectRelationshipDefinition {
  id: string;
  workspace_id: string;
  source_object: string; // 'contact', 'company', or custom_object_slug
  target_object: string;
  relationship_type: RelationshipType;
  name: string; // e.g. "Contact Deals"
  inverse_name: string; // e.g. "Deal Contact"
  created_at: string;
}

export interface ObjectAssociation {
  id: string;
  workspace_id: string;
  relationship_id: string;
  source_entity_type: string;
  source_entity_id: string;
  target_entity_type: string;
  target_entity_id: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface FieldChangeHistory {
  id: string;
  workspace_id: string;
  entity_type: string; // 'contact', 'company', or custom object slug
  entity_id: string;
  field_name: string;
  old_value: any;
  new_value: any;
  changed_by: string | null;
  source: 'manual_ui' | 'api' | 'import' | 'automation' | 'enrichment' | 'merge';
  created_at: string;
}

export interface CrmOutboxEvent {
  id: string;
  workspace_id: string;
  event_type: string; // e.g. 'contact.created', 'contact.updated'
  aggregate_type: string; // 'contact', 'company', 'custom_object'
  aggregate_id: string;
  payload: Record<string, any>;
  status: 'pending' | 'published' | 'failed';
  retry_count: number;
  error_message?: string | null;
  created_at: string;
  published_at?: string | null;
}

// =========================================================================
// CRM V2 PHASE 2: IDENTITY RESOLUTION & DATA QUALITY TYPES
// =========================================================================
export type SurvivorshipStrategy = 'most_recent' | 'most_complete' | 'trusted_source' | 'manual';

export interface ContactMergeRecord {
  id: string;
  workspace_id: string;
  primary_contact_id: string;
  merged_contact_id: string;
  merged_contact_snapshot: Record<string, any>;
  survivorship_rules_applied: Record<string, any>;
  unmerged_at?: string | null;
  created_at: string;
}

export interface DuplicateCandidate {
  id: string;
  workspace_id: string;
  primary_contact_id: string;
  duplicate_contact_id: string;
  confidence_score: number; // 0 - 100
  match_reasons: string[]; // ['exact_email', 'phone_e164', 'trigram_name_94']
  status: 'pending_review' | 'auto_merged' | 'manual_merged' | 'dismissed';
  primary_contact?: Contact;
  duplicate_contact?: Contact;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  created_at: string;
}

export interface FieldVerificationResult {
  id: string;
  workspace_id: string;
  contact_id: string;
  field_name: 'email' | 'phone' | 'website';
  field_value: string;
  provider: string;
  status: 'valid' | 'invalid' | 'risky' | 'unknown';
  confidence: number;
  details: Record<string, any>;
  created_at: string;
}

export interface EnrichmentProviderConfig {
  id: string;
  workspace_id: string;
  provider_name: string; // 'hunter' | 'clearbit' | 'apollo' | 'local_intelligence'
  priority_order: number;
  is_active: boolean;
  api_key_encrypted?: string | null;
  cost_per_lookup_credits: number;
  rate_limit_rpm: number;
  created_at: string;
  updated_at: string;
}

export interface DataHealthMetrics {
  total_contacts: number;
  active_contacts: number;
  archived_contacts: number;
  data_quality_score: number; // 0 - 100
  email_health: {
    valid_count: number;
    risky_count: number;
    invalid_count: number;
    unknown_count: number;
    valid_percentage: number;
  };
  phone_health: {
    e164_valid_count: number;
    missing_count: number;
    valid_percentage: number;
  };
  duplicates: {
    detected_count: number;
    pending_review_count: number;
    auto_merged_count: number;
  };
  missing_fields: {
    missing_email_count: number;
    missing_phone_count: number;
    missing_company_count: number;
    missing_title_count: number;
  };
  stale_records: {
    older_than_180_days: number;
    percentage: number;
  };
  source_quality: Array<{
    source: string;
    total: number;
    valid_email_rate: number;
  }>;
}

// =========================================================================
// CRM V2 PHASE 3: SAVED VIEWS & BULK ACTIONS TYPES
// =========================================================================
export interface CrmSavedView {
  id: string;
  workspace_id: string;
  user_id?: string | null;
  name: string;
  description?: string | null;
  filter_definition: FilterGroup;
  sort_by: string;
  sort_direction: 'asc' | 'desc';
  visible_columns: string[];
  is_dynamic: boolean;
  is_shared: boolean;
  cached_count: number;
  last_refreshed_at: string;
  created_at: string;
  updated_at: string;
}

export type BulkActionType =
  | 'bulk_update'
  | 'bulk_archive'
  | 'bulk_unarchive'
  | 'bulk_delete'
  | 'bulk_add_to_list'
  | 'bulk_remove_from_list'
  | 'bulk_tag'
  | 'bulk_untag';

export type BulkJobStatus = 'pending' | 'running' | 'paused' | 'completed' | 'cancelled' | 'undone' | 'failed';

export interface CrmBulkJob {
  id: string;
  workspace_id: string;
  user_id?: string | null;
  action_type: BulkActionType;
  filter_criteria: FilterGroup;
  action_payload: Record<string, any>;
  status: BulkJobStatus;
  total_matched: number;
  processed_count: number;
  success_count: number;
  error_count: number;
  error_details: Array<{ contact_id: string; error: string }>;
  undo_snapshot_available: boolean;
  undo_snapshot_path?: string | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  undone_at?: string | null;
}

// =========================================================================
// CRM V2 PHASE 4: AI LAYER & SMART ENGINES TYPES
// =========================================================================
export interface CrmAiUsageLog {
  id: string;
  workspace_id: string;
  user_id?: string | null;
  action_type: 'contact_brief' | 'smart_compose' | 'import_mapping' | 'lead_scoring';
  model_tier: string;
  prompt_tokens: number;
  completion_tokens: number;
  credits_charged: number;
  currency: string;
  created_at: string;
}

export interface CrmScoringRule {
  id: string;
  workspace_id: string;
  name: string;
  rule_type: 'icp_title' | 'country_tier' | 'verified_email' | 'phone_present' | 'activity_recency' | 'time_decay';
  criteria: Record<string, any>;
  points_change: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContactAiSummary {
  contact_id: string;
  executive_brief: string;
  interest_signals: string[];
  objections_noted: string[];
  recommended_next_action: string;
  sentiment: 'positive' | 'neutral' | 'skeptical' | 'ready_to_buy';
  generated_at: string;
}

export interface SmartComposeResult {
  channel: 'email' | 'whatsapp';
  tone: 'professional' | 'friendly' | 'concise' | 'assertive';
  language: 'English' | 'Hindi' | 'Hinglish';
  subject?: string;
  message_body: string;
  tokens_used: number;
  cost_credits: number;
}

export interface SmartImportColumnMapping {
  csv_header: string;
  mapped_crm_field: string;
  confidence: number;
  sample_value?: string;
}

export interface SmartImportAnalysis {
  total_columns: number;
  mappings: SmartImportColumnMapping[];
  country_code_inferred?: string;
  detected_anomalies: string[];
}

// =========================================================================
// CRM V2 PHASE 5: AUTOMATION ENGINE & COMPLIANCE TYPES
// =========================================================================
export type WorkflowTriggerType =
  | 'contact_created'
  | 'field_changed'
  | 'tag_added'
  | 'tag_removed'
  | 'inbound_message'
  | 'webhook';

export type WorkflowActionType =
  | 'send_whatsapp'
  | 'send_email'
  | 'update_field'
  | 'add_tag'
  | 'remove_tag'
  | 'add_to_list'
  | 'delay'
  | 'condition'
  | 'webhook_notify';

export interface WorkflowStep {
  id: string;
  action_type: WorkflowActionType;
  name: string;
  config: Record<string, any>;
}

export interface CrmWorkflow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger_type: WorkflowTriggerType;
  trigger_config: Record<string, any>;
  filter_criteria: FilterGroup;
  steps: WorkflowStep[];
  total_runs: number;
  created_at: string;
  updated_at: string;
}

export type WorkflowRunStatus = 'running' | 'waiting_delay' | 'completed' | 'failed' | 'cancelled';

export interface CrmWorkflowRun {
  id: string;
  workspace_id: string;
  workflow_id: string;
  contact_id: string;
  status: WorkflowRunStatus;
  current_step_index: number;
  next_execution_at: string | null;
  execution_context: Record<string, any>;
  error_message?: string | null;
  started_at: string;
  completed_at?: string | null;
}

export interface CrmWorkflowStepLog {
  id: string;
  run_id: string;
  workflow_id: string;
  step_index: number;
  action_type: WorkflowActionType;
  status: 'success' | 'failed' | 'skipped' | 'waiting';
  input_payload: Record<string, any>;
  output_payload: Record<string, any>;
  error_message?: string | null;
  duration_ms: number;
  created_at: string;
}

export interface CrmCompliancePolicy {
  id: string;
  workspace_id: string;
  max_messages_per_day: number;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  auto_opt_out_keywords: string[];
  created_at: string;
  updated_at: string;
}

// =========================================================================
// CRM V2 PHASE 6: SALES PIPELINES, DEALS, TASKS & PRESENCE TYPES
// =========================================================================
export interface CrmPipeline {
  id: string;
  workspace_id: string;
  name: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface CrmPipelineStage {
  id: string;
  workspace_id: string;
  pipeline_id: string;
  name: string;
  order_index: number;
  win_probability: number;
  rotten_days: number;
  is_won: boolean;
  is_lost: boolean;
  created_at: string;
  updated_at: string;
}

export interface CrmDeal {
  id: string;
  workspace_id: string;
  pipeline_id: string;
  stage_id: string;
  contact_id?: string | null;
  company_id?: string | null;
  name: string;
  amount: number;
  currency: string;
  amount_usd: number;
  expected_close_date?: string | null;
  status: 'open' | 'won' | 'lost';
  owner_user_id?: string | null;
  custom_fields: Record<string, any>;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
  is_rotten?: boolean;
  stage_name?: string;
}

export interface CrmTask {
  id: string;
  workspace_id: string;
  deal_id?: string | null;
  contact_id?: string | null;
  title: string;
  description?: string | null;
  assigned_to_user_id?: string | null;
  due_date?: string | null;
  sla_minutes?: number | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
  is_overdue?: boolean;
  sla_remaining_minutes?: number | null;
}

export interface CrmPresenceSession {
  id: string;
  workspace_id: string;
  user_id: string;
  user_name: string;
  entity_type: 'contact' | 'deal';
  entity_id: string;
  action: 'viewing' | 'editing';
  expires_at: string;
  updated_at: string;
}

export interface KanbanStageColumn {
  stage: CrmPipelineStage;
  deals: CrmDeal[];
  total_amount: number;
  total_amount_usd: number;
  deals_count: number;
}

export interface KanbanBoardData {
  pipeline: CrmPipeline;
  columns: KanbanStageColumn[];
  total_pipeline_value_usd: number;
  total_deals_count: number;
}

// =========================================================================
// CRM V2 PHASE 7: SECURITY, COMPLIANCE & PRIVACY TYPES
// =========================================================================
export interface CrmRolePermission {
  id: string;
  workspace_id: string;
  role: string;
  can_export: boolean;
  can_bulk_delete: boolean;
  can_view_phones: boolean;
  can_view_emails: boolean;
  can_view_sensitive_fields: boolean;
  can_merge_contacts: boolean;
  can_manage_api_keys: boolean;
  can_manage_billing: boolean;
  created_at: string;
  updated_at: string;
}

export interface CrmSensitiveField {
  id: string;
  workspace_id: string;
  field_key: string;
  entity_type: string;
  mask_strategy: 'redact' | 'partial' | 'hidden';
  created_at: string;
}

export interface CrmErasureCertificate {
  id: string;
  workspace_id: string;
  contact_id: string;
  requester_email: string;
  records_purged: number;
  audit_hash: string;
  erased_by_user_id?: string | null;
  created_at: string;
}

export interface DataSubjectExportBundle {
  contact: Contact;
  company: Company | null;
  activities: ActivityTimelineItem[];
  deals: CrmDeal[];
  tasks: CrmTask[];
  custom_records: Record<string, any>[];
  exported_at: string;
  gdpr_jurisdiction: string;
}

// =========================================================================
// CRM V2 PHASE 9: ANALYTICS, FUNNELS & ATTRIBUTION TYPES
// =========================================================================
export interface FunnelStageMetric {
  stage_id: string;
  stage_name: string;
  deal_count: number;
  total_value_usd: number;
  conversion_from_previous: number;
  drop_off_rate: number;
}

export interface FunnelMetrics {
  pipeline_id: string;
  stages: FunnelStageMetric[];
  overall_win_rate: number;
  avg_sales_cycle_days: number;
  win_rate_by_source: Record<string, number>;
}

export interface AttributionSourceRow {
  source: string;
  contacts_count: number;
  deals_count: number;
  won_value_usd: number;
  conversion_rate: number;
}

export interface AttributionSummary {
  by_source: AttributionSourceRow[];
  total_contacts: number;
  total_won_value_usd: number;
}

export interface CohortRow {
  cohort_month: string;
  total_contacts: number;
  active_m0_pct: number;
  active_m1_pct: number;
  active_m2_pct: number;
  active_m3_pct: number;
}

export interface CustomReportSpec {
  dimension: 'country' | 'source' | 'stage' | 'status' | 'created_month';
  metrics: Array<'count' | 'total_deal_value' | 'avg_deal_value'>;
  chart_type?: 'bar' | 'line' | 'donut' | 'funnel';
}

export interface CustomReportRow {
  dimension_value: string;
  metrics: Record<string, number>;
}

export interface CustomReportResult {
  dimension: string;
  rows: CustomReportRow[];
  chart_type: string;
  generated_at: string;
}





