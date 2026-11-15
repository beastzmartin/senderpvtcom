import Database from 'better-sqlite3';
import { getDatabase } from '../../db/database.js';
import { WalletService } from '../walletService.js';
import crypto from 'crypto';

export interface CurrencyRecord {
  code: string;
  name: string;
  symbol: string;
  rate_from_5sim_base: number;
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
    return rows.map((r) => ({
      code: r.code,
      name: r.name,
      symbol: r.symbol,
      rate_from_5sim_base: Number(r.rate_from_5sim_base || 1.0),
      is_default: Number(r.is_default || 0),
      is_active: Number(r.is_active || 1),
      created_at: r.created_at,
      updated_at: r.updated_at
    }));
  }

  /**
   * Get single currency by code
   */
  public getCurrency(code: string): CurrencyRecord | null {
    if (!code) return null;
    const row = this.db.prepare('SELECT * FROM currency_rates WHERE UPPER(code) = UPPER(?)').get(code.trim()) as any;
    if (!row) return null;

    return {
      code: row.code,
      name: row.name,
      symbol: row.symbol,
      rate_from_5sim_base: Number(row.rate_from_5sim_base || 1.0),
      is_default: Number(row.is_default || 0),
      is_active: Number(row.is_active || 1),
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  /**
   * Get the system default currency
   */
  public getDefaultCurrency(): CurrencyRecord {
    const defaultRow = this.db.prepare('SELECT * FROM currency_rates WHERE is_default = 1 AND is_active = 1').get() as any;
    if (defaultRow) {
      return {
        code: defaultRow.code,
        name: defaultRow.name,
        symbol: defaultRow.symbol,
        rate_from_5sim_base: Number(defaultRow.rate_from_5sim_base || 1.0),
        is_default: 1,
        is_active: 1
      };
    }

    const inrRow = this.getCurrency('INR');
    if (inrRow) return inrRow;

    return {
      code: 'INR',
      name: 'Indian Rupee',
      symbol: '₹',
      rate_from_5sim_base: 1.05,
      is_default: 1,
      is_active: 1
    };
  }

  /**
   * Convert 5SIM base cost (in RUB) to target currency
   */
  public convertFrom5SimBase(costInRub: number, targetCurrency?: string): {
    amount: number;
    rate: number;
    currency: string;
    symbol: string;
  } {
    const code = (targetCurrency || 'INR').toUpperCase();
    const curr = this.getCurrency(code) || this.getDefaultCurrency();
    const rate = curr.rate_from_5sim_base || 1.0;
    const amount = Number((costInRub * rate).toFixed(4));

    return {
      amount,
      rate,
      currency: curr.code,
      symbol: curr.symbol
    };
  }

  /**
   * Convert between any two currencies via 5SIM base exchange rates
   */
  public convertBetween(amount: number, fromCurrency: string, toCurrency: string): number {
    if (fromCurrency.toUpperCase() === toCurrency.toUpperCase()) {
      return amount;
    }

    const fromCurr = this.getCurrency(fromCurrency) || this.getDefaultCurrency();
    const toCurr = this.getCurrency(toCurrency) || this.getDefaultCurrency();

    // fromAmount / fromRate = amount in 5SIM base RUB
    const inRub = amount / fromCurr.rate_from_5sim_base;
    // inRub * toRate = amount in toCurrency
    const converted = inRub * toCurr.rate_from_5sim_base;

    return Number(converted.toFixed(2));
  }

  /**
   * Add or register a new currency (Admin)
   */
  public saveCurrency(data: {
    code: string;
    name: string;
    symbol: string;
    rate_from_5sim_base: number;
    is_default?: boolean;
    is_active?: boolean;
  }): CurrencyRecord {
    const code = data.code.trim().toUpperCase();
    if (!code || code.length < 2 || code.length > 5) {
      throw new Error('Currency code must be 2 to 5 characters (e.g. USD, EUR, INR).');
    }

    if (data.rate_from_5sim_base <= 0) {
      throw new Error('Currency exchange rate must be strictly greater than 0.');
    }

    const isDefault = data.is_default ? 1 : 0;
    const isActive = data.is_active !== false ? 1 : 0;

    const tx = this.db.transaction(() => {
      if (isDefault) {
        this.db.prepare('UPDATE currency_rates SET is_default = 0').run();
      }

      this.db.prepare(`
        INSERT INTO currency_rates (code, name, symbol, rate_from_5sim_base, is_default, is_active, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(code) DO UPDATE SET
          name = excluded.name,
          symbol = excluded.symbol,
          rate_from_5sim_base = excluded.rate_from_5sim_base,
          is_default = excluded.is_default,
          is_active = excluded.is_active,
          updated_at = datetime('now')
      `).run(code, data.name.trim(), data.symbol.trim(), data.rate_from_5sim_base, isDefault, isActive);
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
      rate_from_5sim_base: number;
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
    const rate = updates.rate_from_5sim_base !== undefined ? Number(updates.rate_from_5sim_base) : current.rate_from_5sim_base;
    const isDefault = updates.is_default !== undefined ? (updates.is_default ? 1 : 0) : current.is_default;
    const isActive = updates.is_active !== undefined ? (updates.is_active ? 1 : 0) : current.is_active;

    if (rate <= 0) {
      throw new Error('Exchange rate must be greater than 0.');
    }

    const tx = this.db.transaction(() => {
      if (isDefault) {
        this.db.prepare('UPDATE currency_rates SET is_default = 0').run();
      }

      this.db.prepare(`
        UPDATE currency_rates
        SET name = ?, symbol = ?, rate_from_5sim_base = ?, is_default = ?, is_active = ?, updated_at = datetime('now')
        WHERE code = ?
      `).run(name, symbol, rate, isDefault, isActive, current.code);
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
    const oldCurrency = (wallet.currency || 'INR').toUpperCase();
    const defaultCurr = this.getDefaultCurrency();
    const baseCurrency = (wallet.base_currency || defaultCurr.code).toUpperCase();

    // Ensure base balance is accurately initialized
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

    // High-precision conversion:
    // If switching to base currency (INR), exactly restore the sovereign base balance! Zero degradation!
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
      // 1. Update wallet table
      this.db.prepare(`
        UPDATE user_wallets
        SET balance = ?, base_balance = ?, base_currency = ?, reserved_balance = ?, total_spent = ?, total_topped_up = ?, currency = ?, updated_at = datetime('now')
        WHERE user_id = ?
      `).run(newBalance, baseBalance, baseCurrency, newReserved, newSpent, newToppedUp, targetCode, userId);

      // 2. Update user profile preference
      this.db.prepare(`
        UPDATE users
        SET preferred_currency = ?
        WHERE id = ?
      `).run(targetCode, userId);

      // 3. Insert transaction log for audit trail
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
}
