-- ============================================================================
-- CRM V2 PHASE 5: AUTOMATION ENGINE & WORKFLOW BUILDER
-- Migration: 006_crm_v2_automation_engine.sql
-- ============================================================================

-- 1. Workflows
CREATE TABLE IF NOT EXISTS crm_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  trigger_type TEXT NOT NULL,
  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  filter_criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_runs INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_wf_ws ON crm_workflows (workspace_id, is_active, trigger_type);

-- 2. Workflow Runs (State Machine & Durable Timers)
CREATE TABLE IF NOT EXISTS crm_workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES crm_workflows(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'waiting_delay', 'completed', 'failed', 'cancelled')),
  current_step_index INT NOT NULL DEFAULT 0,
  next_execution_at TIMESTAMPTZ,
  execution_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crm_wf_runs_pending ON crm_workflow_runs (status, next_execution_at) WHERE status = 'waiting_delay';
CREATE INDEX IF NOT EXISTS idx_crm_wf_runs_ws ON crm_workflow_runs (workspace_id, workflow_id, contact_id, status);

-- 3. Workflow Step Execution Logs (Step-by-step visual audit)
CREATE TABLE IF NOT EXISTS crm_workflow_step_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES crm_workflow_runs(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES crm_workflows(id) ON DELETE CASCADE,
  step_index INT NOT NULL,
  action_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'skipped', 'waiting')),
  input_payload JSONB DEFAULT '{}'::jsonb,
  output_payload JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  duration_ms INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_wf_step_logs_run ON crm_workflow_step_logs (run_id, step_index);

-- 4. Deliverability & Compliance Policy Settings
CREATE TABLE IF NOT EXISTS crm_compliance_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  max_messages_per_day INT NOT NULL DEFAULT 3,
  quiet_hours_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  quiet_hours_start TEXT NOT NULL DEFAULT '21:00',
  quiet_hours_end TEXT NOT NULL DEFAULT '09:00',
  auto_opt_out_keywords JSONB NOT NULL DEFAULT '["STOP", "UNSUBSCRIBE", "CANCEL", "ROK DO"]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

