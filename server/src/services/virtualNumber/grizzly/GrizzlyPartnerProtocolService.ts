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
   * Invalidate GET_SERVICES cache on inventory changes
   */
  public static invalidateCache(): void {
    this.servicesCache = null;
    this.lastCacheTime = 0;
  }

  /**
   * Generates a unique 6 to 8 digit integer activation ID
   */
  private static generateActivationId(): number {
    const db = getDatabase();
    for (let attempts = 0; attempts < 10; attempts++) {
      // Generate a clean 6-digit random number between 100000 and 999999
      const candidateId = Math.floor(100000 + Math.random() * 900000);
      const exists = db.prepare('SELECT 1 FROM grizzly_activations WHERE activation_id = ?').get(candidateId);
      if (!exists) {
        return candidateId;
      }
    }
    // Fallback using timestamp mod 1,000,000
    return Math.floor(Date.now() % 900000) + 100000;
  }

  /**
   * Implements documented GET_SERVICES operation
   * Returns available country inventory and service counts per operator.
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

    // If disabled or maintenance, return empty country list
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

    // 3. Query active and available inventory with healthy hardware modules
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

    // 4. Aggregate counts per country -> operator -> service
    const countryMap = new Map<number, Map<string, Map<string, number>>>();

    for (const row of rows) {
      let services: string[] = [];
      try {
        services = JSON.parse(row.supported_services || '[]');
      } catch {
        services = ['tg', 'wa'];
      }

      const countryId = row.country_id;
      const op = row.operator || 'any';

      if (!countryMap.has(countryId)) {
        countryMap.set(countryId, new Map());
      }
      const opMap = countryMap.get(countryId)!;

      if (!opMap.has(op)) {
        opMap.set(op, new Map());
      }
      const svcMap = opMap.get(op)!;

      for (const s of services) {
        svcMap.set(s, (svcMap.get(s) || 0) + 1);
      }
    }

    // 5. Build standard Grizzly countryList response
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

    const response: GrizzlyGetServicesResponse = {
      countryList,
      status: 'SUCCESS'
    };

    // Store in cache
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
   * Implements documented GET_NUMBER operation
   * Allocates an available number for the specified country, operator, and service.
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

    // If disabled or maintenance, return NO_NUMBERS
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

    // 2. Validate parameters
    const country = typeof request.country === 'number' ? request.country : parseInt(String(request.country), 10);
    const service = (request.service || '').trim().toLowerCase();
    const operator = (request.operator || 'any').trim().toLowerCase();
    const sum = typeof request.sum === 'number' ? request.sum : parseFloat(String(request.sum)) || 0.0;
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

    // 4. Atomic Number Allocation inside an immediate SQLite transaction
    const allocateTx = db.transaction(() => {
      // Query candidates for the country and available status
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

      // Filter candidate in application logic
      let selectedCandidate: any = null;

      for (const cand of candidates) {
        // Check operator
        if (operator !== 'any' && cand.operator !== 'any' && cand.operator.toLowerCase() !== operator) {
          continue;
        }

        // Check service capability
        let supportedServices: string[] = [];
        try {
          supportedServices = JSON.parse(cand.supported_services || '[]');
        } catch {
          supportedServices = ['tg', 'wa'];
        }

        if (service !== 'ot' && !supportedServices.includes(service)) {
          continue;
        }

        // Check exceptionPhoneSet (number must NOT start with any prefix in exceptionPhoneSet)
        const cleanPhone = cand.phone_number.replace(/\D/g, '');
        let isExcluded = false;
        for (const prefix of exceptionPhoneSet) {
          const cleanPrefix = String(prefix).replace(/\D/g, '');
          if (cleanPrefix && cleanPhone.startsWith(cleanPrefix)) {
            isExcluded = true;
            break;
          }
        }

        if (isExcluded) {
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

      // Lock inventory
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

      // Record activation
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
      txResult = allocateTx();
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

    // Invalidate GET_SERVICES cache
    this.invalidateCache();

    // Format phone number as an integer per documentation
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
