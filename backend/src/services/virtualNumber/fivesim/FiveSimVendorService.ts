import { getDatabase } from '../../../db/database.js';
import { FiveSimConfigService } from './FiveSimConfigService.js';
import {
  FiveSimVendorStats,
  FiveSimVendorWallets,
  FiveSimOrdersResponse,
  FiveSimPaymentsResponse,
  FiveSimVendorWithdrawParams,
  FiveSimVendorPricesResponse,
  FiveSimVendorPricesQueryParams,
  CreateVendorPriceParams,
  UpdateVendorPriceParams,
  ToggleVendorPriceParams,
  FiveSimVendorPriceItem
} from './types.js';

export class FiveSimVendorService {
  private static instance: FiveSimVendorService | null = null;
  private configService: FiveSimConfigService;

  private constructor() {
    this.configService = FiveSimConfigService.getInstance();
  }

  public static getInstance(): FiveSimVendorService {
    if (!FiveSimVendorService.instance) {
      FiveSimVendorService.instance = new FiveSimVendorService();
    }
    return FiveSimVendorService.instance;
  }

  private get client() {
    return this.configService.getClient();
  }

  // =========================================================================
  // 8.1 & 8.2: VENDOR STATS & WALLETS RESERVE
  // =========================================================================

  /**
   * 8.1 Vendor statistics and identity
   */
  public async getVendorStats(): Promise<FiveSimVendorStats> {
    return this.client.getVendorStats();
  }

  /**
   * 8.2 Payment wallets reserve
   */
  public async getVendorWallets(): Promise<FiveSimVendorWallets> {
    return this.client.getVendorWallets();
  }

  // =========================================================================
  // 8.3 & 8.4: VENDOR ORDERS & PAYMENTS LEDGER
  // =========================================================================

  /**
   * 8.3 Vendor orders list
   */
  public async getVendorOrders(params: {
    category: 'activation' | 'hosting';
    limit?: number;
    offset?: number;
    order?: string;
    reverse?: boolean;
  }): Promise<FiveSimOrdersResponse> {
    return this.client.getVendorOrders(params);
  }

  /**
   * 8.4 Vendor payments history
   */
  public async getVendorPayments(params?: {
    limit?: number;
    offset?: number;
    order?: string;
    reverse?: boolean;
  }): Promise<FiveSimPaymentsResponse> {
    return this.client.getVendorPayments(params);
  }

  // =========================================================================
  // 8.5: WITHDRAWALS & PAYOUTS
  // =========================================================================

  /**
   * 8.5 Create payout withdrawal request
   */
  public async requestWithdraw(params: FiveSimVendorWithdrawParams): Promise<{ success: boolean; data?: any }> {
    if (!params.receiver || !params.method || !params.amount || !params.fee) {
      throw new Error('receiver, method, amount, and fee are all required for withdrawal.');
    }

    const result = await this.client.requestVendorWithdraw(params);

    // Persist payout record to database
    try {
      const db = getDatabase();
      db.prepare(`
        INSERT INTO fivesim_vendor_payouts (receiver, method, amount, fee, status, tx_id, created_at)
        VALUES (?, ?, ?, ?, 'COMPLETED', ?, datetime('now'))
      `).run(
        params.receiver,
        params.method,
        Number(params.amount),
        params.fee,
        result?.data?.id ? String(result.data.id) : `tx_${Date.now()}`
      );
    } catch (err) {
      console.warn('[FiveSimVendorService] Failed to record payout in DB:', err);
    }

    return result;
  }

  public getCachedPayouts(limit = 50): any[] {
    try {
      const db = getDatabase();
      return db.prepare('SELECT * FROM fivesim_vendor_payouts ORDER BY created_at DESC LIMIT ?').all(limit);
    } catch {
      return [];
    }
  }

  // =========================================================================
  // 8.6 - 8.9: VENDOR PRICES CRUD & SYNCHRONIZATION
  // =========================================================================

  /**
   * 8.6 Retrieve vendor prices with DB caching
   */
  public async fetchVendorPrices(params?: FiveSimVendorPricesQueryParams): Promise<FiveSimVendorPricesResponse> {
    const live = await this.client.getVendorPrices(params);

    if (live && Array.isArray(live.Prices)) {
      this.syncPricesToDb(live.Prices);
    }

    return live;
  }

  public getCachedVendorPrices(filter?: {
    product?: string;
    country?: string;
    operator?: string;
    enabled?: boolean;
    limit?: number;
    offset?: number;
  }): { total: number; rows: FiveSimVendorPriceItem[] } {
    try {
      const db = getDatabase();
      const conditions: string[] = [];
      const queryParams: any[] = [];

      if (filter?.product) {
        conditions.push('product_name = ?');
        queryParams.push(filter.product);
      }
      if (filter?.country) {
        conditions.push('country_name = ?');
        queryParams.push(filter.country);
      }
      if (filter?.operator) {
        conditions.push('operator_name = ?');
        queryParams.push(filter.operator);
      }
      if (filter?.enabled !== undefined) {
        conditions.push('enabled = ?');
        queryParams.push(filter.enabled ? 1 : 0);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const countRow = db.prepare(`SELECT COUNT(*) as count FROM fivesim_vendor_prices ${whereClause}`).get(...queryParams) as { count: number };
      const total = countRow?.count || 0;

      const limit = filter?.limit || 50;
      const offset = filter?.offset || 0;

      const rows = db.prepare(`
        SELECT * FROM fivesim_vendor_prices
        ${whereClause}
        ORDER BY updated_at DESC
        LIMIT ? OFFSET ?
      `).all(...queryParams, limit, offset) as any[];

      const formatted: FiveSimVendorPriceItem[] = rows.map((r) => ({
        ID: r.id,
        CountryName: r.country_name,
        ProductName: r.product_name,
        OperatorName: r.operator_name,
        Price: r.price,
        Count: r.count,
        Rate: r.rate,
        Hours: r.hours,
        Enabled: r.enabled === 1,
        AutoDisabled: r.auto_disabled === 1,
        DeletedAt: undefined
      }));

      return { total, rows: formatted };
    } catch {
      return { total: 0, rows: [] };
    }
  }

  /**
   * 8.7 Create Vendor Price
   */
  public async createVendorPrice(params: CreateVendorPriceParams): Promise<{ success: boolean; data?: any }> {
    const res = await this.client.createVendorPrice(params);

    try {
      const db = getDatabase();
      const id = res?.data?.id || Math.floor(Date.now() / 1000);
      db.prepare(`
        INSERT INTO fivesim_vendor_prices (
          id, country_name, product_name, operator_name, price, enabled, updated_at
        ) VALUES (?, ?, ?, ?, ?, 1, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          price = excluded.price,
          updated_at = datetime('now')
      `).run(id, params.CountryName, params.ProductName, params.OperatorName, params.Price);
    } catch (err) {
      console.warn('[FiveSimVendorService] Error saving created price to DB:', err);
    }

    return res;
  }

  /**
   * 8.8 Change Vendor Price
   */
  public async updateVendorPrice(params: UpdateVendorPriceParams): Promise<{ success: boolean; data?: any }> {
    const res = await this.client.updateVendorPrice(params);

    try {
      const db = getDatabase();
      db.prepare(`
        UPDATE fivesim_vendor_prices
        SET price = ?, updated_at = datetime('now')
        WHERE product_name = ? AND country_name = ? AND operator_name = ?
      `).run(params.Price, params.Product, params.Country, params.Operator);
    } catch (err) {
      console.warn('[FiveSimVendorService] Error updating price in DB:', err);
    }

    return res;
  }

  /**
   * 8.9 Enable / Disable Vendor Price
   */
  public async toggleVendorPrices(params: ToggleVendorPriceParams): Promise<{ success: boolean; data?: any }> {
    const res = await this.client.toggleVendorPrice(params);

    try {
      const db = getDatabase();
      const newEnabled = params.Disable ? 0 : 1;

      if (params.List && params.List.length > 0) {
        const placeholders = params.List.map(() => '?').join(',');
        db.prepare(`
          UPDATE fivesim_vendor_prices
          SET enabled = ?, updated_at = datetime('now')
          WHERE id IN (${placeholders})
        `).run(newEnabled, ...params.List);
      } else {
        db.prepare(`
          UPDATE fivesim_vendor_prices
          SET enabled = ?, updated_at = datetime('now')
        `).run(newEnabled);
      }
    } catch (err) {
      console.warn('[FiveSimVendorService] Error toggling prices in DB:', err);
    }

    return res;
  }

  private syncPricesToDb(prices: FiveSimVendorPriceItem[]): void {
    try {
      const db = getDatabase();
      const stmt = db.prepare(`
        INSERT INTO fivesim_vendor_prices (
          id, country_name, product_name, operator_name, price, count,
          rate, hours, enabled, auto_disabled, raw_data, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          price = excluded.price,
          count = excluded.count,
          rate = excluded.rate,
          hours = excluded.hours,
          enabled = excluded.enabled,
          auto_disabled = excluded.auto_disabled,
          raw_data = excluded.raw_data,
          updated_at = datetime('now')
      `);

      const tx = db.transaction((items: FiveSimVendorPriceItem[]) => {
        for (const p of items) {
          stmt.run(
            p.ID,
            p.CountryName || '',
            p.ProductName || '',
            p.OperatorName || '',
            p.Price || 0,
            p.Count || 0,
            p.Rate || 0,
            p.Hours || 0,
            p.Enabled ? 1 : 0,
            p.AutoDisabled ? 1 : 0,
            JSON.stringify(p)
          );
        }
      });

      tx(prices);
    } catch (err) {
      console.error('[FiveSimVendorService] Sync prices to DB failed:', err);
    }
  }
}

