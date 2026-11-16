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

// =========================================================================
// CRM V2: BOARDS (KANBAN) TYPES
// =========================================================================
export type BoardVisibility = 'private' | 'team' | 'workspace';
export type BoardColumnStageType = 'standard' | 'won' | 'lost';
export type BoardCardEntityType = 'contact' | 'deal' | 'task';

export interface ColumnAutoAction {
  type: 'set_field' | 'add_tag' | 'remove_tag' | 'assign_owner' | 'trigger_automation' | 'send_webhook';
  config: {
    field_slug?: string;
    field_value?: any;
    tag_name?: string;
    owner_user_id?: string;
    workflow_id?: string;
    webhook_url?: string;
  };
}

export interface CardActionButtonConfig {
  id: string;
  type: 'open_chat' | 'move_chat' | 'call' | 'send_template' | 'add_note' | 'create_task' | 'run_automation' | 'webhook';
  label: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
  webhook_url?: string;
  template_id?: string;
  automation_id?: string;
}

export interface CardLayoutConfig {
  visible_fields: string[];
  field_order: string[];
  card_size: 'compact' | 'standard' | 'expanded';
  card_color_field?: string;
  card_accent_color?: string;
  action_buttons: CardActionButtonConfig[];
  show_avatar: boolean;
  show_tags: boolean;
  show_score: boolean;
  show_owner: boolean;
}

export interface CrmBoard {
  id: string;
  workspace_id: string;
  name: string;
  description?: string | null;
  color: string;
  icon: string;
  owner_user_id?: string | null;
  visibility: BoardVisibility;
  is_archived: boolean;
  card_layout: CardLayoutConfig;
  filter_criteria: FilterGroup;
  auto_add_matching: boolean;
  auto_remove_unmatched: boolean;
  created_at: string;
  updated_at: string;
  columns?: CrmBoardColumn[];
}

export interface CrmBoardColumn {
  id: string;
  board_id: string;
  workspace_id: string;
  name: string;
  color: string;
  order_index: number;
  wip_limit?: number | null;
  stage_type: BoardColumnStageType;
  auto_actions: ColumnAutoAction[];
  created_at: string;
  updated_at: string;
  card_count?: number;
  total_value?: number;
}

export interface CrmBoardCard {
  id: string;
  board_id: string;
  column_id: string;
  workspace_id: string;
  entity_type: BoardCardEntityType;
  entity_id: string;
  rank: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  entity_data?: Partial<Contact> | Record<string, any>;
}

export interface BoardStatsColumnMetric {
  column_id: string;
  name: string;
  card_count: number;
  total_value_usd: number;
  conversion_rate: number;
  avg_time_in_stage_hours: number;
}

export interface BoardStatsSummary {
  board_id: string;
  total_cards: number;
  columns: BoardStatsColumnMetric[];
  won_count: number;
  lost_count: number;
  win_rate_percent: number;
}

// =========================================================================
// CRM V2: TAGS EXTENDED TYPES
// =========================================================================
export interface CrmTagGroup {
  id: string;
  workspace_id: string;
  name: string;
  color?: string;
  sort_order: number;
  created_at: string;
}

export interface CrmAutoTagRule {
  id: string;
  workspace_id: string;
  name: string;
  trigger: 'score_threshold' | 'inactivity_days' | 'extractor_import' | 'status_change';
  condition_value: any;
  tag_name: string;
  is_active: boolean;
  created_at: string;
}

export interface MergeTagsRequest {
  source_tag_id: string;
  target_tag_id: string;
}

// =========================================================================
// CRM V2: SUPER FIELDS TYPES (20 TYPES)
// =========================================================================
export type SuperFieldType =
  | 'text'
  | 'long_text'
  | 'number'
  | 'currency'
  | 'percent'
  | 'date'
  | 'datetime'
  | 'dropdown'
  | 'multi_select'
  | 'checkbox'
  | 'url'
  | 'email'
  | 'phone'
  | 'user'
  | 'tag'
  | 'file'
  | 'rating'
  | 'formula'
  | 'lookup'
  | 'auto_number'
  | 'stage';

export interface SuperFieldOption {
  label: string;
  value: string;
  color?: string;
}

export interface SuperFieldLookupConfig {
  source_entity: 'company' | 'contact';
  target_field: string;
}

export interface CrmSuperField {
  id: string;
  workspace_id: string;
  entity_type: 'contact' | 'company' | 'deal';
  name: string;
  slug: string;
  description?: string | null;
  field_type: SuperFieldType;
  is_required: boolean;
  is_unique: boolean;
  min_value?: number | null;
  max_value?: number | null;
  validation_regex?: string | null;
  default_value?: string | null;
  options: SuperFieldOption[];
  formula_expression?: string | null;
  lookup_config: SuperFieldLookupConfig | Record<string, any>;
  auto_number_prefix?: string | null;
  auto_number_padding: number;
  group_name: string;
  is_searchable: boolean;
  is_filterable: boolean;
  is_promoted: boolean;
  visibility_roles: WorkspaceRole[];
  linked_board_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrmPromotedFieldValue {
  id: string;
  workspace_id: string;
  entity_type: string;
  entity_id: string;
  field_slug: string;
  field_type: SuperFieldType;
  value_text?: string | null;
  value_numeric?: number | null;
  value_timestamp?: string | null;
  value_json?: any;
  created_at: string;
  updated_at: string;
}

// =========================================================================
// CRM V2: PLAN-BASED BILLING & HARD ENTITLEMENTS (WALLET-ONLY)
// =========================================================================
export type BillingDuration = 'monthly' | 'annual' | 'lifetime';
export type SubscriptionStatus = 'pending' | 'active' | 'expiring_soon' | 'grace' | 'expired' | 'cancelled' | 'suspended';
export type BillingResourceType =
  | 'contacts'
  | 'boards'
  | 'columns_per_board'
  | 'super_fields'
  | 'tags'
  | 'team_seats'
  | 'api_calls'
  | 'automations'
  | 'messages'
  | 'storage_mb'
  | 'enrichment_credits'
  | 'export_rows';

export interface CrmBillingPlan {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  price_usd: number;
  duration_days: number;
  quota_contacts: number;
  quota_boards: number;
  quota_columns_per_board: number;
  quota_super_fields: number;
  quota_tags: number;
  quota_team_seats: number;
  quota_api_calls_per_month: number;
  quota_automations_per_month: number;
  quota_messages_per_month: number;
  quota_storage_mb: number;
  quota_enrichment_credits: number;
  quota_export_rows_per_month: number;
  feature_flags: Record<string, boolean>;
  version: number;
  is_active: boolean;
  is_visible: boolean;
  trial_days: number;
  is_recurring: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CrmBillingAddon {
  id: string;
  name: string;
  slug: string;
  resource_type: BillingResourceType;
  quantity: number;
  price_usd: number;
  validity_days?: number | null;
  is_active: boolean;
  created_at: string;
}

export interface CrmBillingCoupon {
  id: string;
  code: string;
  discount_type: 'percent' | 'fixed_usd';
  discount_value: number;
  max_uses: number;
  current_uses: number;
  plan_ids: string[];
  valid_until?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface CrmSubscription {
  id: string;
  workspace_id: string;
  user_id: string;
  plan_id: string;
  plan_version: number;
  status: SubscriptionStatus;
  starts_at: string;
  ends_at: string;
  grace_ends_at?: string | null;
  auto_renew: boolean;
  renew_retry_count: number;
  custom_quotas: Record<string, number>;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  plan?: CrmBillingPlan;
}

export interface CrmUsageCounter {
  id: string;
  workspace_id: string;
  resource_type: BillingResourceType | string;
  used_count: number;
  quota_limit: number;
  period_start: string;
  period_end?: string | null;
  last_updated_at: string;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unit_price_usd: number;
  total_usd: number;
}

export interface CrmInvoice {
  id: string;
  invoice_number: string;
  workspace_id: string;
  user_id: string;
  subscription_id?: string | null;
  plan_name: string;
  amount_usd: number;
  amount_charged: number;
  currency_charged: string;
  exchange_rate_snapshot: number;
  subtotal_usd: number;
  discount_usd: number;
  tax_rate_percent: number;
  tax_amount_usd: number;
  gstin?: string | null;
  status: 'paid' | 'refunded' | 'void' | 'credited';
  ledger_tx_id?: string | null;
  line_items: InvoiceLineItem[];
  created_at: string;
}

export interface CrmBillingSettings {
  id: string;
  gst_vat_rate_percent: number;
  company_gstin: string;
  company_legal_name: string;
  invoice_footer: string;
  grace_period_days: number;
  renewal_reminder_days: number;
  stacking_rule: 'extend' | 'queue' | 'prorate';
  refund_policy: 'full_wallet' | 'pro_rata_wallet' | 'none';
  quota_definition_archived_frees_quota: boolean;
  quota_overflow_policy: 'partial_accept' | 'reject_batch';
  updated_at: string;
}

export interface QuotaCheckResult {
  allowed: boolean;
  resource_type: BillingResourceType | string;
  used_count: number;
  quota_limit: number;
  remaining: number;
  rejection_reason?: string;
}






