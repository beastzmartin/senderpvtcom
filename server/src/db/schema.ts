export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  company_name TEXT,
  phone TEXT,
  role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'reseller', 'user')),
  plan_tier TEXT DEFAULT 'trial' CHECK(plan_tier IN ('trial', 'free', 'starter', 'pro', 'enterprise')),
  subscription_status TEXT DEFAULT 'active' CHECK(subscription_status IN ('active', 'trialing', 'past_due', 'expired', 'cancelled')),
  subscription_expires_at TEXT,
  max_devices INTEGER DEFAULT 1,
  daily_message_limit INTEGER DEFAULT 100,
  daily_extraction_limit INTEGER DEFAULT 500,
  messages_sent_today INTEGER DEFAULT 0,
  last_message_date TEXT,
  active_license_code TEXT,
  reseller_license_quota INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subscription_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tagline TEXT,
  price_monthly INTEGER NOT NULL,
  price_yearly INTEGER NOT NULL,
  currency TEXT DEFAULT 'INR',
  max_devices INTEGER NOT NULL,
  daily_message_limit INTEGER NOT NULL,
  daily_extraction_limit INTEGER NOT NULL DEFAULT 500,
  features TEXT NOT NULL,
  is_popular INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS license_keys (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  plan_tier TEXT NOT NULL CHECK(plan_tier IN ('trial', 'free', 'starter', 'pro', 'enterprise')),
  duration_days INTEGER NOT NULL DEFAULT 30,
  max_devices_override INTEGER,
  daily_limit_override INTEGER,
  extraction_limit_override INTEGER,
  status TEXT DEFAULT 'available' CHECK(status IN ('available', 'used', 'revoked', 'expired')),
  is_used INTEGER DEFAULT 0,
  used_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  used_at TEXT,
  created_by TEXT,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS extraction_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id TEXT,
  group_name TEXT,
  contacts_count INTEGER NOT NULL,
  extraction_type TEXT DEFAULT 'group_members',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_extraction_logs_user_date ON extraction_logs(user_id, created_at);

CREATE TABLE IF NOT EXISTS extracted_data_vault (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id TEXT,
  group_name TEXT,
  extraction_type TEXT DEFAULT 'group_members',
  total_contacts INTEGER NOT NULL,
  phone_count INTEGER DEFAULT 0,
  lid_count INTEGER DEFAULT 0,
  contacts_data TEXT NOT NULL,
  source_action TEXT DEFAULT 'extracted',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_extracted_vault_user ON extracted_data_vault(user_id);
CREATE INDEX IF NOT EXISTS idx_extracted_vault_created ON extracted_data_vault(created_at);

CREATE TABLE IF NOT EXISTS subscription_invoices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_tier TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT DEFAULT 'INR',
  billing_cycle TEXT DEFAULT 'monthly',
  status TEXT NOT NULL DEFAULT 'paid',
  payment_method TEXT DEFAULT 'license_key',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT UNIQUE NOT NULL DEFAULT 'default',
  alias TEXT DEFAULT 'Primary Device',
  is_default INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'disconnected',
  phone_number TEXT,
  jid TEXT,
  lid TEXT,
  display_name TEXT,
  platform TEXT,
  connected_at TEXT,
  last_active_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone_number TEXT,
  lid TEXT,
  avatar_url TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  recipient_identifier TEXT NOT NULL,
  raw_identifier TEXT NOT NULL,
  identifier_type TEXT NOT NULL CHECK(identifier_type IN ('phone', 'lid')),
  contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  display_name TEXT,
  last_message_at TEXT,
  last_message_text TEXT,
  unread_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_identifier TEXT NOT NULL,
  recipient_identifier TEXT NOT NULL,
  identifier_type TEXT NOT NULL CHECK(identifier_type IN ('phone', 'lid')),
  body TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('incoming', 'outgoing')),
  status TEXT NOT NULL CHECK(status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  provider_message_id TEXT,
  provider_response TEXT,
  error_message TEXT,
  timestamp TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS message_status_logs (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  details TEXT,
  timestamp TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS application_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lid_mappings (
  lid TEXT PRIMARY KEY,
  phone_number TEXT,
  jid TEXT,
  display_name TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bulk_campaigns (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'running', 'paused', 'completed', 'stopped', 'failed')),
  template_message TEXT NOT NULL,
  settings TEXT,
  current_index INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS bulk_campaign_recipients (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES bulk_campaigns(id) ON DELETE CASCADE,
  lid TEXT NOT NULL,
  phone_number TEXT,
  name TEXT,
  custom_data TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  sent_message TEXT,
  provider_message_id TEXT,
  error_message TEXT,
  sent_at TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  content TEXT NOT NULL,
  variables TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS broadcast_schedules (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template_id TEXT REFERENCES templates(id) ON DELETE SET NULL,
  template_content TEXT NOT NULL,
  daily_limit INTEGER NOT NULL DEFAULT 20,
  scheduled_time TEXT NOT NULL DEFAULT '10:00',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused', 'completed', 'cancelled')),
  total_recipients INTEGER DEFAULT 0,
  sent_recipients INTEGER DEFAULT 0,
  failed_recipients INTEGER DEFAULT 0,
  skipped_recipients INTEGER DEFAULT 0,
  last_run_at TEXT,
  next_run_at TEXT,
  settings TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS broadcast_schedule_recipients (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES broadcast_schedules(id) ON DELETE CASCADE,
  lid TEXT NOT NULL,
  phone_number TEXT,
  name TEXT,
  custom_data TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  batch_day INTEGER DEFAULT 0,
  sent_at TEXT,
  error_message TEXT,
  provider_message_id TEXT,
  sent_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_identifier);
CREATE INDEX IF NOT EXISTS idx_messages_provider_id ON messages(provider_message_id);
CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_recipient ON conversations(recipient_identifier);
CREATE INDEX IF NOT EXISTS idx_user_recipient ON conversations(user_id, recipient_identifier);
CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone_number);
CREATE INDEX IF NOT EXISTS idx_contacts_lid ON contacts(lid);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_user ON whatsapp_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_lid_mappings_phone ON lid_mappings(phone_number);
CREATE INDEX IF NOT EXISTS idx_lid_mappings_jid ON lid_mappings(jid);
CREATE INDEX IF NOT EXISTS idx_campaigns_user ON bulk_campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign ON bulk_campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_lid ON bulk_campaign_recipients(lid);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_status ON bulk_campaign_recipients(status);
CREATE INDEX IF NOT EXISTS idx_broadcast_schedules_user ON broadcast_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_schedule ON broadcast_schedule_recipients(schedule_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_status ON broadcast_schedule_recipients(status);
CREATE INDEX IF NOT EXISTS idx_broadcast_schedules_status ON broadcast_schedules(status);
CREATE INDEX IF NOT EXISTS idx_templates_user ON templates(user_id);
CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);
`;

