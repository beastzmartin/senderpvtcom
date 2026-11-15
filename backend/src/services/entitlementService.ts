import crypto from 'crypto';
import { getDatabase } from '../db/database.js';
import { WalletService } from './walletService.js';
import { getSocketIO } from '../socket/socketManager.js';

export interface EntitlementCheckResult {
  allowed: boolean;
  reason?: string;
  unitPrice: number;
  freeUnitsRemaining: number;
  periodLimit: number;
  totalConsumed: number;
  walletBalance: number;
}

export class EntitlementService {
  private static instance: EntitlementService | null = null;
  private walletService: WalletService;

  private constructor() {
    this.walletService = WalletService.getInstance();
  }

  public static getInstance(): EntitlementService {
    if (!EntitlementService.instance) {
      EntitlementService.instance = new EntitlementService();
    }
    return EntitlementService.instance;
  }

  /**
   * Validate user entitlement to execute a specific module
   * Enforces 10-point authorization checklist
   */
  public validateModuleAccess(
    userId: string,
    moduleId: string,
    requestedUnits: number = 1
  ): EntitlementCheckResult {
    const db = getDatabase();

    // 1. Authenticated User & Role Check
    const user = db.prepare('SELECT id, role, is_active, subscription_status FROM users WHERE id = ?').get(userId) as any;
    if (!user) {
      return { allowed: false, reason: 'User not found.', unitPrice: 0, freeUnitsRemaining: 0, periodLimit: 0, totalConsumed: 0, walletBalance: 0 };
    }

    if (user.is_active === 0) {
      return { allowed: false, reason: 'Account is deactivated. Please contact support.', unitPrice: 0, freeUnitsRemaining: 0, periodLimit: 0, totalConsumed: 0, walletBalance: 0 };
    }

    const wallet = this.walletService.getOrCreateWallet(userId);

    // 2. Fetch Module Details
    const mod = db.prepare('SELECT * FROM extension_modules WHERE id = ?').get(moduleId) as any;
    if (!mod) {
      return { allowed: false, reason: `Module "${moduleId}" does not exist.`, unitPrice: 0, freeUnitsRemaining: 0, periodLimit: 0, totalConsumed: 0, walletBalance: wallet.balance };
    }

    if (mod.status === 'maintenance' || mod.status === 'deprecated') {
      return { allowed: false, reason: `Module "${mod.name}" is currently under maintenance.`, unitPrice: 0, freeUnitsRemaining: 0, periodLimit: 0, totalConsumed: 0, walletBalance: wallet.balance };
    }

    // Admins have full access with zero restrictions
    if (user.role === 'admin') {
      return {
        allowed: true,
        unitPrice: 0,
        freeUnitsRemaining: 99999,
        periodLimit: 99999,
        totalConsumed: 0,
        walletBalance: wallet.balance
      };
    }

    // 3. Check Module Activation
    const modAct = db.prepare("SELECT * FROM module_activations WHERE user_id = ? AND module_id = ? AND status = 'active'").get(userId, moduleId) as any;
    if (!modAct && Number(mod.activation_fee || 0) > 0) {
      return {
        allowed: false,
        reason: `Module "${mod.name}" is not activated. Please activate this module from My Extensions to use it.`,
        unitPrice: Number(mod.usage_price || 0),
        freeUnitsRemaining: 0,
        periodLimit: mod.period_quota_limit || 1000,
        totalConsumed: 0,
        walletBalance: wallet.balance
      };
    }

    // 4. Calculate Quota Consumption in Current Billing Period
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const usageRow = db
      .prepare('SELECT units_consumed FROM module_usage WHERE user_id = ? AND module_id = ? AND period_start >= ?')
      .get(userId, moduleId, startOfMonth) as any;

    const totalConsumed = Number(usageRow?.units_consumed || 0);
    const periodLimit = Number(modAct?.custom_quota_override || mod.period_quota_limit || 1000);
    const freeQuota = Number(mod.free_quota || 0);
    const freeUnitsRemaining = Math.max(0, freeQuota - totalConsumed);

    // 5. Enforce Monthly / Period Limit
    if (periodLimit < 99999 && totalConsumed + requestedUnits > periodLimit) {
      return {
        allowed: false,
        reason: `Monthly quota limit reached for module "${mod.name}" (${totalConsumed}/${periodLimit}). Contact administrator or upgrade quota.`,
        unitPrice: Number(mod.usage_price || 0),
        freeUnitsRemaining: 0,
        periodLimit,
        totalConsumed,
        walletBalance: wallet.balance
      };
    }

    // 6. Check Wallet Balance for Billable Units
    const unitPrice = Number(modAct?.custom_usage_price_override ?? mod.usage_price ?? 0);
    const billableUnits = Math.max(0, requestedUnits - freeUnitsRemaining);
    const requiredFunds = Number((billableUnits * unitPrice).toFixed(2));

    if (requiredFunds > 0 && wallet.balance < requiredFunds) {
      return {
        allowed: false,
        reason: `Insufficient wallet balance to execute "${mod.name}". Estimated cost: ₹${requiredFunds.toFixed(2)}, Available: ₹${wallet.balance.toFixed(2)}. Please top up your wallet.`,
        unitPrice,
        freeUnitsRemaining,
        periodLimit,
        totalConsumed,
        walletBalance: wallet.balance
      };
    }

    return {
      allowed: true,
      unitPrice,
      freeUnitsRemaining,
      periodLimit,
      totalConsumed,
      walletBalance: wallet.balance
    };
  }

  /**
   * Record module usage after successful extraction and atomically deduct from wallet
   */
  public recordUsageAndSettle(
    userId: string,
    moduleId: string,
    successfulUnits: number,
    meta?: {
      jobId?: string;
      description?: string;
    }
  ): { unitsCharged: number; totalCost: number; newBalance: number } {
    if (successfulUnits <= 0) {
      const w = this.walletService.getOrCreateWallet(userId);
      return { unitsCharged: 0, totalCost: 0, newBalance: w.balance };
    }

    const db = getDatabase();
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as any;
    const isSpecialAdmin = user?.role === 'admin';

    const mod = db.prepare('SELECT * FROM extension_modules WHERE id = ?').get(moduleId) as any;
    if (!mod) throw new Error('Module not found.');

    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const endOfMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10);

    // Current usage
    const usageRow = db
      .prepare('SELECT * FROM module_usage WHERE user_id = ? AND module_id = ? AND period_start = ?')
      .get(userId, moduleId, startOfMonth) as any;

    const currentConsumed = Number(usageRow?.units_consumed || 0);
    const freeQuota = Number(mod.free_quota || 0);
    const freeRemaining = Math.max(0, freeQuota - currentConsumed);

    const billableUnits = isSpecialAdmin ? 0 : Math.max(0, successfulUnits - freeRemaining);
    const unitPrice = isSpecialAdmin ? 0 : Number(mod.usage_price || 0);
    const totalCost = Number((billableUnits * unitPrice).toFixed(2));

    // Deduct from wallet if cost > 0
    let balance = this.walletService.getOrCreateWallet(userId).balance;
    if (totalCost > 0) {
      const deduction = this.walletService.deduct(
        userId,
        totalCost,
        'usage_deduction',
        meta?.description || `Usage: ${successfulUnits} record(s) processed with ${mod.name}`,
        {
          extensionId: mod.extension_id,
          moduleId: mod.id,
          referenceId: meta?.jobId,
          customData: { units: successfulUnits, billableUnits, unitPrice }
        }
      );
      balance = deduction.newBalance;
    }

    // Upsert module_usage record
    const newConsumed = currentConsumed + successfulUnits;
    const newTotalCost = Number((Number(usageRow?.total_cost || 0) + totalCost).toFixed(2));

    if (usageRow) {
      db.prepare(`
        UPDATE module_usage
        SET units_consumed = ?, total_cost = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(newConsumed, newTotalCost, usageRow.id);
    } else {
      db.prepare(`
        INSERT INTO module_usage (
          id, user_id, module_id, extension_id, period_start, period_end, units_consumed, total_cost, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now')
        )
      `).run(
        crypto.randomUUID(),
        userId,
        moduleId,
        mod.extension_id,
        startOfMonth,
        endOfMonth,
        newConsumed,
        newTotalCost
      );
    }

    try {
      getSocketIO()?.to(`user:${userId}`).emit('module:usage_consumed', {
        moduleId,
        units: successfulUnits,
        totalCost,
        newBalance: balance,
        jobId: meta?.jobId
      });
    } catch {}

    return { unitsCharged: billableUnits, totalCost, newBalance: balance };
  }
}
