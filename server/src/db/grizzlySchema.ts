import Database from 'better-sqlite3';

/**
 * GrizzlySMS Partner Protocol Database Schema
 * Comprehensive production schema for GrizzlySMS Partner API integration:
 * - grizzly_provider_config
 * - grizzly_country_mappings
 * - grizzly_service_mappings
 * - grizzly_hardware_modules
 * - grizzly_inventory
 * - grizzly_activations (official statuses: 1, 3, 4, 5)
 * - grizzly_sms_messages (durable outbound PUSH_SMS queue)
 * - grizzly_voice_calls (durable outbound PUSH_CALL queue)
 * - grizzly_call_records (durable outbound PUSH_CALL_RECORD queue)
 * - grizzly_number_service_cancellations (atomic cancellation counter; excluded at >= 5)
 * - grizzly_number_quarantine (quarantine for returned status 5 numbers)
 * - grizzly_prohibited_numbers (prohibited numbers for status 1)
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
  outbound_api_url TEXT DEFAULT 'https://api.grizzlysms.com/agent/api/sms',
  user_agent TEXT DEFAULT 'GrizzlySMS-Partner-Agent/2.0',
  priority INTEGER DEFAULT 10,
  max_active_numbers INTEGER DEFAULT 250,
  min_payout REAL DEFAULT 0.0,
  max_payout REAL DEFAULT 500.0,
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

-- 6. Grizzly Number Allocations (Activations with Official Statuses: 1, 3, 4, 5)
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
  status TEXT DEFAULT 'allocated' CHECK(status IN ('allocated', 'active', 'sms_received', 'finished', 'cancelled', 'expired', 'prohibited', 'returned')),
  official_grizzly_status INTEGER DEFAULT NULL, -- 1=prohibited, 3=sold, 4=cancelled, 5=returned
  hardware_module_id TEXT REFERENCES grizzly_hardware_modules(id),
  inventory_id TEXT REFERENCES grizzly_inventory(id),
  allocated_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT,
  sms_received_at TEXT,
  completed_at TEXT,
  callback_received_at TEXT,
  callback_count INTEGER DEFAULT 0,
  cancellation_reason TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_grizzly_act_id ON grizzly_activations(activation_id);
CREATE INDEX IF NOT EXISTS idx_grizzly_act_status ON grizzly_activations(status);
CREATE INDEX IF NOT EXISTS idx_grizzly_act_phone ON grizzly_activations(phone_number);
CREATE INDEX IF NOT EXISTS idx_grizzly_act_official ON grizzly_activations(official_grizzly_status);

-- 7. Grizzly SMS Message Queue (Durable Outbound PUSH_SMS)
CREATE TABLE IF NOT EXISTS grizzly_sms_messages (
  id TEXT PRIMARY KEY,
  sms_id INTEGER UNIQUE NOT NULL,
  activation_id INTEGER NOT NULL,
  phone_number TEXT NOT NULL,
  sender TEXT NOT NULL,
  message_content TEXT NOT NULL,
  received_timestamp TEXT DEFAULT (datetime('now')),
  delivery_status TEXT DEFAULT 'pending' CHECK(delivery_status IN ('pending', 'delivered', 'failed')),
  processing_status TEXT DEFAULT 'received',
  forwarding_status TEXT DEFAULT 'queued',
  retry_count INTEGER DEFAULT 0,
  next_retry_at TEXT,
  provider_response TEXT,
  last_error TEXT,
  delivered_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_grizzly_sms_act ON grizzly_sms_messages(activation_id);
CREATE INDEX IF NOT EXISTS idx_grizzly_sms_status ON grizzly_sms_messages(delivery_status);
CREATE INDEX IF NOT EXISTS idx_grizzly_sms_retry ON grizzly_sms_messages(next_retry_at);

-- 8. Grizzly Voice Call Notifications Queue (Durable Outbound PUSH_CALL)
CREATE TABLE IF NOT EXISTS grizzly_voice_calls (
  id TEXT PRIMARY KEY,
  call_id INTEGER UNIQUE NOT NULL,
  activation_id INTEGER,
  phone TEXT NOT NULL, -- Full international number e.g. 447472190082
  phone_from TEXT NOT NULL, -- Caller e.g. 447472190099
  delivery_status TEXT DEFAULT 'pending' CHECK(delivery_status IN ('pending', 'delivered', 'failed')),
  retry_count INTEGER DEFAULT 0,
  next_retry_at TEXT,
  provider_response TEXT,
  last_error TEXT,
  delivered_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_grizzly_calls_id ON grizzly_voice_calls(call_id);
CREATE INDEX IF NOT EXISTS idx_grizzly_calls_status ON grizzly_voice_calls(delivery_status);
CREATE INDEX IF NOT EXISTS idx_grizzly_calls_retry ON grizzly_voice_calls(next_retry_at);

-- 9. Grizzly Voice Call Records Queue (Durable Outbound PUSH_CALL_RECORD)
CREATE TABLE IF NOT EXISTS grizzly_call_records (
  id TEXT PRIMARY KEY,
  record_id INTEGER UNIQUE NOT NULL,
  call_id INTEGER,
  activation_id INTEGER,
  phone TEXT NOT NULL,
  phone_from TEXT NOT NULL,
  file_path TEXT,
  file_content_base64 TEXT,
  file_name TEXT DEFAULT 'call_record.mp3',
  content_type TEXT DEFAULT 'audio/mpeg',
  delivery_status TEXT DEFAULT 'pending' CHECK(delivery_status IN ('pending', 'delivered', 'failed')),
  retry_count INTEGER DEFAULT 0,
  next_retry_at TEXT,
  provider_response TEXT,
  last_error TEXT,
  delivered_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_grizzly_recs_id ON grizzly_call_records(record_id);
CREATE INDEX IF NOT EXISTS idx_grizzly_recs_status ON grizzly_call_records(delivery_status);

-- 10. Number & Service Cancellation Counter (Atomic Counter; Excluded at >= 5 cancellations)
CREATE TABLE IF NOT EXISTS grizzly_number_service_cancellations (
  id TEXT PRIMARY KEY,
  phone_number TEXT NOT NULL,
  service TEXT NOT NULL,
  cancellation_count INTEGER DEFAULT 0,
  is_permanently_excluded INTEGER DEFAULT 0,
  last_cancelled_at TEXT,
  last_reason TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(phone_number, service)
);

CREATE INDEX IF NOT EXISTS idx_grizzly_canc_phone_svc ON grizzly_number_service_cancellations(phone_number, service);
CREATE INDEX IF NOT EXISTS idx_grizzly_canc_excl ON grizzly_number_service_cancellations(is_permanently_excluded);

-- 11. Returned Number Quarantine (Status 5 Quarantine per service)
CREATE TABLE IF NOT EXISTS grizzly_number_quarantine (
  id TEXT PRIMARY KEY,
  phone_number TEXT NOT NULL,
  service TEXT NOT NULL,
  activation_id INTEGER,
  reason TEXT,
  status TEXT DEFAULT 'quarantined' CHECK(status IN ('quarantined', 'cleared', 'rejected')),
  quarantined_at TEXT DEFAULT (datetime('now')),
  cleared_at TEXT,
  UNIQUE(phone_number, service)
);

CREATE INDEX IF NOT EXISTS idx_grizzly_quar_phone_svc ON grizzly_number_quarantine(phone_number, service);
CREATE INDEX IF NOT EXISTS idx_grizzly_quar_status ON grizzly_number_quarantine(status);

-- 12. Prohibited Numbers (Status 1 Prohibitions)
CREATE TABLE IF NOT EXISTS grizzly_prohibited_numbers (
  id TEXT PRIMARY KEY,
  phone_number TEXT NOT NULL,
  service TEXT NOT NULL, -- Specific service or 'ALL'
  activation_id INTEGER,
  reason TEXT,
  prohibited_at TEXT DEFAULT (datetime('now')),
  UNIQUE(phone_number, service)
);

CREATE INDEX IF NOT EXISTS idx_grizzly_prohib_phone_svc ON grizzly_prohibited_numbers(phone_number, service);

-- 13. Grizzly Partner Accounting & Rewards
CREATE TABLE IF NOT EXISTS grizzly_provider_accounting (
  id TEXT PRIMARY KEY,
  activation_id INTEGER NOT NULL,
  requested_sum REAL NOT NULL,
  reward_amount REAL DEFAULT 0.0,
  settlement_status TEXT DEFAULT 'pending' CHECK(settlement_status IN ('pending', 'confirmed', 'settled', 'disputed', 'cancelled', 'refunded')),
  provider_ref TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_grizzly_acct_act ON grizzly_provider_accounting(activation_id);
CREATE INDEX IF NOT EXISTS idx_grizzly_acct_status ON grizzly_provider_accounting(settlement_status);

-- 14. Grizzly Partner API Request Logs
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
  // Perform safe column additions first if upgrading existing database
  try {
    db.prepare("ALTER TABLE grizzly_provider_config ADD COLUMN outbound_api_url TEXT DEFAULT 'https://api.grizzlysms.com/agent/api/sms'").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_provider_config ADD COLUMN user_agent TEXT DEFAULT 'GrizzlySMS-Partner-Agent/2.0'").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_activations ADD COLUMN official_grizzly_status INTEGER DEFAULT NULL").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_activations ADD COLUMN callback_received_at TEXT").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_activations ADD COLUMN callback_count INTEGER DEFAULT 0").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_activations ADD COLUMN cancellation_reason TEXT").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_sms_messages ADD COLUMN next_retry_at TEXT").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_voice_calls ADD COLUMN next_retry_at TEXT").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_call_records ADD COLUMN next_retry_at TEXT").run();
  } catch {}

  db.exec(GRIZZLY_SCHEMA_SQL);

  console.log('[DB] GrizzlySMS Partner Protocol production schema initialized.');
}
