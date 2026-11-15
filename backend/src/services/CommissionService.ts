import crypto from 'crypto';
import { getDatabase } from '../db/database.js';

export interface CustomCommissionRule {
  id: string;
  name: string;
  product_type: string;
  target_role: string;
  target_user_id: string | null;
  target_username?: string | null;
  type: 'percent' | 'fixed' | 'percent_plus_fixed';
  percent_value: number;
  fixed_value: number;
  min_commission: number;
  max_commission: number | null;
  description: string | null;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface CommissionCalculationResult {
  basePrice: number;
  commission: number;
  sellPrice: number;
  profitMarginPercent: number;
  ruleUsed: {
    id: string;
    name: string;
    product_type: string;
    target_role: string;
    type: string;
    percent_value: number;
    fixed_value: number;
  } | null;
}

export class CommissionService {
  private static instance: CommissionService;

  public static getInstance(): CommissionService {
    if (!CommissionService.instance) {
      CommissionService.instance = new CommissionService();
    }
    return CommissionService.instance;
  }

  /**
   * List all custom commission rules with optional target username
   */
  public getAllRules(): CustomCommissionRule[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT 
        c.*,
        u.username as target_username
      FROM custom_commissions c
      LEFT JOIN users u ON c.target_user_id = u.id
      ORDER BY 
        CASE 
          WHEN c.target_user_id IS NOT NULL THEN 1
          WHEN c.target_role != 'all' THEN 2
          WHEN c.product_type != 'all_products' THEN 3
          ELSE 4
        END ASC,
        c.created_at DESC
    `).all() as any[];

    return rows.map((r) => ({
      ...r,
      percent_value: Number(r.percent_value),
      fixed_value: Number(r.fixed_value),
      min_commission: Number(r.min_commission),
      max_commission: r.max_commission !== null ? Number(r.max_commission) : null,
      enabled: Number(r.enabled)
    }));
  }

  /**
   * Get a single commission rule by ID
   */
  public getRuleById(id: string): CustomCommissionRule | null {
    const db = getDatabase();
    const r = db.prepare(`
      SELECT c.*, u.username as target_username
      FROM custom_commissions c
      LEFT JOIN users u ON c.target_user_id = u.id
      WHERE c.id = ?
    `).get(id) as any;

    if (!r) return null;
    return {
      ...r,
      percent_value: Number(r.percent_value),
      fixed_value: Number(r.fixed_value),
      min_commission: Number(r.min_commission),
      max_commission: r.max_commission !== null ? Number(r.max_commission) : null,
      enabled: Number(r.enabled)
    };
  }

  /**
   * Create a new custom commission rule
   */
  public createRule(data: {
    name: string;
    product_type?: string;
    target_role?: string;
    target_user_id?: string | null;
    type: 'percent' | 'fixed' | 'percent_plus_fixed';
    percent_value?: number;
    fixed_value?: number;
    min_commission?: number;
    max_commission?: number | null;
    description?: string;
    enabled?: boolean;
  }): CustomCommissionRule {
    const db = getDatabase();
    const id = `comm_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const productType = (data.product_type || 'all_products').trim().toLowerCase();
    const targetRole = (data.target_role || 'all').trim().toLowerCase();
    const targetUserId = data.target_user_id || null;
    const type = data.type || 'percent';
    const percentValue = Math.max(0, Number(data.percent_value || 0));
    const fixedValue = Math.max(0, Number(data.fixed_value || 0));
    const minCommission = Math.max(0, Number(data.min_commission || 0));
    const maxCommission = data.max_commission !== undefined && data.max_commission !== null ? Math.max(0, Number(data.max_commission)) : null;
    const description = data.description?.trim() || null;
    const enabled = data.enabled === false ? 0 : 1;

    db.prepare(`
      INSERT INTO custom_commissions (
        id, name, product_type, target_role, target_user_id,
        type, percent_value, fixed_value, min_commission, max_commission,
        description, enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.name.trim(),
      productType,
      targetRole,
      targetUserId,
      type,
      percentValue,
      fixedValue,
      minCommission,
      maxCommission,
      description,
      enabled,
      now,
      now
    );

    return this.getRuleById(id)!;
  }

  /**
   * Update an existing commission rule
   */
  public updateRule(id: string, data: Partial<{
    name: string;
    product_type: string;
    target_role: string;
    target_user_id: string | null;
    type: 'percent' | 'fixed' | 'percent_plus_fixed';
    percent_value: number;
    fixed_value: number;
    min_commission: number;
    max_commission: number | null;
    description: string;
    enabled: boolean | number;
  }>): CustomCommissionRule {
    const db = getDatabase();
    const existing = this.getRuleById(id);
    if (!existing) {
      throw new Error(`Commission rule with ID '${id}' not found.`);
    }

    const fields: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) {
      fields.push('name = ?');
      values.push(data.name.trim());
    }
    if (data.product_type !== undefined) {
      fields.push('product_type = ?');
      values.push(data.product_type.trim().toLowerCase());
    }
    if (data.target_role !== undefined) {
      fields.push('target_role = ?');
      values.push(data.target_role.trim().toLowerCase());
    }
    if (data.target_user_id !== undefined) {
      fields.push('target_user_id = ?');
      values.push(data.target_user_id || null);
    }
    if (data.type !== undefined) {
      fields.push('type = ?');
      values.push(data.type);
    }
    if (data.percent_value !== undefined) {
      fields.push('percent_value = ?');
      values.push(Math.max(0, Number(data.percent_value)));
    }
    if (data.fixed_value !== undefined) {
      fields.push('fixed_value = ?');
      values.push(Math.max(0, Number(data.fixed_value)));
    }
    if (data.min_commission !== undefined) {
      fields.push('min_commission = ?');
      values.push(Math.max(0, Number(data.min_commission)));
    }
    if (data.max_commission !== undefined) {
      fields.push('max_commission = ?');
      values.push(data.max_commission !== null ? Math.max(0, Number(data.max_commission)) : null);
    }
    if (data.description !== undefined) {
      fields.push('description = ?');
      values.push(data.description ? data.description.trim() : null);
    }
    if (data.enabled !== undefined) {
      fields.push('enabled = ?');
      values.push(data.enabled ? 1 : 0);
    }

    fields.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(`UPDATE custom_commissions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getRuleById(id)!;
  }

  /**
   * Delete a commission rule
   */
  public deleteRule(id: string): boolean {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM custom_commissions WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /**
   * Resolve and calculate the custom commission for a product & user
   */
  public resolveCommission(
    productType: string,
    basePrice: number,
    userId?: string | null,
    userRole?: string | null
  ): CommissionCalculationResult {
    const db = getDatabase();
    const safeProduct = (productType || 'all_products').trim().toLowerCase();
    const safeRole = (userRole || 'all').trim().toLowerCase();

    // Query all active rules
    const activeRules = db.prepare(`
      SELECT * FROM custom_commissions 
      WHERE enabled = 1
    `).all() as CustomCommissionRule[];

    // Strict priority hierarchy:
    // 1. Specific User + Specific Product
    // 2. Specific User + 'all_products'
    // 3. User Role + Specific Product
    // 4. User Role + 'all_products'
    // 5. 'all' Role + Specific Product
    // 6. 'all' Role + 'all_products' (Universal default)
    let matchedRule: CustomCommissionRule | null = null;

    if (userId) {
      matchedRule =
        activeRules.find((r) => r.target_user_id === userId && r.product_type === safeProduct) ||
        activeRules.find((r) => r.target_user_id === userId && r.product_type === 'all_products') ||
        null;
    }

    if (!matchedRule && safeRole && safeRole !== 'all') {
      matchedRule =
        activeRules.find((r) => r.target_role === safeRole && r.product_type === safeProduct) ||
        activeRules.find((r) => r.target_role === safeRole && r.product_type === 'all_products') ||
        null;
    }

    if (!matchedRule) {
      matchedRule =
        activeRules.find((r) => r.target_role === 'all' && r.product_type === safeProduct) ||
        activeRules.find((r) => r.target_role === 'all' && r.product_type === 'all_products') ||
        null;
    }

    let calculatedCommission = 0;

    if (matchedRule) {
      switch (matchedRule.type) {
        case 'percent':
          calculatedCommission = basePrice * (matchedRule.percent_value / 100);
          break;
        case 'fixed':
          calculatedCommission = matchedRule.fixed_value;
          break;
        case 'percent_plus_fixed':
          calculatedCommission = basePrice * (matchedRule.percent_value / 100) + matchedRule.fixed_value;
          break;
      }

      // Enforce minimum commission floor
      if (matchedRule.min_commission > 0) {
        calculatedCommission = Math.max(calculatedCommission, matchedRule.min_commission);
      }

      // Enforce maximum commission cap if configured
      if (matchedRule.max_commission !== null && matchedRule.max_commission > 0) {
        calculatedCommission = Math.min(calculatedCommission, matchedRule.max_commission);
      }
    } else {
      // Default fallback: 15% commission if no rule matched
      calculatedCommission = basePrice * 0.15;
    }

    // Round to 2 decimal places
    const commission = Math.round(calculatedCommission * 100) / 100;
    const sellPrice = Math.round((basePrice + commission) * 100) / 100;
    const profitMarginPercent = basePrice > 0 ? Math.round((commission / basePrice) * 1000) / 10 : 100;

    return {
      basePrice,
      commission,
      sellPrice,
      profitMarginPercent,
      ruleUsed: matchedRule
        ? {
            id: matchedRule.id,
            name: matchedRule.name,
            product_type: matchedRule.product_type,
            target_role: matchedRule.target_role,
            type: matchedRule.type,
            percent_value: matchedRule.percent_value,
            fixed_value: matchedRule.fixed_value
          }
        : null
    };
  }

  /**
   * Helper to fetch distinct product types
   */
  public getProductTypes(): string[] {
    const db = getDatabase();
    const rows = db.prepare(`SELECT DISTINCT product_type FROM custom_commissions`).all() as any[];
    const known = ['all_products', 'virtual_numbers', 'marketplace', 'leads'];
    const fromDb = rows.map((r) => r.product_type).filter(Boolean);
    return Array.from(new Set([...known, ...fromDb]));
  }
}
