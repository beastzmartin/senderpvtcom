-- ============================================================================
-- CRM V2 PHASE 6: SALES PIPELINES, DEALS, TASKS & COLLABORATION
-- Migration: 007_crm_v2_sales_pipeline.sql
-- ============================================================================

-- 1. Pipelines
CREATE TABLE IF NOT EXISTS crm_pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_pipelines_ws ON crm_pipelines (workspace_id);

-- 2. Pipeline Stages
CREATE TABLE IF NOT EXISTS crm_pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES crm_pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  order_index INT NOT NULL DEFAULT 0,
  win_probability INT NOT NULL DEFAULT 10,
  rotten_days INT NOT NULL DEFAULT 14,
  is_won BOOLEAN NOT NULL DEFAULT FALSE,
  is_lost BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_stages_pipe ON crm_pipeline_stages (pipeline_id, order_index ASC);

-- 3. Deals (Opportunities)
CREATE TABLE IF NOT EXISTS crm_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES crm_pipelines(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES crm_pipeline_stages(id) ON DELETE RESTRICT,
  contact_id TEXT,
  company_id UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  currency TEXT NOT NULL DEFAULT 'USD',
  amount_usd NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  expected_close_date DATE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost')),
  owner_user_id TEXT,
  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_deals_stage ON crm_deals (workspace_id, pipeline_id, stage_id, status);
CREATE INDEX IF NOT EXISTS idx_crm_deals_contact ON crm_deals (workspace_id, contact_id);

-- 4. Tasks & SLA Timers
CREATE TABLE IF NOT EXISTS crm_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES crm_deals(id) ON DELETE CASCADE,
  contact_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to_user_id TEXT,
  due_date TIMESTAMPTZ,
  sla_minutes INT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_tasks_ws ON crm_tasks (workspace_id, assigned_to_user_id, status, due_date ASC);

-- 5. Real-Time Collaboration & Collision Detection Presence
CREATE TABLE IF NOT EXISTS crm_presence_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('contact', 'deal')),
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'viewing' CHECK (action IN ('viewing', 'editing')),
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_presence_session UNIQUE (workspace_id, entity_type, entity_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_presence_entity ON crm_presence_sessions (workspace_id, entity_type, entity_id, expires_at);

