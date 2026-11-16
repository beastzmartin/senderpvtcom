-- ============================================================================
-- CRM V2 PHASE 1: DATA FOUNDATION (SCALE + FLEXIBILITY)
-- Migration: 002_crm_v2_foundation.sql
-- Features: Custom Objects, Object Relationships, Field-Level Audit Delta History,
--           Transactional Event Outbox, Hot/Cold Tiering (Archiving).
-- ============================================================================

-- 1. Hot/Cold Tiering on Contacts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'crm_contacts' AND column_name = 'is_archived'
  ) THEN
    ALTER TABLE crm_contacts ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE crm_contacts ADD COLUMN archived_at TIMESTAMPTZ;
  END IF;
END $$;

-- Partial Index for Active (Hot) Contacts
CREATE INDEX IF NOT EXISTS idx_crm_contacts_hot ON crm_contacts (workspace_id, created_at DESC) 
WHERE deleted_at IS NULL AND is_archived = FALSE;

-- 2. Custom Objects Engine
CREATE TABLE IF NOT EXISTS crm_custom_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  singular_label TEXT NOT NULL,
  plural_label TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  icon TEXT NOT NULL DEFAULT 'Boxes',
  primary_field_key TEXT NOT NULL DEFAULT 'name',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_crm_custom_objs_ws ON crm_custom_objects (workspace_id);

-- Custom Object Typed Fields
CREATE TABLE IF NOT EXISTS crm_custom_object_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  object_id UUID NOT NULL REFERENCES crm_custom_objects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  field_key TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('text', 'number', 'date', 'currency', 'dropdown', 'multi_select', 'url', 'user', 'formula')),
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  currency_code TEXT DEFAULT 'USD',
  formula_expression TEXT,
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  is_unique BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (object_id, field_key)
);

-- Custom Object Records
CREATE TABLE IF NOT EXISTS crm_custom_object_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  object_id UUID NOT NULL REFERENCES crm_custom_objects(id) ON DELETE CASCADE,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crm_custom_rec_ws_obj ON crm_custom_object_records (workspace_id, object_id, created_at DESC) 
WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_custom_rec_props_gin ON crm_custom_object_records USING gin (properties);

-- 3. Object Relationships & Associations (1-1, 1-many, many-many)
CREATE TABLE IF NOT EXISTS crm_object_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  source_object TEXT NOT NULL,
  target_object TEXT NOT NULL,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN ('one_to_one', 'one_to_many', 'many_to_many')),
  name TEXT NOT NULL,
  inverse_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, source_object, target_object, name)
);

CREATE TABLE IF NOT EXISTS crm_object_associations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  relationship_id UUID NOT NULL REFERENCES crm_object_relationships(id) ON DELETE CASCADE,
  source_entity_type TEXT NOT NULL,
  source_entity_id UUID NOT NULL,
  target_entity_type TEXT NOT NULL,
  target_entity_id UUID NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_assoc_src ON crm_object_associations (workspace_id, source_entity_type, source_entity_id);
CREATE INDEX IF NOT EXISTS idx_crm_assoc_tgt ON crm_object_associations (workspace_id, target_entity_type, target_entity_id);

-- 4. Field-Level History & Delta Tracking
CREATE TABLE IF NOT EXISTS crm_field_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  field_name TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  changed_by TEXT,
  source TEXT NOT NULL DEFAULT 'manual_ui',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_field_history_entity ON crm_field_history (workspace_id, entity_type, entity_id, created_at DESC);

-- 5. Transactional Event Outbox (Backbone for Search Sync, Analytics, Automations & Webhooks)
CREATE TABLE IF NOT EXISTS crm_outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'failed')),
  retry_count INT NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crm_outbox_pending ON crm_outbox_events (status, created_at ASC) 
WHERE status = 'pending';

