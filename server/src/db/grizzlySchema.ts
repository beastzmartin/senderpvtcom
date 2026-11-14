import Database from 'better-sqlite3';

/**
 * GrizzlySMS Partner Protocol Database Schema
 * Tables for GrizzlySMS Partner API integration:
 * - grizzly_provider_config
 * - grizzly_country_mappings
 * - grizzly_service_mappings
 * - grizzly_hardware_modules
 * - grizzly_inventory
 * - grizzly_activations
 * - grizzly_sms_messages
 * - grizzly_provider_accounting
 * - grizzly_api_logs
 */

export const GRIZZLY_SCHEMA_SQL = `
-- 1. Grizzly Provider Configuration
CREATE TABLE IF NOT EXISTS grizzly_provider_config (
  id TEXT PRIMARY KEY,
  provider_id TEXT REFERENCES virtual_number_providers(id) ON DELETE CASCADE,
  name TEXT DEFAULT 'GrizzlySMS',
  slug TEXT DEFAULT 'grizzlysms',
  protocol_key TEXT NOT NULL,
  status TEXT DEFAULT 'enabled' CHECK(status IN ('enabled', 'disabled', 'maintenance')),
  partner_api_endpoint TEXT,
  priority INTEGER DEFAULT 10,
  max_active_numbers INTEGER DEFAULT 100,
  min_payout REAL DEFAULT 0.0,
  max_payout REAL DEFAULT 100.0,
  ip_allowlist TEXT DEFAULT '[]',
  last_successful_request_at TEXT,
  last_error TEXT,
  last_error_at TEXT,
  total_requests_count INTEGER DEFAULT 0,
  successful_requests_count INTEGER DEFAULT 0,
  failed_requests_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 2. Grizzly Country Mappings (Numeric Country ID <-> ISO 2-letter Code)
CREATE TABLE IF NOT EXISTS grizzly_country_mappings (
  id TEXT PRIMARY KEY,
  grizzly_country_id INTEGER UNIQUE NOT NULL,
  iso_code TEXT NOT NULL,
  country_name TEXT NOT NULL,
  dial_code TEXT NOT NULL,
  flag_emoji TEXT,
  is_enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_grizzly_country_id ON grizzly_country_mappings(grizzly_country_id);
CREATE INDEX IF NOT EXISTS idx_grizzly_country_iso ON grizzly_country_mappings(iso_code);

-- 3. Grizzly Service Mappings (Service Slug <-> Display Name)
CREATE TABLE IF NOT EXISTS grizzly_service_mappings (
  id TEXT PRIMARY KEY,
  service_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'messaging',
  is_enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_grizzly_service_code ON grizzly_service_mappings(service_code);

-- 4. Grizzly Hardware & SIM Modules (Capacity Management)
CREATE TABLE IF NOT EXISTS grizzly_hardware_modules (
  id TEXT PRIMARY KEY,
  slot_number INTEGER UNIQUE,
  name TEXT NOT NULL,
  sim_iccid TEXT,
  phone_number TEXT,
  country_id INTEGER NOT NULL REFERENCES grizzly_country_mappings(grizzly_country_id),
  operator TEXT DEFAULT 'any',
  supported_services TEXT DEFAULT '["tg","wa","go","ig","vi","fb","ot"]',
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'occupied', 'failed', 'maintenance', 'idle')),
  max_concurrent_channels INTEGER DEFAULT 1,
  active_activation_id TEXT,
  last_health_check_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_grizzly_hw_status ON grizzly_hardware_modules(status);
CREATE INDEX IF NOT EXISTS idx_grizzly_hw_country ON grizzly_hardware_modules(country_id);

-- 5. Grizzly Dedicated / Shared Inventory
CREATE TABLE IF NOT EXISTS grizzly_inventory (
  id TEXT PRIMARY KEY,
  phone_number TEXT UNIQUE NOT NULL,
  country_id INTEGER NOT NULL REFERENCES grizzly_country_mappings(grizzly_country_id),
  operator TEXT DEFAULT 'any',
  hardware_module_id TEXT REFERENCES grizzly_hardware_modules(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'available' CHECK(status IN ('available', 'allocated', 'cooldown', 'maintenance', 'disabled')),
  supported_services TEXT DEFAULT '["tg","wa","go","ig","vi","fb","ot"]',
  can_get_another_sms INTEGER DEFAULT 1,
  flashcall_supported INTEGER DEFAULT 1,
  voice_supported INTEGER DEFAULT 0,
  cost_price REAL DEFAULT 0.0,
  last_allocated_at TEXT,
  total_allocations INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_grizzly_inv_country_status ON grizzly_inventory(country_id, status);
CREATE INDEX IF NOT EXISTS idx_grizzly_inv_phone ON grizzly_inventory(phone_number);

-- 6. Grizzly Number Allocations (Activations)
CREATE TABLE IF NOT EXISTS grizzly_activations (
  id TEXT PRIMARY KEY,
  activation_id INTEGER UNIQUE NOT NULL,
  phone_number TEXT NOT NULL,
  country_id INTEGER NOT NULL,
  operator TEXT NOT NULL,
  service TEXT NOT NULL,
  requested_sum REAL NOT NULL,
  can_get_another_sms INTEGER DEFAULT 1,
  flashcall INTEGER DEFAULT 1,
  voice INTEGER DEFAULT 0,
  status TEXT DEFAULT 'allocated' CHECK(status IN ('allocated', 'active', 'sms_received', 'finished', 'cancelled', 'expired')),
  hardware_module_id TEXT REFERENCES grizzly_hardware_modules(id),
  inventory_id TEXT REFERENCES grizzly_inventory(id),
  allocated_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT,
  sms_received_at TEXT,
  completed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_grizzly_act_id ON grizzly_activations(activation_id);
CREATE INDEX IF NOT EXISTS idx_grizzly_act_status ON grizzly_activations(status);
CREATE INDEX IF NOT EXISTS idx_grizzly_act_phone ON grizzly_activations(phone_number);

-- 7. Grizzly SMS Message Queue (PUSH_SMS Preparation)
CREATE TABLE IF NOT EXISTS grizzly_sms_messages (
  id TEXT PRIMARY KEY,
  activation_id INTEGER NOT NULL,
  phone_number TEXT NOT NULL,
  sender TEXT NOT NULL,
  message_content TEXT NOT NULL,
  received_timestamp TEXT DEFAULT (datetime('now')),
  processing_status TEXT DEFAULT 'received' CHECK(processing_status IN ('received', 'queued', 'forwarded', 'failed', 'pending_docs')),
  forwarding_status TEXT DEFAULT 'pending_docs',
  provider_response TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_grizzly_sms_act ON grizzly_sms_messages(activation_id);
CREATE INDEX IF NOT EXISTS idx_grizzly_sms_status ON grizzly_sms_messages(processing_status);

-- 8. Grizzly Partner Accounting & Rewards
CREATE TABLE IF NOT EXISTS grizzly_provider_accounting (
  id TEXT PRIMARY KEY,
  activation_id INTEGER NOT NULL,
  requested_sum REAL NOT NULL,
  reward_amount REAL DEFAULT 0.0,
  settlement_status TEXT DEFAULT 'pending' CHECK(settlement_status IN ('pending', 'confirmed', 'settled', 'disputed', 'cancelled')),
  provider_ref TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_grizzly_acct_act ON grizzly_provider_accounting(activation_id);
CREATE INDEX IF NOT EXISTS idx_grizzly_acct_status ON grizzly_provider_accounting(settlement_status);

-- 9. Grizzly Partner API Request Logs
CREATE TABLE IF NOT EXISTS grizzly_api_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  client_ip TEXT,
  request_headers TEXT,
  request_body TEXT, -- Redacted, protocol key stripped
  response_status TEXT NOT NULL,
  response_body TEXT,
  response_time_ms INTEGER NOT NULL,
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_grizzly_logs_created ON grizzly_api_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_grizzly_logs_action ON grizzly_api_logs(action);
`;

export function initGrizzlyDatabase(db: Database.Database): void {
  db.exec(GRIZZLY_SCHEMA_SQL);
  console.log('[DB] GrizzlySMS Partner Protocol schema initialized.');
}
