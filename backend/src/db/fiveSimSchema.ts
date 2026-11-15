import Database from 'better-sqlite3';

export const FIVE_SIM_SCHEMA_SQL = `
-- 5SIM Provider Configuration Table
CREATE TABLE IF NOT EXISTS fivesim_provider_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  api_key TEXT,
  base_url TEXT DEFAULT 'https://5sim.net/v1',
  is_enabled INTEGER DEFAULT 1,
  auto_sync INTEGER DEFAULT 1,
  max_requests_per_sec INTEGER DEFAULT 100,
  balance REAL DEFAULT 0,
  frozen_balance REAL DEFAULT 0,
  rating REAL DEFAULT 96,
  email TEXT,
  vendor TEXT,
  default_country TEXT,
  default_operator TEXT,
  default_forwarding_number TEXT,
  last_sync_at TEXT,
  last_error TEXT,
  last_error_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 5SIM Synced Orders History
CREATE TABLE IF NOT EXISTS fivesim_orders (
  id INTEGER PRIMARY KEY,
  category TEXT NOT NULL CHECK(category IN ('activation', 'hosting')),
  phone TEXT NOT NULL,
  operator TEXT,
  product TEXT NOT NULL,
  price REAL NOT NULL,
  status TEXT NOT NULL,
  expires_at TEXT,
  country TEXT,
  sms_payload TEXT DEFAULT '[]',
  sms_count INTEGER DEFAULT 0,
  forwarding INTEGER DEFAULT 0,
  forwarding_number TEXT,
  raw_data TEXT,
  created_at TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fivesim_orders_category ON fivesim_orders(category);
CREATE INDEX IF NOT EXISTS idx_fivesim_orders_status ON fivesim_orders(status);
CREATE INDEX IF NOT EXISTS idx_fivesim_orders_product ON fivesim_orders(product);
CREATE INDEX IF NOT EXISTS idx_fivesim_orders_phone ON fivesim_orders(phone);

-- 5SIM Synced Payments History
CREATE TABLE IF NOT EXISTS fivesim_payments (
  id INTEGER PRIMARY KEY,
  type_name TEXT NOT NULL,
  provider_name TEXT,
  amount REAL NOT NULL,
  balance REAL NOT NULL,
  raw_data TEXT,
  created_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_fivesim_payments_created ON fivesim_payments(created_at);

-- 5SIM Max Price Limits (Part 3)
CREATE TABLE IF NOT EXISTS fivesim_max_prices (
  id INTEGER PRIMARY KEY,
  product TEXT UNIQUE NOT NULL,
  price REAL NOT NULL,
  created_at TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fivesim_max_prices_product ON fivesim_max_prices(product);
`;

export function initFiveSimDatabase(db: Database.Database): void {
  try {
    // 1. Run Schema DDL
    db.exec(FIVE_SIM_SCHEMA_SQL);

    // 2. Ensure 5SIM provider is registered in virtual_number_providers table
    const existingProvider = db.prepare('SELECT id FROM virtual_number_providers WHERE slug = ?').get('fivesim') as any;
    if (!existingProvider) {
      console.log('[5SIM DB] Registering 5SIM Telecom Protocol in virtual_number_providers...');
      const insertProv = db.prepare(`
        INSERT INTO virtual_number_providers (
          id, name, slug, description, api_base_url, auth_type, encrypted_credentials,
          webhook_secret, priority, status, is_mock, supported_countries, capabilities, health_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, ?, ?, 'healthy')
      `);

      insertProv.run(
        'provider-fivesim-telecom',
        '5SIM.NET Virtual Telecom Protocol',
        'fivesim',
        'Direct automated integration with 5SIM.net API for virtual numbers, SMS activation, hosting rentals, and price management.',
        'https://5sim.net/v1',
        'bearer_token',
        JSON.stringify({ apiKey: process.env.FIVESIM_API_KEY || '' }),
        'whsec_fivesim_default',
        2,
        JSON.stringify(['any', 'england', 'usa', 'india', 'indonesia', 'france', 'germany', 'canada', 'brazil']),
        JSON.stringify(['sms', 'voice', 'hosting'])
      );
    }

    // 3. Ensure default config record exists
    const existingConfig = db.prepare('SELECT id FROM fivesim_provider_config WHERE id = ?').get('default') as any;
    if (!existingConfig) {
      const apiKey = process.env.FIVESIM_API_KEY || '';
      const baseUrl = process.env.FIVESIM_BASE_URL || 'https://5sim.net/v1';

      db.prepare(`
        INSERT INTO fivesim_provider_config (
          id, api_key, base_url, is_enabled, auto_sync, max_requests_per_sec,
          balance, frozen_balance, rating
        ) VALUES ('default', ?, ?, 1, 1, 100, 0, 0, 96)
      `).run(apiKey, baseUrl);
    }

    console.log('[5SIM DB] 5SIM database tables and provider registration verified.');
  } catch (err) {
    console.error('[5SIM DB] Error initializing 5SIM schema:', err);
  }
}

