-- ============================================================================
-- CRM V2 PHASE 7: SECURITY, COMPLIANCE & PRIVACY (RBAC, GDPR/DPDP, AUDIT)
-- Migration: 008_crm_v2_security_and_compliance.sql
-- ============================================================================

-- 1. Granular Role Permissions
CREATE TABLE IF NOT EXISTS crm_role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'rep', 'read_only')),
  can_export BOOLEAN NOT NULL DEFAULT TRUE,
  can_bulk_delete BOOLEAN NOT NULL DEFAULT FALSE,
  can_view_phones BOOLEAN NOT NULL DEFAULT TRUE,
  can_view_emails BOOLEAN NOT NULL DEFAULT TRUE,
  can_view_sensitive_fields BOOLEAN NOT NULL DEFAULT FALSE,
  can_merge_contacts BOOLEAN NOT NULL DEFAULT FALSE,
  can_manage_api_keys BOOLEAN NOT NULL DEFAULT FALSE,
  can_manage_billing BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_role_perm UNIQUE (workspace_id, role)
);

CREATE INDEX IF NOT EXISTS idx_crm_role_perm ON crm_role_permissions (workspace_id, role);

-- 2. Sensitive Field Registry
CREATE TABLE IF NOT EXISTS crm_sensitive_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'contact',
  mask_strategy TEXT NOT NULL DEFAULT 'redact' CHECK (mask_strategy IN ('redact', 'partial', 'hidden')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_sensitive_field UNIQUE (workspace_id, entity_type, field_key)
);

-- 3. GDPR & DPDP Right-to-Erasure Cryptographic Certificates
CREATE TABLE IF NOT EXISTS crm_erasure_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL,
  requester_email TEXT NOT NULL,
  records_purged INT NOT NULL DEFAULT 1,
  audit_hash TEXT NOT NULL,
  erased_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_erasure_cert ON crm_erasure_certificates (workspace_id, requester_email);

