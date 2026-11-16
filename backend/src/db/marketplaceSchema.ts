import Database from 'better-sqlite3';
import { ProductDefinition } from '../types/marketplace.js';

export const MARKETPLACE_SCHEMA_SQL = `
-- Extraction Marketplace Products Catalog
CREATE TABLE IF NOT EXISTS extraction_marketplace_products (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  tagline TEXT,
  description_md TEXT,
  category TEXT NOT NULL,
  icon TEXT,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'active', 'disabled')),
  definition_json TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mkt_products_slug ON extraction_marketplace_products(slug);
CREATE INDEX IF NOT EXISTS idx_mkt_products_status ON extraction_marketplace_products(status);
CREATE INDEX IF NOT EXISTS idx_mkt_products_category ON extraction_marketplace_products(category);

-- Product Pricing History Audit Log
CREATE TABLE IF NOT EXISTS product_pricing_history (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES extraction_marketplace_products(id) ON DELETE CASCADE,
  changed_by_user_id TEXT,
  old_pricing_json TEXT,
  new_pricing_json TEXT,
  reason TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mkt_pricing_hist_prod ON product_pricing_history(product_id);

-- Extraction Marketplace Jobs
CREATE TABLE IF NOT EXISTS marketplace_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES extraction_marketplace_products(id),
  product_slug TEXT NOT NULL,
  product_name TEXT NOT NULL,
  input_json TEXT NOT NULL,
  requested_items INTEGER NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'ABORTED')),
  provider_type TEXT NOT NULL DEFAULT 'apify',
  provider_run_id TEXT,
  provider_dataset_id TEXT,
  items_delivered INTEGER NOT NULL DEFAULT 0,
  reserved_amount REAL NOT NULL DEFAULT 0.0,
  charged_amount REAL NOT NULL DEFAULT 0.0,
  provider_cost_usd REAL DEFAULT 0.0,
  provider_cost_converted REAL DEFAULT 0.0,
  currency TEXT NOT NULL DEFAULT 'INR',
  reservation_tx_id TEXT,
  settle_tx_id TEXT,
  error_code TEXT,
  error_message TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mkt_jobs_user_created ON marketplace_jobs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_mkt_jobs_status ON marketplace_jobs(status);
CREATE INDEX IF NOT EXISTS idx_mkt_jobs_provider_run ON marketplace_jobs(provider_run_id);
CREATE INDEX IF NOT EXISTS idx_mkt_jobs_product ON marketplace_jobs(product_id);

-- Extracted Job Results (We own the data, stored in our DB)
CREATE TABLE IF NOT EXISTS marketplace_job_results (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES marketplace_jobs(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL,
  data_json TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mkt_results_job ON marketplace_job_results(job_id, row_index);

-- Provider Webhook & Internal Events Log
CREATE TABLE IF NOT EXISTS marketplace_provider_events (
  id TEXT PRIMARY KEY,
  provider_type TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT DEFAULT 'processed',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mkt_provider_events_type ON marketplace_provider_events(provider_type, event_type);

-- Marketplace Global Configuration & Settings
CREATE TABLE IF NOT EXISTS marketplace_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- User Input Presets for Advanced Extraction Studio
CREATE TABLE IF NOT EXISTS marketplace_user_presets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_slug TEXT NOT NULL,
  name TEXT NOT NULL,
  input_json TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mkt_presets_user_slug ON marketplace_user_presets(user_id, product_slug);

-- Stored Output Files for Key-Value Store artifacts (Screenshots, PDFs, Zips, HTML)
CREATE TABLE IF NOT EXISTS marketplace_job_files (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES marketplace_jobs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  record_key TEXT,
  signature_token TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mkt_files_job ON marketplace_job_files(job_id);
CREATE INDEX IF NOT EXISTS idx_mkt_files_user ON marketplace_job_files(user_id);
CREATE INDEX IF NOT EXISTS idx_mkt_files_token ON marketplace_job_files(signature_token);

-- Circuit Breakers per Product to protect against runaway upstream failures
CREATE TABLE IF NOT EXISTS product_circuit_breakers (
  product_slug TEXT PRIMARY KEY,
  failure_count INTEGER DEFAULT 0,
  last_failure_at TEXT,
  state TEXT DEFAULT 'CLOSED' CHECK(state IN ('CLOSED', 'OPEN', 'HALF_OPEN')),
  trip_reason TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Master Prompt v3: Advanced Margin Rules (Volume Tiers, Scopes, Plan Adjustments)
CREATE TABLE IF NOT EXISTS marketplace_margin_rules_v3 (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  priority INTEGER DEFAULT 100,
  scope TEXT NOT NULL CHECK(scope IN ('global', 'category', 'product', 'pricing_model')),
  target_id TEXT,
  rule_type TEXT NOT NULL CHECK(rule_type IN ('percent', 'fixed', 'percent_plus_fixed', 'multiplier')),
  percent_value REAL DEFAULT 0.0,
  fixed_value REAL DEFAULT 0.0,
  multiplier_value REAL DEFAULT 1.0,
  tier_mode TEXT DEFAULT 'flat' CHECK(tier_mode IN ('flat', 'marginal', 'cliff')),
  volume_tiers_json TEXT,
  customer_plan_discounts_json TEXT,
  min_margin_percent REAL DEFAULT 15.0,
  min_sell_price REAL DEFAULT 0.50,
  maker_checker_status TEXT DEFAULT 'approved' CHECK(maker_checker_status IN ('approved', 'pending_approval', 'rejected')),
  maker_checker_threshold_min REAL DEFAULT 15.0,
  approved_by TEXT,
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mkt_margin_rules_scope ON marketplace_margin_rules_v3(scope, target_id);
CREATE INDEX IF NOT EXISTS idx_mkt_margin_rules_prio ON marketplace_margin_rules_v3(priority);

-- Master Prompt v3: Promo Codes & Coupons
CREATE TABLE IF NOT EXISTS marketplace_coupons (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  description TEXT,
  discount_type TEXT NOT NULL CHECK(discount_type IN ('percent', 'fixed')),
  discount_value REAL NOT NULL,
  max_discount_amount REAL,
  min_order_amount REAL DEFAULT 0.0,
  max_uses INTEGER DEFAULT 100,
  current_uses INTEGER DEFAULT 0,
  starts_at TEXT,
  expires_at TEXT,
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mkt_coupons_code ON marketplace_coupons(code);

-- Master Prompt v3: Margin Calculation Audit Traces
CREATE TABLE IF NOT EXISTS marketplace_margin_traces (
  id TEXT PRIMARY KEY,
  job_id TEXT REFERENCES marketplace_jobs(id) ON DELETE CASCADE,
  quote_id TEXT,
  user_id TEXT NOT NULL,
  product_slug TEXT NOT NULL,
  raw_provider_cost_usd REAL NOT NULL,
  overhead_cost_usd REAL NOT NULL,
  fx_buffer_usd REAL NOT NULL,
  loaded_cost_usd REAL NOT NULL,
  rule_id TEXT,
  rule_name TEXT,
  base_margin_amount REAL NOT NULL,
  volume_tier_applied TEXT,
  plan_discount_applied REAL DEFAULT 0.0,
  coupon_code TEXT,
  coupon_discount REAL DEFAULT 0.0,
  floor_applied INTEGER DEFAULT 0,
  rounding_adjustment REAL DEFAULT 0.0,
  tax_amount REAL DEFAULT 0.0,
  final_sell_price REAL NOT NULL,
  currency TEXT NOT NULL,
  profit_amount REAL NOT NULL,
  profit_margin_pct REAL NOT NULL,
  waterfall_json TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mkt_traces_job ON marketplace_margin_traces(job_id);
CREATE INDEX IF NOT EXISTS idx_mkt_traces_user ON marketplace_margin_traces(user_id);
CREATE INDEX IF NOT EXISTS idx_mkt_traces_slug ON marketplace_margin_traces(product_slug);

-- Master Prompt v3: Recurring Scheduled Runs
CREATE TABLE IF NOT EXISTS marketplace_scheduled_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_slug TEXT NOT NULL,
  name TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  input_json TEXT NOT NULL,
  requested_items INTEGER NOT NULL DEFAULT 100,
  max_budget REAL,
  target_crm_list_id TEXT,
  last_run_at TEXT,
  next_run_at TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paused', 'failed')),
  failure_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mkt_scheduled_user ON marketplace_scheduled_runs(user_id);

-- Master Prompt v3: Expiring Signed Share Links (Zero Provider Branding)
CREATE TABLE IF NOT EXISTS marketplace_shared_links (
  id TEXT PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  job_id TEXT NOT NULL REFERENCES marketplace_jobs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  title TEXT,
  expires_at TEXT NOT NULL,
  views_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mkt_shared_token ON marketplace_shared_links(token);
`;

/**
 * Demo Product Definition conforming to ProductDefinition v1
 * Clean dummy product for testing without any real external credentials
 */
export const DEMO_PRODUCT_DEFINITION: ProductDefinition = {
  slug: 'demo-b2b-lead-extractor',
  display_name: 'B2B Company Intelligence & Directory Extractor',
  tagline: 'Extract company profiles, verified emails, social links & domains with zero setup',
  description_md: `# B2B Company Intelligence & Directory Extractor

Extract high-fidelity verified business leads, domain contacts, decision-maker names, and social channels.

### Features
- Clean normalized data outputs
- Automatic email & phone sanitation
- Export to Excel (.xlsx), CSV, and structured JSON
`,
  category: 'B2B & Sales',
  icon: 'Building2',
  status: 'active',

  provider: {
    type: 'mock',
    actor_id: 'internal~b2b-mock-extractor',
    build: 'latest'
  },

  input: {
    fields: [
      {
        key: 'search_query',
        provider_key: 'query',
        label: 'Target Industry or Keywords',
        help: 'e.g. Software SaaS, Real Estate, E-Commerce Brands',
        type: 'text',
        required: true,
        default: 'SaaS Software Companies',
        visible_to_user: true
      },
      {
        key: 'target_location',
        provider_key: 'location',
        label: 'Country or Region',
        help: 'Target country or city focus',
        type: 'select',
        required: false,
        default: 'Global',
        options: [
          { label: 'Global / Anywhere', value: 'Global' },
          { label: 'India', value: 'India' },
          { label: 'United States', value: 'United States' },
          { label: 'United Kingdom', value: 'United Kingdom' },
          { label: 'United Arab Emirates', value: 'UAE' }
        ],
        visible_to_user: true
      },
      {
        key: 'include_emails_only',
        provider_key: 'requireEmail',
        label: 'Only Leads With Direct Emails',
        help: 'Filter out results that lack verified email addresses',
        type: 'boolean',
        required: false,
        default: true,
        visible_to_user: true
      }
    ],
    static_overrides: {
      scrape_mode: 'deep_enrichment'
    },
    hidden_defaults: {
      enable_stealth: true
    }
  },

  limits: {
    min_items: 10,
    max_items_per_run: 500,
    max_concurrent_runs_per_user: 2,
    timeout_secs: 1800,
    memory_mb: 1024
  },

  pricing: {
    mode: 'per_item',
    provider_cost_reference: {
      model: 'pay_per_result',
      usd_per_1000_items: 2.50, // $2.50 per 1,000 items
      usd_per_run_start: 0.05,
      notes: 'Internal provider reference cost'
    },
    sell: {
      per_1000_items: 399.0, // ₹399 per 1,000 items
      per_run_flat: 0.0
    },
    margin: {
      type: 'percent',
      value: 50.0
    },
    min_charge: 10.0 // Minimum ₹10 charge
  },

  access: {
    requires_subscription: false,
    allowed_plan_slugs: []
  },

  output: {
    item_mapping: [
      { from: 'companyName', to: 'company_name', label: 'Company Name', type: 'string', hidden: false },
      { from: 'websiteUrl', to: 'website', label: 'Website', type: 'url', hidden: false },
      { from: 'contactEmail', to: 'email', label: 'Verified Email', type: 'string', hidden: false },
      { from: 'phoneNumber', to: 'phone', label: 'Phone Number', type: 'string', hidden: false },
      { from: 'industrySector', to: 'industry', label: 'Industry', type: 'string', hidden: false },
      { from: 'hqLocation', to: 'location', label: 'Location', type: 'string', hidden: false },
      { from: 'linkedinUrl', to: 'linkedin', label: 'LinkedIn', type: 'url', hidden: false }
    ],
    drop_fields: ['_internalId', 'actorExecutionId', 'provider_debug_info'],
    preview_columns: ['company_name', 'email', 'phone', 'website', 'location'],
    export_formats: ['csv', 'xlsx', 'json'],
    sanitize: {
      strip_provider_urls: true
    }
  },

  compliance: {
    contains_personal_data: true,
    disclaimer_md: 'This product extracts publicly available business contact information. Ensure compliance with local electronic marketing and GDPR/CAN-SPAM regulations.',
    notes: 'Standard business directory data.'
  }
};

/**
 * Initializes the Extraction Marketplace schema in the database.
 */
export function initMarketplaceSchema(db: Database.Database): void {
  db.exec(MARKETPLACE_SCHEMA_SQL);

  // Safe migrations for newer columns (reversible and idempotent)
  const migrations = [
    'ALTER TABLE marketplace_jobs ADD COLUMN is_test_run INTEGER DEFAULT 0',
    'ALTER TABLE marketplace_jobs ADD COLUMN job_type TEXT DEFAULT "STANDARD"',
    'ALTER TABLE marketplace_jobs ADD COLUMN output_files_json TEXT',
    'ALTER TABLE marketplace_jobs ADD COLUMN runtime_seconds REAL DEFAULT 0.0',
    'ALTER TABLE extraction_marketplace_products ADD COLUMN profile_json TEXT',
    'ALTER TABLE extraction_marketplace_products ADD COLUMN pinned_build TEXT',
    // Master Prompt v3 migrations:
    'ALTER TABLE user_wallets ADD COLUMN daily_spend_limit REAL DEFAULT 0.0',
    'ALTER TABLE user_wallets ADD COLUMN monthly_spend_limit REAL DEFAULT 0.0',
    'ALTER TABLE user_wallets ADD COLUMN per_job_spend_limit REAL DEFAULT 0.0',
    'ALTER TABLE marketplace_jobs ADD COLUMN schedule_id TEXT',
    'ALTER TABLE marketplace_jobs ADD COLUMN trace_id TEXT',
    'ALTER TABLE marketplace_jobs ADD COLUMN crm_list_id TEXT',
    'ALTER TABLE marketplace_jobs ADD COLUMN crm_synced_count INTEGER DEFAULT 0'
  ];

  for (const m of migrations) {
    try {
      db.prepare(m).run();
    } catch {}
  }

  // Seed default settings if not exists
  const defaultSettings: Record<string, string> = {
    charge_on_zero_results: '0',
    refund_on_failure: '1',
    retention_days: '30',
    global_default_margin_pct: '35',
    min_charge: '5.0',
    max_concurrent_runs_per_user: '2',
    provider_token_configured: process.env.APIFY_API_TOKEN ? '1' : '0'
  };

  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO marketplace_settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
  `);

  for (const [key, value] of Object.entries(defaultSettings)) {
    insertSetting.run(key, value);
  }

  // Seed demo-product if no products exist
  const count = (db.prepare('SELECT count(*) as cnt FROM extraction_marketplace_products').get() as any)?.cnt || 0;
  if (count === 0) {
    const demo = DEMO_PRODUCT_DEFINITION;
    db.prepare(`
      INSERT INTO extraction_marketplace_products (
        id, slug, display_name, tagline, description_md, category, icon, status, definition_json, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now')
      )
    `).run(
      demo.slug,
      demo.slug,
      demo.display_name,
      demo.tagline,
      demo.description_md,
      demo.category,
      demo.icon || null,
      demo.status,
      JSON.stringify(demo)
    );
  }

  // Seed default margin rule v3 if none exist
  try {
    const marginRulesCount = (db.prepare('SELECT count(*) as cnt FROM marketplace_margin_rules_v3').get() as any)?.cnt || 0;
    if (marginRulesCount === 0) {
      db.prepare(`
        INSERT INTO marketplace_margin_rules_v3 (
          id, name, priority, scope, target_id, rule_type, percent_value, fixed_value,
          multiplier_value, tier_mode, volume_tiers_json, customer_plan_discounts_json,
          min_margin_percent, min_sell_price, maker_checker_status, enabled
        ) VALUES (
          'rule_default_global', 'Global Standard Margin', 100, 'global', NULL, 'percent', 35.0, 0.0,
          1.0, 'marginal', '[{"min_items":0,"max_items":1000,"percent":35.0,"fixed":0},{"min_items":1001,"max_items":5000,"percent":30.0,"fixed":0},{"min_items":5001,"max_items":999999,"percent":25.0,"fixed":0}]',
          '{"enterprise":10.0,"pro":5.0,"starter":0.0}', 15.0, 0.50, 'approved', 1
        )
      `).run();
    }
  } catch {}

  // Seed sample promo coupon if none exist
  try {
    const couponCount = (db.prepare('SELECT count(*) as cnt FROM marketplace_coupons').get() as any)?.cnt || 0;
    if (couponCount === 0) {
      db.prepare(`
        INSERT INTO marketplace_coupons (
          id, code, description, discount_type, discount_value, max_discount_amount, min_order_amount, max_uses, enabled
        ) VALUES (
          'cpn_welcome20', 'WELCOME20', '20% off your first data extraction run', 'percent', 20.0, 50.0, 5.0, 500, 1
        )
      `).run();
    }
  } catch {}
}

