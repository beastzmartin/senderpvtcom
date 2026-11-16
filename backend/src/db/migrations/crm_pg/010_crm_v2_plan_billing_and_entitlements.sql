-- =========================================================================
-- CRM V2: MIGRATION 010 - PLAN-BASED BILLING & HARD ENTITLEMENTS (WALLET-ONLY)
-- Zero-downtime non-blocking DDL with atomic concurrency counters
-- =========================================================================

-- 1. Billing Plans Catalog
CREATE TABLE IF NOT EXISTS crm_billing_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  price_usd NUMERIC(12, 4) NOT NULL DEFAULT 0.0,
  duration_days INTEGER NOT NULL DEFAULT 30,
  quota_contacts INTEGER NOT NULL DEFAULT 1000,
  quota_boards INTEGER NOT NULL DEFAULT 5,
  quota_columns_per_board INTEGER NOT NULL DEFAULT 10,
  quota_super_fields INTEGER NOT NULL DEFAULT 25,
  quota_tags INTEGER NOT NULL DEFAULT 50,
  quota_team_seats INTEGER NOT NULL DEFAULT 3,
  quota_api_calls_per_month INTEGER NOT NULL DEFAULT 10000,
  quota_automations_per_month INTEGER NOT NULL DEFAULT 5000,
  quota_messages_per_month INTEGER NOT NULL DEFAULT 2000,
  quota_storage_mb INTEGER NOT NULL DEFAULT 1024,
  quota_enrichment_credits INTEGER NOT NULL DEFAULT 100,
  quota_export_rows_per_month INTEGER NOT NULL DEFAULT 50000,
  feature_flags JSONB NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  trial_days INTEGER NOT NULL DEFAULT 0,
  is_recurring BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_crm_plans_visible_active ON crm_billing_plans (is_visible, is_active, sort_order ASC);

-- 2. Add-on Resource Packs
CREATE TABLE IF NOT EXISTS crm_billing_addons (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('contacts', 'seats', 'api_calls', 'automations', 'messages', 'enrichment_credits')),
  quantity INTEGER NOT NULL,
  price_usd NUMERIC(12, 4) NOT NULL,
  validity_days INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Billing Coupons / Discounts
CREATE TABLE IF NOT EXISTS crm_billing_coupons (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed_usd')),
  discount_value NUMERIC(12, 4) NOT NULL,
  max_uses INTEGER NOT NULL DEFAULT 100,
  current_uses INTEGER NOT NULL DEFAULT 0,
  plan_ids JSONB NOT NULL DEFAULT '[]',
  valid_until TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. Subscriptions
CREATE TABLE IF NOT EXISTS crm_subscriptions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  plan_id TEXT NOT NULL REFERENCES crm_billing_plans(id),
  plan_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'expiring_soon', 'grace', 'expired', 'cancelled', 'suspended')),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ends_at TIMESTAMPTZ NOT NULL,
  grace_ends_at TIMESTAMPTZ,
  auto_renew BOOLEAN NOT NULL DEFAULT TRUE,
  renew_retry_count INTEGER NOT NULL DEFAULT 0,
  custom_quotas JSONB NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_crm_subs_ws_status ON crm_subscriptions (workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_crm_subs_ends_at ON crm_subscriptions (status, ends_at ASC);

-- 5. Atomic Hard Usage Counters (Row-Lock Protected)
CREATE TABLE IF NOT EXISTS crm_usage_counters (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,
  used_count INTEGER NOT NULL DEFAULT 0,
  quota_limit INTEGER NOT NULL DEFAULT -1,
  period_start TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  period_end TIMESTAMPTZ,
  last_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workspace_id, resource_type)
);

CREATE INDEX IF NOT EXISTS idx_crm_usage_ws_res ON crm_usage_counters (workspace_id, resource_type);

-- 6. Invoices & Receipts (Wallet Debits)
CREATE TABLE IF NOT EXISTS crm_invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT UNIQUE NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  subscription_id TEXT REFERENCES crm_subscriptions(id) ON DELETE SET NULL,
  plan_name TEXT NOT NULL,
  amount_usd NUMERIC(12, 4) NOT NULL,
  amount_charged NUMERIC(12, 4) NOT NULL,
  currency_charged TEXT NOT NULL DEFAULT 'USD',
  exchange_rate_snapshot NUMERIC(12, 6) NOT NULL DEFAULT 1.0,
  subtotal_usd NUMERIC(12, 4) NOT NULL,
  discount_usd NUMERIC(12, 4) NOT NULL DEFAULT 0.0,
  tax_rate_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.0,
  tax_amount_usd NUMERIC(12, 4) NOT NULL DEFAULT 0.0,
  gstin TEXT,
  status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'refunded', 'void', 'credited')),
  ledger_tx_id TEXT,
  line_items JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_crm_invoices_ws_created ON crm_invoices (workspace_id, created_at DESC);

-- 7. Billing Configuration Settings
CREATE TABLE IF NOT EXISTS crm_billing_settings (
  id TEXT PRIMARY KEY,
  gst_vat_rate_percent NUMERIC(5, 2) NOT NULL DEFAULT 18.0,
  company_gstin TEXT DEFAULT '07AAAAA0000A1Z5',
  company_legal_name TEXT DEFAULT 'PVTSender Enterprise',
  invoice_footer TEXT DEFAULT 'Thank you for your business!',
  grace_period_days INTEGER NOT NULL DEFAULT 3,
  renewal_reminder_days INTEGER NOT NULL DEFAULT 7,
  stacking_rule TEXT NOT NULL DEFAULT 'extend' CHECK (stacking_rule IN ('extend', 'queue', 'prorate')),
  refund_policy TEXT NOT NULL DEFAULT 'pro_rata_wallet' CHECK (refund_policy IN ('full_wallet', 'pro_rata_wallet', 'none')),
  quota_definition_archived_frees_quota BOOLEAN NOT NULL DEFAULT TRUE,
  quota_overflow_policy TEXT NOT NULL DEFAULT 'partial_accept' CHECK (quota_overflow_policy IN ('partial_accept', 'reject_batch')),
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

