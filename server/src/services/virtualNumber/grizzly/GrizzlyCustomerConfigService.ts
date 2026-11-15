import { getDatabase } from '../../../db/database.js';
import { GrizzlyCustomerApiClient, GrizzlyCustomerBalanceResult } from './GrizzlyCustomerApiClient.js';

export interface GrizzlyCustomerConfigData {
  id?: string;
  is_enabled: boolean | number;
  api_key?: string;
  base_url?: string;
  default_country?: string;
  min_price?: number;
  max_price?: number;
  included_provider_ids?: string;
  excluded_provider_ids?: string;
  default_phone_exceptions?: string;
  timeout_seconds?: number;
  markup_percentage?: number;
  fixed_fee?: number;
  customer_daily_limit?: number;
  pricing_endpoint?: string;
  price_sync_interval_minutes?: number;
  auto_price_sync?: boolean | number;
  reconciliation_interval_minutes?: number;
  auto_reconciliation?: boolean | number;
  preferred_providers?: string;
  min_profit?: number;
  max_acceptable_provider_cost?: number;
  currency_conversion_rate?: number;
  last_price_sync_at?: string;
  last_reconciliation_at?: string;
  cached_balance?: number;
  cached_balance_currency?: string;
  last_health_check_at?: string;
  last_error?: string;
}

export class GrizzlyCustomerConfigService {
  /**
   * Mask API key for secure frontend presentation
   */
  public static maskApiKey(key?: string): string {
    if (!key || key.length < 8) return '••••••••';
    return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
  }

  /**
   * Retrieve active Customer API configuration
   */
  public static getConfig(maskApiKey = true): GrizzlyCustomerConfigData {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM grizzly_customer_config WHERE id = ?').get('default') as any;

    if (!row) {
      return {
        id: 'default',
        is_enabled: 1,
        api_key: '',
        base_url: 'https://api.grizzlysms.com/stubs/handler_api.php',
        default_country: 'any',
        min_price: 0.0,
        max_price: 500.0,
        included_provider_ids: '',
        excluded_provider_ids: '',
        default_phone_exceptions: '',
        timeout_seconds: 15,
        markup_percentage: 25.0,
        fixed_fee: 5.0,
        customer_daily_limit: 50,
        cached_balance: 0.0,
        cached_balance_currency: 'RUB'
      };
    }

    return {
      ...row,
      is_enabled: row.is_enabled === 1 || row.is_enabled === true,
      api_key: maskApiKey ? this.maskApiKey(row.api_key) : (row.api_key || '')
    };
  }

  /**
   * Update Customer API configuration
   */
  public static updateConfig(data: Partial<GrizzlyCustomerConfigData>): GrizzlyCustomerConfigData {
    const db = getDatabase();
    const current = db.prepare('SELECT * FROM grizzly_customer_config WHERE id = ?').get('default') as any;

    let newApiKey = current?.api_key || '';
    // Only update API key if a real new key is provided (not the masked placeholder)
    if (data.api_key && !data.api_key.includes('••••')) {
      newApiKey = data.api_key.trim();
    }

    const isEnabled = data.is_enabled !== undefined ? (data.is_enabled ? 1 : 0) : (current?.is_enabled ?? 1);
    const baseUrl = data.base_url?.trim() || current?.base_url || 'https://api.grizzlysms.com/stubs/handler_api.php';
    const defaultCountry = data.default_country?.trim() || current?.default_country || 'any';
    const minPrice = data.min_price !== undefined ? Number(data.min_price) : (current?.min_price ?? 0.0);
    const maxPrice = data.max_price !== undefined ? Number(data.max_price) : (current?.max_price ?? 500.0);
    const includedProviderIds = data.included_provider_ids !== undefined ? data.included_provider_ids.trim() : (current?.included_provider_ids ?? '');
    const excludedProviderIds = data.excluded_provider_ids !== undefined ? data.excluded_provider_ids.trim() : (current?.excluded_provider_ids ?? '');
    const defaultPhoneExceptions = data.default_phone_exceptions !== undefined ? data.default_phone_exceptions.trim() : (current?.default_phone_exceptions ?? '');
    const timeoutSeconds = data.timeout_seconds !== undefined ? Number(data.timeout_seconds) : (current?.timeout_seconds ?? 15);
    const markupPercentage = data.markup_percentage !== undefined ? Number(data.markup_percentage) : (current?.markup_percentage ?? 25.0);
    const fixedFee = data.fixed_fee !== undefined ? Number(data.fixed_fee) : (current?.fixed_fee ?? 5.0);
    const customerDailyLimit = data.customer_daily_limit !== undefined ? Number(data.customer_daily_limit) : (current?.customer_daily_limit ?? 50);
    const pricingEndpoint = data.pricing_endpoint?.trim() || current?.pricing_endpoint || 'getPricesV3';
    const priceSyncInterval = data.price_sync_interval_minutes !== undefined ? Number(data.price_sync_interval_minutes) : (current?.price_sync_interval_minutes ?? 60);
    const autoPriceSync = data.auto_price_sync !== undefined ? (data.auto_price_sync ? 1 : 0) : (current?.auto_price_sync ?? 1);
    const reconciliationInterval = data.reconciliation_interval_minutes !== undefined ? Number(data.reconciliation_interval_minutes) : (current?.reconciliation_interval_minutes ?? 30);
    const autoReconciliation = data.auto_reconciliation !== undefined ? (data.auto_reconciliation ? 1 : 0) : (current?.auto_reconciliation ?? 1);
    const preferredProviders = data.preferred_providers !== undefined ? data.preferred_providers.trim() : (current?.preferred_providers ?? '');
    const minProfit = data.min_profit !== undefined ? Number(data.min_profit) : (current?.min_profit ?? 2.0);
    const maxAcceptableCost = data.max_acceptable_provider_cost !== undefined ? Number(data.max_acceptable_provider_cost) : (current?.max_acceptable_provider_cost ?? 100.0);
    const currencyConversionRate = data.currency_conversion_rate !== undefined ? Number(data.currency_conversion_rate) : (current?.currency_conversion_rate ?? 1.0);

    db.prepare(`
      INSERT INTO grizzly_customer_config (
        id, is_enabled, api_key, base_url, default_country, min_price, max_price,
        included_provider_ids, excluded_provider_ids, default_phone_exceptions,
        timeout_seconds, markup_percentage, fixed_fee, customer_daily_limit,
        pricing_endpoint, price_sync_interval_minutes, auto_price_sync,
        reconciliation_interval_minutes, auto_reconciliation, preferred_providers,
        min_profit, max_acceptable_provider_cost, currency_conversion_rate, updated_at
      ) VALUES (
        'default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now')
      )
      ON CONFLICT(id) DO UPDATE SET
        is_enabled = excluded.is_enabled,
        api_key = excluded.api_key,
        base_url = excluded.base_url,
        default_country = excluded.default_country,
        min_price = excluded.min_price,
        max_price = excluded.max_price,
        included_provider_ids = excluded.included_provider_ids,
        excluded_provider_ids = excluded.excluded_provider_ids,
        default_phone_exceptions = excluded.default_phone_exceptions,
        timeout_seconds = excluded.timeout_seconds,
        markup_percentage = excluded.markup_percentage,
        fixed_fee = excluded.fixed_fee,
        customer_daily_limit = excluded.customer_daily_limit,
        pricing_endpoint = excluded.pricing_endpoint,
        price_sync_interval_minutes = excluded.price_sync_interval_minutes,
        auto_price_sync = excluded.auto_price_sync,
        reconciliation_interval_minutes = excluded.reconciliation_interval_minutes,
        auto_reconciliation = excluded.auto_reconciliation,
        preferred_providers = excluded.preferred_providers,
        min_profit = excluded.min_profit,
        max_acceptable_provider_cost = excluded.max_acceptable_provider_cost,
        currency_conversion_rate = excluded.currency_conversion_rate,
        updated_at = datetime('now')
    `).run(
      isEnabled,
      newApiKey,
      baseUrl,
      defaultCountry,
      minPrice,
      maxPrice,
      includedProviderIds,
      excludedProviderIds,
      defaultPhoneExceptions,
      timeoutSeconds,
      markupPercentage,
      fixedFee,
      customerDailyLimit,
      pricingEndpoint,
      priceSyncInterval,
      autoPriceSync,
      reconciliationInterval,
      autoReconciliation,
      preferredProviders,
      minProfit,
      maxAcceptableCost,
      currencyConversionRate
    );

    return this.getConfig(true);
  }

  /**
   * SECTION 6: Test Connection using non-purchasing getBalance
   */
  public static async testConnection(apiKeyOverride?: string): Promise<GrizzlyCustomerBalanceResult> {
    const db = getDatabase();
    const config = db.prepare('SELECT * FROM grizzly_customer_config WHERE id = ?').get('default') as any;
    const keyToTest = apiKeyOverride && !apiKeyOverride.includes('••••') ? apiKeyOverride.trim() : config?.api_key;

    if (!keyToTest) {
      return {
        healthy: false,
        message: 'No API key provided or configured.'
      };
    }

    const result = await GrizzlyCustomerApiClient.getBalance({ apiKey: keyToTest, timeoutMs: 10000 });

    if (result.healthy && result.balance !== undefined) {
      db.prepare(`
        UPDATE grizzly_customer_config
        SET cached_balance = ?,
            cached_balance_currency = ?,
            last_health_check_at = datetime('now'),
            last_error = NULL,
            updated_at = datetime('now')
        WHERE id = 'default'
      `).run(result.balance, result.currency || 'RUB');
    } else {
      db.prepare(`
        UPDATE grizzly_customer_config
        SET last_health_check_at = datetime('now'),
            last_error = ?,
            updated_at = datetime('now')
        WHERE id = 'default'
      `).run(result.message || result.error || 'Health check failed');
    }

    return result;
  }

  /**
   * Fetch diagnostics logs
   */
  public static getLogs(limit: number = 100, offset: number = 0): { total: number; rows: any[] } {
    const db = getDatabase();
    const total = (db.prepare('SELECT COUNT(*) as c FROM grizzly_customer_api_logs').get() as any)?.c || 0;
    const rows = db.prepare(`
      SELECT * FROM grizzly_customer_api_logs
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as any[];

    return { total, rows };
  }

  /**
   * SECTION 7: Admin profit & customer activation reports
   */
  public static getActivationsReport(limit: number = 50, offset: number = 0): {
    total: number;
    totalRevenue: number;
    totalCost: number;
    totalProfit: number;
    rows: any[];
  } {
    const db = getDatabase();
    const total = (db.prepare('SELECT COUNT(*) as c FROM grizzly_customer_activations').get() as any)?.c || 0;
    const sums = db.prepare(`
      SELECT 
        SUM(customer_selling_price) as rev,
        SUM(provider_acquisition_cost) as cost,
        SUM(admin_profit) as profit
      FROM grizzly_customer_activations
      WHERE status IN ('NUMBER_ASSIGNED', 'WAITING_SMS', 'COMPLETED')
    `).get() as any;

    const rows = db.prepare(`
      SELECT * FROM grizzly_customer_activations
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as any[];

    return {
      total,
      totalRevenue: Number(sums?.rev || 0),
      totalCost: Number(sums?.cost || 0),
      totalProfit: Number(sums?.profit || 0),
      rows
    };
  }
}

