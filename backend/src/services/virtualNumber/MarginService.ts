import crypto from 'crypto';
import { getDatabase } from '../../db/database.js';
import { CurrencyService } from './CurrencyService.js';

export type MarginScope = 'global' | 'provider' | 'country' | 'product' | 'country_product' | 'country_product_operator';
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
  min_price: number;
  max_price: number;
  custom_override_price: number;
  description?: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface PricingSettings {
  id: string;
  provider_currency: string;
  provider_currency_to_usd_rate: number;
  fx_rate: number;
  min_margin: number;
  min_sell_price: number;
  rounding_mode: RoundingMode;
  low_balance_threshold: number;
  display_currency: string;
  ban_refund_policy: 'auto' | 'manual';
  auto_refund_on_ban: number;
  sync_interval_seconds: number;
  updated_at: string;
}

export interface HiddenItem {
  id: string;
  type: 'country' | 'product';
  value: string;
  created_at: string;
}

export interface CalculatedPrice {
  rawProviderCost: number;
  providerCostUsd: number;
  finalPriceUsd: number;
  marginUsd: number;
  sellPrice: number; // In user's active currency
  costPrice: number; // In user's active currency
  profit: number; // In user's active currency
  displayCurrency: string;
  displaySymbol: string;
  exchangeRate: number; // USD to target currency rate
  appliedRule: MarginRule | null;
  matchedScope: MarginScope | 'fallback';
  formula: string;
}

export interface MarginAuditLogRecord {
  id: string;
  admin_user_id: string;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  before_state?: any;
  after_state?: any;
  undone: boolean;
  created_at: string;
}

export class MarginService {
  private static instance: MarginService | null = null;
  private cacheInvalidationCallbacks: Array<() => void> = [];

  public static getInstance(): MarginService {
    if (!MarginService.instance) {
      MarginService.instance = new MarginService();
    }
    return MarginService.instance;
  }

  public registerCacheInvalidation(callback: () => void): void {
    this.cacheInvalidationCallbacks.push(callback);
  }

  private invalidateCache(): void {
    for (const cb of this.cacheInvalidationCallbacks) {
      try {
        cb();
      } catch {}
    }
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
        provider_currency: 'USD',
        provider_currency_to_usd_rate: 1.0,
        fx_rate: 1.0,
        min_margin: 0.0,
        min_sell_price: 0.0,
        rounding_mode: '2_decimals',
        low_balance_threshold: 50.0,
        display_currency: 'USD',
        ban_refund_policy: 'auto',
        auto_refund_on_ban: 1,
        sync_interval_seconds: 60,
        updated_at: new Date().toISOString()
      };
    }

    return {
      id: row.id,
      provider_currency: row.provider_currency || 'USD',
      provider_currency_to_usd_rate: Number(row.provider_currency_to_usd_rate || 1.0),
      fx_rate: Number(row.fx_rate || 1.0),
      min_margin: Number(row.min_margin || 0.0),
      min_sell_price: Number(row.min_sell_price || 0.0),
      rounding_mode: (row.rounding_mode || '2_decimals') as RoundingMode,
      low_balance_threshold: Number(row.low_balance_threshold || 50.0),
      display_currency: row.display_currency || 'USD',
      ban_refund_policy: (row.ban_refund_policy || 'auto') as 'auto' | 'manual',
      auto_refund_on_ban: row.auto_refund_on_ban !== undefined ? Number(row.auto_refund_on_ban) : 1,
      sync_interval_seconds: Number(row.sync_interval_seconds || 60),
      updated_at: row.updated_at || new Date().toISOString()
    };
  }

  /**
   * Updates global pricing settings (Admin)
   */
  public updatePricingSettings(
    data: Partial<Omit<PricingSettings, 'id' | 'updated_at'>>,
    adminUserId: string = 'system'
  ): PricingSettings {
    const db = getDatabase();
    const current = this.getPricingSettings();

    const provider_currency = data.provider_currency || current.provider_currency;
    const provider_currency_to_usd_rate = data.provider_currency_to_usd_rate !== undefined
      ? Number(data.provider_currency_to_usd_rate)
      : current.provider_currency_to_usd_rate;
    const fx_rate = data.fx_rate !== undefined ? Number(data.fx_rate) : current.fx_rate;
    const min_margin = data.min_margin !== undefined ? Number(data.min_margin) : current.min_margin;
    const min_sell_price = data.min_sell_price !== undefined ? Number(data.min_sell_price) : current.min_sell_price;
    const rounding_mode = data.rounding_mode || current.rounding_mode;
    const low_balance_threshold = data.low_balance_threshold !== undefined
      ? Number(data.low_balance_threshold)
      : current.low_balance_threshold;
    const display_currency = data.display_currency || current.display_currency;
    const ban_refund_policy = data.ban_refund_policy || current.ban_refund_policy;
    const auto_refund_on_ban = data.auto_refund_on_ban !== undefined
      ? (data.auto_refund_on_ban ? 1 : 0)
      : current.auto_refund_on_ban;
    const sync_interval_seconds = data.sync_interval_seconds !== undefined
      ? Number(data.sync_interval_seconds)
      : current.sync_interval_seconds;

    db.prepare(`
      UPDATE pricing_settings
      SET provider_currency = ?, provider_currency_to_usd_rate = ?, fx_rate = ?,
          min_margin = ?, min_sell_price = ?, rounding_mode = ?, low_balance_threshold = ?,
          display_currency = ?, ban_refund_policy = ?, auto_refund_on_ban = ?,
          sync_interval_seconds = ?, updated_at = datetime('now')
      WHERE id = 'default'
    `).run(
      provider_currency,
      provider_currency_to_usd_rate,
      fx_rate,
      min_margin,
      min_sell_price,
      rounding_mode,
      low_balance_threshold,
      display_currency,
      ban_refund_policy,
      auto_refund_on_ban,
      sync_interval_seconds
    );

    const updated = this.getPricingSettings();
    this.recordAuditLog(adminUserId, 'update_settings', 'pricing_settings', 'default', current, updated);
    this.invalidateCache();
    return updated;
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
      "WHEN 'country' THEN 3 " +
      "WHEN 'product' THEN 4 " +
      "WHEN 'provider' THEN 5 " +
      "WHEN 'global' THEN 6 ELSE 7 END, created_at DESC";

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
  public createMarginRule(
    data: {
      scope: MarginScope;
      country?: string | null;
      product?: string | null;
      operator?: string | null;
      type: MarginType;
      percent_value?: number;
      fixed_value?: number;
      min_price?: number;
      max_price?: number;
      custom_override_price?: number;
      description?: string | null;
      enabled?: boolean;
    },
    adminUserId: string = 'system'
  ): MarginRule {
    const db = getDatabase();
    const id = crypto.randomUUID();
    const country = data.country ? data.country.trim().toLowerCase() : null;
    const product = data.product ? data.product.trim().toLowerCase() : null;
    const operator = data.operator ? data.operator.trim().toLowerCase() : null;
    const percent_value = Number(data.percent_value || 0.0);
    const fixed_value = Number(data.fixed_value || 0.0);
    const min_price = Number(data.min_price || 0.0);
    const max_price = Number(data.max_price || 0.0);
    const custom_override_price = Number(data.custom_override_price || 0.0);
    const description = data.description || null;
    const enabled = data.enabled !== false ? 1 : 0;

    db.prepare(`
      INSERT INTO margin_rules (
        id, scope, country, product, operator, type, percent_value, fixed_value,
        min_price, max_price, custom_override_price, description, enabled, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      id,
      data.scope,
      country,
      product,
      operator,
      data.type,
      percent_value,
      fixed_value,
      min_price,
      max_price,
      custom_override_price,
      description,
      enabled
    );

    const created = this.getMarginRuleById(id)!;
    this.recordAuditLog(adminUserId, 'create_rule', 'margin_rules', id, null, created);
    this.invalidateCache();
    return created;
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
      min_price?: number;
      max_price?: number;
      custom_override_price?: number;
      description?: string | null;
      enabled?: boolean;
    },
    adminUserId: string = 'system'
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
    const min_price = data.min_price !== undefined ? Number(data.min_price) : current.min_price;
    const max_price = data.max_price !== undefined ? Number(data.max_price) : current.max_price;
    const custom_override_price = data.custom_override_price !== undefined ? Number(data.custom_override_price) : current.custom_override_price;
    const description = data.description !== undefined ? data.description : current.description;
    const enabled = data.enabled !== undefined ? (data.enabled ? 1 : 0) : (current.enabled ? 1 : 0);

    db.prepare(`
      UPDATE margin_rules
      SET scope = ?, country = ?, product = ?, operator = ?, type = ?, percent_value = ?, fixed_value = ?,
          min_price = ?, max_price = ?, custom_override_price = ?, description = ?, enabled = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      scope,
      country,
      product,
      operator,
      type,
      percent_value,
      fixed_value,
      min_price,
      max_price,
      custom_override_price,
      description,
      enabled,
      id
    );

    const updated = this.getMarginRuleById(id)!;
    this.recordAuditLog(adminUserId, 'update_rule', 'margin_rules', id, current, updated);
    this.invalidateCache();
    return updated;
  }

  /**
   * Delete a margin rule
   */
  public deleteMarginRule(id: string, adminUserId: string = 'system'): boolean {
    const current = this.getMarginRuleById(id);
    if (!current) return false;

    const db = getDatabase();
    const res = db.prepare('DELETE FROM margin_rules WHERE id = ?').run(id);
    if (res.changes > 0) {
      this.recordAuditLog(adminUserId, 'delete_rule', 'margin_rules', id, current, null);
      this.invalidateCache();
      return true;
    }
    return false;
  }

  /**
   * Bulk update rules (enable/disable, mass percentage update)
   */
  public bulkUpdateRules(
    ruleIds: string[],
    updates: {
      enabled?: boolean;
      percent_delta?: number;
      fixed_delta?: number;
    },
    adminUserId: string = 'system'
  ): { updatedCount: number } {
    if (!ruleIds || ruleIds.length === 0) return { updatedCount: 0 };

    const db = getDatabase();
    const beforeRules = ruleIds.map((id) => this.getMarginRuleById(id)).filter(Boolean);

    const tx = db.transaction(() => {
      for (const id of ruleIds) {
        if (updates.enabled !== undefined) {
          db.prepare('UPDATE margin_rules SET enabled = ?, updated_at = datetime(\'now\') WHERE id = ?').run(
            updates.enabled ? 1 : 0,
            id
          );
        }
        if (updates.percent_delta !== undefined && updates.percent_delta !== 0) {
          db.prepare('UPDATE margin_rules SET percent_value = MAX(0, percent_value + ?), updated_at = datetime(\'now\') WHERE id = ?').run(
            Number(updates.percent_delta),
            id
          );
        }
        if (updates.fixed_delta !== undefined && updates.fixed_delta !== 0) {
          db.prepare('UPDATE margin_rules SET fixed_value = MAX(0, fixed_value + ?), updated_at = datetime(\'now\') WHERE id = ?').run(
            Number(updates.fixed_delta),
            id
          );
        }
      }
    });

    tx();
    const afterRules = ruleIds.map((id) => this.getMarginRuleById(id)).filter(Boolean);
    this.recordAuditLog(adminUserId, 'bulk_update', 'margin_rules', ruleIds.join(','), beforeRules, afterRules);
    this.invalidateCache();
    return { updatedCount: afterRules.length };
  }

  /**
   * Central Precedence Resolution Algorithm (STEP 3 Specification)
   * Priority:
   * 1. country_product_operator (Country + Product + Operator specific)
   * 2. country_product (Country + Product override)
   * 3. country (Country override)
   * 4. product (Product override)
   * 5. provider (Provider default e.g. 5sim)
   * 6. global (Global default margin)
   */
  public resolveMarginRule(country?: string, product?: string, operator?: string): MarginRule | null {
    const db = getDatabase();
    const c = country ? country.trim().toLowerCase() : null;
    const p = product ? product.trim().toLowerCase() : null;
    const o = operator && operator !== 'any' ? operator.trim().toLowerCase() : null;

    // 1. Level 1: Country + Product + Operator
    if (c && p && o) {
      const row = db.prepare(`
        SELECT * FROM margin_rules
        WHERE scope = 'country_product_operator' AND country = ? AND product = ? AND operator = ? AND enabled = 1
        LIMIT 1
      `).get(c, p, o) as any;
      if (row) return this.mapMarginRule(row);
    }

    // 2. Level 2: Country + Product
    if (c && p) {
      const row = db.prepare(`
        SELECT * FROM margin_rules
        WHERE scope = 'country_product' AND country = ? AND product = ? AND enabled = 1
        LIMIT 1
      `).get(c, p) as any;
      if (row) return this.mapMarginRule(row);
    }

    // 3. Level 3: Country
    if (c) {
      const row = db.prepare(`
        SELECT * FROM margin_rules
        WHERE scope = 'country' AND country = ? AND enabled = 1
        LIMIT 1
      `).get(c) as any;
      if (row) return this.mapMarginRule(row);
    }

    // 4. Level 4: Product
    if (p) {
      const row = db.prepare(`
        SELECT * FROM margin_rules
        WHERE scope = 'product' AND product = ? AND enabled = 1
        LIMIT 1
      `).get(p) as any;
      if (row) return this.mapMarginRule(row);
    }

    // 5. Level 5: Provider Default
    const providerRow = db.prepare(`
      SELECT * FROM margin_rules
      WHERE scope = 'provider' AND enabled = 1
      LIMIT 1
    `).get() as any;
    if (providerRow) return this.mapMarginRule(providerRow);

    // 6. Level 6: Global Default
    const globalRow = db.prepare(`
      SELECT * FROM margin_rules
      WHERE scope = 'global' AND enabled = 1
      LIMIT 1
    `).get() as any;
    if (globalRow) return this.mapMarginRule(globalRow);

    return null;
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
        const integerPart = Math.floor(amount);
        const rounded = integerPart + 0.99;
        return rounded < amount ? Math.ceil(amount) + 0.99 : rounded;
      }
      default:
        return Number(amount.toFixed(2));
    }
  }

  public roundSellPrice(amount: number, mode: RoundingMode): number {
    return this.applyRounding(amount, mode);
  }

  /**
   * Central Pricing Pipeline:
   * 1. provider_cost_usd = raw_provider_cost * provider_currency_to_usd_rate
   * 2. rule = resolveMarginRule(country, product, operator)
   * 3. margin = percentage / fixed / both
   * 4. final_usd = round(max(min_price, provider_cost_usd + margin))
   * 5. user_price = final_usd * target_currency_rate
   */
  public calculateSellPrice(
    rawProviderCost: number,
    country?: string,
    product?: string,
    operator?: string,
    targetCurrency?: string
  ): CalculatedPrice {
    const settings = this.getPricingSettings();
    const currencyService = CurrencyService.getInstance();
    const rawCost = Math.max(0, Number(rawProviderCost || 0));

    // Step 0: Convert provider raw cost to sovereign USD base
    const providerCostUsd = currencyService.convertProviderToUsd(rawCost);

    // Step 3: Resolve matching rule by strict priority
    const rule = this.resolveMarginRule(country, product, operator);
    const matchedScope: MarginScope | 'fallback' = rule ? rule.scope : 'fallback';

    let finalUsd: number;
    let marginUsd: number;
    let formulaDesc = '';

    if (rule?.custom_override_price && rule.custom_override_price > 0) {
      finalUsd = rule.custom_override_price;
      marginUsd = Number((finalUsd - providerCostUsd).toFixed(4));
      formulaDesc = `custom_override_price ($${rule.custom_override_price.toFixed(2)})`;
    } else {
      let margin = 0;
      if (rule) {
        if (rule.type === 'percent') {
          margin = providerCostUsd * (rule.percent_value / 100);
          formulaDesc = `cost ($${providerCostUsd.toFixed(2)}) + ${rule.percent_value}%`;
        } else if (rule.type === 'fixed') {
          margin = rule.fixed_value;
          formulaDesc = `cost ($${providerCostUsd.toFixed(2)}) + $${rule.fixed_value.toFixed(2)}`;
        } else if (rule.type === 'percent_plus_fixed') {
          margin = providerCostUsd * (rule.percent_value / 100) + rule.fixed_value;
          formulaDesc = `cost ($${providerCostUsd.toFixed(2)}) + ${rule.percent_value}% + $${rule.fixed_value.toFixed(2)}`;
        }
      } else {
        formulaDesc = `cost ($${providerCostUsd.toFixed(2)}) (no margin)`;
      }

      marginUsd = margin;
      finalUsd = providerCostUsd + margin;

      // Floor 1: minimum profit margin in USD
      if (settings.min_margin > 0 && finalUsd < providerCostUsd + settings.min_margin) {
        finalUsd = providerCostUsd + settings.min_margin;
        marginUsd = settings.min_margin;
        formulaDesc += ` → floor min_margin (+$${settings.min_margin})`;
      }

      // Floor 2: minimum sell price in USD (from rule or global)
      const minPrice = Math.max(rule?.min_price || 0, settings.min_sell_price || 0);
      if (minPrice > 0 && finalUsd < minPrice) {
        finalUsd = minPrice;
        marginUsd = Number((finalUsd - providerCostUsd).toFixed(4));
        formulaDesc += ` → floor min_sell_price ($${minPrice})`;
      }

      // Ceiling: max sell price in USD
      if (rule?.max_price && rule.max_price > 0 && finalUsd > rule.max_price) {
        finalUsd = rule.max_price;
        marginUsd = Number((finalUsd - providerCostUsd).toFixed(4));
        formulaDesc += ` → capped max_price ($${rule.max_price})`;
      }

      // Rounding in USD
      finalUsd = this.applyRounding(finalUsd, settings.rounding_mode);
    }

    // Step 4: Multi-currency conversion from sovereign USD base
    const chosenCurrency = (targetCurrency || settings.display_currency || 'USD').toUpperCase();
    const currConv = currencyService.convertUsdToCurrency(finalUsd, chosenCurrency);
    const costConv = currencyService.convertUsdToCurrency(providerCostUsd, chosenCurrency);
    const profitConv = Number(Math.max(0, currConv.amount - costConv.amount).toFixed(2));

    return {
      rawProviderCost: rawCost,
      providerCostUsd,
      finalPriceUsd: finalUsd,
      marginUsd,
      sellPrice: currConv.amount,
      costPrice: costConv.amount,
      profit: profitConv,
      displayCurrency: currConv.currency,
      displaySymbol: currConv.symbol,
      exchangeRate: currConv.rate,
      appliedRule: rule,
      matchedScope,
      formula: formulaDesc
    };
  }

  /**
   * Live preview calculator tool (Provider cost -> Final USD -> 3 currencies)
   */
  public calculatePreview(
    rawProviderCost: number,
    country?: string,
    product?: string,
    operator?: string,
    previewCurrencies: string[] = ['USD', 'INR', 'EUR']
  ): {
    rawProviderCost: number;
    providerCurrency: string;
    providerCostUsd: number;
    finalPriceUsd: number;
    marginUsd: number;
    appliedRule: MarginRule | null;
    matchedScope: string;
    formula: string;
    previews: Array<{
      currency: string;
      symbol: string;
      rate: number;
      sellPrice: number;
      costPrice: number;
      profit: number;
      formattedSell: string;
    }>;
  } {
    const settings = this.getPricingSettings();
    const baseCalc = this.calculateSellPrice(rawProviderCost, country, product, operator, 'USD');
    const currencyService = CurrencyService.getInstance();

    const previews = previewCurrencies.map((c) => {
      const calc = this.calculateSellPrice(rawProviderCost, country, product, operator, c);
      return {
        currency: calc.displayCurrency,
        symbol: calc.displaySymbol,
        rate: calc.exchangeRate,
        sellPrice: calc.sellPrice,
        costPrice: calc.costPrice,
        profit: calc.profit,
        formattedSell: currencyService.formatPrice(calc.sellPrice, calc.displayCurrency)
      };
    });

    return {
      rawProviderCost: baseCalc.rawProviderCost,
      providerCurrency: settings.provider_currency,
      providerCostUsd: baseCalc.providerCostUsd,
      finalPriceUsd: baseCalc.finalPriceUsd,
      marginUsd: baseCalc.marginUsd,
      appliedRule: baseCalc.appliedRule,
      matchedScope: baseCalc.matchedScope,
      formula: baseCalc.formula,
      previews
    };
  }

  /**
   * Export all margin rules to CSV format
   */
  public exportRulesCsv(): string {
    const rules = this.getMarginRules();
    const headers = [
      'id',
      'scope',
      'country',
      'product',
      'operator',
      'type',
      'percent_value',
      'fixed_value',
      'min_price',
      'max_price',
      'custom_override_price',
      'enabled',
      'description'
    ];

    const lines = [headers.join(',')];
    for (const r of rules) {
      const row = [
        `"${r.id}"`,
        `"${r.scope}"`,
        `"${r.country || ''}"`,
        `"${r.product || ''}"`,
        `"${r.operator || ''}"`,
        `"${r.type}"`,
        r.percent_value,
        r.fixed_value,
        r.min_price,
        r.max_price,
        r.custom_override_price,
        r.enabled ? '1' : '0',
        `"${(r.description || '').replace(/"/g, '""')}"`
      ];
      lines.push(row.join(','));
    }

    return lines.join('\n');
  }

  /**
   * Import rules from CSV with validation and audit logging
   */
  public importRulesCsv(csvContent: string, adminUserId: string = 'system'): { imported: number; errors: string[] } {
    const lines = csvContent.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length < 2) {
      return { imported: 0, errors: ['CSV content is empty or missing data rows.'] };
    }

    const errors: string[] = [];
    const validRows: any[] = [];

    // Parse header
    const headers = lines[0].split(',').map((h) => h.replace(/^"|"$/g, '').trim().toLowerCase());
    const scopeIdx = headers.indexOf('scope');
    const typeIdx = headers.indexOf('type');

    if (scopeIdx === -1 || typeIdx === -1) {
      return { imported: 0, errors: ['Required columns "scope" and "type" are missing from CSV header.'] };
    }

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      // Simple regex CSV splitter supporting quoted strings
      const parts = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || line.split(',');
      const cleanParts = parts.map((p) => p.replace(/^"|"$/g, '').replace(/""/g, '"').trim());

      const getVal = (col: string): string => {
        const idx = headers.indexOf(col);
        return idx !== -1 && cleanParts[idx] !== undefined ? cleanParts[idx] : '';
      };

      const scope = getVal('scope') as MarginScope;
      const type = getVal('type') as MarginType;

      if (!['global', 'provider', 'country', 'product', 'country_product', 'country_product_operator'].includes(scope)) {
        errors.push(`Line ${i + 1}: Invalid scope "${scope}".`);
        continue;
      }

      if (!['percent', 'fixed', 'percent_plus_fixed'].includes(type)) {
        errors.push(`Line ${i + 1}: Invalid margin type "${type}".`);
        continue;
      }

      validRows.push({
        id: getVal('id') || crypto.randomUUID(),
        scope,
        country: getVal('country') || null,
        product: getVal('product') || null,
        operator: getVal('operator') || null,
        type,
        percent_value: Number(getVal('percent_value') || 0),
        fixed_value: Number(getVal('fixed_value') || 0),
        min_price: Number(getVal('min_price') || 0),
        max_price: Number(getVal('max_price') || 0),
        custom_override_price: Number(getVal('custom_override_price') || 0),
        enabled: getVal('enabled') !== '0',
        description: getVal('description') || null
      });
    }

    if (validRows.length > 0) {
      const db = getDatabase();
      const tx = db.transaction(() => {
        const insertStmt = db.prepare(`
          INSERT INTO margin_rules (
            id, scope, country, product, operator, type, percent_value, fixed_value,
            min_price, max_price, custom_override_price, description, enabled, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET
            scope = excluded.scope,
            country = excluded.country,
            product = excluded.product,
            operator = excluded.operator,
            type = excluded.type,
            percent_value = excluded.percent_value,
            fixed_value = excluded.fixed_value,
            min_price = excluded.min_price,
            max_price = excluded.max_price,
            custom_override_price = excluded.custom_override_price,
            description = excluded.description,
            enabled = excluded.enabled,
            updated_at = datetime('now')
        `);

        for (const r of validRows) {
          insertStmt.run(
            r.id,
            r.scope,
            r.country ? r.country.toLowerCase() : null,
            r.product ? r.product.toLowerCase() : null,
            r.operator ? r.operator.toLowerCase() : null,
            r.type,
            r.percent_value,
            r.fixed_value,
            r.min_price,
            r.max_price,
            r.custom_override_price,
            r.description,
            r.enabled ? 1 : 0
          );
        }
      });

      tx();
      this.recordAuditLog(adminUserId, 'import_rules', 'margin_rules', null, null, { importedCount: validRows.length });
      this.invalidateCache();
    }

    return { imported: validRows.length, errors };
  }

  /**
   * Reset margin rules to default baseline (Admin)
   */
  public resetDefaultRules(adminUserId: string = 'system'): void {
    const db = getDatabase();
    const currentRules = this.getMarginRules();

    const tx = db.transaction(() => {
      db.prepare('DELETE FROM margin_rules').run();
      db.prepare(`
        INSERT INTO margin_rules (
          id, scope, country, product, operator, type, percent_value, fixed_value, min_price, max_price, enabled
        ) VALUES ('default_global_margin', 'global', NULL, NULL, NULL, 'percent', 25.0, 0.0, 0.0, 0.0, 1)
      `).run();
    });

    tx();
    this.recordAuditLog(adminUserId, 'reset_rules', 'margin_rules', 'all', currentRules, [{ id: 'default_global_margin', scope: 'global', percent_value: 25 }]);
    this.invalidateCache();
  }

  // --- Audit Logging & Undo ---

  private recordAuditLog(
    adminUserId: string,
    action: string,
    entityType: string,
    entityId: string | null,
    beforeState: any,
    afterState: any
  ): void {
    try {
      const db = getDatabase();
      db.prepare(`
        INSERT INTO margin_audit_logs (id, admin_user_id, action, entity_type, entity_id, before_state, after_state, undone, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))
      `).run(
        crypto.randomUUID(),
        adminUserId,
        action,
        entityType,
        entityId || null,
        beforeState ? JSON.stringify(beforeState) : null,
        afterState ? JSON.stringify(afterState) : null
      );
    } catch (err) {
      console.error('[MarginService] Failed to record audit log:', err);
    }
  }

  public getAuditLogs(limit: number = 50): MarginAuditLogRecord[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM margin_audit_logs
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit) as any[];

    return rows.map((r) => ({
      id: r.id,
      admin_user_id: r.admin_user_id,
      action: r.action,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      before_state: r.before_state ? JSON.parse(r.before_state) : null,
      after_state: r.after_state ? JSON.parse(r.after_state) : null,
      undone: Boolean(r.undone),
      created_at: r.created_at
    }));
  }

  public undoAuditLog(logId: string, adminUserId: string = 'system'): { success: boolean; message: string } {
    const db = getDatabase();
    const log = db.prepare('SELECT * FROM margin_audit_logs WHERE id = ?').get(logId) as any;
    if (!log) {
      throw new Error('Audit log entry not found.');
    }
    if (log.undone) {
      throw new Error('This action has already been undone.');
    }

    const before = log.before_state ? JSON.parse(log.before_state) : null;
    const after = log.after_state ? JSON.parse(log.after_state) : null;
    const action = log.action;

    const tx = db.transaction(() => {
      if (action === 'create_rule' && log.entity_id) {
        db.prepare('DELETE FROM margin_rules WHERE id = ?').run(log.entity_id);
      } else if (action === 'delete_rule' && before) {
        db.prepare(`
          INSERT INTO margin_rules (
            id, scope, country, product, operator, type, percent_value, fixed_value, min_price, max_price, custom_override_price, description, enabled
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          before.id,
          before.scope,
          before.country,
          before.product,
          before.operator,
          before.type,
          before.percent_value,
          before.fixed_value,
          before.min_price || 0,
          before.max_price || 0,
          before.custom_override_price || 0,
          before.description || null,
          before.enabled ? 1 : 0
        );
      } else if (action === 'update_rule' && before && log.entity_id) {
        db.prepare(`
          UPDATE margin_rules
          SET scope = ?, country = ?, product = ?, operator = ?, type = ?, percent_value = ?, fixed_value = ?,
              min_price = ?, max_price = ?, custom_override_price = ?, description = ?, enabled = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(
          before.scope,
          before.country,
          before.product,
          before.operator,
          before.type,
          before.percent_value,
          before.fixed_value,
          before.min_price || 0,
          before.max_price || 0,
          before.custom_override_price || 0,
          before.description || null,
          before.enabled ? 1 : 0,
          log.entity_id
        );
      } else if (action === 'update_settings' && before) {
        db.prepare(`
          UPDATE pricing_settings
          SET provider_currency = ?, provider_currency_to_usd_rate = ?, fx_rate = ?,
              min_margin = ?, min_sell_price = ?, rounding_mode = ?, low_balance_threshold = ?,
              display_currency = ?, ban_refund_policy = ?, auto_refund_on_ban = ?, updated_at = datetime('now')
          WHERE id = 'default'
        `).run(
          before.provider_currency,
          before.provider_currency_to_usd_rate,
          before.fx_rate,
          before.min_margin,
          before.min_sell_price,
          before.rounding_mode,
          before.low_balance_threshold,
          before.display_currency,
          before.ban_refund_policy,
          before.auto_refund_on_ban
        );
      }

      db.prepare('UPDATE margin_audit_logs SET undone = 1 WHERE id = ?').run(logId);
    });

    tx();
    this.recordAuditLog(adminUserId, 'undo', log.entity_type, log.entity_id, after, before);
    this.invalidateCache();

    return { success: true, message: `Successfully reversed action "${action}".` };
  }

  // --- Hidden Items Management ---

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

    this.invalidateCache();
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
    if (res.changes > 0) {
      this.invalidateCache();
      return true;
    }
    return false;
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
      min_price: Number(r.min_price || 0),
      max_price: Number(r.max_price || 0),
      custom_override_price: Number(r.custom_override_price || 0),
      description: r.description || null,
      enabled: r.enabled === 1 || r.enabled === true,
      created_at: r.created_at,
      updated_at: r.updated_at
    };
  }
}
