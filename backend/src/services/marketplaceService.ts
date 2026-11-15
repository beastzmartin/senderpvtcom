import crypto from 'crypto';
import { getDatabase } from '../db/database.js';
import { WalletService } from './walletService.js';
import { getSocketIO } from '../socket/socketManager.js';

export interface ExtensionRecord {
  id: string;
  name: string;
  slug: string;
  category: string;
  short_description: string;
  description: string;
  icon?: string;
  logo_url?: string;
  screenshots?: string[];
  features?: string[];
  supported_browsers?: string[];
  version: string;
  activation_fee: number;
  pricing_model: string;
  is_featured: boolean;
  is_popular: boolean;
  is_published: boolean;
  status: string;
  rating: number;
  reviews_count: number;
  sort_order: number;
  modules?: ExtensionModuleRecord[];
  is_activated?: boolean;
  activated_at?: string | null;
  expires_at?: string | null;
}

export interface ExtensionModuleRecord {
  id: string;
  extension_id: string;
  name: string;
  slug: string;
  description: string;
  icon?: string;
  category: string;
  version: string;
  features?: string[];
  activation_fee: number;
  usage_charging_model: string;
  usage_price: number;
  free_quota: number;
  period_quota_limit: number;
  quota_period: string;
  per_job_limit: number;
  status: string;
  is_visible: boolean;
  sort_order: number;
  // User entitlement state
  is_activated?: boolean;
  access_status?: 'active' | 'locked' | 'expired' | 'limit_reached' | 'disabled';
  quota_consumed?: number;
  quota_remaining?: number;
}

export class MarketplaceService {
  private static instance: MarketplaceService | null = null;
  private walletService: WalletService;

  private constructor() {
    this.walletService = WalletService.getInstance();
  }

  public static getInstance(): MarketplaceService {
    if (!MarketplaceService.instance) {
      MarketplaceService.instance = new MarketplaceService();
    }
    return MarketplaceService.instance;
  }

  /**
   * List extensions with user entitlement state and module counts
   */
  public listExtensions(userId?: string, category?: string, search?: string): ExtensionRecord[] {
    const db = getDatabase();
    const whereClauses: string[] = ['is_published = 1'];
    const params: any[] = [];

    if (category && category !== 'All') {
      whereClauses.push('category = ?');
      params.push(category);
    }

    if (search) {
      whereClauses.push('(LOWER(name) LIKE ? OR LOWER(short_description) LIKE ? OR LOWER(category) LIKE ?)');
      const q = `%${search.trim().toLowerCase()}%`;
      params.push(q, q, q);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const rows = db
      .prepare(`SELECT * FROM extensions ${whereSql} ORDER BY is_featured DESC, sort_order ASC, name ASC`)
      .all(...params) as any[];

    // Fetch user activations if logged in
    const activeExtMap: Record<string, any> = {};
    if (userId) {
      const activations = db
        .prepare("SELECT * FROM extension_activations WHERE user_id = ? AND status = 'active'")
        .all(userId) as any[];
      for (const a of activations) activeExtMap[a.extension_id] = a;
    }

    return rows.map((r) => {
      const act = activeExtMap[r.id];
      const mods = this.listModules(r.id, userId);

      return {
        id: r.id,
        name: r.name,
        slug: r.slug,
        category: r.category,
        short_description: r.short_description,
        description: r.description,
        icon: r.icon,
        logo_url: r.logo_url,
        screenshots: r.screenshots ? JSON.parse(r.screenshots) : [],
        features: r.features ? JSON.parse(r.features) : [],
        supported_browsers: r.supported_browsers ? JSON.parse(r.supported_browsers) : ['Chrome'],
        version: r.version || '2.0.0',
        activation_fee: Number(r.activation_fee || 0),
        pricing_model: r.pricing_model || 'one_time',
        is_featured: r.is_featured === 1,
        is_popular: r.is_popular === 1,
        is_published: r.is_published === 1,
        status: r.status || 'active',
        rating: Number(r.rating || 4.9),
        reviews_count: Number(r.reviews_count || 120),
        sort_order: Number(r.sort_order || 0),
        modules: mods,
        is_activated: !!act,
        activated_at: act?.activated_at || null,
        expires_at: act?.expires_at || null
      };
    });
  }

  /**
   * Get single extension by ID or Slug
   */
  public getExtension(identifier: string, userId?: string): ExtensionRecord | null {
    const db = getDatabase();
    const row = db
      .prepare('SELECT * FROM extensions WHERE id = ? OR slug = ? LIMIT 1')
      .get(identifier, identifier) as any;

    if (!row) return null;

    let act: any = null;
    if (userId) {
      act = db
        .prepare("SELECT * FROM extension_activations WHERE user_id = ? AND extension_id = ? AND status = 'active'")
        .get(userId, row.id);
    }

    const mods = this.listModules(row.id, userId);

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      category: row.category,
      short_description: row.short_description,
      description: row.description,
      icon: row.icon,
      logo_url: row.logo_url,
      screenshots: row.screenshots ? JSON.parse(row.screenshots) : [],
      features: row.features ? JSON.parse(row.features) : [],
      supported_browsers: row.supported_browsers ? JSON.parse(row.supported_browsers) : ['Chrome'],
      version: row.version || '2.0.0',
      activation_fee: Number(row.activation_fee || 0),
      pricing_model: row.pricing_model || 'one_time',
      is_featured: row.is_featured === 1,
      is_popular: row.is_popular === 1,
      is_published: row.is_published === 1,
      status: row.status || 'active',
      rating: Number(row.rating || 4.9),
      reviews_count: Number(row.reviews_count || 120),
      sort_order: Number(row.sort_order || 0),
      modules: mods,
      is_activated: !!act,
      activated_at: act?.activated_at || null,
      expires_at: act?.expires_at || null
    };
  }

  /**
   * List modules for an extension with user entitlement and quota consumption
   */
  public listModules(extensionId: string, userId?: string): ExtensionModuleRecord[] {
    const db = getDatabase();
    const rows = db
      .prepare('SELECT * FROM extension_modules WHERE extension_id = ? AND is_visible = 1 ORDER BY sort_order ASC, name ASC')
      .all(extensionId) as any[];

    // Fetch user module activations & current monthly usage
    const userModMap: Record<string, any> = {};
    const usageMap: Record<string, number> = {};

    if (userId) {
      const acts = db
        .prepare('SELECT * FROM module_activations WHERE user_id = ? AND extension_id = ?')
        .all(userId, extensionId) as any[];
      for (const a of acts) userModMap[a.module_id] = a;

      // Current month usage
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
      const usages = db
        .prepare('SELECT module_id, units_consumed FROM module_usage WHERE user_id = ? AND period_start >= ?')
        .all(userId, startOfMonth) as any[];
      for (const u of usages) usageMap[u.module_id] = (usageMap[u.module_id] || 0) + Number(u.units_consumed);
    }

    return rows.map((r) => {
      const act = userModMap[r.id];
      const consumed = usageMap[r.id] || 0;
      const limit = act?.custom_quota_override || r.period_quota_limit || 1000;
      const remaining = Math.max(0, limit - consumed);

      let accessStatus: 'active' | 'locked' | 'expired' | 'limit_reached' | 'disabled' = 'locked';
      if (r.status === 'maintenance' || r.status === 'deprecated') {
        accessStatus = 'disabled';
      } else if (act && act.status === 'active') {
        if (remaining <= 0 && limit < 99999) {
          accessStatus = 'limit_reached';
        } else {
          accessStatus = 'active';
        }
      } else if (act && act.status === 'expired') {
        accessStatus = 'expired';
      } else {
        accessStatus = 'locked';
      }

      return {
        id: r.id,
        extension_id: r.extension_id,
        name: r.name,
        slug: r.slug,
        description: r.description,
        icon: r.icon,
        category: r.category,
        version: r.version || '1.0.0',
        features: r.features ? JSON.parse(r.features) : [],
        activation_fee: Number(act?.custom_usage_price_override ?? r.activation_fee ?? 0),
        usage_charging_model: r.usage_charging_model || 'per_record',
        usage_price: Number(r.usage_price || 0),
        free_quota: Number(r.free_quota || 0),
        period_quota_limit: limit,
        quota_period: r.quota_period || 'monthly',
        per_job_limit: Number(r.per_job_limit || 100),
        status: r.status || 'published',
        is_visible: r.is_visible === 1,
        sort_order: Number(r.sort_order || 0),
        is_activated: !!act && act.status === 'active',
        access_status: accessStatus,
        quota_consumed: consumed,
        quota_remaining: remaining
      };
    });
  }

  /**
   * Activate an extension using Wallet balance (Part 3)
   */
  public activateExtension(userId: string, extensionId: string): { success: boolean; message: string; balance: number } {
    const db = getDatabase();
    const ext = this.getExtension(extensionId, userId);
    if (!ext) throw new Error('Extension not found.');

    if (ext.is_activated) {
      return { success: true, message: 'Extension is already active.', balance: this.walletService.getOrCreateWallet(userId).balance };
    }

    const fee = ext.activation_fee || 0.0;
    let deductionResult = { newBalance: this.walletService.getOrCreateWallet(userId).balance };

    if (fee > 0) {
      deductionResult = this.walletService.deduct(
        userId,
        fee,
        'extension_activation',
        `Activated Extension: ${ext.name}`,
        { extensionId: ext.id }
      );
    }

    const id = crypto.randomUUID();
    db.prepare(`
      INSERT OR REPLACE INTO extension_activations (id, user_id, extension_id, status, fee_paid, activated_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, datetime('now'), datetime('now'))
    `).run(id, userId, extensionId, fee);

    // Auto-activate all included free modules for this extension
    const freeMods = db.prepare('SELECT id FROM extension_modules WHERE extension_id = ? AND activation_fee = 0').all(extensionId) as any[];
    const actMod = db.prepare(`
      INSERT OR IGNORE INTO module_activations (id, user_id, extension_id, module_id, status, fee_paid, activated_at)
      VALUES (?, ?, ?, ?, 'active', 0.0, datetime('now'))
    `);
    for (const fm of freeMods) {
      actMod.run(crypto.randomUUID(), userId, extensionId, fm.id);
    }

    try {
      getSocketIO()?.to(`user:${userId}`).emit('extension:activated', { extensionId, fee, newBalance: deductionResult.newBalance });
    } catch {}

    return {
      success: true,
      message: `Extension "${ext.name}" activated successfully!`,
      balance: deductionResult.newBalance
    };
  }

  /**
   * Activate an individual module using Wallet balance (Part 3 & Part 7)
   */
  public activateModule(userId: string, moduleId: string): { success: boolean; message: string; balance: number } {
    const db = getDatabase();
    const mod = db.prepare('SELECT * FROM extension_modules WHERE id = ?').get(moduleId) as any;
    if (!mod) throw new Error('Module not found.');

    // Ensure parent extension is active (if free activation, auto-activate)
    let extAct = db.prepare("SELECT * FROM extension_activations WHERE user_id = ? AND extension_id = ? AND status = 'active'").get(userId, mod.extension_id);
    if (!extAct) {
      const ext = db.prepare('SELECT activation_fee FROM extensions WHERE id = ?').get(mod.extension_id) as any;
      if (ext && ext.activation_fee === 0) {
        this.activateExtension(userId, mod.extension_id);
      } else {
        throw new Error('Please activate the parent extension before activating this module.');
      }
    }

    // Check if already active
    const existingModAct = db.prepare("SELECT * FROM module_activations WHERE user_id = ? AND module_id = ? AND status = 'active'").get(userId, moduleId);
    if (existingModAct) {
      return { success: true, message: 'Module is already active.', balance: this.walletService.getOrCreateWallet(userId).balance };
    }

    const fee = Number(mod.activation_fee || 0);
    let deductionResult = { newBalance: this.walletService.getOrCreateWallet(userId).balance };

    if (fee > 0) {
      deductionResult = this.walletService.deduct(
        userId,
        fee,
        'module_activation',
        `Activated Module: ${mod.name}`,
        { extensionId: mod.extension_id, moduleId: mod.id }
      );
    }

    const id = crypto.randomUUID();
    db.prepare(`
      INSERT OR REPLACE INTO module_activations (id, user_id, extension_id, module_id, status, fee_paid, activated_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, datetime('now'), datetime('now'))
    `).run(id, userId, mod.extension_id, moduleId, fee);

    try {
      getSocketIO()?.to(`user:${userId}`).emit('module:activated', { moduleId, extensionId: mod.extension_id, fee, newBalance: deductionResult.newBalance });
    } catch {}

    return {
      success: true,
      message: `Module "${mod.name}" activated successfully!`,
      balance: deductionResult.newBalance
    };
  }

  /**
   * Admin Dynamic Module Creator (Part 2 & Part 6)
   * Allows admins to introduce 10, 20, 50+ new modules without changing application source code!
   */
  public adminCreateModule(adminUserId: string, data: Partial<ExtensionModuleRecord>): ExtensionModuleRecord {
    const db = getDatabase();
    const admin = db.prepare('SELECT role FROM users WHERE id = ?').get(adminUserId) as any;
    if (!admin || admin.role !== 'admin') {
      throw new Error('Administrator privileges required.');
    }

    if (!data.name || !data.extension_id) {
      throw new Error('Module name and parent extension ID are required.');
    }

    const slug = data.slug || data.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const id = data.id || `${data.extension_id}-${slug}`;

    db.prepare(`
      INSERT INTO extension_modules (
        id, extension_id, name, slug, description, icon, category,
        version, features, activation_fee, usage_charging_model, usage_price,
        free_quota, period_quota_limit, quota_period, per_job_limit, status, sort_order
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?
      )
    `).run(
      id,
      data.extension_id,
      data.name.trim(),
      slug,
      data.description || null,
      data.icon || 'Layers',
      data.category || 'General',
      data.version || '1.0.0',
      data.features ? JSON.stringify(data.features) : null,
      Number(data.activation_fee || 0),
      data.usage_charging_model || 'per_record',
      Number(data.usage_price || 0),
      Number(data.free_quota || 0),
      Number(data.period_quota_limit || 1000),
      data.quota_period || 'monthly',
      Number(data.per_job_limit || 100),
      data.status || 'published',
      Number(data.sort_order || 99)
    );

    // Audit log
    db.prepare(`
      INSERT INTO extension_audit_logs (id, admin_user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, 'create_module', 'extension_modules', ?, ?)
    `).run(crypto.randomUUID(), adminUserId, id, JSON.stringify(data));

    return this.listModules(data.extension_id).find((m) => m.id === id)!;
  }

  /**
   * Admin Update Module
   */
  public adminUpdateModule(adminUserId: string, moduleId: string, updates: Partial<ExtensionModuleRecord>): ExtensionModuleRecord {
    const db = getDatabase();
    const admin = db.prepare('SELECT role FROM users WHERE id = ?').get(adminUserId) as any;
    if (!admin || admin.role !== 'admin') {
      throw new Error('Administrator privileges required.');
    }

    const fields: string[] = [];
    const params: any[] = [];

    const allowed = [
      'name', 'description', 'icon', 'category', 'version',
      'activation_fee', 'usage_charging_model', 'usage_price',
      'free_quota', 'period_quota_limit', 'quota_period', 'per_job_limit', 'status', 'sort_order'
    ];

    for (const key of allowed) {
      if ((updates as any)[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push((updates as any)[key]);
      }
    }

    if (updates.features !== undefined) {
      fields.push('features = ?');
      params.push(JSON.stringify(updates.features));
    }

    if (fields.length > 0) {
      fields.push(`updated_at = datetime('now')`);
      params.push(moduleId);
      db.prepare(`UPDATE extension_modules SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    }

    const updated = db.prepare('SELECT * FROM extension_modules WHERE id = ?').get(moduleId) as any;
    return this.listModules(updated.extension_id).find((m) => m.id === moduleId)!;
  }

  /**
   * Admin Delete/Archive Module
   */
  public adminDeleteModule(adminUserId: string, moduleId: string): boolean {
    const db = getDatabase();
    const admin = db.prepare('SELECT role FROM users WHERE id = ?').get(adminUserId) as any;
    if (!admin || admin.role !== 'admin') throw new Error('Administrator privileges required.');

    const res = db.prepare('DELETE FROM extension_modules WHERE id = ?').run(moduleId);
    return res.changes > 0;
  }
}
