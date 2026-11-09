import crypto from 'crypto';
import { getDatabase } from '../db/database.js';

export interface SubscriptionPlanRecord {
  id: string;
  name: string;
  tagline: string;
  price_monthly: number;
  price_yearly: number;
  currency: string;
  max_devices: number;
  daily_message_limit: number;
  daily_extraction_limit: number;
  features: string[];
  is_popular: boolean;
  trial_days?: number;
}

export interface UserSubscriptionDetails {
  userId: string;
  username: string;
  name: string;
  email?: string | null;
  companyName?: string | null;
  role: string;
  planTier: string;
  planName: string;
  status: 'active' | 'trialing' | 'expired' | 'cancelled';
  expiresAt: string | null;
  daysRemaining: number | null;
  isLifetime: boolean;
  isTrial?: boolean;
  activeLicenseCode?: string | null;
  maxDevices: number;
  connectedDevices: number;
  dailyMessageLimit: number;
  messagesSentToday: number;
  remainingMessagesToday: number;
  dailyExtractionLimit: number;
  extractionsToday: number;
  remainingExtractionsToday: number;
  resellerQuota?: number;
  resellerCreatedKeysCount?: number;
  resellerRemainingQuota?: number;
  features: string[];
}

export interface LicenseKeyRecord {
  id: string;
  code: string;
  plan_tier: string;
  duration_days: number;
  max_devices_override?: number | null;
  daily_limit_override?: number | null;
  extraction_limit_override?: number | null;
  status: 'available' | 'used' | 'revoked' | 'expired';
  is_used: number;
  used_by_user_id?: string | null;
  used_by_username?: string | null;
  used_by_name?: string | null;
  used_at?: string | null;
  created_by?: string | null;
  created_by_user_id?: string | null;
  note?: string | null;
  created_at: string;
}

export interface ResellerRecord {
  id: string;
  username: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  role: string;
  reseller_license_quota: number;
  keys_created_count: number;
  remaining_quota: number;
  keys_used_count: number;
  created_at: string;
}

export class SubscriptionService {
  private static instance: SubscriptionService | null = null;

  public static getInstance(): SubscriptionService {
    if (!SubscriptionService.instance) {
      SubscriptionService.instance = new SubscriptionService();
    }
    return SubscriptionService.instance;
  }

  /**
   * Get all available subscription plans / license editions
   */
  public getPlans(): SubscriptionPlanRecord[] {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM subscription_plans ORDER BY price_monthly ASC').all() as any[];

    const trialDaysSetting = db.prepare("SELECT value FROM application_settings WHERE key = 'trial_duration_days'").get() as { value: string } | undefined;
    const trialDays = trialDaysSetting ? parseInt(trialDaysSetting.value, 10) || 3 : 3;

    return rows.map((r) => {
      let features: string[] = [];
      try {
        features = JSON.parse(r.features);
      } catch {
        features = [r.features];
      }
      return {
        id: r.id,
        name: r.name,
        tagline: r.tagline || '',
        price_monthly: r.price_monthly,
        price_yearly: r.price_yearly,
        currency: r.currency || 'INR',
        max_devices: r.max_devices,
        daily_message_limit: r.daily_message_limit,
        daily_extraction_limit: r.daily_extraction_limit || 500,
        features,
        is_popular: r.is_popular === 1,
        trial_days: r.id === 'trial' ? trialDays : undefined
      };
    });
  }

  /**
   * Get detailed subscription and usage status for a user
   */
  public getUserSubscription(userId: string): UserSubscriptionDetails {
    const db = getDatabase();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;

    if (!user) {
      throw new Error(`User with ID ${userId} not found.`);
    }

    const planTier = user.plan_tier || 'starter';
    const planRow = db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(planTier) as any;

    let features: string[] = [];
    if (planRow) {
      try {
        features = JSON.parse(planRow.features);
      } catch {
        features = [planRow.features];
      }
    }

    // Calculate days remaining
    let daysRemaining: number | null = null;
    let isLifetime = user.role === 'admin' || !user.subscription_expires_at;
    let status: 'active' | 'trialing' | 'expired' | 'cancelled' = user.subscription_status || 'active';

    if (user.subscription_expires_at) {
      const expiry = new Date(user.subscription_expires_at).getTime();
      const now = Date.now();
      const diffMs = expiry - now;
      daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

      if (diffMs <= 0 && user.role !== 'admin') {
        status = 'expired';
        // Update DB status if newly expired
        if (user.subscription_status !== 'expired') {
          db.prepare("UPDATE users SET subscription_status = 'expired' WHERE id = ?").run(userId);
        }
      }
    }

    // Count currently connected devices for THIS user
    const deviceCount = (db.prepare('SELECT COUNT(*) as count FROM whatsapp_sessions WHERE user_id = ?').get(userId) as { count: number }).count;

    // Count outgoing messages sent today for THIS user
    const sentCountRow = db.prepare(`
      SELECT COUNT(*) as count FROM messages
      WHERE user_id = ?
        AND direction = 'outgoing'
        AND status IN ('sent', 'delivered', 'read')
        AND (date(created_at) = date('now') OR date(timestamp) = date('now'))
    `).get(userId) as { count: number };

    const messagesSentToday = Math.max(sentCountRow ? sentCountRow.count : 0, user.messages_sent_today || 0);
    const dailyLimit = user.daily_message_limit !== undefined && user.daily_message_limit !== null
      ? user.daily_message_limit
      : (planRow ? planRow.daily_message_limit : 100);
    const remainingMessagesToday = Math.max(0, dailyLimit - messagesSentToday);

    // Count contacts extracted today for THIS user
    const extractionCountRow = db.prepare(`
      SELECT COALESCE(SUM(contacts_count), 0) as count
      FROM extraction_logs
      WHERE user_id = ? AND (date(created_at) = date('now'))
    `).get(userId) as { count: number };

    const extractionsToday = extractionCountRow ? extractionCountRow.count : 0;
    const dailyExtractionLimit = user.role === 'admin' ? 999999 : (user.daily_extraction_limit || (planRow ? planRow.daily_extraction_limit : 500));
    const remainingExtractionsToday = user.role === 'admin' ? 999999 : Math.max(0, dailyExtractionLimit - extractionsToday);

    // Reseller stats if role is reseller or admin
    let resellerQuota: number | undefined = undefined;
    let resellerCreatedKeysCount: number | undefined = undefined;
    let resellerRemainingQuota: number | undefined = undefined;

    if (user.role === 'reseller' || user.role === 'admin') {
      resellerQuota = user.reseller_license_quota || 0;
      const keyCountRow = db.prepare('SELECT COUNT(*) as count FROM license_keys WHERE created_by_user_id = ?').get(userId) as { count: number };
      resellerCreatedKeysCount = keyCountRow ? keyCountRow.count : 0;
      resellerRemainingQuota = user.role === 'admin' ? 999999 : Math.max(0, (resellerQuota || 0) - resellerCreatedKeysCount);
    }

    return {
      userId: user.id,
      username: user.username,
      name: user.name,
      email: user.email || null,
      companyName: user.company_name || null,
      role: user.role || 'user',
      planTier,
      planName: planRow ? planRow.name : `${planTier.toUpperCase()} License Edition`,
      status,
      expiresAt: user.subscription_expires_at || null,
      daysRemaining: isLifetime ? 9999 : daysRemaining,
      isLifetime,
      isTrial: planTier === 'trial' || status === 'trialing',
      activeLicenseCode: user.active_license_code || null,
      maxDevices: user.max_devices || (planRow ? planRow.max_devices : 1),
      connectedDevices: deviceCount,
      dailyMessageLimit: dailyLimit,
      messagesSentToday,
      remainingMessagesToday,
      dailyExtractionLimit,
      extractionsToday,
      remainingExtractionsToday,
      resellerQuota,
      resellerCreatedKeysCount,
      resellerRemainingQuota,
      features
    };
  }

  /**
   * Upgrade user to a selected plan tier
   */
  public upgradePlan(
    userId: string,
    planTier: string,
    billingCycle: 'monthly' | 'yearly' = 'monthly'
  ): UserSubscriptionDetails {
    const db = getDatabase();
    const plan = db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(planTier) as any;

    if (!plan) {
      throw new Error(`Plan tier "${planTier}" does not exist.`);
    }

    const durationDays = billingCycle === 'yearly' ? 365 : 30;
    const now = new Date();
    const user = db.prepare('SELECT subscription_expires_at FROM users WHERE id = ?').get(userId) as any;

    let baseDate = now;
    if (user?.subscription_expires_at) {
      const existingExpiry = new Date(user.subscription_expires_at);
      if (existingExpiry.getTime() > now.getTime()) {
        baseDate = existingExpiry;
      }
    }

    const newExpiry = new Date(baseDate.getTime() + durationDays * 24 * 3600 * 1000).toISOString();
    const amount = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly;

    db.prepare(`
      UPDATE users
      SET plan_tier = ?,
          subscription_status = 'active',
          subscription_expires_at = ?,
          max_devices = ?,
          daily_message_limit = ?,
          daily_extraction_limit = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(planTier, newExpiry, plan.max_devices, plan.daily_message_limit, plan.daily_extraction_limit || 500, userId);

    // Record invoice
    db.prepare(`
      INSERT INTO subscription_invoices (id, user_id, plan_tier, amount, currency, billing_cycle, status, payment_method)
      VALUES (?, ?, ?, ?, ?, ?, 'paid', 'instant_upgrade')
    `).run(crypto.randomUUID(), userId, planTier, amount, plan.currency || 'INR', billingCycle);

    console.log(`[Subscription] User ${userId} upgraded to ${planTier} (${billingCycle}) until ${newExpiry}`);

    return this.getUserSubscription(userId);
  }

  /**
   * Redeem a License / Voucher Activation Key
   */
  public redeemLicenseKey(userId: string, rawCode: string): {
    success: boolean;
    message: string;
    subscription: UserSubscriptionDetails;
  } {
    const db = getDatabase();
    const cleanCode = rawCode.trim().toUpperCase();

    if (!cleanCode) {
      throw new Error('Please enter a valid license key.');
    }

    const key = db.prepare('SELECT * FROM license_keys WHERE code = ?').get(cleanCode) as any;

    if (!key) {
      throw new Error('Invalid license key. Please check your activation code and try again.');
    }

    if (key.status === 'revoked') {
      throw new Error(`This license key (${cleanCode}) has been revoked by administration.`);
    }

    if (key.is_used === 1 || key.status === 'used') {
      throw new Error(`This license key (${cleanCode}) has already been redeemed.`);
    }

    const plan = db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(key.plan_tier) as any;
    if (!plan) {
      throw new Error(`Plan tier "${key.plan_tier}" configured in license key was not found.`);
    }

    const isLifetime = key.duration_days <= 0 || key.duration_days >= 9999;
    const now = new Date();
    const user = db.prepare('SELECT subscription_expires_at FROM users WHERE id = ?').get(userId) as any;

    let newExpiry: string | null = null;
    if (!isLifetime) {
      let baseDate = now;
      if (user?.subscription_expires_at) {
        const existingExpiry = new Date(user.subscription_expires_at);
        if (existingExpiry.getTime() > now.getTime()) {
          baseDate = existingExpiry;
        }
      }
      newExpiry = new Date(baseDate.getTime() + key.duration_days * 24 * 3600 * 1000).toISOString();
    }

    const effectiveMaxDevices = key.max_devices_override || plan.max_devices || 1;
    const effectiveDailyLimit = key.daily_limit_override || plan.daily_message_limit || 100;
    const effectiveExtractionLimit = key.extraction_limit_override || plan.daily_extraction_limit || 500;

    // Mark key as redeemed
    db.prepare(`
      UPDATE license_keys
      SET is_used = 1, status = 'used', used_by_user_id = ?, used_at = datetime('now')
      WHERE id = ?
    `).run(userId, key.id);

    // Update user plan & active license code
    db.prepare(`
      UPDATE users
      SET plan_tier = ?,
          subscription_status = 'active',
          subscription_expires_at = ?,
          max_devices = ?,
          daily_message_limit = ?,
          daily_extraction_limit = ?,
          active_license_code = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(key.plan_tier, newExpiry, effectiveMaxDevices, effectiveDailyLimit, effectiveExtractionLimit, cleanCode, userId);

    // Record invoice
    db.prepare(`
      INSERT INTO subscription_invoices (id, user_id, plan_tier, amount, currency, billing_cycle, status, payment_method)
      VALUES (?, ?, ?, 0, 'INR', 'license_key', 'paid', ?)
    `).run(crypto.randomUUID(), userId, key.plan_tier, `key:${cleanCode}`);

    console.log(`[Subscription] User ${userId} successfully redeemed key ${cleanCode} for ${key.plan_tier} (${isLifetime ? 'Lifetime' : key.duration_days + ' days'}).`);

    const updatedSub = this.getUserSubscription(userId);

    return {
      success: true,
      message: `🎉 Successfully activated ${plan.name} (${isLifetime ? 'Lifetime Unlimited' : key.duration_days + ' days'})!`,
      subscription: updatedSub
    };
  }

  /**
   * Record a group extraction operation and check license limits
   */
  public recordExtraction(
    userId: string,
    contactsCount: number,
    options?: { groupId?: string; groupName?: string; extractionType?: string }
  ): {
    allowed: boolean;
    contactsExtracted: number;
    extractionsToday: number;
    dailyExtractionLimit: number;
    remaining: number;
  } {
    const db = getDatabase();
    const sub = this.getUserSubscription(userId);

    if (sub.status === 'expired' && sub.role !== 'admin') {
      const err: any = new Error('Your license has expired. Please activate a valid license key in the License System.');
      err.statusCode = 403;
      err.licenseExpired = true;
      throw err;
    }

    if (sub.role === 'admin') {
      db.prepare(`
        INSERT INTO extraction_logs (id, user_id, group_id, group_name, contacts_count, extraction_type, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(crypto.randomUUID(), userId, options?.groupId || null, options?.groupName || null, contactsCount, options?.extractionType || 'group_members');

      return {
        allowed: true,
        contactsExtracted: contactsCount,
        extractionsToday: sub.extractionsToday + contactsCount,
        dailyExtractionLimit: 999999,
        remaining: 999999
      };
    }

    const available = Math.max(0, sub.dailyExtractionLimit - sub.extractionsToday);
    if (available <= 0) {
      const err: any = new Error(
        `Daily extraction limit reached (${sub.extractionsToday}/${sub.dailyExtractionLimit} contacts extracted today as per your ${sub.planName} license). Please upgrade or extend your license to extract more.`
      );
      err.statusCode = 403;
      err.extractionLimitReached = true;
      throw err;
    }

    const actualToRecord = Math.min(contactsCount, available);

    db.prepare(`
      INSERT INTO extraction_logs (id, user_id, group_id, group_name, contacts_count, extraction_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(crypto.randomUUID(), userId, options?.groupId || null, options?.groupName || null, actualToRecord, options?.extractionType || 'group_members');

    const newTotal = sub.extractionsToday + actualToRecord;
    const remaining = Math.max(0, sub.dailyExtractionLimit - newTotal);

    return {
      allowed: true,
      contactsExtracted: actualToRecord,
      extractionsToday: newTotal,
      dailyExtractionLimit: sub.dailyExtractionLimit,
      remaining
    };
  }

  /**
   * Get remaining extraction quota for a user
   */
  public getRemainingExtractionQuota(userId: string): {
    dailyExtractionLimit: number;
    extractionsToday: number;
    remaining: number;
    isUnlimited: boolean;
  } {
    const sub = this.getUserSubscription(userId);
    const isUnlimited = sub.role === 'admin';
    return {
      dailyExtractionLimit: isUnlimited ? 999999 : sub.dailyExtractionLimit,
      extractionsToday: sub.extractionsToday,
      remaining: isUnlimited ? 999999 : sub.remainingExtractionsToday,
      isUnlimited
    };
  }

  /**
   * Generate a new License / Activation Key (Admin or Reseller)
   */
  public generateLicenseKey(
    creatorUserId: string,
    planTier: string,
    durationDays: number = 30,
    options?: {
      note?: string;
      maxDevices?: number;
      dailyLimit?: number;
      extractionLimit?: number;
    }
  ): {
    id: string;
    code: string;
    planTier: string;
    durationDays: number;
    maxDevices: number;
    dailyLimit: number;
    extractionLimit?: number;
    note?: string | null;
  } {
    const db = getDatabase();
    const creator = db.prepare('SELECT id, role, username, reseller_license_quota FROM users WHERE id = ?').get(creatorUserId) as any;

    if (!creator || (creator.role !== 'admin' && creator.role !== 'reseller')) {
      throw new Error('Permission denied. Only administrators and authorized resellers can generate license keys.');
    }

    if (creator.role === 'reseller') {
      const createdRow = db.prepare('SELECT COUNT(*) as count FROM license_keys WHERE created_by_user_id = ?').get(creatorUserId) as { count: number };
      const currentCreated = createdRow ? createdRow.count : 0;
      const quota = creator.reseller_license_quota || 0;
      const remaining = quota - currentCreated;
      if (remaining < 1) {
        throw new Error(`Reseller license quota limit reached (${currentCreated}/${quota} created). Contact Administrator to increase your license quota.`);
      }
    }

    const plan = db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(planTier) as any;
    if (!plan) {
      throw new Error(`Plan tier "${planTier}" does not exist.`);
    }

    const isLifetime = durationDays <= 0 || durationDays >= 9999;
    const finalDuration = isLifetime ? 9999 : Math.max(1, Math.floor(durationDays));

    const prefix = planTier.toUpperCase().slice(0, 3);
    const randPart1 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const randPart2 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const durationLabel = isLifetime ? 'LIFE' : `${finalDuration}D`;
    const code = `PVT-${prefix}-${durationLabel}-${randPart1}-${randPart2}`;

    const maxDevices = options?.maxDevices || plan.max_devices;
    const dailyLimit = options?.dailyLimit || plan.daily_message_limit;
    const extractionLimit = options?.extractionLimit || plan.daily_extraction_limit || 500;

    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO license_keys (
        id, code, plan_tier, duration_days, max_devices_override, daily_limit_override, extraction_limit_override,
        status, is_used, created_by, created_by_user_id, note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'available', 0, ?, ?, ?, datetime('now'))
    `).run(
      id,
      code,
      planTier,
      finalDuration,
      options?.maxDevices || null,
      options?.dailyLimit || null,
      options?.extractionLimit || null,
      creator.username || creatorUserId,
      creatorUserId,
      options?.note || null
    );

    console.log(`[License System] ${creator.role.toUpperCase()} ${creator.username} generated key: ${code} (${planTier}, ${durationLabel})`);

    return {
      id,
      code,
      planTier,
      durationDays: finalDuration,
      maxDevices,
      dailyLimit,
      extractionLimit,
      note: options?.note || null
    };
  }

  /**
   * Generate multiple License Keys in bulk (Admin or Reseller)
   */
  public bulkGenerateLicenseKeys(
    creatorUserId: string,
    planTier: string,
    durationDays: number = 30,
    count: number = 5,
    options?: {
      note?: string;
      maxDevices?: number;
      dailyLimit?: number;
      extractionLimit?: number;
    }
  ): any[] {
    const db = getDatabase();
    const creator = db.prepare('SELECT role, reseller_license_quota FROM users WHERE id = ?').get(creatorUserId) as any;

    if (!creator || (creator.role !== 'admin' && creator.role !== 'reseller')) {
      throw new Error('Permission denied. Only administrators and authorized resellers can generate license keys.');
    }

    const safeCount = Math.min(50, Math.max(1, Math.floor(count)));

    if (creator.role === 'reseller') {
      const createdRow = db.prepare('SELECT COUNT(*) as count FROM license_keys WHERE created_by_user_id = ?').get(creatorUserId) as { count: number };
      const currentCreated = createdRow ? createdRow.count : 0;
      const quota = creator.reseller_license_quota || 0;
      const remaining = quota - currentCreated;
      if (safeCount > remaining) {
        throw new Error(`Reseller quota limit: You have only ${remaining} credit(s) remaining (Assigned Quota: ${quota}). Cannot create ${safeCount} keys. Contact Administrator to increase your quota.`);
      }
    }

    const keys: any[] = [];
    for (let i = 0; i < safeCount; i++) {
      const k = this.generateLicenseKey(creatorUserId, planTier, durationDays, {
        ...options,
        note: options?.note ? `${options.note} (#${i + 1})` : undefined
      });
      keys.push(k);
    }
    return keys;
  }

  /**
   * Reseller: Get statistics and quota
   */
  public getResellerStats(userId: string): {
    totalQuota: number;
    keysCreated: number;
    remainingQuota: number;
    keysUsed: number;
    isReseller: boolean;
  } {
    const db = getDatabase();
    const user = db.prepare('SELECT id, role, reseller_license_quota FROM users WHERE id = ?').get(userId) as any;
    if (!user) {
      throw new Error('User not found');
    }

    const totalQuota = user.reseller_license_quota || 0;
    const createdRow = db.prepare('SELECT COUNT(*) as count FROM license_keys WHERE created_by_user_id = ?').get(userId) as { count: number };
    const usedRow = db.prepare("SELECT COUNT(*) as count FROM license_keys WHERE created_by_user_id = ? AND status = 'used'").get(userId) as { count: number };

    const keysCreated = createdRow ? createdRow.count : 0;
    const keysUsed = usedRow ? usedRow.count : 0;
    const remainingQuota = user.role === 'admin' ? 999999 : Math.max(0, totalQuota - keysCreated);

    return {
      totalQuota: user.role === 'admin' ? 999999 : totalQuota,
      keysCreated,
      remainingQuota,
      keysUsed,
      isReseller: user.role === 'reseller' || user.role === 'admin'
    };
  }

  /**
   * Reseller: List only keys generated by this reseller
   */
  public listResellerKeys(resellerUserId: string): any[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT l.*, u.username as used_by_username, u.name as used_by_name
      FROM license_keys l
      LEFT JOIN users u ON l.used_by_user_id = u.id
      WHERE l.created_by_user_id = ?
      ORDER BY l.created_at DESC
    `).all(resellerUserId);
  }

  /**
   * Reseller: Revoke a key created by this reseller
   */
  public revokeResellerKey(resellerUserId: string, keyId: string): { success: boolean; message: string } {
    const db = getDatabase();
    const key = db.prepare('SELECT * FROM license_keys WHERE id = ? AND created_by_user_id = ?').get(keyId, resellerUserId) as any;
    if (!key) {
      throw new Error('License key not found or you do not have permission to revoke it.');
    }

    db.prepare("UPDATE license_keys SET status = 'revoked' WHERE id = ?").run(keyId);

    if (key.used_by_user_id) {
      db.prepare(`
        UPDATE users 
        SET subscription_status = 'expired',
            subscription_expires_at = datetime('now'),
            active_license_code = NULL,
            updated_at = datetime('now')
        WHERE id = ? AND role != 'admin'
      `).run(key.used_by_user_id);
    }

    return {
      success: true,
      message: `License key "${key.code}" has been revoked successfully.`
    };
  }

  /**
   * Admin: List all resellers with their quotas and stats
   */
  public listAllResellers(adminUserId: string): ResellerRecord[] {
    const db = getDatabase();
    const admin = db.prepare('SELECT role FROM users WHERE id = ?').get(adminUserId) as any;
    if (!admin || admin.role !== 'admin') {
      throw new Error('Permission denied. Admin access required.');
    }

    const rows = db.prepare(`
      SELECT 
        u.id, u.username, u.name, u.email, u.phone, u.role,
        COALESCE(u.reseller_license_quota, 0) as reseller_license_quota,
        u.created_at,
        (SELECT COUNT(*) FROM license_keys WHERE created_by_user_id = u.id) as keys_created_count,
        (SELECT COUNT(*) FROM license_keys WHERE created_by_user_id = u.id AND status = 'used') as keys_used_count
      FROM users u
      WHERE u.role = 'reseller'
      ORDER BY u.created_at DESC
    `).all() as any[];

    return rows.map((r) => ({
      id: r.id,
      username: r.username,
      name: r.name,
      email: r.email,
      phone: r.phone,
      role: r.role,
      reseller_license_quota: r.reseller_license_quota,
      keys_created_count: r.keys_created_count,
      remaining_quota: Math.max(0, r.reseller_license_quota - r.keys_created_count),
      keys_used_count: r.keys_used_count,
      created_at: r.created_at
    }));
  }

  /**
   * Admin: Set or promote a user to reseller with license quota
   */
  public setResellerQuota(adminUserId: string, targetUserId: string, quota: number): { success: boolean; message: string } {
    const db = getDatabase();
    const admin = db.prepare('SELECT role FROM users WHERE id = ?').get(adminUserId) as any;
    if (!admin || admin.role !== 'admin') {
      throw new Error('Permission denied. Admin access required.');
    }

    const cleanQuota = Math.max(0, Math.floor(quota));
    db.prepare(`
      UPDATE users 
      SET role = 'reseller', reseller_license_quota = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(cleanQuota, targetUserId);

    return {
      success: true,
      message: `Updated reseller quota to ${cleanQuota} license(s).`
    };
  }

  /**
   * Admin: Add additional license credits to a reseller
   */
  public addResellerCredits(adminUserId: string, targetUserId: string, additionalCredits: number): { success: boolean; message: string; newQuota: number } {
    const db = getDatabase();
    const admin = db.prepare('SELECT role FROM users WHERE id = ?').get(adminUserId) as any;
    if (!admin || admin.role !== 'admin') {
      throw new Error('Permission denied. Admin access required.');
    }

    const credits = Math.max(1, Math.floor(additionalCredits));
    db.prepare(`
      UPDATE users 
      SET role = 'reseller', reseller_license_quota = COALESCE(reseller_license_quota, 0) + ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(credits, targetUserId);

    const user = db.prepare('SELECT reseller_license_quota FROM users WHERE id = ?').get(targetUserId) as any;
    return {
      success: true,
      message: `Added +${credits} license credits. New quota: ${user?.reseller_license_quota || credits}.`,
      newQuota: user?.reseller_license_quota || credits
    };
  }

  /**
   * Admin: Demote reseller back to normal user
   */
  public demoteReseller(adminUserId: string, targetUserId: string): { success: boolean; message: string } {
    const db = getDatabase();
    const admin = db.prepare('SELECT role FROM users WHERE id = ?').get(adminUserId) as any;
    if (!admin || admin.role !== 'admin') {
      throw new Error('Permission denied. Admin access required.');
    }

    db.prepare(`
      UPDATE users 
      SET role = 'user', reseller_license_quota = 0, updated_at = datetime('now')
      WHERE id = ? AND role != 'admin'
    `).run(targetUserId);

    return {
      success: true,
      message: 'Demoted reseller back to normal user.'
    };
  }

  /**
   * Admin: Revoke a License Key
   */
  public revokeLicenseKey(adminUserId: string, keyId: string): { success: boolean; message: string } {
    const db = getDatabase();
    const admin = db.prepare('SELECT role FROM users WHERE id = ?').get(adminUserId) as any;
    if (!admin || admin.role !== 'admin') {
      throw new Error('Permission denied. Admin access required.');
    }

    const key = db.prepare('SELECT * FROM license_keys WHERE id = ?').get(keyId) as any;
    if (!key) {
      throw new Error('License key not found.');
    }

    db.prepare("UPDATE license_keys SET status = 'revoked' WHERE id = ?").run(keyId);

    // If key was redeemed by a user, revoke user's active license immediately
    if (key.used_by_user_id) {
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(key.used_by_user_id) as any;
      if (user && user.role !== 'admin' && user.active_license_code === key.code) {
        db.prepare(`
          UPDATE users 
          SET subscription_status = 'expired',
              subscription_expires_at = datetime('now'),
              active_license_code = NULL,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(user.id);
        console.log(`[License System] Revoked active license for user ${user.username} (${user.id})`);
      }
    }

    return {
      success: true,
      message: `License key "${key.code}" has been revoked successfully.`
    };
  }

  /**
   * Admin: Delete an unused or revoked License Key
   */
  public deleteLicenseKey(adminUserId: string, keyId: string): { success: boolean; message: string } {
    const db = getDatabase();
    const admin = db.prepare('SELECT role FROM users WHERE id = ?').get(adminUserId) as any;
    if (!admin || admin.role !== 'admin') {
      throw new Error('Permission denied. Admin access required.');
    }

    const key = db.prepare('SELECT * FROM license_keys WHERE id = ?').get(keyId) as any;
    if (!key) {
      throw new Error('License key not found.');
    }

    if (key.is_used === 1 && key.status !== 'revoked') {
      throw new Error('Cannot delete an active redeemed license key. Please revoke it instead.');
    }

    db.prepare('DELETE FROM license_keys WHERE id = ?').run(keyId);
    return {
      success: true,
      message: `License key "${key.code}" deleted successfully.`
    };
  }

  /**
   * Admin: List all license keys
   */
  public listLicenseKeys(adminUserId: string): any[] {
    const db = getDatabase();
    const admin = db.prepare('SELECT role FROM users WHERE id = ?').get(adminUserId) as any;
    if (!admin || admin.role !== 'admin') {
      throw new Error('Permission denied. Admin access required.');
    }

    return db.prepare(`
      SELECT l.*, u.username as used_by_username, u.name as used_by_name
      FROM license_keys l
      LEFT JOIN users u ON l.used_by_user_id = u.id
      ORDER BY l.created_at DESC
      LIMIT 200
    `).all();
  }

  /**
   * Admin: List all registered customers and their subscriptions
   */
  public listAllCustomers(adminUserId: string): any[] {
    const db = getDatabase();
    const admin = db.prepare('SELECT role FROM users WHERE id = ?').get(adminUserId) as any;
    if (!admin || admin.role !== 'admin') {
      throw new Error('Permission denied. Admin access required.');
    }

    return db.prepare(`
      SELECT 
        u.id, u.username, u.email, u.name, u.company_name, u.phone, u.role,
        u.plan_tier, u.subscription_status, u.subscription_expires_at,
        u.max_devices, u.daily_message_limit, u.daily_extraction_limit, u.reseller_license_quota,
        u.active_license_code, u.created_at,
        (SELECT COUNT(*) FROM whatsapp_sessions WHERE user_id = u.id) as connected_devices
      FROM users u
      ORDER BY u.created_at DESC
    `).all();
  }

  /**
   * Admin: Manually set a customer's subscription plan and limits
   */
  public adminUpdateCustomerPlan(
    adminUserId: string,
    targetUserId: string,
    data: {
      planTier: string;
      subscriptionStatus?: string;
      durationDays?: number;
      maxDevices?: number;
      dailyLimit?: number;
      extractionLimit?: number;
    }
  ): UserSubscriptionDetails {
    const db = getDatabase();
    const admin = db.prepare('SELECT role FROM users WHERE id = ?').get(adminUserId) as any;
    if (!admin || admin.role !== 'admin') {
      throw new Error('Permission denied. Admin access required.');
    }

    const plan = db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(data.planTier) as any;
    const maxDevices = data.maxDevices !== undefined ? data.maxDevices : (plan ? plan.max_devices : 1);
    const dailyLimit = data.dailyLimit !== undefined ? data.dailyLimit : (plan ? plan.daily_message_limit : 100);
    const extractionLimit = data.extractionLimit !== undefined ? data.extractionLimit : (plan ? plan.daily_extraction_limit : 500);
    const status = data.subscriptionStatus || 'active';

    const currentUser = db.prepare('SELECT subscription_expires_at FROM users WHERE id = ?').get(targetUserId) as any;
    let newExpiry: string | null = currentUser?.subscription_expires_at || null;
    if (data.durationDays !== undefined) {
      if (data.durationDays <= 0 || data.durationDays >= 9999) {
        newExpiry = null; // Lifetime!
      } else {
        newExpiry = new Date(Date.now() + data.durationDays * 24 * 3600 * 1000).toISOString();
      }
    }

    db.prepare(`
      UPDATE users
      SET plan_tier = ?,
          subscription_status = ?,
          subscription_expires_at = ?,
          max_devices = ?,
          daily_message_limit = ?,
          daily_extraction_limit = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(data.planTier, status, newExpiry, maxDevices, dailyLimit, extractionLimit, targetUserId);

    return this.getUserSubscription(targetUserId);
  }

  /**
   * Admin: Update limits, features, and pricing for a subscription plan tier (Trial, Starter, Pro, Enterprise)
   */
  public adminUpdatePlan(
    adminUserId: string,
    planId: string,
    data: {
      name?: string;
      tagline?: string;
      maxDevices?: number;
      dailyMessageLimit?: number;
      dailyExtractionLimit?: number;
      priceMonthly?: number;
      priceYearly?: number;
      features?: string[];
      trialDays?: number;
    }
  ): SubscriptionPlanRecord {
    const db = getDatabase();
    const admin = db.prepare('SELECT role FROM users WHERE id = ?').get(adminUserId) as any;
    if (!admin || admin.role !== 'admin') {
      throw new Error('Permission denied. Admin access required.');
    }

    const currentPlan = db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(planId) as any;
    if (!currentPlan) {
      throw new Error(`Plan "${planId}" not found.`);
    }

    const name = data.name !== undefined ? data.name : currentPlan.name;
    const tagline = data.tagline !== undefined ? data.tagline : currentPlan.tagline;
    const maxDevices = data.maxDevices !== undefined ? Math.max(1, data.maxDevices) : currentPlan.max_devices;
    const dailyMessageLimit = data.dailyMessageLimit !== undefined ? Math.max(1, data.dailyMessageLimit) : currentPlan.daily_message_limit;
    const dailyExtractionLimit = data.dailyExtractionLimit !== undefined ? Math.max(1, data.dailyExtractionLimit) : currentPlan.daily_extraction_limit;
    const priceMonthly = data.priceMonthly !== undefined ? Math.max(0, data.priceMonthly) : currentPlan.price_monthly;
    const priceYearly = data.priceYearly !== undefined ? Math.max(0, data.priceYearly) : currentPlan.price_yearly;
    const features = data.features ? JSON.stringify(data.features) : currentPlan.features;

    db.prepare(`
      UPDATE subscription_plans
      SET name = ?,
          tagline = ?,
          max_devices = ?,
          daily_message_limit = ?,
          daily_extraction_limit = ?,
          price_monthly = ?,
          price_yearly = ?,
          features = ?
      WHERE id = ?
    `).run(name, tagline, maxDevices, dailyMessageLimit, dailyExtractionLimit, priceMonthly, priceYearly, features, planId);

    // If trial plan duration was updated, save to application_settings as well
    if (planId === 'trial' && data.trialDays !== undefined) {
      db.prepare(`
        INSERT INTO application_settings (key, value, updated_at)
        VALUES ('trial_duration_days', ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
      `).run(String(Math.max(1, data.trialDays)));
    }

    console.log(`[Subscription Service] Admin updated plan ${planId} limits: msgs=${dailyMessageLimit}, extractions=${dailyExtractionLimit}, devices=${maxDevices}`);

    const updatedPlan = this.getPlans().find((p) => p.id === planId);
    if (!updatedPlan) {
      throw new Error(`Failed to retrieve updated plan ${planId}`);
    }
    return updatedPlan;
  }

  /**
   * Admin: Get application & trial system settings
   */
  public adminGetSystemSettings(adminUserId: string): Record<string, string> {
    const db = getDatabase();
    const admin = db.prepare('SELECT role FROM users WHERE id = ?').get(adminUserId) as any;
    if (!admin || admin.role !== 'admin') {
      throw new Error('Permission denied. Admin access required.');
    }

    const rows = db.prepare('SELECT key, value FROM application_settings').all() as { key: string; value: string }[];
    const settings: Record<string, string> = {};
    for (const r of rows) {
      settings[r.key] = r.value;
    }
    return settings;
  }

  /**
   * Admin: Update application & trial system settings
   */
  public adminUpdateSystemSettings(adminUserId: string, newSettings: Record<string, string>): Record<string, string> {
    const db = getDatabase();
    const admin = db.prepare('SELECT role FROM users WHERE id = ?').get(adminUserId) as any;
    if (!admin || admin.role !== 'admin') {
      throw new Error('Permission denied. Admin access required.');
    }

    const upsertStmt = db.prepare(`
      INSERT INTO application_settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `);

    for (const [key, value] of Object.entries(newSettings)) {
      upsertStmt.run(key, String(value));
    }

    return this.adminGetSystemSettings(adminUserId);
  }
}
