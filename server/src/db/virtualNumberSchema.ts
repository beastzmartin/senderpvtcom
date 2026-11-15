/**
 * Virtual Number Marketplace & Management System - Database Schema
 * Standardized tables for multi-provider virtual phone numbers, inventory,
 * wallet-integrated orders, rental lifecycles, pricing markup, SMS, voice, and audit logging.
 */

export const VIRTUAL_NUMBER_SCHEMA_SQL = `
-- 1. Virtual Number Providers Registry
CREATE TABLE IF NOT EXISTS virtual_number_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  logo_url TEXT,
  api_base_url TEXT,
  auth_type TEXT DEFAULT 'api_key' CHECK(auth_type IN ('api_key', 'bearer_token', 'basic_auth', 'oauth2', 'custom')),
  encrypted_credentials TEXT, -- Encrypted JSON string (API key, secret, account ID, tokens)
  webhook_secret TEXT,
  priority INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'maintenance', 'deprecated')),
  is_mock INTEGER DEFAULT 0, -- 1 for sandbox mock provider, 0 for real production provider
  supported_countries TEXT, -- JSON array of ISO-2 codes e.g. ["US", "GB", "IN"]
  capabilities TEXT, -- JSON array e.g. ["sms", "voice", "mms", "whatsapp"]
  health_status TEXT DEFAULT 'healthy' CHECK(health_status IN ('healthy', 'degraded', 'offline', 'untested')),
  last_health_check_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vn_providers_status ON virtual_number_providers(status);
CREATE INDEX IF NOT EXISTS idx_vn_providers_priority ON virtual_number_providers(priority);

-- 2. Supported Countries Registry
CREATE TABLE IF NOT EXISTS virtual_number_countries (
  iso_code TEXT PRIMARY KEY, -- e.g. 'US', 'GB', 'IN', 'CA'
  name TEXT NOT NULL,
  dial_code TEXT NOT NULL, -- e.g. '+1', '+44', '+91'
  flag_emoji TEXT NOT NULL, -- e.g. '🇺🇸', '🇬🇧', '🇮🇳'
  continent TEXT,
  is_active INTEGER DEFAULT 1,
  available_numbers_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vn_countries_active ON virtual_number_countries(is_active);

-- 3. Virtual Number Products & Categories
CREATE TABLE IF NOT EXISTS virtual_number_products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('mobile', 'geographic', 'toll_free', 'dedicated', 'temporary')),
  capabilities TEXT NOT NULL, -- JSON array e.g. ["sms"], ["voice"], ["sms", "voice"]
  whatsapp_supported INTEGER DEFAULT 0,
  otp_supported INTEGER DEFAULT 0,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 4. Central Pricing & Admin Markup Rules
CREATE TABLE IF NOT EXISTS virtual_number_pricing (
  id TEXT PRIMARY KEY,
  provider_id TEXT REFERENCES virtual_number_providers(id) ON DELETE CASCADE,
  country_code TEXT REFERENCES virtual_number_countries(iso_code) ON DELETE CASCADE,
  product_id TEXT REFERENCES virtual_number_products(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE, -- Optional customer-specific override
  workspace_id TEXT, -- Optional workspace-specific override
  pricing_model TEXT DEFAULT 'markup_fixed' CHECK(pricing_model IN ('markup_fixed', 'markup_percentage', 'fixed_admin', 'cost_plus')),
  base_cost REAL NOT NULL DEFAULT 0.0, -- In platform currency (INR)
  activation_fee REAL NOT NULL DEFAULT 0.0,
  markup_amount REAL NOT NULL DEFAULT 0.0,
  markup_percentage REAL NOT NULL DEFAULT 0.0,
  daily_rental_price REAL NOT NULL DEFAULT 0.0,
  weekly_rental_price REAL NOT NULL DEFAULT 0.0,
  monthly_rental_price REAL NOT NULL DEFAULT 0.0,
  annual_rental_price REAL NOT NULL DEFAULT 0.0,
  renewal_price REAL NOT NULL DEFAULT 0.0,
  sms_inbound_charge REAL NOT NULL DEFAULT 0.0,
  voice_inbound_charge REAL NOT NULL DEFAULT 0.0,
  voice_outbound_charge REAL NOT NULL DEFAULT 0.0,
  tax_percentage REAL DEFAULT 0.0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vn_pricing_country ON virtual_number_pricing(country_code);
CREATE INDEX IF NOT EXISTS idx_vn_pricing_provider ON virtual_number_pricing(provider_id);

-- 5. Virtual Number Inventory Pool
CREATE TABLE IF NOT EXISTS virtual_number_inventory (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES virtual_number_providers(id) ON DELETE CASCADE,
  provider_number_ref TEXT, -- External provider's reference ID
  phone_number TEXT NOT NULL UNIQUE,
  country_code TEXT NOT NULL REFERENCES virtual_number_countries(iso_code),
  number_type TEXT NOT NULL CHECK(number_type IN ('mobile', 'geographic', 'toll_free', 'dedicated', 'temporary')),
  capabilities TEXT NOT NULL, -- JSON array e.g. ["sms", "voice"]
  whatsapp_compatible INTEGER DEFAULT 0,
  otp_compatible INTEGER DEFAULT 0,
  provider_base_cost REAL NOT NULL DEFAULT 0.0,
  activation_fee REAL NOT NULL DEFAULT 0.0,
  monthly_price REAL NOT NULL DEFAULT 0.0,
  renewal_price REAL NOT NULL DEFAULT 0.0,
  allowed_durations TEXT DEFAULT '["daily","weekly","monthly","annual"]', -- JSON array
  status TEXT DEFAULT 'available' CHECK(status IN ('available', 'reserved', 'allocated', 'cooldown', 'maintenance', 'retired')),
  reserved_for_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reserved_until TEXT,
  metadata TEXT, -- Provider-specific extra attributes (JSON)
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vn_inv_country ON virtual_number_inventory(country_code);
CREATE INDEX IF NOT EXISTS idx_vn_inv_status ON virtual_number_inventory(status);
CREATE INDEX IF NOT EXISTS idx_vn_inv_number ON virtual_number_inventory(phone_number);

-- 6. Virtual Number Purchase Orders & Allocation Requests
CREATE TABLE IF NOT EXISTS virtual_number_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT,
  inventory_id TEXT REFERENCES virtual_number_inventory(id) ON DELETE SET NULL,
  provider_id TEXT NOT NULL REFERENCES virtual_number_providers(id),
  phone_number TEXT NOT NULL,
  country_code TEXT NOT NULL,
  rental_duration TEXT NOT NULL CHECK(rental_duration IN ('daily', 'weekly', 'monthly', 'annual', 'custom')),
  duration_days INTEGER NOT NULL DEFAULT 30,
  activation_fee REAL NOT NULL DEFAULT 0.0,
  rental_fee REAL NOT NULL DEFAULT 0.0,
  tax_amount REAL NOT NULL DEFAULT 0.0,
  total_amount REAL NOT NULL,
  currency TEXT DEFAULT 'INR',
  wallet_transaction_id TEXT REFERENCES wallet_transactions(id) ON DELETE SET NULL,
  idempotency_key TEXT UNIQUE NOT NULL,
  provider_order_ref TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'reserved', 'allocated', 'failed', 'cancelled', 'refunded')),
  failure_reason TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vn_orders_user ON virtual_number_orders(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_vn_orders_status ON virtual_number_orders(status);

-- 7. Active Customer Number Rentals & Subscriptions
CREATE TABLE IF NOT EXISTS virtual_number_rentals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT,
  inventory_id TEXT REFERENCES virtual_number_inventory(id) ON DELETE SET NULL,
  provider_id TEXT NOT NULL REFERENCES virtual_number_providers(id),
  order_id TEXT REFERENCES virtual_number_orders(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,
  country_code TEXT NOT NULL,
  number_type TEXT NOT NULL,
  capabilities TEXT NOT NULL, -- JSON array
  whatsapp_compatible INTEGER DEFAULT 0,
  rental_duration TEXT NOT NULL,
  duration_days INTEGER NOT NULL DEFAULT 30,
  purchased_at TEXT DEFAULT (datetime('now')),
  activated_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  renewal_date TEXT NOT NULL,
  renewal_price REAL NOT NULL DEFAULT 0.0,
  auto_renew INTEGER DEFAULT 1,
  grace_period_days INTEGER DEFAULT 3,
  status TEXT DEFAULT 'active' CHECK(status IN ('pending', 'processing', 'active', 'renewal_due', 'expired', 'suspended', 'releasing', 'released', 'failed')),
  friendly_label TEXT,
  total_charges_accrued REAL DEFAULT 0.0,
  last_notified_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vn_rentals_user ON virtual_number_rentals(user_id, status);
CREATE INDEX IF NOT EXISTS idx_vn_rentals_phone ON virtual_number_rentals(phone_number);
CREATE INDEX IF NOT EXISTS idx_vn_rentals_expires ON virtual_number_rentals(expires_at, status);
CREATE INDEX IF NOT EXISTS idx_vn_rentals_autorenew ON virtual_number_rentals(auto_renew, renewal_date);

-- 8. Renewal Ledger & Grace Period History
CREATE TABLE IF NOT EXISTS virtual_number_renewals (
  id TEXT PRIMARY KEY,
  rental_id TEXT NOT NULL REFERENCES virtual_number_rentals(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  renewal_attempt INTEGER DEFAULT 1,
  renewal_fee REAL NOT NULL,
  currency TEXT DEFAULT 'INR',
  wallet_transaction_id TEXT REFERENCES wallet_transactions(id) ON DELETE SET NULL,
  provider_renewal_ref TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'successful', 'failed', 'skipped', 'grace_period')),
  previous_expires_at TEXT,
  new_expires_at TEXT,
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vn_renewals_rental ON virtual_number_renewals(rental_id, created_at);

-- 9. Daily/Monthly Number Usage Metrics & Aggregate Charges
CREATE TABLE IF NOT EXISTS virtual_number_usage (
  id TEXT PRIMARY KEY,
  rental_id TEXT NOT NULL REFERENCES virtual_number_rentals(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_date TEXT NOT NULL, -- 'YYYY-MM-DD'
  sms_received_count INTEGER DEFAULT 0,
  sms_charges REAL DEFAULT 0.0,
  voice_inbound_minutes REAL DEFAULT 0.0,
  voice_outbound_minutes REAL DEFAULT 0.0,
  voice_charges REAL DEFAULT 0.0,
  total_usage_charges REAL DEFAULT 0.0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(rental_id, period_date)
);

CREATE INDEX IF NOT EXISTS idx_vn_usage_rental ON virtual_number_usage(rental_id, period_date);

-- 10. Incoming SMS Messages Inbox
CREATE TABLE IF NOT EXISTS virtual_number_messages (
  id TEXT PRIMARY KEY,
  rental_id TEXT NOT NULL REFERENCES virtual_number_rentals(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL, -- Target virtual number
  sender TEXT NOT NULL, -- Incoming sender e.g. '+1234567890' or 'VERIFY'
  message_content TEXT NOT NULL,
  is_read INTEGER DEFAULT 0,
  provider_message_ref TEXT,
  fee_charged REAL DEFAULT 0.0,
  received_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vn_messages_rental ON virtual_number_messages(rental_id, received_at);
CREATE INDEX IF NOT EXISTS idx_vn_messages_user ON virtual_number_messages(user_id, is_read);

-- 11. Voice Call Logs
CREATE TABLE IF NOT EXISTS virtual_number_calls (
  id TEXT PRIMARY KEY,
  rental_id TEXT NOT NULL REFERENCES virtual_number_rentals(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  caller_number TEXT NOT NULL,
  direction TEXT DEFAULT 'inbound' CHECK(direction IN ('inbound', 'outbound')),
  duration_seconds INTEGER DEFAULT 0,
  call_status TEXT DEFAULT 'completed' CHECK(call_status IN ('completed', 'missed', 'busy', 'failed', 'voicemail')),
  fee_charged REAL DEFAULT 0.0,
  provider_call_ref TEXT,
  started_at TEXT DEFAULT (datetime('now')),
  ended_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vn_calls_rental ON virtual_number_calls(rental_id, started_at);

-- 12. Provider API Communication Logs (Sanitized, NO raw secrets)
CREATE TABLE IF NOT EXISTS virtual_number_provider_logs (
  id TEXT PRIMARY KEY,
  provider_id TEXT REFERENCES virtual_number_providers(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- e.g. 'search_numbers', 'allocate_number', 'renew', 'release'
  request_method TEXT,
  endpoint TEXT,
  http_status INTEGER,
  response_time_ms INTEGER,
  is_success INTEGER DEFAULT 1,
  error_message TEXT,
  sanitized_payload TEXT,
  sanitized_response TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vn_prov_logs_date ON virtual_number_provider_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_vn_prov_logs_prov ON virtual_number_provider_logs(provider_id);

-- 13. Inbound Provider Webhook Events
CREATE TABLE IF NOT EXISTS virtual_number_webhooks (
  id TEXT PRIMARY KEY,
  provider_id TEXT REFERENCES virtual_number_providers(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- e.g. 'sms_inbound', 'call_inbound', 'number_expired'
  signature TEXT,
  payload TEXT NOT NULL,
  processing_status TEXT DEFAULT 'pending' CHECK(processing_status IN ('pending', 'processed', 'failed', 'ignored')),
  error_details TEXT,
  processed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vn_webhooks_status ON virtual_number_webhooks(processing_status, created_at);

-- 14. Administrative & Security Audit Trail
CREATE TABLE IF NOT EXISTS virtual_number_audit_logs (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  target_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL, -- e.g. 'create_provider', 'update_pricing', 'manual_release', 'force_refund'
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vn_audit_date ON virtual_number_audit_logs(created_at);
`;

