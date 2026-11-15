import crypto from 'crypto';
import { getDatabase } from '../../../db/database.js';
import { GrizzlyProviderConfigService } from './GrizzlyProviderConfigService.js';
import { GrizzlyHardwareCapacityService } from './GrizzlyHardwareCapacityService.js';
import {
  GrizzlyGetServicesRequest,
  GrizzlyGetServicesResponse,
  GrizzlyGetNumberRequest,
  GrizzlyGetNumberResponse,
  GrizzlyCountryServicesItem
} from './types.js';

export class GrizzlyPartnerProtocolService {
  private static servicesCache: GrizzlyGetServicesResponse | null = null;
  private static lastCacheTime = 0;
  private static readonly SERVICES_CACHE_TTL_MS = 5000; // 5-second in-memory cache for fast polling

  /**
   * Invalidate GET_SERVICES cache on inventory or activation changes
   */
  public static invalidateCache(): void {
    this.servicesCache = null;
    this.lastCacheTime = 0;
  }

  /**
   * Generates a unique 6 to 9 digit unsigned integer activation ID
   */
  private static generateActivationId(): number {
    const db = getDatabase();
    for (let attempts = 0; attempts < 10; attempts++) {
      const candidateId = Math.floor(100000 + Math.random() * 900000);
      const exists = db.prepare('SELECT 1 FROM grizzly_activations WHERE activation_id = ?').get(candidateId);
      if (!exists) {
        return candidateId;
      }
    }
    return Math.floor(Date.now() % 900000) + 100000;
  }

  /**
   * Implements documented GET_SERVICES operation
   * Returns exact currently allocatable inventory across countries, operators, and services.
   * Excludes:
   * - Occupied / failed / maintenance hardware slots
   * - Prohibited numbers (Status 1)
   * - Cancellation-blacklisted numbers (>= 5 cancellations for service)
   * - Quarantined returned numbers (Status 5)
   */
  public static handleGetServices(request: GrizzlyGetServicesRequest, clientIp?: string): GrizzlyGetServicesResponse {
    const startTime = Date.now();

    // 1. Authenticate protocol key
    if (!GrizzlyProviderConfigService.verifyProtocolKey(request.key)) {
      const duration = Date.now() - startTime;
      GrizzlyProviderConfigService.recordRequestMetric(false, 'Unauthorized: Protocol key mismatch');
      GrizzlyProviderConfigService.logApiCall(
        'GET_SERVICES',
        clientIp,
        {},
        request,
        'AUTH_ERROR',
        { error: 'Unauthorized protocol key' },
        duration,
        'Protocol key mismatch'
      );
      throw new Error('AUTH_ERROR');
    }

    const config = GrizzlyProviderConfigService.getConfig();

    if (config.status !== 'enabled') {
      const duration = Date.now() - startTime;
      const response: GrizzlyGetServicesResponse = {
        countryList: [],
        status: 'SUCCESS'
      };
      GrizzlyProviderConfigService.recordRequestMetric(true);
      GrizzlyProviderConfigService.logApiCall(
        'GET_SERVICES',
        clientIp,
        {},
        request,
        'SUCCESS_MAINTENANCE',
        response,
        duration
      );
      return response;
    }

    // 2. Check in-memory cache (optimized for 10-20s polling)
    const now = Date.now();
    if (this.servicesCache && now - this.lastCacheTime < this.SERVICES_CACHE_TTL_MS) {
      return this.servicesCache;
    }

    const db = getDatabase();

    // 3. Preload all active blacklists and exclusions in memory for fast lookup
    const blacklisted = new Set(
      (db.prepare(`
        SELECT phone_number || '::' || service as k
        FROM grizzly_number_service_cancellations
        WHERE is_permanently_excluded = 1
      `).all() as any[]).map((r) => r.k)
    );

    const quarantined = new Set(
      (db.prepare(`
        SELECT phone_number || '::' || service as k
        FROM grizzly_number_quarantine
        WHERE status = 'quarantined'
      `).all() as any[]).map((r) => r.k)
    );

    const prohibited = new Set(
      (db.prepare(`
        SELECT phone_number || '::' || service as k
        FROM grizzly_prohibited_numbers
      `).all() as any[]).map((r) => r.k)
    );

    // Active & supported countries from official registry
    const activeCountries = new Set(
      (db.prepare(`
        SELECT provider_country_id
        FROM grizzly_countries
        WHERE is_active = 1 AND is_supported = 1
      `).all() as any[]).map((r) => r.provider_country_id)
    );

    // Active & supported services from official registry
    const activeServices = new Set(
      (db.prepare(`
        SELECT provider_service_code
        FROM grizzly_services
        WHERE is_active = 1 AND is_supported = 1
      `).all() as any[]).map((r) => r.provider_service_code)
    );

    // 4. Query physical inventory currently available with active hardware capacity
    const rows = db.prepare(`
      SELECT
        i.country_id,
        i.operator,
        i.supported_services,
        i.phone_number
      FROM grizzly_inventory i
      LEFT JOIN grizzly_hardware_modules h ON i.hardware_module_id = h.id
      WHERE i.status = 'available'
        AND (i.hardware_module_id IS NULL OR h.status = 'active')
    `).all() as Array<{
      country_id: number;
      operator: string;
      supported_services: string;
      phone_number: string;
    }>;

    // 5. Aggregate counts per country -> operator -> service
    const countryMap = new Map<number, Map<string, Map<string, number>>>();

    for (const row of rows) {
      const countryId = row.country_id;
      // Skip if country is inactive or unsupported in official registry
      if (activeCountries.size > 0 && !activeCountries.has(countryId)) {
        continue;
      }

      let services: string[] = [];
      try {
        services = JSON.parse(row.supported_services || '[]');
      } catch {
        services = ['tg', 'wa'];
      }

      const op = (row.operator || 'any').trim().toLowerCase();
      const cleanPhone = row.phone_number.replace(/\D/g, '');

      for (const s of services) {
        // Skip if service is inactive or unsupported in official registry
        if (activeServices.size > 0 && !activeServices.has(s)) {
          continue;
        }

        const key = `${cleanPhone}::${s}`;
        const keyAll = `${cleanPhone}::ALL`;

        // Exclude if blacklisted (>= 5 cancellations), quarantined (status 5), or prohibited (status 1)
        if (blacklisted.has(key) || quarantined.has(key) || prohibited.has(key) || prohibited.has(keyAll)) {
          continue;
        }

        if (!countryMap.has(countryId)) {
          countryMap.set(countryId, new Map());
        }
        const opMap = countryMap.get(countryId)!;

        if (!opMap.has(op)) {
          opMap.set(op, new Map());
        }
        const svcMap = opMap.get(op)!;

        svcMap.set(s, (svcMap.get(s) || 0) + 1);
      }
    }

    // 6. Build exact standard countryList response (excluding empty entries)
    const countryList: GrizzlyCountryServicesItem[] = [];

    for (const [countryId, opMap] of countryMap.entries()) {
      const operatorMapObj: Record<string, Record<string, number>> = {};

      for (const [op, svcMap] of opMap.entries()) {
        const svcObj: Record<string, number> = {};
        for (const [svc, count] of svcMap.entries()) {
          if (count > 0) {
            svcObj[svc] = count;
          }
        }

        if (Object.keys(svcObj).length > 0) {
          operatorMapObj[op] = svcObj;
        }
      }

      if (Object.keys(operatorMapObj).length > 0) {
        countryList.push({
          country: countryId,
          operatorMap: operatorMapObj
        });
      }
    }

    // 7. Atomically synchronize grizzly_country_services availability registry
    try {
      const upsertCs = db.prepare(`
        INSERT INTO grizzly_country_services (
          id, provider_country_id, provider_service_code, operator_code, available_quantity, is_available, is_enabled, last_inventory_sync
        ) VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))
        ON CONFLICT(provider_country_id, provider_service_code, operator_code) DO UPDATE SET
          available_quantity = excluded.available_quantity,
          is_available = excluded.is_available,
          last_inventory_sync = datetime('now'),
          updated_at = datetime('now')
      `);

      for (const item of countryList) {
        for (const [op, svcMap] of Object.entries(item.operatorMap)) {
          for (const [svc, qty] of Object.entries(svcMap)) {
            upsertCs.run(crypto.randomUUID(), item.country, svc, op, qty, qty > 0 ? 1 : 0);
          }
        }
      }
    } catch {}

    const response: GrizzlyGetServicesResponse = {
      countryList,
      status: 'SUCCESS'
    };

    this.servicesCache = response;
    this.lastCacheTime = now;

    const duration = Date.now() - startTime;
    GrizzlyProviderConfigService.recordRequestMetric(true);
    GrizzlyProviderConfigService.logApiCall(
      'GET_SERVICES',
      clientIp,
      {},
      request,
      'SUCCESS',
      response,
      duration
    );

    return response;
  }

  /**
   * Implements documented GET_NUMBER operation with database-level atomic allocation
   * Guarantees that even under high concurrency (e.g. 100 simultaneous requests),
   * no phone number is ever issued twice.
   */
  public static handleGetNumber(request: GrizzlyGetNumberRequest, clientIp?: string): GrizzlyGetNumberResponse {
    const startTime = Date.now();

    // 1. Authenticate protocol key
    if (!GrizzlyProviderConfigService.verifyProtocolKey(request.key)) {
      const duration = Date.now() - startTime;
      GrizzlyProviderConfigService.recordRequestMetric(false, 'Unauthorized: Protocol key mismatch');
      GrizzlyProviderConfigService.logApiCall(
        'GET_NUMBER',
        clientIp,
        {},
        request,
        'AUTH_ERROR',
        { error: 'Unauthorized protocol key' },
        duration,
        'Protocol key mismatch'
      );
      throw new Error('AUTH_ERROR');
    }

    const config = GrizzlyProviderConfigService.getConfig();

    if (config.status !== 'enabled') {
      const duration = Date.now() - startTime;
      const noNumbersResp: GrizzlyGetNumberResponse = { status: 'NO_NUMBERS' };
      GrizzlyProviderConfigService.logApiCall(
        'GET_NUMBER',
        clientIp,
        {},
        request,
        'NO_NUMBERS',
        noNumbersResp,
        duration,
        'Provider is currently disabled or in maintenance'
      );
      return noNumbersResp;
    }

    // 2. Strict field type validation
    const country = typeof request.country === 'number' ? request.country : parseInt(String(request.country), 10);
    const service = (request.service || '').trim().toLowerCase();
    const operator = (request.operator || 'any').trim().toLowerCase();
    const sum = typeof request.sum === 'number' ? Number(request.sum.toFixed(2)) : parseFloat(String(request.sum)) || 0.0;
    const exceptionPhoneSet = Array.isArray(request.exceptionPhoneSet) ? request.exceptionPhoneSet : [];
    const canGetAnotherSms = Boolean(request.canGetAnotherSms);

    if (isNaN(country) || !service) {
      const duration = Date.now() - startTime;
      const noNumbersResp: GrizzlyGetNumberResponse = { status: 'NO_NUMBERS' };
      GrizzlyProviderConfigService.logApiCall(
        'GET_NUMBER',
        clientIp,
        {},
        request,
        'NO_NUMBERS',
        noNumbersResp,
        duration,
        'Missing required parameters: country or service'
      );
      return noNumbersResp;
    }

    const db = getDatabase();

    // 2.5 Official Country and Service Validation
    const countryRecord = db.prepare(`
      SELECT 1 FROM grizzly_countries
      WHERE provider_country_id = ? AND is_active = 1 AND is_supported = 1
    `).get(country);

    if (!countryRecord) {
      const duration = Date.now() - startTime;
      const noNumbersResp: GrizzlyGetNumberResponse = { status: 'NO_NUMBERS' };
      GrizzlyProviderConfigService.logApiCall(
        'GET_NUMBER',
        clientIp,
        {},
        request,
        'NO_NUMBERS',
        noNumbersResp,
        duration,
        `Unsupported, inactive, or unknown country ID: ${country}`
      );
      return noNumbersResp;
    }

    const serviceRecord = db.prepare(`
      SELECT 1 FROM grizzly_services
      WHERE provider_service_code = ? AND is_active = 1 AND is_supported = 1
    `).get(service);

    if (!serviceRecord) {
      const duration = Date.now() - startTime;
      const noNumbersResp: GrizzlyGetNumberResponse = { status: 'NO_NUMBERS' };
      GrizzlyProviderConfigService.logApiCall(
        'GET_NUMBER',
        clientIp,
        {},
        request,
        'NO_NUMBERS',
        noNumbersResp,
        duration,
        `Unsupported, inactive, or unknown service code: ${service}`
      );
      return noNumbersResp;
    }

    // 3. Check active allocations limit
    const activeCount = (db.prepare(`
      SELECT COUNT(*) as c FROM grizzly_activations WHERE status = 'allocated' OR status = 'active'
    `).get() as any)?.c || 0;

    if (activeCount >= config.max_active_numbers) {
      const duration = Date.now() - startTime;
      const noNumbersResp: GrizzlyGetNumberResponse = { status: 'NO_NUMBERS' };
      GrizzlyProviderConfigService.logApiCall(
        'GET_NUMBER',
        clientIp,
        {},
        request,
        'NO_NUMBERS',
        noNumbersResp,
        duration,
        `Max active allocations limit reached (${config.max_active_numbers})`
      );
      return noNumbersResp;
    }

    // 4. ATOMIC DATABASE ALLOCATION TRANSACTION
    // Using immediate() transaction: SQLite acquires an exclusive write lock immediately,
    // guaranteeing complete serialized isolation under heavy concurrency (100 simultaneous requests).
    const allocateTx = db.transaction(() => {
      // Find candidate numbers for the requested country with active hardware modules
      const candidates = db.prepare(`
        SELECT
          i.id,
          i.phone_number,
          i.country_id,
          i.operator,
          i.hardware_module_id,
          i.supported_services,
          i.can_get_another_sms,
          i.flashcall_supported,
          i.voice_supported
        FROM grizzly_inventory i
        LEFT JOIN grizzly_hardware_modules h ON i.hardware_module_id = h.id
        WHERE i.country_id = ?
          AND i.status = 'available'
          AND (i.hardware_module_id IS NULL OR h.status = 'active')
        ORDER BY i.total_allocations ASC, i.created_at ASC
      `).all(country) as any[];

      let selectedCandidate: any = null;

      for (const cand of candidates) {
        // Operator check
        if (operator !== 'any' && cand.operator !== 'any' && cand.operator.toLowerCase() !== operator) {
          continue;
        }

        // Service capability check
        let supportedServices: string[] = [];
        try {
          supportedServices = JSON.parse(cand.supported_services || '[]');
        } catch {
          supportedServices = ['tg', 'wa'];
        }

        if (service !== 'ot' && !supportedServices.includes(service)) {
          continue;
        }

        const cleanPhone = cand.phone_number.replace(/\D/g, '');

        // Exception prefix check: full international phone number must NOT start with any excluded prefix
        let isExcludedByPrefix = false;
        for (const prefix of exceptionPhoneSet) {
          const cleanPrefix = String(prefix).replace(/\D/g, '');
          if (cleanPrefix && cleanPhone.startsWith(cleanPrefix)) {
            isExcludedByPrefix = true;
            break;
          }
        }
        if (isExcludedByPrefix) {
          continue;
        }

        // Cancellation blacklist check: permanently excluded if cancelled >= 5 times for this service
        const isBlacklisted = db.prepare(`
          SELECT 1 FROM grizzly_number_service_cancellations
          WHERE phone_number = ? AND service = ? AND is_permanently_excluded = 1
        `).get(cand.phone_number, service);
        if (isBlacklisted) {
          continue;
        }

        // Quarantine check: excluded if returned (status 5)
        const isQuarantined = db.prepare(`
          SELECT 1 FROM grizzly_number_quarantine
          WHERE phone_number = ? AND service = ? AND status = 'quarantined'
        `).get(cand.phone_number, service);
        if (isQuarantined) {
          continue;
        }

        // Prohibited check: excluded if prohibited (status 1)
        const isProhibited = db.prepare(`
          SELECT 1 FROM grizzly_prohibited_numbers
          WHERE phone_number = ? AND (service = ? OR service = 'ALL')
        `).get(cand.phone_number, service);
        if (isProhibited) {
          continue;
        }

        selectedCandidate = cand;
        break;
      }

      if (!selectedCandidate) {
        return null;
      }

      // Generate unique integer activation ID
      const activationId = GrizzlyPartnerProtocolService.generateActivationId();

      // Lock inventory atomically
      db.prepare(`
        UPDATE grizzly_inventory
        SET status = 'allocated',
            last_allocated_at = datetime('now'),
            total_allocations = total_allocations + 1,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(selectedCandidate.id);

      // Lock hardware module if associated
      if (selectedCandidate.hardware_module_id) {
        GrizzlyHardwareCapacityService.occupyModule(
          selectedCandidate.hardware_module_id,
          String(activationId)
        );
      }

      // Record activation in grizzly_activations
      const activationRecordId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO grizzly_activations (
          id, activation_id, phone_number, country_id, operator, service,
          requested_sum, can_get_another_sms, flashcall, voice, status,
          hardware_module_id, inventory_id, allocated_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now', '+20 minutes'))
      `).run(
        activationRecordId,
        activationId,
        selectedCandidate.phone_number,
        country,
        operator,
        service,
        sum,
        canGetAnotherSms ? 1 : 0,
        selectedCandidate.flashcall_supported ? 1 : 0,
        selectedCandidate.voice_supported ? 1 : 0,
        'allocated',
        selectedCandidate.hardware_module_id || null,
        selectedCandidate.id
      );

      // Create provider accounting record
      db.prepare(`
        INSERT INTO grizzly_provider_accounting (
          id, activation_id, requested_sum, reward_amount, settlement_status, notes
        ) VALUES (?, ?, ?, 0.0, 'pending', 'Allocated via GET_NUMBER')
      `).run(
        crypto.randomUUID(),
        activationId,
        sum
      );

      return {
        selectedCandidate,
        activationId
      };
    });

    let txResult: { selectedCandidate: any; activationId: number } | null = null;
    try {
      txResult = allocateTx.immediate();
    } catch (err: any) {
      console.error('[Grizzly] Allocation transaction error:', err);
      const duration = Date.now() - startTime;
      const noNumbersResp: GrizzlyGetNumberResponse = { status: 'NO_NUMBERS' };
      GrizzlyProviderConfigService.recordRequestMetric(false, err.message);
      GrizzlyProviderConfigService.logApiCall(
        'GET_NUMBER',
        clientIp,
        {},
        request,
        'ERROR',
        noNumbersResp,
        duration,
        err.message
      );
      return noNumbersResp;
    }

    if (!txResult) {
      const duration = Date.now() - startTime;
      const noNumbersResp: GrizzlyGetNumberResponse = { status: 'NO_NUMBERS' };
      GrizzlyProviderConfigService.recordRequestMetric(true);
      GrizzlyProviderConfigService.logApiCall(
        'GET_NUMBER',
        clientIp,
        {},
        request,
        'NO_NUMBERS',
        noNumbersResp,
        duration,
        'No matching inventory available'
      );
      return noNumbersResp;
    }

    // Invalidate GET_SERVICES cache immediately
    this.invalidateCache();

    // Format phone number as numeric Ulong
    const numericPhoneStr = txResult.selectedCandidate.phone_number.replace(/\D/g, '');
    const numericPhoneNumber = parseInt(numericPhoneStr, 10);

    const successResponse: GrizzlyGetNumberResponse = {
      status: 'SUCCESS',
      number: numericPhoneNumber,
      activationId: txResult.activationId,
      flashcall: Boolean(txResult.selectedCandidate.flashcall_supported),
      voice: Boolean(txResult.selectedCandidate.voice_supported),
      canGetAnotherSms: canGetAnotherSms
    };

    const duration = Date.now() - startTime;
    GrizzlyProviderConfigService.recordRequestMetric(true);
    GrizzlyProviderConfigService.logApiCall(
      'GET_NUMBER',
      clientIp,
      {},
      request,
      'SUCCESS',
      successResponse,
      duration
    );

    return successResponse;
  }
}
