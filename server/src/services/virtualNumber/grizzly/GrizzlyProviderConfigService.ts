import crypto from 'crypto';
import { getDatabase } from '../../../db/database.js';
import { GrizzlyProviderConfig, GrizzlyProviderStatus } from './types.js';

export class GrizzlyProviderConfigService {
  private static cachedConfig: GrizzlyProviderConfig | null = null;
  private static lastCacheUpdate = 0;
  private static readonly CACHE_TTL_MS = 10000; // 10 seconds cache for high throughput

  /**
   * Retrieves active GrizzlySMS provider configuration from database (cached)
   */
  public static getConfig(): GrizzlyProviderConfig {
    const now = Date.now();
    if (this.cachedConfig && now - this.lastCacheUpdate < this.CACHE_TTL_MS) {
      return this.cachedConfig;
    }

    const db = getDatabase();
    const row = db.prepare('SELECT * FROM grizzly_provider_config WHERE id = ?').get('grizzlysms_config') as any;

    if (!row) {
      throw new Error('GrizzlySMS provider configuration not found in database.');
    }

    let ipAllowlist: string[] = [];
    try {
      ipAllowlist = JSON.parse(row.ip_allowlist || '[]');
    } catch {
      ipAllowlist = [];
    }

    this.cachedConfig = {
      id: row.id,
      provider_id: row.provider_id,
      name: row.name,
      slug: row.slug,
      protocol_key: row.protocol_key,
      status: row.status as GrizzlyProviderStatus,
      partner_api_endpoint: row.partner_api_endpoint,
      outbound_api_url: row.outbound_api_url || 'https://api.grizzlysms.com/agent/api/sms',
      user_agent: row.user_agent || 'GrizzlySMS-Partner-Agent/2.0',
      priority: row.priority,
      max_active_numbers: row.max_active_numbers,
      min_payout: row.min_payout,
      max_payout: row.max_payout,
      ip_allowlist: ipAllowlist,
      last_successful_request_at: row.last_successful_request_at,
      last_error: row.last_error,
      last_error_at: row.last_error_at,
      total_requests_count: row.total_requests_count || 0,
      successful_requests_count: row.successful_requests_count || 0,
      failed_requests_count: row.failed_requests_count || 0
    };

    this.lastCacheUpdate = now;
    return this.cachedConfig;
  }

  /**
   * Constant-time comparison for protocol authentication key.
   * Prevents timing attacks.
   */
  public static verifyProtocolKey(providedKey: string): boolean {
    if (!providedKey || typeof providedKey !== 'string') {
      return false;
    }

    const config = this.getConfig();
    const configuredKey = config.protocol_key;

    if (!configuredKey) return false;

    const bufProvided = Buffer.from(providedKey, 'utf8');
    const bufConfigured = Buffer.from(configuredKey, 'utf8');

    if (bufProvided.length !== bufConfigured.length) {
      return false;
    }

    return crypto.timingSafeEqual(bufProvided, bufConfigured);
  }

  /**
   * Verifies if client IP is permitted according to configured IP allowlist
   */
  public static isIpAllowed(clientIp?: string): boolean {
    const config = this.getConfig();
    if (!config.ip_allowlist || config.ip_allowlist.length === 0) {
      return true; // No restriction configured
    }
    if (!clientIp) return false;

    // Check direct match or localhost
    const cleanIp = clientIp.replace(/^::ffff:/, '');
    return config.ip_allowlist.includes(cleanIp) || config.ip_allowlist.includes(clientIp);
  }

  /**
   * Updates provider configuration (Admin Dashboard)
   */
  public static updateConfig(updates: Partial<GrizzlyProviderConfig>): GrizzlyProviderConfig {
    const db = getDatabase();
    const current = this.getConfig();

    const newKey = updates.protocol_key !== undefined ? updates.protocol_key : current.protocol_key;
    const newStatus = updates.status !== undefined ? updates.status : current.status;
    const newEndpoint = updates.partner_api_endpoint !== undefined ? updates.partner_api_endpoint : current.partner_api_endpoint;
    const newOutboundUrl = updates.outbound_api_url !== undefined ? updates.outbound_api_url : current.outbound_api_url;
    const newUserAgent = updates.user_agent !== undefined ? updates.user_agent : current.user_agent;
    const newPriority = updates.priority !== undefined ? updates.priority : current.priority;
    const newMaxActive = updates.max_active_numbers !== undefined ? updates.max_active_numbers : current.max_active_numbers;
    const newMinPayout = updates.min_payout !== undefined ? updates.min_payout : current.min_payout;
    const newMaxPayout = updates.max_payout !== undefined ? updates.max_payout : current.max_payout;
    const newAllowlist = updates.ip_allowlist !== undefined ? JSON.stringify(updates.ip_allowlist) : JSON.stringify(current.ip_allowlist);

    db.prepare(`
      UPDATE grizzly_provider_config
      SET protocol_key = ?, status = ?, partner_api_endpoint = ?, outbound_api_url = ?, user_agent = ?, priority = ?,
          max_active_numbers = ?, min_payout = ?, max_payout = ?, ip_allowlist = ?,
          updated_at = datetime('now')
      WHERE id = 'grizzlysms_config'
    `).run(
      newKey,
      newStatus,
      newEndpoint,
      newOutboundUrl,
      newUserAgent,
      newPriority,
      newMaxActive,
      newMinPayout,
      newMaxPayout,
      newAllowlist
    );

    // Also update virtual_number_providers table status & priority
    db.prepare(`
      UPDATE virtual_number_providers
      SET status = ?, priority = ?, updated_at = datetime('now')
      WHERE slug = 'grizzlysms'
    `).run(newStatus === 'enabled' ? 'active' : 'inactive', newPriority);

    this.cachedConfig = null; // Invalidate cache
    return this.getConfig();
  }

  /**
   * Record metrics from incoming partner requests
   */
  public static recordRequestMetric(success: boolean, errorMessage?: string): void {
    const db = getDatabase();
    try {
      if (success) {
        db.prepare(`
          UPDATE grizzly_provider_config
          SET total_requests_count = total_requests_count + 1,
              successful_requests_count = successful_requests_count + 1,
              last_successful_request_at = datetime('now'),
              updated_at = datetime('now')
          WHERE id = 'grizzlysms_config'
        `).run();
      } else {
        db.prepare(`
          UPDATE grizzly_provider_config
          SET total_requests_count = total_requests_count + 1,
              failed_requests_count = failed_requests_count + 1,
              last_error = ?,
              last_error_at = datetime('now'),
              updated_at = datetime('now')
          WHERE id = 'grizzlysms_config'
        `).run(errorMessage || 'Unknown error');
      }
    } catch {
      // Metric write non-blocking
    }
  }

  /**
   * Log Partner API Request with redacted protocol key
   */
  public static logApiCall(
    action: string,
    clientIp: string | undefined,
    headers: Record<string, any>,
    rawBody: any,
    responseStatus: string,
    responseBody: any,
    responseTimeMs: number,
    errorMessage?: string
  ): void {
    const db = getDatabase();
    try {
      const sanitizedBody = { ...rawBody };
      if (sanitizedBody.key) {
        sanitizedBody.key = `${sanitizedBody.key.substring(0, 4)}...***`;
      }

      db.prepare(`
        INSERT INTO grizzly_api_logs (
          id, action, client_ip, request_headers, request_body,
          response_status, response_body, response_time_ms, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        action,
        clientIp || '127.0.0.1',
        JSON.stringify(headers),
        JSON.stringify(sanitizedBody),
        responseStatus,
        JSON.stringify(responseBody),
        responseTimeMs,
        errorMessage || null
      );
    } catch (err) {
      console.error('[Grizzly] Failed to write API log:', err);
    }
  }
}

