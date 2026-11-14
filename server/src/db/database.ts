import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config.js';
import { SCHEMA_SQL } from './schema.js';
import { initVirtualNumberDatabase } from './virtualNumberSeeder.js';

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
      console.log('[DB] Seeded standardized Google Maps lead extractor into extraction_sources table.');
    }
    // Deactivate all non-Google Maps connectors to keep system strictly focused on Google Maps
    db.exec(`UPDATE extraction_sources SET is_active = 0 WHERE id != 'google_maps'`);
    db.exec(`UPDATE extraction_sources SET is_active = 1 WHERE id = 'google_maps'`);
  } catch (err) {
    console.error('[DB] Error configuring lead intelligence tables:', err);
  }

  // =========================================================================
  // WALLET, EXTENSIONS MARKETPLACE & DYNAMIC MODULE SEEDING
  // =========================================================================
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_wallets (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        balance REAL NOT NULL DEFAULT 0.0,
        currency TEXT DEFAULT 'INR',
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
    `);

    // Ensure all existing users have a wallet initialized with initial promotional balance if new
    const allUsers = db.prepare('SELECT id FROM users').all() as Array<{ id: string }>;
    const checkWallet = db.prepare('SELECT user_id, balance FROM user_wallets WHERE user_id = ?');
    const insertWallet = db.prepare(`
      INSERT INTO user_wallets (user_id, balance, currency, total_topped_up, updated_at)
      VALUES (?, ?, 'INR', ?, datetime('now'))
    `);
    const insertTx = db.prepare(`
      INSERT INTO wallet_transactions (id, user_id, transaction_type, amount, currency, previous_balance, new_balance, description)
      VALUES (?, ?, 'promotional_credit', ?, 'INR', 0.0, ?, 'Welcome Promotional Bonus for Extensions Marketplace')
    `);

    for (const u of allUsers) {
      const existingWallet = checkWallet.get(u.id) as any;
      if (!existingWallet) {
        const welcomeBonus = 250.0; // ₹250 free starter credits
        insertWallet.run(u.id, welcomeBonus, welcomeBonus);
        insertTx.run(crypto.randomUUID(), u.id, welcomeBonus, welcomeBonus);
      }
    }

    // Seed Extensions and their Modules
    const extCount = (db.prepare('SELECT COUNT(*) as count FROM extensions').get() as { count: number }).count;
    if (extCount === 0) {
      console.log('[DB] Seeding Extensions Marketplace and Module Registry...');

      const insertExt = db.prepare(`
        INSERT INTO extensions (
          id, name, slug, category, short_description, description,
          icon, features, supported_browsers, activation_fee, pricing_model,
          is_featured, is_popular, is_published, status, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'active', ?)
      `);

      const insertMod = db.prepare(`
        INSERT INTO extension_modules (
          id, extension_id, name, slug, description, icon, category,
          features, activation_fee, usage_charging_model, usage_price,
          free_quota, period_quota_limit, quota_period, per_job_limit, status, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'monthly', ?, 'published', ?)
      `);

      // 1. Google Maps Lead Extractor
      insertExt.run(
        'google-maps-extractor',
        'Google Maps Lead Extractor',
        'google-maps-extractor',
        'Google Maps & Local',
        'Extract high-intent local business leads, phone numbers, ratings, and websites directly from Google Maps.',
        'Professional prospecting tool engineered for Chromium browsers. Pulls place listings, contact details, reviews, address components, and websites with smart scrolling and anti-bot jitter protection.',
        'MapPin',
        JSON.stringify(['Live Maps Feed Parsing', 'Anti-Ban Scroll Jitter', 'Instant Phone & Email Detection', 'Floating In-Page HUD', 'One-Click WhatsApp Dispatch']),
        JSON.stringify(['Chrome', 'Brave', 'Edge', 'Opera']),
        199.0, // ₹199 one-time activation
        'one_time',
        1, // featured
        1, // popular
        1
      );

      const gmapsModules = [
        { id: 'gmaps-search', name: 'Google Maps Business Search', slug: 'search', desc: 'Query businesses by niche, keyword, city, and radius.', icon: 'Search', fee: 0.0, price: 0.20, freeQuota: 50, limit: 3000, jobLimit: 100 },
        { id: 'gmaps-details', name: 'Business Details Extractor', slug: 'details', desc: 'Pulls full operating status, working hours, and coordinates.', icon: 'Building2', fee: 0.0, price: 0.10, freeQuota: 100, limit: 5000, jobLimit: 250 },
        { id: 'gmaps-website', name: 'Website Information Extractor', slug: 'website', desc: 'Inspects business website URL and normalizes domain names.', icon: 'Globe', fee: 49.0, price: 0.25, freeQuota: 25, limit: 1500, jobLimit: 100 },
        { id: 'gmaps-email', name: 'Public Email Discovery', slug: 'email-discovery', desc: 'Discovers verified corporate emails associated with the business.', icon: 'Mail', fee: 99.0, price: 0.50, freeQuota: 10, limit: 2000, jobLimit: 50 },
        { id: 'gmaps-phone', name: 'Phone Number Extractor', slug: 'phone-extractor', desc: 'Cleans international phone numbers into E.164 WhatsApp ready format.', icon: 'Phone', fee: 0.0, price: 0.10, freeQuota: 100, limit: 5000, jobLimit: 250 },
        { id: 'gmaps-bulk', name: 'Bulk Lead Extraction Engine', slug: 'bulk-extraction', desc: 'Execute large multi-batch extractions with automatic pagination.', icon: 'Layers', fee: 149.0, price: 5.00, freeQuota: 5, limit: 200, jobLimit: 500 },
        { id: 'gmaps-location', name: 'Advanced Location Search', slug: 'advanced-location', desc: 'Multi-city and postal code proximity lead prospecting.', icon: 'MapPin', fee: 49.0, price: 0.15, freeQuota: 25, limit: 1000, jobLimit: 100 },
        { id: 'gmaps-export', name: 'Lead Export & CSV Generator', slug: 'export', desc: 'Export leads to formatted CSV, Excel, and CRM ready tables.', icon: 'Download', fee: 0.0, price: 1.00, freeQuota: 10, limit: 500, jobLimit: 50 },
        { id: 'gmaps-enrich', name: 'Lead Enrichment Engine', slug: 'enrichment', desc: 'Normalize names, validate emails, and detect active web domains.', icon: 'Sparkles', fee: 99.0, price: 0.50, freeQuota: 20, limit: 1000, jobLimit: 100 },
        { id: 'gmaps-analytics', name: 'Extraction Analytics', slug: 'analytics', desc: 'Visual charts and performance metrics of collected prospects.', icon: 'BarChart', fee: 0.0, price: 0.0, freeQuota: 99999, limit: 99999, jobLimit: 999 }
      ];

      gmapsModules.forEach((m, idx) => {
        insertMod.run(
          m.id,
          'google-maps-extractor',
          m.name,
          m.slug,
          m.desc,
          m.icon,
          'Maps',
          JSON.stringify([m.name, 'Module-Level Quota Accounting']),
          m.fee,
          m.price > 0 ? 'per_record' : 'free',
          m.price,
          m.freeQuota,
          m.limit,
          m.jobLimit,
          idx + 1
        );
      });

      // 2. Website Lead Extractor
      insertExt.run(
        'website-lead-extractor',
        'Website Lead Extractor',
        'website-lead-extractor',
        'Web Scraping & Contacts',
        'Scan any website or e-commerce shop to detect public emails, phone numbers, and social channels.',
        'Browser-based scanner that inspects DOM tags, mailto anchors, telephone schemes, OpenGraph metadata, and contact forms.',
        'Globe',
        JSON.stringify(['Live Page Scanning', 'Mailto & Regex Email Detection', 'Phone & Tel Extraction', 'Social Links Harvester', 'In-Page Sync Toast']),
        JSON.stringify(['Chrome', 'Brave', 'Edge']),
        149.0,
        'one_time',
        1,
        1,
        2
      );

      const webModules = [
        { id: 'web-scanner', name: 'Current Website Scanner', slug: 'scanner', desc: 'Instantly scan active browser tab for company identity.', icon: 'Globe', fee: 0.0, price: 0.25, freeQuota: 50, limit: 2000, jobLimit: 50 },
        { id: 'web-info', name: 'Business Information Extractor', slug: 'info', desc: 'Extracts official company description, address, and title.', icon: 'Building2', fee: 0.0, price: 0.15, freeQuota: 50, limit: 3000, jobLimit: 100 },
        { id: 'web-contact', name: 'Public Contact Discovery', slug: 'contact', desc: 'Identifies corporate customer care emails and helplines.', icon: 'Mail', fee: 49.0, price: 0.20, freeQuota: 25, limit: 2000, jobLimit: 100 },
        { id: 'web-tech', name: 'Website Technology Detector', slug: 'tech', desc: 'Identifies CMS (WordPress, Shopify, Webflow) and frameworks.', icon: 'Code', fee: 79.0, price: 0.30, freeQuota: 20, limit: 1000, jobLimit: 50 },
        { id: 'web-social', name: 'Social Links Extractor', slug: 'socials', desc: 'Pulls LinkedIn, Twitter/X, Instagram, and Facebook handles.', icon: 'Share2', fee: 0.0, price: 0.10, freeQuota: 100, limit: 4000, jobLimit: 200 },
        { id: 'web-bulk', name: 'Bulk Website Scanner', slug: 'bulk', desc: 'Crawl lists of domain URLs in automated sequence.', icon: 'Layers', fee: 149.0, price: 10.00, freeQuota: 5, limit: 100, jobLimit: 200 },
        { id: 'web-export', name: 'Advanced Data Export', slug: 'export', desc: 'Export leads and technology profiles to CSV/JSON.', icon: 'Download', fee: 0.0, price: 1.00, freeQuota: 10, limit: 500, jobLimit: 50 }
      ];

      webModules.forEach((m, idx) => {
        insertMod.run(
          m.id,
          'website-lead-extractor',
          m.name,
          m.slug,
          m.desc,
          m.icon,
          'Web',
          JSON.stringify([m.name]),
          m.fee,
          m.price > 0 ? 'per_scan' : 'free',
          m.price,
          m.freeQuota,
          m.limit,
          m.jobLimit,
          idx + 1
        );
      });

      // 3. WhatsApp Multi-Channel Prospector
      insertExt.run(
        'whatsapp-prospector',
        'WhatsApp Outreach & Relay Engine',
        'whatsapp-prospector',
        'Marketing Automation',
        'Bridge extracted leads straight into WhatsApp broadcast campaigns, live chats, and scheduled drips.',
        'Synchronous bridge connecting extracted leads to your WhatsApp multi-device sender with zero manual exports.',
        'MessageSquare',
        JSON.stringify(['1-Click Chat Handoff', 'Bulk Phone Relay', 'Status Pipeline Sync', 'Quota Safety Guard']),
        JSON.stringify(['Chrome', 'Brave', 'Edge', 'Desktop']),
        99.0,
        'one_time',
        0,
        1,
        3
      );

      const waModules = [
        { id: 'wa-direct-dispatch', name: '1-Click Direct Chat Launch', slug: 'direct-chat', desc: 'Open chat with any extracted lead instantly.', icon: 'Send', fee: 0.0, price: 0.0, freeQuota: 99999, limit: 99999, jobLimit: 999 },
        { id: 'wa-bulk-relay', name: 'Bulk Queue Relay', slug: 'bulk-relay', desc: 'Transfer 500+ selected leads directly to Bulk Sender.', icon: 'Hash', fee: 49.0, price: 0.05, freeQuota: 100, limit: 10000, jobLimit: 500 },
        { id: 'wa-status-sync', name: 'Pipeline Auto-Status Sync', slug: 'status-sync', desc: 'Update lead status to Contacted when message sends.', icon: 'CheckCircle2', fee: 0.0, price: 0.0, freeQuota: 99999, limit: 99999, jobLimit: 999 }
      ];

      waModules.forEach((m, idx) => {
        insertMod.run(
          m.id,
          'whatsapp-prospector',
          m.name,
          m.slug,
          m.desc,
          m.icon,
          'WhatsApp',
          JSON.stringify([m.name]),
          m.fee,
          m.price > 0 ? 'per_record' : 'free',
          m.price,
          m.freeQuota,
          m.limit,
          m.jobLimit,
          idx + 1
        );
      });

      // Grant admin user full activation for all extensions & modules by default
      if (adminRow) {
        const adminId = adminRow.id;
        const allExts = db.prepare('SELECT id FROM extensions').all() as Array<{ id: string }>;
        const allMods = db.prepare('SELECT id, extension_id FROM extension_modules').all() as Array<{ id: string; extension_id: string }>;

        const actExt = db.prepare("INSERT OR IGNORE INTO extension_activations (id, user_id, extension_id, status, fee_paid) VALUES (?, ?, ?, 'active', 0.0)");
        const actMod = db.prepare("INSERT OR IGNORE INTO module_activations (id, user_id, extension_id, module_id, status, fee_paid) VALUES (?, ?, ?, ?, 'active', 0.0)");

        for (const e of allExts) actExt.run(crypto.randomUUID(), adminId, e.id);
        for (const m of allMods) actMod.run(crypto.randomUUID(), adminId, m.extension_id, m.id);
      }

      console.log('[DB] Extensions Marketplace & 20 Standardized Modules successfully initialized.');
    }

    // Initialize Virtual Number Marketplace & Management System Schema and Seed Data
    initVirtualNumberDatabase(db);
  } catch (err) {
    console.error('[DB] Error configuring wallet and marketplace tables:', err);
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

