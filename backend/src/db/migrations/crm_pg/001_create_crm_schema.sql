-- ============================================================================
-- 100M+ CONTACTS CRM - PRODUCTION POSTGRESQL SCHEMA MIGRATION
-- Migration: 001_create_crm_schema.sql
-- Features: 64-Way Hash Partitioning on contacts, Lean Partial Indexes,
--           UUIDv7/Bigint support, JSONB Custom Fields, Keyset Pagination.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. WORKSPACES & MULTI-TENANCY
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_user_id TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'read_only')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_ws_members_user ON crm_workspace_members(user_id);

-- ----------------------------------------------------------------------------
-- 2. COMPANIES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT,
  industry TEXT,
  size_range TEXT,
  country TEXT,
  city TEXT,
  phone TEXT,
  website TEXT,
  linkedin_url TEXT,
  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_companies_ws_domain ON crm_companies (workspace_id, domain) WHERE domain IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_companies_ws_name ON crm_companies (workspace_id, name) WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- 3. CONTACTS (HASH-PARTITIONED BY workspace_id - 64 PARTITIONS)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  email_normalized TEXT,
  phone TEXT,
  phone_e164 TEXT,
  company_id UUID,
  title TEXT,
  country TEXT,
  city TEXT,
  source TEXT NOT NULL DEFAULT 'manual', -- 'extractor_job', 'import', 'api', 'manual'
  source_id TEXT,
  lead_score INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'customer', 'unresponsive', 'unqualified')),
  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  email_status TEXT NOT NULL DEFAULT 'unknown' CHECK (email_status IN ('valid', 'invalid', 'risky', 'unknown')),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  PRIMARY KEY (workspace_id, id)
) PARTITION BY HASH (workspace_id);

-- Automatically create 64 hash partitions for scale
DO $$
BEGIN
  FOR i IN 0..63 LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS crm_contacts_p%s PARTITION OF crm_contacts
      FOR VALUES WITH (MODULUS 64, REMAINDER %s);
    ', i, i);
  END LOOP;
END $$;

-- Partitioned Lean Indexes
-- 1. Deduplication on Normalized Email
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_contacts_ws_email_norm 
  ON crm_contacts (workspace_id, email_normalized) 
  WHERE email_normalized IS NOT NULL AND deleted_at IS NULL;

-- 2. Deduplication on E.164 Phone
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_contacts_ws_phone_e164 
  ON crm_contacts (workspace_id, phone_e164) 
  WHERE phone_e164 IS NOT NULL AND deleted_at IS NULL;

-- 3. High-Performance Keyset (Cursor) Pagination Index (NO OFFSET!)
CREATE INDEX IF NOT EXISTS idx_crm_contacts_keyset 
  ON crm_contacts (workspace_id, created_at DESC, id DESC) 
  WHERE deleted_at IS NULL;

-- 4. Status Filtering Index
CREATE INDEX IF NOT EXISTS idx_crm_contacts_status 
  ON crm_contacts (workspace_id, status) 
  WHERE deleted_at IS NULL;

-- 5. Company Lookup Index
CREATE INDEX IF NOT EXISTS idx_crm_contacts_company 
  ON crm_contacts (workspace_id, company_id) 
  WHERE company_id IS NOT NULL AND deleted_at IS NULL;

-- 6. GIN index on custom_fields for arbitrary structured JSON querying
CREATE INDEX IF NOT EXISTS idx_crm_contacts_custom_fields 
  ON crm_contacts USING GIN (custom_fields);

-- ----------------------------------------------------------------------------
-- 4. STATIC LISTS & DYNAMIC SEGMENTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_dynamic BOOLEAN NOT NULL DEFAULT FALSE,
  filter_definition JSONB DEFAULT NULL,
  cached_count INTEGER NOT NULL DEFAULT 0,
  last_counted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_lists_ws ON crm_lists(workspace_id);

CREATE TABLE IF NOT EXISTS crm_list_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  list_id UUID NOT NULL REFERENCES crm_lists(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (list_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_list_members_ws_contact ON crm_list_members(workspace_id, contact_id);

-- ----------------------------------------------------------------------------
-- 5. TAGS & CONTACT TAGS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, name)
);

CREATE TABLE IF NOT EXISTS crm_contact_tags (
  workspace_id UUID NOT NULL,
  contact_id UUID NOT NULL,
  tag_id UUID NOT NULL REFERENCES crm_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (contact_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_contact_tags_tag ON crm_contact_tags(workspace_id, tag_id);

-- ----------------------------------------------------------------------------
-- 6. CUSTOM FIELD DEFINITIONS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_custom_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  target_entity TEXT NOT NULL DEFAULT 'contact' CHECK (target_entity IN ('contact', 'company')),
  name TEXT NOT NULL,
  field_key TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('text', 'number', 'date', 'dropdown', 'multi_select', 'boolean')),
  options JSONB DEFAULT '[]'::jsonb,
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, target_entity, field_key)
);

-- ----------------------------------------------------------------------------
-- 7. ACTIVITIES TIMELINE & NOTES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL,
  user_id TEXT,
  type TEXT NOT NULL, -- 'note', 'task', 'call', 'email', 'extraction', 'imported', 'api_update', 'tag_added'
  title TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_activities_contact ON crm_activities (workspace_id, contact_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 8. IMPORTS & EXPORTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_path TEXT,
  total_rows INTEGER NOT NULL DEFAULT 0,
  processed_rows INTEGER NOT NULL DEFAULT 0,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  updated_rows INTEGER NOT NULL DEFAULT 0,
  skipped_rows INTEGER NOT NULL DEFAULT 0,
  error_rows INTEGER NOT NULL DEFAULT 0,
  dedupe_rule TEXT NOT NULL DEFAULT 'update' CHECK (dedupe_rule IN ('skip', 'update', 'merge')),
  column_mapping JSONB NOT NULL,
  list_id UUID REFERENCES crm_lists(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  error_report_url TEXT,
  error_details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS crm_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('csv', 'xlsx', 'json')),
  total_records INTEGER NOT NULL DEFAULT 0,
  filter_definition JSONB DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  file_path TEXT,
  download_url TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ----------------------------------------------------------------------------
-- 9. ASYNC BACKGROUND JOBS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  progress INTEGER NOT NULL DEFAULT 0,
  result JSONB DEFAULT NULL,
  error TEXT DEFAULT NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_jobs_queue ON crm_jobs(status, created_at) WHERE status IN ('queued', 'running');

-- ----------------------------------------------------------------------------
-- 10. EXTERNAL REST API KEYS & USAGE LOGS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  scopes JSONB NOT NULL DEFAULT '["contacts:read","contacts:write"]'::jsonb,
  rate_limit_rpm INTEGER NOT NULL DEFAULT 600,
  monthly_quota INTEGER NOT NULL DEFAULT 500000,
  monthly_usage INTEGER NOT NULL DEFAULT 0,
  is_test BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_api_keys_lookup ON crm_api_keys(key_hash) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS crm_api_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  api_key_id UUID REFERENCES crm_api_keys(id) ON DELETE SET NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_time_ms INTEGER NOT NULL,
  credits_charged REAL NOT NULL DEFAULT 0.0,
  currency TEXT NOT NULL DEFAULT 'INR',
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_usage_ws_time ON crm_api_usage_logs(workspace_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 11. WEBHOOKS & DELIVERIES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  description TEXT,
  events JSONB NOT NULL DEFAULT '["contact.created","contact.updated"]'::jsonb,
  secret TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  webhook_id UUID NOT NULL REFERENCES crm_webhooks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status_code INTEGER,
  response_body TEXT,
  duration_ms INTEGER,
  attempt INTEGER NOT NULL DEFAULT 1,
  success BOOLEAN NOT NULL,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_wh_deliveries_recent ON crm_webhook_deliveries(webhook_id, delivered_at DESC);

-- ----------------------------------------------------------------------------
-- 12. SUPPRESSION LIST & GDPR / UNSUBSCRIBE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_suppression_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('email', 'phone', 'domain')),
  value_normalized TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'unsubscribe' CHECK (reason IN ('unsubscribe', 'bounce', 'spam_complaint', 'manual_request', 'gdpr_deletion')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, type, value_normalized)
);

CREATE INDEX IF NOT EXISTS idx_crm_suppression_lookup ON crm_suppression_list(workspace_id, type, value_normalized);

-- ----------------------------------------------------------------------------
-- 13. AUDIT LOG
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  changes JSONB DEFAULT NULL,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_audit_ws ON crm_audit_log(workspace_id, created_at DESC);

