import crypto from 'crypto';
import { getDatabase } from '../../../db/database.js';
import { GrizzlyProviderConfigService } from './GrizzlyProviderConfigService.js';
import { GrizzlyHardwareCapacityService } from './GrizzlyHardwareCapacityService.js';
import { GrizzlyPartnerProtocolService } from './GrizzlyPartnerProtocolService.js';
import { GrizzlyProviderConfig } from './types.js';

export class GrizzlyAdminService {
  /**
   * Retrieves high-level telephony KPI metrics for GrizzlySMS dashboard
   */
  public static getOverview() {
    const db = getDatabase();
    const config = GrizzlyProviderConfigService.getConfig();
    const capacity = GrizzlyHardwareCapacityService.getCapacitySummary();

    const accounting = db.prepare(`
      SELECT
        COUNT(*) as totalTransactions,
        SUM(requested_sum) as totalRequestedSum,
        SUM(reward_amount) as totalRewardAmount,
        SUM(CASE WHEN settlement_status = 'confirmed' THEN reward_amount ELSE 0 END) as confirmedRewards
      FROM grizzly_provider_accounting
    `).get() as any;

    const smsStats = db.prepare(`
      SELECT
        COUNT(*) as totalSms,
        SUM(CASE WHEN delivery_status = 'delivered' OR forwarding_status = 'forwarded' THEN 1 ELSE 0 END) as forwardedSms,
        SUM(CASE WHEN delivery_status = 'pending' THEN 1 ELSE 0 END) as pendingSms
      FROM grizzly_sms_messages
    `).get() as any;

    const voiceStats = db.prepare(`
      SELECT
        COUNT(*) as totalCalls,
        SUM(CASE WHEN delivery_status = 'delivered' THEN 1 ELSE 0 END) as deliveredCalls,
        SUM(CASE WHEN delivery_status = 'pending' THEN 1 ELSE 0 END) as pendingCalls,
        SUM(retry_count) as totalRetries
      FROM grizzly_voice_calls
    `).get() as any;

    const statusCounts = db.prepare(`
      SELECT
        SUM(CASE WHEN official_grizzly_status = 1 THEN 1 ELSE 0 END) as prohibitedCount,
        SUM(CASE WHEN official_grizzly_status = 3 THEN 1 ELSE 0 END) as soldCount,
        SUM(CASE WHEN official_grizzly_status = 4 THEN 1 ELSE 0 END) as cancelledCount,
        SUM(CASE WHEN official_grizzly_status = 5 THEN 1 ELSE 0 END) as returnedCount
      FROM grizzly_activations
    `).get() as any;

    const blacklistCount = (db.prepare(`
      SELECT COUNT(*) as c FROM grizzly_number_service_cancellations WHERE is_permanently_excluded = 1
    `).get() as any)?.c || 0;

    const quarantineCount = (db.prepare(`
      SELECT COUNT(*) as c FROM grizzly_number_quarantine WHERE status = 'quarantined'
    `).get() as any)?.c || 0;

    const avgLatency = (db.prepare(`
      SELECT AVG(response_time_ms) as avgLatency FROM grizzly_api_logs
    `).get() as any)?.avgLatency || 0;

    const failedLogs = db.prepare(`
      SELECT COUNT(*) as c FROM grizzly_api_logs WHERE response_status = 'NO_NUMBERS' OR response_status = 'ERROR'
    `).get() as any;

    const totalRequests = config.total_requests_count || 0;
    const failedRequests = config.failed_requests_count || 0;
    const errorRate = totalRequests > 0 ? ((failedRequests / totalRequests) * 100).toFixed(1) : '0.0';

    return {
      config: {
        id: config.id,
        name: config.name,
        slug: config.slug,
        status: config.status,
        partner_api_endpoint: config.partner_api_endpoint,
        outbound_api_url: config.outbound_api_url,
        priority: config.priority,
        max_active_numbers: config.max_active_numbers,
        min_payout: config.min_payout,
        max_payout: config.max_payout,
        last_successful_request_at: config.last_successful_request_at,
        last_error: config.last_error,
        last_error_at: config.last_error_at,
        total_requests_count: totalRequests,
        successful_requests_count: config.successful_requests_count || 0,
        failed_requests_count: failedRequests,
        error_rate_percentage: errorRate,
        avg_response_time_ms: Math.round(Number(avgLatency))
      },
      capacity,
      accounting: {
        totalTransactions: accounting?.totalTransactions || 0,
        totalRequestedSum: accounting?.totalRequestedSum || 0.0,
        totalRewardAmount: accounting?.totalRewardAmount || 0.0,
        confirmedRewards: accounting?.confirmedRewards || 0.0
      },
      sms: {
        total: smsStats?.totalSms || 0,
        forwarded: smsStats?.forwardedSms || 0,
        pending: smsStats?.pendingSms || 0
      },
      voice: {
        total: voiceStats?.totalCalls || 0,
        delivered: voiceStats?.deliveredCalls || 0,
        pending: voiceStats?.pendingCalls || 0,
        retries: voiceStats?.totalRetries || 0
      },
      statusDistribution: {
        prohibited: statusCounts?.prohibitedCount || 0,
        sold: statusCounts?.soldCount || 0,
        cancelled: statusCounts?.cancelledCount || 0,
        returned: statusCounts?.returnedCount || 0
      },
      blacklistCount,
      quarantineCount,
      failedAllocationsCount: failedLogs?.c || 0
    };
  }

  /**
   * Retrieves Grizzly inventory list with filters
   */
  public static getInventory(params?: { country?: number; status?: string; limit?: number; offset?: number }) {
    const db = getDatabase();
    const limit = params?.limit || 50;
    const offset = params?.offset || 0;

    let whereClause = 'WHERE 1=1';
    const queryParams: any[] = [];

    if (params?.country !== undefined && !isNaN(params.country)) {
      whereClause += ' AND i.country_id = ?';
      queryParams.push(params.country);
    }
    if (params?.status) {
      whereClause += ' AND i.status = ?';
      queryParams.push(params.status);
    }

    const total = (db.prepare(`
      SELECT COUNT(*) as c FROM grizzly_inventory i ${whereClause}
    `).get(...queryParams) as any)?.c || 0;

    const rows = db.prepare(`
      SELECT
        i.*,
        c.country_name,
        c.iso_code,
        c.dial_code,
        c.flag_emoji,
        h.name as hardware_name,
        h.slot_number
      FROM grizzly_inventory i
      LEFT JOIN grizzly_country_mappings c ON i.country_id = c.grizzly_country_id
      LEFT JOIN grizzly_hardware_modules h ON i.hardware_module_id = h.id
      ${whereClause}
      ORDER BY i.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...queryParams, limit, offset);

    return { total, rows };
  }

  /**
   * Add a new phone number to Grizzly inventory
   */
  public static addInventory(data: {
    phoneNumber: string;
    countryId: number;
    operator?: string;
    hardwareModuleId?: string;
    supportedServices?: string[];
    costPrice?: number;
    canGetAnotherSms?: boolean;
    flashcallSupported?: boolean;
    voiceSupported?: boolean;
  }) {
    const db = getDatabase();
    const id = crypto.randomUUID();

    const cleanPhone = data.phoneNumber.replace(/\s+/g, '');
    const services = data.supportedServices || ['tg', 'wa', 'go', 'ig', 'vi', 'fb', 'ot'];

    db.prepare(`
      INSERT INTO grizzly_inventory (
        id, phone_number, country_id, operator, hardware_module_id, status,
        supported_services, can_get_another_sms, flashcall_supported,
        voice_supported, cost_price
      ) VALUES (?, ?, ?, ?, ?, 'available', ?, ?, ?, ?, ?)
    `).run(
      id,
      cleanPhone,
      data.countryId,
      data.operator || 'any',
      data.hardwareModuleId || null,
      JSON.stringify(services),
      data.canGetAnotherSms !== false ? 1 : 0,
      data.flashcallSupported !== false ? 1 : 0,
      data.voiceSupported ? 1 : 0,
      data.costPrice || 0.0
    );

    GrizzlyPartnerProtocolService.invalidateCache();
    return { success: true, id };
  }

  /**
   * List activations with filters
   */
  public static getActivations(params?: { status?: string; search?: string; limit?: number; offset?: number }) {
    const db = getDatabase();
    const limit = params?.limit || 50;
    const offset = params?.offset || 0;

    let whereClause = 'WHERE 1=1';
    const queryParams: any[] = [];

    if (params?.status) {
      whereClause += ' AND a.status = ?';
      queryParams.push(params.status);
    }
    if (params?.search) {
      whereClause += ' AND (a.phone_number LIKE ? OR a.activation_id LIKE ?)';
      queryParams.push(`%${params.search}%`, `%${params.search}%`);
    }

    const total = (db.prepare(`
      SELECT COUNT(*) as c FROM grizzly_activations a ${whereClause}
    `).get(...queryParams) as any)?.c || 0;

    const rows = db.prepare(`
      SELECT
        a.*,
        c.country_name,
        c.iso_code,
        c.flag_emoji,
        h.name as hardware_name
      FROM grizzly_activations a
      LEFT JOIN grizzly_country_mappings c ON a.country_id = c.grizzly_country_id
      LEFT JOIN grizzly_hardware_modules h ON a.hardware_module_id = h.id
      ${whereClause}
      ORDER BY a.allocated_at DESC
      LIMIT ? OFFSET ?
    `).all(...queryParams, limit, offset);

    return { total, rows };
  }

  /**
   * List API logs with pagination
   */
  public static getApiLogs(limit = 100, offset = 0) {
    const db = getDatabase();
    const total = (db.prepare('SELECT COUNT(*) as c FROM grizzly_api_logs').get() as any)?.c || 0;
    const rows = db.prepare(`
      SELECT * FROM grizzly_api_logs
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    return { total, rows };
  }

  /**
   * List SMS messages and forwarding status
   */
  public static getSmsMessages(limit = 50) {
    const db = getDatabase();
    return db.prepare(`
      SELECT m.*, a.service, a.operator
      FROM grizzly_sms_messages m
      LEFT JOIN grizzly_activations a ON m.activation_id = a.activation_id
      ORDER BY m.received_timestamp DESC
      LIMIT ?
    `).all(limit);
  }

  /**
   * List Voice Calls (PUSH_CALL queue)
   */
  public static getVoiceCalls(limit = 50) {
    const db = getDatabase();
    return db.prepare(`
      SELECT c.*, a.service, a.operator
      FROM grizzly_voice_calls c
      LEFT JOIN grizzly_activations a ON c.activation_id = a.activation_id
      ORDER BY c.created_at DESC
      LIMIT ?
    `).all(limit);
  }

  /**
   * List Call Audio/Text Records (PUSH_CALL_RECORD queue)
   */
  public static getCallRecords(limit = 50) {
    const db = getDatabase();
    return db.prepare(`
      SELECT r.*, a.service, a.operator
      FROM grizzly_call_records r
      LEFT JOIN grizzly_activations a ON r.activation_id = a.activation_id
      ORDER BY r.created_at DESC
      LIMIT ?
    `).all(limit);
  }

  /**
   * List Number Cancellations (tracking towards threshold of 5)
   */
  public static getCancellations() {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM grizzly_number_service_cancellations
      ORDER BY cancellation_count DESC, last_cancelled_at DESC
    `).all();
  }

  /**
   * List Quarantined Numbers (Status 5 returned)
   */
  public static getQuarantine() {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM grizzly_number_quarantine
      ORDER BY quarantined_at DESC
    `).all();
  }

  /**
   * List Prohibited Numbers (Status 1 prohibited)
   */
  public static getProhibited() {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM grizzly_prohibited_numbers
      ORDER BY prohibited_at DESC
    `).all();
  }

  /**
   * Country and Service Mappings
   */
  public static getMappings() {
    const db = getDatabase();
    const countries = db.prepare('SELECT * FROM grizzly_country_mappings ORDER BY country_name ASC').all();
    const services = db.prepare('SELECT * FROM grizzly_service_mappings ORDER BY name ASC').all();
    return { countries, services };
  }
}

