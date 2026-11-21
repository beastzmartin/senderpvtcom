import os from 'os';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getDatabase } from '../db/database.js';
import { config } from '../config.js';

export interface AppLicense {
  id: number;
  license_key: string;
  hwid: string;
  plan_tier: 'starter' | 'pro' | 'enterprise';
  status: 'active' | 'expired' | 'deactivated';
  activated_at: string;
  expires_at: string | null;
  is_lifetime: boolean;
  daily_message_limit: number;
  daily_extraction_limit: number;
  max_devices: number;
  features: string[];
  signature: string;
  last_verified_at: string;
}

export interface LicenseUsage {
  messagesSentToday: number;
  dailyMessageLimit: number;
  extractionsDoneToday: number;
  dailyExtractionLimit: number;
  connectedDevices: number;
  maxDevices: number;
}

export interface LicenseStatusResult {
  active: boolean;
  hwid: string;
  license?: AppLicense;
  usage?: LicenseUsage;
  reason?: string;
}

const LICENSE_SECRET = process.env.LICENSE_SECRET || 'PVT_SECURE_HMAC_SALT_KEY_WHATSAPP_DESKTOP_2026';

export class LicenseService {
  private static instance: LicenseService;
  private cachedHwid: string | null = null;

  public static getInstance(): LicenseService {
    if (!LicenseService.instance) {
      LicenseService.instance = new LicenseService();
    }
    return LicenseService.instance;
  }

  /**
   * Generates or retrieves a persistent Hardware Fingerprint (HWID).
   * Gathers CPU, network MAC address, platform and hostname, hashes via SHA-256.
   * Persists to disk at <dataDir>/.hwid to ensure consistency across network state changes.
   */
  public getHardwareId(): string {
    if (this.cachedHwid) {
      return this.cachedHwid;
    }

    const hwidFilePath = path.join(config.dataDir, '.hwid');
    try {
      if (fs.existsSync(hwidFilePath)) {
        const stored = fs.readFileSync(hwidFilePath, 'utf8').trim();
        if (stored && stored.startsWith('PVT-') && stored.length >= 16) {
          this.cachedHwid = stored;
          return stored;
        }
      }
    } catch {}

    // Gather hardware identifiers
    const cpuModel = os.cpus()[0]?.model || 'generic-cpu';
    const cpuCount = os.cpus().length;
    const arch = os.arch();
    const platform = os.platform();
    const hostname = os.hostname();
    const networkInterfaces = os.networkInterfaces();

    let macAddress = '00:00:00:00:00:00';
    for (const ifaceName of Object.keys(networkInterfaces)) {
      const iface = networkInterfaces[ifaceName];
      if (iface) {
        for (const alias of iface) {
          if (!alias.internal && alias.mac && alias.mac !== '00:00:00:00:00:00') {
            macAddress = alias.mac;
            break;
          }
        }
      }
      if (macAddress !== '00:00:00:00:00:00') break;
    }

    const rawFingerprint = `${platform}|${arch}|${cpuModel}|${cpuCount}|${macAddress}|${hostname}`;
    const hash = crypto.createHash('sha256').update(rawFingerprint).digest('hex').toUpperCase();

    // Format as PVT-XXXX-XXXX-XXXX-XXXX
    const p1 = hash.substring(0, 4);
    const p2 = hash.substring(4, 8);
    const p3 = hash.substring(8, 12);
    const p4 = hash.substring(12, 16);
    const hwid = `PVT-${p1}-${p2}-${p3}-${p4}`;

    try {
      fs.mkdirSync(config.dataDir, { recursive: true });
      fs.writeFileSync(hwidFilePath, hwid, 'utf8');
    } catch (e) {
      console.warn('[LicenseService] Could not persist .hwid file:', e);
    }

    this.cachedHwid = hwid;
    return hwid;
  }

  /**
   * Computes HMAC-SHA256 signature for cryptographic validation
   */
  public computeSignature(payload: string): string {
    return crypto.createHmac('sha256', LICENSE_SECRET).update(payload).digest('hex').substring(0, 16).toUpperCase();
  }

  /**
   * Generates a signed cryptographic license key for a given HWID (or UNIVERSAL)
   */
  public generateSignedKey(options: {
    tier?: 'starter' | 'pro' | 'enterprise';
    days?: number;
    isLifetime?: boolean;
    hwid?: string;
    dailyMsgLimit?: number;
    dailyExtLimit?: number;
    maxDevices?: number;
  }): string {
    const tier = options.tier || 'pro';
    const hwidTarget = options.hwid ? options.hwid.trim().toUpperCase() : 'UNIVERSAL';
    let expiryStr: string;

    if (options.isLifetime || !options.days || options.days >= 9999) {
      expiryStr = 'LIFETIME';
    } else {
      const expDate = new Date(Date.now() + options.days * 24 * 3600 * 1000);
      const yyyy = expDate.getUTCFullYear();
      const mm = String(expDate.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(expDate.getUTCDate()).padStart(2, '0');
      expiryStr = `${yyyy}${mm}${dd}`;
    }

    const maxDev = options.maxDevices || (tier === 'enterprise' ? 10 : tier === 'pro' ? 5 : 2);
    const msgLim = options.dailyMsgLimit || (tier === 'enterprise' ? 20000 : tier === 'pro' ? 5000 : 1000);
    const extLim = options.dailyExtLimit || (tier === 'enterprise' ? 20000 : tier === 'pro' ? 5000 : 1000);

    const payload = `${hwidTarget}:${tier.toUpperCase()}:${expiryStr}:${maxDev}:${msgLim}:${extLim}`;
    const sig = this.computeSignature(payload);

    return `PVT-${tier.toUpperCase()}-${expiryStr}-${sig}`;
  }

  /**
   * Validates a license key against the local machine HWID or database
   */
  public validateKey(rawKey: string, machineHwid: string): {
    valid: boolean;
    tier: 'starter' | 'pro' | 'enterprise';
    expiresAt: string | null;
    isLifetime: boolean;
    maxDevices: number;
    dailyMessageLimit: number;
    dailyExtractionLimit: number;
    signature: string;
    source: 'crypto' | 'database' | 'master';
    reason?: string;
  } {
    const key = rawKey.trim().toUpperCase();

    if (!key) {
      return { valid: false, tier: 'starter', expiresAt: null, isLifetime: false, maxDevices: 1, dailyMessageLimit: 100, dailyExtractionLimit: 100, signature: '', source: 'crypto', reason: 'Key cannot be empty.' };
    }

    // 1. MASTER DEVELOPER / BYPASS KEYS
    if (
      key === 'PVT-MASTER-LIFETIME-ENTERPRISE' ||
      key === 'PVT-OFFLINE-DEVELOPER-UNLIMITED' ||
      key === 'MASTER-LIFETIME-ENTERPRISE'
    ) {
      return {
        valid: true,
        tier: 'enterprise',
        expiresAt: null,
        isLifetime: true,
        maxDevices: 25,
        dailyMessageLimit: 50000,
        dailyExtractionLimit: 50000,
        signature: 'MASTER-BYPASS-SIGNATURE',
        source: 'master'
      };
    }

    // 2. CRYPTOGRAPHIC SIGNED KEYS (e.g. PVT-ENTERPRISE-LIFETIME-ABCD1234EF567890 or PVT-PRO-20271231-...)
    const cryptoMatch = key.match(/^PVT-(STARTER|PRO|ENTERPRISE)-(LIFETIME|\d{8})-([A-F0-9]{8,16})$/i);
    if (cryptoMatch) {
      const tier = cryptoMatch[1].toLowerCase() as 'starter' | 'pro' | 'enterprise';
      const expiryStr = cryptoMatch[2].toUpperCase();
      const providedSig = cryptoMatch[3].toUpperCase();

      const maxDev = tier === 'enterprise' ? 10 : tier === 'pro' ? 5 : 2;
      const msgLim = tier === 'enterprise' ? 20000 : tier === 'pro' ? 5000 : 1000;
      const extLim = tier === 'enterprise' ? 20000 : tier === 'pro' ? 5000 : 1000;

      // Verify for this machine's HWID OR Universal HWID
      const hwidPayload = `${machineHwid}:${tier.toUpperCase()}:${expiryStr}:${maxDev}:${msgLim}:${extLim}`;
      const universalPayload = `UNIVERSAL:${tier.toUpperCase()}:${expiryStr}:${maxDev}:${msgLim}:${extLim}`;

      const expectedHwidSig = this.computeSignature(hwidPayload);
      const expectedUniversalSig = this.computeSignature(universalPayload);

      const sigMatches =
        providedSig === expectedHwidSig ||
        providedSig === expectedUniversalSig ||
        expectedHwidSig.startsWith(providedSig) ||
        expectedUniversalSig.startsWith(providedSig);

      if (sigMatches) {
        let expiresAt: string | null = null;
        let isLifetime = false;

        if (expiryStr === 'LIFETIME') {
          isLifetime = true;
        } else {
          const y = parseInt(expiryStr.substring(0, 4), 10);
          const m = parseInt(expiryStr.substring(4, 6), 10) - 1;
          const d = parseInt(expiryStr.substring(6, 8), 10);
          const expDate = new Date(Date.UTC(y, m, d, 23, 59, 59));
          if (expDate.getTime() < Date.now()) {
            return {
              valid: false,
              tier,
              expiresAt: expDate.toISOString(),
              isLifetime: false,
              maxDevices: maxDev,
              dailyMessageLimit: msgLim,
              dailyExtractionLimit: extLim,
              signature: providedSig,
              source: 'crypto',
              reason: `License expired on ${expDate.toISOString().split('T')[0]}.`
            };
          }
          expiresAt = expDate.toISOString();
        }

        return {
          valid: true,
          tier,
          expiresAt,
          isLifetime,
          maxDevices: maxDev,
          dailyMessageLimit: msgLim,
          dailyExtractionLimit: extLim,
          signature: providedSig,
          source: 'crypto'
        };
      }
    }

    // 3. DATABASE REGISTERED KEYS (from license_keys table)
    const db = getDatabase();
    try {
      const dbKey = db.prepare('SELECT * FROM license_keys WHERE code = ?').get(key) as any;
      if (dbKey) {
        if (dbKey.status === 'revoked') {
          return { valid: false, tier: 'starter', expiresAt: null, isLifetime: false, maxDevices: 1, dailyMessageLimit: 100, dailyExtractionLimit: 100, signature: '', source: 'database', reason: 'This license key has been revoked.' };
        }

        // If already bound to another HWID
        if (dbKey.bound_hwid && dbKey.bound_hwid !== machineHwid) {
          return {
            valid: false,
            tier: dbKey.plan_tier || 'pro',
            expiresAt: null,
            isLifetime: false,
            maxDevices: 1,
            dailyMessageLimit: 100,
            dailyExtractionLimit: 100,
            signature: '',
            source: 'database',
            reason: `License is locked to hardware ID (${dbKey.bound_hwid}) and cannot be used on another computer.`
          };
        }

        const tier = (dbKey.plan_tier || 'pro').toLowerCase() as 'starter' | 'pro' | 'enterprise';
        const isLifetime = dbKey.duration_days <= 0 || dbKey.duration_days >= 9999;
        const expiresAt = isLifetime
          ? null
          : new Date(Date.now() + dbKey.duration_days * 24 * 3600 * 1000).toISOString();

        const maxDev = dbKey.max_devices_override || (tier === 'enterprise' ? 10 : tier === 'pro' ? 5 : 2);
        const msgLim = dbKey.daily_limit_override || (tier === 'enterprise' ? 10000 : tier === 'pro' ? 2500 : 500);
        const extLim = dbKey.extraction_limit_override || (tier === 'enterprise' ? 10000 : tier === 'pro' ? 2500 : 500);

        return {
          valid: true,
          tier,
          expiresAt,
          isLifetime,
          maxDevices: maxDev,
          dailyMessageLimit: msgLim,
          dailyExtractionLimit: extLim,
          signature: this.computeSignature(`${machineHwid}:${key}:${tier}`),
          source: 'database'
        };
      }
    } catch (e) {
      console.warn('[LicenseService] DB key lookup error:', e);
    }

    return {
      valid: false,
      tier: 'starter',
      expiresAt: null,
      isLifetime: false,
      maxDevices: 1,
      dailyMessageLimit: 100,
      dailyExtractionLimit: 100,
      signature: '',
      source: 'crypto',
      reason: 'Invalid license key. Please check your activation code or contact support.'
    };
  }

  /**
   * Activates a license key on the current machine and persists to SQLite.
   */
  public activateLicense(rawKey: string): { success: boolean; message: string; license?: AppLicense } {
    const hwid = this.getHardwareId();
    const cleanKey = rawKey.trim().toUpperCase();

    const validation = this.validateKey(cleanKey, hwid);
    if (!validation.valid) {
      throw new Error(validation.reason || 'Invalid license key.');
    }

    const db = getDatabase();
    const nowIso = new Date().toISOString();

    // Features list based on plan
    const features = [
      'offline_local_storage',
      'whatsapp_direct_messaging',
      'bulk_messaging_engine',
      'group_member_extractor',
      'community_subgroup_extractor',
      'lid_link_generator',
      'crm_pipeline_manager',
      'scheduled_campaigns'
    ];
    if (validation.tier === 'enterprise') {
      features.push('unlimited_devices', 'api_access', 'vault_export_priority');
    }

    // Upsert into app_license (single record id=1)
    db.prepare(`
      INSERT INTO app_license (
        id, license_key, hwid, plan_tier, status, activated_at, expires_at,
        is_lifetime, daily_message_limit, daily_extraction_limit, max_devices,
        features, signature, last_verified_at
      )
      VALUES (1, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        license_key = excluded.license_key,
        hwid = excluded.hwid,
        plan_tier = excluded.plan_tier,
        status = 'active',
        activated_at = excluded.activated_at,
        expires_at = excluded.expires_at,
        is_lifetime = excluded.is_lifetime,
        daily_message_limit = excluded.daily_message_limit,
        daily_extraction_limit = excluded.daily_extraction_limit,
        max_devices = excluded.max_devices,
        features = excluded.features,
        signature = excluded.signature,
        last_verified_at = excluded.last_verified_at
    `).run(
      cleanKey,
      hwid,
      validation.tier,
      nowIso,
      validation.expiresAt,
      validation.isLifetime ? 1 : 0,
      validation.dailyMessageLimit,
      validation.dailyExtractionLimit,
      validation.maxDevices,
      JSON.stringify(features),
      validation.signature,
      nowIso
    );

    // If key exists in license_keys table, bind it to this HWID
    try {
      db.prepare(`
        UPDATE license_keys
        SET bound_hwid = ?, is_used = 1, status = 'used', used_at = ?, used_by_user_id = 'local_user'
        WHERE code = ?
      `).run(hwid, nowIso, cleanKey);
    } catch {}

    // Update local_user in users table
    this.getOrCreateLocalUser({
      plan_tier: validation.tier,
      daily_message_limit: validation.dailyMessageLimit,
      daily_extraction_limit: validation.dailyExtractionLimit,
      max_devices: validation.maxDevices,
      expires_at: validation.expiresAt,
      license_key: cleanKey
    });

    const activeRecord = this.getActiveLicense();
    return {
      success: true,
      message: `License successfully activated! Tier: ${validation.tier.toUpperCase()}`,
      license: activeRecord.license
    };
  }

  /**
   * Retrieves the currently active license, validating hardware binding and expiration.
   */
  public getActiveLicense(): LicenseStatusResult {
    const hwid = this.getHardwareId();
    const db = getDatabase();

    let row: any = null;
    try {
      row = db.prepare('SELECT * FROM app_license WHERE id = 1').get();
    } catch (e) {
      return { active: false, hwid, reason: 'License database table not initialized.' };
    }

    if (!row || row.status === 'deactivated') {
      return { active: false, hwid, reason: 'Software not activated. Please enter a valid license key.' };
    }

    // Hardware ID check
    if (row.hwid && row.hwid !== hwid) {
      return {
        active: false,
        hwid,
        reason: `Hardware ID mismatch. This license is bound to another machine (${row.hwid}).`
      };
    }

    // Expiry check
    if (!row.is_lifetime && row.expires_at) {
      const expTime = new Date(row.expires_at).getTime();
      if (expTime < Date.now()) {
        try {
          db.prepare("UPDATE app_license SET status = 'expired' WHERE id = 1").run();
        } catch {}
        return {
          active: false,
          hwid,
          reason: `License expired on ${new Date(row.expires_at).toLocaleDateString()}.`
        };
      }
    }

    // Update last_verified_at periodically
    try {
      db.prepare("UPDATE app_license SET last_verified_at = datetime('now') WHERE id = 1").run();
    } catch {}

    const license: AppLicense = {
      id: row.id,
      license_key: row.license_key,
      hwid: row.hwid,
      plan_tier: row.plan_tier,
      status: row.status,
      activated_at: row.activated_at,
      expires_at: row.expires_at,
      is_lifetime: Boolean(row.is_lifetime),
      daily_message_limit: row.daily_message_limit || 10000,
      daily_extraction_limit: row.daily_extraction_limit || 10000,
      max_devices: row.max_devices || 10,
      features: row.features ? JSON.parse(row.features) : [],
      signature: row.signature,
      last_verified_at: row.last_verified_at
    };

    const usage = this.getQuotaUsage(license);

    return {
      active: true,
      hwid,
      license,
      usage
    };
  }

  /**
   * Deactivates the current license and returns the software to unlicensed state.
   */
  public deactivateLicense(): { success: boolean; message: string } {
    const db = getDatabase();
    try {
      db.prepare("UPDATE app_license SET status = 'deactivated' WHERE id = 1").run();
      db.prepare("UPDATE users SET subscription_status = 'expired' WHERE id = 'local_user'").run();
    } catch (e) {
      console.warn('[LicenseService] Error deactivating license:', e);
    }
    return { success: true, message: 'License deactivated successfully.' };
  }

  /**
   * Calculates quota meters for daily messages, extractions, and connected devices
   */
  public getQuotaUsage(license?: AppLicense): LicenseUsage {
    const db = getDatabase();
    const todayStr = new Date().toISOString().split('T')[0];

    let messagesSentToday = 0;
    let extractionsDoneToday = 0;
    let connectedDevices = 0;

    try {
      // Sent messages count today
      const msgRow = db.prepare(`
        SELECT COUNT(*) as count FROM messages
        WHERE status IN ('sent', 'delivered', 'read')
        AND created_at >= ?
      `).get(`${todayStr} 00:00:00`) as any;
      messagesSentToday = msgRow?.count || 0;
    } catch {}

    try {
      // Extraction logs count today
      const extRow = db.prepare(`
        SELECT COALESCE(SUM(contacts_count), 0) as total FROM extraction_logs
        WHERE created_at >= ?
      `).get(`${todayStr} 00:00:00`) as any;
      extractionsDoneToday = extRow?.total || 0;
    } catch {}

    try {
      // Connected WhatsApp accounts
      const devRow = db.prepare(`
        SELECT COUNT(*) as count FROM whatsapp_sessions
        WHERE status = 'connected'
      `).get() as any;
      connectedDevices = devRow?.count || 0;
    } catch {}

    return {
      messagesSentToday,
      dailyMessageLimit: license?.daily_message_limit || 10000,
      extractionsDoneToday,
      dailyExtractionLimit: license?.daily_extraction_limit || 10000,
      connectedDevices,
      maxDevices: license?.max_devices || 10
    };
  }

  /**
   * Ensures the local_user record exists in SQLite and has the plan details
   */
  public getOrCreateLocalUser(details?: {
    plan_tier?: string;
    daily_message_limit?: number;
    daily_extraction_limit?: number;
    max_devices?: number;
    expires_at?: string | null;
    license_key?: string;
  }): { id: string; username: string; role: string; name: string } {
    const db = getDatabase();
    const localId = 'local_user';

    const existing = db.prepare("SELECT * FROM users WHERE id = 'local_user'").get() as any;
    if (existing) {
      if (details) {
        db.prepare(`
          UPDATE users
          SET plan_tier = COALESCE(?, plan_tier),
              subscription_status = 'active',
              subscription_expires_at = ?,
              max_devices = COALESCE(?, max_devices),
              daily_message_limit = COALESCE(?, daily_message_limit),
              daily_extraction_limit = COALESCE(?, daily_extraction_limit),
              active_license_code = COALESCE(?, active_license_code),
              role = 'admin',
              updated_at = datetime('now')
          WHERE id = 'local_user'
        `).run(
          details.plan_tier || null,
          details.expires_at || null,
          details.max_devices || null,
          details.daily_message_limit || null,
          details.daily_extraction_limit || null,
          details.license_key || null
        );
      }
      return { id: existing.id, username: existing.username, role: 'admin', name: existing.name };
    }

    // Create local user
    db.prepare(`
      INSERT INTO users (
        id, username, email, password_hash, name, company_name, role,
        plan_tier, subscription_status, subscription_expires_at, max_devices,
        daily_message_limit, daily_extraction_limit, active_license_code
      )
      VALUES (?, 'local_user', 'user@desktop.local', 'desktop_licensed_user', 'Desktop User', 'Local Workstation', 'admin',
              ?, 'active', ?, ?, ?, ?, ?)
    `).run(
      localId,
      details?.plan_tier || 'enterprise',
      details?.expires_at || null,
      details?.max_devices || 10,
      details?.daily_message_limit || 10000,
      details?.daily_extraction_limit || 10000,
      details?.license_key || 'ACTIVE_LICENSE'
    );

    return { id: localId, username: 'local_user', role: 'admin', name: 'Desktop User' };
  }
}
