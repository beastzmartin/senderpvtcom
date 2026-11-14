import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config.js';
import { SCHEMA_SQL } from './schema.js';

let dbInstance: Database.Database | null = null;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, key] = stored.split(':');
    if (!salt || !key) return false;
    const testHash = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(key, 'hex'), Buffer.from(testHash, 'hex'));
  } catch {
    return false;
  }
}

export function initDatabase(): Database.Database {
  if (dbInstance) return dbInstance;

  // Ensure directories exist
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(config.sessionsDir, { recursive: true });

  const db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Execute schema
  db.exec(SCHEMA_SQL);

  // Safe migrations for multi-tenancy (user_id partitioning) and subscriptions on existing databases
  const userMigrations = [
    `ALTER TABLE users ADD COLUMN email TEXT;`,
    `ALTER TABLE users ADD COLUMN company_name TEXT;`,
    `ALTER TABLE users ADD COLUMN phone TEXT;`,
    `ALTER TABLE users ADD COLUMN plan_tier TEXT DEFAULT 'starter';`,
    `ALTER TABLE users ADD COLUMN subscription_status TEXT DEFAULT 'active';`,
    `ALTER TABLE users ADD COLUMN subscription_expires_at TEXT;`,
    `ALTER TABLE users ADD COLUMN max_devices INTEGER DEFAULT 1;`,
    `ALTER TABLE users ADD COLUMN daily_message_limit INTEGER DEFAULT 100;`,
    `ALTER TABLE users ADD COLUMN messages_sent_today INTEGER DEFAULT 0;`,
    `ALTER TABLE users ADD COLUMN last_message_date TEXT;`,
    `ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1;`,
    `ALTER TABLE whatsapp_sessions ADD COLUMN user_id TEXT;`,
    `ALTER TABLE contacts ADD COLUMN user_id TEXT;`,
    `ALTER TABLE conversations ADD COLUMN user_id TEXT;`,
    `ALTER TABLE messages ADD COLUMN user_id TEXT;`,
    `ALTER TABLE bulk_campaigns ADD COLUMN user_id TEXT;`,
    `ALTER TABLE broadcast_schedules ADD COLUMN user_id TEXT;`,
    `ALTER TABLE templates ADD COLUMN user_id TEXT;`,
    `ALTER TABLE users ADD COLUMN active_license_code TEXT;`,
    `ALTER TABLE users ADD COLUMN daily_extraction_limit INTEGER DEFAULT 500;`,
    `ALTER TABLE users ADD COLUMN reseller_license_quota INTEGER DEFAULT 0;`,
    `ALTER TABLE subscription_plans ADD COLUMN daily_extraction_limit INTEGER DEFAULT 500;`,
    `ALTER TABLE license_keys ADD COLUMN max_devices_override INTEGER;`,
    `ALTER TABLE license_keys ADD COLUMN daily_limit_override INTEGER;`,
    `ALTER TABLE license_keys ADD COLUMN extraction_limit_override INTEGER;`,
    `ALTER TABLE license_keys ADD COLUMN status TEXT DEFAULT 'available';`,
    `ALTER TABLE license_keys ADD COLUMN created_by_user_id TEXT;`
  ];

  for (const migration of userMigrations) {
    try {
      db.exec(migration);
    } catch {}
  }

  // Ensure extracted_data_vault table exists
  try {
    db.exec(`
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
    `);
  } catch {}

  // Safe migration: Auto-upgrade users table if legacy CHECK constraint missing 'trial' exists
  try {
    const userTableMeta = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get() as { sql: string } | undefined;
    if (userTableMeta && userTableMeta.sql && userTableMeta.sql.includes("CHECK(plan_tier IN ('free'")) {
      console.log('[DB Migration] Detected legacy plan_tier CHECK constraint in users table. Upgrading table to support trial tier...');
      db.pragma('foreign_keys = OFF');

      const columnsInfo = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
      const colNames = columnsInfo.map((c) => c.name).join(', ');

      db.exec(`
        CREATE TABLE users_temp_migration AS SELECT * FROM users;
        DROP TABLE users;
      `);

      db.exec(SCHEMA_SQL);

      db.exec(`
        INSERT OR IGNORE INTO users (${colNames}) SELECT ${colNames} FROM users_temp_migration;
        DROP TABLE users_temp_migration;
      `);

      db.pragma('foreign_keys = ON');
      console.log('[DB Migration] Users table successfully upgraded to support trial plan tier.');
    }
  } catch (err) {
    console.error('[DB Migration] Error migrating users table check constraint:', err);
    try { db.pragma('foreign_keys = ON'); } catch {}
  }

  // Safe migration: Auto-upgrade license_keys table if legacy CHECK constraint exists
  try {
    const keyTableMeta = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'license_keys'").get() as { sql: string } | undefined;
    if (keyTableMeta && keyTableMeta.sql && keyTableMeta.sql.includes("CHECK(plan_tier IN ('free'")) {
      console.log('[DB Migration] Detected legacy plan_tier CHECK constraint in license_keys table. Upgrading table...');
      db.pragma('foreign_keys = OFF');

      const columnsInfo = db.prepare("PRAGMA table_info(license_keys)").all() as Array<{ name: string }>;
      const colNames = columnsInfo.map((c) => c.name).join(', ');

      db.exec(`
        CREATE TABLE license_keys_temp_migration AS SELECT * FROM license_keys;
        DROP TABLE license_keys;
      `);

      db.exec(SCHEMA_SQL);

      db.exec(`
        INSERT OR IGNORE INTO license_keys (${colNames}) SELECT ${colNames} FROM license_keys_temp_migration;
        DROP TABLE license_keys_temp_migration;
      `);

      db.pragma('foreign_keys = ON');
      console.log('[DB Migration] License keys table successfully upgraded.');
    }
  } catch (err) {
    console.error('[DB Migration] Error migrating license_keys table check constraint:', err);
    try { db.pragma('foreign_keys = ON'); } catch {}
  }

  // Ensure extraction_logs table exists
  db.exec(`
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
  `);

  try {
    db.prepare("UPDATE subscription_plans SET daily_extraction_limit = 500 WHERE id = 'starter'").run();
    db.prepare("UPDATE subscription_plans SET daily_extraction_limit = 5000 WHERE id = 'pro'").run();
    db.prepare("UPDATE subscription_plans SET daily_extraction_limit = 50000 WHERE id = 'enterprise'").run();
    db.prepare("UPDATE users SET daily_extraction_limit = 50000 WHERE role = 'admin' OR plan_tier = 'enterprise'").run();
    db.prepare("UPDATE users SET daily_extraction_limit = 5000 WHERE plan_tier = 'pro' AND role != 'admin'").run();
    db.prepare("UPDATE users SET daily_extraction_limit = 500 WHERE (plan_tier = 'starter' OR plan_tier IS NULL) AND role != 'admin'").run();
  } catch {}

  // Ensure Free Trial plan exists
  try {
    const trialPlanExists = db.prepare("SELECT COUNT(*) as count FROM subscription_plans WHERE id = 'trial'").get() as { count: number };
    if (trialPlanExists.count === 0) {
      db.prepare(`
        INSERT INTO subscription_plans (id, name, tagline, price_monthly, price_yearly, currency, max_devices, daily_message_limit, daily_extraction_limit, features, is_popular)
        VALUES ('trial', 'Free Trial', 'Complimentary trial account for evaluating WhatsApp broadcast & group extractor.', 0, 0, 'INR', 1, 25, 50, ?, 0)
      `).run(JSON.stringify([
        '1 WhatsApp Account Slot',
        '25 Bulk Broadcasts / day',
        '50 Group Member Extractions / day',
        'Direct LID & Phone Messaging',
        'Standard Message Templates',
        '3-Day Free Trial Access'
      ]));
      console.log('[DB] Seeded Free Trial subscription plan (25 msgs/day, 50 extractions/day)');
    }

    // Default trial application settings
    const trialSettings = [
      { key: 'trial_duration_days', value: '3' },
      { key: 'trial_daily_message_limit', value: '25' },
      { key: 'trial_daily_extraction_limit', value: '50' },
      { key: 'trial_max_devices', value: '1' }
    ];
    for (const s of trialSettings) {
      db.prepare("INSERT OR IGNORE INTO application_settings (key, value) VALUES (?, ?)").run(s.key, s.value);
    }
  } catch (err) {
    console.error('[DB] Error configuring trial plan settings:', err);
  }

  // Seed default subscription plans
  const planCount = (db.prepare('SELECT COUNT(*) as count FROM subscription_plans').get() as { count: number }).count;
  if (planCount === 0) {
    const insertPlan = db.prepare(`
      INSERT INTO subscription_plans (id, name, tagline, price_monthly, price_yearly, currency, max_devices, daily_message_limit, features, is_popular)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertPlan.run(
      'starter',
      'Starter Plan',
      'Perfect for solo entrepreneurs & small businesses getting started with WhatsApp outreach.',
      999,
      9990,
      'INR',
      1,
      100,
      JSON.stringify([
        '1 WhatsApp Account Connected',
        '100 Messages / day Quota',
        'Direct LID & Phone Messaging',
        'Anti-Ban Delays & Safe Dispatch',
        'Standard Group Extractor',
        'Basic Message Templates'
      ]),
      0
    );

    insertPlan.run(
      'pro',
      'Pro Business',
      'Ideal for active marketers, agencies & businesses scaling customer broadcasts.',
      2499,
      24990,
      'INR',
      3,
      2500,
      JSON.stringify([
        '3 WhatsApp Multi-Device Accounts',
        '2,500 Messages / day Quota',
        'Batch Multi-Group & Community Extractor',
        'LID-to-Phone Resolution Harvester',
        'Broadcast Scheduler (Drip per day)',
        'Round-Robin Multi-Device Dispatch',
        'Advanced Template Variables & Spintax',
        'Priority Customer Support'
      ]),
      1
    );

    insertPlan.run(
      'enterprise',
      'Enterprise Agency',
      'Unrestricted high-performance suite for large teams, agencies & power users.',
      4999,
      49990,
      'INR',
      10,
      10000,
      JSON.stringify([
        '10 WhatsApp Accounts Connected',
        'Unlimited Sending (10,000+ msgs/day)',
        'Full Multi-Group Batch & Deep Scan Extractor',
        'Unlimited Recurring Broadcast Schedules',
        'Multi-Account Load Balancing Dispatch',
        'Team User Access & License Key Generation',
        'Custom Webhooks & REST API Access',
        '24/7 Dedicated Account Manager'
      ]),
      0
    );

    console.log('[DB] Seeded subscription plans (Starter, Pro, Enterprise)');
  }

  // Seed default admin if no users exist, or upgrade existing admin
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM users');
  const result = countStmt.get() as { count: number };

  if (result.count === 0) {
    const userId = crypto.randomUUID();
    const passwordHash = hashPassword(config.defaultAdminPassword);
    const insertAdmin = db.prepare(`
      INSERT INTO users (
        id, username, email, password_hash, name, company_name, role,
        plan_tier, subscription_status, subscription_expires_at, max_devices, daily_message_limit
      )
      VALUES (?, ?, ?, ?, ?, ?, 'admin', 'enterprise', 'active', NULL, 10, 10000)
    `);
    insertAdmin.run(userId, config.defaultAdminUsername, 'admin@whatsapp.local', passwordHash, 'Administrator', 'Master Admin');
    console.log(`[DB] Created default admin account (${config.defaultAdminUsername} / ${config.defaultAdminPassword})`);
  } else {
    // Ensure admin user has enterprise access
    db.prepare(`
      UPDATE users
      SET plan_tier = 'enterprise', role = 'admin', max_devices = 10, daily_message_limit = 10000, subscription_status = 'active'
      WHERE username = ?
    `).run(config.defaultAdminUsername);
  }

  // Seed sample license keys if none exist
  const keyCount = (db.prepare('SELECT COUNT(*) as count FROM license_keys').get() as { count: number }).count;
  if (keyCount === 0) {
    const insertKey = db.prepare(`
      INSERT INTO license_keys (id, code, plan_tier, duration_days, is_used, note)
      VALUES (?, ?, ?, ?, 0, ?)
    `);
    insertKey.run(crypto.randomUUID(), 'PRO-WELCOME-30D', 'pro', 30, 'Demo 30-Day Pro License Key');
    insertKey.run(crypto.randomUUID(), 'ENTERPRISE-VIP-1Y', 'enterprise', 365, 'Demo 1-Year Enterprise Key');
    insertKey.run(crypto.randomUUID(), 'STARTER-BOOST-30D', 'starter', 30, 'Demo 30-Day Starter Key');
    console.log('[DB] Seeded initial demo license keys (PRO-WELCOME-30D, ENTERPRISE-VIP-1Y)');
  }

  // Migrate existing unassigned records to the primary admin user for multi-tenant isolation
  const adminRow = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1").get() as { id: string } | undefined;
  if (adminRow) {
    try {
      db.prepare('UPDATE whatsapp_sessions SET user_id = ? WHERE user_id IS NULL').run(adminRow.id);
      db.prepare('UPDATE contacts SET user_id = ? WHERE user_id IS NULL').run(adminRow.id);
      db.prepare('UPDATE conversations SET user_id = ? WHERE user_id IS NULL').run(adminRow.id);
      db.prepare('UPDATE messages SET user_id = ? WHERE user_id IS NULL').run(adminRow.id);
      db.prepare('UPDATE bulk_campaigns SET user_id = ? WHERE user_id IS NULL').run(adminRow.id);
      db.prepare('UPDATE broadcast_schedules SET user_id = ? WHERE user_id IS NULL').run(adminRow.id);
      db.prepare('UPDATE templates SET user_id = ? WHERE user_id IS NULL').run(adminRow.id);
      console.log(`[DB] Multi-tenancy migration complete: existing records safely scoped to admin [${adminRow.id}]`);
    } catch (migErr) {
      console.error('[DB] Multi-tenancy migration error:', migErr);
    }
  }

  // Ensure default session record exists for admin if admin has no devices
  try {
    db.exec(`ALTER TABLE whatsapp_sessions ADD COLUMN alias TEXT DEFAULT 'Primary Device';`);
  } catch {}
  try {
    db.exec(`ALTER TABLE whatsapp_sessions ADD COLUMN is_default INTEGER DEFAULT 0;`);
  } catch {}

  if (adminRow) {
    const adminSessionCount = (db.prepare('SELECT COUNT(*) as count FROM whatsapp_sessions WHERE user_id = ?').get(adminRow.id) as { count: number }).count;
    if (adminSessionCount === 0) {
      db.prepare(`
        INSERT INTO whatsapp_sessions (id, user_id, session_id, alias, is_default, status)
        VALUES (?, ?, 'default', 'Primary Device', 1, 'disconnected')
      `).run(crypto.randomUUID(), adminRow.id);
    }
  }

  // License System migrations
  try {
    db.exec(`ALTER TABLE license_keys ADD COLUMN max_devices_override INTEGER;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE license_keys ADD COLUMN daily_limit_override INTEGER;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE license_keys ADD COLUMN status TEXT DEFAULT 'available';`);
  } catch {}
  try {
    db.exec(`ALTER TABLE users ADD COLUMN active_license_code TEXT;`);
  } catch {}
  try {
    db.exec(`UPDATE license_keys SET status = 'used' WHERE is_used = 1 AND (status IS NULL OR status = 'available');`);
  } catch {}

  // =========================================================================
  // LEAD EXTRACTION & PROSPECTING INTELLIGENCE SEEDING & VERIFICATION
  // =========================================================================
  try {
    db.exec(`
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
    `);

    // Seed standard extraction sources if empty
    const sourcesCount = (db.prepare('SELECT COUNT(*) as count FROM extraction_sources').get() as { count: number }).count;
    if (sourcesCount === 0) {
      const insertSource = db.prepare(`
        INSERT INTO extraction_sources (id, name, category, description, icon, badge, is_active, supported_fields)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const standardSources = [
        {
          id: 'google_maps',
          name: 'Google Maps Lead Extractor',
          category: 'Maps & Local',
          description: 'Extract business leads, ratings, phone numbers, addresses, and websites directly from Google Maps.',
          icon: 'MapPin',
          badge: 'Most Popular',
          is_active: 1,
          supported_fields: JSON.stringify(['business_name', 'category', 'phone', 'website', 'address', 'rating', 'reviews_count', 'place_id', 'listing_url', 'coordinates'])
        },
        {
          id: 'website_extractor',
          name: 'Website Lead Extractor',
          category: 'Web Scanner',
          description: 'Inspect any currently opened business website to uncover contact emails, phone numbers, addresses, and social links.',
          icon: 'Globe',
          badge: 'Live Tab',
          is_active: 1,
          supported_fields: JSON.stringify(['business_name', 'email', 'phone', 'website', 'address', 'social_profiles', 'company_description'])
        },
        {
          id: 'business_directory',
          name: 'Business Directory Extractor',
          category: 'Directories',
          description: 'Extract business profiles and contact information from major public B2B directories and yellow pages.',
          icon: 'BookOpen',
          badge: 'B2B',
          is_active: 1,
          supported_fields: JSON.stringify(['business_name', 'category', 'phone', 'email', 'website', 'address', 'city'])
        },
        {
          id: 'company_contact',
          name: 'Company Website Contact Extractor',
          category: 'Web Scanner',
          description: 'Crawl public Contact and About Us pages to extract authorized corporate emails, helplines, and addresses.',
          icon: 'Building2',
          badge: 'Verified',
          is_active: 1,
          supported_fields: JSON.stringify(['business_name', 'email', 'phone', 'contact_page_url', 'address'])
        },
        {
          id: 'email_discovery',
          name: 'Public Business Email Discovery',
          category: 'Email Finder',
          description: 'Discover verified company email formats and public contact addresses using domain heuristics.',
          icon: 'Mail',
          badge: 'Enrichment',
          is_active: 1,
          supported_fields: JSON.stringify(['business_name', 'email', 'domain', 'confidence_score'])
        },
        {
          id: 'phone_discovery',
          name: 'Public Business Phone Discovery',
          category: 'Phone Finder',
          description: 'Identify direct business phone numbers and WhatsApp-ready customer care contacts with country code parsing.',
          icon: 'Phone',
          badge: 'Direct Phone',
          is_active: 1,
          supported_fields: JSON.stringify(['business_name', 'phone', 'country_code', 'phone_type', 'whatsapp_ready'])
        },
        {
          id: 'linkedin_research',
          name: 'LinkedIn Company Research',
          category: 'B2B Research',
          description: 'Gather public business profile data, employee size, industry classifications, and corporate websites.',
          icon: 'Linkedin',
          badge: 'Authorized',
          is_active: 1,
          supported_fields: JSON.stringify(['business_name', 'industry', 'website', 'company_size', 'headquarters', 'specialties'])
        },
        {
          id: 'ecommerce_discovery',
          name: 'E-commerce Store Lead Discovery',
          category: 'E-commerce',
          description: 'Find online brands, Shopify/WooCommerce stores, customer support emails, and social commerce handles.',
          icon: 'ShoppingBag',
          badge: 'E-Com',
          is_active: 1,
          supported_fields: JSON.stringify(['business_name', 'website', 'platform', 'email', 'phone', 'social_profiles'])
        },
        {
          id: 'real_estate_finder',
          name: 'Real Estate Business Lead Finder',
          category: 'Industry',
          description: 'Prospect real estate agencies, property consultants, builders, and mortgage brokers.',
          icon: 'Home',
          badge: 'High Value',
          is_active: 1,
          supported_fields: JSON.stringify(['business_name', 'category', 'phone', 'email', 'city', 'state', 'listing_url'])
        },
        {
          id: 'agency_finder',
          name: 'Agency Lead Finder',
          category: 'Industry',
          description: 'Target digital marketing agencies, software development firms, SEO agencies, and creative studios.',
          icon: 'Briefcase',
          badge: 'Agencies',
          is_active: 1,
          supported_fields: JSON.stringify(['business_name', 'industry', 'email', 'phone', 'website', 'address'])
        },
        {
          id: 'restaurant_hotel_finder',
          name: 'Restaurant & Hotel Lead Finder',
          category: 'Hospitality',
          description: 'Extract restaurants, cafes, hotels, resorts, and catering businesses for local outreach.',
          icon: 'Utensils',
          badge: 'Hospitality',
          is_active: 1,
          supported_fields: JSON.stringify(['business_name', 'category', 'phone', 'address', 'city', 'rating', 'reviews_count'])
        },
        {
          id: 'professional_services',
          name: 'Professional Services Lead Finder',
          category: 'Services',
          description: 'Discover legal practitioners, chartered accountants, financial advisors, and medical clinics.',
          icon: 'Award',
          badge: 'Professional',
          is_active: 1,
          supported_fields: JSON.stringify(['business_name', 'category', 'phone', 'email', 'address', 'city', 'rating'])
        }
      ];

      for (const src of standardSources) {
        insertSource.run(
          src.id,
          src.name,
          src.category,
          src.description,
          src.icon,
          src.badge,
          src.is_active,
          src.supported_fields
        );
      }
      console.log('[DB] Seeded 12 standardized multi-source lead extractors into extraction_sources table.');
    }
  } catch (err) {
    console.error('[DB] Error configuring lead intelligence tables:', err);
  }

  dbInstance = db;
  return dbInstance;
}

export function getDatabase(): Database.Database {
  if (!dbInstance) {
    return initDatabase();
  }
  return dbInstance;
}

