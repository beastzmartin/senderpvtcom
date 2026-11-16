-- ============================================================================
-- CRM V2 PHASE 4: AI LAYER & SMART ENGINES
-- Migration: 005_crm_v2_ai_layer.sql
-- ============================================================================

-- 1. AI Assistant Usage & Token Ledger
CREATE TABLE IF NOT EXISTS crm_ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('contact_brief', 'smart_compose', 'import_mapping', 'lead_scoring')),
  model_tier TEXT NOT NULL DEFAULT 'gemini-1.5-flash',
  prompt_tokens INT NOT NULL DEFAULT 0,
  completion_tokens INT NOT NULL DEFAULT 0,
  credits_charged NUMERIC(10, 4) NOT NULL DEFAULT 0.0,
  currency TEXT NOT NULL DEFAULT 'INR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_ai_logs_ws ON crm_ai_usage_logs (workspace_id, user_id, created_at DESC);

-- 2. Lead Scoring Custom Rule Weights & Decay Settings
CREATE TABLE IF NOT EXISTS crm_scoring_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('icp_title', 'country_tier', 'verified_email', 'phone_present', 'activity_recency', 'time_decay')),
  criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  points_change INT NOT NULL DEFAULT 10,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_scoring_ws ON crm_scoring_rules (workspace_id, is_active);

