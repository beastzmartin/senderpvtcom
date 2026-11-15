import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getDatabase, verifyPassword, hashPassword } from '../db/database.js';
import { config } from '../config.js';

export interface UserRecord {
  id: string;
  username: string;
  name: string;
  email?: string | null;
  company_name?: string | null;
  phone?: string | null;
  role: string;
  plan_tier: string;
  subscription_status: string;
  subscription_expires_at?: string | null;
  max_devices: number;
  daily_message_limit: number;
  daily_extraction_limit?: number;
  days_remaining?: number | null;
  is_active?: boolean;
  created_at: string;
}

export interface RegisterDTO {
  username: string;
  password: string;
  name?: string;
  email?: string;
  company_name?: string;
  phone?: string;
  plan_tier?: string;
}

export class AuthService {
  private static instance: AuthService | null = null;

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  private mapUserRow(row: any): UserRecord {
    let daysRemaining: number | null = null;
    if (row.subscription_expires_at) {
      const expiry = new Date(row.subscription_expires_at).getTime();
      const now = Date.now();
      daysRemaining = Math.max(0, Math.ceil((expiry - now) / (1000 * 60 * 60 * 24)));
    } else if (row.role === 'admin') {
      daysRemaining = 9999;
    }

    return {
      id: row.id,
      username: row.username,
      name: row.name,
      email: row.email || null,
      company_name: row.company_name || null,
      phone: row.phone || null,
      role: row.role || 'user',
      plan_tier: row.plan_tier || 'starter',
      subscription_status: row.subscription_status || 'active',
      subscription_expires_at: row.subscription_expires_at || null,
      max_devices: row.max_devices || 1,
      daily_message_limit: row.daily_message_limit || 100,
      daily_extraction_limit: row.daily_extraction_limit || 500,
      days_remaining: daysRemaining,
      is_active: row.is_active !== 0,
      created_at: row.created_at
    };
  }

  public login(usernameOrEmail: string, password: string): { token: string; user: UserRecord } {
    const db = getDatabase();
    const cleanIdentifier = usernameOrEmail.trim().toLowerCase();

    const stmt = db.prepare(`
      SELECT * FROM users
      WHERE LOWER(username) = ? OR LOWER(COALESCE(email, '')) = ?
    `);
    const userRow = stmt.get(cleanIdentifier, cleanIdentifier) as any;

    if (!userRow) {
      throw new Error('Invalid username, email, or password.');
    }

    if (userRow.is_active === 0) {
      throw new Error('Your account is currently disabled. Please contact support.');
    }

    const isValid = verifyPassword(password, userRow.password_hash);
    if (!isValid) {
      throw new Error('Invalid username, email, or password.');
    }

    const user = this.mapUserRow(userRow);

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        plan_tier: user.plan_tier
      },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    return { token, user };
  }

  public register(dto: RegisterDTO): { token: string; user: UserRecord } {
    const db = getDatabase();
    const cleanUsername = dto.username.trim().toLowerCase();

    if (!cleanUsername || cleanUsername.length < 3) {
      throw new Error('Username must be at least 3 characters long.');
    }

    if (!/^[a-zA-Z0-9_.-]+$/.test(cleanUsername)) {
      throw new Error('Username can only contain letters, numbers, dots, hyphens, and underscores.');
    }

    if (!dto.password || dto.password.length < 4) {
      throw new Error('Password must be at least 4 characters long.');
    }

    const cleanEmail = dto.email ? dto.email.trim().toLowerCase() : null;
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      throw new Error('Please enter a valid email address.');
    }

    // Check username collision
    const checkUsername = db.prepare('SELECT id FROM users WHERE LOWER(username) = ?').get(cleanUsername);
    if (checkUsername) {
      throw new Error(`Username "${cleanUsername}" is already taken. Please choose another.`);
    }

    // Check email collision
    if (cleanEmail) {
      const checkEmail = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(cleanEmail);
      if (checkEmail) {
        throw new Error(`An account with email "${cleanEmail}" already exists. Please sign in instead.`);
      }
    }

    // First user registered becomes admin with Enterprise tier, subsequent users get Free Trial
    const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
    const isFirstUser = userCount === 0;

    const role = isFirstUser ? 'admin' : 'user';
    const planTier = isFirstUser ? 'enterprise' : 'trial';

    // Get trial configuration from settings or trial plan
    const trialDaysSetting = db.prepare("SELECT value FROM application_settings WHERE key = 'trial_duration_days'").get() as { value: string } | undefined;
    const trialDays = trialDaysSetting ? parseInt(trialDaysSetting.value, 10) || 3 : 3;

    // Get plan details for quotas
    const plan = db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(planTier) as any;
    const maxDevices = isFirstUser ? 10 : (plan ? plan.max_devices : 1);
    const dailyLimit = isFirstUser ? 10000 : (plan ? plan.daily_message_limit : 25);
    const extractionLimit = isFirstUser ? 50000 : (plan ? plan.daily_extraction_limit : 50);

    const subscriptionStatus = isFirstUser ? 'active' : 'trialing';
    const subscriptionExpiresAt = isFirstUser
      ? null
      : new Date(Date.now() + trialDays * 24 * 3600 * 1000).toISOString();

    const id = crypto.randomUUID();
    const passwordHash = hashPassword(dto.password);
    const displayName = (dto.name || cleanUsername).trim();
    const companyName = dto.company_name ? dto.company_name.trim() : null;
    const phone = dto.phone ? dto.phone.trim() : null;
    const now = new Date().toISOString();

    const insertStmt = db.prepare(`
      INSERT INTO users (
        id, username, email, password_hash, name, company_name, phone, role,
        plan_tier, subscription_status, subscription_expires_at, max_devices, daily_message_limit, daily_extraction_limit, is_active, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);

    insertStmt.run(
      id,
      cleanUsername,
      cleanEmail,
      passwordHash,
      displayName,
      companyName,
      phone,
      role,
      planTier,
      subscriptionStatus,
      subscriptionExpiresAt,
      maxDevices,
      dailyLimit,
      extractionLimit,
      now,
      now
    );

    const user: UserRecord = {
      id,
      username: cleanUsername,
      name: displayName,
      email: cleanEmail,
      company_name: companyName,
      phone,
      role,
      plan_tier: planTier,
      subscription_status: subscriptionStatus,
      subscription_expires_at: subscriptionExpiresAt,
      max_devices: maxDevices,
      daily_message_limit: dailyLimit,
      daily_extraction_limit: extractionLimit,
      days_remaining: isFirstUser ? 9999 : trialDays,
      created_at: now
    };

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        plan_tier: user.plan_tier
      },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    console.log(`[Auth Service] Registered new user "${cleanUsername}" on ${planTier} plan.`);

    return { token, user };
  }

  public listUsers(): UserRecord[] {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM users ORDER BY created_at ASC').all() as any[];
    return rows.map((r) => this.mapUserRow(r));
  }

  public getUserById(id: string): UserRecord | null {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    const row = stmt.get(id);
    if (!row) return null;
    return this.mapUserRow(row);
  }

  public updateProfile(
    userId: string,
    data: { name?: string; email?: string; company_name?: string; phone?: string }
  ): UserRecord {
    const db = getDatabase();
    const existing = this.getUserById(userId);
    if (!existing) {
      throw new Error(`User with ID ${userId} not found.`);
    }

    if (data.email) {
      const cleanEmail = data.email.trim().toLowerCase();
      const conflict = db
        .prepare('SELECT id FROM users WHERE LOWER(email) = ? AND id != ?')
        .get(cleanEmail, userId);
      if (conflict) {
        throw new Error(`Email "${cleanEmail}" is already used by another account.`);
      }
    }

    const name = data.name !== undefined ? data.name.trim() : existing.name;
    const email = data.email !== undefined ? (data.email ? data.email.trim().toLowerCase() : null) : existing.email;
    const company = data.company_name !== undefined ? (data.company_name ? data.company_name.trim() : null) : existing.company_name;
    const phone = data.phone !== undefined ? (data.phone ? data.phone.trim() : null) : existing.phone;

    db.prepare(`
      UPDATE users
      SET name = ?, email = ?, company_name = ?, phone = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(name, email, company, phone, userId);

    return this.getUserById(userId)!;
  }

  public changePassword(userId: string, oldPass: string, newPass: string): void {
    const db = getDatabase();
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as any;
    if (!row) {
      throw new Error('User not found.');
    }

    if (!verifyPassword(oldPass, row.password_hash)) {
      throw new Error('Incorrect current password.');
    }

    if (!newPass || newPass.length < 4) {
      throw new Error('New password must be at least 4 characters long.');
    }

    const newHash = hashPassword(newPass);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ?').run(newHash, userId);
  }

  /**
   * Super Admin Impersonation: Generate login token for any target user
   */
  public impersonateUser(adminUserId: string, targetUserId: string): { token: string; user: UserRecord } {
    const db = getDatabase();
    const admin = db.prepare('SELECT role, username FROM users WHERE id = ?').get(adminUserId) as any;
    if (!admin || admin.role !== 'admin') {
      throw new Error('Access denied. Administrator privileges required.');
    }

    const targetUser = this.getUserById(targetUserId);
    if (!targetUser) {
      throw new Error(`Target user with ID "${targetUserId}" not found.`);
    }

    const token = jwt.sign(
      {
        id: targetUser.id,
        username: targetUser.username,
        role: targetUser.role,
        plan_tier: targetUser.plan_tier,
        isImpersonated: true,
        impersonatedBy: adminUserId,
        adminUsername: admin.username
      },
      config.jwtSecret,
      { expiresIn: '1d' }
    );

    console.log(`[Admin Impersonation] Admin "${admin.username}" logged in as user "${targetUser.username}" (${targetUser.id}).`);

    return { token, user: targetUser };
  }

  /**
   * Admin Reset Password for any user
   */
  public adminResetPassword(adminUserId: string, targetUserId: string, newPass: string): void {
    const db = getDatabase();
    const admin = db.prepare('SELECT role FROM users WHERE id = ?').get(adminUserId) as any;
    if (!admin || admin.role !== 'admin') {
      throw new Error('Access denied. Administrator privileges required.');
    }

    if (!newPass || newPass.length < 4) {
      throw new Error('Password must be at least 4 characters long.');
    }

    const target = this.getUserById(targetUserId);
    if (!target) {
      throw new Error('Target user not found.');
    }

    const newHash = hashPassword(newPass);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ?').run(newHash, targetUserId);
    console.log(`[Admin Action] Admin reset password for user "${target.username}".`);
  }

  /**
   * Admin Toggle User Active/Disabled status
   */
  public adminToggleUserStatus(adminUserId: string, targetUserId: string, isActive: boolean): void {
    const db = getDatabase();
    const admin = db.prepare('SELECT role FROM users WHERE id = ?').get(adminUserId) as any;
    if (!admin || admin.role !== 'admin') {
      throw new Error('Access denied. Administrator privileges required.');
    }

    if (adminUserId === targetUserId) {
      throw new Error('You cannot deactivate your own admin account.');
    }

    db.prepare('UPDATE users SET is_active = ?, updated_at = datetime("now") WHERE id = ?').run(isActive ? 1 : 0, targetUserId);
  }

  /**
   * Admin Delete User
   */
  public adminDeleteUser(adminUserId: string, targetUserId: string): void {
    const db = getDatabase();
    const admin = db.prepare('SELECT role FROM users WHERE id = ?').get(adminUserId) as any;
    if (!admin || admin.role !== 'admin') {
      throw new Error('Access denied. Administrator privileges required.');
    }

    if (adminUserId === targetUserId) {
      throw new Error('You cannot delete your own admin account.');
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(targetUserId);
    console.log(`[Admin Action] Deleted user ID "${targetUserId}".`);
  }

  public verifyToken(token: string): { id: string; username: string; role: string; plan_tier?: string; isImpersonated?: boolean; impersonatedBy?: string; adminUsername?: string } | null {
    try {
      const decoded = jwt.verify(token, config.jwtSecret) as any;
      return decoded;
    } catch {
      return null;
    }
  }
}
