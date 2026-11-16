-- ============================================================================
-- CRM V2 PHASE 3: SEGMENTATION, SAVED VIEWS & BULK ACTIONS ENGINE
-- Migration: 004_crm_v2_segmentation_and_bulk.sql
-- ============================================================================

-- 1. Saved Views & Shareable Segment Definitions
CREATE TABLE IF NOT EXISTS crm_saved_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  filter_definition JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_by TEXT NOT NULL DEFAULT 'created_at',
  sort_direction TEXT NOT NULL DEFAULT 'desc',
  visible_columns JSONB NOT NULL DEFAULT '["name","email","phone","company_name","status","lead_score"]'::jsonb,
  is_dynamic BOOLEAN NOT NULL DEFAULT TRUE,
  is_shared BOOLEAN NOT NULL DEFAULT FALSE,
  cached_count INT NOT NULL DEFAULT 0,
  last_refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_saved_views_ws ON crm_saved_views (workspace_id, is_shared);

-- 2. Tracked Bulk Jobs with Pause, Resume, Cancel & UNDO
CREATE TABLE IF NOT EXISTS crm_bulk_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('bulk_update', 'bulk_archive', 'bulk_unarchive', 'bulk_delete', 'bulk_add_to_list', 'bulk_remove_from_list', 'bulk_tag', 'bulk_untag')),
  filter_criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  action_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'paused', 'completed', 'cancelled', 'undone', 'failed')),
  total_matched INT NOT NULL DEFAULT 0,
  processed_count INT NOT NULL DEFAULT 0,
  success_count INT NOT NULL DEFAULT 0,
  error_count INT NOT NULL DEFAULT 0,
  error_details JSONB NOT NULL DEFAULT '[]'::jsonb,
  undo_snapshot_available BOOLEAN NOT NULL DEFAULT TRUE,
  undo_snapshot_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  undone_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crm_bulk_jobs_ws ON crm_bulk_jobs (workspace_id, status, created_at DESC);

