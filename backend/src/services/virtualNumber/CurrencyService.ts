import Database from 'better-sqlite3';
import { getDatabase } from '../../db/database.js';
import { WalletService } from '../walletService.js';
import crypto from 'crypto';

export interface CurrencyRecord {
  code: string;
  name: string;
  symbol: string;
  rate_from_usd: number;
  rate_from_5sim_base: number;
  manual_override: number;
  is_default: number;
  is_active: number;
  created_at?: string;
  updated_at?: string;
}

export class CurrencyService {
  private static instance: CurrencyService;
  private db: Database.Database;
  private walletService: WalletService;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
    this.walletService = WalletService.getInstance();
  }

  public static getInstance(db?: Database.Database): CurrencyService {
    if (!CurrencyService.instance) {
      CurrencyService.instance = new CurrencyService(db);
    }
    return CurrencyService.instance;
  }

  /**
   * List all currencies (optionally filter active only)
   */
  public getAllCurrencies(activeOnly: boolean = false): CurrencyRecord[] {
    const query = activeOnly
      ? 'SELECT * FROM currency_rates WHERE is_active = 1 ORDER BY is_default DESC, code ASC'
      : 'SELECT * FROM currency_rates ORDER BY is_default DESC, code ASC';

    const rows = this.db.prepare(query).all() as any[];
    return rows.map((r) => this.mapCurrencyRow(r));
  }

  /**
   * Get single currency by code
   */
  public getCurrency(code: string): CurrencyRecord | null {
    if (!code) return null;
    const row = this.db.prepare('SELECT * FROM currency_rates WHERE UPPER(code) = UPPER(?)').get(code.trim()) as any;
    if (!row) return null;
    return this.mapCurrencyRow(row);
  }

  /**
   * Get the system default currency
   */
  public getDefaultCurrency(): CurrencyRecord {
    const defaultRow = this.db.prepare('SELECT * FROM currency_rates WHERE is_default = 1 AND is_active = 1').get() as any;
    if (defaultRow) {
      return this.mapCurrencyRow(defaultRow);
    }

    const usdRow = this.getCurrency('USD');
    if (usdRow) return usdRow;

    return {
      code: 'USD',
      name: 'US Dollar',
      symbol: '$',
      rate_from_usd: 1.0,
      rate_from_5sim_base: 1.0,
      manual_override: 0,
      is_default: 1,
      is_active: 1
    };
  }

  /**
   * Convert Provider Currency cost to sovereign USD base (STEP 0 requirement)
   * All provider values are converted to USD ONCE on the server.
   */
  public convertProviderToUsd(providerCost: number): number {
    const settings = this.db.prepare("SELECT provider_currency, provider_currency_to_usd_rate FROM pricing_settings WHERE id = 'default'").get() as any;
    const rate = Number(settings?.provider_currency_to_usd_rate || 1.0);
    const cost = Math.max(0, Number(providerCost || 0));
    return Number((cost * rate).toFixed(4));
  }

  /**
   * Convert USD base amount to target currency for display or wallet deduction (STEP 4)
   * final_user_price = final_usd * user_rate
   */
  public convertUsdToCurrency(usdAmount: number, targetCurrency?: string): {
    amount: number;
    rate: number;
    currency: string;
    symbol: string;
  } {
    const code = (targetCurrency || 'USD').toUpperCase();
    const curr = this.getCurrency(code) || this.getDefaultCurrency();
    const rate = curr.rate_from_usd || 1.0;
    const amount = Number((usdAmount * rate).toFixed(4));

    return {
      amount,
      rate,
      currency: curr.code,
      symbol: curr.symbol
    };
  }

  /**
   * Backward-compatible conversion from 5SIM base (USD/RUB)
   */
  public convertFrom5SimBase(cost: number, targetCurrency?: string): {
    amount: number;
    rate: number;
    currency: string;
    symbol: string;
  } {
    const usd = this.convertProviderToUsd(cost);
    return this.convertUsdToCurrency(usd, targetCurrency);
  }

  /**
   * Convert between any two currencies via USD base
   */
  public convertBetween(amount: number, fromCurrency: string, toCurrency: string): number {
    if (!amount) return 0;
    if (fromCurrency.toUpperCase() === toCurrency.toUpperCase()) {
      return amount;
    }

    const fromCurr = this.getCurrency(fromCurrency) || this.getDefaultCurrency();
    const toCurr = this.getCurrency(toCurrency) || this.getDefaultCurrency();

    const fromRate = fromCurr.rate_from_usd || fromCurr.rate_from_5sim_base || 1.0;
    const toRate = toCurr.rate_from_usd || toCurr.rate_from_5sim_base || 1.0;

    // amount / fromRate = amount in USD
    const inUsd = amount / fromRate;
    // inUsd * toRate = amount in target currency
    const converted = inUsd * toRate;

    return Number(converted.toFixed(2));
  }

  /**
   * Format price using Intl.NumberFormat per currency code
   */
  public formatPrice(amount: number, currencyCode: string): string {
    const code = (currencyCode || 'USD').toUpperCase();
    try {
      const formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: code,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
      return formatter.format(amount);
    } catch {
      const curr = this.getCurrency(code);
      const symbol = curr?.symbol || '$';
      return `${symbol}${amount.toFixed(2)}`;
    }
  }

  /**
   * Add or register a new currency (Admin)
   */
  public saveCurrency(data: {
    code: string;
    name: string;
    symbol: string;
    rate_from_usd: number;
    rate_from_5sim_base?: number;
    manual_override?: boolean;
    is_default?: boolean;
    is_active?: boolean;
  }): CurrencyRecord {
    const code = data.code.trim().toUpperCase();
    if (!code || code.length < 2 || code.length > 5) {
      throw new Error('Currency code must be 2 to 5 characters (e.g. USD, EUR, INR).');
    }

    const rate = Number(data.rate_from_usd || data.rate_from_5sim_base || 1.0);
    if (rate <= 0) {
      throw new Error('Currency exchange rate must be strictly greater than 0.');
    }

    const isDefault = data.is_default ? 1 : 0;
    const isActive = data.is_active !== false ? 1 : 0;
    const manualOverride = data.manual_override ? 1 : 0;

    const tx = this.db.transaction(() => {
      if (isDefault) {
        this.db.prepare('UPDATE currency_rates SET is_default = 0').run();
      }

      this.db.prepare(`
        INSERT INTO currency_rates (code, name, symbol, rate_from_usd, rate_from_5sim_base, manual_override, is_default, is_active, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(code) DO UPDATE SET
          name = excluded.name,
          symbol = excluded.symbol,
          rate_from_usd = excluded.rate_from_usd,
          rate_from_5sim_base = excluded.rate_from_usd,
          manual_override = excluded.manual_override,
          is_default = excluded.is_default,
          is_active = excluded.is_active,
          updated_at = datetime('now')
      `).run(code, data.name.trim(), data.symbol.trim(), rate, rate, manualOverride, isDefault, isActive);
    });

    tx();
    return this.getCurrency(code)!;
  }

  /**
   * Update existing currency (Admin)
   */
  public updateCurrency(
    code: string,
    updates: Partial<{
      name: string;
      symbol: string;
      rate_from_usd: number;
      rate_from_5sim_base: number;
      manual_override: boolean;
      is_default: boolean;
      is_active: boolean;
    }>
  ): CurrencyRecord {
    const current = this.getCurrency(code);
    if (!current) {
      throw new Error(`Currency '${code}' not found.`);
    }

    const name = updates.name !== undefined ? updates.name.trim() : current.name;
    const symbol = updates.symbol !== undefined ? updates.symbol.trim() : current.symbol;
    const rate = updates.rate_from_usd !== undefined
      ? Number(updates.rate_from_usd)
      : (updates.rate_from_5sim_base !== undefined ? Number(updates.rate_from_5sim_base) : current.rate_from_usd);

    if (rate <= 0) {
      throw new Error('Exchange rate must be greater than 0.');
    }

    const isDefault = updates.is_default !== undefined ? (updates.is_default ? 1 : 0) : current.is_default;
    const isActive = updates.is_active !== undefined ? (updates.is_active ? 1 : 0) : current.is_active;
    const manualOverride = updates.manual_override !== undefined ? (updates.manual_override ? 1 : 0) : current.manual_override;

    const tx = this.db.transaction(() => {
      if (isDefault) {
        this.db.prepare('UPDATE currency_rates SET is_default = 0').run();
      }

      this.db.prepare(`
        UPDATE currency_rates
        SET name = ?, symbol = ?, rate_from_usd = ?, rate_from_5sim_base = ?, manual_override = ?, is_default = ?, is_active = ?, updated_at = datetime('now')
        WHERE code = ?
      `).run(name, symbol, rate, rate, manualOverride, isDefault, isActive, current.code);
    });

    tx();
    return this.getCurrency(current.code)!;
  }

  /**
   * Delete a currency (Admin) - cannot delete default currency
   */
  public deleteCurrency(code: string): boolean {
    const current = this.getCurrency(code);
    if (!current) return false;

    if (current.is_default === 1) {
      throw new Error('Cannot delete the primary default currency.');
    }

    this.db.prepare('DELETE FROM currency_rates WHERE code = ?').run(current.code);
    return true;
  }

  /**
   * Retrieve user's configured currency and current balance
   */
  public getUserCurrency(userId: string): {
    currency: string;
    symbol: string;
    balance: number;
  } {
    const wallet = this.walletService.getOrCreateWallet(userId);
    const currRecord = this.getCurrency(wallet.currency) || this.getDefaultCurrency();

    return {
      currency: currRecord.code,
      symbol: currRecord.symbol,
      balance: wallet.balance
    };
  }

  /**
   * Switch user's wallet and platform currency atomically, converting funds seamlessly
   */
  public switchUserCurrency(
    userId: string,
    targetCurrencyCode: string
  ): {
    success: boolean;
    oldCurrency: string;
    newCurrency: string;
    oldBalance: number;
    newBalance: number;
    rate: number;
  } {
    const targetCode = targetCurrencyCode.trim().toUpperCase();
    const targetCurr = this.getCurrency(targetCode);

    if (!targetCurr || !targetCurr.is_active) {
      throw new Error(`Target currency '${targetCode}' is not supported or currently inactive.`);
    }

    const wallet = this.walletService.getOrCreateWallet(userId);
    const oldCurrency = (wallet.currency || 'USD').toUpperCase();
    const defaultCurr = this.getDefaultCurrency();
    const baseCurrency = (wallet.base_currency || defaultCurr.code).toUpperCase();

    // Ensure base balance is initialized
    let baseBalance = Number(wallet.base_balance ?? wallet.balance);
    if (baseBalance <= 0 && wallet.balance > 0) {
      baseBalance = this.convertBetween(wallet.balance, oldCurrency, baseCurrency);
    }

    if (oldCurrency === targetCode) {
      return {
        success: true,
        oldCurrency,
        newCurrency: targetCode,
        oldBalance: wallet.balance,
        newBalance: wallet.balance,
        rate: 1.0
      };
    }

    // High-precision conversion via base currency
    let newBalance: number;
    if (targetCode === baseCurrency) {
      newBalance = Number(baseBalance.toFixed(2));
    } else {
      newBalance = this.convertBetween(baseBalance, baseCurrency, targetCode);
    }

    const directRate = this.convertBetween(1.0, oldCurrency, targetCode);
    const newReserved = this.convertBetween(wallet.reserved_balance, oldCurrency, targetCode);
    const newSpent = this.convertBetween(wallet.total_spent, oldCurrency, targetCode);
    const newToppedUp = this.convertBetween(wallet.total_topped_up, oldCurrency, targetCode);

    const switchTx = this.db.transaction(() => {
      this.db.prepare(`
        UPDATE user_wallets
        SET balance = ?, base_balance = ?, base_currency = ?, reserved_balance = ?, total_spent = ?, total_topped_up = ?, currency = ?, updated_at = datetime('now')
        WHERE user_id = ?
      `).run(newBalance, baseBalance, baseCurrency, newReserved, newSpent, newToppedUp, targetCode, userId);

      this.db.prepare(`
        UPDATE users
        SET preferred_currency = ?
        WHERE id = ?
      `).run(targetCode, userId);

      this.db.prepare(`
        INSERT INTO wallet_transactions (
          id, user_id, transaction_type, amount, currency, previous_balance, new_balance, description, status, metadata
        ) VALUES (
          ?, ?, 'admin_adjustment', ?, ?, ?, ?, ?, 'completed', ?
        )
      `).run(
        crypto.randomUUID(),
        userId,
        newBalance - wallet.balance,
        targetCode,
        wallet.balance,
        newBalance,
        `Switched currency from ${oldCurrency} to ${targetCode} (Base: ${baseCurrency} ${baseBalance.toFixed(2)})`,
        JSON.stringify({
          oldCurrency,
          newCurrency: targetCode,
          baseCurrency,
          baseBalance,
          newBalance,
          conversionRate: directRate
        })
      );
    });

    switchTx();

    return {
      success: true,
      oldCurrency,
      newCurrency: targetCode,
      oldBalance: wallet.balance,
      newBalance,
      rate: directRate
    };
  }

  private mapCurrencyRow(r: any): CurrencyRecord {
    const rateUsd = Number(r.rate_from_usd ?? r.rate_from_5sim_base ?? 1.0);
    return {
      code: r.code,
      name: r.name,
      symbol: r.symbol,
      rate_from_usd: rateUsd,
      rate_from_5sim_base: rateUsd,
      manual_override: Number(r.manual_override || 0),
      is_default: Number(r.is_default || 0),
      is_active: Number(r.is_active || 1),
      created_at: r.created_at,
      updated_at: r.updated_at
    };
  }
}
