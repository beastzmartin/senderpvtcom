import crypto from 'crypto';
import { getDatabase } from '../db/database.js';
import { getSocketIO } from '../socket/socketManager.js';
import { CurrencyMinorUnits } from './currency/CurrencyMinorUnits.js';

export type WalletTransactionType =
  | 'extension_activation'
  | 'module_activation'
  | 'usage_deduction'
  | 'usage_refund'
  | 'wallet_topup'
  | 'promotional_credit'
  | 'admin_adjustment'
  | 'usage_reservation'
  | 'reservation_release'
  | 'renewal_charge';

export interface WalletRecord {
  user_id: string;
  balance: number;
  currency: string;
  base_balance?: number;
  base_currency?: string;
  reserved_balance: number;
  available_balance: number;
  total_spent: number;
  total_topped_up: number;
  daily_spend_limit?: number;
  monthly_spend_limit?: number;
  per_job_spend_limit?: number;
  updated_at: string;
}

export interface WalletTransactionRecord {
  id: string;
  user_id: string;
  workspace_id?: string | null;
  extension_id?: string | null;
  module_id?: string | null;
  transaction_type: WalletTransactionType;
  amount: number;
  currency: string;
  previous_balance: number;
  new_balance: number;
  reference_id?: string | null;
  reference_type?: string | null;
  idempotency_key?: string | null;
  amount_minor_units?: number | null;
  exchange_rate?: number | null;
  description: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded' | 'reversed';
  metadata?: any;
  created_at: string;
}

export interface DebitOptions<T = any> {
  userId: string;
  amountMinorUnits: number; // Integer minor units (e.g. cents, paise)
  currency: string;         // e.g. 'USD', 'INR'
  reason: string;           // Clear audit description
  referenceType: string;    // e.g. 'crm_plan', 'crm_addon', 'crm_api', 'crm_enrichment', 'crm_renewal'
  referenceId: string;      // Related ID (workspaceId, subscriptionId, addonId, etc.)
  idempotencyKey?: string;  // Unique idempotency key
  metadata?: Record<string, any>;
  businessEffect?: (txRecord: WalletTransactionRecord) => Promise<T> | T;
}

export interface DebitResult<T = any> {
  success: boolean;
  transactionId: string;
  previousBalance: number;
  newBalance: number;
  amountCharged: number;
  amountMinorUnits: number;
  currency: string;
  idempotentReplay?: boolean;
  businessResult?: T;
}

export interface RefundOptions {
  userId: string;
  amountMinorUnits: number;
  currency: string;
  reason: string;
  referenceType: string;
  referenceId: string;
  idempotencyKey?: string;
  metadata?: Record<string, any>;
}

export class WalletService {
  private static instance: WalletService | null = null;

  public static getInstance(): WalletService {
    if (!WalletService.instance) {
      WalletService.instance = new WalletService();
    }
    return WalletService.instance;
  }

  /**
   * Safe currency conversion helper using currency_rates table
   */
  public convertAmount(amount: number, fromCurrency: string, toCurrency: string): number {
    if (!amount || fromCurrency.toUpperCase() === toCurrency.toUpperCase()) {
      return amount;
    }
    const db = getDatabase();
    const fromRow = db.prepare('SELECT rate_from_usd, rate_from_5sim_base FROM currency_rates WHERE UPPER(code) = ?').get(fromCurrency.toUpperCase()) as any;
    const toRow = db.prepare('SELECT rate_from_usd, rate_from_5sim_base FROM currency_rates WHERE UPPER(code) = ?').get(toCurrency.toUpperCase()) as any;
    const fromRate = Number(fromRow?.rate_from_usd ?? fromRow?.rate_from_5sim_base ?? 1.0);
    const toRate = Number(toRow?.rate_from_usd ?? toRow?.rate_from_5sim_base ?? 1.0);
    const inBase = amount / fromRate;
    return Number((inBase * toRate).toFixed(4));
  }

  /**
   * Get wallet for user or initialize with welcome credits
   */
  public getOrCreateWallet(userId: string): WalletRecord {
    const db = getDatabase();
    let row = db.prepare('SELECT * FROM user_wallets WHERE user_id = ?').get(userId) as any;

    if (!row) {
      const welcomeBonus = 250.0; // ₹250 free starter balance
      db.prepare(`
        INSERT INTO user_wallets (user_id, balance, currency, base_balance, base_currency, total_topped_up, updated_at)
        VALUES (?, ?, 'INR', ?, 'INR', ?, datetime('now'))
      `).run(userId, welcomeBonus, welcomeBonus, welcomeBonus);

      db.prepare(`
        INSERT INTO wallet_transactions (
          id, user_id, transaction_type, amount, currency, previous_balance, new_balance, description, status
        ) VALUES (
          ?, ?, 'promotional_credit', ?, 'INR', 0.0, ?, 'Welcome Promotional Balance for Extensions & Modules', 'completed'
        )
      `).run(crypto.randomUUID(), userId, welcomeBonus, welcomeBonus);

      row = db.prepare('SELECT * FROM user_wallets WHERE user_id = ?').get(userId);
    }

    const baseCurrency = (row.base_currency || 'INR').toUpperCase();
    let baseBalance = row.base_balance !== null && row.base_balance !== undefined ? Number(row.base_balance) : 0;
    if (baseBalance <= 0 && Number(row.balance || 0) > 0) {
      baseBalance = this.convertAmount(Number(row.balance), row.currency || 'INR', baseCurrency);
      db.prepare('UPDATE user_wallets SET base_balance = ?, base_currency = ? WHERE user_id = ?').run(
        baseBalance,
        baseCurrency,
        userId
      );
    }

    return {
      user_id: row.user_id,
      balance: Number(row.balance || 0),
      currency: row.currency || 'INR',
      base_balance: baseBalance,
      base_currency: baseCurrency,
      reserved_balance: Number(row.reserved_balance || 0),
      available_balance: Math.max(0, Number((Number(row.balance || 0) - Number(row.reserved_balance || 0)).toFixed(2))),
      total_spent: Number(row.total_spent || 0),
      total_topped_up: Number(row.total_topped_up || 0),
      daily_spend_limit: Number(row.daily_spend_limit || 0),
      monthly_spend_limit: Number(row.monthly_spend_limit || 0),
      per_job_spend_limit: Number(row.per_job_spend_limit || 0),
      updated_at: row.updated_at
    };
  }

  /**
   * Atomically top up user wallet balance
   */
  public topUp(
    userId: string,
    amount: number,
    description: string = 'Wallet Top-Up',
    referenceId?: string
  ): { success: boolean; newBalance: number; transactionId: string } {
    if (amount <= 0) {
      throw new Error('Top-up amount must be greater than zero.');
    }

    const db = getDatabase();
    const current = this.getOrCreateWallet(userId);
    const baseCurrency = current.base_currency || 'INR';
    const topUpInBase = this.convertAmount(amount, current.currency, baseCurrency);

    const newBaseBalance = Number(((current.base_balance || current.balance) + topUpInBase).toFixed(2));
    const newBalance = Number((current.balance + amount).toFixed(2));
    const newToppedUp = Number((current.total_topped_up + amount).toFixed(2));
    const txId = crypto.randomUUID();

    const topUpTx = db.transaction(() => {
      db.prepare(`
        UPDATE user_wallets
        SET balance = ?, base_balance = ?, total_topped_up = ?, updated_at = datetime('now')
        WHERE user_id = ?
      `).run(newBalance, newBaseBalance, newToppedUp, userId);

      db.prepare(`
        INSERT INTO wallet_transactions (
          id, user_id, transaction_type, amount, currency,
          previous_balance, new_balance, reference_id, description, status
        ) VALUES (
          ?, ?, 'wallet_topup', ?, ?,
          ?, ?, ?, ?, 'completed'
        )
      `).run(
        txId,
        userId,
        amount,
        current.currency,
        current.balance,
        newBalance,
        referenceId || null,
        description
      );
    });

    topUpTx();

    try {
      getSocketIO()?.to(`user:${userId}`).emit('wallet:updated', {
        balance: newBalance,
        currency: current.currency,
        change: amount,
        type: 'wallet_topup',
        txId
      });
    } catch {}

    return { success: true, newBalance, transactionId: txId };
  }

  /**
   * Atomically deduct funds from user wallet balance
   */
  public deduct(
    userId: string,
    amount: number,
    type: WalletTransactionType,
    description: string,
    meta?: {
      extensionId?: string;
      moduleId?: string;
      referenceId?: string;
      customData?: any;
    }
  ): { success: boolean; newBalance: number; transactionId: string } {
    if (amount <= 0) {
      // Free module or zero-charge transaction
      return { success: true, newBalance: this.getOrCreateWallet(userId).balance, transactionId: 'free_tx' };
    }

    const db = getDatabase();
    const current = this.getOrCreateWallet(userId);

    if (current.balance < amount) {
      const sym = current.currency === 'INR' ? '₹' : current.currency === 'USD' ? '$' : current.currency;
      throw new Error(
        `Insufficient wallet balance. Required: ${sym}${amount.toFixed(2)}, Available: ${sym}${current.balance.toFixed(2)}. Please top up your wallet to continue.`
      );
    }

    const baseCurrency = current.base_currency || 'INR';
    const deductInBase = this.convertAmount(amount, current.currency, baseCurrency);

    const newBaseBalance = Math.max(0, Number(((current.base_balance || current.balance) - deductInBase).toFixed(4)));
    const newBalance = Number((current.balance - amount).toFixed(2));
    const newSpent = Number((current.total_spent + amount).toFixed(2));
    const txId = crypto.randomUUID();

    const deductTx = db.transaction(() => {
      db.prepare(`
        UPDATE user_wallets
        SET balance = ?, base_balance = ?, total_spent = ?, updated_at = datetime('now')
        WHERE user_id = ?
      `).run(newBalance, newBaseBalance, newSpent, userId);

      db.prepare(`
        INSERT INTO wallet_transactions (
          id, user_id, extension_id, module_id, transaction_type,
          amount, currency, previous_balance, new_balance,
          reference_id, description, metadata, status
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, 'completed'
        )
      `).run(
        txId,
        userId,
        meta?.extensionId || null,
        meta?.moduleId || null,
        type,
        amount,
        current.currency,
        current.balance,
        newBalance,
        meta?.referenceId || null,
        description,
        meta?.customData ? JSON.stringify(meta.customData) : null
      );
    });

    deductTx();

    try {
      getSocketIO()?.to(`user:${userId}`).emit('wallet:updated', {
        balance: newBalance,
        currency: current.currency,
        change: -amount,
        type,
        txId,
        extensionId: meta?.extensionId,
        moduleId: meta?.moduleId
      });
    } catch {}

    return { success: true, newBalance, transactionId: txId };
  }

  /**
   * CANONICAL CHOKE POINT: Debit funds atomically from user wallet
   * Zero bypass paths, DB-level non-negative constraint, and idempotency protection
   */
  public async debit<T = any>(options: DebitOptions<T>): Promise<DebitResult<T>> {
    const {
      userId,
      amountMinorUnits,
      currency,
      reason,
      referenceType,
      referenceId,
      idempotencyKey,
      metadata,
      businessEffect
    } = options;

    if (!Number.isInteger(amountMinorUnits) || amountMinorUnits < 0) {
      throw new Error(`amountMinorUnits must be a non-negative integer. Received: ${amountMinorUnits}`);
    }

    const db = getDatabase();

    // 1. Check idempotency: Return existing transaction if already processed
    if (idempotencyKey) {
      const existingTx = db.prepare('SELECT * FROM wallet_transactions WHERE idempotency_key = ?').get(idempotencyKey) as any;
      if (existingTx && existingTx.status === 'completed') {
        return {
          success: true,
          transactionId: existingTx.id,
          previousBalance: Number(existingTx.previous_balance),
          newBalance: Number(existingTx.new_balance),
          amountCharged: Number(existingTx.amount),
          amountMinorUnits: Number(existingTx.amount_minor_units || 0),
          currency: existingTx.currency,
          idempotentReplay: true
        };
      }
    }

    // 2. Fetch current wallet
    const currentWallet = this.getOrCreateWallet(userId);
    const walletCurrency = currentWallet.currency || 'USD';

    // 3. Handle zero-charge transaction
    if (amountMinorUnits === 0) {
      const txId = `free_tx_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
      let businessResult: T | undefined = undefined;

      const dummyTxRecord: WalletTransactionRecord = {
        id: txId,
        user_id: userId,
        transaction_type: 'module_activation',
        amount: 0,
        currency: walletCurrency,
        previous_balance: currentWallet.balance,
        new_balance: currentWallet.balance,
        reference_id: referenceId,
        reference_type: referenceType,
        idempotency_key: idempotencyKey || null,
        amount_minor_units: 0,
        exchange_rate: 1.0,
        description: reason,
        status: 'completed',
        metadata,
        created_at: new Date().toISOString()
      };

      if (businessEffect) {
        businessResult = await businessEffect(dummyTxRecord);
      }

      return {
        success: true,
        transactionId: txId,
        previousBalance: currentWallet.balance,
        newBalance: currentWallet.balance,
        amountCharged: 0,
        amountMinorUnits: 0,
        currency: walletCurrency,
        businessResult
      };
    }

    // 4. Calculate amount in user's wallet currency
    const chargedHumanAmount = CurrencyMinorUnits.fromMinorUnits(amountMinorUnits, currency);

    let exchangeRate = 1.0;
    let walletMinorUnits = amountMinorUnits;
    let chargedAmountInWalletCurrency = chargedHumanAmount;

    if (currency.toUpperCase() !== walletCurrency.toUpperCase()) {
      exchangeRate = this.convertAmount(1.0, currency, walletCurrency);
      chargedAmountInWalletCurrency = this.convertAmount(chargedHumanAmount, currency, walletCurrency);
      walletMinorUnits = CurrencyMinorUnits.toMinorUnits(chargedAmountInWalletCurrency, walletCurrency);
    }

    const availableFloat = currentWallet.available_balance;
    const availableMinor = CurrencyMinorUnits.toMinorUnits(availableFloat, walletCurrency);

    // 5. Hard balance check: reject immediately if insufficient
    if (availableMinor < walletMinorUnits) {
      const shortfallMinor = walletMinorUnits - availableMinor;
      const sym = walletCurrency === 'INR' ? '₹' : walletCurrency === 'USD' ? '$' : walletCurrency + ' ';
      const reqStr = CurrencyMinorUnits.formatAmount(walletMinorUnits, walletCurrency);
      const availStr = CurrencyMinorUnits.formatAmount(availableMinor, walletCurrency);
      const shortStr = CurrencyMinorUnits.formatAmount(shortfallMinor, walletCurrency);

      const err: any = new Error(
        `Insufficient wallet balance. Required: ${sym}${reqStr}, Available: ${sym}${availStr}. Need ${sym}${shortStr} more. Please add funds to your wallet to continue.`
      );
      err.code = 'INSUFFICIENT_WALLET_BALANCE';
      err.required = CurrencyMinorUnits.fromMinorUnits(walletMinorUnits, walletCurrency);
      err.available = availableFloat;
      err.shortfall = CurrencyMinorUnits.fromMinorUnits(shortfallMinor, walletCurrency);
      err.currency = walletCurrency;
      throw err;
    }

    // 6. Execute atomic deduction inside database transaction with row serialization
    const txId = crypto.randomUUID();
    const finalChargedFloat = CurrencyMinorUnits.fromMinorUnits(walletMinorUnits, walletCurrency);
    let businessResult: T | undefined = undefined;
    let newBalance = 0;
    let previousBalance = currentWallet.balance;

    const atomicTx = db.transaction(() => {
      // Re-verify balance inside row-locked transaction
      const lockedRow = db.prepare('SELECT balance, reserved_balance, base_balance, base_currency, total_spent FROM user_wallets WHERE user_id = ?').get(userId) as any;
      if (!lockedRow) {
        throw new Error('User wallet not found');
      }

      previousBalance = Number(lockedRow.balance);
      const lockedAvailable = previousBalance - Number(lockedRow.reserved_balance || 0);
      const lockedAvailableMinor = CurrencyMinorUnits.toMinorUnits(lockedAvailable, walletCurrency);

      if (lockedAvailableMinor < walletMinorUnits) {
        throw new Error('Insufficient wallet balance inside transaction lock');
      }

      newBalance = Number((previousBalance - finalChargedFloat).toFixed(CurrencyMinorUnits.getDecimals(walletCurrency)));
      const baseCurrency = lockedRow.base_currency || 'INR';
      const deductInBase = this.convertAmount(finalChargedFloat, walletCurrency, baseCurrency);
      const newBaseBalance = Math.max(0, Number(((lockedRow.base_balance || previousBalance) - deductInBase).toFixed(4)));
      const newSpent = Number((Number(lockedRow.total_spent || 0) + finalChargedFloat).toFixed(2));

      // Update user wallet balance
      db.prepare(`
        UPDATE user_wallets
        SET balance = ?, base_balance = ?, total_spent = ?, updated_at = datetime('now')
        WHERE user_id = ?
      `).run(newBalance, newBaseBalance, newSpent, userId);

      // Append immutable ledger entry
      db.prepare(`
        INSERT INTO wallet_transactions (
          id, user_id, transaction_type, amount, currency,
          previous_balance, new_balance, reference_id, reference_type,
          idempotency_key, amount_minor_units, exchange_rate,
          description, status, metadata, created_at
        ) VALUES (
          ?, ?, 'module_activation', ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, 'completed', ?, datetime('now')
        )
      `).run(
        txId,
        userId,
        finalChargedFloat,
        walletCurrency,
        previousBalance,
        newBalance,
        referenceId,
        referenceType,
        idempotencyKey || null,
        walletMinorUnits,
        exchangeRate,
        reason,
        metadata ? JSON.stringify(metadata) : null
      );

      const txRecord: WalletTransactionRecord = {
        id: txId,
        user_id: userId,
        transaction_type: 'module_activation',
        amount: finalChargedFloat,
        currency: walletCurrency,
        previous_balance: previousBalance,
        new_balance: newBalance,
        reference_id: referenceId,
        reference_type: referenceType,
        idempotency_key: idempotencyKey || null,
        amount_minor_units: walletMinorUnits,
        exchange_rate: exchangeRate,
        description: reason,
        status: 'completed',
        metadata,
        created_at: new Date().toISOString()
      };

      // Execute side-effect callback if provided (e.g. invoice creation, sub creation)
      if (businessEffect) {
        businessResult = businessEffect(txRecord) as any;
      }
    });

    // Execute atomic transaction (auto-rolls back on any error)
    atomicTx();

    try {
      getSocketIO()?.to(`user:${userId}`).emit('wallet:updated', {
        balance: newBalance,
        currency: walletCurrency,
        change: -finalChargedFloat,
        type: 'module_activation',
        referenceType,
        txId
      });
    } catch {}

    return {
      success: true,
      transactionId: txId,
      previousBalance,
      newBalance,
      amountCharged: finalChargedFloat,
      amountMinorUnits: walletMinorUnits,
      currency: walletCurrency,
      businessResult
    };
  }

  /**
   * Refund funds back to user wallet as an append-only counter-entry
   * Supports either RefundOptions (minor units) or legacy parameters (float amount)
   */
  public refund(options: RefundOptions): { success: boolean; transactionId: string; newBalance: number };
  public refund(userId: string, amount: number, reason: string, originalTxId?: string): { success: boolean; transactionId: string; newBalance: number };
  public refund(
    optionsOrUserId: RefundOptions | string,
    maybeAmount?: number,
    maybeReason?: string,
    maybeOriginalTxId?: string
  ): { success: boolean; transactionId: string; newBalance: number } {
    let userId: string;
    let amountMinorUnits: number;
    let currency: string;
    let reason: string;
    let referenceType: string;
    let referenceId: string;
    let idempotencyKey: string | undefined = undefined;
    let metadata: any = undefined;

    if (typeof optionsOrUserId === 'object') {
      userId = optionsOrUserId.userId;
      amountMinorUnits = optionsOrUserId.amountMinorUnits;
      currency = optionsOrUserId.currency;
      reason = optionsOrUserId.reason;
      referenceType = optionsOrUserId.referenceType;
      referenceId = optionsOrUserId.referenceId;
      idempotencyKey = optionsOrUserId.idempotencyKey;
      metadata = optionsOrUserId.metadata;
    } else {
      userId = optionsOrUserId;
      const current = this.getOrCreateWallet(userId);
      currency = current.currency || 'INR';
      const humanAmt = maybeAmount || 0;
      amountMinorUnits = CurrencyMinorUnits.toMinorUnits(humanAmt, currency);
      reason = maybeReason || 'Manual Refund';
      referenceType = 'legacy_refund';
      referenceId = maybeOriginalTxId || 'legacy';
    }

    if (!Number.isInteger(amountMinorUnits) || amountMinorUnits <= 0) {
      return { success: true, transactionId: 'zero_refund', newBalance: this.getOrCreateWallet(userId).balance };
    }

    const db = getDatabase();
    const current = this.getOrCreateWallet(userId);
    const walletCurrency = current.currency || 'USD';

    let exchangeRate = 1.0;
    let creditFloat = CurrencyMinorUnits.fromMinorUnits(amountMinorUnits, currency);
    if (currency.toUpperCase() !== walletCurrency.toUpperCase()) {
      exchangeRate = this.convertAmount(1.0, currency, walletCurrency);
      creditFloat = this.convertAmount(creditFloat, currency, walletCurrency);
    }

    const txId = crypto.randomUUID();
    let newBalance = 0;

    const refundTx = db.transaction(() => {
      const lockedRow = db.prepare('SELECT balance, base_balance, base_currency FROM user_wallets WHERE user_id = ?').get(userId) as any;
      const prev = Number(lockedRow.balance);
      newBalance = Number((prev + creditFloat).toFixed(CurrencyMinorUnits.getDecimals(walletCurrency)));

      const baseCurrency = lockedRow.base_currency || 'INR';
      const creditInBase = this.convertAmount(creditFloat, walletCurrency, baseCurrency);
      const newBase = Number(((lockedRow.base_balance || prev) + creditInBase).toFixed(4));

      db.prepare(`
        UPDATE user_wallets
        SET balance = ?, base_balance = ?, updated_at = datetime('now')
        WHERE user_id = ?
      `).run(newBalance, newBase, userId);

      db.prepare(`
        INSERT INTO wallet_transactions (
          id, user_id, transaction_type, amount, currency,
          previous_balance, new_balance, reference_id, reference_type,
          idempotency_key, amount_minor_units, exchange_rate,
          description, status, metadata, created_at
        ) VALUES (
          ?, ?, 'usage_refund', ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, 'completed', ?, datetime('now')
        )
      `).run(
        txId,
        userId,
        creditFloat,
        walletCurrency,
        prev,
        newBalance,
        referenceId,
        referenceType,
        idempotencyKey || null,
        CurrencyMinorUnits.toMinorUnits(creditFloat, walletCurrency),
        exchangeRate,
        reason,
        metadata ? JSON.stringify(metadata) : null
      );
    });

    refundTx();

    try {
      getSocketIO()?.to(`user:${userId}`).emit('wallet:updated', {
        balance: newBalance,
        currency: walletCurrency,
        change: creditFloat,
        type: 'usage_refund',
        txId
      });
    } catch {}

    return { success: true, transactionId: txId, newBalance };
  }

  /**
   * Reconcile sum of immutable ledger entries against user wallet stored balance
   */
  public auditLedgerBalance(userId: string): {
    matches: boolean;
    walletBalance: number;
    ledgerBalance: number;
    delta: number;
    creditsSum: number;
    debitsSum: number;
  } {
    const db = getDatabase();
    const wallet = this.getOrCreateWallet(userId);

    const rows = db.prepare(`
      SELECT transaction_type, amount
      FROM wallet_transactions
      WHERE user_id = ? AND status = 'completed'
    `).all(userId) as Array<{ transaction_type: string; amount: number }>;

    let creditsSum = 0;
    let debitsSum = 0;

    for (const r of rows) {
      const amt = Number(r.amount);
      if (['wallet_topup', 'promotional_credit', 'usage_refund', 'admin_adjustment', 'reservation_release'].includes(r.transaction_type)) {
        creditsSum += amt;
      } else if (['module_activation', 'extension_activation', 'usage_deduction', 'renewal_charge', 'usage_reservation'].includes(r.transaction_type)) {
        debitsSum += amt;
      }
    }

    const ledgerBalance = Number((creditsSum - debitsSum).toFixed(2));
    const walletBalance = Number(wallet.balance.toFixed(2));
    const delta = Number(Math.abs(walletBalance - ledgerBalance).toFixed(2));

    return {
      matches: delta <= 0.05, // Tolerates minor floating display adjustments from currency conversions
      walletBalance,
      ledgerBalance,
      delta,
      creditsSum: Number(creditsSum.toFixed(2)),
      debitsSum: Number(debitsSum.toFixed(2))
    };
  }

  /**
   * Atomically reserve funds in user wallet (e.g. before an outbound API purchase call)
   */
  public reserveFunds(
    userId: string,
    amount: number,
    description: string,
    referenceId?: string,
    meta?: any
  ): { success: boolean; reservationId: string; availableBalance: number } {
    if (amount <= 0) {
      return { success: true, reservationId: `free_res_${Date.now()}`, availableBalance: this.getOrCreateWallet(userId).balance };
    }

    const db = getDatabase();
    const current = this.getOrCreateWallet(userId);

    // If reservation currency differs from user wallet currency, convert to wallet currency
    let amountToReserve = amount;
    if (meta?.currency && meta.currency.toUpperCase() !== current.currency.toUpperCase()) {
      amountToReserve = this.convertAmount(amount, meta.currency, current.currency);
    }

    const available = Number((current.balance - current.reserved_balance).toFixed(2));
    const sym = current.currency === 'INR' ? '₹' : current.currency === 'USD' ? '$' : current.currency;

    // Spend limits checks
    if (current.per_job_spend_limit && current.per_job_spend_limit > 0 && amountToReserve > current.per_job_spend_limit) {
      throw new Error(
        `Per-job spend limit exceeded. Required: ${sym}${amountToReserve.toFixed(2)}, Maximum allowed per job: ${sym}${current.per_job_spend_limit.toFixed(2)}.`
      );
    }

    if (current.daily_spend_limit && current.daily_spend_limit > 0) {
      const todaySpentRow = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM wallet_transactions
        WHERE user_id = ? AND transaction_type IN ('usage_deduction', 'usage_reservation')
          AND status IN ('completed', 'pending')
          AND date(created_at) = date('now')
      `).get(userId) as any;
      const todayTotal = (todaySpentRow?.total || 0) + amountToReserve;
      if (todayTotal > current.daily_spend_limit) {
        throw new Error(
          `Daily spend limit exceeded. Current daily usage with this run: ${sym}${todayTotal.toFixed(2)}, Daily limit: ${sym}${current.daily_spend_limit.toFixed(2)}.`
        );
      }
    }

    if (current.monthly_spend_limit && current.monthly_spend_limit > 0) {
      const monthSpentRow = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM wallet_transactions
        WHERE user_id = ? AND transaction_type IN ('usage_deduction', 'usage_reservation')
          AND status IN ('completed', 'pending')
          AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
      `).get(userId) as any;
      const monthTotal = (monthSpentRow?.total || 0) + amountToReserve;
      if (monthTotal > current.monthly_spend_limit) {
        throw new Error(
          `Monthly spend limit exceeded. Current monthly usage with this run: ${sym}${monthTotal.toFixed(2)}, Monthly limit: ${sym}${current.monthly_spend_limit.toFixed(2)}.`
        );
      }
    }

    if (available < amountToReserve) {
      throw new Error(
        `Insufficient available wallet balance. Required: ${sym}${amountToReserve.toFixed(2)}, Available: ${sym}${available.toFixed(2)}. Please top up your wallet to continue.`
      );
    }

    const reservationId = crypto.randomUUID();
    const newReserved = Number((current.reserved_balance + amountToReserve).toFixed(2));

    const reserveTx = db.transaction(() => {
      db.prepare(`
        UPDATE user_wallets
        SET reserved_balance = ?, updated_at = datetime('now')
        WHERE user_id = ?
      `).run(newReserved, userId);

      db.prepare(`
        INSERT INTO wallet_transactions (
          id, user_id, transaction_type, amount, currency,
          previous_balance, new_balance, reference_id, description, metadata, status
        ) VALUES (
          ?, ?, 'usage_reservation', ?, ?,
          ?, ?, ?, ?, ?, 'pending'
        )
      `).run(
        reservationId,
        userId,
        amountToReserve,
        current.currency,
        current.balance,
        current.balance,
        referenceId || null,
        description,
        meta ? JSON.stringify(meta) : null
      );
    });

    reserveTx();

    try {
      getSocketIO()?.to(`user:${userId}`).emit('wallet:updated', {
        balance: current.balance,
        reservedBalance: newReserved,
        availableBalance: available - amountToReserve,
        currency: current.currency,
        type: 'usage_reservation',
        txId: reservationId
      });
    } catch {}

    return {
      success: true,
      reservationId,
      availableBalance: Number((available - amountToReserve).toFixed(2))
    };
  }

  /**
   * Commit a previously reserved amount upon successful purchase
   */
  public commitReservation(
    userId: string,
    amount: number,
    reservationId: string,
    finalDescription?: string,
    meta?: any
  ): { success: boolean; newBalance: number; transactionId: string } {
    if (amount <= 0) {
      return { success: true, newBalance: this.getOrCreateWallet(userId).balance, transactionId: reservationId };
    }

    const db = getDatabase();
    const current = this.getOrCreateWallet(userId);
    const baseCurrency = current.base_currency || 'INR';
    const deductInBase = this.convertAmount(amount, current.currency, baseCurrency);

    const newBaseBalance = Math.max(0, Number(((current.base_balance || current.balance) - deductInBase).toFixed(4)));
    const newBalance = Number((current.balance - amount).toFixed(2));

    // Release the full original reservation hold from reserved_balance (settle actual, release excess)
    const resTx = db.prepare('SELECT amount FROM wallet_transactions WHERE id = ?').get(reservationId) as any;
    const originalReserved = resTx ? Number(resTx.amount || 0) : amount;
    const holdToRelease = Math.max(originalReserved, amount);
    const newReserved = Number(Math.max(0, current.reserved_balance - holdToRelease).toFixed(2));
    const newSpent = Number((current.total_spent + amount).toFixed(2));

    const commitTx = db.transaction(() => {
      db.prepare(`
        UPDATE user_wallets
        SET balance = ?, base_balance = ?, reserved_balance = ?, total_spent = ?, updated_at = datetime('now')
        WHERE user_id = ?
      `).run(newBalance, newBaseBalance, newReserved, newSpent, userId);

      db.prepare(`
        UPDATE wallet_transactions
        SET status = 'completed',
            new_balance = ?,
            description = COALESCE(?, description),
            metadata = COALESCE(?, metadata)
        WHERE id = ?
      `).run(newBalance, finalDescription || null, meta ? JSON.stringify(meta) : null, reservationId);
    });

    commitTx();

    try {
      getSocketIO()?.to(`user:${userId}`).emit('wallet:updated', {
        balance: newBalance,
        reservedBalance: newReserved,
        availableBalance: newBalance - newReserved,
        currency: current.currency,
        change: -amount,
        type: 'usage_deduction',
        txId: reservationId
      });
    } catch {}

    return { success: true, newBalance, transactionId: reservationId };
  }

  /**
   * Release reserved funds back to user on provider purchase failure or timeout
   */
  public releaseReservation(
    userId: string,
    amount: number,
    reservationId: string,
    reason: string
  ): { success: boolean; availableBalance: number } {
    if (amount <= 0) {
      return { success: true, availableBalance: this.getOrCreateWallet(userId).balance };
    }

    const db = getDatabase();
    const current = this.getOrCreateWallet(userId);
    const newReserved = Number(Math.max(0, current.reserved_balance - amount).toFixed(2));
    const newAvailable = Number((current.balance - newReserved).toFixed(2));

    const releaseTx = db.transaction(() => {
      db.prepare(`
        UPDATE user_wallets
        SET reserved_balance = ?, updated_at = datetime('now')
        WHERE user_id = ?
      `).run(newReserved, userId);

      db.prepare(`
        UPDATE wallet_transactions
        SET status = 'reversed',
            description = description || ' [RELEASED: ' || ? || ']'
        WHERE id = ?
      `).run(reason, reservationId);
    });

    releaseTx();

    try {
      getSocketIO()?.to(`user:${userId}`).emit('wallet:updated', {
        balance: current.balance,
        reservedBalance: newReserved,
        availableBalance: newAvailable,
        currency: current.currency,
        type: 'reservation_release',
        txId: reservationId
      });
    } catch {}

    return { success: true, availableBalance: newAvailable };
  }

  /**
   * Admin manual balance adjustment
   */
  public adminAdjust(
    adminUserId: string,
    targetUserId: string,
    amount: number,
    reason: string
  ): { success: boolean; newBalance: number; transactionId: string } {
    const db = getDatabase();
    const admin = db.prepare('SELECT role, username FROM users WHERE id = ?').get(adminUserId) as any;
    if (!admin || admin.role !== 'admin') {
      throw new Error('Access denied. Administrator privileges required.');
    }

    const current = this.getOrCreateWallet(targetUserId);
    const newBalance = Number((current.balance + amount).toFixed(2));
    if (newBalance < 0) {
      throw new Error(`Cannot adjust balance below zero. Resulting balance would be ${current.currency} ${newBalance}.`);
    }

    const baseCurrency = current.base_currency || 'INR';
    const adjustInBase = this.convertAmount(amount, current.currency, baseCurrency);
    const newBaseBalance = Math.max(0, Number(((current.base_balance || current.balance) + adjustInBase).toFixed(4)));

    const txId = crypto.randomUUID();
    db.prepare(`
      UPDATE user_wallets
      SET balance = ?, base_balance = ?, updated_at = datetime('now')
      WHERE user_id = ?
    `).run(newBalance, newBaseBalance, targetUserId);

    db.prepare(`
      INSERT INTO wallet_transactions (
        id, user_id, transaction_type, amount, currency,
        previous_balance, new_balance, description, status
      ) VALUES (
        ?, ?, 'admin_adjustment', ?, ?,
        ?, ?, ?, 'completed'
      )
    `).run(
      txId,
      targetUserId,
      amount,
      current.currency,
      current.balance,
      newBalance,
      `Admin Adjustment by @${admin.username}: ${reason}`
    );

    // Record audit log
    db.prepare(`
      INSERT INTO extension_audit_logs (id, admin_user_id, target_user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, 'admin_adjust_wallet', 'user_wallets', ?, ?)
    `).run(
      crypto.randomUUID(),
      adminUserId,
      targetUserId,
      targetUserId,
      JSON.stringify({ change: amount, previous: current.balance, new: newBalance, reason })
    );

    try {
      getSocketIO()?.to(`user:${targetUserId}`).emit('wallet:updated', {
        balance: newBalance,
        currency: current.currency,
        change: amount,
        type: 'admin_adjustment',
        txId
      });
    } catch {}

    return { success: true, newBalance, transactionId: txId };
  }

  /**
   * List recent wallet transactions for user
   */
  public listTransactions(userId: string, limit: number = 50): WalletTransactionRecord[] {
    const db = getDatabase();
    const rows = db
      .prepare(`
        SELECT * FROM wallet_transactions
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .all(userId, limit) as any[];

    return rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      workspace_id: r.workspace_id,
      extension_id: r.extension_id,
      module_id: r.module_id,
      transaction_type: r.transaction_type,
      amount: Number(r.amount),
      currency: r.currency || 'INR',
      previous_balance: Number(r.previous_balance),
      new_balance: Number(r.new_balance),
      reference_id: r.reference_id,
      description: r.description,
      status: r.status,
      metadata: r.metadata ? JSON.parse(r.metadata) : null,
      created_at: r.created_at
    }));
  }

  /**
   * Set user spend limits
   */
  public setSpendLimits(
    userId: string,
    limits: { daily?: number; monthly?: number; perJob?: number }
  ): WalletRecord {
    const db = getDatabase();
    const current = this.getOrCreateWallet(userId);

    const daily = limits.daily !== undefined ? Math.max(0, limits.daily) : (current.daily_spend_limit || 0);
    const monthly = limits.monthly !== undefined ? Math.max(0, limits.monthly) : (current.monthly_spend_limit || 0);
    const perJob = limits.perJob !== undefined ? Math.max(0, limits.perJob) : (current.per_job_spend_limit || 0);

    db.prepare(`
      UPDATE user_wallets
      SET daily_spend_limit = ?, monthly_spend_limit = ?, per_job_spend_limit = ?, updated_at = datetime('now')
      WHERE user_id = ?
    `).run(daily, monthly, perJob, userId);

    return this.getOrCreateWallet(userId);
  }

  /**
   * Get user spend limit status (limit vs spent today / this month)
   */
  public getSpendLimitStatus(userId: string): {
    currency: string;
    dailyLimit: number;
    spentToday: number;
    dailyRemaining: number;
    monthlyLimit: number;
    spentThisMonth: number;
    monthlyRemaining: number;
    perJobLimit: number;
  } {
    const db = getDatabase();
    const wallet = this.getOrCreateWallet(userId);

    const todayRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM wallet_transactions
      WHERE user_id = ? AND transaction_type IN ('usage_deduction', 'usage_reservation')
        AND status IN ('completed', 'pending')
        AND date(created_at) = date('now')
    `).get(userId) as any;

    const monthRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM wallet_transactions
      WHERE user_id = ? AND transaction_type IN ('usage_deduction', 'usage_reservation')
        AND status IN ('completed', 'pending')
        AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
    `).get(userId) as any;

    const spentToday = Number(todayRow?.total || 0);
    const spentThisMonth = Number(monthRow?.total || 0);
    const dailyLimit = Number(wallet.daily_spend_limit || 0);
    const monthlyLimit = Number(wallet.monthly_spend_limit || 0);
    const perJobLimit = Number(wallet.per_job_spend_limit || 0);

    return {
      currency: wallet.currency,
      dailyLimit,
      spentToday,
      dailyRemaining: dailyLimit > 0 ? Math.max(0, dailyLimit - spentToday) : Infinity,
      monthlyLimit,
      spentThisMonth,
      monthlyRemaining: monthlyLimit > 0 ? Math.max(0, monthlyLimit - spentThisMonth) : Infinity,
      perJobLimit
    };
  }

  /**
   * Reconcile active reservations and repair any orphaned/stale holds
   * Ensures available = balance - reserved_balance invariant holds true
   */
  public reconcileUserWallet(userId: string): {
    repaired: boolean;
    previousReserved: number;
    correctedReserved: number;
    orphansReleased: number;
  } {
    const db = getDatabase();
    const current = this.getOrCreateWallet(userId);

    // 1. Find all pending usage_reservation records
    const pendingReservations = db.prepare(`
      SELECT * FROM wallet_transactions
      WHERE user_id = ? AND transaction_type = 'usage_reservation' AND status = 'pending'
    `).all(userId) as any[];

    let orphansReleased = 0;
    let actualValidReserved = 0;

    for (const res of pendingReservations) {
      let isOrphan = false;

      // Check if associated with a marketplace job
      if (res.reference_id) {
        const job = db.prepare('SELECT status FROM marketplace_jobs WHERE id = ?').get(res.reference_id) as any;
        if (job) {
          if (['COMPLETED', 'PARTIAL', 'FAILED', 'ABORTED'].includes(job.status)) {
            // Job already finished, but reservation was left as pending!
            isOrphan = true;
          }
        }
      }

      // Check if reservation is older than 24 hours (stale hold timeout)
      const resAgeMs = Date.now() - new Date(res.created_at).getTime();
      if (resAgeMs > 24 * 60 * 60 * 1000) {
        isOrphan = true;
      }

      if (isOrphan) {
        db.prepare(`
          UPDATE wallet_transactions
          SET status = 'reversed',
              description = description || ' [AUTO_RECONCILED: Stale hold released]'
          WHERE id = ?
        `).run(res.id);
        orphansReleased++;
      } else {
        actualValidReserved += Number(res.amount || 0);
      }
    }

    actualValidReserved = Number(actualValidReserved.toFixed(2));
    const repaired = current.reserved_balance !== actualValidReserved;

    if (repaired) {
      db.prepare(`
        UPDATE user_wallets
        SET reserved_balance = ?, updated_at = datetime('now')
        WHERE user_id = ?
      `).run(actualValidReserved, userId);

      try {
        getSocketIO()?.to(`user:${userId}`).emit('wallet:updated', {
          balance: current.balance,
          reservedBalance: actualValidReserved,
          availableBalance: Math.max(0, current.balance - actualValidReserved),
          currency: current.currency,
          type: 'reconciliation'
        });
      } catch {}
    }

    return {
      repaired,
      previousReserved: current.reserved_balance,
      correctedReserved: actualValidReserved,
      orphansReleased
    };
  }

  /**
   * Periodic reconciliation across all user wallets
   */
  public reconcileAllWallets(): { checked: number; repaired: number; totalOrphansReleased: number } {
    const db = getDatabase();
    const userIds = db.prepare('SELECT user_id FROM user_wallets WHERE reserved_balance > 0').all() as any[];

    let repairedCount = 0;
    let totalOrphans = 0;

    for (const row of userIds) {
      const res = this.reconcileUserWallet(row.user_id);
      if (res.repaired) repairedCount++;
      totalOrphans += res.orphansReleased;
    }

    return { checked: userIds.length, repaired: repairedCount, totalOrphansReleased: totalOrphans };
  }
}

