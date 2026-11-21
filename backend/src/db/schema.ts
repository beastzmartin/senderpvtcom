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
  allowed_pages TEXT,
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
  bound_hwid TEXT,
  status TEXT DEFAULT 'available' CHECK(status IN ('available', 'used', 'revoked', 'expired')),
  is_used INTEGER DEFAULT 0,
  used_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  used_at TEXT,
  created_by TEXT,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_license (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  license_key TEXT NOT NULL,
  hwid TEXT NOT NULL,
  plan_tier TEXT NOT NULL DEFAULT 'enterprise',
  status TEXT NOT NULL DEFAULT 'active',
  activated_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,
  is_lifetime INTEGER DEFAULT 0,
  daily_message_limit INTEGER DEFAULT 10000,
  daily_extraction_limit INTEGER DEFAULT 10000,
  max_devices INTEGER DEFAULT 10,
  features TEXT,
  signature TEXT,
  last_verified_at TEXT NOT NULL DEFAULT (datetime('now'))
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
  file_name TEXT,
  is_community INTEGER DEFAULT 0,
  file_size INTEGER DEFAULT 0,
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
CREATE INDEX IF NOT EXISTS idx_extracted_vault_community ON extracted_data_vault(user_id, is_community);

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

CREATE TABLE IF NOT EXISTS group_join_campaigns (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  total_links INTEGER DEFAULT 0,
  joined_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  pending_approval_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'running', 'paused', 'completed', 'stopped', 'failed')),
  settings TEXT,
  current_index INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS group_join_items (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES group_join_campaigns(id) ON DELETE CASCADE,
  invite_code TEXT NOT NULL,
  raw_link TEXT,
  group_name TEXT,
  group_jid TEXT,
  participant_count INTEGER DEFAULT 0,
  is_community INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'inspecting', 'joining', 'joined', 'already_member', 'pending_approval', 'invalid_link', 'group_full', 'failed')),
  error_message TEXT,
  joined_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_join_campaigns_user ON group_join_campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_join_items_campaign ON group_join_items(campaign_id);
CREATE INDEX IF NOT EXISTS idx_join_items_status ON group_join_items(status);

-- =========================================================================
-- LEAD EXTRACTION & PROSPECTING INTELLIGENCE TABLES
-- =========================================================================

CREATE TABLE IF NOT EXISTS extraction_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  badge TEXT,
  is_active INTEGER DEFAULT 1,
  supported_fields TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS extraction_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  keyword TEXT,
  location TEXT,
  requested_count INTEGER DEFAULT 50,
  collected_count INTEGER DEFAULT 0,
  duplicate_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'paused', 'completed', 'partially_completed', 'failed', 'cancelled')),
  current_progress REAL DEFAULT 0,
  settings TEXT,
  error_message TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_extraction_jobs_user ON extraction_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_extraction_jobs_status ON extraction_jobs(status);
CREATE INDEX IF NOT EXISTS idx_extraction_jobs_source ON extraction_jobs(source);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT REFERENCES extraction_jobs(id) ON DELETE SET NULL,
  business_name TEXT NOT NULL,
  category TEXT,
  industry TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  postal_code TEXT,
  latitude REAL,
  longitude REAL,
  rating REAL,
  reviews_count INTEGER DEFAULT 0,
  operating_status TEXT,
  place_id TEXT,
  listing_url TEXT,
  source TEXT NOT NULL DEFAULT 'google_maps',
  source_url TEXT,
  social_profiles TEXT,
  status TEXT DEFAULT 'new' CHECK(status IN ('new', 'contacted', 'qualified', 'interested', 'converted', 'not_interested', 'archived')),
  is_verified INTEGER DEFAULT 0,
  notes TEXT,
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_leads_user ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_business_name ON leads(business_name);

CREATE TABLE IF NOT EXISTS lead_tags (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3b82f6',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_lead_tags_user ON lead_tags(user_id);

CREATE TABLE IF NOT EXISTS lead_tag_mappings (
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES lead_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (lead_id, tag_id)
);

CREATE TABLE IF NOT EXISTS lead_notes (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_lead_notes_lead ON lead_notes(lead_id);

CREATE TABLE IF NOT EXISTS extension_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  name TEXT DEFAULT 'Chrome Extension',
  browser_info TEXT,
  last_active_at TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_extension_sessions_user ON extension_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_extension_sessions_token ON extension_sessions(token);

-- =========================================================================
-- WALLET, EXTENSIONS MARKETPLACE & MODULE-WISE LICENSING TABLES
-- =========================================================================

CREATE TABLE IF NOT EXISTS user_wallets (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance REAL NOT NULL DEFAULT 0.0,
  currency TEXT DEFAULT 'INR',
  base_balance REAL DEFAULT 0.0,
  base_currency TEXT DEFAULT 'INR',
  reserved_balance REAL NOT NULL DEFAULT 0.0,
  total_spent REAL NOT NULL DEFAULT 0.0,
  total_topped_up REAL NOT NULL DEFAULT 0.0,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT,
  extension_id TEXT,
  module_id TEXT,
  transaction_type TEXT NOT NULL CHECK(transaction_type IN ('extension_activation', 'module_activation', 'usage_deduction', 'usage_refund', 'wallet_topup', 'promotional_credit', 'admin_adjustment', 'usage_reservation', 'reservation_release', 'renewal_charge')),
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'INR',
  previous_balance REAL NOT NULL,
  new_balance REAL NOT NULL,
  reference_id TEXT,
  description TEXT,
  status TEXT DEFAULT 'completed' CHECK(status IN ('pending', 'completed', 'failed', 'refunded', 'reversed')),
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_user ON wallet_transactions(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_type ON wallet_transactions(transaction_type);

CREATE TABLE IF NOT EXISTS extensions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  short_description TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  logo_url TEXT,
  screenshots TEXT,
  features TEXT,
  supported_browsers TEXT,
  version TEXT DEFAULT '2.0.0',
  activation_fee REAL DEFAULT 0.0,
  pricing_model TEXT DEFAULT 'one_time' CHECK(pricing_model IN ('free', 'one_time', 'recurring_monthly', 'recurring_yearly', 'custom')),
  is_featured INTEGER DEFAULT 0,
  is_popular INTEGER DEFAULT 0,
  is_published INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'maintenance', 'deprecated', 'unpublished')),
  rating REAL DEFAULT 4.9,
  reviews_count INTEGER DEFAULT 128,
  sort_order INTEGER DEFAULT 0,
  documentation TEXT,
  installation_guide TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_extensions_category ON extensions(category);
CREATE INDEX IF NOT EXISTS idx_extensions_status ON extensions(status);

CREATE TABLE IF NOT EXISTS extension_modules (
  id TEXT PRIMARY KEY,
  extension_id TEXT NOT NULL REFERENCES extensions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  category TEXT,
  version TEXT DEFAULT '1.0.0',
  features TEXT,
  activation_fee REAL DEFAULT 0.0,
  usage_charging_model TEXT DEFAULT 'per_record' CHECK(usage_charging_model IN ('free', 'per_record', 'per_request', 'per_api_call', 'per_scan', 'per_enrichment', 'per_job', 'per_thousand_records', 'fixed_fee', 'time_based')),
  usage_price REAL DEFAULT 0.0,
  free_quota INTEGER DEFAULT 0,
  period_quota_limit INTEGER DEFAULT 1000,
  quota_period TEXT DEFAULT 'monthly' CHECK(quota_period IN ('daily', 'weekly', 'monthly', 'yearly', 'lifetime', 'unlimited', 'custom')),
  per_job_limit INTEGER DEFAULT 100,
  status TEXT DEFAULT 'published' CHECK(status IN ('published', 'unpublished', 'active', 'maintenance', 'deprecated')),
  is_visible INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(extension_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_modules_extension ON extension_modules(extension_id);

CREATE TABLE IF NOT EXISTS extension_activations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  extension_id TEXT NOT NULL REFERENCES extensions(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'suspended', 'expired', 'revoked')),
  activated_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT,
  billing_cycle TEXT DEFAULT 'lifetime',
  fee_paid REAL DEFAULT 0.0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, extension_id)
);

CREATE INDEX IF NOT EXISTS idx_ext_act_user ON extension_activations(user_id);

CREATE TABLE IF NOT EXISTS module_activations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  extension_id TEXT NOT NULL REFERENCES extensions(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL REFERENCES extension_modules(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'suspended', 'expired', 'revoked', 'limit_reached')),
  activated_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT,
  fee_paid REAL DEFAULT 0.0,
  custom_quota_override INTEGER,
  custom_usage_price_override REAL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_mod_act_user ON module_activations(user_id);
CREATE INDEX IF NOT EXISTS idx_mod_act_module ON module_activations(module_id);

CREATE TABLE IF NOT EXISTS module_usage (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL REFERENCES extension_modules(id) ON DELETE CASCADE,
  extension_id TEXT NOT NULL REFERENCES extensions(id) ON DELETE CASCADE,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  units_consumed INTEGER DEFAULT 0,
  total_cost REAL DEFAULT 0.0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, module_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_mod_usage_user ON module_usage(user_id, module_id, period_start);

CREATE TABLE IF NOT EXISTS extension_pricing_overrides (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK(target_type IN ('global', 'user', 'workspace', 'plan')),
  target_id TEXT,
  extension_id TEXT,
  module_id TEXT,
  activation_fee_override REAL,
  usage_price_override REAL,
  free_quota_override INTEGER,
  limit_override INTEGER,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS extension_audit_logs (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  target_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ext_audit_date ON extension_audit_logs(created_at);
`;

