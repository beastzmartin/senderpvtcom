-- =========================================================================
-- CRM V2: MIGRATION 009 - BOARDS (KANBAN) & SUPER FIELDS
-- Non-blocking DDL with IF NOT EXISTS and lean indexes
-- =========================================================================

-- 1. Boards
CREATE TABLE IF NOT EXISTS crm_boards (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#4f46e5',
  icon TEXT DEFAULT 'kanban',
  owner_user_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'workspace' CHECK (visibility IN ('private', 'team', 'workspace')),
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  card_layout JSONB NOT NULL DEFAULT '{}',
  filter_criteria JSONB NOT NULL DEFAULT '{}',
  auto_add_matching BOOLEAN NOT NULL DEFAULT FALSE,
  auto_remove_unmatched BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_crm_boards_ws_archived ON crm_boards (workspace_id, is_archived, created_at DESC);

-- 2. Board Columns (Stages)
CREATE TABLE IF NOT EXISTS crm_board_columns (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES crm_boards(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#94a3b8',
  order_index INTEGER NOT NULL DEFAULT 0,
  wip_limit INTEGER,
  stage_type TEXT NOT NULL DEFAULT 'standard' CHECK (stage_type IN ('standard', 'won', 'lost')),
  auto_actions JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_crm_board_cols_board_order ON crm_board_columns (board_id, order_index ASC);

-- 3. Board Cards (with LexoRank Fractional Indexing)
CREATE TABLE IF NOT EXISTS crm_board_cards (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES crm_boards(id) ON DELETE CASCADE,
  column_id TEXT NOT NULL REFERENCES crm_board_columns(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL DEFAULT 'contact' CHECK (entity_type IN ('contact', 'deal', 'task')),
  entity_id TEXT NOT NULL,
  rank TEXT NOT NULL DEFAULT '0|hzzzzz:',
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (board_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_board_cards_col_rank ON crm_board_cards (column_id, rank ASC);
CREATE INDEX IF NOT EXISTS idx_crm_board_cards_ws_entity ON crm_board_cards (workspace_id, entity_type, entity_id);

-- 4. Super Fields (Advanced Custom Fields with 20 Supported Types)
CREATE TABLE IF NOT EXISTS crm_super_fields (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL DEFAULT 'contact' CHECK (entity_type IN ('contact', 'company', 'deal')),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  field_type TEXT NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  is_unique BOOLEAN NOT NULL DEFAULT FALSE,
  min_value NUMERIC,
  max_value NUMERIC,
  validation_regex TEXT,
  default_value TEXT,
  options JSONB NOT NULL DEFAULT '[]',
  formula_expression TEXT,
  lookup_config JSONB NOT NULL DEFAULT '{}',
  auto_number_prefix TEXT,
  auto_number_padding INTEGER DEFAULT 4,
  group_name TEXT DEFAULT 'General',
  is_searchable BOOLEAN NOT NULL DEFAULT TRUE,
  is_filterable BOOLEAN NOT NULL DEFAULT TRUE,
  is_promoted BOOLEAN NOT NULL DEFAULT FALSE,
  visibility_roles JSONB NOT NULL DEFAULT '["owner", "admin", "manager", "rep", "read_only"]',
  linked_board_id TEXT REFERENCES crm_boards(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workspace_id, entity_type, slug)
);

CREATE INDEX IF NOT EXISTS idx_crm_super_fields_ws_entity ON crm_super_fields (workspace_id, entity_type, slug);

-- 5. Promoted Field Values (Hot-Table Optimization Indexing without ALTER TABLE)
CREATE TABLE IF NOT EXISTS crm_promoted_field_values (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  field_slug TEXT NOT NULL,
  text_value TEXT,
  number_value NUMERIC,
  date_value TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workspace_id, entity_type, entity_id, field_slug)
);

CREATE INDEX IF NOT EXISTS idx_crm_promoted_text ON crm_promoted_field_values (workspace_id, field_slug, text_value) WHERE text_value IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_promoted_num ON crm_promoted_field_values (workspace_id, field_slug, number_value) WHERE number_value IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_promoted_date ON crm_promoted_field_values (workspace_id, field_slug, date_value) WHERE date_value IS NOT NULL;

