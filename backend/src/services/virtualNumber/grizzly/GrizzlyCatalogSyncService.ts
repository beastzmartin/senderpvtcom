import crypto from 'crypto';
import { getDatabase } from '../../../db/database.js';
import {
  GrizzlyCustomerApiClient,
  GrizzlyServiceItem,
  GrizzlyMultilingualCountryItem
} from './GrizzlyCustomerApiClient.js';
import { GrizzlyCustomerPricingService } from './GrizzlyCustomerPricingService.js';
import { GrizzlyCustomerReconciliationService } from './GrizzlyCustomerReconciliationService.js';
import { GrizzlyCryptoFundingService } from './GrizzlyCryptoFundingService.js';

export type SupportedLanguage = 'eng' | 'rus' | 'chn' | 'tur' | 'spa' | 'hin' | 'ara' | 'fra';

export interface SyncJobSummary {
  jobType: string;
  jobName: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  lastAttemptedAt: string | null;
  lastSuccessfulAt: string | null;
  nextScheduledAt: string | null;
  recordsInserted: number;
  recordsUpdated: number;
  recordsUnchanged: number;
  recordsMarkedInactive: number;
  invalidRecords: number;
  executionDurationMs: number;
  errorMessage: string | null;
  sanitizedResponse?: string | null;
  errorReport?: any[] | null;
  isLocked: boolean;
  lockedAt: string | null;
  updatedAt: string;
}

export interface UnifiedAvailabilityItem {
  countryId: number;
  countryName: string;
  countryFlag: string;
  serviceCode: string;
  serviceName: string;
  serviceIcon?: string;
  isAvailable: boolean;
  providerStock: number;
  lowestProviderPrice: number;
  customerSellingPrice: number;
  currency: string;
  supportedProviderIds: string[];
  pricingSource: string;
  lastSyncedAt: string;
}

export class GrizzlyCatalogSyncService {
  private static readonly LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes stale lock expiration

  /**
   * Safe worker lock to prevent conflicting concurrent sync jobs
   */
  private static acquireLock(jobType: string): boolean {
    const db = getDatabase();
    const job = db.prepare('SELECT is_locked, locked_at FROM grizzly_sync_jobs WHERE job_type = ?').get(jobType) as any;

    const now = Date.now();
    if (job?.is_locked) {
      let lockTime = 0;
      if (job.locked_at) {
        const raw = String(job.locked_at).trim();
        const iso = raw.endsWith('Z') ? raw : raw.replace(' ', 'T') + 'Z';
        lockTime = new Date(iso).getTime();
      }
      const lockAge = lockTime > 0 ? now - lockTime : Infinity;
      if (lockAge >= 0 && lockAge < this.LOCK_TIMEOUT_MS) {
        // Active lock held by another process
        return false;
      }
    }

    db.prepare(`
      UPDATE grizzly_sync_jobs
      SET is_locked = 1,
          locked_at = datetime('now'),
          status = 'running',
          last_attempted_at = datetime('now'),
          updated_at = datetime('now')
      WHERE job_type = ?
    `).run(jobType);

    return true;
  }

  /**
   * Release worker lock upon completion or error
   */
  private static releaseLock(jobType: string, stats?: {
    status: 'completed' | 'failed';
    recordsInserted?: number;
    recordsUpdated?: number;
    recordsUnchanged?: number;
    recordsMarkedInactive?: number;
    invalidRecords?: number;
    durationMs?: number;
    errorMessage?: string | null;
    sanitizedResponse?: string | null;
    errorReport?: any[] | null;
  }): void {
    const db = getDatabase();
    const isSuccess = stats?.status === 'completed';

    db.prepare(`
      UPDATE grizzly_sync_jobs
      SET is_locked = 0,
          locked_at = NULL,
          status = ?,
          last_successful_at = CASE WHEN ? THEN datetime('now') ELSE last_successful_at END,
          records_inserted = COALESCE(?, records_inserted),
          records_updated = COALESCE(?, records_updated),
          records_unchanged = COALESCE(?, records_unchanged),
          records_marked_inactive = COALESCE(?, records_marked_inactive),
          invalid_records = COALESCE(?, invalid_records),
          execution_duration_ms = COALESCE(?, execution_duration_ms),
          error_message = ?,
          sanitized_response = COALESCE(?, sanitized_response),
          error_report = ?,
          updated_at = datetime('now')
      WHERE job_type = ?
    `).run(
      stats?.status || 'idle',
      isSuccess ? 1 : 0,
      stats?.recordsInserted,
      stats?.recordsUpdated,
      stats?.recordsUnchanged,
      stats?.recordsMarkedInactive,
      stats?.invalidRecords,
      stats?.durationMs,
      stats?.errorMessage || null,
      stats?.sanitizedResponse || null,
      stats?.errorReport ? JSON.stringify(stats.errorReport) : null,
      jobType
    );

    // Persist to sync history log
    if (stats) {
      db.prepare(`
        INSERT INTO grizzly_sync_history (
          id, job_type, status, records_inserted, records_updated, records_unchanged,
          records_marked_inactive, invalid_records, execution_duration_ms, error_message, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        crypto.randomUUID(),
        jobType,
        stats.status,
        stats.recordsInserted || 0,
        stats.recordsUpdated || 0,
        stats.recordsUnchanged || 0,
        stats.recordsMarkedInactive || 0,
        stats.invalidRecords || 0,
        stats.durationMs || 0,
        stats.errorMessage || null
      );
    }
  }

  /**
   * MODULE 2: Automatic Services Catalogue Synchronization
   * 1. Fetches official getServicesList
   * 2. Validates JSON and success status
   * 3. Upserts official code and official name without overwriting admin display names
   * 4. Marks disappeared services as inactive/review instead of deleting
   * 5. Tracks import metrics
   */
  public static async syncServicesCatalogue(apiKey?: string): Promise<{
    success: boolean;
    inserted: number;
    updated: number;
    unchanged: number;
    markedInactive: number;
    invalid: number;
    durationMs: number;
    error?: string;
  }> {
    const startTime = Date.now();
    const jobType = 'services';

    if (!this.acquireLock(jobType)) {
      throw new Error('Services catalogue synchronization is already running in another process.');
    }

    try {
      const apiResult = await GrizzlyCustomerApiClient.getServicesList(apiKey);

      if (!apiResult.success) {
        const durationMs = Date.now() - startTime;
        this.releaseLock(jobType, {
          status: 'failed',
          durationMs,
          errorMessage: apiResult.error || 'Failed to fetch services list from GrizzlySMS',
          sanitizedResponse: apiResult.rawResponse
        });
        return {
          success: false,
          inserted: 0,
          updated: 0,
          unchanged: 0,
          markedInactive: 0,
          invalid: 0,
          durationMs,
          error: apiResult.error
        };
      }

      const db = getDatabase();
      let inserted = 0;
      let updated = 0;
      let unchanged = 0;
      let invalid = 0;

      const receivedCodes = new Set<string>();
      const existingRows = db.prepare('SELECT * FROM grizzly_services').all() as any[];
      const existingMap = new Map<string, any>();
      for (const row of existingRows) {
        existingMap.set(row.provider_service_code.toLowerCase(), row);
      }

      const upsertStmt = db.prepare(`
        INSERT INTO grizzly_services (
          id, provider, provider_service_code, service_name, display_name, icon, category,
          is_active, is_supported, status, first_imported_at, last_synced_at, updated_at
        ) VALUES (
          ?, 'grizzlysms', ?, ?, ?, ?, ?,
          1, 1, 'active', datetime('now'), datetime('now'), datetime('now')
        )
        ON CONFLICT(provider_service_code) DO UPDATE SET
          service_name = excluded.service_name,
          display_name = COALESCE(grizzly_services.display_name, excluded.display_name),
          is_active = CASE
            WHEN grizzly_services.status = 'review_required' THEN 1
            WHEN grizzly_services.status = 'inactive' THEN 0
            ELSE 1
          END,
          status = 'active',
          last_synced_at = datetime('now'),
          updated_at = datetime('now')
      `);

      const upsertMappingStmt = db.prepare(`
        INSERT INTO grizzly_service_mappings (id, service_code, name, category, is_enabled)
        VALUES (?, ?, ?, ?, 1)
        ON CONFLICT(service_code) DO UPDATE SET
          name = COALESCE(grizzly_service_mappings.name, excluded.name)
      `);

      const tx = db.transaction(() => {
        for (const s of apiResult.services) {
          const code = (s.code || '').trim().toLowerCase();
          const name = (s.name || '').trim();

          if (!code || !name) {
            invalid++;
            continue;
          }

          receivedCodes.add(code);
          const existing = existingMap.get(code);

          if (!existing) {
            inserted++;
            const id = crypto.randomUUID();
            upsertStmt.run(id, code, name, name, 'Send', 'messaging');
            upsertMappingStmt.run(id, code, name, 'messaging');
          } else {
            // Check if name changed
            if (existing.service_name !== name || existing.status !== 'active') {
              updated++;
            } else {
              unchanged++;
            }
            upsertStmt.run(existing.id, code, name, existing.display_name || name, existing.icon || 'Send', existing.category || 'general');
          }
        }
      });

      tx();

      // Disappeared services handling:
      // If a previously active service is absent from this complete official catalogue, mark it inactive/review
      let markedInactive = 0;
      if (receivedCodes.size > 0) {
        for (const [code, row] of existingMap.entries()) {
          if (!receivedCodes.has(code) && row.is_active === 1) {
            db.prepare(`
              UPDATE grizzly_services
              SET is_active = 0,
                  status = 'review_required',
                  updated_at = datetime('now')
              WHERE provider_service_code = ?
            `).run(code);
            markedInactive++;
          }
        }
      }

      const durationMs = Date.now() - startTime;
      this.releaseLock(jobType, {
        status: 'completed',
        recordsInserted: inserted,
        recordsUpdated: updated,
        recordsUnchanged: unchanged,
        recordsMarkedInactive: markedInactive,
        invalidRecords: invalid,
        durationMs,
        sanitizedResponse: apiResult.rawResponse
      });

      return {
        success: true,
        inserted,
        updated,
        unchanged,
        markedInactive,
        invalid,
        durationMs
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      this.releaseLock(jobType, {
        status: 'failed',
        durationMs,
        errorMessage: err.message || 'Exception during services catalogue sync'
      });
      throw err;
    }
  }

  /**
   * MODULE 3: Multilingual Countries Catalogue Synchronization
   * 1. Fetches official getCountries
   * 2. Safely handles array, dictionary, or single country response
   * 3. Preserves all 8 languages: rus, eng, chn, tur, spa, hin, ara, fra
   * 4. Preserves exact numeric country ID
   * 5. Preserves custom admin display names, flags, and notes
   * 6. Marks disappeared countries as inactive/review instead of deleting
   */
  public static async syncCountriesCatalogue(apiKey?: string): Promise<{
    success: boolean;
    inserted: number;
    updated: number;
    unchanged: number;
    markedInactive: number;
    invalid: number;
    durationMs: number;
    error?: string;
  }> {
    const startTime = Date.now();
    const jobType = 'countries';

    if (!this.acquireLock(jobType)) {
      throw new Error('Countries catalogue synchronization is already running in another process.');
    }

    try {
      const apiResult = await GrizzlyCustomerApiClient.getCountries(apiKey);

      if (!apiResult.success) {
        const durationMs = Date.now() - startTime;
        this.releaseLock(jobType, {
          status: 'failed',
          durationMs,
          errorMessage: apiResult.error || 'Failed to fetch countries list from GrizzlySMS',
          sanitizedResponse: apiResult.rawResponse
        });
        return {
          success: false,
          inserted: 0,
          updated: 0,
          unchanged: 0,
          markedInactive: 0,
          invalid: 0,
          durationMs,
          error: apiResult.error
        };
      }

      const db = getDatabase();
      let inserted = 0;
      let updated = 0;
      let unchanged = 0;
      let invalid = 0;

      const receivedIds = new Set<number>();
      const existingRows = db.prepare('SELECT * FROM grizzly_countries').all() as any[];
      const existingMap = new Map<number, any>();
      for (const row of existingRows) {
        existingMap.set(row.provider_country_id, row);
      }

      const upsertStmt = db.prepare(`
        INSERT INTO grizzly_countries (
          id, provider, provider_country_id, country_name, country_code_iso2,
          rus, eng, chn, tur, spa, hin, ara, fra,
          flag, is_active, is_supported, status, first_imported_at, last_synced_at, updated_at
        ) VALUES (
          ?, 'grizzlysms', ?, ?, 'XX',
          ?, ?, ?, ?, ?, ?, ?, ?,
          '🌐', 1, 1, 'active', datetime('now'), datetime('now'), datetime('now')
        )
        ON CONFLICT(provider_country_id) DO UPDATE SET
          country_name = COALESCE(excluded.eng, grizzly_countries.country_name),
          rus = COALESCE(excluded.rus, grizzly_countries.rus),
          eng = COALESCE(excluded.eng, grizzly_countries.eng),
          chn = COALESCE(excluded.chn, grizzly_countries.chn),
          tur = COALESCE(excluded.tur, grizzly_countries.tur),
          spa = COALESCE(excluded.spa, grizzly_countries.spa),
          hin = COALESCE(excluded.hin, grizzly_countries.hin),
          ara = COALESCE(excluded.ara, grizzly_countries.ara),
          fra = COALESCE(excluded.fra, grizzly_countries.fra),
          is_active = CASE
            WHEN grizzly_countries.status = 'review_required' THEN 1
            WHEN grizzly_countries.status = 'inactive' THEN 0
            ELSE 1
          END,
          status = 'active',
          last_synced_at = datetime('now'),
          updated_at = datetime('now')
      `);

      const upsertMappingStmt = db.prepare(`
        INSERT INTO grizzly_country_mappings (id, grizzly_country_id, iso_code, country_name, dial_code, flag_emoji, is_enabled)
        VALUES (?, ?, 'XX', ?, '', '🌐', 1)
        ON CONFLICT(grizzly_country_id) DO UPDATE SET
          country_name = COALESCE(grizzly_country_mappings.country_name, excluded.country_name)
      `);

      const tx = db.transaction(() => {
        for (const c of apiResult.countries) {
          if (!c.id || isNaN(c.id)) {
            invalid++;
            continue;
          }

          receivedIds.add(c.id);
          const existing = existingMap.get(c.id);
          const engName = c.eng || `Country ${c.id}`;

          if (!existing) {
            inserted++;
            const id = crypto.randomUUID();
            upsertStmt.run(id, c.id, engName, c.rus || null, engName, c.chn || null, c.tur || null, c.spa || null, c.hin || null, c.ara || null, c.fra || null);
            upsertMappingStmt.run(id, c.id, engName);
          } else {
            // Check if any translations changed
            const changed = existing.eng !== engName || existing.rus !== c.rus || existing.status !== 'active';
            if (changed) {
              updated++;
            } else {
              unchanged++;
            }
            upsertStmt.run(existing.id, c.id, engName, c.rus || null, engName, c.chn || null, c.tur || null, c.spa || null, c.hin || null, c.ara || null, c.fra || null);
          }
        }
      });

      tx();

      // Disappeared countries handling:
      let markedInactive = 0;
      if (receivedIds.size > 0) {
        for (const [id, row] of existingMap.entries()) {
          if (!receivedIds.has(id) && row.is_active === 1) {
            db.prepare(`
              UPDATE grizzly_countries
              SET is_active = 0,
                  status = 'review_required',
                  updated_at = datetime('now')
              WHERE provider_country_id = ?
            `).run(id);
            markedInactive++;
          }
        }
      }

      const durationMs = Date.now() - startTime;
      this.releaseLock(jobType, {
        status: 'completed',
        recordsInserted: inserted,
        recordsUpdated: updated,
        recordsUnchanged: unchanged,
        recordsMarkedInactive: markedInactive,
        invalidRecords: invalid,
        durationMs,
        sanitizedResponse: apiResult.rawResponse
      });

      return {
        success: true,
        inserted,
        updated,
        unchanged,
        markedInactive,
        invalid,
        durationMs
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      this.releaseLock(jobType, {
        status: 'failed',
        durationMs,
        errorMessage: err.message || 'Exception during countries catalogue sync'
      });
      throw err;
    }
  }

  /**
   * Resolve localized country display name based on user's preferred language
   * Fallback order:
   * 1. User's selected language, if available.
   * 2. English (eng).
   * 3. Admin custom display name.
   * 4. String of official country ID.
   */
  public static resolveLocalizedCountryName(
    countryRow: {
      provider_country_id: number;
      country_name?: string;
      eng?: string;
      rus?: string;
      chn?: string;
      tur?: string;
      spa?: string;
      hin?: string;
      ara?: string;
      fra?: string;
      custom_display_name?: string;
    },
    preferredLang?: SupportedLanguage | string
  ): string {
    const lang = (preferredLang || 'eng').toLowerCase();

    // 1. User's selected language
    if (lang === 'rus' && countryRow.rus?.trim()) return countryRow.rus.trim();
    if (lang === 'chn' && countryRow.chn?.trim()) return countryRow.chn.trim();
    if (lang === 'tur' && countryRow.tur?.trim()) return countryRow.tur.trim();
    if (lang === 'spa' && countryRow.spa?.trim()) return countryRow.spa.trim();
    if (lang === 'hin' && countryRow.hin?.trim()) return countryRow.hin.trim();
    if (lang === 'ara' && countryRow.ara?.trim()) return countryRow.ara.trim();
    if (lang === 'fra' && countryRow.fra?.trim()) return countryRow.fra.trim();
    if (lang === 'eng' && countryRow.eng?.trim()) return countryRow.eng.trim();

    // 2. English fallback
    if (countryRow.eng?.trim()) return countryRow.eng.trim();
    if (countryRow.country_name?.trim()) return countryRow.country_name.trim();

    // 3. Custom admin display name
    if (countryRow.custom_display_name?.trim()) return countryRow.custom_display_name.trim();

    // 4. Official country ID string
    return `Country ${countryRow.provider_country_id}`;
  }

  /**
   * Search countries across multilingual names, custom names, or official country ID
   */
  public static searchCountries(params: {
    query?: string;
    lang?: SupportedLanguage | string;
    activeOnly?: boolean;
    limit?: number;
    offset?: number;
  }): { total: number; rows: any[] } {
    const db = getDatabase();
    const query = (params.query || '').trim().toLowerCase();
    const activeOnly = params.activeOnly !== false;
    const limit = Math.min(Math.max(params.limit || 50, 1), 250);
    const offset = Math.max(params.offset || 0, 0);

    let sql = 'SELECT * FROM grizzly_countries WHERE 1=1';
    const args: any[] = [];

    if (activeOnly) {
      sql += ' AND is_active = 1';
    }

    if (query) {
      const q = `%${query}%`;
      sql += ` AND (
        CAST(provider_country_id AS TEXT) = ?
        OR LOWER(country_name) LIKE ?
        OR LOWER(COALESCE(eng, '')) LIKE ?
        OR LOWER(COALESCE(rus, '')) LIKE ?
        OR LOWER(COALESCE(chn, '')) LIKE ?
        OR LOWER(COALESCE(tur, '')) LIKE ?
        OR LOWER(COALESCE(spa, '')) LIKE ?
        OR LOWER(COALESCE(hin, '')) LIKE ?
        OR LOWER(COALESCE(ara, '')) LIKE ?
        OR LOWER(COALESCE(fra, '')) LIKE ?
        OR LOWER(COALESCE(custom_display_name, '')) LIKE ?
      )`;
      args.push(query, q, q, q, q, q, q, q, q, q, q);
    }

    const countRow = db.prepare(`SELECT COUNT(*) as c FROM (${sql})`).get(...args) as any;
    const total = countRow?.c || 0;

    sql += ' ORDER BY provider_country_id ASC LIMIT ? OFFSET ?';
    args.push(limit, offset);

    const rows = (db.prepare(sql).all(...args) as any[]).map((r) => ({
      ...r,
      resolvedName: this.resolveLocalizedCountryName(r, params.lang)
    }));

    return { total, rows };
  }

  /**
   * MODULE 4: Unified Service-Country Availability Model
   * Connects getServicesList, getCountries, getPrices/V2/V3, and getNumberV2
   * Returns live availability, provider stock, acquisition cost, and selling price.
   */
  public static getUnifiedAvailability(params: {
    countryId?: string | number;
    serviceCode?: string;
    lang?: SupportedLanguage | string;
    inStockOnly?: boolean;
    limit?: number;
    offset?: number;
  }): { total: number; items: UnifiedAvailabilityItem[] } {
    const db = getDatabase();
    const cleanCountry = params.countryId ? String(params.countryId) : null;
    const cleanService = params.serviceCode ? params.serviceCode.trim().toLowerCase() : null;
    const inStockOnly = params.inStockOnly === true;
    const limit = Math.min(Math.max(params.limit || 50, 1), 200);
    const offset = Math.max(params.offset || 0, 0);

    // Join cached pricing with official services and countries
    let sql = `
      SELECT
        p.country_id,
        c.country_name,
        c.eng, c.rus, c.chn, c.tur, c.spa, c.hin, c.ara, c.fra, c.custom_display_name,
        c.flag,
        p.service_code,
        COALESCE(s.display_name, s.service_name, p.service_name) as service_name,
        s.icon,
        p.overall_quantity as provider_stock,
        COALESCE(p.lowest_provider_price, p.overall_price, 0) as lowest_provider_price,
        p.providers_data,
        p.pricing_source,
        p.last_synced_at
      FROM grizzly_customer_prices p
      LEFT JOIN grizzly_countries c ON CAST(c.provider_country_id AS TEXT) = p.country_id
      LEFT JOIN grizzly_services s ON s.provider_service_code = p.service_code
      WHERE 1=1
    `;
    const args: any[] = [];

    if (cleanCountry) {
      sql += ' AND p.country_id = ?';
      args.push(cleanCountry);
    }

    if (cleanService) {
      sql += ' AND p.service_code = ?';
      args.push(cleanService);
    }

    if (inStockOnly) {
      sql += ' AND p.overall_quantity > 0';
    }

    const countRow = db.prepare(`SELECT COUNT(*) as c FROM (${sql})`).get(...args) as any;
    const total = countRow?.c || 0;

    sql += ' ORDER BY p.overall_quantity DESC, p.last_synced_at DESC LIMIT ? OFFSET ?';
    args.push(limit, offset);

    const rows = db.prepare(sql).all(...args) as any[];

    const items: UnifiedAvailabilityItem[] = rows.map((r) => {
      const countryId = parseInt(r.country_id, 10) || 0;
      const localizedName = this.resolveLocalizedCountryName(
        {
          provider_country_id: countryId,
          country_name: r.country_name,
          eng: r.eng,
          rus: r.rus,
          chn: r.chn,
          tur: r.tur,
          spa: r.spa,
          hin: r.hin,
          ara: r.ara,
          fra: r.fra,
          custom_display_name: r.custom_display_name
        },
        params.lang
      );

      let providerIds: string[] = [];
      try {
        const providers = JSON.parse(r.providers_data || '[]');
        if (Array.isArray(providers)) {
          providerIds = providers.filter((p: any) => p.count > 0).map((p: any) => String(p.providerId));
        }
      } catch {}

      const priceQuote = GrizzlyCustomerPricingService.calculateCustomerSellingPrice({
        countryId: r.country_id,
        serviceCode: r.service_code,
        rawProviderPrice: r.lowest_provider_price
      });

      return {
        countryId,
        countryName: localizedName,
        countryFlag: r.flag || '🌐',
        serviceCode: r.service_code,
        serviceName: r.service_name || r.service_code.toUpperCase(),
        serviceIcon: r.icon || 'Send',
        isAvailable: r.provider_stock > 0,
        providerStock: r.provider_stock || 0,
        lowestProviderPrice: r.lowest_provider_price,
        customerSellingPrice: priceQuote.sellingPrice,
        currency: priceQuote.currency,
        supportedProviderIds: providerIds,
        pricingSource: r.pricing_source || 'getPricesV3',
        lastSyncedAt: r.last_synced_at
      };
    });

    return { total, items };
  }

  /**
   * MODULE 5: Get status of all 6 synchronization jobs in control center
   */
  public static getSyncJobsStatus(): SyncJobSummary[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM grizzly_sync_jobs
      ORDER BY job_type ASC
    `).all() as any[];

    return rows.map((r) => ({
      jobType: r.job_type,
      jobName: r.job_name,
      status: r.status,
      lastAttemptedAt: r.last_attempted_at,
      lastSuccessfulAt: r.last_successful_at,
      nextScheduledAt: r.next_scheduled_at,
      recordsInserted: r.records_inserted || 0,
      recordsUpdated: r.records_updated || 0,
      recordsUnchanged: r.records_unchanged || 0,
      recordsMarkedInactive: r.records_marked_inactive || 0,
      invalidRecords: r.invalid_records || 0,
      executionDurationMs: r.execution_duration_ms || 0,
      errorMessage: r.error_message,
      sanitizedResponse: r.sanitized_response,
      errorReport: r.error_report ? JSON.parse(r.error_report) : null,
      isLocked: Boolean(r.is_locked),
      lockedAt: r.locked_at,
      updatedAt: r.updated_at
    }));
  }

  /**
   * MODULE 5: Manual trigger for a specific synchronization job
   */
  public static async triggerSyncJob(jobType: string): Promise<any> {
    switch (jobType) {
      case 'services':
        return await this.syncServicesCatalogue();
      case 'countries':
        return await this.syncCountriesCatalogue();
      case 'prices':
        return await GrizzlyCustomerPricingService.syncPrices({ endpoint: 'getPricesV3' });
      case 'stock':
        return await GrizzlyCustomerPricingService.syncPrices({ endpoint: 'getPricesV3' });
      case 'activations':
        return await GrizzlyCustomerReconciliationService.runReconciliation();
      case 'crypto_wallet':
        return await GrizzlyCryptoFundingService.refreshCryptoWallet();
      default:
        throw new Error(`Unsupported synchronization job type: ${jobType}`);
    }
  }

  /**
   * MODULE 5: Sync history logs
   */
  public static getSyncHistory(jobType?: string, limit = 50): any[] {
    const db = getDatabase();
    let sql = 'SELECT * FROM grizzly_sync_history WHERE 1=1';
    const args: any[] = [];
    if (jobType) {
      sql += ' AND job_type = ?';
      args.push(jobType);
    }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    args.push(limit);

    return db.prepare(sql).all(...args);
  }

  /**
   * Export Services Catalogue as CSV or JSON
   */
  public static exportServices(format: 'json' | 'csv'): string {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM grizzly_services ORDER BY provider_service_code ASC').all() as any[];

    if (format === 'json') {
      return JSON.stringify(rows, null, 2);
    }

    // CSV format
    const headers = ['Official Code', 'Official Name', 'Display Name', 'Category', 'Status', 'Active', 'Last Synced'];
    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push([
        `"${r.provider_service_code}"`,
        `"${(r.service_name || '').replace(/"/g, '""')}"`,
        `"${(r.display_name || '').replace(/"/g, '""')}"`,
        `"${r.category || ''}"`,
        `"${r.status || 'active'}"`,
        r.is_active ? '1' : '0',
        `"${r.last_synced_at || ''}"`
      ].join(','));
    }
    return lines.join('\n');
  }

  /**
   * Export Countries Catalogue as CSV or JSON
   */
  public static exportCountries(format: 'json' | 'csv'): string {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM grizzly_countries ORDER BY provider_country_id ASC').all() as any[];

    if (format === 'json') {
      return JSON.stringify(rows, null, 2);
    }

    // CSV format
    const headers = [
      'Grizzly ID', 'English Name', 'Russian', 'Chinese', 'Turkish', 'Spanish', 'Hindi', 'Arabic', 'French',
      'Custom Name', 'Flag', 'Status', 'Active', 'Last Synced'
    ];
    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push([
        r.provider_country_id,
        `"${(r.eng || r.country_name || '').replace(/"/g, '""')}"`,
        `"${(r.rus || '').replace(/"/g, '""')}"`,
        `"${(r.chn || '').replace(/"/g, '""')}"`,
        `"${(r.tur || '').replace(/"/g, '""')}"`,
        `"${(r.spa || '').replace(/"/g, '""')}"`,
        `"${(r.hin || '').replace(/"/g, '""')}"`,
        `"${(r.ara || '').replace(/"/g, '""')}"`,
        `"${(r.fra || '').replace(/"/g, '""')}"`,
        `"${(r.custom_display_name || '').replace(/"/g, '""')}"`,
        `"${r.flag || '🌐'}"`,
        `"${r.status || 'active'}"`,
        r.is_active ? '1' : '0',
        `"${r.last_synced_at || ''}"`
      ].join(','));
    }
    return lines.join('\n');
  }
}
