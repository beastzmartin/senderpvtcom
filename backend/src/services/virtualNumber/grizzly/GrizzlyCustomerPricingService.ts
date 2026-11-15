import crypto from 'crypto';
import { getDatabase } from '../../../db/database.js';
import {
  GrizzlyCustomerApiClient,
  GrizzlyPricesV1Result,
  GrizzlyPricesV2Result,
  GrizzlyPricesV3Result,
  GrizzlyProviderPriceInfo
} from './GrizzlyCustomerApiClient.js';
import { GrizzlyCustomerConfigService } from './GrizzlyCustomerConfigService.js';

export interface NormalizedPriceRecord {
  id: string;
  countryId: string;
  countryName?: string;
  serviceCode: string;
  serviceName?: string;
  pricingSource: 'getPrices' | 'getPricesV2' | 'getPricesV3';
  overallPrice: number;
  overallQuantity: number;
  tierPrices?: Record<string, number>;
  providers: GrizzlyProviderPriceInfo[];
  lowestProviderPrice: number;
  highestProviderPrice: number;
  rawResponse?: string;
  isStale: boolean;
  lastSyncedAt: string;
}

export interface ProviderComparisonItem {
  providerId: string;
  availableQuantity: number;
  priceOptions: number[];
  lowestPrice: number;
  highestPrice: number;
  country: string;
  service: string;
  lastUpdated: string;
}

export interface ProviderRule {
  id: string;
  scope: 'global' | 'country' | 'service' | 'country_service';
  countryId?: string | null;
  serviceCode?: string | null;
  allowedProviderIds?: string;
  excludedProviderIds?: string;
  preferredProviderId?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  markupPercentage?: number | null;
  fixedFee?: number | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export class GrizzlyCustomerPricingService {
  private static syncInProgress = false;

  /**
   * Synchronize prices using configured or specified endpoint (getPrices, getPricesV2, getPricesV3)
   */
  public static async syncPrices(options?: {
    endpoint?: 'getPrices' | 'getPricesV2' | 'getPricesV3';
    country?: string | number;
    service?: string;
  }): Promise<{
    success: boolean;
    endpoint: string;
    syncedCount: number;
    durationMs: number;
    error?: string;
  }> {
    if (this.syncInProgress) {
      return {
        success: false,
        endpoint: options?.endpoint || 'getPricesV3',
        syncedCount: 0,
        durationMs: 0,
        error: 'Price synchronization is already in progress. Please wait for the current run to finish.'
      };
    }

    this.syncInProgress = true;
    const startTime = Date.now();
    const db = getDatabase();
    const config = GrizzlyCustomerConfigService.getConfig(false);
    const targetEndpoint = options?.endpoint || config.pricing_endpoint || 'getPricesV3';

    try {
      let syncedCount = 0;
      const nowIso = new Date().toISOString();

      if (targetEndpoint === 'getPrices') {
        const result: GrizzlyPricesV1Result = await GrizzlyCustomerApiClient.getPrices({
          service: options?.service,
          country: options?.country,
          apiKey: config.api_key
        });

        if (!result.success) {
          throw new Error(result.error || 'Provider returned error during getPrices');
        }

        const insertStmt = db.prepare(`
          INSERT INTO grizzly_customer_prices (
            id, country_id, country_name, service_code, service_name,
            pricing_source, overall_price, overall_quantity, tier_prices,
            providers_data, lowest_provider_price, highest_provider_price,
            raw_response, is_stale, last_synced_at, updated_at
          ) VALUES (
            ?, ?, ?, ?, ?,
            'getPrices', ?, ?, NULL,
            '[]', ?, ?,
            ?, 0, ?, ?
          )
          ON CONFLICT(id) DO UPDATE SET
            overall_price = excluded.overall_price,
            overall_quantity = excluded.overall_quantity,
            lowest_provider_price = excluded.lowest_provider_price,
            highest_provider_price = excluded.highest_provider_price,
            raw_response = excluded.raw_response,
            pricing_source = 'getPrices',
            is_stale = 0,
            last_synced_at = excluded.last_synced_at,
            updated_at = excluded.updated_at
        `);

        for (const entry of result.entries) {
          const id = `${entry.country}_${entry.service}`;
          insertStmt.run(
            id,
            entry.country,
            `Country ${entry.country}`,
            entry.service,
            entry.service.toUpperCase(),
            entry.cost,
            entry.count,
            entry.cost,
            entry.cost,
            null,
            nowIso,
            nowIso
          );
          syncedCount++;
        }
      } else if (targetEndpoint === 'getPricesV2') {
        const result: GrizzlyPricesV2Result = await GrizzlyCustomerApiClient.getPricesV2({
          service: options?.service,
          country: options?.country,
          apiKey: config.api_key
        });

        if (!result.success) {
          throw new Error(result.error || 'Provider returned error during getPricesV2');
        }

        const insertStmt = db.prepare(`
          INSERT INTO grizzly_customer_prices (
            id, country_id, country_name, service_code, service_name,
            pricing_source, overall_price, overall_quantity, tier_prices,
            providers_data, lowest_provider_price, highest_provider_price,
            raw_response, is_stale, last_synced_at, updated_at
          ) VALUES (
            ?, ?, ?, ?, ?,
            'getPricesV2', ?, ?, ?,
            '[]', ?, ?,
            ?, 0, ?, ?
          )
          ON CONFLICT(id) DO UPDATE SET
            overall_price = excluded.overall_price,
            overall_quantity = excluded.overall_quantity,
            tier_prices = excluded.tier_prices,
            lowest_provider_price = excluded.lowest_provider_price,
            highest_provider_price = excluded.highest_provider_price,
            raw_response = excluded.raw_response,
            pricing_source = 'getPricesV2',
            is_stale = 0,
            last_synced_at = excluded.last_synced_at,
            updated_at = excluded.updated_at
        `);

        for (const countryKey of Object.keys(result.data)) {
          const serviceObj = result.data[countryKey];
          for (const serviceKey of Object.keys(serviceObj)) {
            const tiers = serviceObj[serviceKey];
            const id = `${countryKey}_${serviceKey}`;
            let totalQty = 0;
            const numericTiers: number[] = [];

            for (const [tierK, qty] of Object.entries(tiers)) {
              totalQty += qty;
              const numericPrice = parseFloat(tierK.replace(/[^0-9.]/g, ''));
              if (!isNaN(numericPrice) && numericPrice > 0) {
                numericTiers.push(numericPrice);
              }
            }

            const minPrice = numericTiers.length > 0 ? Math.min(...numericTiers) : 0;
            const maxPrice = numericTiers.length > 0 ? Math.max(...numericTiers) : 0;

            insertStmt.run(
              id,
              countryKey,
              `Country ${countryKey}`,
              serviceKey,
              serviceKey.toUpperCase(),
              minPrice,
              totalQty,
              JSON.stringify(tiers),
              minPrice,
              maxPrice,
              null,
              nowIso,
              nowIso
            );
            syncedCount++;
          }
        }
      } else {
        // Default: getPricesV3
        const result: GrizzlyPricesV3Result = await GrizzlyCustomerApiClient.getPricesV3({
          service: options?.service,
          country: options?.country,
          apiKey: config.api_key
        });

        if (!result.success) {
          throw new Error(result.error || 'Provider returned error during getPricesV3');
        }

        const insertStmt = db.prepare(`
          INSERT INTO grizzly_customer_prices (
            id, country_id, country_name, service_code, service_name,
            pricing_source, overall_price, overall_quantity, tier_prices,
            providers_data, lowest_provider_price, highest_provider_price,
            raw_response, is_stale, last_synced_at, updated_at
          ) VALUES (
            ?, ?, ?, ?, ?,
            'getPricesV3', ?, ?, NULL,
            ?, ?, ?,
            ?, 0, ?, ?
          )
          ON CONFLICT(id) DO UPDATE SET
            overall_price = excluded.overall_price,
            overall_quantity = excluded.overall_quantity,
            providers_data = excluded.providers_data,
            lowest_provider_price = excluded.lowest_provider_price,
            highest_provider_price = excluded.highest_provider_price,
            raw_response = excluded.raw_response,
            pricing_source = 'getPricesV3',
            is_stale = 0,
            last_synced_at = excluded.last_synced_at,
            updated_at = excluded.updated_at
        `);

        for (const countryKey of Object.keys(result.data)) {
          const serviceObj = result.data[countryKey];
          for (const serviceKey of Object.keys(serviceObj)) {
            const item = serviceObj[serviceKey];
            const id = `${countryKey}_${serviceKey}`;

            let lowestProv = item.price;
            let highestProv = item.price;

            if (item.normalizedProviders && item.normalizedProviders.length > 0) {
              const allLowest = item.normalizedProviders.map((p) => p.lowestPrice);
              const allHighest = item.normalizedProviders.map((p) => p.highestPrice);
              lowestProv = Math.min(...allLowest);
              highestProv = Math.max(...allHighest);
            }

            insertStmt.run(
              id,
              countryKey,
              `Country ${countryKey}`,
              serviceKey,
              serviceKey.toUpperCase(),
              item.price,
              item.count,
              JSON.stringify(item.normalizedProviders || []),
              lowestProv,
              highestProv,
              null,
              nowIso,
              nowIso
            );
            syncedCount++;
          }
        }
      }

      // Update config with last sync time
      db.prepare(`
        UPDATE grizzly_customer_config
        SET last_price_sync_at = datetime('now'),
            updated_at = datetime('now')
        WHERE id = 'default'
      `).run();

      const durationMs = Date.now() - startTime;
      return {
        success: true,
        endpoint: targetEndpoint,
        syncedCount,
        durationMs
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      return {
        success: false,
        endpoint: targetEndpoint,
        syncedCount: 0,
        durationMs,
        error: err.message || 'Unknown error during price synchronization'
      };
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * PHASE 4: Retrieve provider comparison data for a given country and service
   */
  public static getProviderComparison(countryId: string | number, serviceCode: string): {
    country: string;
    service: string;
    overallPrice: number;
    overallQuantity: number;
    pricingSource: string;
    isStale: boolean;
    lastSyncedAt: string | null;
    providers: ProviderComparisonItem[];
  } {
    const db = getDatabase();
    const cleanCountry = String(countryId || 'any').trim();
    const cleanService = (serviceCode || '').trim().toLowerCase();

    const record = db.prepare(`
      SELECT * FROM grizzly_customer_prices
      WHERE (country_id = ? OR ? = 'any') AND service_code = ?
      ORDER BY updated_at DESC
      LIMIT 1
    `).get(cleanCountry, cleanCountry, cleanService) as any;

    if (!record) {
      return {
        country: cleanCountry,
        service: cleanService,
        overallPrice: 0,
        overallQuantity: 0,
        pricingSource: 'none',
        isStale: true,
        lastSyncedAt: null,
        providers: []
      };
    }

    let parsedProviders: GrizzlyProviderPriceInfo[] = [];
    try {
      parsedProviders = JSON.parse(record.providers_data || '[]');
    } catch {}

    // Check staleness (stale if older than 60 minutes)
    const syncTime = new Date(record.last_synced_at).getTime();
    const isStale = (Date.now() - syncTime) > (60 * 60 * 1000);

    const providers: ProviderComparisonItem[] = parsedProviders
      .filter((p) => p.count > 0) // Never advertise unavailable stock
      .map((p) => ({
        providerId: String(p.providerId),
        availableQuantity: p.count,
        priceOptions: p.prices || [p.lowestPrice],
        lowestPrice: p.lowestPrice,
        highestPrice: p.highestPrice,
        country: cleanCountry,
        service: cleanService,
        lastUpdated: record.last_synced_at
      }));

    return {
      country: cleanCountry,
      service: cleanService,
      overallPrice: record.overall_price || 0,
      overallQuantity: record.overall_quantity || 0,
      pricingSource: record.pricing_source || 'getPricesV3',
      isStale,
      lastSyncedAt: record.last_synced_at,
      providers
    };
  }

  /**
   * PHASE 6: Calculate final customer-facing selling price using all fee layers
   * Formula: Provider Price * Conversion Rate * (1 + Markup% / 100) + Fixed Fee
   * Enforces: Minimum Profit, Price Caps, and Rule Overrides
   */
  public static calculateCustomerSellingPrice(params: {
    countryId?: string | number;
    serviceCode: string;
    providerId?: string;
    rawProviderPrice?: number;
  }): {
    providerAcquisitionCost: number;
    sellingPrice: number;
    adminProfit: number;
    currency: string;
    pricingSource: string;
    appliedRule?: string;
  } {
    const db = getDatabase();
    const config = GrizzlyCustomerConfigService.getConfig(true);
    const cleanCountry = String(params.countryId || 'any');
    const cleanService = (params.serviceCode || '').toLowerCase();

    // Check specific rule from grizzly_provider_rules
    const rule = this.resolveActiveRule(cleanCountry, cleanService);

    // Determine base acquisition cost
    let basePrice = params.rawProviderPrice;
    let pricingSource = 'estimated';

    if (basePrice === undefined || basePrice <= 0) {
      if (cleanCountry !== 'any') {
        const priceRow = db.prepare(`
          SELECT overall_price, lowest_provider_price, pricing_source
          FROM grizzly_customer_prices
          WHERE country_id = ? AND service_code = ?
          ORDER BY updated_at DESC
          LIMIT 1
        `).get(cleanCountry, cleanService) as any;

        if (priceRow && priceRow.overall_price > 0) {
          basePrice = priceRow.lowest_provider_price || priceRow.overall_price;
          pricingSource = priceRow.pricing_source || 'cached';
        }
      }

      if (basePrice === undefined || basePrice <= 0) {
        basePrice = 15.0; // fallback default
        if (['tg', 'wa'].includes(cleanService)) basePrice = 20.0;
        if (['vi', 'ig', 'fb'].includes(cleanService)) basePrice = 12.0;
      }
    }

    const finalBasePrice = (basePrice !== undefined && basePrice > 0) ? basePrice : 15.0;
    const conversionRate = config.currency_conversion_rate || 1.0;
    const convertedAcquisition = Math.max(0.1, Number((finalBasePrice * conversionRate).toFixed(2)));

    const markupPct = rule?.markupPercentage !== null && rule?.markupPercentage !== undefined
      ? rule.markupPercentage
      : (config.markup_percentage || 25.0);

    const fixedFee = rule?.fixedFee !== null && rule?.fixedFee !== undefined
      ? rule.fixedFee
      : (config.fixed_fee || 5.0);

    const minProfit = config.min_profit || 2.0;
    const maxCap = rule?.maxPrice !== null && rule?.maxPrice !== undefined
      ? rule.maxPrice
      : (config.max_price || 500.0);

    const markupAmount = (convertedAcquisition * markupPct) / 100;
    let sellingPrice = Math.ceil(convertedAcquisition + markupAmount + fixedFee);

    // Enforce Minimum Profit
    if ((sellingPrice - convertedAcquisition) < minProfit) {
      sellingPrice = Math.ceil(convertedAcquisition + minProfit);
    }

    // Enforce Maximum Cap
    if (sellingPrice > maxCap && maxCap > convertedAcquisition) {
      sellingPrice = maxCap;
    }

    const adminProfit = Number((sellingPrice - convertedAcquisition).toFixed(2));

    return {
      providerAcquisitionCost: convertedAcquisition,
      sellingPrice,
      adminProfit,
      currency: 'INR',
      pricingSource,
      appliedRule: rule ? `${rule.scope}:${rule.id}` : 'global'
    };
  }

  /**
   * Resolve best-matching provider rule for a given country and service
   */
  public static resolveActiveRule(countryId: string, serviceCode: string): ProviderRule | null {
    const db = getDatabase();
    // Precedence: country_service > service > country > global
    const row = db.prepare(`
      SELECT * FROM grizzly_provider_rules
      WHERE is_active = 1
        AND (
          (scope = 'country_service' AND country_id = ? AND service_code = ?)
          OR (scope = 'service' AND service_code = ?)
          OR (scope = 'country' AND country_id = ?)
          OR (scope = 'global')
        )
      ORDER BY CASE scope
        WHEN 'country_service' THEN 1
        WHEN 'service' THEN 2
        WHEN 'country' THEN 3
        WHEN 'global' THEN 4
        ELSE 5
      END ASC
      LIMIT 1
    `).get(countryId, serviceCode, serviceCode, countryId) as any;

    if (!row) return null;

    return {
      id: row.id,
      scope: row.scope,
      countryId: row.country_id,
      serviceCode: row.service_code,
      allowedProviderIds: row.allowed_provider_ids,
      excludedProviderIds: row.excluded_provider_ids,
      preferredProviderId: row.preferred_provider_id,
      minPrice: row.min_price,
      maxPrice: row.max_price,
      markupPercentage: row.markup_percentage,
      fixedFee: row.fixed_fee,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Get all provider rules
   */
  public static getProviderRules(): ProviderRule[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM grizzly_provider_rules
      ORDER BY scope ASC, created_at DESC
    `).all() as any[];

    return rows.map((r) => ({
      id: r.id,
      scope: r.scope,
      countryId: r.country_id,
      serviceCode: r.service_code,
      allowedProviderIds: r.allowed_provider_ids,
      excludedProviderIds: r.excluded_provider_ids,
      preferredProviderId: r.preferred_provider_id,
      minPrice: r.min_price,
      maxPrice: r.max_price,
      markupPercentage: r.markup_percentage,
      fixedFee: r.fixed_fee,
      isActive: Boolean(r.is_active),
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  }

  /**
   * Create or update provider rule
   */
  public static saveProviderRule(rule: Partial<ProviderRule>): { success: boolean; rule: ProviderRule } {
    const db = getDatabase();
    const id = rule.id || `rule_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const scope = rule.scope || 'global';
    const countryId = rule.countryId || null;
    const serviceCode = rule.serviceCode ? rule.serviceCode.trim().toLowerCase() : null;
    const allowed = rule.allowedProviderIds || null;
    const excluded = rule.excludedProviderIds || null;
    const preferred = rule.preferredProviderId || null;
    const minPrice = rule.minPrice !== undefined ? rule.minPrice : null;
    const maxPrice = rule.maxPrice !== undefined ? rule.maxPrice : null;
    const markup = rule.markupPercentage !== undefined ? rule.markupPercentage : null;
    const fee = rule.fixedFee !== undefined ? rule.fixedFee : null;
    const isActive = rule.isActive !== undefined ? (rule.isActive ? 1 : 0) : 1;

    db.prepare(`
      INSERT INTO grizzly_provider_rules (
        id, scope, country_id, service_code, allowed_provider_ids,
        excluded_provider_ids, preferred_provider_id, min_price, max_price,
        markup_percentage, fixed_fee, is_active, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, datetime('now'), datetime('now')
      )
      ON CONFLICT(id) DO UPDATE SET
        scope = excluded.scope,
        country_id = excluded.country_id,
        service_code = excluded.service_code,
        allowed_provider_ids = excluded.allowed_provider_ids,
        excluded_provider_ids = excluded.excluded_provider_ids,
        preferred_provider_id = excluded.preferred_provider_id,
        min_price = excluded.min_price,
        max_price = excluded.max_price,
        markup_percentage = excluded.markup_percentage,
        fixed_fee = excluded.fixed_fee,
        is_active = excluded.is_active,
        updated_at = datetime('now')
    `).run(
      id,
      scope,
      countryId,
      serviceCode,
      allowed,
      excluded,
      preferred,
      minPrice,
      maxPrice,
      markup,
      fee,
      isActive
    );

    const saved = db.prepare('SELECT * FROM grizzly_provider_rules WHERE id = ?').get(id) as any;
    return {
      success: true,
      rule: {
        id: saved.id,
        scope: saved.scope,
        countryId: saved.country_id,
        serviceCode: saved.service_code,
        allowedProviderIds: saved.allowed_provider_ids,
        excludedProviderIds: saved.excluded_provider_ids,
        preferredProviderId: saved.preferred_provider_id,
        minPrice: saved.min_price,
        maxPrice: saved.max_price,
        markupPercentage: saved.markup_percentage,
        fixedFee: saved.fixed_fee,
        isActive: Boolean(saved.is_active),
        createdAt: saved.created_at,
        updatedAt: saved.updated_at
      }
    };
  }

  /**
   * Delete provider rule
   */
  public static deleteProviderRule(id: string): boolean {
    const db = getDatabase();
    const res = db.prepare('DELETE FROM grizzly_provider_rules WHERE id = ?').run(id);
    return res.changes > 0;
  }

  /**
   * List cached prices with search and filters
   */
  public static getCachedPrices(filter?: {
    countryId?: string;
    serviceCode?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): { total: number; prices: any[] } {
    const db = getDatabase();
    const limit = filter?.limit || 50;
    const offset = filter?.offset || 0;

    let query = 'FROM grizzly_customer_prices WHERE 1=1';
    const params: any[] = [];

    if (filter?.countryId && filter.countryId !== 'all') {
      query += ' AND country_id = ?';
      params.push(filter.countryId);
    }
    if (filter?.serviceCode && filter.serviceCode !== 'all') {
      query += ' AND service_code = ?';
      params.push(filter.serviceCode.toLowerCase());
    }
    if (filter?.search) {
      query += ' AND (country_id LIKE ? OR service_code LIKE ?)';
      params.push(`%${filter.search}%`, `%${filter.search}%`);
    }

    const total = (db.prepare(`SELECT COUNT(*) as c ${query}`).get(...params) as any)?.c || 0;
    const rows = db.prepare(`SELECT * ${query} ORDER BY updated_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset) as any[];

    const now = Date.now();
    const formatted = rows.map((r) => {
      const syncTime = new Date(r.last_synced_at).getTime();
      const isStale = (now - syncTime) > (60 * 60 * 1000);
      let providers = [];
      try {
        providers = JSON.parse(r.providers_data || '[]');
      } catch {}

      return {
        ...r,
        is_stale: isStale ? 1 : 0,
        providers_count: providers.length
      };
    });

    return { total, prices: formatted };
  }
}
