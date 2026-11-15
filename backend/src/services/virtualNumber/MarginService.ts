import crypto from 'crypto';
import { getDatabase } from '../../db/database.js';

export type MarginScope = 'global' | 'country' | 'product' | 'country_product' | 'country_product_operator';
export type MarginType = 'percent' | 'fixed' | 'percent_plus_fixed';
export type RoundingMode = 'none' | '2_decimals' | 'nearest_1' | '99_cents';

export interface MarginRule {
  id: string;
  scope: MarginScope;
  country?: string | null;
  product?: string | null;
  operator?: string | null;
  type: MarginType;
  percent_value: number;
  fixed_value: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface PricingSettings {
  id: string;
  fx_rate: number;
  min_margin: number;
  min_sell_price: number;
  rounding_mode: RoundingMode;
  low_balance_threshold: number;
  display_currency: string;
  updated_at: string;
}

export interface HiddenItem {
  id: string;
  type: 'country' | 'product';
  value: string;
  created_at: string;
}

export interface CalculatedPrice {
  originalCostInRub: number;
  costPrice: number;
  sellPrice: number;
  profit: number;
  displayCurrency: string;
  appliedRule: MarginRule | null;
  matchedScope: MarginScope | 'fallback';
  formula: string;
}

export class MarginService {
  private static instance: MarginService | null = null;

  public static getInstance(): MarginService {
    if (!MarginService.instance) {
      MarginService.instance = new MarginService();
    }
    return MarginService.instance;
  }

  /**
   * Retrieves active global pricing settings
   */
  public getPricingSettings(): PricingSettings {
    const db = getDatabase();
    const row = db.prepare("SELECT * FROM pricing_settings WHERE id = 'default'").get() as any;
    if (!row) {
      return {
        id: 'default',
        fx_rate: 1.0,
        min_margin: 2.0,
        min_sell_price: 5.0,
        rounding_mode: '2_decimals',
        low_balance_threshold: 50.0,
        display_currency: 'INR',
        updated_at: new Date().toISOString()
      };
    }

    return {
      id: row.id,
      fx_rate: Number(row.fx_rate || 1.0),
      min_margin: Number(row.min_margin || 0.0),
      min_sell_price: Number(row.min_sell_price || 0.0),
      rounding_mode: (row.rounding_mode || '2_decimals') as RoundingMode,
      low_balance_threshold: Number(row.low_balance_threshold || 50.0),
      display_currency: row.display_currency || 'INR',
      updated_at: row.updated_at || new Date().toISOString()
    };
  }

  /**
   * Updates global pricing settings
   */
  public updatePricingSettings(data: Partial<Omit<PricingSettings, 'id' | 'updated_at'>>): PricingSettings {
    const db = getDatabase();
    const current = this.getPricingSettings();

    const fx_rate = data.fx_rate !== undefined ? Number(data.fx_rate) : current.fx_rate;
    const min_margin = data.min_margin !== undefined ? Number(data.min_margin) : current.min_margin;
    const min_sell_price = data.min_sell_price !== undefined ? Number(data.min_sell_price) : current.min_sell_price;
    const rounding_mode = data.rounding_mode || current.rounding_mode;
    const low_balance_threshold = data.low_balance_threshold !== undefined ? Number(data.low_balance_threshold) : current.low_balance_threshold;
    const display_currency = data.display_currency || current.display_currency;

    db.prepare(`
      UPDATE pricing_settings
      SET fx_rate = ?, min_margin = ?, min_sell_price = ?, rounding_mode = ?, low_balance_threshold = ?, display_currency = ?, updated_at = datetime('now')
      WHERE id = 'default'
    `).run(fx_rate, min_margin, min_sell_price, rounding_mode, low_balance_threshold, display_currency);

    return this.getPricingSettings();
  }

  /**
   * Lists all margin rules with optional filters
   */
  public getMarginRules(filters?: { scope?: string; enabled?: boolean }): MarginRule[] {
    const db = getDatabase();
    let query = 'SELECT * FROM margin_rules WHERE 1=1';
    const params: any[] = [];

    if (filters?.scope) {
      query += ' AND scope = ?';
      params.push(filters.scope);
    }
    if (filters?.enabled !== undefined) {
      query += ' AND enabled = ?';
      params.push(filters.enabled ? 1 : 0);
    }

    query += ' ORDER BY CASE scope ' +
      "WHEN 'country_product_operator' THEN 1 " +
      "WHEN 'country_product' THEN 2 " +
      "WHEN 'product' THEN 3 " +
      "WHEN 'country' THEN 4 " +
      "WHEN 'global' THEN 5 ELSE 6 END, created_at DESC";

    const rows = db.prepare(query).all(...params) as any[];
    return rows.map((r) => this.mapMarginRule(r));
  }

  /**
   * Get single margin rule by ID
   */
  public getMarginRuleById(id: string): MarginRule | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM margin_rules WHERE id = ?').get(id) as any;
    return row ? this.mapMarginRule(row) : null;
  }

  /**
   * Create a new margin rule
   */
  public createMarginRule(data: {
    scope: MarginScope;
    country?: string | null;
    product?: string | null;
    operator?: string | null;
    type: MarginType;
    percent_value?: number;
    fixed_value?: number;
    enabled?: boolean;
  }): MarginRule {
    const db = getDatabase();
    const id = crypto.randomUUID();
    const country = data.country ? data.country.trim().toLowerCase() : null;
    const product = data.product ? data.product.trim().toLowerCase() : null;
    const operator = data.operator ? data.operator.trim().toLowerCase() : null;
    const percent_value = Number(data.percent_value || 0.0);
    const fixed_value = Number(data.fixed_value || 0.0);
    const enabled = data.enabled !== false ? 1 : 0;

    db.prepare(`
      INSERT INTO margin_rules (id, scope, country, product, operator, type, percent_value, fixed_value, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.scope, country, product, operator, data.type, percent_value, fixed_value, enabled);

    return this.getMarginRuleById(id)!;
  }

  /**
   * Update an existing margin rule
   */
  public updateMarginRule(
    id: string,
    data: {
      scope?: MarginScope;
      country?: string | null;
      product?: string | null;
      operator?: string | null;
      type?: MarginType;
      percent_value?: number;
      fixed_value?: number;
      enabled?: boolean;
    }
  ): MarginRule {
    const current = this.getMarginRuleById(id);
    if (!current) {
      throw new Error(`Margin rule not found with ID: ${id}`);
    }

    const db = getDatabase();
    const scope = data.scope || current.scope;
    const country = data.country !== undefined ? (data.country ? data.country.trim().toLowerCase() : null) : current.country;
    const product = data.product !== undefined ? (data.product ? data.product.trim().toLowerCase() : null) : current.product;
    const operator = data.operator !== undefined ? (data.operator ? data.operator.trim().toLowerCase() : null) : current.operator;
    const type = data.type || current.type;
    const percent_value = data.percent_value !== undefined ? Number(data.percent_value) : current.percent_value;
    const fixed_value = data.fixed_value !== undefined ? Number(data.fixed_value) : current.fixed_value;
    const enabled = data.enabled !== undefined ? (data.enabled ? 1 : 0) : (current.enabled ? 1 : 0);

    db.prepare(`
      UPDATE margin_rules
      SET scope = ?, country = ?, product = ?, operator = ?, type = ?, percent_value = ?, fixed_value = ?, enabled = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(scope, country, product, operator, type, percent_value, fixed_value, enabled, id);

    return this.getMarginRuleById(id)!;
  }

  /**
   * Delete a margin rule
   */
  public deleteMarginRule(id: string): boolean {
    const db = getDatabase();
    const res = db.prepare('DELETE FROM margin_rules WHERE id = ?').run(id);
    return res.changes > 0;
  }

  /**
   * Central Resolution Algorithm: Resolves which margin rule applies based on 5 strict priority levels.
   * Priority:
   * 1. Country + Product + Operator specific rule
   * 2. Country + Product rule
   * 3. Product rule
   * 4. Country rule
   * 5. Global default margin
   */
  public resolveMarginRule(country?: string, product?: string, operator?: string): MarginRule | null {
    const db = getDatabase();
    const c = country ? country.trim().toLowerCase() : null;
    const p = product ? product.trim().toLowerCase() : null;
    const o = operator && operator !== 'any' ? operator.trim().toLowerCase() : null;

    // Level 1: Country + Product + Operator
    if (c && p && o) {
      const row = db.prepare(`
        SELECT * FROM margin_rules
        WHERE scope = 'country_product_operator' AND country = ? AND product = ? AND operator = ? AND enabled = 1
        LIMIT 1
      `).get(c, p, o) as any;
      if (row) return this.mapMarginRule(row);
    }

    // Level 2: Country + Product
    if (c && p) {
      const row = db.prepare(`
        SELECT * FROM margin_rules
        WHERE scope = 'country_product' AND country = ? AND product = ? AND enabled = 1
        LIMIT 1
      `).get(c, p) as any;
      if (row) return this.mapMarginRule(row);
    }

    // Level 3: Product
    if (p) {
      const row = db.prepare(`
        SELECT * FROM margin_rules
        WHERE scope = 'product' AND product = ? AND enabled = 1
        LIMIT 1
      `).get(p) as any;
      if (row) return this.mapMarginRule(row);
    }

    // Level 4: Country
    if (c) {
      const row = db.prepare(`
        SELECT * FROM margin_rules
        WHERE scope = 'country' AND country = ? AND enabled = 1
        LIMIT 1
      `).get(c) as any;
      if (row) return this.mapMarginRule(row);
    }

    // Level 5: Global default margin
    const globalRow = db.prepare(`
      SELECT * FROM margin_rules
      WHERE scope = 'global' AND enabled = 1
      LIMIT 1
    `).get() as any;
    if (globalRow) return this.mapMarginRule(globalRow);

    return null;
  }

  /**
   * Applies the resolved rule margin onto base cost
   */
  public applyMargin(cost: number, rule: MarginRule | null): number {
    if (!rule) return cost;

    switch (rule.type) {
      case 'percent':
        return cost * (1 + rule.percent_value / 100);
      case 'fixed':
        return cost + rule.fixed_value;
      case 'percent_plus_fixed':
        return cost * (1 + rule.percent_value / 100) + rule.fixed_value;
      default:
        return cost;
    }
  }

  /**
   * Applies rounding according to configured rounding mode
   */
  public applyRounding(amount: number, mode: RoundingMode): number {
    if (amount <= 0) return 0;

    switch (mode) {
      case 'none':
        return Number(amount.toFixed(4));
      case '2_decimals':
        return Number(amount.toFixed(2));
      case 'nearest_1':
        return Math.ceil(amount);
      case '99_cents': {
        // e.g. 23.40 -> 23.99. If amount is exactly on .00, round to .99
        const integerPart = Math.floor(amount);
        const rounded = integerPart + 0.99;
        return rounded < amount ? Math.ceil(amount) + 0.99 : rounded;
      }
      default:
        return Number(amount.toFixed(2));
    }
  }

  /**
   * Central Calculation Pipeline (Part A3 Specification):
   * 1. cost = 5sim_cost * fx_rate
   * 2. rule = resolveMarginRule(country, product, operator)
   * 3. sell = applyMargin(cost, rule)
   * 4. sell = max(sell, cost + min_margin)
   * 5. sell = max(sell, min_sell_price)
   * 6. sell = applyRounding(sell)
   */
  public calculateSellPrice(
    costIn5SimCurrency: number,
    country?: string,
    product?: string,
    operator?: string
  ): CalculatedPrice {
    const settings = this.getPricingSettings();
    const rawCost = Math.max(0, Number(costIn5SimCurrency || 0));

    // 1. Convert cost via exchange rate multiplier
    const convertedCost = Number((rawCost * settings.fx_rate).toFixed(4));

    // 2. Resolve matching rule by strict priority
    const rule = this.resolveMarginRule(country, product, operator);
    const matchedScope: MarginScope | 'fallback' = rule ? rule.scope : 'fallback';

    // 3. Apply margin formula
    let sell = this.applyMargin(convertedCost, rule);
    let formulaDesc = rule
      ? rule.type === 'percent'
        ? `cost * (1 + ${rule.percent_value}%)`
        : rule.type === 'fixed'
        ? `cost + ${rule.fixed_value}`
        : `cost * (1 + ${rule.percent_value}%) + ${rule.fixed_value}`
      : 'cost (no rule applied)';

    // 4. Floor: minimum profit margin
    if (sell < convertedCost + settings.min_margin) {
      sell = convertedCost + settings.min_margin;
      formulaDesc += ` → floor min_margin (+${settings.min_margin})`;
    }

    // 5. Floor: absolute minimum sell price
    if (sell < settings.min_sell_price) {
      sell = settings.min_sell_price;
      formulaDesc += ` → floor min_sell_price (${settings.min_sell_price})`;
    }

    // 6. Rounding
    const finalSell = this.applyRounding(sell, settings.rounding_mode);
    const profit = Number((finalSell - convertedCost).toFixed(2));

    return {
      originalCostInRub: rawCost,
      costPrice: Number(convertedCost.toFixed(2)),
      sellPrice: finalSell,
      profit: Math.max(0, profit),
      displayCurrency: settings.display_currency,
      appliedRule: rule,
      matchedScope,
      formula: formulaDesc
    };
  }

  // --- Hidden Catalog Items Management ---
  public getHiddenItems(): HiddenItem[] {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM hidden_items ORDER BY type, value').all() as any[];
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      value: r.value,
      created_at: r.created_at
    }));
  }

  public addHiddenItem(type: 'country' | 'product', value: string): HiddenItem {
    const db = getDatabase();
    const id = crypto.randomUUID();
    const cleanVal = value.trim().toLowerCase();

    db.prepare(`
      INSERT OR IGNORE INTO hidden_items (id, type, value)
      VALUES (?, ?, ?)
    `).run(id, type, cleanVal);

    const row = db.prepare('SELECT * FROM hidden_items WHERE type = ? AND value = ?').get(type, cleanVal) as any;
    return {
      id: row.id,
      type: row.type,
      value: row.value,
      created_at: row.created_at
    };
  }

  public removeHiddenItem(id: string): boolean {
    const db = getDatabase();
    const res = db.prepare('DELETE FROM hidden_items WHERE id = ?').run(id);
    return res.changes > 0;
  }

  public isItemHidden(type: 'country' | 'product', value: string): boolean {
    if (!value) return false;
    const db = getDatabase();
    const row = db.prepare('SELECT id FROM hidden_items WHERE type = ? AND value = ?').get(type, value.trim().toLowerCase());
    return !!row;
  }

  private mapMarginRule(r: any): MarginRule {
    return {
      id: r.id,
      scope: r.scope as MarginScope,
      country: r.country || null,
      product: r.product || null,
      operator: r.operator || null,
      type: r.type as MarginType,
      percent_value: Number(r.percent_value || 0),
      fixed_value: Number(r.fixed_value || 0),
      enabled: r.enabled === 1 || r.enabled === true,
      created_at: r.created_at,
      updated_at: r.updated_at
    };
  }
}
