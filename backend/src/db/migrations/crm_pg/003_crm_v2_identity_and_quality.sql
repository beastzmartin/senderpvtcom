-- ============================================================================
-- CRM V2 PHASE 2: IDENTITY RESOLUTION, VERIFICATION & DATA QUALITY
-- Migration: 003_crm_v2_identity_and_quality.sql
-- ============================================================================

-- 1. Contact Merges Audit & UNMERGE Snapshot Store
CREATE TABLE IF NOT EXISTS crm_contact_merges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  primary_contact_id UUID NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  merged_contact_id UUID NOT NULL,
  merged_contact_snapshot JSONB NOT NULL,
  survivorship_rules_applied JSONB NOT NULL DEFAULT '{}'::jsonb,
  unmerged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_merges_ws_primary ON crm_contact_merges (workspace_id, primary_contact_id);

-- 2. Duplicate Review Queue & Confidence Match Tracking
CREATE TABLE IF NOT EXISTS crm_duplicate_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  primary_contact_id UUID NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  duplicate_contact_id UUID NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  confidence_score NUMERIC(5, 2) NOT NULL, -- e.g. 96.50
  match_reasons JSONB NOT NULL DEFAULT '[]'::jsonb, -- e.g. ["exact_email", "name_trigram_92"]
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'auto_merged', 'manual_merged', 'dismissed')),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, primary_contact_id, duplicate_contact_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_dupes_ws_status ON crm_duplicate_candidates (workspace_id, status, confidence_score DESC);

-- 3. Field Verification Logs (Email, Phone, Domain)
CREATE TABLE IF NOT EXISTS crm_verification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL, -- 'email', 'phone', 'website'
  field_value TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'native_mx_e164',
  status TEXT NOT NULL, -- 'valid', 'invalid', 'risky', 'unknown'
  confidence NUMERIC(4, 2) NOT NULL DEFAULT 1.00,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_verif_ws_contact ON crm_verification_logs (workspace_id, contact_id, field_name);

-- 4. Enrichment Waterfall Configuration (Pluggable Providers)
CREATE TABLE IF NOT EXISTS crm_enrichment_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL, -- 'hunter', 'clearbit', 'apollo', 'local_intelligence'
  priority_order INT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  api_key_encrypted TEXT,
  cost_per_lookup_credits NUMERIC(10, 4) NOT NULL DEFAULT 1.0,
  rate_limit_rpm INT NOT NULL DEFAULT 60,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, provider_name)
);

-- 5. Enrichment Cache (Prevents paying multiple times for identical lookups)
CREATE TABLE IF NOT EXISTS crm_enrichment_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lookup_key TEXT NOT NULL UNIQUE, -- e.g. "email:john@acme.com" or "domain:acme.com"
  provider_name TEXT NOT NULL,
  enriched_data JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_enrich_key ON crm_enrichment_cache (lookup_key);

