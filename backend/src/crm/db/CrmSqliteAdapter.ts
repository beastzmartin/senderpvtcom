import Database from 'better-sqlite3';
import crypto from 'crypto';
import { getDatabase } from '../../db/database.js';
import {
  CrmStorageAdapter,
  ContactListParams
} from './CrmStorageAdapter.js';
import {
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
  Contact,
  Company,
  CrmList,
  CrmTag,
  CustomFieldDefinition,
  ActivityTimelineItem,
  CrmImport,
  CrmExport,
  CrmApiKey,
  CrmApiUsageLog,
  CrmWebhook,
  CrmWebhookDelivery,
  SuppressionRecord,
  AuditLogEntry,
  FilterGroup,
  PaginatedResult,
  ImportDedupeRule,
  CustomObjectDefinition,
  CustomObjectFieldDefinition,
  CustomObjectRecord,
  ObjectRelationshipDefinition,
  ObjectAssociation,
  FieldChangeHistory,
  CrmOutboxEvent,
  ContactMergeRecord,
  DuplicateCandidate,
  FieldVerificationResult,
  EnrichmentProviderConfig,
  DataHealthMetrics,
  CrmSavedView,
  CrmBulkJob,
  CrmAiUsageLog,
  CrmScoringRule,
  CrmWorkflow,
  CrmWorkflowRun,
  CrmWorkflowStepLog,
  CrmCompliancePolicy,
  CrmPipeline,
  CrmPipelineStage,
  CrmDeal,
  CrmTask,
  CrmPresenceSession,
  CrmRolePermission,
  CrmSensitiveField,
  CrmErasureCertificate,
  FunnelMetrics,
  FunnelStageMetric,
  AttributionSummary,
  AttributionSourceRow,
  CohortRow,
  CustomReportSpec,
  CustomReportResult
} from '../models/types.js';
import { CrmNormalizer } from '../services/crmNormalizer.js';
import { CrmFilterBuilder } from '../services/crmFilterBuilder.js';

export class CrmSqliteAdapter implements CrmStorageAdapter {
  public isPostgres = false;
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
  }

  public async initialize(): Promise<void> {
    try {
      const sqlCheck = this.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='crm_contact_merges'").get() as any;
      if (sqlCheck?.sql && sqlCheck.sql.includes('REFERENCES crm_contacts')) {
        this.db.exec(`
          DROP TABLE IF EXISTS crm_contact_merges;
          DROP TABLE IF EXISTS crm_duplicate_candidates;
          DROP TABLE IF EXISTS crm_verification_logs;
        `);
      }
    } catch {}

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS crm_workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        owner_user_id TEXT NOT NULL,
        settings TEXT NOT NULL DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS crm_workspace_members (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'read_only')),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE (workspace_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS crm_companies (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        domain TEXT,
        industry TEXT,
        size_range TEXT,
        country TEXT,
        city TEXT,
        phone TEXT,
        website TEXT,
        linkedin_url TEXT,
        custom_fields TEXT NOT NULL DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        deleted_at TEXT
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_companies_ws_domain ON crm_companies (workspace_id, domain) WHERE domain IS NOT NULL AND deleted_at IS NULL;

      CREATE TABLE IF NOT EXISTS crm_contacts (
        id TEXT NOT NULL,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        first_name TEXT,
        last_name TEXT,
        email TEXT,
        email_normalized TEXT,
        phone TEXT,
        phone_e164 TEXT,
        company_id TEXT REFERENCES crm_companies(id) ON DELETE SET NULL,
        title TEXT,
        country TEXT,
        city TEXT,
        source TEXT NOT NULL DEFAULT 'manual',
        source_id TEXT,
        lead_score INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'customer', 'unresponsive', 'unqualified')),
        custom_fields TEXT NOT NULL DEFAULT '{}',
        email_status TEXT NOT NULL DEFAULT 'unknown' CHECK (email_status IN ('valid', 'invalid', 'risky', 'unknown')),
        verified_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        deleted_at TEXT,
        PRIMARY KEY (workspace_id, id)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_contacts_ws_email ON crm_contacts (workspace_id, email_normalized) WHERE email_normalized IS NOT NULL AND deleted_at IS NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_contacts_ws_phone ON crm_contacts (workspace_id, phone_e164) WHERE phone_e164 IS NOT NULL AND deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_crm_contacts_keyset ON crm_contacts (workspace_id, created_at DESC, id DESC) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_crm_contacts_status ON crm_contacts (workspace_id, status) WHERE deleted_at IS NULL;

      CREATE TABLE IF NOT EXISTS crm_lists (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        is_dynamic INTEGER NOT NULL DEFAULT 0,
        filter_definition TEXT,
        cached_count INTEGER NOT NULL DEFAULT 0,
        last_counted_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS crm_list_members (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        list_id TEXT NOT NULL REFERENCES crm_lists(id) ON DELETE CASCADE,
        contact_id TEXT NOT NULL,
        added_at TEXT DEFAULT (datetime('now')),
        UNIQUE (list_id, contact_id)
      );

      CREATE INDEX IF NOT EXISTS idx_crm_list_members_ws ON crm_list_members(workspace_id, contact_id);

      CREATE TABLE IF NOT EXISTS crm_tags (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#3b82f6',
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE (workspace_id, name)
      );

      CREATE TABLE IF NOT EXISTS crm_contact_tags (
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        contact_id TEXT NOT NULL,
        tag_id TEXT NOT NULL REFERENCES crm_tags(id) ON DELETE CASCADE,
        created_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (contact_id, tag_id)
      );

      CREATE TABLE IF NOT EXISTS crm_custom_field_definitions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        target_entity TEXT NOT NULL DEFAULT 'contact',
        name TEXT NOT NULL,
        field_key TEXT NOT NULL,
        field_type TEXT NOT NULL,
        options TEXT DEFAULT '[]',
        is_required INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE (workspace_id, target_entity, field_key)
      );

      CREATE TABLE IF NOT EXISTS crm_activities (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        contact_id TEXT NOT NULL,
        user_id TEXT,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        details TEXT NOT NULL DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_crm_activities_ws_contact ON crm_activities (workspace_id, contact_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS crm_imports (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        file_path TEXT,
        total_rows INTEGER NOT NULL DEFAULT 0,
        processed_rows INTEGER NOT NULL DEFAULT 0,
        imported_rows INTEGER NOT NULL DEFAULT 0,
        updated_rows INTEGER NOT NULL DEFAULT 0,
        skipped_rows INTEGER NOT NULL DEFAULT 0,
        error_rows INTEGER NOT NULL DEFAULT 0,
        dedupe_rule TEXT NOT NULL DEFAULT 'update',
        column_mapping TEXT NOT NULL,
        list_id TEXT REFERENCES crm_lists(id),
        status TEXT NOT NULL DEFAULT 'pending',
        error_report_url TEXT,
        error_details TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS crm_exports (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        format TEXT NOT NULL,
        total_records INTEGER NOT NULL DEFAULT 0,
        filter_definition TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        file_path TEXT,
        download_url TEXT,
        expires_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS crm_api_keys (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        key_prefix TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        scopes TEXT NOT NULL DEFAULT '["contacts:read","contacts:write"]',
        rate_limit_rpm INTEGER NOT NULL DEFAULT 600,
        monthly_quota INTEGER NOT NULL DEFAULT 500000,
        monthly_usage INTEGER NOT NULL DEFAULT 0,
        is_test INTEGER NOT NULL DEFAULT 0,
        revoked_at TEXT,
        last_used_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS crm_api_usage_logs (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        api_key_id TEXT REFERENCES crm_api_keys(id) ON DELETE SET NULL,
        endpoint TEXT NOT NULL,
        method TEXT NOT NULL,
        status_code INTEGER NOT NULL,
        response_time_ms INTEGER NOT NULL,
        credits_charged REAL NOT NULL DEFAULT 0.0,
        currency TEXT NOT NULL DEFAULT 'INR',
        ip_address TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS crm_webhooks (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        description TEXT,
        events TEXT NOT NULL DEFAULT '["contact.created","contact.updated"]',
        secret TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        failure_count INTEGER NOT NULL DEFAULT 0,
        last_triggered_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS crm_webhook_deliveries (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        webhook_id TEXT NOT NULL REFERENCES crm_webhooks(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        status_code INTEGER,
        response_body TEXT,
        duration_ms INTEGER,
        attempt INTEGER NOT NULL DEFAULT 1,
        success INTEGER NOT NULL,
        delivered_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS crm_suppression_list (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('email', 'phone', 'domain')),
        value_normalized TEXT NOT NULL,
        reason TEXT NOT NULL DEFAULT 'unsubscribe',
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE (workspace_id, type, value_normalized)
      );

      CREATE TABLE IF NOT EXISTS crm_audit_log (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        user_id TEXT,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        changes TEXT,
        ip_address TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- CRM V2 Phase 1: Custom Objects & Records
      CREATE TABLE IF NOT EXISTS crm_custom_objects (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        singular_label TEXT NOT NULL,
        plural_label TEXT NOT NULL,
        slug TEXT NOT NULL,
        description TEXT,
        icon TEXT NOT NULL DEFAULT 'Boxes',
        primary_field_key TEXT NOT NULL DEFAULT 'name',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE (workspace_id, slug)
      );

      CREATE TABLE IF NOT EXISTS crm_custom_object_fields (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        object_id TEXT NOT NULL REFERENCES crm_custom_objects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        field_key TEXT NOT NULL,
        field_type TEXT NOT NULL,
        options TEXT NOT NULL DEFAULT '[]',
        currency_code TEXT DEFAULT 'USD',
        formula_expression TEXT,
        is_required INTEGER NOT NULL DEFAULT 0,
        is_unique INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE (object_id, field_key)
      );

      CREATE TABLE IF NOT EXISTS crm_custom_object_records (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        object_id TEXT NOT NULL REFERENCES crm_custom_objects(id) ON DELETE CASCADE,
        properties TEXT NOT NULL DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        deleted_at TEXT
      );

      -- CRM V2 Phase 1: Object Relationships & Associations
      CREATE TABLE IF NOT EXISTS crm_object_relationships (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        source_object TEXT NOT NULL,
        target_object TEXT NOT NULL,
        relationship_type TEXT NOT NULL,
        name TEXT NOT NULL,
        inverse_name TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE (workspace_id, source_object, target_object, name)
      );

      CREATE TABLE IF NOT EXISTS crm_object_associations (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        relationship_id TEXT NOT NULL REFERENCES crm_object_relationships(id) ON DELETE CASCADE,
        source_entity_type TEXT NOT NULL,
        source_entity_id TEXT NOT NULL,
        target_entity_type TEXT NOT NULL,
        target_entity_id TEXT NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- CRM V2 Phase 1: Field-Level Delta History
      CREATE TABLE IF NOT EXISTS crm_field_history (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        field_name TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        changed_by TEXT,
        source TEXT NOT NULL DEFAULT 'manual_ui',
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- CRM V2 Phase 1: Transactional Event Outbox
      CREATE TABLE IF NOT EXISTS crm_outbox_events (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        aggregate_type TEXT NOT NULL,
        aggregate_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        retry_count INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        published_at TEXT
      );

      -- CRM V2 Phase 2: Contact Merges & UNMERGE Snapshot Store
      CREATE TABLE IF NOT EXISTS crm_contact_merges (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        primary_contact_id TEXT NOT NULL,
        merged_contact_id TEXT NOT NULL,
        merged_contact_snapshot TEXT NOT NULL,
        survivorship_rules_applied TEXT NOT NULL DEFAULT '{}',
        unmerged_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- CRM V2 Phase 2: Duplicate Candidates Review Queue
      CREATE TABLE IF NOT EXISTS crm_duplicate_candidates (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        primary_contact_id TEXT NOT NULL,
        duplicate_contact_id TEXT NOT NULL,
        confidence_score REAL NOT NULL,
        match_reasons TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'pending_review',
        reviewed_at TEXT,
        reviewed_by TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE (workspace_id, primary_contact_id, duplicate_contact_id)
      );

      -- CRM V2 Phase 2: Verification Logs
      CREATE TABLE IF NOT EXISTS crm_verification_logs (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        contact_id TEXT NOT NULL,
        field_name TEXT NOT NULL,
        field_value TEXT NOT NULL,
        provider TEXT NOT NULL DEFAULT 'native_mx_e164',
        status TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 1.00,
        details TEXT NOT NULL DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- CRM V2 Phase 2: Enrichment Waterfall Configuration
      CREATE TABLE IF NOT EXISTS crm_enrichment_providers (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        provider_name TEXT NOT NULL,
        priority_order INTEGER NOT NULL DEFAULT 1,
        is_active INTEGER NOT NULL DEFAULT 1,
        api_key_encrypted TEXT,
        cost_per_lookup_credits REAL NOT NULL DEFAULT 1.0,
        rate_limit_rpm INTEGER NOT NULL DEFAULT 60,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE (workspace_id, provider_name)
      );

      -- CRM V2 Phase 2: Enrichment Cache
      CREATE TABLE IF NOT EXISTS crm_enrichment_cache (
        id TEXT PRIMARY KEY,
        lookup_key TEXT NOT NULL UNIQUE,
        provider_name TEXT NOT NULL,
        enriched_data TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- CRM V2 Phase 3: Saved Views & Shareable Segments
      CREATE TABLE IF NOT EXISTS crm_saved_views (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        user_id TEXT,
        name TEXT NOT NULL,
        description TEXT,
        filter_definition TEXT NOT NULL DEFAULT '{}',
        sort_by TEXT NOT NULL DEFAULT 'created_at',
        sort_direction TEXT NOT NULL DEFAULT 'desc',
        visible_columns TEXT NOT NULL DEFAULT '["name","email","phone","company_name","status","lead_score"]',
        is_dynamic INTEGER NOT NULL DEFAULT 1,
        is_shared INTEGER NOT NULL DEFAULT 0,
        cached_count INTEGER NOT NULL DEFAULT 0,
        last_refreshed_at TEXT DEFAULT (datetime('now')),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- CRM V2 Phase 3: Bulk Jobs Engine (Pause/Resume/Cancel/UNDO)
      CREATE TABLE IF NOT EXISTS crm_bulk_jobs (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        user_id TEXT,
        action_type TEXT NOT NULL,
        filter_criteria TEXT NOT NULL DEFAULT '{}',
        action_payload TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'pending',
        total_matched INTEGER NOT NULL DEFAULT 0,
        processed_count INTEGER NOT NULL DEFAULT 0,
        success_count INTEGER NOT NULL DEFAULT 0,
        error_count INTEGER NOT NULL DEFAULT 0,
        error_details TEXT NOT NULL DEFAULT '[]',
        undo_snapshot_available INTEGER NOT NULL DEFAULT 1,
        undo_snapshot_path TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        started_at TEXT,
        completed_at TEXT,
        undone_at TEXT
      );

      -- CRM V2 Phase 4: AI Usage Logs
      CREATE TABLE IF NOT EXISTS crm_ai_usage_logs (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        user_id TEXT,
        action_type TEXT NOT NULL,
        model_tier TEXT NOT NULL DEFAULT 'gemini-1.5-flash',
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        credits_charged REAL NOT NULL DEFAULT 0.0,
        currency TEXT NOT NULL DEFAULT 'INR',
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- CRM V2 Phase 4: Scoring Rules
      CREATE TABLE IF NOT EXISTS crm_scoring_rules (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        rule_type TEXT NOT NULL,
        criteria TEXT NOT NULL DEFAULT '{}',
        points_change INTEGER NOT NULL DEFAULT 10,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- CRM V2 Phase 5: Workflows & Automations
      CREATE TABLE IF NOT EXISTS crm_workflows (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        trigger_type TEXT NOT NULL,
        trigger_config TEXT NOT NULL DEFAULT '{}',
        filter_criteria TEXT NOT NULL DEFAULT '{}',
        steps TEXT NOT NULL DEFAULT '[]',
        total_runs INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- CRM V2 Phase 5: Workflow Runs
      CREATE TABLE IF NOT EXISTS crm_workflow_runs (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        workflow_id TEXT NOT NULL REFERENCES crm_workflows(id) ON DELETE CASCADE,
        contact_id TEXT NOT NULL,
        status TEXT NOT NULL,
        current_step_index INTEGER NOT NULL DEFAULT 0,
        next_execution_at TEXT,
        execution_context TEXT NOT NULL DEFAULT '{}',
        error_message TEXT,
        started_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT
      );

      -- CRM V2 Phase 5: Workflow Step Logs
      CREATE TABLE IF NOT EXISTS crm_workflow_step_logs (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES crm_workflow_runs(id) ON DELETE CASCADE,
        workflow_id TEXT NOT NULL REFERENCES crm_workflows(id) ON DELETE CASCADE,
        step_index INTEGER NOT NULL,
        action_type TEXT NOT NULL,
        status TEXT NOT NULL,
        input_payload TEXT DEFAULT '{}',
        output_payload TEXT DEFAULT '{}',
        error_message TEXT,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- CRM V2 Phase 5: Compliance Policy Settings
      CREATE TABLE IF NOT EXISTS crm_compliance_policies (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL UNIQUE REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        max_messages_per_day INTEGER NOT NULL DEFAULT 3,
        quiet_hours_enabled INTEGER NOT NULL DEFAULT 1,
        quiet_hours_start TEXT NOT NULL DEFAULT '21:00',
        quiet_hours_end TEXT NOT NULL DEFAULT '09:00',
        auto_opt_out_keywords TEXT NOT NULL DEFAULT '["STOP", "UNSUBSCRIBE", "CANCEL", "ROK DO"]',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- CRM V2 Phase 6: Pipelines & Stages
      CREATE TABLE IF NOT EXISTS crm_pipelines (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS crm_pipeline_stages (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        pipeline_id TEXT NOT NULL REFERENCES crm_pipelines(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        order_index INTEGER NOT NULL DEFAULT 0,
        win_probability INTEGER NOT NULL DEFAULT 10,
        rotten_days INTEGER NOT NULL DEFAULT 14,
        is_won INTEGER NOT NULL DEFAULT 0,
        is_lost INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- CRM V2 Phase 6: Deals (Opportunities)
      CREATE TABLE IF NOT EXISTS crm_deals (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        pipeline_id TEXT NOT NULL REFERENCES crm_pipelines(id) ON DELETE CASCADE,
        stage_id TEXT NOT NULL REFERENCES crm_pipeline_stages(id) ON DELETE RESTRICT,
        contact_id TEXT,
        company_id TEXT REFERENCES crm_companies(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        amount REAL NOT NULL DEFAULT 0.0,
        currency TEXT NOT NULL DEFAULT 'USD',
        amount_usd REAL NOT NULL DEFAULT 0.0,
        expected_close_date TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        owner_user_id TEXT,
        custom_fields TEXT NOT NULL DEFAULT '{}',
        last_activity_at TEXT DEFAULT (datetime('now')),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- CRM V2 Phase 6: Tasks & SLA
      CREATE TABLE IF NOT EXISTS crm_tasks (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        deal_id TEXT REFERENCES crm_deals(id) ON DELETE CASCADE,
        contact_id TEXT,
        title TEXT NOT NULL,
        description TEXT,
        assigned_to_user_id TEXT,
        due_date TEXT,
        sla_minutes INTEGER,
        priority TEXT NOT NULL DEFAULT 'medium',
        status TEXT NOT NULL DEFAULT 'pending',
        completed_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- CRM V2 Phase 6: Presence & Collision Sessions
      CREATE TABLE IF NOT EXISTS crm_presence_sessions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL DEFAULT 'viewing',
        expires_at TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(workspace_id, entity_type, entity_id, user_id)
      );

      -- CRM V2 Phase 7: RBAC Role Permissions
      CREATE TABLE IF NOT EXISTS crm_role_permissions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        can_export INTEGER NOT NULL DEFAULT 1,
        can_bulk_delete INTEGER NOT NULL DEFAULT 0,
        can_view_phones INTEGER NOT NULL DEFAULT 1,
        can_view_emails INTEGER NOT NULL DEFAULT 1,
        can_view_sensitive_fields INTEGER NOT NULL DEFAULT 0,
        can_merge_contacts INTEGER NOT NULL DEFAULT 0,
        can_manage_api_keys INTEGER NOT NULL DEFAULT 0,
        can_manage_billing INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(workspace_id, role)
      );

      -- CRM V2 Phase 7: Sensitive Fields
      CREATE TABLE IF NOT EXISTS crm_sensitive_fields (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        field_key TEXT NOT NULL,
        entity_type TEXT NOT NULL DEFAULT 'contact',
        mask_strategy TEXT NOT NULL DEFAULT 'redact',
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(workspace_id, entity_type, field_key)
      );

      -- CRM V2 Phase 7: GDPR & DPDP Right-to-Erasure Certificates
      CREATE TABLE IF NOT EXISTS crm_erasure_certificates (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        contact_id TEXT NOT NULL,
        requester_email TEXT NOT NULL,
        records_purged INTEGER NOT NULL DEFAULT 1,
        audit_hash TEXT NOT NULL,
        erased_by_user_id TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // Dynamic schema checks for hot/cold archiving columns
    try {
      const contactCols = this.db.prepare('PRAGMA table_info(crm_contacts)').all() as any[];
      if (!contactCols.some((c) => c.name === 'is_archived')) {
        this.db.prepare('ALTER TABLE crm_contacts ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0').run();
      }
      if (!contactCols.some((c) => c.name === 'archived_at')) {
        this.db.prepare('ALTER TABLE crm_contacts ADD COLUMN archived_at TEXT').run();
      }
    } catch {}
  }

  // =========================================================================
  // WORKSPACES
  // =========================================================================
  public async getWorkspace(id: string): Promise<Workspace | null> {
    const row = this.db.prepare('SELECT * FROM crm_workspaces WHERE id = ?').get(id) as any;
    if (!row) return null;
    return {
      ...row,
      settings: JSON.parse(row.settings || '{}')
    };
  }

  public async getWorkspaceBySlug(slug: string): Promise<Workspace | null> {
    const row = this.db.prepare('SELECT * FROM crm_workspaces WHERE slug = ?').get(slug) as any;
    if (!row) return null;
    return {
      ...row,
      settings: JSON.parse(row.settings || '{}')
    };
  }

  public async getUserDefaultWorkspace(userId: string): Promise<Workspace> {
    // Check if member of any workspace
    const memberRow = this.db.prepare(`
      SELECT w.* FROM crm_workspaces w
      JOIN crm_workspace_members m ON m.workspace_id = w.id
      WHERE m.user_id = ?
      ORDER BY w.created_at ASC
      LIMIT 1
    `).get(userId) as any;

    if (memberRow) {
      return {
        ...memberRow,
        settings: JSON.parse(memberRow.settings || '{}')
      };
    }

    // Provision personal default workspace
    const userRow = this.db.prepare('SELECT username, name, company_name FROM users WHERE id = ?').get(userId) as any;
    const name = userRow?.company_name || `${userRow?.name || userRow?.username || 'User'}'s Workspace`;
    const baseSlug = (userRow?.username || 'user').toLowerCase().replace(/[^a-z0-9]/g, '');
    const slug = `${baseSlug}-ws-${Date.now().toString().slice(-4)}`;

    return this.createWorkspace(userId, name, slug);
  }

  public async getUserWorkspaces(userId: string): Promise<Workspace[]> {
    const rows = this.db.prepare(`
      SELECT w.*, m.role FROM crm_workspaces w
      JOIN crm_workspace_members m ON m.workspace_id = w.id
      WHERE m.user_id = ?
      ORDER BY w.name ASC
    `).all(userId) as any[];

    return rows.map((r) => ({
      ...r,
      settings: JSON.parse(r.settings || '{}')
    }));
  }

  public async createWorkspace(userId: string, name: string, slug?: string): Promise<Workspace> {
    const id = crypto.randomUUID();
    const finalSlug = slug || name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now().toString().slice(-4);

    const tx = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO crm_workspaces (id, name, slug, owner_user_id, settings, created_at, updated_at)
        VALUES (?, ?, ?, ?, '{}', datetime('now'), datetime('now'))
      `).run(id, name.trim(), finalSlug, userId);

      const memberId = crypto.randomUUID();
      this.db.prepare(`
        INSERT INTO crm_workspace_members (id, workspace_id, user_id, role, created_at, updated_at)
        VALUES (?, ?, ?, 'owner', datetime('now'), datetime('now'))
      `).run(memberId, id, userId);
    });

    tx();
    return this.getWorkspace(id) as Promise<Workspace>;
  }

  public async getWorkspaceMemberRole(workspaceId: string, userId: string): Promise<WorkspaceRole | null> {
    const row = this.db.prepare('SELECT role FROM crm_workspace_members WHERE workspace_id = ? AND user_id = ?').get(workspaceId, userId) as any;
    return row ? (row.role as WorkspaceRole) : null;
  }

  public async addWorkspaceMember(workspaceId: string, userId: string, role: WorkspaceRole): Promise<WorkspaceMember> {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO crm_workspace_members (id, workspace_id, user_id, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = excluded.role, updated_at = datetime('now')
    `).run(id, workspaceId, userId, role);

    const row = this.db.prepare('SELECT * FROM crm_workspace_members WHERE workspace_id = ? AND user_id = ?').get(workspaceId, userId) as any;
    return row;
  }

  public async listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    return this.db.prepare('SELECT * FROM crm_workspace_members WHERE workspace_id = ?').all(workspaceId) as any[];
  }

  // =========================================================================
  // CONTACTS (KEYSET / CURSOR PAGINATION ONLY)
  // =========================================================================
  public async listContacts(workspaceId: string, params: ContactListParams = {}): Promise<PaginatedResult<Contact>> {
    const limit = Math.min(200, Math.max(1, params.pagination?.limit || 50));
    const conditions: string[] = ['c.workspace_id = ?'];
    const sqlParams: any[] = [workspaceId];

    if (!params.includeDeleted) {
      conditions.push('c.deleted_at IS NULL');
    }

    // List membership filter
    if (params.listId) {
      conditions.push('EXISTS (SELECT 1 FROM crm_list_members lm WHERE lm.contact_id = c.id AND lm.list_id = ?)');
      sqlParams.push(params.listId);
    }

    // Tag filter
    if (params.tagId) {
      conditions.push('EXISTS (SELECT 1 FROM crm_contact_tags ct WHERE ct.contact_id = c.id AND ct.tag_id = ?)');
      sqlParams.push(params.tagId);
    }

    // General text search
    if (params.search && params.search.trim()) {
      const q = `%${params.search.trim()}%`;
      conditions.push(`(
        c.first_name LIKE ? OR
        c.last_name LIKE ? OR
        c.email LIKE ? OR
        c.phone LIKE ? OR
        comp.name LIKE ?
      )`);
      sqlParams.push(q, q, q, q, q);
    }

    // Dynamic Filter Builder
    if (params.filter && params.filter.conditions && params.filter.conditions.length > 0) {
      const fragment = CrmFilterBuilder.buildFilterClause(params.filter, false);
      if (fragment.sql && fragment.sql !== '1=1') {
        conditions.push(`(${fragment.sql})`);
        sqlParams.push(...fragment.params);
      }
    }

    // Keyset (Cursor) Pagination: (created_at, id) < (cursor_created_at, cursor_id)
    if (params.pagination?.cursor) {
      const cursor = CrmNormalizer.decodeCursor(params.pagination.cursor);
      if (cursor) {
        conditions.push('(c.created_at < ? OR (c.created_at = ? AND c.id < ?))');
        sqlParams.push(cursor.created_at, cursor.created_at, cursor.id);
      }
    }

    const whereClause = conditions.join(' AND ');

    // Keyset query + 1 to test if there are more
    const query = `
      SELECT c.*, comp.name as company_name
      FROM crm_contacts c
      LEFT JOIN crm_companies comp ON comp.id = c.company_id
      WHERE ${whereClause}
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT ?
    `;

    sqlParams.push(limit + 1);
    const rows = this.db.prepare(query).all(...sqlParams) as any[];

    const hasMore = rows.length > limit;
    const resultRows = hasMore ? rows.slice(0, limit) : rows;

    let nextCursor: string | null = null;
    if (hasMore && resultRows.length > 0) {
      const last = resultRows[resultRows.length - 1];
      nextCursor = CrmNormalizer.encodeCursor({ created_at: last.created_at, id: last.id });
    }

    const contacts: Contact[] = resultRows.map((r) => this.mapContactRow(r));

    // Approximate total count
    const countRow = this.db.prepare(`SELECT count(*) as total FROM crm_contacts c WHERE c.workspace_id = ? AND c.deleted_at IS NULL`).get(workspaceId) as any;

    return {
      data: contacts,
      next_cursor: nextCursor,
      prev_cursor: null,
      has_more: hasMore,
      approximate_total: countRow?.total || 0
    };
  }

  public async getContact(workspaceId: string, contactId: string): Promise<Contact | null> {
    const row = this.db.prepare(`
      SELECT c.*, comp.name as company_name
      FROM crm_contacts c
      LEFT JOIN crm_companies comp ON comp.id = c.company_id
      WHERE c.workspace_id = ? AND c.id = ?
    `).get(workspaceId, contactId) as any;

    if (!row) return null;
    const contact = this.mapContactRow(row);

    // Fetch tags
    const tagRows = this.db.prepare(`
      SELECT t.name FROM crm_tags t
      JOIN crm_contact_tags ct ON ct.tag_id = t.id
      WHERE ct.contact_id = ?
    `).all(contactId) as any[];
    contact.tags = tagRows.map((t) => t.name);

    return contact;
  }

  public async createContact(workspaceId: string, data: Partial<Contact>): Promise<Contact> {
    const id = data.id || crypto.randomUUID();
    const emailNorm = CrmNormalizer.normalizeEmail(data.email);
    const phoneE164 = CrmNormalizer.normalizePhone(data.phone);

    let companyId = data.company_id || null;
    if (!companyId && data.company_name) {
      try {
        const comp = await this.findOrCreateCompanyByDomain(workspaceId, data.company_name);
        companyId = comp.id;
      } catch {}
    }

    this.db.prepare(`
      INSERT INTO crm_contacts (
        id, workspace_id, first_name, last_name, email, email_normalized,
        phone, phone_e164, company_id, title, country, city,
        source, source_id, lead_score, status, custom_fields,
        email_status, verified_at, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, datetime('now'), datetime('now')
      )
    `).run(
      id,
      workspaceId,
      CrmNormalizer.cleanText(data.first_name),
      CrmNormalizer.cleanText(data.last_name),
      CrmNormalizer.cleanText(data.email),
      emailNorm,
      CrmNormalizer.cleanText(data.phone),
      phoneE164,
      companyId,
      CrmNormalizer.cleanText(data.title),
      CrmNormalizer.cleanText(data.country),
      CrmNormalizer.cleanText(data.city),
      data.source || 'manual',
      data.source_id || null,
      Number(data.lead_score || 0),
      data.status || 'new',
      JSON.stringify(data.custom_fields || {}),
      data.email_status || 'unknown',
      data.verified_at || null
    );

    return (await this.getContact(workspaceId, id))!;
  }

  public async bulkUpsertContacts(
    workspaceId: string,
    contacts: Partial<Contact>[],
    dedupeRule: ImportDedupeRule = 'update'
  ): Promise<{ inserted: number; updated: number; skipped: number; errors: any[] }> {
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const errors: any[] = [];

    const insertStmt = this.db.prepare(`
      INSERT INTO crm_contacts (
        id, workspace_id, first_name, last_name, email, email_normalized,
        phone, phone_e164, company_id, title, country, city,
        source, source_id, lead_score, status, custom_fields,
        email_status, verified_at, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, datetime('now'), datetime('now')
      )
    `);

    const updateStmt = this.db.prepare(`
      UPDATE crm_contacts SET
        first_name = COALESCE(?, first_name),
        last_name = COALESCE(?, last_name),
        phone = COALESCE(?, phone),
        phone_e164 = COALESCE(?, phone_e164),
        company_id = COALESCE(?, company_id),
        title = COALESCE(?, title),
        country = COALESCE(?, country),
        city = COALESCE(?, city),
        status = COALESCE(?, status),
        custom_fields = ?,
        updated_at = datetime('now')
      WHERE workspace_id = ? AND id = ?
    `);

    const findByEmailStmt = this.db.prepare(`
      SELECT id, custom_fields FROM crm_contacts
      WHERE workspace_id = ? AND email_normalized = ? AND deleted_at IS NULL
      LIMIT 1
    `);

    const findByPhoneStmt = this.db.prepare(`
      SELECT id, custom_fields FROM crm_contacts
      WHERE workspace_id = ? AND phone_e164 = ? AND deleted_at IS NULL
      LIMIT 1
    `);

    const tx = this.db.transaction(() => {
      for (const c of contacts) {
        try {
          const emailNorm = CrmNormalizer.normalizeEmail(c.email);
          const phoneE164 = CrmNormalizer.normalizePhone(c.phone);

          if (!emailNorm && !phoneE164 && !c.first_name && !c.last_name) {
            skipped++;
            continue;
          }

          let existing: any = null;
          if (emailNorm) {
            existing = findByEmailStmt.get(workspaceId, emailNorm);
          }
          if (!existing && phoneE164) {
            existing = findByPhoneStmt.get(workspaceId, phoneE164);
          }

          if (existing) {
            if (dedupeRule === 'skip') {
              skipped++;
              continue;
            }

            // Merge or update custom fields
            const existingCustom = JSON.parse(existing.custom_fields || '{}');
            const mergedCustom = dedupeRule === 'merge'
              ? { ...existingCustom, ...(c.custom_fields || {}) }
              : (c.custom_fields || existingCustom);

            updateStmt.run(
              CrmNormalizer.cleanText(c.first_name),
              CrmNormalizer.cleanText(c.last_name),
              CrmNormalizer.cleanText(c.phone),
              phoneE164,
              c.company_id || null,
              CrmNormalizer.cleanText(c.title),
              CrmNormalizer.cleanText(c.country),
              CrmNormalizer.cleanText(c.city),
              c.status || null,
              JSON.stringify(mergedCustom),
              workspaceId,
              existing.id
            );
            updated++;
          } else {
            const id = c.id || crypto.randomUUID();
            insertStmt.run(
              id,
              workspaceId,
              CrmNormalizer.cleanText(c.first_name),
              CrmNormalizer.cleanText(c.last_name),
              CrmNormalizer.cleanText(c.email),
              emailNorm,
              CrmNormalizer.cleanText(c.phone),
              phoneE164,
              c.company_id || null,
              CrmNormalizer.cleanText(c.title),
              CrmNormalizer.cleanText(c.country),
              CrmNormalizer.cleanText(c.city),
              c.source || 'import',
              c.source_id || null,
              Number(c.lead_score || 0),
              c.status || 'new',
              JSON.stringify(c.custom_fields || {}),
              c.email_status || 'unknown',
              c.verified_at || null
            );
            inserted++;
          }
        } catch (err: any) {
          errors.push({ contact: c, error: err.message });
        }
      }
    });

    tx();
    return { inserted, updated, skipped, errors };
  }

  public async updateContact(workspaceId: string, contactId: string, data: Partial<Contact>): Promise<Contact> {
    const existing = await this.getContact(workspaceId, contactId);
    if (!existing) {
      throw new Error(`Contact not found: ${contactId}`);
    }

    const emailNorm = data.email !== undefined ? CrmNormalizer.normalizeEmail(data.email) : existing.email_normalized;
    const phoneE164 = data.phone !== undefined ? CrmNormalizer.normalizePhone(data.phone) : existing.phone_e164;
    const customFields = data.custom_fields !== undefined ? { ...existing.custom_fields, ...data.custom_fields } : existing.custom_fields;

    this.db.prepare(`
      UPDATE crm_contacts SET
        first_name = COALESCE(?, first_name),
        last_name = COALESCE(?, last_name),
        email = COALESCE(?, email),
        email_normalized = ?,
        phone = COALESCE(?, phone),
        phone_e164 = ?,
        company_id = COALESCE(?, company_id),
        title = COALESCE(?, title),
        country = COALESCE(?, country),
        city = COALESCE(?, city),
        status = COALESCE(?, status),
        lead_score = COALESCE(?, lead_score),
        custom_fields = ?,
        email_status = COALESCE(?, email_status),
        updated_at = datetime('now')
      WHERE workspace_id = ? AND id = ?
    `).run(
      data.first_name !== undefined ? CrmNormalizer.cleanText(data.first_name) : null,
      data.last_name !== undefined ? CrmNormalizer.cleanText(data.last_name) : null,
      data.email !== undefined ? CrmNormalizer.cleanText(data.email) : null,
      emailNorm,
      data.phone !== undefined ? CrmNormalizer.cleanText(data.phone) : null,
      phoneE164,
      data.company_id !== undefined ? data.company_id : null,
      data.title !== undefined ? CrmNormalizer.cleanText(data.title) : null,
      data.country !== undefined ? CrmNormalizer.cleanText(data.country) : null,
      data.city !== undefined ? CrmNormalizer.cleanText(data.city) : null,
      data.status || null,
      data.lead_score !== undefined ? data.lead_score : null,
      JSON.stringify(customFields),
      data.email_status || null,
      workspaceId,
      contactId
    );

    const updated = (await this.getContact(workspaceId, contactId))!;

    // Track field delta history
    const trackedKeys: (keyof Contact)[] = ['first_name', 'last_name', 'email', 'phone', 'title', 'company_name', 'status', 'lead_score', 'city', 'country'];
    for (const key of trackedKeys) {
      if (data[key] !== undefined && data[key] !== existing[key]) {
        this.logFieldChange(workspaceId, {
          entity_type: 'contact',
          entity_id: contactId,
          field_name: String(key),
          old_value: existing[key],
          new_value: data[key],
          source: (data as any).change_source || 'manual_ui'
        }).catch(() => {});
      }
    }

    this.emitOutboxEvent(workspaceId, 'contact.updated', 'contact', contactId, { previous: existing, current: updated }).catch(() => {});
    return updated;
  }

  public async deleteContact(workspaceId: string, contactId: string, soft: boolean = true): Promise<boolean> {
    if (soft) {
      this.db.prepare(`
        UPDATE crm_contacts SET deleted_at = datetime('now'), updated_at = datetime('now')
        WHERE workspace_id = ? AND id = ?
      `).run(workspaceId, contactId);
    } else {
      this.db.prepare(`DELETE FROM crm_contacts WHERE workspace_id = ? AND id = ?`).run(workspaceId, contactId);
    }
    this.emitOutboxEvent(workspaceId, 'contact.deleted', 'contact', contactId, { soft }).catch(() => {});
    return true;
  }

  public async restoreContact(workspaceId: string, contactId: string): Promise<boolean> {
    this.db.prepare(`
      UPDATE crm_contacts SET deleted_at = NULL, updated_at = datetime('now')
      WHERE workspace_id = ? AND id = ?
    `).run(workspaceId, contactId);
    this.emitOutboxEvent(workspaceId, 'contact.restored', 'contact', contactId, { restored: true }).catch(() => {});
    return true;
  }

  public async archiveContact(workspaceId: string, contactId: string): Promise<boolean> {
    const res = this.db.prepare(`
      UPDATE crm_contacts SET is_archived = 1, archived_at = datetime('now'), updated_at = datetime('now')
      WHERE workspace_id = ? AND id = ?
    `).run(workspaceId, contactId);
    if (res.changes > 0) {
      this.emitOutboxEvent(workspaceId, 'contact.archived', 'contact', contactId, { is_archived: true }).catch(() => {});
      return true;
    }
    return false;
  }

  public async unarchiveContact(workspaceId: string, contactId: string): Promise<boolean> {
    const res = this.db.prepare(`
      UPDATE crm_contacts SET is_archived = 0, archived_at = NULL, updated_at = datetime('now')
      WHERE workspace_id = ? AND id = ?
    `).run(workspaceId, contactId);
    if (res.changes > 0) {
      this.emitOutboxEvent(workspaceId, 'contact.unarchived', 'contact', contactId, { is_archived: false }).catch(() => {});
      return true;
    }
    return false;
  }

  public async findDuplicates(workspaceId: string, limit: number = 50): Promise<Array<{ field: string; value: string; contact_ids: string[]; contacts: Contact[] }>> {
    // Duplicates on email
    const emailDupes = this.db.prepare(`
      SELECT email_normalized as val, count(*) as cnt, group_concat(id) as ids
      FROM crm_contacts
      WHERE workspace_id = ? AND email_normalized IS NOT NULL AND deleted_at IS NULL
      GROUP BY email_normalized
      HAVING count(*) > 1
      LIMIT ?
    `).all(workspaceId, limit) as any[];

    // Duplicates on phone
    const phoneDupes = this.db.prepare(`
      SELECT phone_e164 as val, count(*) as cnt, group_concat(id) as ids
      FROM crm_contacts
      WHERE workspace_id = ? AND phone_e164 IS NOT NULL AND deleted_at IS NULL
      GROUP BY phone_e164
      HAVING count(*) > 1
      LIMIT ?
    `).all(workspaceId, limit) as any[];

    const results: Array<{ field: string; value: string; contact_ids: string[]; contacts: Contact[] }> = [];

    for (const d of emailDupes) {
      const ids = d.ids.split(',');
      const contacts: Contact[] = [];
      for (const id of ids) {
        const c = await this.getContact(workspaceId, id);
        if (c) contacts.push(c);
      }
      results.push({ field: 'email', value: d.val, contact_ids: ids, contacts });
    }

    for (const d of phoneDupes) {
      const ids = d.ids.split(',');
      const contacts: Contact[] = [];
      for (const id of ids) {
        const c = await this.getContact(workspaceId, id);
        if (c) contacts.push(c);
      }
      results.push({ field: 'phone', value: d.val, contact_ids: ids, contacts });
    }

    return results;
  }

  public async mergeContacts(
    workspaceId: string,
    primaryId: string,
    duplicateId: string,
    fieldResolutions: Record<string, any> = {}
  ): Promise<Contact> {
    const primary = await this.getContact(workspaceId, primaryId);
    const duplicate = await this.getContact(workspaceId, duplicateId);
    if (!primary || !duplicate) {
      throw new Error('Primary or duplicate contact not found.');
    }

    const mergedData: Partial<Contact> = {
      first_name: fieldResolutions.first_name || primary.first_name || duplicate.first_name,
      last_name: fieldResolutions.last_name || primary.last_name || duplicate.last_name,
      email: fieldResolutions.email || primary.email || duplicate.email,
      phone: fieldResolutions.phone || primary.phone || duplicate.phone,
      company_id: fieldResolutions.company_id || primary.company_id || duplicate.company_id,
      title: fieldResolutions.title || primary.title || duplicate.title,
      country: fieldResolutions.country || primary.country || duplicate.country,
      city: fieldResolutions.city || primary.city || duplicate.city,
      status: fieldResolutions.status || primary.status || duplicate.status,
      custom_fields: { ...duplicate.custom_fields, ...primary.custom_fields, ...(fieldResolutions.custom_fields || {}) }
    };

    const tx = this.db.transaction(() => {
      // Re-link list memberships and tags
      this.db.prepare(`
        INSERT OR IGNORE INTO crm_list_members (id, workspace_id, list_id, contact_id, added_at)
        SELECT lower(hex(randomblob(16))), workspace_id, list_id, ?, added_at
        FROM crm_list_members WHERE contact_id = ?
      `).run(primaryId, duplicateId);

      this.db.prepare(`
        INSERT OR IGNORE INTO crm_contact_tags (workspace_id, contact_id, tag_id, created_at)
        SELECT workspace_id, ?, tag_id, created_at
        FROM crm_contact_tags WHERE contact_id = ?
      `).run(primaryId, duplicateId);

      // Re-link activities
      this.db.prepare('UPDATE crm_activities SET contact_id = ? WHERE contact_id = ?').run(primaryId, duplicateId);

      // Record merge audit with duplicate snapshot for UNMERGE
      const mergeId = crypto.randomUUID();
      this.db.prepare(`
        INSERT INTO crm_contact_merges (
          id, workspace_id, primary_contact_id, merged_contact_id, merged_contact_snapshot, survivorship_rules_applied, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(mergeId, workspaceId, primaryId, duplicateId, JSON.stringify(duplicate), JSON.stringify(fieldResolutions));

      // Soft delete duplicate
      this.deleteContact(workspaceId, duplicateId, true);
    });

    tx();
    const updated = await this.updateContact(workspaceId, primaryId, mergedData);
    this.emitOutboxEvent(workspaceId, 'contact.merged', 'contact', primaryId, { primary_id: primaryId, duplicate_id: duplicateId }).catch(() => {});
    return updated;
  }

  public async getApproximateContactCount(workspaceId: string, filter?: FilterGroup): Promise<number> {
    if (!filter || !filter.conditions || filter.conditions.length === 0) {
      const row = this.db.prepare('SELECT count(*) as cnt FROM crm_contacts WHERE workspace_id = ? AND deleted_at IS NULL').get(workspaceId) as any;
      return row?.cnt || 0;
    }

    const fragment = CrmFilterBuilder.buildFilterClause(filter, false);
    const row = this.db.prepare(`
      SELECT count(*) as cnt 
      FROM crm_contacts c
      LEFT JOIN crm_companies comp ON comp.id = c.company_id
      WHERE c.workspace_id = ? AND c.deleted_at IS NULL AND ${fragment.sql}
    `).get(workspaceId, ...fragment.params) as any;
    return row?.cnt || 0;
  }

  // =========================================================================
  // COMPANIES
  // =========================================================================
  public async getCompany(workspaceId: string, companyId: string): Promise<Company | null> {
    const row = this.db.prepare(`
      SELECT comp.*, (SELECT count(*) FROM crm_contacts c WHERE c.company_id = comp.id AND c.deleted_at IS NULL) as contacts_count
      FROM crm_companies comp
      WHERE comp.workspace_id = ? AND comp.id = ? AND comp.deleted_at IS NULL
    `).get(workspaceId, companyId) as any;

    if (!row) return null;
    return {
      ...row,
      custom_fields: JSON.parse(row.custom_fields || '{}')
    };
  }

  public async listCompanies(workspaceId: string, search?: string, limit: number = 50): Promise<Company[]> {
    let query = `
      SELECT comp.*, (SELECT count(*) FROM crm_contacts c WHERE c.company_id = comp.id AND c.deleted_at IS NULL) as contacts_count
      FROM crm_companies comp
      WHERE comp.workspace_id = ? AND comp.deleted_at IS NULL
    `;
    const params: any[] = [workspaceId];

    if (search && search.trim()) {
      query += ' AND (comp.name LIKE ? OR comp.domain LIKE ?)';
      params.push(`%${search.trim()}%`, `%${search.trim()}%`);
    }

    query += ' ORDER BY comp.name ASC LIMIT ?';
    params.push(limit);

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map((r) => ({
      ...r,
      custom_fields: JSON.parse(r.custom_fields || '{}')
    }));
  }

  public async createCompany(workspaceId: string, data: Partial<Company>): Promise<Company> {
    const id = data.id || crypto.randomUUID();
    const domain = CrmNormalizer.extractDomain(data.domain || data.website);

    this.db.prepare(`
      INSERT INTO crm_companies (
        id, workspace_id, name, domain, industry, size_range,
        country, city, phone, website, linkedin_url, custom_fields,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        datetime('now'), datetime('now')
      )
    `).run(
      id,
      workspaceId,
      (data.name || 'Unnamed Company').trim(),
      domain,
      data.industry || null,
      data.size_range || null,
      data.country || null,
      data.city || null,
      data.phone || null,
      data.website || null,
      data.linkedin_url || null,
      JSON.stringify(data.custom_fields || {})
    );

    return (await this.getCompany(workspaceId, id))!;
  }

  public async updateCompany(workspaceId: string, companyId: string, data: Partial<Company>): Promise<Company> {
    const existing = await this.getCompany(workspaceId, companyId);
    if (!existing) throw new Error('Company not found');

    this.db.prepare(`
      UPDATE crm_companies SET
        name = COALESCE(?, name),
        domain = COALESCE(?, domain),
        industry = COALESCE(?, industry),
        size_range = COALESCE(?, size_range),
        country = COALESCE(?, country),
        city = COALESCE(?, city),
        phone = COALESCE(?, phone),
        website = COALESCE(?, website),
        linkedin_url = COALESCE(?, linkedin_url),
        custom_fields = ?,
        updated_at = datetime('now')
      WHERE workspace_id = ? AND id = ?
    `).run(
      data.name ? data.name.trim() : null,
      data.domain !== undefined ? CrmNormalizer.extractDomain(data.domain) : null,
      data.industry !== undefined ? data.industry : null,
      data.size_range !== undefined ? data.size_range : null,
      data.country !== undefined ? data.country : null,
      data.city !== undefined ? data.city : null,
      data.phone !== undefined ? data.phone : null,
      data.website !== undefined ? data.website : null,
      data.linkedin_url !== undefined ? data.linkedin_url : null,
      JSON.stringify({ ...existing.custom_fields, ...(data.custom_fields || {}) }),
      workspaceId,
      companyId
    );

    return (await this.getCompany(workspaceId, companyId))!;
  }

  public async findOrCreateCompanyByDomain(workspaceId: string, name: string, domainOrUrl?: string): Promise<Company> {
    const domain = CrmNormalizer.extractDomain(domainOrUrl);
    if (domain) {
      const existing = this.db.prepare('SELECT id FROM crm_companies WHERE workspace_id = ? AND domain = ? AND deleted_at IS NULL').get(workspaceId, domain) as any;
      if (existing) {
        return (await this.getCompany(workspaceId, existing.id))!;
      }
    }

    return this.createCompany(workspaceId, { name, domain });
  }

  // =========================================================================
  // LISTS & SEGMENTS
  // =========================================================================
  public async listLists(workspaceId: string): Promise<CrmList[]> {
    const rows = this.db.prepare('SELECT * FROM crm_lists WHERE workspace_id = ? ORDER BY name ASC').all(workspaceId) as any[];
    return rows.map((r) => ({
      ...r,
      is_dynamic: Boolean(r.is_dynamic),
      filter_definition: r.filter_definition ? JSON.parse(r.filter_definition) : null
    }));
  }

  public async getList(workspaceId: string, listId: string): Promise<CrmList | null> {
    const row = this.db.prepare('SELECT * FROM crm_lists WHERE workspace_id = ? AND id = ?').get(workspaceId, listId) as any;
    if (!row) return null;
    return {
      ...row,
      is_dynamic: Boolean(row.is_dynamic),
      filter_definition: row.filter_definition ? JSON.parse(row.filter_definition) : null
    };
  }

  public async createList(workspaceId: string, name: string, description?: string, isDynamic: boolean = false, filterDef?: FilterGroup): Promise<CrmList> {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO crm_lists (id, workspace_id, name, description, is_dynamic, filter_definition, cached_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
    `).run(id, workspaceId, name.trim(), description || null, isDynamic ? 1 : 0, filterDef ? JSON.stringify(filterDef) : null);

    return (await this.getList(workspaceId, id))!;
  }

  public async updateList(workspaceId: string, listId: string, data: Partial<CrmList>): Promise<CrmList> {
    this.db.prepare(`
      UPDATE crm_lists SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        filter_definition = COALESCE(?, filter_definition),
        updated_at = datetime('now')
      WHERE workspace_id = ? AND id = ?
    `).run(
      data.name ? data.name.trim() : null,
      data.description !== undefined ? data.description : null,
      data.filter_definition !== undefined ? JSON.stringify(data.filter_definition) : null,
      workspaceId,
      listId
    );

    return (await this.getList(workspaceId, listId))!;
  }

  public async deleteList(workspaceId: string, listId: string): Promise<boolean> {
    this.db.prepare('DELETE FROM crm_lists WHERE workspace_id = ? AND id = ?').run(workspaceId, listId);
    return true;
  }

  public async addContactsToList(workspaceId: string, listId: string, contactIds: string[]): Promise<number> {
    let added = 0;
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO crm_list_members (id, workspace_id, list_id, contact_id, added_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `);

    const tx = this.db.transaction(() => {
      for (const cid of contactIds) {
        const res = stmt.run(crypto.randomUUID(), workspaceId, listId, cid);
        if (res.changes > 0) added++;
      }
    });

    tx();
    await this.refreshListCount(workspaceId, listId);
    return added;
  }

  public async removeContactsFromList(workspaceId: string, listId: string, contactIds: string[]): Promise<number> {
    let removed = 0;
    const stmt = this.db.prepare('DELETE FROM crm_list_members WHERE workspace_id = ? AND list_id = ? AND contact_id = ?');

    const tx = this.db.transaction(() => {
      for (const cid of contactIds) {
        const res = stmt.run(workspaceId, listId, cid);
        removed += res.changes;
      }
    });

    tx();
    await this.refreshListCount(workspaceId, listId);
    return removed;
  }

  public async refreshListCount(workspaceId: string, listId: string): Promise<number> {
    const list = await this.getList(workspaceId, listId);
    if (!list) return 0;

    let count = 0;
    if (list.is_dynamic && list.filter_definition) {
      count = await this.getApproximateContactCount(workspaceId, list.filter_definition);
    } else {
      const row = this.db.prepare('SELECT count(*) as cnt FROM crm_list_members WHERE list_id = ?').get(listId) as any;
      count = row?.cnt || 0;
    }

    this.db.prepare('UPDATE crm_lists SET cached_count = ?, last_counted_at = datetime("now") WHERE id = ?').run(count, listId);
    return count;
  }

  // =========================================================================
  // TAGS
  // =========================================================================
  public async listTags(workspaceId: string): Promise<CrmTag[]> {
    const rows = this.db.prepare(`
      SELECT t.*, (SELECT count(*) FROM crm_contact_tags ct WHERE ct.tag_id = t.id) as contacts_count
      FROM crm_tags t
      WHERE t.workspace_id = ?
      ORDER BY t.name ASC
    `).all(workspaceId) as any[];

    return rows;
  }

  public async createTag(workspaceId: string, name: string, color: string = '#3b82f6'): Promise<CrmTag> {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO crm_tags (id, workspace_id, name, color, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT (workspace_id, name) DO UPDATE SET color = excluded.color
    `).run(id, workspaceId, name.trim(), color);

    const row = this.db.prepare('SELECT * FROM crm_tags WHERE workspace_id = ? AND name = ?').get(workspaceId, name.trim()) as any;
    return row;
  }

  public async deleteTag(workspaceId: string, tagId: string): Promise<boolean> {
    this.db.prepare('DELETE FROM crm_tags WHERE workspace_id = ? AND id = ?').run(workspaceId, tagId);
    return true;
  }

  public async tagContacts(workspaceId: string, tagId: string, contactIds: string[]): Promise<number> {
    let tagged = 0;
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO crm_contact_tags (workspace_id, contact_id, tag_id, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `);

    const tx = this.db.transaction(() => {
      for (const cid of contactIds) {
        const res = stmt.run(workspaceId, cid, tagId);
        if (res.changes > 0) tagged++;
      }
    });

    tx();
    return tagged;
  }

  public async untagContacts(workspaceId: string, tagId: string, contactIds: string[]): Promise<number> {
    let removed = 0;
    const stmt = this.db.prepare('DELETE FROM crm_contact_tags WHERE workspace_id = ? AND tag_id = ? AND contact_id = ?');

    const tx = this.db.transaction(() => {
      for (const cid of contactIds) {
        const res = stmt.run(workspaceId, tagId, cid);
        removed += res.changes;
      }
    });

    tx();
    return removed;
  }

  // =========================================================================
  // CUSTOM FIELDS
  // =========================================================================
  public async listCustomFields(workspaceId: string, entity: 'contact' | 'company' = 'contact'): Promise<CustomFieldDefinition[]> {
    const rows = this.db.prepare(`
      SELECT * FROM crm_custom_field_definitions
      WHERE workspace_id = ? AND target_entity = ?
      ORDER BY name ASC
    `).all(workspaceId, entity) as any[];

    return rows.map((r) => ({
      ...r,
      is_required: Boolean(r.is_required),
      options: JSON.parse(r.options || '[]')
    }));
  }

  public async createCustomField(workspaceId: string, data: Partial<CustomFieldDefinition>): Promise<CustomFieldDefinition> {
    const id = crypto.randomUUID();
    const fieldKey = (data.field_key || data.name || '').toLowerCase().replace(/[^a-z0-9_]/g, '_');

    this.db.prepare(`
      INSERT INTO crm_custom_field_definitions (
        id, workspace_id, target_entity, name, field_key, field_type, options, is_required, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      id,
      workspaceId,
      data.target_entity || 'contact',
      (data.name || fieldKey).trim(),
      fieldKey,
      data.field_type || 'text',
      JSON.stringify(data.options || []),
      data.is_required ? 1 : 0
    );

    const row = this.db.prepare('SELECT * FROM crm_custom_field_definitions WHERE id = ?').get(id) as any;
    return {
      ...row,
      is_required: Boolean(row.is_required),
      options: JSON.parse(row.options || '[]')
    };
  }

  public async deleteCustomField(workspaceId: string, fieldId: string): Promise<boolean> {
    this.db.prepare('DELETE FROM crm_custom_field_definitions WHERE workspace_id = ? AND id = ?').run(workspaceId, fieldId);
    return true;
  }

  // =========================================================================
  // ACTIVITIES TIMELINE
  // =========================================================================
  public async listActivities(workspaceId: string, contactId: string, limit: number = 50): Promise<ActivityTimelineItem[]> {
    const rows = this.db.prepare(`
      SELECT * FROM crm_activities
      WHERE workspace_id = ? AND contact_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(workspaceId, contactId, limit) as any[];

    return rows.map((r) => ({
      ...r,
      details: JSON.parse(r.details || '{}')
    }));
  }

  public async logActivity(workspaceId: string, activity: Partial<ActivityTimelineItem>): Promise<ActivityTimelineItem> {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO crm_activities (id, workspace_id, contact_id, user_id, type, title, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      id,
      workspaceId,
      activity.contact_id,
      activity.user_id || null,
      activity.type || 'note',
      activity.title || 'Note',
      JSON.stringify(activity.details || {})
    );

    const row = this.db.prepare('SELECT * FROM crm_activities WHERE id = ?').get(id) as any;
    return {
      ...row,
      details: JSON.parse(row.details || '{}')
    };
  }

  // =========================================================================
  // IMPORTS
  // =========================================================================
  public async createImport(workspaceId: string, data: Partial<CrmImport>): Promise<CrmImport> {
    const id = data.id || crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO crm_imports (
        id, workspace_id, user_id, filename, file_path, total_rows, processed_rows,
        imported_rows, updated_rows, skipped_rows, error_rows, dedupe_rule,
        column_mapping, list_id, status, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, 0,
        0, 0, 0, 0, ?,
        ?, ?, 'pending', datetime('now')
      )
    `).run(
      id,
      workspaceId,
      data.user_id || 'system',
      data.filename || 'import.csv',
      data.file_path || null,
      data.total_rows || 0,
      data.dedupe_rule || 'update',
      JSON.stringify(data.column_mapping || {}),
      data.list_id || null
    );

    return (await this.getImport(workspaceId, id))!;
  }

  public async getImport(workspaceId: string, importId: string): Promise<CrmImport | null> {
    const row = this.db.prepare('SELECT * FROM crm_imports WHERE workspace_id = ? AND id = ?').get(workspaceId, importId) as any;
    if (!row) return null;
    return {
      ...row,
      column_mapping: JSON.parse(row.column_mapping || '{}')
    };
  }

  public async updateImport(workspaceId: string, importId: string, updates: Partial<CrmImport>): Promise<CrmImport> {
    this.db.prepare(`
      UPDATE crm_imports SET
        total_rows = COALESCE(?, total_rows),
        processed_rows = COALESCE(?, processed_rows),
        imported_rows = COALESCE(?, imported_rows),
        updated_rows = COALESCE(?, updated_rows),
        skipped_rows = COALESCE(?, skipped_rows),
        error_rows = COALESCE(?, error_rows),
        status = COALESCE(?, status),
        error_report_url = COALESCE(?, error_report_url),
        error_details = COALESCE(?, error_details),
        completed_at = CASE WHEN ? IN ('completed', 'failed') THEN datetime('now') ELSE completed_at END
      WHERE workspace_id = ? AND id = ?
    `).run(
      updates.total_rows !== undefined ? updates.total_rows : null,
      updates.processed_rows !== undefined ? updates.processed_rows : null,
      updates.imported_rows !== undefined ? updates.imported_rows : null,
      updates.updated_rows !== undefined ? updates.updated_rows : null,
      updates.skipped_rows !== undefined ? updates.skipped_rows : null,
      updates.error_rows !== undefined ? updates.error_rows : null,
      updates.status || null,
      updates.error_report_url || null,
      updates.error_details || null,
      updates.status || null,
      workspaceId,
      importId
    );

    return (await this.getImport(workspaceId, importId))!;
  }

  public async listImports(workspaceId: string, limit: number = 20): Promise<CrmImport[]> {
    const rows = this.db.prepare('SELECT * FROM crm_imports WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?').all(workspaceId, limit) as any[];
    return rows.map((r) => ({
      ...r,
      column_mapping: JSON.parse(r.column_mapping || '{}')
    }));
  }

  // =========================================================================
  // EXPORTS
  // =========================================================================
  public async createExport(workspaceId: string, data: Partial<CrmExport>): Promise<CrmExport> {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO crm_exports (
        id, workspace_id, user_id, format, total_records, filter_definition,
        status, file_path, download_url, expires_at, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        'pending', ?, ?, datetime('now', '+7 days'), datetime('now')
      )
    `).run(
      id,
      workspaceId,
      data.user_id || 'system',
      data.format || 'csv',
      data.total_records || 0,
      data.filter_definition ? JSON.stringify(data.filter_definition) : null,
      data.file_path || null,
      data.download_url || null
    );

    return (await this.getExport(workspaceId, id))!;
  }

  public async getExport(workspaceId: string, exportId: string): Promise<CrmExport | null> {
    const row = this.db.prepare('SELECT * FROM crm_exports WHERE workspace_id = ? AND id = ?').get(workspaceId, exportId) as any;
    if (!row) return null;
    return {
      ...row,
      filter_definition: row.filter_definition ? JSON.parse(row.filter_definition) : null
    };
  }

  public async updateExport(workspaceId: string, exportId: string, updates: Partial<CrmExport>): Promise<CrmExport> {
    this.db.prepare(`
      UPDATE crm_exports SET
        status = COALESCE(?, status),
        total_records = COALESCE(?, total_records),
        file_path = COALESCE(?, file_path),
        download_url = COALESCE(?, download_url),
        completed_at = CASE WHEN ? IN ('completed', 'failed') THEN datetime('now') ELSE completed_at END
      WHERE workspace_id = ? AND id = ?
    `).run(
      updates.status || null,
      updates.total_records !== undefined ? updates.total_records : null,
      updates.file_path || null,
      updates.download_url || null,
      updates.status || null,
      workspaceId,
      exportId
    );

    return (await this.getExport(workspaceId, exportId))!;
  }

  public async listExports(workspaceId: string, limit: number = 20): Promise<CrmExport[]> {
    const rows = this.db.prepare('SELECT * FROM crm_exports WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?').all(workspaceId, limit) as any[];
    return rows.map((r) => ({
      ...r,
      filter_definition: r.filter_definition ? JSON.parse(r.filter_definition) : null
    }));
  }

  // =========================================================================
  // SUPPRESSION LIST
  // =========================================================================
  public async checkSuppressed(workspaceId: string, params: { email?: string; phone?: string; domain?: string }): Promise<boolean> {
    const emailNorm = CrmNormalizer.normalizeEmail(params.email);
    const phoneE164 = CrmNormalizer.normalizePhone(params.phone);
    const domain = CrmNormalizer.extractDomain(params.domain || params.email);

    const row = this.db.prepare(`
      SELECT 1 FROM crm_suppression_list
      WHERE workspace_id = ? AND (
        (type = 'email' AND value_normalized = ? AND ? IS NOT NULL) OR
        (type = 'phone' AND value_normalized = ? AND ? IS NOT NULL) OR
        (type = 'domain' AND value_normalized = ? AND ? IS NOT NULL)
      )
      LIMIT 1
    `).get(
      workspaceId,
      emailNorm, emailNorm,
      phoneE164, phoneE164,
      domain, domain
    );

    return Boolean(row);
  }

  public async addSuppression(workspaceId: string, record: Partial<SuppressionRecord>): Promise<SuppressionRecord> {
    const id = crypto.randomUUID();
    let val = (record.value_normalized || '').trim().toLowerCase();
    if (record.type === 'phone') {
      val = CrmNormalizer.normalizePhone(val) || val;
    } else if (record.type === 'email') {
      val = CrmNormalizer.normalizeEmail(val) || val;
    }

    this.db.prepare(`
      INSERT INTO crm_suppression_list (id, workspace_id, type, value_normalized, reason, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT (workspace_id, type, value_normalized) DO UPDATE SET reason = excluded.reason
    `).run(id, workspaceId, record.type, val, record.reason || 'unsubscribe');

    const row = this.db.prepare('SELECT * FROM crm_suppression_list WHERE workspace_id = ? AND type = ? AND value_normalized = ?').get(workspaceId, record.type, val) as any;
    return row;
  }

  public async listSuppression(workspaceId: string, limit: number = 100): Promise<SuppressionRecord[]> {
    return this.db.prepare('SELECT * FROM crm_suppression_list WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?').all(workspaceId, limit) as any[];
  }

  public async removeSuppression(workspaceId: string, id: string): Promise<boolean> {
    this.db.prepare('DELETE FROM crm_suppression_list WHERE workspace_id = ? AND id = ?').run(workspaceId, id);
    return true;
  }

  // =========================================================================
  // API KEYS & USAGE LOGS
  // =========================================================================
  public async createApiKey(workspaceId: string, data: Partial<CrmApiKey>): Promise<{ apiKey: CrmApiKey; rawSecretKey: string }> {
    const id = crypto.randomUUID();
    const rawSecret = `crm_${data.is_test ? 'test' : 'live'}_${crypto.randomBytes(24).toString('hex')}`;
    const prefix = rawSecret.slice(0, 12);
    const hash = crypto.createHash('sha256').update(rawSecret).digest('hex');

    this.db.prepare(`
      INSERT INTO crm_api_keys (
        id, workspace_id, user_id, name, key_prefix, key_hash, scopes,
        rate_limit_rpm, monthly_quota, monthly_usage, is_test, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, 0, ?, datetime('now')
      )
    `).run(
      id,
      workspaceId,
      data.user_id || 'system',
      (data.name || 'API Key').trim(),
      prefix,
      hash,
      JSON.stringify(data.scopes || ['contacts:read', 'contacts:write']),
      data.rate_limit_rpm || 600,
      data.monthly_quota || 500000,
      data.is_test ? 1 : 0
    );

    const apiKey = (await this.getApiKeyByHash(hash))!;
    return { apiKey, rawSecretKey: rawSecret };
  }

  public async getApiKeyByHash(keyHash: string): Promise<CrmApiKey | null> {
    const row = this.db.prepare('SELECT * FROM crm_api_keys WHERE key_hash = ? AND revoked_at IS NULL').get(keyHash) as any;
    if (!row) return null;
    return {
      ...row,
      scopes: JSON.parse(row.scopes || '[]'),
      is_test: Boolean(row.is_test)
    };
  }

  public async updateApiKeyUsage(apiKeyId: string, incrementRequests: number = 1): Promise<void> {
    this.db.prepare(`
      UPDATE crm_api_keys
      SET monthly_usage = monthly_usage + ?, last_used_at = datetime('now')
      WHERE id = ?
    `).run(incrementRequests, apiKeyId);
  }

  public async listApiKeys(workspaceId: string): Promise<CrmApiKey[]> {
    const rows = this.db.prepare('SELECT * FROM crm_api_keys WHERE workspace_id = ? ORDER BY created_at DESC').all(workspaceId) as any[];
    return rows.map((r) => ({
      ...r,
      scopes: JSON.parse(r.scopes || '[]'),
      is_test: Boolean(r.is_test)
    }));
  }

  public async revokeApiKey(workspaceId: string, apiKeyId: string): Promise<boolean> {
    this.db.prepare('UPDATE crm_api_keys SET revoked_at = datetime("now") WHERE workspace_id = ? AND id = ?').run(workspaceId, apiKeyId);
    return true;
  }

  public async logApiUsage(log: Partial<CrmApiUsageLog>): Promise<void> {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO crm_api_usage_logs (
        id, workspace_id, api_key_id, endpoint, method, status_code,
        response_time_ms, credits_charged, currency, ip_address, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      id,
      log.workspace_id,
      log.api_key_id || null,
      log.endpoint || '/',
      log.method || 'GET',
      log.status_code || 200,
      log.response_time_ms || 0,
      log.credits_charged || 0,
      log.currency || 'INR',
      log.ip_address || null
    );
  }

  public async getApiUsageStats(workspaceId: string, days: number = 30): Promise<{ totalRequests: number; totalCreditsCharged: number; byEndpoint: Record<string, number> }> {
    const rows = this.db.prepare(`
      SELECT endpoint, count(*) as cnt, sum(credits_charged) as total_charged
      FROM crm_api_usage_logs
      WHERE workspace_id = ? AND created_at >= datetime('now', '-' || ? || ' days')
      GROUP BY endpoint
    `).all(workspaceId, days) as any[];

    let totalRequests = 0;
    let totalCreditsCharged = 0;
    const byEndpoint: Record<string, number> = {};

    rows.forEach((r) => {
      totalRequests += r.cnt;
      totalCreditsCharged += Number(r.total_charged || 0);
      byEndpoint[r.endpoint] = r.cnt;
    });

    return { totalRequests, totalCreditsCharged, byEndpoint };
  }

  // =========================================================================
  // WEBHOOKS & DELIVERIES
  // =========================================================================
  public async listWebhooks(workspaceId: string): Promise<CrmWebhook[]> {
    const rows = this.db.prepare('SELECT * FROM crm_webhooks WHERE workspace_id = ? ORDER BY created_at DESC').all(workspaceId) as any[];
    return rows.map((r) => ({
      ...r,
      events: JSON.parse(r.events || '[]'),
      is_active: Boolean(r.is_active)
    }));
  }

  public async getWebhook(workspaceId: string, id: string): Promise<CrmWebhook | null> {
    const row = this.db.prepare('SELECT * FROM crm_webhooks WHERE workspace_id = ? AND id = ?').get(workspaceId, id) as any;
    if (!row) return null;
    return {
      ...row,
      events: JSON.parse(row.events || '[]'),
      is_active: Boolean(row.is_active)
    };
  }

  public async createWebhook(workspaceId: string, data: Partial<CrmWebhook>): Promise<CrmWebhook> {
    const id = crypto.randomUUID();
    const secret = `whsec_${crypto.randomBytes(24).toString('hex')}`;

    this.db.prepare(`
      INSERT INTO crm_webhooks (
        id, workspace_id, url, description, events, secret, is_active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))
    `).run(
      id,
      workspaceId,
      data.url?.trim(),
      data.description || null,
      JSON.stringify(data.events || ['contact.created', 'contact.updated']),
      secret
    );

    return (await this.getWebhook(workspaceId, id))!;
  }

  public async updateWebhook(workspaceId: string, id: string, data: Partial<CrmWebhook>): Promise<CrmWebhook> {
    this.db.prepare(`
      UPDATE crm_webhooks SET
        url = COALESCE(?, url),
        description = COALESCE(?, description),
        events = COALESCE(?, events),
        is_active = COALESCE(?, is_active)
      WHERE workspace_id = ? AND id = ?
    `).run(
      data.url ? data.url.trim() : null,
      data.description !== undefined ? data.description : null,
      data.events ? JSON.stringify(data.events) : null,
      data.is_active !== undefined ? (data.is_active ? 1 : 0) : null,
      workspaceId,
      id
    );

    return (await this.getWebhook(workspaceId, id))!;
  }

  public async deleteWebhook(workspaceId: string, id: string): Promise<boolean> {
    this.db.prepare('DELETE FROM crm_webhooks WHERE workspace_id = ? AND id = ?').run(workspaceId, id);
    return true;
  }

  public async logWebhookDelivery(delivery: Partial<CrmWebhookDelivery>): Promise<void> {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO crm_webhook_deliveries (
        id, workspace_id, webhook_id, event_type, payload, status_code,
        response_body, duration_ms, attempt, success, delivered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      id,
      delivery.workspace_id,
      delivery.webhook_id,
      delivery.event_type,
      JSON.stringify(delivery.payload || {}),
      delivery.status_code || null,
      delivery.response_body ? delivery.response_body.slice(0, 1000) : null,
      delivery.duration_ms || 0,
      delivery.attempt || 1,
      delivery.success ? 1 : 0
    );
  }

  public async listWebhookDeliveries(workspaceId: string, webhookId: string, limit: number = 50): Promise<CrmWebhookDelivery[]> {
    const rows = this.db.prepare('SELECT * FROM crm_webhook_deliveries WHERE workspace_id = ? AND webhook_id = ? ORDER BY delivered_at DESC LIMIT ?').all(workspaceId, webhookId, limit) as any[];
    return rows.map((r) => ({
      ...r,
      payload: JSON.parse(r.payload || '{}'),
      success: Boolean(r.success)
    }));
  }

  // =========================================================================
  // AUDIT LOG
  // =========================================================================
  public async logAudit(entry: Partial<AuditLogEntry>): Promise<void> {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO crm_audit_log (id, workspace_id, user_id, action, entity_type, entity_id, changes, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      id,
      entry.workspace_id,
      entry.user_id || null,
      entry.action || 'update',
      entry.entity_type || 'contact',
      entry.entity_id || '',
      entry.changes ? JSON.stringify(entry.changes) : null,
      entry.ip_address || null
    );
  }

  public async listAuditLogs(workspaceId: string, limit: number = 100): Promise<AuditLogEntry[]> {
    const rows = this.db.prepare('SELECT * FROM crm_audit_log WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?').all(workspaceId, limit) as any[];
    return rows.map((r) => ({
      ...r,
      changes: r.changes ? JSON.parse(r.changes) : null
    }));
  }

  private mapContactRow(r: any): Contact {
    return {
      id: r.id,
      workspace_id: r.workspace_id,
      first_name: r.first_name,
      last_name: r.last_name,
      email: r.email,
      email_normalized: r.email_normalized,
      phone: r.phone,
      phone_e164: r.phone_e164,
      company_id: r.company_id,
      company_name: r.company_name || null,
      title: r.title,
      country: r.country,
      city: r.city,
      source: r.source,
      source_id: r.source_id,
      lead_score: Number(r.lead_score || 0),
      status: r.status,
      custom_fields: JSON.parse(r.custom_fields || '{}'),
      email_status: r.email_status,
      verified_at: r.verified_at,
      created_at: r.created_at,
      updated_at: r.updated_at,
      deleted_at: r.deleted_at,
      is_archived: Boolean(r.is_archived),
      archived_at: r.archived_at || null
    };
  }

  // =========================================================================
  // CRM V2 PHASE 1: CUSTOM OBJECTS & RECORDS
  // =========================================================================
  public async listCustomObjects(workspaceId: string): Promise<CustomObjectDefinition[]> {
    return this.db.prepare('SELECT * FROM crm_custom_objects WHERE workspace_id = ? ORDER BY name ASC').all(workspaceId) as CustomObjectDefinition[];
  }

  public async getCustomObject(workspaceId: string, idOrSlug: string): Promise<CustomObjectDefinition | null> {
    const row = this.db.prepare('SELECT * FROM crm_custom_objects WHERE workspace_id = ? AND (id = ? OR slug = ?)').get(workspaceId, idOrSlug, idOrSlug) as any;
    return row || null;
  }

  public async createCustomObject(workspaceId: string, data: Partial<CustomObjectDefinition>): Promise<CustomObjectDefinition> {
    const id = data.id || crypto.randomUUID();
    const slug = (data.slug || data.name || 'custom_object').toLowerCase().replace(/[^a-z0-9_]/g, '_');
    this.db.prepare(`
      INSERT INTO crm_custom_objects (
        id, workspace_id, name, singular_label, plural_label, slug, description, icon, primary_field_key, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      id,
      workspaceId,
      data.name || 'Custom Object',
      data.singular_label || data.name || 'Item',
      data.plural_label || `${data.name || 'Item'}s`,
      slug,
      data.description || null,
      data.icon || 'Boxes',
      data.primary_field_key || 'name'
    );
    return (await this.getCustomObject(workspaceId, id))!;
  }

  public async deleteCustomObject(workspaceId: string, id: string): Promise<boolean> {
    this.db.prepare('DELETE FROM crm_custom_objects WHERE workspace_id = ? AND id = ?').run(workspaceId, id);
    return true;
  }

  public async listCustomObjectFields(workspaceId: string, objectId: string): Promise<CustomObjectFieldDefinition[]> {
    const rows = this.db.prepare('SELECT * FROM crm_custom_object_fields WHERE workspace_id = ? AND object_id = ? ORDER BY created_at ASC').all(workspaceId, objectId) as any[];
    return rows.map((r) => ({
      ...r,
      is_required: Boolean(r.is_required),
      is_unique: Boolean(r.is_unique),
      options: JSON.parse(r.options || '[]')
    }));
  }

  public async createCustomObjectField(workspaceId: string, data: Partial<CustomObjectFieldDefinition>): Promise<CustomObjectFieldDefinition> {
    const id = data.id || crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO crm_custom_object_fields (
        id, workspace_id, object_id, name, field_key, field_type, options, currency_code, formula_expression, is_required, is_unique, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      id,
      workspaceId,
      data.object_id!,
      data.name || 'Field',
      data.field_key!,
      data.field_type || 'text',
      JSON.stringify(data.options || []),
      data.currency_code || 'USD',
      data.formula_expression || null,
      data.is_required ? 1 : 0,
      data.is_unique ? 1 : 0
    );
    const row = this.db.prepare('SELECT * FROM crm_custom_object_fields WHERE id = ?').get(id) as any;
    return {
      ...row,
      is_required: Boolean(row.is_required),
      is_unique: Boolean(row.is_unique),
      options: JSON.parse(row.options || '[]')
    };
  }

  public async deleteCustomObjectField(workspaceId: string, fieldId: string): Promise<boolean> {
    this.db.prepare('DELETE FROM crm_custom_object_fields WHERE workspace_id = ? AND id = ?').run(workspaceId, fieldId);
    return true;
  }

  public async listCustomObjectRecords(
    workspaceId: string,
    objectId: string,
    params: { limit?: number; cursor?: string } = {}
  ): Promise<PaginatedResult<CustomObjectRecord>> {
    const limit = Math.min(100, Math.max(1, params.limit || 25));
    const rows = this.db.prepare(`
      SELECT * FROM crm_custom_object_records
      WHERE workspace_id = ? AND object_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT ?
    `).all(workspaceId, objectId, limit + 1) as any[];

    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit).map((r) => ({
      ...r,
      properties: JSON.parse(r.properties || '{}')
    }));

    return {
      data,
      next_cursor: hasMore && data.length > 0 ? Buffer.from(JSON.stringify({ created_at: data[data.length - 1].created_at, id: data[data.length - 1].id })).toString('base64') : null,
      prev_cursor: null,
      has_more: hasMore,
      approximate_total: data.length
    };
  }

  public async getCustomObjectRecord(workspaceId: string, recordId: string): Promise<CustomObjectRecord | null> {
    const row = this.db.prepare('SELECT * FROM crm_custom_object_records WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL').get(workspaceId, recordId) as any;
    if (!row) return null;
    return {
      ...row,
      properties: JSON.parse(row.properties || '{}')
    };
  }

  public async createCustomObjectRecord(workspaceId: string, objectId: string, properties: Record<string, any>): Promise<CustomObjectRecord> {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO crm_custom_object_records (id, workspace_id, object_id, properties, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(id, workspaceId, objectId, JSON.stringify(properties || {}));
    const record = (await this.getCustomObjectRecord(workspaceId, id))!;
    this.emitOutboxEvent(workspaceId, 'custom_object.record_created', objectId, id, record).catch(() => {});
    return record;
  }

  public async updateCustomObjectRecord(workspaceId: string, recordId: string, properties: Record<string, any>): Promise<CustomObjectRecord> {
    const existing = await this.getCustomObjectRecord(workspaceId, recordId);
    if (!existing) throw new Error(`Custom object record not found: ${recordId}`);
    const merged = { ...existing.properties, ...properties };
    this.db.prepare(`
      UPDATE crm_custom_object_records
      SET properties = ?, updated_at = datetime('now')
      WHERE workspace_id = ? AND id = ?
    `).run(JSON.stringify(merged), workspaceId, recordId);
    const updated = (await this.getCustomObjectRecord(workspaceId, recordId))!;
    this.emitOutboxEvent(workspaceId, 'custom_object.record_updated', existing.object_id, recordId, { previous: existing, current: updated }).catch(() => {});
    return updated;
  }

  public async deleteCustomObjectRecord(workspaceId: string, recordId: string): Promise<boolean> {
    this.db.prepare('UPDATE crm_custom_object_records SET deleted_at = datetime(\'now\') WHERE workspace_id = ? AND id = ?').run(workspaceId, recordId);
    this.emitOutboxEvent(workspaceId, 'custom_object.record_deleted', 'custom_object', recordId, { deleted: true }).catch(() => {});
    return true;
  }

  // =========================================================================
  // OBJECT RELATIONSHIPS & ASSOCIATIONS
  // =========================================================================
  public async createObjectRelationship(workspaceId: string, data: Partial<ObjectRelationshipDefinition>): Promise<ObjectRelationshipDefinition> {
    const id = data.id || crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO crm_object_relationships (id, workspace_id, source_object, target_object, relationship_type, name, inverse_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      id,
      workspaceId,
      data.source_object!,
      data.target_object!,
      data.relationship_type || 'one_to_many',
      data.name || 'Relationship',
      data.inverse_name || 'Inverse'
    );
    const row = this.db.prepare('SELECT * FROM crm_object_relationships WHERE id = ?').get(id) as any;
    return row;
  }

  public async listObjectRelationships(workspaceId: string): Promise<ObjectRelationshipDefinition[]> {
    return this.db.prepare('SELECT * FROM crm_object_relationships WHERE workspace_id = ?').all(workspaceId) as ObjectRelationshipDefinition[];
  }

  public async associateObjects(
    workspaceId: string,
    relationshipId: string,
    sourceEntityType: string,
    sourceEntityId: string,
    targetEntityType: string,
    targetEntityId: string,
    metadata: Record<string, any> = {}
  ): Promise<ObjectAssociation> {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO crm_object_associations (
        id, workspace_id, relationship_id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(id, workspaceId, relationshipId, sourceEntityType, sourceEntityId, targetEntityType, targetEntityId, JSON.stringify(metadata));
    return {
      id,
      workspace_id: workspaceId,
      relationship_id: relationshipId,
      source_entity_type: sourceEntityType,
      source_entity_id: sourceEntityId,
      target_entity_type: targetEntityType,
      target_entity_id: targetEntityId,
      metadata,
      created_at: new Date().toISOString()
    };
  }

  public async listAssociatedObjects(workspaceId: string, entityType: string, entityId: string): Promise<ObjectAssociation[]> {
    const rows = this.db.prepare(`
      SELECT * FROM crm_object_associations
      WHERE workspace_id = ? AND (
        (source_entity_type = ? AND source_entity_id = ?) OR
        (target_entity_type = ? AND target_entity_id = ?)
      )
    `).all(workspaceId, entityType, entityId, entityType, entityId) as any[];
    return rows.map((r) => ({
      ...r,
      metadata: JSON.parse(r.metadata || '{}')
    }));
  }

  public async removeAssociation(workspaceId: string, associationId: string): Promise<boolean> {
    this.db.prepare('DELETE FROM crm_object_associations WHERE workspace_id = ? AND id = ?').run(workspaceId, associationId);
    return true;
  }

  // =========================================================================
  // FIELD-LEVEL DELTA HISTORY & RESTORE
  // =========================================================================
  public async logFieldChange(workspaceId: string, change: Partial<FieldChangeHistory>): Promise<FieldChangeHistory> {
    const id = change.id || crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO crm_field_history (
        id, workspace_id, entity_type, entity_id, field_name, old_value, new_value, changed_by, source, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      id,
      workspaceId,
      change.entity_type || 'contact',
      change.entity_id!,
      change.field_name!,
      change.old_value !== undefined ? JSON.stringify(change.old_value) : null,
      change.new_value !== undefined ? JSON.stringify(change.new_value) : null,
      change.changed_by || null,
      change.source || 'manual_ui'
    );
    return {
      id,
      workspace_id: workspaceId,
      entity_type: change.entity_type || 'contact',
      entity_id: change.entity_id!,
      field_name: change.field_name!,
      old_value: change.old_value,
      new_value: change.new_value,
      changed_by: change.changed_by || null,
      source: change.source || 'manual_ui',
      created_at: new Date().toISOString()
    };
  }

  public async getFieldHistory(workspaceId: string, entityType: string, entityId: string): Promise<FieldChangeHistory[]> {
    const rows = this.db.prepare(`
      SELECT * FROM crm_field_history
      WHERE workspace_id = ? AND entity_type = ? AND entity_id = ?
      ORDER BY created_at DESC
    `).all(workspaceId, entityType, entityId) as any[];
    return rows.map((r) => ({
      ...r,
      old_value: r.old_value ? JSON.parse(r.old_value) : null,
      new_value: r.new_value ? JSON.parse(r.new_value) : null
    }));
  }

  public async restoreFieldHistory(workspaceId: string, historyId: string): Promise<boolean> {
    const row = this.db.prepare('SELECT * FROM crm_field_history WHERE workspace_id = ? AND id = ?').get(workspaceId, historyId) as any;
    if (!row) throw new Error('Field history entry not found');

    const oldValue = row.old_value ? JSON.parse(row.old_value) : null;
    if (row.entity_type === 'contact') {
      const field = row.field_name;
      const contact = await this.getContact(workspaceId, row.entity_id);
      if (!contact) return false;

      const updates: any = {};
      if (['first_name', 'last_name', 'email', 'phone', 'title', 'company_name', 'status', 'city', 'country'].includes(field)) {
        updates[field] = oldValue;
      } else {
        const custom = contact.custom_fields || {};
        custom[field] = oldValue;
        updates.custom_fields = custom;
      }
      await this.updateContact(workspaceId, row.entity_id, updates);
      return true;
    }
    return false;
  }

  // =========================================================================
  // TRANSACTIONAL EVENT OUTBOX
  // =========================================================================
  public async emitOutboxEvent(
    workspaceId: string,
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    payload: Record<string, any>
  ): Promise<CrmOutboxEvent> {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO crm_outbox_events (
        id, workspace_id, event_type, aggregate_type, aggregate_id, payload, status, retry_count, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, datetime('now'))
    `).run(id, workspaceId, eventType, aggregateType, aggregateId, JSON.stringify(payload || {}));

    return {
      id,
      workspace_id: workspaceId,
      event_type: eventType,
      aggregate_type: aggregateType,
      aggregate_id: aggregateId,
      payload,
      status: 'pending',
      retry_count: 0,
      created_at: new Date().toISOString()
    };
  }

  public async fetchPendingOutboxEvents(limit: number = 50): Promise<CrmOutboxEvent[]> {
    const rows = this.db.prepare(`
      SELECT * FROM crm_outbox_events
      WHERE status = 'pending'
      ORDER BY created_at ASC LIMIT ?
    `).all(limit) as any[];

    return rows.map((r) => ({
      ...r,
      payload: JSON.parse(r.payload || '{}')
    }));
  }

  public async markOutboxEventPublished(eventId: string): Promise<boolean> {
    const res = this.db.prepare(`
      UPDATE crm_outbox_events
      SET status = 'published', published_at = datetime('now')
      WHERE id = ?
    `).run(eventId);
    return res.changes > 0;
  }

  public async markOutboxEventFailed(eventId: string, errorMessage: string): Promise<boolean> {
    const res = this.db.prepare(`
      UPDATE crm_outbox_events
      SET status = 'failed', retry_count = retry_count + 1, error_message = ?
      WHERE id = ?
    `).run(errorMessage, eventId);
    return res.changes > 0;
  }

  // =========================================================================
  // CRM V2 PHASE 2: IDENTITY RESOLUTION, GOLDEN RECORD & UNMERGE
  // =========================================================================
  public async recordMerge(
    workspaceId: string,
    primaryId: string,
    duplicateId: string,
    snapshot: any,
    rules: any
  ): Promise<ContactMergeRecord> {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO crm_contact_merges (
        id, workspace_id, primary_contact_id, merged_contact_id, merged_contact_snapshot, survivorship_rules_applied, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(id, workspaceId, primaryId, duplicateId, JSON.stringify(snapshot), JSON.stringify(rules || {}));

    return {
      id,
      workspace_id: workspaceId,
      primary_contact_id: primaryId,
      merged_contact_id: duplicateId,
      merged_contact_snapshot: snapshot,
      survivorship_rules_applied: rules || {},
      created_at: new Date().toISOString()
    };
  }

  public async unmergeContacts(workspaceId: string, mergeId: string): Promise<boolean> {
    const row = this.db.prepare('SELECT * FROM crm_contact_merges WHERE workspace_id = ? AND id = ? AND unmerged_at IS NULL').get(workspaceId, mergeId) as any;
    if (!row) return false;

    const duplicateId = row.merged_contact_id;

    const tx = this.db.transaction(() => {
      this.db.prepare(`
        UPDATE crm_contacts SET deleted_at = NULL, updated_at = datetime('now')
        WHERE workspace_id = ? AND id = ?
      `).run(workspaceId, duplicateId);

      this.db.prepare(`
        UPDATE crm_contact_merges SET unmerged_at = datetime('now')
        WHERE workspace_id = ? AND id = ?
      `).run(workspaceId, mergeId);
    });

    tx();
    this.emitOutboxEvent(workspaceId, 'contact.unmerged', 'contact', duplicateId, { merge_id: mergeId, contact_id: duplicateId }).catch(() => {});
    return true;
  }

  public async listMerges(workspaceId: string, limit: number = 50): Promise<ContactMergeRecord[]> {
    const rows = this.db.prepare(`
      SELECT * FROM crm_contact_merges
      WHERE workspace_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(workspaceId, limit) as any[];

    return rows.map((r) => ({
      ...r,
      merged_contact_snapshot: JSON.parse(r.merged_contact_snapshot || '{}'),
      survivorship_rules_applied: JSON.parse(r.survivorship_rules_applied || '{}')
    }));
  }

  public async saveDuplicateCandidate(workspaceId: string, candidate: Partial<DuplicateCandidate>): Promise<DuplicateCandidate> {
    const id = candidate.id || crypto.randomUUID();
    this.db.prepare(`
      INSERT OR REPLACE INTO crm_duplicate_candidates (
        id, workspace_id, primary_contact_id, duplicate_contact_id, confidence_score, match_reasons, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      id,
      workspaceId,
      candidate.primary_contact_id!,
      candidate.duplicate_contact_id!,
      candidate.confidence_score || 0,
      JSON.stringify(candidate.match_reasons || []),
      candidate.status || 'pending_review'
    );

    return {
      id,
      workspace_id: workspaceId,
      primary_contact_id: candidate.primary_contact_id!,
      duplicate_contact_id: candidate.duplicate_contact_id!,
      confidence_score: candidate.confidence_score || 0,
      match_reasons: candidate.match_reasons || [],
      status: (candidate.status as any) || 'pending_review',
      created_at: new Date().toISOString()
    };
  }

  public async listDuplicateCandidates(workspaceId: string, status?: string, limit: number = 50): Promise<DuplicateCandidate[]> {
    let query = 'SELECT * FROM crm_duplicate_candidates WHERE workspace_id = ?';
    const params: any[] = [workspaceId];
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    query += ' ORDER BY confidence_score DESC LIMIT ?';
    params.push(limit);

    const rows = this.db.prepare(query).all(...params) as any[];
    const results: DuplicateCandidate[] = [];

    for (const r of rows) {
      const primary = await this.getContact(workspaceId, r.primary_contact_id);
      const duplicate = await this.getContact(workspaceId, r.duplicate_contact_id);
      results.push({
        ...r,
        match_reasons: JSON.parse(r.match_reasons || '[]'),
        primary_contact: primary || undefined,
        duplicate_contact: duplicate || undefined
      });
    }

    return results;
  }

  public async updateDuplicateCandidateStatus(workspaceId: string, id: string, status: string, reviewedBy?: string): Promise<boolean> {
    const res = this.db.prepare(`
      UPDATE crm_duplicate_candidates
      SET status = ?, reviewed_at = datetime('now'), reviewed_by = ?
      WHERE workspace_id = ? AND id = ?
    `).run(status, reviewedBy || null, workspaceId, id);
    return res.changes > 0;
  }

  // =========================================================================
  // CRM V2 PHASE 2: VERIFICATION & LOGS
  // =========================================================================
  public async logVerification(workspaceId: string, result: Partial<FieldVerificationResult>): Promise<FieldVerificationResult> {
    const id = result.id || crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO crm_verification_logs (
        id, workspace_id, contact_id, field_name, field_value, provider, status, confidence, details, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      id,
      workspaceId,
      result.contact_id!,
      result.field_name || 'email',
      result.field_value || '',
      result.provider || 'native_mx_e164',
      result.status || 'unknown',
      result.confidence !== undefined ? result.confidence : 1.0,
      JSON.stringify(result.details || {})
    );

    return {
      id,
      workspace_id: workspaceId,
      contact_id: result.contact_id!,
      field_name: result.field_name || 'email',
      field_value: result.field_value || '',
      provider: result.provider || 'native_mx_e164',
      status: result.status || 'unknown',
      confidence: result.confidence !== undefined ? result.confidence : 1.0,
      details: result.details || {},
      created_at: new Date().toISOString()
    };
  }

  public async listVerifications(workspaceId: string, contactId: string): Promise<FieldVerificationResult[]> {
    const rows = this.db.prepare(`
      SELECT * FROM crm_verification_logs
      WHERE workspace_id = ? AND contact_id = ?
      ORDER BY created_at DESC
    `).all(workspaceId, contactId) as any[];

    return rows.map((r) => ({
      ...r,
      details: JSON.parse(r.details || '{}')
    }));
  }

  // =========================================================================
  // CRM V2 PHASE 2: ENRICHMENT WATERFALL & CACHING
  // =========================================================================
  public async listEnrichmentProviders(workspaceId: string): Promise<EnrichmentProviderConfig[]> {
    const rows = this.db.prepare(`
      SELECT * FROM crm_enrichment_providers
      WHERE workspace_id = ?
      ORDER BY priority_order ASC
    `).all(workspaceId) as any[];

    if (rows.length === 0) {
      // Seed default provider configurations
      const defaults = [
        { provider_name: 'local_intelligence', priority_order: 1, cost_per_lookup_credits: 0.1 },
        { provider_name: 'hunter', priority_order: 2, cost_per_lookup_credits: 1.0 },
        { provider_name: 'apollo', priority_order: 3, cost_per_lookup_credits: 2.0 },
        { provider_name: 'clearbit', priority_order: 4, cost_per_lookup_credits: 2.5 }
      ];
      for (const d of defaults) {
        await this.saveEnrichmentProvider(workspaceId, d);
      }
      return this.listEnrichmentProviders(workspaceId);
    }

    return rows.map((r) => ({
      ...r,
      is_active: Boolean(r.is_active)
    }));
  }

  public async saveEnrichmentProvider(workspaceId: string, config: Partial<EnrichmentProviderConfig>): Promise<EnrichmentProviderConfig> {
    const id = config.id || crypto.randomUUID();
    this.db.prepare(`
      INSERT OR REPLACE INTO crm_enrichment_providers (
        id, workspace_id, provider_name, priority_order, is_active, api_key_encrypted, cost_per_lookup_credits, rate_limit_rpm, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      id,
      workspaceId,
      config.provider_name!,
      config.priority_order || 1,
      config.is_active !== undefined ? (config.is_active ? 1 : 0) : 1,
      config.api_key_encrypted || null,
      config.cost_per_lookup_credits || 1.0,
      config.rate_limit_rpm || 60
    );

    const row = this.db.prepare('SELECT * FROM crm_enrichment_providers WHERE id = ?').get(id) as any;
    return {
      ...row,
      is_active: Boolean(row.is_active)
    };
  }

  public async getEnrichmentCache(lookupKey: string): Promise<any | null> {
    const row = this.db.prepare(`
      SELECT * FROM crm_enrichment_cache
      WHERE lookup_key = ? AND expires_at > datetime('now')
    `).get(lookupKey) as any;
    if (!row) return null;
    return JSON.parse(row.enriched_data || '{}');
  }

  public async setEnrichmentCache(lookupKey: string, providerName: string, data: any, ttlSeconds: number = 86400 * 30): Promise<void> {
    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    this.db.prepare(`
      INSERT OR REPLACE INTO crm_enrichment_cache (
        id, lookup_key, provider_name, enriched_data, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(id, lookupKey, providerName, JSON.stringify(data || {}), expiresAt);
  }

  // =========================================================================
  // CRM V2 PHASE 2: DATA HEALTH METRICS
  // =========================================================================
  public async getDataHealthMetrics(workspaceId: string): Promise<DataHealthMetrics> {
    const totalRow = this.db.prepare(`
      SELECT 
        count(*) as total,
        sum(CASE WHEN is_archived = 0 THEN 1 ELSE 0 END) as active,
        sum(CASE WHEN is_archived = 1 THEN 1 ELSE 0 END) as archived,
        sum(CASE WHEN email_status = 'valid' THEN 1 ELSE 0 END) as email_valid,
        sum(CASE WHEN email_status = 'risky' THEN 1 ELSE 0 END) as email_risky,
        sum(CASE WHEN email_status = 'invalid' THEN 1 ELSE 0 END) as email_invalid,
        sum(CASE WHEN email_status = 'unknown' OR email_status IS NULL THEN 1 ELSE 0 END) as email_unknown,
        sum(CASE WHEN phone_e164 IS NOT NULL AND length(phone_e164) > 4 THEN 1 ELSE 0 END) as phone_valid,
        sum(CASE WHEN phone IS NULL OR length(phone) = 0 THEN 1 ELSE 0 END) as phone_missing,
        sum(CASE WHEN email IS NULL OR length(email) = 0 THEN 1 ELSE 0 END) as email_missing,
        sum(CASE WHEN company_id IS NULL THEN 1 ELSE 0 END) as company_missing,
        sum(CASE WHEN title IS NULL OR length(title) = 0 THEN 1 ELSE 0 END) as title_missing,
        sum(CASE WHEN updated_at < datetime('now', '-180 days') THEN 1 ELSE 0 END) as stale_count
      FROM crm_contacts
      WHERE workspace_id = ? AND deleted_at IS NULL
    `).get(workspaceId) as any;

    const total = totalRow?.total || 0;
    const active = totalRow?.active || 0;
    const archived = totalRow?.archived || 0;
    const emailValid = totalRow?.email_valid || 0;
    const emailRisky = totalRow?.email_risky || 0;
    const emailInvalid = totalRow?.email_invalid || 0;
    const emailUnknown = totalRow?.email_unknown || 0;
    const emailValidPct = total > 0 ? Math.round((emailValid / total) * 100) : 100;

    const phoneValid = totalRow?.phone_valid || 0;
    const phoneMissing = totalRow?.phone_missing || 0;
    const phoneValidPct = total > 0 ? Math.round((phoneValid / total) * 100) : 100;

    const staleCount = totalRow?.stale_count || 0;
    const stalePct = total > 0 ? Math.round((staleCount / total) * 100) : 0;

    // Duplicates stats
    const dupeStats = this.db.prepare(`
      SELECT 
        count(*) as detected,
        sum(CASE WHEN status = 'pending_review' THEN 1 ELSE 0 END) as pending,
        sum(CASE WHEN status = 'auto_merged' THEN 1 ELSE 0 END) as auto_merged
      FROM crm_duplicate_candidates
      WHERE workspace_id = ?
    `).get(workspaceId) as any;

    // Source quality breakdown
    const sourceRows = this.db.prepare(`
      SELECT 
        source,
        count(*) as total,
        sum(CASE WHEN email_status = 'valid' THEN 1 ELSE 0 END) as valid_emails
      FROM crm_contacts
      WHERE workspace_id = ? AND deleted_at IS NULL
      GROUP BY source
      ORDER BY total DESC
    `).all(workspaceId) as any[];

    const sourceQuality = sourceRows.map((sr) => ({
      source: sr.source || 'manual',
      total: sr.total,
      valid_email_rate: sr.total > 0 ? Math.round((sr.valid_emails / sr.total) * 100) : 0
    }));

    // Composite Data Quality Score (0-100)
    let qualityScore = 100;
    if (total > 0) {
      const emailScore = (emailValid / total) * 40;
      const phoneScore = (phoneValid / total) * 20;
      const completenessScore = ((total - ((totalRow?.email_missing || 0) + (totalRow?.company_missing || 0)) / 2) / total) * 25;
      const freshnessScore = ((total - staleCount) / total) * 15;
      qualityScore = Math.max(10, Math.min(100, Math.round(emailScore + phoneScore + completenessScore + freshnessScore)));
    }

    return {
      total_contacts: total,
      active_contacts: active,
      archived_contacts: archived,
      data_quality_score: qualityScore,
      email_health: {
        valid_count: emailValid,
        risky_count: emailRisky,
        invalid_count: emailInvalid,
        unknown_count: emailUnknown,
        valid_percentage: emailValidPct
      },
      phone_health: {
        e164_valid_count: phoneValid,
        missing_count: phoneMissing,
        valid_percentage: phoneValidPct
      },
      duplicates: {
        detected_count: dupeStats?.detected || 0,
        pending_review_count: dupeStats?.pending || 0,
        auto_merged_count: dupeStats?.auto_merged || 0
      },
      missing_fields: {
        missing_email_count: totalRow?.email_missing || 0,
        missing_phone_count: totalRow?.phone_missing || 0,
        missing_company_count: totalRow?.company_missing || 0,
        missing_title_count: totalRow?.title_missing || 0
      },
      stale_records: {
        older_than_180_days: staleCount,
        percentage: stalePct
      },
      source_quality: sourceQuality
    };
  }

  // =========================================================================
  // CRM V2 PHASE 3: SAVED VIEWS & DYNAMIC SEGMENTS
  // =========================================================================
  public async listSavedViews(workspaceId: string): Promise<CrmSavedView[]> {
    const rows = this.db.prepare(`
      SELECT * FROM crm_saved_views
      WHERE workspace_id = ?
      ORDER BY created_at DESC
    `).all(workspaceId) as any[];

    return rows.map((r) => ({
      ...r,
      is_dynamic: Boolean(r.is_dynamic),
      is_shared: Boolean(r.is_shared),
      filter_definition: JSON.parse(r.filter_definition || '{}'),
      visible_columns: JSON.parse(r.visible_columns || '[]')
    }));
  }

  public async getSavedView(workspaceId: string, id: string): Promise<CrmSavedView | null> {
    const row = this.db.prepare('SELECT * FROM crm_saved_views WHERE workspace_id = ? AND id = ?').get(workspaceId, id) as any;
    if (!row) return null;
    return {
      ...row,
      is_dynamic: Boolean(row.is_dynamic),
      is_shared: Boolean(row.is_shared),
      filter_definition: JSON.parse(row.filter_definition || '{}'),
      visible_columns: JSON.parse(row.visible_columns || '[]')
    };
  }

  public async createSavedView(workspaceId: string, view: Partial<CrmSavedView>): Promise<CrmSavedView> {
    const id = view.id || crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO crm_saved_views (
        id, workspace_id, user_id, name, description, filter_definition, sort_by, sort_direction, visible_columns, is_dynamic, is_shared, cached_count, last_refreshed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
    `).run(
      id,
      workspaceId,
      view.user_id || null,
      view.name || 'Untitled View',
      view.description || null,
      JSON.stringify(view.filter_definition || {}),
      view.sort_by || 'created_at',
      view.sort_direction || 'desc',
      JSON.stringify(view.visible_columns || ['name', 'email', 'phone', 'company_name', 'status']),
      view.is_dynamic !== undefined ? (view.is_dynamic ? 1 : 0) : 1,
      view.is_shared !== undefined ? (view.is_shared ? 1 : 0) : 0,
      view.cached_count || 0
    );

    return (await this.getSavedView(workspaceId, id))!;
  }

  public async updateSavedView(workspaceId: string, id: string, updates: Partial<CrmSavedView>): Promise<CrmSavedView> {
    const existing = await this.getSavedView(workspaceId, id);
    if (!existing) throw new Error('Saved view not found');

    this.db.prepare(`
      UPDATE crm_saved_views SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        filter_definition = ?,
        sort_by = COALESCE(?, sort_by),
        sort_direction = COALESCE(?, sort_direction),
        visible_columns = ?,
        is_dynamic = COALESCE(?, is_dynamic),
        is_shared = COALESCE(?, is_shared),
        cached_count = COALESCE(?, cached_count),
        last_refreshed_at = datetime('now'),
        updated_at = datetime('now')
      WHERE workspace_id = ? AND id = ?
    `).run(
      updates.name || null,
      updates.description || null,
      updates.filter_definition !== undefined ? JSON.stringify(updates.filter_definition) : JSON.stringify(existing.filter_definition),
      updates.sort_by || null,
      updates.sort_direction || null,
      updates.visible_columns !== undefined ? JSON.stringify(updates.visible_columns) : JSON.stringify(existing.visible_columns),
      updates.is_dynamic !== undefined ? (updates.is_dynamic ? 1 : 0) : null,
      updates.is_shared !== undefined ? (updates.is_shared ? 1 : 0) : null,
      updates.cached_count !== undefined ? updates.cached_count : null,
      workspaceId,
      id
    );

    return (await this.getSavedView(workspaceId, id))!;
  }

  public async deleteSavedView(workspaceId: string, id: string): Promise<boolean> {
    this.db.prepare('DELETE FROM crm_saved_views WHERE workspace_id = ? AND id = ?').run(workspaceId, id);
    return true;
  }

  // =========================================================================
  // CRM V2 PHASE 3: BULK ACTIONS ENGINE
  // =========================================================================
  public async createBulkJob(workspaceId: string, job: Partial<CrmBulkJob>): Promise<CrmBulkJob> {
    const id = job.id || crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO crm_bulk_jobs (
        id, workspace_id, user_id, action_type, filter_criteria, action_payload, status, total_matched, processed_count, success_count, error_count, error_details, undo_snapshot_available, undo_snapshot_path, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, 0, 0, 0, '[]', ?, ?, datetime('now'))
    `).run(
      id,
      workspaceId,
      job.user_id || null,
      job.action_type || 'bulk_update',
      JSON.stringify(job.filter_criteria || {}),
      JSON.stringify(job.action_payload || {}),
      job.total_matched || 0,
      job.undo_snapshot_available !== false ? 1 : 0,
      job.undo_snapshot_path || null
    );

    return (await this.getBulkJob(workspaceId, id))!;
  }

  public async getBulkJob(workspaceId: string, jobId: string): Promise<CrmBulkJob | null> {
    const row = this.db.prepare('SELECT * FROM crm_bulk_jobs WHERE workspace_id = ? AND id = ?').get(workspaceId, jobId) as any;
    if (!row) return null;
    return {
      ...row,
      undo_snapshot_available: Boolean(row.undo_snapshot_available),
      filter_criteria: JSON.parse(row.filter_criteria || '{}'),
      action_payload: JSON.parse(row.action_payload || '{}'),
      error_details: JSON.parse(row.error_details || '[]')
    };
  }

  public async updateBulkJobProgress(jobId: string, progress: Partial<CrmBulkJob>): Promise<void> {
    const updates: string[] = [];
    const params: any[] = [];

    if (progress.status) {
      updates.push('status = ?');
      params.push(progress.status);
      if (progress.status === 'running') updates.push("started_at = datetime('now')");
      if (progress.status === 'completed' || progress.status === 'failed' || progress.status === 'cancelled') updates.push("completed_at = datetime('now')");
      if (progress.status === 'undone') updates.push("undone_at = datetime('now')");
    }
    if (progress.processed_count !== undefined) {
      updates.push('processed_count = ?');
      params.push(progress.processed_count);
    }
    if (progress.success_count !== undefined) {
      updates.push('success_count = ?');
      params.push(progress.success_count);
    }
    if (progress.error_count !== undefined) {
      updates.push('error_count = ?');
      params.push(progress.error_count);
    }
    if (progress.error_details !== undefined) {
      updates.push('error_details = ?');
      params.push(JSON.stringify(progress.error_details));
    }
    if (progress.undo_snapshot_path !== undefined) {
      updates.push('undo_snapshot_path = ?');
      params.push(progress.undo_snapshot_path);
    }

    if (updates.length === 0) return;
    params.push(jobId);
    this.db.prepare(`UPDATE crm_bulk_jobs SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }

  public async listBulkJobs(workspaceId: string, limit: number = 20): Promise<CrmBulkJob[]> {
    const rows = this.db.prepare(`
      SELECT * FROM crm_bulk_jobs
      WHERE workspace_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(workspaceId, limit) as any[];

    return rows.map((r) => ({
      ...r,
      undo_snapshot_available: Boolean(r.undo_snapshot_available),
      filter_criteria: JSON.parse(r.filter_criteria || '{}'),
      action_payload: JSON.parse(r.action_payload || '{}'),
      error_details: JSON.parse(r.error_details || '[]')
    }));
  }

  // =========================================================================
  // CRM V2 PHASE 4: AI LAYER & SMART ENGINES
  // =========================================================================
  public async logAiUsage(workspaceId: string, log: Partial<CrmAiUsageLog>): Promise<CrmAiUsageLog> {
    const id = log.id || crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO crm_ai_usage_logs (
        id, workspace_id, user_id, action_type, model_tier, prompt_tokens, completion_tokens, credits_charged, currency, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      id,
      workspaceId,
      log.user_id || null,
      log.action_type || 'contact_brief',
      log.model_tier || 'gemini-1.5-flash',
      log.prompt_tokens || 0,
      log.completion_tokens || 0,
      log.credits_charged || 0,
      log.currency || 'INR'
    );

    return {
      id,
      workspace_id: workspaceId,
      user_id: log.user_id || null,
      action_type: log.action_type || 'contact_brief',
      model_tier: log.model_tier || 'gemini-1.5-flash',
      prompt_tokens: log.prompt_tokens || 0,
      completion_tokens: log.completion_tokens || 0,
      credits_charged: log.credits_charged || 0,
      currency: log.currency || 'INR',
      created_at: new Date().toISOString()
    };
  }

  public async getAiUsageSummary(workspaceId: string, days: number = 30): Promise<{ totalCredits: number; totalTokens: number; countByAction: Record<string, number> }> {
    const row = this.db.prepare(`
      SELECT 
        sum(credits_charged) as total_credits,
        sum(prompt_tokens + completion_tokens) as total_tokens
      FROM crm_ai_usage_logs
      WHERE workspace_id = ? AND created_at >= datetime('now', '-' || ? || ' days')
    `).get(workspaceId, days) as any;

    const actionRows = this.db.prepare(`
      SELECT action_type, count(*) as cnt
      FROM crm_ai_usage_logs
      WHERE workspace_id = ? AND created_at >= datetime('now', '-' || ? || ' days')
      GROUP BY action_type
    `).all(workspaceId, days) as any[];

    const countByAction: Record<string, number> = {};
    for (const r of actionRows) {
      countByAction[r.action_type] = r.cnt;
    }

    return {
      totalCredits: row?.total_credits || 0,
      totalTokens: row?.total_tokens || 0,
      countByAction
    };
  }

  public async listScoringRules(workspaceId: string): Promise<CrmScoringRule[]> {
    const rows = this.db.prepare(`
      SELECT * FROM crm_scoring_rules
      WHERE workspace_id = ?
      ORDER BY created_at ASC
    `).all(workspaceId) as any[];

    if (rows.length === 0) {
      // Seed default scoring rules
      const defaults: Array<Partial<CrmScoringRule>> = [
        { name: 'Executive Title (ICP)', rule_type: 'icp_title', criteria: { titles: ['CEO', 'CTO', 'Founder', 'Director', 'VP'] }, points_change: 25 },
        { name: 'Tier 1 Country', rule_type: 'country_tier', criteria: { countries: ['United States', 'USA', 'India', 'United Kingdom', 'Canada', 'UAE'] }, points_change: 15 },
        { name: 'Verified Valid Email', rule_type: 'verified_email', criteria: { email_status: 'valid' }, points_change: 20 },
        { name: 'Direct Phone Available', rule_type: 'phone_present', criteria: { required: true }, points_change: 15 },
        { name: 'Recent Activity (< 7 days)', rule_type: 'activity_recency', criteria: { within_days: 7 }, points_change: 15 },
        { name: 'Inactivity Decay (> 30 days)', rule_type: 'time_decay', criteria: { inactive_days: 30 }, points_change: -15 }
      ];
      for (const d of defaults) {
        await this.saveScoringRule(workspaceId, d);
      }
      return this.listScoringRules(workspaceId);
    }

    return rows.map((r) => ({
      ...r,
      is_active: Boolean(r.is_active),
      criteria: JSON.parse(r.criteria || '{}')
    }));
  }

  public async saveScoringRule(workspaceId: string, rule: Partial<CrmScoringRule>): Promise<CrmScoringRule> {
    const id = rule.id || crypto.randomUUID();
    this.db.prepare(`
      INSERT OR REPLACE INTO crm_scoring_rules (
        id, workspace_id, name, rule_type, criteria, points_change, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      id,
      workspaceId,
      rule.name || 'Custom Scoring Rule',
      rule.rule_type || 'icp_title',
      JSON.stringify(rule.criteria || {}),
      rule.points_change !== undefined ? rule.points_change : 10,
      rule.is_active !== undefined ? (rule.is_active ? 1 : 0) : 1
    );

    const row = this.db.prepare('SELECT * FROM crm_scoring_rules WHERE id = ?').get(id) as any;
    return {
      ...row,
      is_active: Boolean(row.is_active),
      criteria: JSON.parse(row.criteria || '{}')
    };
  }

  public async deleteScoringRule(workspaceId: string, id: string): Promise<boolean> {
    this.db.prepare('DELETE FROM crm_scoring_rules WHERE workspace_id = ? AND id = ?').run(workspaceId, id);
    return true;
  }

  // =========================================================================
  // CRM V2 PHASE 5: WORKFLOWS & AUTOMATIONS
  // =========================================================================
  public async listWorkflows(workspaceId: string): Promise<CrmWorkflow[]> {
    const rows = this.db.prepare(`
      SELECT * FROM crm_workflows WHERE workspace_id = ? ORDER BY created_at DESC
    `).all(workspaceId) as any[];

    return rows.map((r) => ({
      ...r,
      is_active: Boolean(r.is_active),
      trigger_config: JSON.parse(r.trigger_config || '{}'),
      filter_criteria: JSON.parse(r.filter_criteria || '{}'),
      steps: JSON.parse(r.steps || '[]')
    }));
  }

  public async getWorkflow(workspaceId: string, id: string): Promise<CrmWorkflow | null> {
    const row = this.db.prepare(`
      SELECT * FROM crm_workflows WHERE workspace_id = ? AND id = ?
    `).get(workspaceId, id) as any;
    if (!row) return null;

    return {
      ...row,
      is_active: Boolean(row.is_active),
      trigger_config: JSON.parse(row.trigger_config || '{}'),
      filter_criteria: JSON.parse(row.filter_criteria || '{}'),
      steps: JSON.parse(row.steps || '[]')
    };
  }

  public async createWorkflow(workspaceId: string, data: Partial<CrmWorkflow>): Promise<CrmWorkflow> {
    const id = data.id || crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO crm_workflows (
        id, workspace_id, name, description, is_active, trigger_type, trigger_config, filter_criteria, steps, total_runs, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
    `).run(
      id,
      workspaceId,
      data.name || 'Untitled Workflow',
      data.description || null,
      data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1,
      data.trigger_type || 'contact_created',
      JSON.stringify(data.trigger_config || {}),
      JSON.stringify(data.filter_criteria || {}),
      JSON.stringify(data.steps || [])
    );

    return (await this.getWorkflow(workspaceId, id))!;
  }

  public async updateWorkflow(workspaceId: string, id: string, updates: Partial<CrmWorkflow>): Promise<CrmWorkflow> {
    const current = await this.getWorkflow(workspaceId, id);
    if (!current) throw new Error(`Workflow ${id} not found`);

    this.db.prepare(`
      UPDATE crm_workflows SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        is_active = COALESCE(?, is_active),
        trigger_type = COALESCE(?, trigger_type),
        trigger_config = COALESCE(?, trigger_config),
        filter_criteria = COALESCE(?, filter_criteria),
        steps = COALESCE(?, steps),
        total_runs = COALESCE(?, total_runs),
        updated_at = datetime('now')
      WHERE workspace_id = ? AND id = ?
    `).run(
      updates.name || null,
      updates.description !== undefined ? updates.description : null,
      updates.is_active !== undefined ? (updates.is_active ? 1 : 0) : null,
      updates.trigger_type || null,
      updates.trigger_config ? JSON.stringify(updates.trigger_config) : null,
      updates.filter_criteria ? JSON.stringify(updates.filter_criteria) : null,
      updates.steps ? JSON.stringify(updates.steps) : null,
      updates.total_runs !== undefined ? updates.total_runs : null,
      workspaceId,
      id
    );

    return (await this.getWorkflow(workspaceId, id))!;
  }

  public async deleteWorkflow(workspaceId: string, id: string): Promise<boolean> {
    this.db.prepare('DELETE FROM crm_workflows WHERE workspace_id = ? AND id = ?').run(workspaceId, id);
    return true;
  }

  // =========================================================================
  // WORKFLOW RUNS & TIMERS
  // =========================================================================
  public async createWorkflowRun(workspaceId: string, data: Partial<CrmWorkflowRun>): Promise<CrmWorkflowRun> {
    const id = data.id || crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO crm_workflow_runs (
        id, workspace_id, workflow_id, contact_id, status, current_step_index, next_execution_at, execution_context, started_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      id,
      workspaceId,
      data.workflow_id,
      data.contact_id,
      data.status || 'running',
      data.current_step_index || 0,
      data.next_execution_at || null,
      JSON.stringify(data.execution_context || {})
    );

    // Increment workflow total_runs counter
    this.db.prepare('UPDATE crm_workflows SET total_runs = total_runs + 1 WHERE id = ?').run(data.workflow_id);

    return (await this.getWorkflowRun(workspaceId, id))!;
  }

  public async getWorkflowRun(workspaceId: string, runId: string): Promise<CrmWorkflowRun | null> {
    const row = this.db.prepare('SELECT * FROM crm_workflow_runs WHERE workspace_id = ? AND id = ?').get(workspaceId, runId) as any;
    if (!row) return null;
    return {
      ...row,
      execution_context: JSON.parse(row.execution_context || '{}')
    };
  }

  public async updateWorkflowRun(runId: string, updates: Partial<CrmWorkflowRun>): Promise<void> {
    this.db.prepare(`
      UPDATE crm_workflow_runs SET
        status = COALESCE(?, status),
        current_step_index = COALESCE(?, current_step_index),
        next_execution_at = ?,
        execution_context = COALESCE(?, execution_context),
        error_message = COALESCE(?, error_message),
        completed_at = CASE WHEN ? IN ('completed', 'failed', 'cancelled') THEN datetime('now') ELSE completed_at END
      WHERE id = ?
    `).run(
      updates.status || null,
      updates.current_step_index !== undefined ? updates.current_step_index : null,
      updates.next_execution_at !== undefined ? updates.next_execution_at : null,
      updates.execution_context ? JSON.stringify(updates.execution_context) : null,
      updates.error_message || null,
      updates.status || null,
      runId
    );
  }

  public async listPendingWorkflowRuns(limit: number = 100): Promise<CrmWorkflowRun[]> {
    const rows = this.db.prepare(`
      SELECT * FROM crm_workflow_runs
      WHERE status = 'waiting_delay' AND datetime(next_execution_at) <= datetime('now')
      ORDER BY next_execution_at ASC
      LIMIT ?
    `).all(limit) as any[];

    return rows.map((r) => ({
      ...r,
      execution_context: JSON.parse(r.execution_context || '{}')
    }));
  }

  public async listWorkflowRuns(workspaceId: string, workflowId?: string, limit: number = 50): Promise<CrmWorkflowRun[]> {
    const sql = workflowId
      ? 'SELECT * FROM crm_workflow_runs WHERE workspace_id = ? AND workflow_id = ? ORDER BY started_at DESC LIMIT ?'
      : 'SELECT * FROM crm_workflow_runs WHERE workspace_id = ? ORDER BY started_at DESC LIMIT ?';
    const params = workflowId ? [workspaceId, workflowId, limit] : [workspaceId, limit];
    const rows = this.db.prepare(sql).all(...params) as any[];

    return rows.map((r) => ({
      ...r,
      execution_context: JSON.parse(r.execution_context || '{}')
    }));
  }

  // =========================================================================
  // STEP LOGS
  // =========================================================================
  public async logWorkflowStepExecution(log: Partial<CrmWorkflowStepLog>): Promise<CrmWorkflowStepLog> {
    const id = log.id || crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO crm_workflow_step_logs (
        id, run_id, workflow_id, step_index, action_type, status, input_payload, output_payload, error_message, duration_ms, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      id,
      log.run_id,
      log.workflow_id,
      log.step_index || 0,
      log.action_type || 'condition',
      log.status || 'success',
      JSON.stringify(log.input_payload || {}),
      JSON.stringify(log.output_payload || {}),
      log.error_message || null,
      log.duration_ms || 0
    );

    const row = this.db.prepare('SELECT * FROM crm_workflow_step_logs WHERE id = ?').get(id) as any;
    return {
      ...row,
      input_payload: JSON.parse(row.input_payload || '{}'),
      output_payload: JSON.parse(row.output_payload || '{}')
    };
  }

  public async listWorkflowStepLogs(runId: string): Promise<CrmWorkflowStepLog[]> {
    const rows = this.db.prepare(`
      SELECT * FROM crm_workflow_step_logs WHERE run_id = ? ORDER BY step_index ASC, created_at ASC
    `).all(runId) as any[];

    return rows.map((r) => ({
      ...r,
      input_payload: JSON.parse(r.input_payload || '{}'),
      output_payload: JSON.parse(r.output_payload || '{}')
    }));
  }

  // =========================================================================
  // COMPLIANCE POLICY SETTINGS
  // =========================================================================
  public async getCompliancePolicy(workspaceId: string): Promise<CrmCompliancePolicy> {
    let row = this.db.prepare('SELECT * FROM crm_compliance_policies WHERE workspace_id = ?').get(workspaceId) as any;
    if (!row) {
      const id = crypto.randomUUID();
      this.db.prepare(`
        INSERT INTO crm_compliance_policies (
          id, workspace_id, max_messages_per_day, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, auto_opt_out_keywords, created_at, updated_at
        ) VALUES (?, ?, 3, 1, '21:00', '09:00', '["STOP", "UNSUBSCRIBE", "CANCEL", "ROK DO"]', datetime('now'), datetime('now'))
      `).run(id, workspaceId);
      row = this.db.prepare('SELECT * FROM crm_compliance_policies WHERE id = ?').get(id) as any;
    }

    return {
      ...row,
      quiet_hours_enabled: Boolean(row.quiet_hours_enabled),
      auto_opt_out_keywords: JSON.parse(row.auto_opt_out_keywords || '[]')
    };
  }

  public async saveCompliancePolicy(workspaceId: string, policy: Partial<CrmCompliancePolicy>): Promise<CrmCompliancePolicy> {
    const current = await this.getCompliancePolicy(workspaceId);
    this.db.prepare(`
      UPDATE crm_compliance_policies SET
        max_messages_per_day = COALESCE(?, max_messages_per_day),
        quiet_hours_enabled = COALESCE(?, quiet_hours_enabled),
        quiet_hours_start = COALESCE(?, quiet_hours_start),
        quiet_hours_end = COALESCE(?, quiet_hours_end),
        auto_opt_out_keywords = COALESCE(?, auto_opt_out_keywords),
        updated_at = datetime('now')
      WHERE workspace_id = ?
    `).run(
      policy.max_messages_per_day !== undefined ? policy.max_messages_per_day : null,
      policy.quiet_hours_enabled !== undefined ? (policy.quiet_hours_enabled ? 1 : 0) : null,
      policy.quiet_hours_start || null,
      policy.quiet_hours_end || null,
      policy.auto_opt_out_keywords ? JSON.stringify(policy.auto_opt_out_keywords) : null,
      workspaceId
    );

    return this.getCompliancePolicy(workspaceId);
  }

  // =========================================================================
  // CRM V2 PHASE 6: PIPELINES & STAGES
  // =========================================================================
  public async listPipelines(workspaceId: string): Promise<CrmPipeline[]> {
    const rows = this.db.prepare('SELECT * FROM crm_pipelines WHERE workspace_id = ? ORDER BY created_at ASC').all(workspaceId) as any[];
    if (rows.length === 0) {
      // Seed default pipeline & stages
      const p = await this.createPipeline(workspaceId, 'Sales Pipeline', true);
      return [p];
    }
    return rows.map((r) => ({ ...r, is_default: Boolean(r.is_default) }));
  }

  public async getPipeline(workspaceId: string, id: string): Promise<CrmPipeline | null> {
    const row = this.db.prepare('SELECT * FROM crm_pipelines WHERE workspace_id = ? AND id = ?').get(workspaceId, id) as any;
    if (!row) return null;
    return { ...row, is_default: Boolean(row.is_default) };
  }

  public async createPipeline(workspaceId: string, name: string, isDefault: boolean = true): Promise<CrmPipeline> {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO crm_pipelines (id, workspace_id, name, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(id, workspaceId, name, isDefault ? 1 : 0);

    // Seed default stages
    const defaultStages = [
      { name: 'Lead In', order_index: 0, win_probability: 10, rotten_days: 7 },
      { name: 'Discovery', order_index: 1, win_probability: 25, rotten_days: 14 },
      { name: 'Proposal Sent', order_index: 2, win_probability: 60, rotten_days: 10 },
      { name: 'Negotiation', order_index: 3, win_probability: 80, rotten_days: 7 },
      { name: 'Closed Won', order_index: 4, win_probability: 100, rotten_days: 999, is_won: true },
      { name: 'Closed Lost', order_index: 5, win_probability: 0, rotten_days: 999, is_lost: true }
    ];

    for (const s of defaultStages) {
      await this.createPipelineStage(workspaceId, { ...s, pipeline_id: id });
    }

    return (await this.getPipeline(workspaceId, id))!;
  }

  public async listPipelineStages(workspaceId: string, pipelineId: string): Promise<CrmPipelineStage[]> {
    const rows = this.db.prepare(`
      SELECT * FROM crm_pipeline_stages WHERE workspace_id = ? AND pipeline_id = ? ORDER BY order_index ASC
    `).all(workspaceId, pipelineId) as any[];

    return rows.map((r) => ({
      ...r,
      is_won: Boolean(r.is_won),
      is_lost: Boolean(r.is_lost)
    }));
  }

  public async createPipelineStage(workspaceId: string, stage: Partial<CrmPipelineStage>): Promise<CrmPipelineStage> {
    const id = stage.id || crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO crm_pipeline_stages (
        id, workspace_id, pipeline_id, name, order_index, win_probability, rotten_days, is_won, is_lost, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      id,
      workspaceId,
      stage.pipeline_id,
      stage.name || 'Stage',
      stage.order_index || 0,
      stage.win_probability || 10,
      stage.rotten_days || 14,
      stage.is_won ? 1 : 0,
      stage.is_lost ? 1 : 0
    );

    const row = this.db.prepare('SELECT * FROM crm_pipeline_stages WHERE id = ?').get(id) as any;
    return {
      ...row,
      is_won: Boolean(row.is_won),
      is_lost: Boolean(row.is_lost)
    };
  }

  public async updatePipelineStage(workspaceId: string, id: string, stage: Partial<CrmPipelineStage>): Promise<CrmPipelineStage> {
    this.db.prepare(`
      UPDATE crm_pipeline_stages SET
        name = COALESCE(?, name),
        order_index = COALESCE(?, order_index),
        win_probability = COALESCE(?, win_probability),
        rotten_days = COALESCE(?, rotten_days),
        is_won = COALESCE(?, is_won),
        is_lost = COALESCE(?, is_lost),
        updated_at = datetime('now')
      WHERE workspace_id = ? AND id = ?
    `).run(
      stage.name || null,
      stage.order_index !== undefined ? stage.order_index : null,
      stage.win_probability !== undefined ? stage.win_probability : null,
      stage.rotten_days !== undefined ? stage.rotten_days : null,
      stage.is_won !== undefined ? (stage.is_won ? 1 : 0) : null,
      stage.is_lost !== undefined ? (stage.is_lost ? 1 : 0) : null,
      workspaceId,
      id
    );

    const row = this.db.prepare('SELECT * FROM crm_pipeline_stages WHERE id = ?').get(id) as any;
    return {
      ...row,
      is_won: Boolean(row.is_won),
      is_lost: Boolean(row.is_lost)
    };
  }

  // =========================================================================
  // DEALS (OPPORTUNITIES)
  // =========================================================================
  public async listDeals(
    workspaceId: string,
    filter: { pipelineId?: string; stageId?: string; contactId?: string; status?: string } = {}
  ): Promise<CrmDeal[]> {
    const conditions = ['d.workspace_id = ?'];
    const params: any[] = [workspaceId];

    if (filter.pipelineId) {
      conditions.push('d.pipeline_id = ?');
      params.push(filter.pipelineId);
    }
    if (filter.stageId) {
      conditions.push('d.stage_id = ?');
      params.push(filter.stageId);
    }
    if (filter.contactId) {
      conditions.push('d.contact_id = ?');
      params.push(filter.contactId);
    }
    if (filter.status) {
      conditions.push('d.status = ?');
      params.push(filter.status);
    }

    const rows = this.db.prepare(`
      SELECT d.*, s.name as stage_name, s.rotten_days
      FROM crm_deals d
      LEFT JOIN crm_pipeline_stages s ON s.id = d.stage_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY d.created_at DESC
    `).all(...params) as any[];

    const now = Date.now();
    return rows.map((r) => {
      const lastAct = r.last_activity_at ? new Date(r.last_activity_at).getTime() : new Date(r.updated_at).getTime();
      const inactiveDays = (now - lastAct) / (1000 * 3600 * 24);
      const isRotten = r.status === 'open' && r.rotten_days ? inactiveDays > r.rotten_days : false;

      return {
        ...r,
        amount: parseFloat(r.amount || 0),
        amount_usd: parseFloat(r.amount_usd || 0),
        custom_fields: JSON.parse(r.custom_fields || '{}'),
        is_rotten: isRotten
      };
    });
  }

  public async getDeal(workspaceId: string, id: string): Promise<CrmDeal | null> {
    const row = this.db.prepare(`
      SELECT d.*, s.name as stage_name, s.rotten_days
      FROM crm_deals d
      LEFT JOIN crm_pipeline_stages s ON s.id = d.stage_id
      WHERE d.workspace_id = ? AND d.id = ?
    `).get(workspaceId, id) as any;
    if (!row) return null;

    const now = Date.now();
    const lastAct = row.last_activity_at ? new Date(row.last_activity_at).getTime() : new Date(row.updated_at).getTime();
    const inactiveDays = (now - lastAct) / (1000 * 3600 * 24);
    const isRotten = row.status === 'open' && row.rotten_days ? inactiveDays > row.rotten_days : false;

    return {
      ...row,
      amount: parseFloat(row.amount || 0),
      amount_usd: parseFloat(row.amount_usd || 0),
      custom_fields: JSON.parse(row.custom_fields || '{}'),
      is_rotten: isRotten
    };
  }

  public async createDeal(workspaceId: string, deal: Partial<CrmDeal>): Promise<CrmDeal> {
    const id = deal.id || crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO crm_deals (
        id, workspace_id, pipeline_id, stage_id, contact_id, company_id, name, amount, currency, amount_usd,
        expected_close_date, status, owner_user_id, custom_fields, last_activity_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
    `).run(
      id,
      workspaceId,
      deal.pipeline_id,
      deal.stage_id,
      deal.contact_id || null,
      deal.company_id || null,
      deal.name || 'New Opportunity',
      deal.amount || 0.0,
      deal.currency || 'USD',
      deal.amount_usd || deal.amount || 0.0,
      deal.expected_close_date || null,
      deal.status || 'open',
      deal.owner_user_id || null,
      JSON.stringify(deal.custom_fields || {})
    );

    return (await this.getDeal(workspaceId, id))!;
  }

  public async updateDeal(workspaceId: string, id: string, updates: Partial<CrmDeal>): Promise<CrmDeal> {
    this.db.prepare(`
      UPDATE crm_deals SET
        pipeline_id = COALESCE(?, pipeline_id),
        stage_id = COALESCE(?, stage_id),
        contact_id = COALESCE(?, contact_id),
        company_id = COALESCE(?, company_id),
        name = COALESCE(?, name),
        amount = COALESCE(?, amount),
        currency = COALESCE(?, currency),
        amount_usd = COALESCE(?, amount_usd),
        expected_close_date = COALESCE(?, expected_close_date),
        status = COALESCE(?, status),
        owner_user_id = COALESCE(?, owner_user_id),
        custom_fields = COALESCE(?, custom_fields),
        last_activity_at = datetime('now'),
        updated_at = datetime('now')
      WHERE workspace_id = ? AND id = ?
    `).run(
      updates.pipeline_id || null,
      updates.stage_id || null,
      updates.contact_id !== undefined ? updates.contact_id : null,
      updates.company_id !== undefined ? updates.company_id : null,
      updates.name || null,
      updates.amount !== undefined ? updates.amount : null,
      updates.currency || null,
      updates.amount_usd !== undefined ? updates.amount_usd : null,
      updates.expected_close_date !== undefined ? updates.expected_close_date : null,
      updates.status || null,
      updates.owner_user_id !== undefined ? updates.owner_user_id : null,
      updates.custom_fields ? JSON.stringify(updates.custom_fields) : null,
      workspaceId,
      id
    );

    return (await this.getDeal(workspaceId, id))!;
  }

  public async deleteDeal(workspaceId: string, id: string): Promise<boolean> {
    this.db.prepare('DELETE FROM crm_deals WHERE workspace_id = ? AND id = ?').run(workspaceId, id);
    return true;
  }

  // =========================================================================
  // TASKS & SLA
  // =========================================================================
  public async listTasks(
    workspaceId: string,
    filter: { contactId?: string; dealId?: string; status?: string; assignedTo?: string } = {}
  ): Promise<CrmTask[]> {
    const conditions = ['workspace_id = ?'];
    const params: any[] = [workspaceId];

    if (filter.contactId) {
      conditions.push('contact_id = ?');
      params.push(filter.contactId);
    }
    if (filter.dealId) {
      conditions.push('deal_id = ?');
      params.push(filter.dealId);
    }
    if (filter.status) {
      conditions.push('status = ?');
      params.push(filter.status);
    }
    if (filter.assignedTo) {
      conditions.push('assigned_to_user_id = ?');
      params.push(filter.assignedTo);
    }

    const rows = this.db.prepare(`
      SELECT * FROM crm_tasks WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC
    `).all(...params) as any[];

    const now = Date.now();
    return rows.map((r) => {
      let isOverdue = false;
      let remainingMin: number | null = null;

      if (r.due_date && r.status !== 'completed' && r.status !== 'cancelled') {
        const due = new Date(r.due_date).getTime();
        isOverdue = due < now;
        remainingMin = Math.round((due - now) / (1000 * 60));
      }

      return {
        ...r,
        is_overdue: isOverdue,
        sla_remaining_minutes: remainingMin
      };
    });
  }

  public async createTask(workspaceId: string, task: Partial<CrmTask>): Promise<CrmTask> {
    const id = task.id || crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO crm_tasks (
        id, workspace_id, deal_id, contact_id, title, description, assigned_to_user_id, due_date, sla_minutes,
        priority, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      id,
      workspaceId,
      task.deal_id || null,
      task.contact_id || null,
      task.title || 'Untitled Task',
      task.description || null,
      task.assigned_to_user_id || null,
      task.due_date || null,
      task.sla_minutes || null,
      task.priority || 'medium',
      task.status || 'pending'
    );

    const row = this.db.prepare('SELECT * FROM crm_tasks WHERE id = ?').get(id) as any;
    return row;
  }

  public async updateTask(workspaceId: string, id: string, updates: Partial<CrmTask>): Promise<CrmTask> {
    this.db.prepare(`
      UPDATE crm_tasks SET
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        assigned_to_user_id = COALESCE(?, assigned_to_user_id),
        due_date = COALESCE(?, due_date),
        sla_minutes = COALESCE(?, sla_minutes),
        priority = COALESCE(?, priority),
        status = COALESCE(?, status),
        completed_at = CASE WHEN ? = 'completed' THEN datetime('now') ELSE completed_at END,
        updated_at = datetime('now')
      WHERE workspace_id = ? AND id = ?
    `).run(
      updates.title || null,
      updates.description !== undefined ? updates.description : null,
      updates.assigned_to_user_id !== undefined ? updates.assigned_to_user_id : null,
      updates.due_date !== undefined ? updates.due_date : null,
      updates.sla_minutes !== undefined ? updates.sla_minutes : null,
      updates.priority || null,
      updates.status || null,
      updates.status || null,
      workspaceId,
      id
    );

    const row = this.db.prepare('SELECT * FROM crm_tasks WHERE id = ?').get(id) as any;
    return row;
  }

  public async deleteTask(workspaceId: string, id: string): Promise<boolean> {
    this.db.prepare('DELETE FROM crm_tasks WHERE workspace_id = ? AND id = ?').run(workspaceId, id);
    return true;
  }

  // =========================================================================
  // PRESENCE & COLLISION DETECTION
  // =========================================================================
  public async upsertPresence(session: Partial<CrmPresenceSession>): Promise<void> {
    const id = session.id || crypto.randomUUID();
    const expiresAt = session.expires_at || new Date(Date.now() + 60000).toISOString();

    this.db.prepare(`
      INSERT OR REPLACE INTO crm_presence_sessions (
        id, workspace_id, user_id, user_name, entity_type, entity_id, action, expires_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      id,
      session.workspace_id,
      session.user_id,
      session.user_name || 'Teammate',
      session.entity_type || 'contact',
      session.entity_id,
      session.action || 'viewing',
      expiresAt
    );
  }

  public async getPresentUsers(
    workspaceId: string,
    entityType: 'contact' | 'deal',
    entityId: string
  ): Promise<CrmPresenceSession[]> {
    const rows = this.db.prepare(`
      SELECT * FROM crm_presence_sessions
      WHERE workspace_id = ? AND entity_type = ? AND entity_id = ? AND datetime(expires_at) > datetime('now')
      ORDER BY updated_at DESC
    `).all(workspaceId, entityType, entityId) as any[];

    return rows;
  }

  public async clearPresence(workspaceId: string, entityType: string, entityId: string, userId: string): Promise<void> {
    this.db.prepare(`
      DELETE FROM crm_presence_sessions
      WHERE workspace_id = ? AND entity_type = ? AND entity_id = ? AND user_id = ?
    `).run(workspaceId, entityType, entityId, userId);
  }

  // =========================================================================
  // CRM V2 PHASE 7: RBAC, PRIVACY & GDPR ERASURE
  // =========================================================================
  public async listRolePermissions(workspaceId: string): Promise<CrmRolePermission[]> {
    const rows = this.db.prepare('SELECT * FROM crm_role_permissions WHERE workspace_id = ?').all(workspaceId) as any[];
    if (rows.length === 0) {
      // Seed default permissions for roles
      const defaultRoles = [
        { role: 'owner', can_export: true, can_bulk_delete: true, can_view_phones: true, can_view_emails: true, can_view_sensitive_fields: true, can_merge_contacts: true, can_manage_api_keys: true, can_manage_billing: true },
        { role: 'admin', can_export: true, can_bulk_delete: true, can_view_phones: true, can_view_emails: true, can_view_sensitive_fields: true, can_merge_contacts: true, can_manage_api_keys: true, can_manage_billing: true },
        { role: 'manager', can_export: true, can_bulk_delete: false, can_view_phones: true, can_view_emails: true, can_view_sensitive_fields: true, can_merge_contacts: true, can_manage_api_keys: false, can_manage_billing: false },
        { role: 'rep', can_export: false, can_bulk_delete: false, can_view_phones: true, can_view_emails: true, can_view_sensitive_fields: false, can_merge_contacts: false, can_manage_api_keys: false, can_manage_billing: false },
        { role: 'read_only', can_export: false, can_bulk_delete: false, can_view_phones: false, can_view_emails: false, can_view_sensitive_fields: false, can_merge_contacts: false, can_manage_api_keys: false, can_manage_billing: false }
      ];

      for (const r of defaultRoles) {
        await this.saveRolePermission(workspaceId, r);
      }
      return this.listRolePermissions(workspaceId);
    }

    return rows.map((r) => ({
      ...r,
      can_export: Boolean(r.can_export),
      can_bulk_delete: Boolean(r.can_bulk_delete),
      can_view_phones: Boolean(r.can_view_phones),
      can_view_emails: Boolean(r.can_view_emails),
      can_view_sensitive_fields: Boolean(r.can_view_sensitive_fields),
      can_merge_contacts: Boolean(r.can_merge_contacts),
      can_manage_api_keys: Boolean(r.can_manage_api_keys),
      can_manage_billing: Boolean(r.can_manage_billing)
    }));
  }

  public async getRolePermission(workspaceId: string, role: string): Promise<CrmRolePermission | null> {
    const permissions = await this.listRolePermissions(workspaceId);
    return permissions.find((p) => p.role === role) || null;
  }

  public async saveRolePermission(workspaceId: string, perm: Partial<CrmRolePermission>): Promise<CrmRolePermission> {
    const id = perm.id || crypto.randomUUID();
    this.db.prepare(`
      INSERT OR REPLACE INTO crm_role_permissions (
        id, workspace_id, role, can_export, can_bulk_delete, can_view_phones, can_view_emails,
        can_view_sensitive_fields, can_merge_contacts, can_manage_api_keys, can_manage_billing, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      id,
      workspaceId,
      perm.role || 'rep',
      perm.can_export ? 1 : 0,
      perm.can_bulk_delete ? 1 : 0,
      perm.can_view_phones ? 1 : 0,
      perm.can_view_emails ? 1 : 0,
      perm.can_view_sensitive_fields ? 1 : 0,
      perm.can_merge_contacts ? 1 : 0,
      perm.can_manage_api_keys ? 1 : 0,
      perm.can_manage_billing ? 1 : 0
    );

    const row = this.db.prepare('SELECT * FROM crm_role_permissions WHERE workspace_id = ? AND role = ?').get(workspaceId, perm.role) as any;
    return {
      ...row,
      can_export: Boolean(row.can_export),
      can_bulk_delete: Boolean(row.can_bulk_delete),
      can_view_phones: Boolean(row.can_view_phones),
      can_view_emails: Boolean(row.can_view_emails),
      can_view_sensitive_fields: Boolean(row.can_view_sensitive_fields),
      can_merge_contacts: Boolean(row.can_merge_contacts),
      can_manage_api_keys: Boolean(row.can_manage_api_keys),
      can_manage_billing: Boolean(row.can_manage_billing)
    };
  }

  public async listSensitiveFields(workspaceId: string): Promise<CrmSensitiveField[]> {
    const rows = this.db.prepare('SELECT * FROM crm_sensitive_fields WHERE workspace_id = ?').all(workspaceId) as any[];
    if (rows.length === 0) {
      // Seed default sensitive fields
      const defaults = [
        { field_key: 'salary', entity_type: 'contact', mask_strategy: 'redact' as const },
        { field_key: 'ssn', entity_type: 'contact', mask_strategy: 'hidden' as const },
        { field_key: 'aadhaar', entity_type: 'contact', mask_strategy: 'partial' as const },
        { field_key: 'credit_score', entity_type: 'contact', mask_strategy: 'redact' as const }
      ];
      for (const d of defaults) {
        await this.addSensitiveField(workspaceId, d);
      }
      return this.listSensitiveFields(workspaceId);
    }
    return rows;
  }

  public async addSensitiveField(workspaceId: string, field: Partial<CrmSensitiveField>): Promise<CrmSensitiveField> {
    const id = field.id || crypto.randomUUID();
    this.db.prepare(`
      INSERT OR REPLACE INTO crm_sensitive_fields (id, workspace_id, field_key, entity_type, mask_strategy, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(id, workspaceId, field.field_key, field.entity_type || 'contact', field.mask_strategy || 'redact');

    return (this.db.prepare('SELECT * FROM crm_sensitive_fields WHERE id = ?').get(id) as any);
  }

  public async removeSensitiveField(workspaceId: string, id: string): Promise<boolean> {
    this.db.prepare('DELETE FROM crm_sensitive_fields WHERE workspace_id = ? AND id = ?').run(workspaceId, id);
    return true;
  }

  public async saveErasureCertificate(cert: Partial<CrmErasureCertificate>): Promise<CrmErasureCertificate> {
    const id = cert.id || crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO crm_erasure_certificates (
        id, workspace_id, contact_id, requester_email, records_purged, audit_hash, erased_by_user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      id,
      cert.workspace_id,
      cert.contact_id,
      cert.requester_email,
      cert.records_purged || 1,
      cert.audit_hash,
      cert.erased_by_user_id || null
    );

    return (this.db.prepare('SELECT * FROM crm_erasure_certificates WHERE id = ?').get(id) as any);
  }

  public async getErasureCertificate(id: string): Promise<CrmErasureCertificate | null> {
    const row = this.db.prepare('SELECT * FROM crm_erasure_certificates WHERE id = ?').get(id) as any;
    return row || null;
  }

  public async hardDeleteContact(workspaceId: string, contactId: string): Promise<number> {
    let purgedCount = 0;
    const tx = this.db.transaction(() => {
      // 1. Purge contact tags
      const r1 = this.db.prepare('DELETE FROM crm_contact_tags WHERE workspace_id = ? AND contact_id = ?').run(workspaceId, contactId);
      purgedCount += r1.changes;

      // 2. Purge list memberships
      const r2 = this.db.prepare('DELETE FROM crm_list_members WHERE workspace_id = ? AND contact_id = ?').run(workspaceId, contactId);
      purgedCount += r2.changes;

      // 3. Purge activities
      const r3 = this.db.prepare('DELETE FROM crm_activities WHERE workspace_id = ? AND contact_id = ?').run(workspaceId, contactId);
      purgedCount += r3.changes;

      // 4. Purge field history
      const r4 = this.db.prepare("DELETE FROM crm_field_history WHERE workspace_id = ? AND entity_type = 'contact' AND entity_id = ?").run(workspaceId, contactId);
      purgedCount += r4.changes;

      // 5. Purge tasks
      const r5 = this.db.prepare('DELETE FROM crm_tasks WHERE workspace_id = ? AND contact_id = ?').run(workspaceId, contactId);
      purgedCount += r5.changes;

      // 6. Purge presence
      this.db.prepare("DELETE FROM crm_presence_sessions WHERE workspace_id = ? AND entity_type = 'contact' AND entity_id = ?").run(workspaceId, contactId);

      // 7. Hard delete contact record
      const r7 = this.db.prepare('DELETE FROM crm_contacts WHERE workspace_id = ? AND id = ?').run(workspaceId, contactId);
      purgedCount += r7.changes;
    });

    tx();
    return purgedCount;
  }

  // =========================================================================
  // CRM V2 PHASE 9: ANALYTICS, FUNNELS, ATTRIBUTION & COHORTS
  // =========================================================================
  public async getFunnelMetrics(workspaceId: string, pipelineId?: string): Promise<FunnelMetrics> {
    let targetPipelineId = pipelineId;
    if (!targetPipelineId) {
      const p = this.db.prepare("SELECT id FROM crm_pipelines WHERE workspace_id = ? ORDER BY is_default DESC, created_at ASC LIMIT 1").get(workspaceId) as any;
      targetPipelineId = p?.id;
    }
    if (!targetPipelineId) {
      return {
        pipeline_id: '',
        stages: [],
        overall_win_rate: 0,
        avg_sales_cycle_days: 0,
        win_rate_by_source: {}
      };
    }

    const stages = this.db.prepare(`
      SELECT id, name, order_index, is_won, is_lost 
      FROM crm_pipeline_stages 
      WHERE workspace_id = ? AND pipeline_id = ? 
      ORDER BY order_index ASC
    `).all(workspaceId, targetPipelineId) as any[];

    const deals = this.db.prepare(`
      SELECT d.id, d.stage_id, d.amount_usd, d.status, d.created_at, d.updated_at, COALESCE(c.source, 'manual') as source
      FROM crm_deals d
      LEFT JOIN crm_contacts c ON d.contact_id = c.id
      WHERE d.workspace_id = ? AND d.pipeline_id = ?
    `).all(workspaceId, targetPipelineId) as any[];

    const stageMetrics: FunnelStageMetric[] = [];
    let prevCount = 0;

    for (let i = 0; i < stages.length; i++) {
      const st = stages[i];
      const dealsInStage = deals.filter(d => d.stage_id === st.id);
      const dealCount = dealsInStage.length;
      const totalVal = dealsInStage.reduce((sum, d) => sum + (Number(d.amount_usd) || 0), 0);
      
      let conv = 100;
      if (i > 0) {
        conv = prevCount > 0 ? Math.round((dealCount / prevCount) * 100) : (dealCount > 0 ? 100 : 0);
      }
      prevCount = dealCount;

      stageMetrics.push({
        stage_id: st.id,
        stage_name: st.name,
        deal_count: dealCount,
        total_value_usd: Math.round(totalVal),
        conversion_from_previous: conv,
        drop_off_rate: Math.max(0, 100 - conv)
      });
    }

    const wonDeals = deals.filter(d => d.status === 'won');
    const totalDeals = deals.length;
    const overallWinRate = totalDeals > 0 ? Math.round((wonDeals.length / totalDeals) * 100) : 0;

    // Avg sales cycle
    const cycleDaysList = wonDeals.map(d => {
      const diff = new Date(d.updated_at).getTime() - new Date(d.created_at).getTime();
      return Math.max(0, diff / (1000 * 3600 * 24));
    });
    const avgCycle = cycleDaysList.length > 0 ? Math.round(cycleDaysList.reduce((a, b) => a + b, 0) / cycleDaysList.length) : 0;

    // Win rate by source
    const sourceMap: Record<string, { total: number; won: number }> = {};
    for (const d of deals) {
      const s = d.source || 'manual';
      if (!sourceMap[s]) sourceMap[s] = { total: 0, won: 0 };
      sourceMap[s].total++;
      if (d.status === 'won') sourceMap[s].won++;
    }
    const winRateBySource: Record<string, number> = {};
    for (const s in sourceMap) {
      winRateBySource[s] = Math.round((sourceMap[s].won / sourceMap[s].total) * 100);
    }

    return {
      pipeline_id: targetPipelineId,
      stages: stageMetrics,
      overall_win_rate: overallWinRate,
      avg_sales_cycle_days: avgCycle,
      win_rate_by_source: winRateBySource
    };
  }

  public async getAttributionMetrics(workspaceId: string): Promise<AttributionSummary> {
    const contactRows = this.db.prepare(`
      SELECT COALESCE(source, 'manual') as src, count(*) as count
      FROM crm_contacts
      WHERE workspace_id = ? AND deleted_at IS NULL
      GROUP BY COALESCE(source, 'manual')
    `).all(workspaceId) as any[];

    const dealRows = this.db.prepare(`
      SELECT 
        COALESCE(c.source, 'manual') as src, 
        count(d.id) as deals_count, 
        sum(CASE WHEN d.status = 'won' THEN d.amount_usd ELSE 0 END) as won_val
      FROM crm_contacts c
      LEFT JOIN crm_deals d ON d.contact_id = c.id AND d.workspace_id = c.workspace_id
      WHERE c.workspace_id = ? AND c.deleted_at IS NULL
      GROUP BY COALESCE(c.source, 'manual')
    `).all(workspaceId) as any[];

    const dealMap: Record<string, { deals_count: number; won_val: number }> = {};
    for (const dr of dealRows) {
      dealMap[dr.src] = {
        deals_count: Number(dr.deals_count) || 0,
        won_val: Number(dr.won_val) || 0
      };
    }

    let totalContacts = 0;
    let totalWonValue = 0;
    const bySource: AttributionSourceRow[] = [];

    for (const cr of contactRows) {
      const src = cr.src;
      const count = Number(cr.count) || 0;
      const deals = dealMap[src]?.deals_count || 0;
      const won = dealMap[src]?.won_val || 0;

      totalContacts += count;
      totalWonValue += won;

      bySource.push({
        source: src,
        contacts_count: count,
        deals_count: deals,
        won_value_usd: Math.round(won),
        conversion_rate: count > 0 ? Math.round((deals / count) * 100) : 0
      });
    }

    return {
      by_source: bySource,
      total_contacts: totalContacts,
      total_won_value_usd: Math.round(totalWonValue)
    };
  }

  public async getCohortRetention(workspaceId: string, months: number = 6): Promise<CohortRow[]> {
    const contacts = this.db.prepare(`
      SELECT id, strftime('%Y-%m', created_at) as cohort_month, created_at
      FROM crm_contacts
      WHERE workspace_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
    `).all(workspaceId) as any[];

    const activities = this.db.prepare(`
      SELECT a.contact_id, a.created_at
      FROM crm_activities a
      WHERE a.workspace_id = ?
    `).all(workspaceId) as any[];

    const actByContact: Record<string, string[]> = {};
    for (const a of activities) {
      if (!actByContact[a.contact_id]) actByContact[a.contact_id] = [];
      actByContact[a.contact_id].push(a.created_at);
    }

    const cohortMap: Record<string, any[]> = {};
    for (const c of contacts) {
      const m = c.cohort_month || 'Unknown';
      if (!cohortMap[m]) cohortMap[m] = [];
      cohortMap[m].push(c);
    }

    const cohortMonths = Object.keys(cohortMap).sort().reverse().slice(0, months);
    const result: CohortRow[] = [];

    for (const m of cohortMonths) {
      const group = cohortMap[m];
      const total = group.length;

      let m0Active = 0;
      let m1Active = 0;
      let m2Active = 0;
      let m3Active = 0;

      for (const c of group) {
        const cTime = new Date(c.created_at).getTime();
        const acts = actByContact[c.id] || [];

        let hasM0 = false;
        let hasM1 = false;
        let hasM2 = false;
        let hasM3 = false;

        for (const actDate of acts) {
          const aTime = new Date(actDate).getTime();
          const diffDays = (aTime - cTime) / (1000 * 3600 * 24);

          if (diffDays >= 0 && diffDays <= 30) hasM0 = true;
          else if (diffDays > 30 && diffDays <= 60) hasM1 = true;
          else if (diffDays > 60 && diffDays <= 90) hasM2 = true;
          else if (diffDays > 90 && diffDays <= 120) hasM3 = true;
        }

        if (hasM0) m0Active++;
        if (hasM1) m1Active++;
        if (hasM2) m2Active++;
        if (hasM3) m3Active++;
      }

      result.push({
        cohort_month: m,
        total_contacts: total,
        active_m0_pct: total > 0 ? Math.round((m0Active / total) * 100) : 0,
        active_m1_pct: total > 0 ? Math.round((m1Active / total) * 100) : 0,
        active_m2_pct: total > 0 ? Math.round((m2Active / total) * 100) : 0,
        active_m3_pct: total > 0 ? Math.round((m3Active / total) * 100) : 0
      });
    }

    return result;
  }

  public async runCustomReport(workspaceId: string, spec: CustomReportSpec): Promise<CustomReportResult> {
    let rows: any[] = [];

    if (spec.dimension === 'stage') {
      rows = this.db.prepare(`
        SELECT 
          s.name as dim_val,
          count(d.id) as cnt,
          COALESCE(sum(d.amount_usd), 0) as total_val,
          COALESCE(avg(d.amount_usd), 0) as avg_val
        FROM crm_pipeline_stages s
        LEFT JOIN crm_deals d ON d.stage_id = s.id AND d.workspace_id = s.workspace_id
        WHERE s.workspace_id = ?
        GROUP BY s.name
        ORDER BY cnt DESC
      `).all(workspaceId) as any[];
    } else {
      let dimExpr = 'c.country';
      if (spec.dimension === 'source') dimExpr = "COALESCE(c.source, 'manual')";
      else if (spec.dimension === 'status') dimExpr = "COALESCE(c.status, 'lead')";
      else if (spec.dimension === 'created_month') dimExpr = "strftime('%Y-%m', c.created_at)";

      rows = this.db.prepare(`
        SELECT 
          ${dimExpr} as dim_val,
          count(DISTINCT c.id) as cnt,
          COALESCE(sum(d.amount_usd), 0) as total_val,
          COALESCE(avg(d.amount_usd), 0) as avg_val
        FROM crm_contacts c
        LEFT JOIN crm_deals d ON d.contact_id = c.id AND d.workspace_id = c.workspace_id
        WHERE c.workspace_id = ? AND c.deleted_at IS NULL
        GROUP BY ${dimExpr}
        ORDER BY cnt DESC
      `).all(workspaceId) as any[];
    }

    return {
      dimension: spec.dimension,
      chart_type: spec.chart_type || 'bar',
      generated_at: new Date().toISOString(),
      rows: rows.map(r => ({
        dimension_value: r.dim_val || 'Unknown',
        metrics: {
          ...(spec.metrics.includes('count') ? { count: Number(r.cnt) || 0 } : {}),
          ...(spec.metrics.includes('total_deal_value') ? { total_deal_value: Math.round(Number(r.total_val) || 0) } : {}),
          ...(spec.metrics.includes('avg_deal_value') ? { avg_deal_value: Math.round(Number(r.avg_val) || 0) } : {})
        }
      }))
    };
  }
}

