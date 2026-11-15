import crypto from 'crypto';
import { getDatabase } from '../../../db/database.js';
import { WalletService } from '../../walletService.js';
import { GrizzlyCustomerApiClient, GrizzlyCustomerGetNumberResult } from './GrizzlyCustomerApiClient.js';
import { GrizzlyCustomerConfigService } from './GrizzlyCustomerConfigService.js';
import { GrizzlyCustomerPricingService } from './GrizzlyCustomerPricingService.js';
import { getSocketIO } from '../../../socket/socketManager.js';

export interface CustomerPurchaseRequest {
  userId: string;
  workspaceId?: string;
  country?: string | number; // numerical provider ID or 'any'
  service: string; // e.g. 'tg', 'wa', 'go'
  maxPrice?: number;
  idempotencyKey?: string;
  clientIp?: string;
}

export interface CustomerPurchaseResponse {
  success: boolean;
  activationId?: string;
  phoneNumber?: string;
  serviceCode?: string;
  serviceName?: string;
  countryId?: string;
  countryName?: string;
  sellingPrice?: number;
  currency?: string;
  status?: string;
  expiresAt?: string;
  walletTransactionId?: string;
  error?: string;
  message?: string;
}

export class GrizzlyCustomerPurchaseService {
  private static walletService = WalletService.getInstance();

  /**
   * Calculate customer selling price based on base price, markup percentage, and fixed fee
   */
  public static calculateCustomerPrice(baseCost: number, markupPercentage: number, fixedFee: number): {
    acquisitionCost: number;
    sellingPrice: number;
    adminProfit: number;
  } {
    const acquisitionCost = Math.max(0.1, Number(baseCost.toFixed(2)));
    const markupAmount = (acquisitionCost * markupPercentage) / 100;
    const sellingPrice = Number((acquisitionCost + markupAmount + fixedFee).toFixed(2));
    const adminProfit = Number((sellingPrice - acquisitionCost).toFixed(2));

    return { acquisitionCost, sellingPrice, adminProfit };
  }

  /**
   * SECTION 9: Retrieve customer purchase options (Countries, Services, Displayed Selling Prices)
   */
  public static getPurchaseOptions(): {
    countries: any[];
    services: any[];
    pricing: {
      markupPercentage: number;
      fixedFee: number;
      currency: string;
    };
  } {
    const db = getDatabase();
    const config = GrizzlyCustomerConfigService.getConfig(true);

    const countries = db.prepare(`
      SELECT provider_country_id, country_name, country_code_iso2, flag, dial_code
      FROM grizzly_countries
      WHERE is_active = 1 AND is_supported = 1
      ORDER BY country_name ASC
    `).all() as any[];

    // Add "Any Country / Automatic" option as first item
    countries.unshift({
      provider_country_id: 'any',
      country_name: '⚡ Automatic Selection (Best Availability)',
      country_code_iso2: 'GLOBAL',
      flag: '🌐',
      dial_code: null
    });

    const services = db.prepare(`
      SELECT provider_service_code, service_name, display_name, icon, category
      FROM grizzly_services
      WHERE is_active = 1 AND is_supported = 1
      ORDER BY display_name ASC
    `).all() as any[];

    const servicesWithPrices = services.map((s: any) => {
      // Base estimated cost for services
      let estimatedBase = 15.0; // default ₹15 base provider cost
      if (['tg', 'wa'].includes(s.provider_service_code)) estimatedBase = 20.0;
      if (['vi', 'ig', 'fb'].includes(s.provider_service_code)) estimatedBase = 12.0;

      const price = this.calculateCustomerPrice(estimatedBase, config.markup_percentage || 25, config.fixed_fee || 5);
      return {
        ...s,
        estimatedBaseCost: price.acquisitionCost,
        sellingPrice: price.sellingPrice,
        currency: 'INR'
      };
    });

    return {
      countries,
      services: servicesWithPrices,
      pricing: {
        markupPercentage: config.markup_percentage || 25,
        fixedFee: config.fixed_fee || 5,
        currency: 'INR'
      }
    };
  }

  /**
   * SECTION 2: End-to-end Customer Purchase Workflow
   * 1. Validate customer, service, country, and limits
   * 2. Atomically reserve wallet funds
   * 3. Outbound getNumber API call to GrizzlySMS
   * 4. Settle deduction on success or release funds on failure
   */
  public static async purchaseNumber(request: CustomerPurchaseRequest): Promise<CustomerPurchaseResponse> {
    const db = getDatabase();
    const { userId, workspaceId, service, maxPrice, clientIp } = request;
    const country = request.country !== undefined ? request.country : 'any';
    const idempotencyKey = request.idempotencyKey || `idem_${crypto.randomUUID()}`;

    // 0. Idempotency Check: Prevent duplicate purchases
    const existingActivation = db.prepare(`
      SELECT * FROM grizzly_customer_activations WHERE idempotency_key = ?
    `).get(idempotencyKey) as any;

    if (existingActivation && existingActivation.status !== 'FAILED') {
      return {
        success: true,
        activationId: existingActivation.provider_activation_id,
        phoneNumber: existingActivation.phone_number,
        serviceCode: existingActivation.service_code,
        serviceName: existingActivation.service_name,
        countryName: existingActivation.country_name,
        sellingPrice: existingActivation.customer_selling_price,
        currency: existingActivation.currency,
        status: existingActivation.status,
        expiresAt: existingActivation.expires_at,
        walletTransactionId: existingActivation.wallet_transaction_id,
        message: 'Order already processed (idempotent result).'
      };
    }

    // 1. Validate Provider Configuration
    const config = GrizzlyCustomerConfigService.getConfig(false);
    if (!config.is_enabled) {
      throw new Error('GrizzlySMS Virtual Number Marketplace is currently undergoing maintenance. Please try again later.');
    }

    if (!config.api_key) {
      throw new Error('Provider connection not configured. Please contact support.');
    }

    // 2. Validate Service
    const cleanService = (service || '').trim().toLowerCase();
    const serviceRecord = db.prepare(`
      SELECT * FROM grizzly_services
      WHERE provider_service_code = ? AND is_active = 1 AND is_supported = 1
    `).get(cleanService) as any;

    if (!serviceRecord) {
      throw new Error(`The requested service "${service}" is invalid or currently unsupported.`);
    }

    // 3. Validate Country
    let countryName = 'Automatic Selection';
    let countryIdStr = 'any';

    if (country && String(country).toLowerCase() !== 'any' && String(country).toLowerCase() !== 'all') {
      const countryNum = parseInt(String(country), 10);
      if (isNaN(countryNum)) {
        throw new Error(`Invalid country specification: ${country}`);
      }
      const countryRecord = db.prepare(`
        SELECT * FROM grizzly_countries
        WHERE provider_country_id = ? AND is_active = 1 AND is_supported = 1
      `).get(countryNum) as any;

      if (!countryRecord) {
        throw new Error(`The requested country (ID ${countryNum}) is not supported or currently disabled.`);
      }
      countryName = countryRecord.country_name;
      countryIdStr = String(countryNum);
    }

    // 4. Validate Customer Purchase Limits
    const todayCount = (db.prepare(`
      SELECT COUNT(*) as c FROM grizzly_customer_activations
      WHERE user_id = ? AND created_at >= date('now')
    `).get(userId) as any)?.c || 0;

    const dailyLimit = config.customer_daily_limit || 50;
    if (todayCount >= dailyLimit) {
      throw new Error(`Daily purchase limit reached (${dailyLimit} numbers per day). Please contact administrator for increased quota.`);
    }

    // 5. Pricing Calculation & Rules Resolution
    const activeRule = GrizzlyCustomerPricingService.resolveActiveRule(countryIdStr, cleanService);
    const priceCalculation = GrizzlyCustomerPricingService.calculateCustomerSellingPrice({
      countryId: countryIdStr,
      serviceCode: cleanService,
      rawProviderPrice: maxPrice
    });

    const acquisitionCost = priceCalculation.providerAcquisitionCost;
    const sellingPrice = priceCalculation.sellingPrice;
    const adminProfit = priceCalculation.adminProfit;

    const correlationId = `pur_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const reservationDesc = `Virtual Number Purchase Hold: ${serviceRecord.display_name} (${countryName})`;

    // 6. ATOMIC WALLET RESERVATION
    let reservationResult: { success: boolean; reservationId: string; availableBalance: number };
    try {
      reservationResult = this.walletService.reserveFunds(
        userId,
        sellingPrice,
        reservationDesc,
        correlationId,
        {
          service: cleanService,
          country: countryIdStr,
          sellingPrice,
          estimatedAcquisition: acquisitionCost
        }
      );
    } catch (err: any) {
      throw new Error(err.message || 'Failed to reserve wallet balance for purchase.');
    }

    const reservationId = reservationResult.reservationId;

    // 7. DISPATCH OUTBOUND HTTP REQUEST TO GRIZZLYSMS
    let apiResult: GrizzlyCustomerGetNumberResult;
    try {
      apiResult = await GrizzlyCustomerApiClient.getNumberV2({
        apiKey: config.api_key,
        service: cleanService,
        country: countryIdStr,
        maxPrice: activeRule?.maxPrice || maxPrice || config.max_price,
        minPrice: activeRule?.minPrice || config.min_price,
        providerIds: activeRule?.allowedProviderIds || config.included_provider_ids,
        exceptProviderIds: activeRule?.excludedProviderIds || config.excluded_provider_ids,
        phoneException: config.default_phone_exceptions,
        timeoutMs: (config.timeout_seconds || 15) * 1000,
        correlationId,
        userId,
        clientIp
      });
    } catch (err: any) {
      // In case of an unexpected runtime crash in requester
      apiResult = {
        success: false,
        error: 'CLIENT_CRASH',
        code: 'CLIENT_CRASH',
        message: err.message || 'Unexpected provider client crash',
        isUnresolved: true,
        correlationId
      };
    }

    // 8. PROCESS OUTCOME: SUCCESS OR ROLLBACK
    const internalActivationId = `gact_${crypto.randomUUID()}`;

    if (apiResult.success && apiResult.activationId && apiResult.phoneNumber) {
      // Settle wallet deduction
      const finalDesc = `Virtual Number Purchase (GrizzlySMS): +${apiResult.phoneNumber} (${serviceRecord.display_name})`;
      this.walletService.commitReservation(
        userId,
        sellingPrice,
        reservationId,
        finalDesc,
        {
          activationId: apiResult.activationId,
          phoneNumber: apiResult.phoneNumber,
          correlationId,
          service: cleanService,
          country: countryIdStr
        }
      );

      // Expiration time: 20 minutes from now (standard GrizzlySMS SMS activation lifetime)
      const expiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString();

      // Insert Activation Record with multi-sms and reconciliation support
      db.prepare(`
        INSERT INTO grizzly_customer_activations (
          id, user_id, workspace_id, provider_id, provider_activation_id,
          phone_number, country_id, country_name, service_code, service_name,
          purchase_request_id, wallet_transaction_id, customer_selling_price,
          provider_acquisition_cost, admin_profit, currency, currency_numeric,
          can_get_another_sms, sms_history, status,
          sms_status, idempotency_key, expires_at, created_at, updated_at
        ) VALUES (
          ?, ?, ?, 'grizzlysms', ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, 'INR', ?,
          1, '[]', 'NUMBER_ASSIGNED',
          'PENDING', ?, ?, datetime('now'), datetime('now')
        )
      `).run(
        internalActivationId,
        userId,
        workspaceId || null,
        apiResult.activationId,
        apiResult.phoneNumber,
        countryIdStr,
        countryName,
        cleanService,
        serviceRecord.display_name,
        correlationId,
        reservationId,
        sellingPrice,
        apiResult.activationCost || acquisitionCost,
        adminProfit,
        typeof apiResult.currency === 'number' ? apiResult.currency : 643,
        idempotencyKey,
        expiresAt
      );

      // Also sync into generic virtual_number_rentals table for seamless unified portal view
      try {
        db.prepare(`
          INSERT INTO virtual_number_rentals (
            id, user_id, workspace_id, inventory_id, provider_id, order_id, phone_number,
            country_code, number_type, capabilities, rental_duration, status, auto_renew,
            renewal_date, activated_at, expires_at
          ) VALUES (
            ?, ?, ?, NULL, 'grizzlysms', NULL, ?,
            ?, 'temporary', '["sms"]', 'custom', 'active', 0,
            ?, datetime('now'), ?
          )
        `).run(
          internalActivationId,
          userId,
          workspaceId || null,
          `+${apiResult.phoneNumber}`,
          countryIdStr,
          expiresAt,
          expiresAt
        );
      } catch (err: any) {
        console.warn('[GrizzlyCustomerPurchaseService] Notice syncing to generic rentals:', err.message);
      }

      return {
        success: true,
        activationId: apiResult.activationId,
        phoneNumber: `+${apiResult.phoneNumber}`,
        serviceCode: cleanService,
        serviceName: serviceRecord.display_name,
        countryId: countryIdStr,
        countryName,
        sellingPrice,
        currency: 'INR',
        status: 'NUMBER_ASSIGNED',
        expiresAt,
        walletTransactionId: reservationId,
        message: 'Virtual number successfully allocated.'
      };
    }

    // 9. FAILURE / ROLLBACK PATH
    // Release the customer's reserved funds back to their available wallet balance
    const failureReason = apiResult.message || apiResult.error || 'Provider rejected number allocation';
    this.walletService.releaseReservation(userId, sellingPrice, reservationId, failureReason);

    // Record failed/unresolved record in activations
    const statusOutcome = apiResult.isUnresolved ? 'UNRESOLVED' : 'FAILED';
    db.prepare(`
      INSERT INTO grizzly_customer_activations (
        id, user_id, workspace_id, provider_id, provider_activation_id,
        phone_number, country_id, country_name, service_code, service_name,
        purchase_request_id, wallet_transaction_id, customer_selling_price,
        provider_acquisition_cost, admin_profit, currency, status,
        idempotency_key, failure_reason, created_at, updated_at
      ) VALUES (
        ?, ?, ?, 'grizzlysms', 'NONE',
        'NONE', ?, ?, ?, ?,
        ?, ?, ?,
        0.0, 0.0, 'INR', ?,
        ?, ?, datetime('now'), datetime('now')
      )
    `).run(
      internalActivationId,
      userId,
      workspaceId || null,
      countryIdStr,
      countryName,
      cleanService,
      serviceRecord.display_name,
      correlationId,
      reservationId,
      sellingPrice,
      statusOutcome,
      idempotencyKey,
      failureReason
    );

    throw new Error(failureReason);
  }

  /**
   * Check SMS verification code for an active activation
   */
  public static async checkActivationSms(userId: string, activationId: string): Promise<{
    status: 'WAITING_CODE' | 'CODE_RECEIVED' | 'CANCELLED' | 'EXPIRED';
    code?: string;
    message?: string;
  }> {
    const db = getDatabase();
    const activation = db.prepare(`
      SELECT * FROM grizzly_customer_activations
      WHERE (provider_activation_id = ? OR id = ?) AND user_id = ?
    `).get(activationId, activationId, userId) as any;

    if (!activation) {
      throw new Error('Activation record not found or access denied.');
    }

    // If code already stored locally, return it immediately
    if (activation.sms_code) {
      return {
        status: 'CODE_RECEIVED',
        code: activation.sms_code,
        message: 'SMS verification code received.'
      };
    }

    const config = GrizzlyCustomerConfigService.getConfig(false);
    const smsCheck = await GrizzlyCustomerApiClient.getStatus(activation.provider_activation_id, config.api_key);

    if (smsCheck.status === 'CODE_RECEIVED' && smsCheck.code) {
      db.prepare(`
        UPDATE grizzly_customer_activations
        SET sms_code = ?,
            sms_status = 'RECEIVED',
            status = 'COMPLETED',
            completed_at = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?
      `).run(smsCheck.code, activation.id);

      // Mark generic rental active/completed
      db.prepare(`
        UPDATE virtual_number_rentals SET status = 'active' WHERE id = ?
      `).run(activation.id);

      return {
        status: 'CODE_RECEIVED',
        code: smsCheck.code,
        message: 'SMS verification code received successfully.'
      };
    }

    if (smsCheck.status === 'CANCELLED') {
      db.prepare(`
        UPDATE grizzly_customer_activations
        SET status = 'CANCELLED',
            cancelled_at = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?
      `).run(activation.id);

      return {
        status: 'CANCELLED',
        message: 'Activation was cancelled by provider.'
      };
    }

    return {
      status: 'WAITING_CODE',
      message: 'Waiting for incoming SMS from provider...'
    };
  }

  /**
   * PHASE 1: Check SMS verification status and history via getStatusV2
   * Supports multiple SMS history records, deduplication, and realtime socket dispatch
   */
  public static async checkActivationSmsV2(userId: string, activationId: string, isAdmin = false): Promise<{
    status: 'WAITING_SMS' | 'SMS_RECEIVED' | 'CANCELLED' | 'ERROR';
    hasSms: boolean;
    code?: string;
    text?: string;
    dateTime?: string;
    verificationType?: number;
    smsHistory: any[];
    canGetAnotherSms: boolean;
    message?: string;
    error?: string;
  }> {
    const db = getDatabase();
    let query = 'SELECT * FROM grizzly_customer_activations WHERE (provider_activation_id = ? OR id = ?)';
    const params: any[] = [activationId, activationId];
    if (!isAdmin) {
      query += ' AND user_id = ?';
      params.push(userId);
    }

    const activation = db.prepare(query).get(...params) as any;
    if (!activation) {
      throw new Error('Activation record not found or access denied.');
    }

    let history: any[] = [];
    try {
      history = JSON.parse(activation.sms_history || '[]');
    } catch {
      history = [];
    }

    const config = GrizzlyCustomerConfigService.getConfig(false);
    const smsRes = await GrizzlyCustomerApiClient.getStatusV2(activation.provider_activation_id, config.api_key);

    if (smsRes.hasSms && smsRes.sms) {
      // Check for duplicate in history
      const isDuplicate = history.some(
        (h) => h.code === smsRes.sms!.code && (h.text === smsRes.sms!.text || h.receivedAt === smsRes.sms!.dateTime)
      );

      const entry = {
        verificationType: smsRes.verificationType || 1,
        code: smsRes.sms.code,
        text: smsRes.sms.text,
        receivedAt: smsRes.sms.dateTime || new Date().toISOString(),
        source: 'GRIZZLYSMS',
        providerActivationId: activation.provider_activation_id
      };

      if (!isDuplicate) {
        history.push(entry);
      }

      db.prepare(`
        UPDATE grizzly_customer_activations
        SET sms_code = ?,
            sms_text = ?,
            verification_type = ?,
            sms_history = ?,
            sms_status = 'RECEIVED',
            status = 'COMPLETED',
            completed_at = datetime('now'),
            last_polled_at = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?
      `).run(
        smsRes.sms.code,
        smsRes.sms.text,
        smsRes.verificationType || 1,
        JSON.stringify(history),
        activation.id
      );

      // Realtime notification
      try {
        const io = getSocketIO();
        if (io) {
          io.to(`user:${activation.user_id}`).emit('virtual-number:sms-received', {
            activationId: activation.id,
            providerActivationId: activation.provider_activation_id,
            phoneNumber: activation.phone_number,
            sms: entry,
            smsHistory: history
          });
        }
      } catch {}

      return {
        status: 'SMS_RECEIVED',
        hasSms: true,
        code: smsRes.sms.code,
        text: smsRes.sms.text,
        dateTime: smsRes.sms.dateTime,
        verificationType: smsRes.verificationType,
        smsHistory: history,
        canGetAnotherSms: Boolean(activation.can_get_another_sms),
        message: 'SMS verification code received.'
      };
    }

    if (smsRes.status === 'CANCELLED') {
      db.prepare(`
        UPDATE grizzly_customer_activations
        SET status = 'CANCELLED',
            cancelled_at = datetime('now'),
            last_polled_at = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?
      `).run(activation.id);

      return {
        status: 'CANCELLED',
        hasSms: false,
        smsHistory: history,
        canGetAnotherSms: false,
        message: 'Activation was cancelled by provider.'
      };
    }

    // Still waiting or error
    db.prepare(`
      UPDATE grizzly_customer_activations
      SET last_polled_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(activation.id);

    return {
      status: smsRes.status === 'ERROR' ? 'ERROR' : 'WAITING_SMS',
      hasSms: false,
      smsHistory: history,
      canGetAnotherSms: Boolean(activation.can_get_another_sms),
      error: smsRes.error,
      message: smsRes.error ? `Provider error: ${smsRes.error}` : 'Waiting for incoming SMS from provider...'
    };
  }

  /**
   * PHASE 1: Retrieve SMS history for an activation with strict privacy checks
   */
  public static getActivationSmsHistory(userId: string, activationId: string, isAdmin = false): {
    activationId: string;
    providerActivationId: string;
    phoneNumber: string;
    status: string;
    smsHistory: any[];
    canGetAnotherSms: boolean;
  } {
    const db = getDatabase();
    let query = 'SELECT * FROM grizzly_customer_activations WHERE (provider_activation_id = ? OR id = ?)';
    const params: any[] = [activationId, activationId];
    if (!isAdmin) {
      query += ' AND user_id = ?';
      params.push(userId);
    }

    const activation = db.prepare(query).get(...params) as any;
    if (!activation) {
      throw new Error('Activation record not found or access denied.');
    }

    let history: any[] = [];
    try {
      history = JSON.parse(activation.sms_history || '[]');
    } catch {
      history = [];
    }

    return {
      activationId: activation.id,
      providerActivationId: activation.provider_activation_id,
      phoneNumber: activation.phone_number,
      status: activation.status,
      smsHistory: history,
      canGetAnotherSms: Boolean(activation.can_get_another_sms)
    };
  }

  /**
   * Cancel an active activation (refunds user if no SMS was received)
   */
  public static async cancelActivation(userId: string, activationId: string): Promise<{ success: boolean; message: string }> {
    const db = getDatabase();
    const activation = db.prepare(`
      SELECT * FROM grizzly_customer_activations
      WHERE (provider_activation_id = ? OR id = ?) AND user_id = ?
    `).get(activationId, activationId, userId) as any;

    if (!activation) {
      throw new Error('Activation not found or unauthorized.');
    }

    if (activation.status === 'COMPLETED' || activation.sms_code) {
      throw new Error('Cannot cancel an activation that has already received an SMS verification code.');
    }

    if (activation.status === 'CANCELLED') {
      return { success: true, message: 'Activation is already cancelled.' };
    }

    const config = GrizzlyCustomerConfigService.getConfig(false);

    // Call Grizzly status 8 (cancel)
    try {
      await GrizzlyCustomerApiClient.setStatus(activation.provider_activation_id, 8, config.api_key);
    } catch (err: any) {
      console.warn('[GrizzlyCustomerPurchaseService] Provider cancel warning:', err.message);
    }

    // Refund customer wallet
    this.walletService.refund(
      userId,
      activation.customer_selling_price,
      `Cancelled Activation +${activation.phone_number} (${activation.service_name})`,
      activation.wallet_transaction_id
    );

    // Update activation
    db.prepare(`
      UPDATE grizzly_customer_activations
      SET status = 'CANCELLED',
          cancelled_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(activation.id);

    db.prepare(`
      UPDATE virtual_number_rentals SET status = 'released' WHERE id = ?
    `).run(activation.id);

    return {
      success: true,
      message: 'Activation cancelled and wallet funds successfully refunded.'
    };
  }

  /**
   * List customer's activations
   */
  public static getMyActivations(userId: string, limit = 50, offset = 0): { total: number; rows: any[] } {
    const db = getDatabase();
    const total = (db.prepare(`
      SELECT COUNT(*) as c FROM grizzly_customer_activations WHERE user_id = ?
    `).get(userId) as any)?.c || 0;

    const rows = db.prepare(`
      SELECT * FROM grizzly_customer_activations
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(userId, limit, offset) as any[];

    return { total, rows };
  }
}
