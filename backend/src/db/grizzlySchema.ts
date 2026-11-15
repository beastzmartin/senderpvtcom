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

-- 15. Official Grizzly Countries Database
CREATE TABLE IF NOT EXISTS grizzly_countries (
  id TEXT PRIMARY KEY,
  provider_country_id INTEGER UNIQUE NOT NULL,
  country_name TEXT NOT NULL,
  country_code_iso2 TEXT,
  country_code_iso3 TEXT,
  flag TEXT,
  dial_code TEXT,
  is_active INTEGER DEFAULT 1,
  is_supported INTEGER DEFAULT 1,
  last_synced_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_grizzly_countries_prov_id ON grizzly_countries(provider_country_id);
CREATE INDEX IF NOT EXISTS idx_grizzly_countries_iso2 ON grizzly_countries(country_code_iso2);
CREATE INDEX IF NOT EXISTS idx_grizzly_countries_active ON grizzly_countries(is_active);

-- 16. Official Grizzly Service Registry
CREATE TABLE IF NOT EXISTS grizzly_services (
  id TEXT PRIMARY KEY,
  provider_service_code TEXT UNIQUE NOT NULL,
  service_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  icon TEXT,
  category TEXT DEFAULT 'general',
  is_active INTEGER DEFAULT 1,
  is_supported INTEGER DEFAULT 1,
  last_synced_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_grizzly_services_code ON grizzly_services(provider_service_code);
CREATE INDEX IF NOT EXISTS idx_grizzly_services_active ON grizzly_services(is_active);

-- 17. Grizzly Operators Configuration
CREATE TABLE IF NOT EXISTS grizzly_operators (
  id TEXT PRIMARY KEY,
  provider_operator_code TEXT NOT NULL,
  operator_name TEXT NOT NULL,
  country_id INTEGER,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(provider_operator_code, country_id)
);
CREATE INDEX IF NOT EXISTS idx_grizzly_operators_code ON grizzly_operators(provider_operator_code);

-- 18. Grizzly Country-Service Availability Registry
CREATE TABLE IF NOT EXISTS grizzly_country_services (
  id TEXT PRIMARY KEY,
  country_id TEXT,
  provider_country_id INTEGER NOT NULL,
  service_id TEXT,
  provider_service_code TEXT NOT NULL,
  operator_code TEXT DEFAULT 'any',
  available_quantity INTEGER DEFAULT 0,
  last_inventory_sync TEXT DEFAULT (datetime('now')),
  is_available INTEGER DEFAULT 1,
  is_enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(provider_country_id, provider_service_code, operator_code)
);
CREATE INDEX IF NOT EXISTS idx_grizzly_cs_pair ON grizzly_country_services(provider_country_id, provider_service_code);
CREATE INDEX IF NOT EXISTS idx_grizzly_cs_avail ON grizzly_country_services(is_available, is_enabled);

-- 19. Grizzly Data Import History & Audit Logs
CREATE TABLE IF NOT EXISTS grizzly_data_imports (
  id TEXT PRIMARY KEY,
  import_type TEXT NOT NULL,
  file_name TEXT,
  records_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'completed',
  errors TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_grizzly_imports_type ON grizzly_data_imports(import_type);

-- 20. GrizzlySMS Customer API Configuration (Purchasing from GrizzlySMS)
CREATE TABLE IF NOT EXISTS grizzly_customer_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  is_enabled INTEGER DEFAULT 1,
  api_key TEXT DEFAULT '',
  base_url TEXT DEFAULT 'https://api.grizzlysms.com/stubs/handler_api.php',
  default_country TEXT DEFAULT 'any',
  min_price REAL DEFAULT 0.0,
  max_price REAL DEFAULT 500.0,
  included_provider_ids TEXT DEFAULT '',
  excluded_provider_ids TEXT DEFAULT '',
  default_phone_exceptions TEXT DEFAULT '',
  timeout_seconds INTEGER DEFAULT 15,
  markup_percentage REAL DEFAULT 25.0,
  fixed_fee REAL DEFAULT 5.0,
  customer_daily_limit INTEGER DEFAULT 50,
  cached_balance REAL DEFAULT 0.0,
  cached_balance_currency TEXT DEFAULT 'RUB',
  last_health_check_at TEXT,
  last_error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 21. GrizzlySMS Customer Activations (Purchases made by our platform users from GrizzlySMS)
CREATE TABLE IF NOT EXISTS grizzly_customer_activations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  workspace_id TEXT,
  provider_id TEXT DEFAULT 'grizzlysms',
  provider_activation_id TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  country_id TEXT NOT NULL,
  country_name TEXT,
  service_code TEXT NOT NULL,
  service_name TEXT,
  purchase_request_id TEXT NOT NULL,
  wallet_transaction_id TEXT,
  customer_selling_price REAL NOT NULL,
  provider_acquisition_cost REAL DEFAULT 0.0,
  admin_profit REAL DEFAULT 0.0,
  currency TEXT DEFAULT 'INR',
  status TEXT DEFAULT 'NUMBER_ASSIGNED' CHECK(status IN ('NUMBER_ASSIGNED', 'WAITING_SMS', 'COMPLETED', 'CANCELLED', 'FAILED', 'UNRESOLVED')),
  sms_text TEXT,
  sms_code TEXT,
  sms_status TEXT DEFAULT 'PENDING' CHECK(sms_status IN ('PENDING', 'RECEIVED', 'EXPIRED')),
  idempotency_key TEXT UNIQUE,
  expires_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT,
  failure_reason TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_grizzly_cust_act_user ON grizzly_customer_activations(user_id);
CREATE INDEX IF NOT EXISTS idx_grizzly_cust_act_prov_id ON grizzly_customer_activations(provider_activation_id);
CREATE INDEX IF NOT EXISTS idx_grizzly_cust_act_phone ON grizzly_customer_activations(phone_number);
CREATE INDEX IF NOT EXISTS idx_grizzly_cust_act_status ON grizzly_customer_activations(status);
CREATE INDEX IF NOT EXISTS idx_grizzly_cust_act_idem ON grizzly_customer_activations(idempotency_key);

-- 22. GrizzlySMS Customer API Request/Response Diagnostics Logs
CREATE TABLE IF NOT EXISTS grizzly_customer_api_logs (
  id TEXT PRIMARY KEY,
  correlation_id TEXT NOT NULL,
  action TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  request_params TEXT,
  response_status_code INTEGER,
  response_body TEXT,
  parsed_status TEXT,
  is_success INTEGER DEFAULT 0,
  error_message TEXT,
  duration_ms INTEGER DEFAULT 0,
  user_id TEXT,
  client_ip TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_grizzly_cust_logs_corr ON grizzly_customer_api_logs(correlation_id);
CREATE INDEX IF NOT EXISTS idx_grizzly_cust_logs_action ON grizzly_customer_api_logs(action);
CREATE INDEX IF NOT EXISTS idx_grizzly_cust_logs_created ON grizzly_customer_api_logs(created_at);

-- 23. Normalized Customer Prices & Provider Comparison Cache
CREATE TABLE IF NOT EXISTS grizzly_customer_prices (
  id TEXT PRIMARY KEY,
  country_id TEXT NOT NULL,
  country_name TEXT,
  service_code TEXT NOT NULL,
  service_name TEXT,
  pricing_source TEXT DEFAULT 'getPricesV3',
  overall_price REAL DEFAULT 0.0,
  overall_quantity INTEGER DEFAULT 0,
  tier_prices TEXT, -- JSON map
  providers_data TEXT, -- JSON array of [{ providerId, count, price, lowestPrice, highestPrice }]
  lowest_provider_price REAL,
  highest_provider_price REAL,
  raw_response TEXT,
  is_stale INTEGER DEFAULT 0,
  last_synced_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_grizzly_cust_prices_cs ON grizzly_customer_prices(country_id, service_code);
CREATE INDEX IF NOT EXISTS idx_grizzly_cust_prices_srv ON grizzly_customer_prices(service_code);
CREATE INDEX IF NOT EXISTS idx_grizzly_cust_prices_synced ON grizzly_customer_prices(last_synced_at);

-- 24. GrizzlySMS Provider Rules & Selection Preferences
CREATE TABLE IF NOT EXISTS grizzly_provider_rules (
  id TEXT PRIMARY KEY,
  scope TEXT DEFAULT 'global' CHECK(scope IN ('global', 'country', 'service', 'country_service')),
  country_id TEXT,
  service_code TEXT,
  allowed_provider_ids TEXT,
  excluded_provider_ids TEXT,
  preferred_provider_id TEXT,
  min_price REAL,
  max_price REAL,
  markup_percentage REAL,
  fixed_fee REAL,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_grizzly_prov_rules_scope ON grizzly_provider_rules(scope, is_active);

-- 25. Active Activations Reconciliation Runs & Discrepancies
CREATE TABLE IF NOT EXISTS grizzly_reconciliation_runs (
  id TEXT PRIMARY KEY,
  total_remote INTEGER DEFAULT 0,
  total_local INTEGER DEFAULT 0,
  matched_count INTEGER DEFAULT 0,
  missing_locally_count INTEGER DEFAULT 0,
  missing_remotely_count INTEGER DEFAULT 0,
  discrepancy_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'completed',
  error_message TEXT,
  run_duration_ms INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS grizzly_reconciliation_records (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES grizzly_reconciliation_runs(id) ON DELETE CASCADE,
  provider_activation_id TEXT NOT NULL,
  local_activation_id TEXT,
  user_id TEXT,
  phone_number TEXT,
  service_code TEXT,
  country_code TEXT,
  provider_cost REAL,
  local_cost REAL,
  provider_status TEXT,
  local_status TEXT,
  discrepancy_type TEXT NOT NULL CHECK(discrepancy_type IN ('matched', 'missing_locally', 'missing_remotely', 'status_mismatch', 'cost_mismatch', 'requires_review')),
  resolution_status TEXT DEFAULT 'pending' CHECK(resolution_status IN ('pending', 'resolved', 'ignored')),
  resolution_notes TEXT,
  reconciled_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_grizzly_recon_rec_run ON grizzly_reconciliation_records(run_id);
CREATE INDEX IF NOT EXISTS idx_grizzly_recon_rec_prov_id ON grizzly_reconciliation_records(provider_activation_id);
CREATE INDEX IF NOT EXISTS idx_grizzly_recon_rec_type ON grizzly_reconciliation_records(discrepancy_type);

-- 26. Grizzly Crypto Wallets & Deposit Tracking
CREATE TABLE IF NOT EXISTS grizzly_crypto_wallets (
  id TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  coin TEXT NOT NULL,
  network TEXT NOT NULL,
  threshold_usd REAL DEFAULT 50.0,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'pending_verification', 'stale', 'archived')),
  raw_response TEXT,
  last_verified_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_grizzly_cw_coin_net ON grizzly_crypto_wallets(coin, network);
CREATE INDEX IF NOT EXISTS idx_grizzly_cw_status ON grizzly_crypto_wallets(status);

-- 27. Grizzly Advanced Synchronization Control Center
CREATE TABLE IF NOT EXISTS grizzly_sync_jobs (
  job_type TEXT PRIMARY KEY,
  job_name TEXT NOT NULL,
  status TEXT DEFAULT 'idle' CHECK(status IN ('idle', 'running', 'completed', 'failed')),
  last_attempted_at TEXT,
  last_successful_at TEXT,
  next_scheduled_at TEXT,
  records_inserted INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  records_unchanged INTEGER DEFAULT 0,
  records_marked_inactive INTEGER DEFAULT 0,
  invalid_records INTEGER DEFAULT 0,
  execution_duration_ms INTEGER DEFAULT 0,
  error_message TEXT,
  sanitized_response TEXT,
  error_report TEXT,
  is_locked INTEGER DEFAULT 0,
  locked_at TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS grizzly_sync_history (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL,
  records_inserted INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  records_unchanged INTEGER DEFAULT 0,
  records_marked_inactive INTEGER DEFAULT 0,
  invalid_records INTEGER DEFAULT 0,
  execution_duration_ms INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_grizzly_sync_hist_type ON grizzly_sync_history(job_type);
CREATE INDEX IF NOT EXISTS idx_grizzly_sync_hist_created ON grizzly_sync_history(created_at);
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
    db.prepare("ALTER TABLE grizzly_sms_messages ADD COLUMN sms_id INTEGER").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_sms_messages ADD COLUMN delivery_status TEXT DEFAULT 'pending'").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_sms_messages ADD COLUMN push_status TEXT DEFAULT 'PENDING_RETRY'").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_sms_messages ADD COLUMN delivered_at TEXT").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_sms_messages ADD COLUMN last_error TEXT").run();
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

  // Customer API & V2/V3 enhancements
  try {
    db.prepare("ALTER TABLE grizzly_customer_activations ADD COLUMN verification_type INTEGER DEFAULT NULL").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_customer_activations ADD COLUMN sms_history TEXT DEFAULT '[]'").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_customer_activations ADD COLUMN can_get_another_sms INTEGER DEFAULT 1").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_customer_activations ADD COLUMN currency_code TEXT DEFAULT 'RUB'").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_customer_activations ADD COLUMN currency_numeric INTEGER DEFAULT 643").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_customer_activations ADD COLUMN discount REAL DEFAULT 0.0").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_customer_activations ADD COLUMN repeated INTEGER DEFAULT 0").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_customer_activations ADD COLUMN activation_time TEXT").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_customer_activations ADD COLUMN last_polled_at TEXT").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_customer_activations ADD COLUMN reconciliation_status TEXT DEFAULT 'pending'").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_customer_activations ADD COLUMN last_reconciled_at TEXT").run();
  } catch {}

  try {
    db.prepare("ALTER TABLE grizzly_customer_config ADD COLUMN pricing_endpoint TEXT DEFAULT 'getPricesV3'").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_customer_config ADD COLUMN price_sync_interval_minutes INTEGER DEFAULT 60").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_customer_config ADD COLUMN auto_price_sync INTEGER DEFAULT 1").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_customer_config ADD COLUMN reconciliation_interval_minutes INTEGER DEFAULT 30").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_customer_config ADD COLUMN auto_reconciliation INTEGER DEFAULT 1").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_customer_config ADD COLUMN preferred_providers TEXT DEFAULT ''").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_customer_config ADD COLUMN min_profit REAL DEFAULT 2.0").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_customer_config ADD COLUMN max_acceptable_provider_cost REAL DEFAULT 100.0").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_customer_config ADD COLUMN currency_conversion_rate REAL DEFAULT 1.0").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_customer_config ADD COLUMN last_price_sync_at TEXT").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_customer_config ADD COLUMN last_reconciliation_at TEXT").run();
  } catch {}

  // Module 1: Crypto Wallet & Threshold configuration
  try {
    db.prepare("ALTER TABLE grizzly_customer_config ADD COLUMN crypto_wallet_address TEXT DEFAULT NULL").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_customer_config ADD COLUMN crypto_coin TEXT DEFAULT 'usdt'").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_customer_config ADD COLUMN crypto_network TEXT DEFAULT 'tron'").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_customer_config ADD COLUMN crypto_threshold_usd REAL DEFAULT 50.0").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_customer_config ADD COLUMN crypto_wallet_fetched_at TEXT DEFAULT NULL").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_customer_config ADD COLUMN crypto_wallet_status TEXT DEFAULT 'idle'").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_customer_config ADD COLUMN services_sync_interval_hours INTEGER DEFAULT 24").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_customer_config ADD COLUMN countries_sync_interval_hours INTEGER DEFAULT 24").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_customer_config ADD COLUMN auto_services_sync INTEGER DEFAULT 1").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_customer_config ADD COLUMN auto_countries_sync INTEGER DEFAULT 1").run();
  } catch {}

  // Module 2 & 3: Services & Multilingual Countries enhancements
  try {
    db.prepare("ALTER TABLE grizzly_services ADD COLUMN provider TEXT DEFAULT 'grizzlysms'").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_services ADD COLUMN status TEXT DEFAULT 'active'").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_services ADD COLUMN first_imported_at TEXT").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_services ADD COLUMN description TEXT DEFAULT NULL").run();
  } catch {}

  try {
    db.prepare("ALTER TABLE grizzly_countries ADD COLUMN provider TEXT DEFAULT 'grizzlysms'").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_countries ADD COLUMN rus TEXT DEFAULT NULL").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_countries ADD COLUMN eng TEXT DEFAULT NULL").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_countries ADD COLUMN chn TEXT DEFAULT NULL").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_countries ADD COLUMN tur TEXT DEFAULT NULL").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_countries ADD COLUMN spa TEXT DEFAULT NULL").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_countries ADD COLUMN hin TEXT DEFAULT NULL").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_countries ADD COLUMN ara TEXT DEFAULT NULL").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_countries ADD COLUMN fra TEXT DEFAULT NULL").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_countries ADD COLUMN custom_display_name TEXT DEFAULT NULL").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_countries ADD COLUMN custom_flag TEXT DEFAULT NULL").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_countries ADD COLUMN admin_notes TEXT DEFAULT NULL").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_countries ADD COLUMN status TEXT DEFAULT 'active'").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE grizzly_countries ADD COLUMN first_imported_at TEXT").run();
  } catch {}

  db.exec(GRIZZLY_SCHEMA_SQL);

  try {
    db.prepare(`
      INSERT OR IGNORE INTO grizzly_customer_config (id, is_enabled, base_url, timeout_seconds, markup_percentage, fixed_fee, crypto_threshold_usd)
      VALUES ('default', 1, 'https://api.grizzlysms.com/stubs/handler_api.php', 15, 25.0, 5.0, 50.0)
    `).run();
  } catch {}

  // Seed default synchronization jobs
  try {
    const seedJobs = [
      { type: 'services', name: 'Services Catalogue Synchronization' },
      { type: 'countries', name: 'Multilingual Countries Synchronization' },
      { type: 'prices', name: 'Live Price Quotes Sync (V1/V2/V3)' },
      { type: 'stock', name: 'Provider Inventory & Route Comparison' },
      { type: 'activations', name: 'Active Activations Reconciliation' },
      { type: 'crypto_wallet', name: 'Crypto Deposit Address Verification' }
    ];

    const jobStmt = db.prepare(`
      INSERT OR IGNORE INTO grizzly_sync_jobs (job_type, job_name, status)
      VALUES (?, ?, 'idle')
    `);

    for (const j of seedJobs) {
      jobStmt.run(j.type, j.name);
    }
  } catch {}

  console.log('[DB] GrizzlySMS Partner Protocol production schema initialized.');
}
