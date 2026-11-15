import Database from 'better-sqlite3';

export const MARGIN_SCHEMA_SQL = `
-- Margin & Markup Rules Table (Part A3 & C)
CREATE TABLE IF NOT EXISTS margin_rules (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK(scope IN ('global', 'country', 'product', 'country_product', 'country_product_operator')),
  country TEXT,
  product TEXT,
  operator TEXT,
  type TEXT NOT NULL CHECK(type IN ('percent', 'fixed', 'percent_plus_fixed')),
  percent_value REAL NOT NULL DEFAULT 0.0,
  fixed_value REAL NOT NULL DEFAULT 0.0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_margin_rules_scope ON margin_rules(scope);
CREATE INDEX IF NOT EXISTS idx_margin_rules_lookup ON margin_rules(country, product, operator, enabled);

-- Global Pricing Configuration Table (Part A3 & C)
CREATE TABLE IF NOT EXISTS pricing_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  fx_rate REAL NOT NULL DEFAULT 1.0,
  min_margin REAL NOT NULL DEFAULT 2.0,
  min_sell_price REAL NOT NULL DEFAULT 5.0,
  rounding_mode TEXT NOT NULL DEFAULT '2_decimals' CHECK(rounding_mode IN ('none', '2_decimals', 'nearest_1', '99_cents')),
  low_balance_threshold REAL NOT NULL DEFAULT 50.0,
  display_currency TEXT NOT NULL DEFAULT 'INR',
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Hidden / Disabled Catalog Items (Part A3 & C)
CREATE TABLE IF NOT EXISTS hidden_items (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('country', 'product')),
  value TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hidden_items_type_val ON hidden_items(type, value);

-- User Virtual Number Orders Table (Part B & C)
CREATE TABLE IF NOT EXISTS number_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  fivesim_order_id INTEGER UNIQUE,
  country TEXT NOT NULL,
  operator TEXT NOT NULL,
  product TEXT NOT NULL,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING_PURCHASE' CHECK(status IN ('PENDING_PURCHASE', 'PENDING', 'RECEIVED', 'CANCELED', 'TIMEOUT', 'FINISHED', 'BANNED')),
  cost_price REAL NOT NULL DEFAULT 0.0,
  sell_price REAL NOT NULL DEFAULT 0.0,
  profit REAL NOT NULL DEFAULT 0.0,
  currency TEXT NOT NULL DEFAULT 'INR',
  otp_code TEXT,
  sms_text TEXT,
  expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  finished_at TEXT,
  refunded INTEGER NOT NULL DEFAULT 0,
  refund_at TEXT,
  wallet_transaction_id TEXT,
  refund_transaction_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_number_orders_user_created ON number_orders(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_number_orders_fivesim_id ON number_orders(fivesim_order_id);
CREATE INDEX IF NOT EXISTS idx_number_orders_status ON number_orders(status);
`;

/**
 * Initializes margin, pricing settings, and number orders tables in SQLite database.
 */
export function initMarginSchema(db: Database.Database): void {
  db.exec(MARGIN_SCHEMA_SQL);

  // Seed default pricing settings if not existing
  const existingSettings = db.prepare("SELECT id FROM pricing_settings WHERE id = 'default'").get();
  if (!existingSettings) {
    db.prepare(`
      INSERT INTO pricing_settings (id, fx_rate, min_margin, min_sell_price, rounding_mode, low_balance_threshold, display_currency)
      VALUES ('default', 1.0, 2.0, 5.0, '2_decimals', 50.0, 'INR')
    `).run();
  }

  // Seed global default margin rule if none exists
  const existingGlobalRule = db.prepare("SELECT id FROM margin_rules WHERE scope = 'global'").get();
  if (!existingGlobalRule) {
    db.prepare(`
      INSERT INTO margin_rules (id, scope, country, product, operator, type, percent_value, fixed_value, enabled)
      VALUES ('default_global_margin', 'global', NULL, NULL, NULL, 'percent', 25.0, 0.0, 1)
    `).run();
  }
}

