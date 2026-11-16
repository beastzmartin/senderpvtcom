import Database from 'better-sqlite3';

export const MARGIN_SCHEMA_SQL = `
-- Margin & Markup Rules Table (Part A3 & C)
CREATE TABLE IF NOT EXISTS margin_rules (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK(scope IN ('global', 'provider', 'country', 'product', 'country_product', 'country_product_operator')),
  country TEXT,
  product TEXT,
  operator TEXT,
  type TEXT NOT NULL CHECK(type IN ('percent', 'fixed', 'percent_plus_fixed')),
  percent_value REAL NOT NULL DEFAULT 0.0,
  fixed_value REAL NOT NULL DEFAULT 0.0,
  min_price REAL DEFAULT 0.0,
  max_price REAL DEFAULT 0.0,
  custom_override_price REAL DEFAULT 0.0,
  description TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_margin_rules_scope ON margin_rules(scope);
CREATE INDEX IF NOT EXISTS idx_margin_rules_lookup ON margin_rules(country, product, operator, enabled);

-- Global Pricing Configuration Table (Part A3 & C & Step 0/1/3)
CREATE TABLE IF NOT EXISTS pricing_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  provider_currency TEXT NOT NULL DEFAULT 'USD',
  provider_currency_to_usd_rate REAL NOT NULL DEFAULT 1.0,
  fx_rate REAL NOT NULL DEFAULT 1.0,
  min_margin REAL NOT NULL DEFAULT 0.0,
  min_sell_price REAL NOT NULL DEFAULT 0.0,
  rounding_mode TEXT NOT NULL DEFAULT '2_decimals' CHECK(rounding_mode IN ('none', '2_decimals', 'nearest_1', '99_cents')),
  low_balance_threshold REAL NOT NULL DEFAULT 50.0,
  display_currency TEXT NOT NULL DEFAULT 'USD',
  ban_refund_policy TEXT NOT NULL DEFAULT 'auto' CHECK(ban_refund_policy IN ('auto', 'manual')),
  auto_refund_on_ban INTEGER NOT NULL DEFAULT 1,
  sync_interval_seconds INTEGER NOT NULL DEFAULT 60,
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
  provider_cost_raw REAL NOT NULL DEFAULT 0.0,
  provider_cost_usd REAL NOT NULL DEFAULT 0.0,
  margin_applied REAL NOT NULL DEFAULT 0.0,
  margin_rule_id TEXT,
  final_price_usd REAL NOT NULL DEFAULT 0.0,
  user_currency TEXT NOT NULL DEFAULT 'USD',
  final_price_user_currency REAL NOT NULL DEFAULT 0.0,
  exchange_rate_at_purchase REAL NOT NULL DEFAULT 1.0,
  cost_price REAL NOT NULL DEFAULT 0.0,
  sell_price REAL NOT NULL DEFAULT 0.0,
  profit REAL NOT NULL DEFAULT 0.0,
  currency TEXT NOT NULL DEFAULT 'USD',
  otp_code TEXT,
  sms_text TEXT,
  sms_history TEXT DEFAULT '[]',
  expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  finished_at TEXT,
  refunded INTEGER NOT NULL DEFAULT 0,
  refund_at TEXT,
  wallet_transaction_id TEXT,
  refund_transaction_id TEXT,
  reservation_id TEXT,
  locked_price_usd REAL DEFAULT 0.0
);

CREATE INDEX IF NOT EXISTS idx_number_orders_user_created ON number_orders(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_number_orders_fivesim_id ON number_orders(fivesim_order_id);
CREATE INDEX IF NOT EXISTS idx_number_orders_status ON number_orders(status);

-- Multi-Currency Exchange Rates System (Admin Managed & USD Sovereign)
CREATE TABLE IF NOT EXISTS currency_rates (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  rate_from_usd REAL NOT NULL DEFAULT 1.0,
  rate_from_5sim_base REAL NOT NULL DEFAULT 1.0,
  manual_override INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_currency_rates_active ON currency_rates(is_active);

-- Margin & Pricing Audit Log with Undo Support (Step 3)
CREATE TABLE IF NOT EXISTS margin_audit_logs (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_state TEXT,
  after_state TEXT,
  undone INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_margin_audit_time ON margin_audit_logs(created_at);
`;

/**
 * Initializes margin, pricing settings, currency rates, and number orders tables in SQLite database.
 */
export function initMarginSchema(db: Database.Database): void {
  db.exec(MARGIN_SCHEMA_SQL);

  // Safe migrations for existing SQLite tables
  const migrations = [
    // Users table preferred currency
    `ALTER TABLE users ADD COLUMN preferred_currency TEXT DEFAULT 'USD';`,

    // pricing_settings table columns
    `ALTER TABLE pricing_settings ADD COLUMN provider_currency TEXT DEFAULT 'USD';`,
    `ALTER TABLE pricing_settings ADD COLUMN provider_currency_to_usd_rate REAL DEFAULT 1.0;`,
    `ALTER TABLE pricing_settings ADD COLUMN ban_refund_policy TEXT DEFAULT 'auto';`,
    `ALTER TABLE pricing_settings ADD COLUMN auto_refund_on_ban INTEGER DEFAULT 1;`,
    `ALTER TABLE pricing_settings ADD COLUMN sync_interval_seconds INTEGER DEFAULT 60;`,

    // margin_rules table columns
    `ALTER TABLE margin_rules ADD COLUMN min_price REAL DEFAULT 0.0;`,
    `ALTER TABLE margin_rules ADD COLUMN max_price REAL DEFAULT 0.0;`,
    `ALTER TABLE margin_rules ADD COLUMN custom_override_price REAL DEFAULT 0.0;`,
    `ALTER TABLE margin_rules ADD COLUMN description TEXT;`,

    // currency_rates table columns
    `ALTER TABLE currency_rates ADD COLUMN rate_from_usd REAL DEFAULT 1.0;`,
    `ALTER TABLE currency_rates ADD COLUMN manual_override INTEGER DEFAULT 0;`,

    // number_orders table columns
    `ALTER TABLE number_orders ADD COLUMN provider_cost_raw REAL DEFAULT 0.0;`,
    `ALTER TABLE number_orders ADD COLUMN provider_cost_usd REAL DEFAULT 0.0;`,
    `ALTER TABLE number_orders ADD COLUMN margin_applied REAL DEFAULT 0.0;`,
    `ALTER TABLE number_orders ADD COLUMN margin_rule_id TEXT;`,
    `ALTER TABLE number_orders ADD COLUMN final_price_usd REAL DEFAULT 0.0;`,
    `ALTER TABLE number_orders ADD COLUMN user_currency TEXT DEFAULT 'USD';`,
    `ALTER TABLE number_orders ADD COLUMN final_price_user_currency REAL DEFAULT 0.0;`,
    `ALTER TABLE number_orders ADD COLUMN exchange_rate_at_purchase REAL DEFAULT 1.0;`,
    `ALTER TABLE number_orders ADD COLUMN sms_history TEXT DEFAULT '[]';`,
    `ALTER TABLE number_orders ADD COLUMN reservation_id TEXT;`,
    `ALTER TABLE number_orders ADD COLUMN locked_price_usd REAL DEFAULT 0.0;`
  ];

  for (const m of migrations) {
    try {
      db.exec(m);
    } catch {
      // Column already exists or safe ignore
    }
  }

  // Ensure margin_rules check constraint includes 'provider' scope
  try {
    const tableSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'margin_rules'").get() as any)?.sql || '';
    if (tableSql && !tableSql.includes("'provider'")) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS margin_rules_upgrade (
          id TEXT PRIMARY KEY,
          scope TEXT NOT NULL CHECK(scope IN ('global', 'provider', 'country', 'product', 'country_product', 'country_product_operator')),
          country TEXT,
          product TEXT,
          operator TEXT,
          type TEXT NOT NULL CHECK(type IN ('percent', 'fixed', 'percent_plus_fixed')),
          percent_value REAL NOT NULL DEFAULT 0.0,
          fixed_value REAL NOT NULL DEFAULT 0.0,
          min_price REAL DEFAULT 0.0,
          max_price REAL DEFAULT 0.0,
          custom_override_price REAL DEFAULT 0.0,
          description TEXT,
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
        INSERT OR IGNORE INTO margin_rules_upgrade (id, scope, country, product, operator, type, percent_value, fixed_value, min_price, max_price, custom_override_price, description, enabled, created_at, updated_at)
        SELECT id, scope, country, product, operator, type, percent_value, fixed_value, min_price, max_price, custom_override_price, description, enabled, created_at, updated_at FROM margin_rules;
        DROP TABLE margin_rules;
        ALTER TABLE margin_rules_upgrade RENAME TO margin_rules;
        CREATE INDEX IF NOT EXISTS idx_margin_rules_scope ON margin_rules(scope);
        CREATE INDEX IF NOT EXISTS idx_margin_rules_lookup ON margin_rules(country, product, operator, enabled);
      `);
    }
  } catch (err) {
    // Migration check ignore
  }

  // Seed default pricing settings if not existing
  const existingSettings = db.prepare("SELECT id FROM pricing_settings WHERE id = 'default'").get();
  if (!existingSettings) {
    db.prepare(`
      INSERT INTO pricing_settings (
        id, provider_currency, provider_currency_to_usd_rate, fx_rate, min_margin, min_sell_price,
        rounding_mode, low_balance_threshold, display_currency, ban_refund_policy, auto_refund_on_ban, sync_interval_seconds
      ) VALUES ('default', 'USD', 1.0, 1.0, 0.0, 0.0, '2_decimals', 50.0, 'USD', 'auto', 1, 60)
    `).run();
  }

  // Seed global default margin rule if none exists
  const existingGlobalRule = db.prepare("SELECT id FROM margin_rules WHERE scope = 'global'").get();
  if (!existingGlobalRule) {
    db.prepare(`
      INSERT INTO margin_rules (id, scope, country, product, operator, type, percent_value, fixed_value, min_price, max_price, enabled)
      VALUES ('default_global_margin', 'global', NULL, NULL, NULL, 'percent', 25.0, 0.0, 0.0, 0.0, 1)
    `).run();
  }

  // Standard USD-based currency exchange rates (1 USD = X Target Currency)
  const standardCurrencies = [
    { code: 'USD', name: 'US Dollar', symbol: '$', rate_from_usd: 1.0, is_default: 1, is_active: 1 },
    { code: 'INR', name: 'Indian Rupee', symbol: '₹', rate_from_usd: 86.50, is_default: 0, is_active: 1 },
    { code: 'EUR', name: 'Euro', symbol: '€', rate_from_usd: 0.95, is_default: 0, is_active: 1 },
    { code: 'GBP', name: 'British Pound', symbol: '£', rate_from_usd: 0.79, is_default: 0, is_active: 1 },
    { code: 'AED', name: 'UAE Dirham', symbol: 'AED', rate_from_usd: 3.67, is_default: 0, is_active: 1 },
    { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$', rate_from_usd: 1.40, is_default: 0, is_active: 1 },
    { code: 'RUB', name: 'Russian Ruble', symbol: '₽', rate_from_usd: 95.0, is_default: 0, is_active: 1 },
    { code: 'PKR', name: 'Pakistani Rupee', symbol: 'Rs', rate_from_usd: 278.0, is_default: 0, is_active: 1 },
    { code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳', rate_from_usd: 120.0, is_default: 0, is_active: 1 },
    { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', rate_from_usd: 5.75, is_default: 0, is_active: 1 },
    { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', rate_from_usd: 1530.0, is_default: 0, is_active: 1 }
  ];

  // Upsert standard currencies
  const upsertStmt = db.prepare(`
    INSERT INTO currency_rates (code, name, symbol, rate_from_usd, rate_from_5sim_base, is_default, is_active, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(code) DO UPDATE SET
      rate_from_usd = CASE WHEN currency_rates.manual_override = 1 THEN currency_rates.rate_from_usd ELSE excluded.rate_from_usd END,
      rate_from_5sim_base = excluded.rate_from_usd,
      symbol = excluded.symbol,
      name = excluded.name,
      updated_at = datetime('now')
  `);

  for (const c of standardCurrencies) {
    upsertStmt.run(c.code, c.name, c.symbol, c.rate_from_usd, c.rate_from_usd, c.is_default, c.is_active);
  }
}
