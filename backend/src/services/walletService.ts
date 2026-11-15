import crypto from 'crypto';
import { getDatabase } from '../db/database.js';
import { getSocketIO } from '../socket/socketManager.js';

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
  total_spent: number;
  total_topped_up: number;
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
  description: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded' | 'reversed';
  metadata?: any;
  created_at: string;
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
    const fromRow = db.prepare('SELECT rate_from_5sim_base FROM currency_rates WHERE UPPER(code) = ?').get(fromCurrency.toUpperCase()) as any;
    const toRow = db.prepare('SELECT rate_from_5sim_base FROM currency_rates WHERE UPPER(code) = ?').get(toCurrency.toUpperCase()) as any;
    const fromRate = Number(fromRow?.rate_from_5sim_base || 1.0);
    const toRate = Number(toRow?.rate_from_5sim_base || 1.0);
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
      total_spent: Number(row.total_spent || 0),
      total_topped_up: Number(row.total_topped_up || 0),
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
    const available = Number((current.balance - current.reserved_balance).toFixed(2));

    if (available < amount) {
      throw new Error(
        `Insufficient available wallet balance. Required: ₹${amount.toFixed(2)}, Available: ₹${available.toFixed(2)}. Please top up your wallet to continue.`
      );
    }

    const reservationId = crypto.randomUUID();
    const newReserved = Number((current.reserved_balance + amount).toFixed(2));

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
          ?, ?, 'usage_reservation', ?, 'INR',
          ?, ?, ?, ?, ?, 'pending'
        )
      `).run(
        reservationId,
        userId,
        amount,
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
        availableBalance: available - amount,
        currency: current.currency,
        type: 'usage_reservation',
        txId: reservationId
      });
    } catch {}

    return {
      success: true,
      reservationId,
      availableBalance: Number((available - amount).toFixed(2))
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
    const newReserved = Number(Math.max(0, current.reserved_balance - amount).toFixed(2));
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
   * Refund a previous deduction
   */
  public refund(
    userId: string,
    amount: number,
    reason: string,
    originalTxId?: string
  ): { success: boolean; newBalance: number } {
    if (amount <= 0) return { success: true, newBalance: this.getOrCreateWallet(userId).balance };

    const db = getDatabase();
    const current = this.getOrCreateWallet(userId);
    const baseCurrency = current.base_currency || 'INR';
    const refundInBase = this.convertAmount(amount, current.currency, baseCurrency);

    const newBaseBalance = Number(((current.base_balance || current.balance) + refundInBase).toFixed(4));
    const newBalance = Number((current.balance + amount).toFixed(2));
    const txId = crypto.randomUUID();

    db.prepare(`
      UPDATE user_wallets
      SET balance = ?, base_balance = ?, updated_at = datetime('now')
      WHERE user_id = ?
    `).run(newBalance, newBaseBalance, userId);

    db.prepare(`
      INSERT INTO wallet_transactions (
        id, user_id, transaction_type, amount, currency,
        previous_balance, new_balance, reference_id, description, status
      ) VALUES (
        ?, ?, 'usage_refund', ?, ?,
        ?, ?, ?, ?, 'completed'
      )
    `).run(txId, userId, amount, current.currency, current.balance, newBalance, originalTxId || null, `Refund: ${reason}`);

    try {
      getSocketIO()?.to(`user:${userId}`).emit('wallet:updated', {
        balance: newBalance,
        currency: current.currency,
        change: amount,
        type: 'usage_refund',
        txId
      });
    } catch {}

    return { success: true, newBalance };
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
}

