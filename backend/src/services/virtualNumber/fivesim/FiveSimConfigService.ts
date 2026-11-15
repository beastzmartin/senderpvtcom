import { getDatabase } from '../../../db/database.js';
import { FiveSimProviderConfig, FiveSimProfile } from './types.js';
import { FiveSimApiClient } from './FiveSimApiClient.js';

export class FiveSimConfigService {
  private static instance: FiveSimConfigService | null = null;
  private client: FiveSimApiClient;

  private constructor() {
    this.client = new FiveSimApiClient();
    this.loadConfigIntoClient();
  }

  public static getInstance(): FiveSimConfigService {
    if (!FiveSimConfigService.instance) {
      FiveSimConfigService.instance = new FiveSimConfigService();
    }
    return FiveSimConfigService.instance;
  }

  public getClient(): FiveSimApiClient {
    return this.client;
  }

  /**
   * Load active config from DB into API client
   */
  public loadConfigIntoClient(): void {
    const config = this.getConfig();
    if (config) {
      if (config.apiKey) {
        this.client.setApiKey(config.apiKey);
      }
      if (config.baseUrl) {
        this.client.setBaseUrl(config.baseUrl);
      }
    }
  }

  /**
   * Get provider config from database
   */
  public getConfig(): FiveSimProviderConfig | null {
    try {
      const db = getDatabase();
      const row = db.prepare('SELECT * FROM fivesim_provider_config WHERE id = ?').get('default') as any;
      if (!row) return null;

      let defaultCountry = undefined;
      let defaultOperator = undefined;

      try {
        if (row.default_country) defaultCountry = JSON.parse(row.default_country);
      } catch {}
      try {
        if (row.default_operator) defaultOperator = JSON.parse(row.default_operator);
      } catch {}

      return {
        id: row.id,
        apiKey: row.api_key || '',
        baseUrl: row.base_url || 'https://5sim.net/v1',
        isEnabled: Boolean(row.is_enabled),
        autoSync: Boolean(row.auto_sync),
        maxRequestsPerSec: row.max_requests_per_sec || 100,
        balance: row.balance || 0,
        frozenBalance: row.frozen_balance || 0,
        rating: row.rating !== undefined && row.rating !== null ? row.rating : 96,
        email: row.email || '',
        vendor: row.vendor || '',
        defaultCountry,
        defaultOperator,
        defaultForwardingNumber: row.default_forwarding_number || '',
        lastSyncAt: row.last_sync_at,
        lastError: row.last_error,
        lastErrorAt: row.last_error_at
      };
    } catch (err) {
      console.error('[5SIM Config] Error fetching config:', err);
      return null;
    }
  }

  /**
   * Update 5SIM settings
   */
  public updateConfig(updates: {
    apiKey?: string;
    baseUrl?: string;
    isEnabled?: boolean;
    autoSync?: boolean;
    maxRequestsPerSec?: number;
  }): FiveSimProviderConfig {
    const db = getDatabase();
    const current = this.getConfig();

    const apiKey = updates.apiKey !== undefined ? updates.apiKey : (current?.apiKey || '');
    const baseUrl = updates.baseUrl !== undefined ? updates.baseUrl : (current?.baseUrl || 'https://5sim.net/v1');
    const isEnabled = updates.isEnabled !== undefined ? (updates.isEnabled ? 1 : 0) : (current?.isEnabled ? 1 : 0);
    const autoSync = updates.autoSync !== undefined ? (updates.autoSync ? 1 : 0) : (current?.autoSync ? 1 : 0);
    const maxRequestsPerSec = updates.maxRequestsPerSec !== undefined ? updates.maxRequestsPerSec : (current?.maxRequestsPerSec || 100);

    db.prepare(`
      INSERT INTO fivesim_provider_config (
        id, api_key, base_url, is_enabled, auto_sync, max_requests_per_sec, updated_at
      ) VALUES ('default', ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        api_key = excluded.api_key,
        base_url = excluded.base_url,
        is_enabled = excluded.is_enabled,
        auto_sync = excluded.auto_sync,
        max_requests_per_sec = excluded.max_requests_per_sec,
        updated_at = datetime('now')
    `).run(apiKey, baseUrl, isEnabled, autoSync, maxRequestsPerSec);

    // Also update virtual_number_providers table
    db.prepare(`
      UPDATE virtual_number_providers
      SET api_base_url = ?, encrypted_credentials = ?, status = ?, updated_at = datetime('now')
      WHERE slug = 'fivesim'
    `).run(baseUrl, JSON.stringify({ apiKey }), isEnabled ? 'active' : 'inactive');

    // Update client in memory
    this.client.setApiKey(apiKey);
    this.client.setBaseUrl(baseUrl);

    return this.getConfig()!;
  }

  /**
   * Test API connection with given token or stored token
   */
  public async testConnection(customApiKey?: string): Promise<{
    success: boolean;
    profile?: FiveSimProfile;
    latencyMs: number;
    message: string;
  }> {
    const testClient = new FiveSimApiClient({
      apiKey: customApiKey || this.client.getApiKey(),
      baseUrl: this.client.getBaseUrl()
    });

    const start = Date.now();
    try {
      const profile = await testClient.getProfile();
      const latencyMs = Date.now() - start;

      // Update provider config with verified profile info
      this.updateProfileStats(profile);

      return {
        success: true,
        profile,
        latencyMs,
        message: `Successfully connected to 5SIM API (Balance: ${profile.balance} RUB, Rating: ${profile.rating}/96).`
      };
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      const db = getDatabase();
      db.prepare(`
        UPDATE fivesim_provider_config
        SET last_error = ?, last_error_at = datetime('now')
        WHERE id = 'default'
      `).run(err.message || 'Connection test failed');

      return {
        success: false,
        latencyMs,
        message: err.message || 'Failed to authenticate with 5SIM API.'
      };
    }
  }

  /**
   * Update stored profile telemetry after successful API call
   */
  public updateProfileStats(profile: FiveSimProfile): void {
    try {
      const db = getDatabase();
      db.prepare(`
        UPDATE fivesim_provider_config
        SET balance = ?,
            frozen_balance = ?,
            rating = ?,
            email = ?,
            vendor = ?,
            default_country = ?,
            default_operator = ?,
            default_forwarding_number = ?,
            last_sync_at = datetime('now'),
            last_error = NULL,
            last_error_at = NULL,
            updated_at = datetime('now')
        WHERE id = 'default'
      `).run(
        profile.balance,
        profile.frozen_balance,
        profile.rating,
        profile.email,
        profile.vendor,
        JSON.stringify(profile.default_country || {}),
        JSON.stringify(profile.default_operator || {}),
        profile.default_forwarding_number || ''
      );
    } catch (err) {
      console.error('[5SIM Config] Error updating profile stats:', err);
    }
  }
}

