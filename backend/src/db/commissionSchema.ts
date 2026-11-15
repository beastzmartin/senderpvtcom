import Database from 'better-sqlite3';

export const COMMISSION_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS custom_commissions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  product_type TEXT NOT NULL DEFAULT 'all_products',
  target_role TEXT NOT NULL DEFAULT 'all',
  target_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('percent', 'fixed', 'percent_plus_fixed')),
  percent_value REAL NOT NULL DEFAULT 0.0,
  fixed_value REAL NOT NULL DEFAULT 0.0,
  min_commission REAL NOT NULL DEFAULT 0.0,
  max_commission REAL,
  description TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_custom_commissions_lookup ON custom_commissions(product_type, target_role, target_user_id, enabled);
`;

export function initCommissionSchema(db: Database.Database): void {
  db.exec(COMMISSION_SCHEMA_SQL);

  // Seed default commission rules if table is empty
  const count = (db.prepare('SELECT COUNT(*) as count FROM custom_commissions').get() as any)?.count || 0;
  if (count === 0) {
    const insertStmt = db.prepare(`
      INSERT INTO custom_commissions (id, name, product_type, target_role, target_user_id, type, percent_value, fixed_value, min_commission, description, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const defaultRules = [
      {
        id: 'comm_default_universal',
        name: 'Universal Base Commission',
        product_type: 'all_products',
        target_role: 'all',
        target_user_id: null,
        type: 'percent',
        percent_value: 20.0,
        fixed_value: 0.0,
        min_commission: 1.0,
        description: 'Default 20% platform markup on all products and services',
        enabled: 1
      },
      {
        id: 'comm_virtual_numbers',
        name: 'Virtual Numbers Commission',
        product_type: 'virtual_numbers',
        target_role: 'all',
        target_user_id: null,
        type: 'percent',
        percent_value: 25.0,
        fixed_value: 0.0,
        min_commission: 0.20,
        description: '25% markup on 5SIM virtual phone number activations',
        enabled: 1
      },
      {
        id: 'comm_reseller_wholesale',
        name: 'Reseller Wholesale Discount Tier',
        product_type: 'all_products',
        target_role: 'reseller',
        target_user_id: null,
        type: 'percent',
        percent_value: 8.0,
        fixed_value: 0.0,
        min_commission: 0.5,
        description: 'Preferred low 8% commission for authorized resellers across all products',
        enabled: 1
      },
      {
        id: 'comm_leads_scraper',
        name: 'Google Maps Lead Extractor Commission',
        product_type: 'leads',
        target_role: 'all',
        target_user_id: null,
        type: 'fixed',
        percent_value: 0.0,
        fixed_value: 1.5,
        min_commission: 1.5,
        description: 'Fixed platform processing commission on leads extraction and CRM sync',
        enabled: 1
      }
    ];

    for (const r of defaultRules) {
      insertStmt.run(r.id, r.name, r.product_type, r.target_role, r.target_user_id, r.type, r.percent_value, r.fixed_value, r.min_commission, r.description, r.enabled);
    }
    console.log('[DB] Custom Commission rules schema and defaults initialized.');
  }
}
