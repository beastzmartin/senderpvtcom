import crypto from 'crypto';
import { getDatabase } from '../../../db/database.js';

export interface GrizzlyCustomerGetNumberParams {
  apiKey?: string;
  service: string;
  country?: string | number;
  maxPrice?: number;
  minPrice?: number;
  providerIds?: string;
  exceptProviderIds?: string;
  phoneException?: string;
  timeoutMs?: number;
  correlationId?: string;
  userId?: string;
  clientIp?: string;
}

export interface GrizzlyCustomerGetNumberResult {
  success: boolean;
  activationId?: string;
  phoneNumber?: string;
  provider?: string;
  status?: 'NUMBER_ASSIGNED' | 'WAITING_SMS' | 'FAILED' | 'UNRESOLVED';
  activationCost?: number;
  currency?: number | string;
  countryCode?: string;
  error?: string;
  message?: string;
  code?: string;
  isUnresolved?: boolean;
  rawResponse?: string;
  correlationId?: string;
}

export interface GrizzlyCustomerBalanceResult {
  healthy: boolean;
  balance?: number;
  currency?: string;
  latencyMs?: number;
  error?: string;
  message?: string;
}

export interface GrizzlyCustomerSmsStatusResult {
  success: boolean;
  status: 'WAITING_CODE' | 'CODE_RECEIVED' | 'CANCELLED' | 'UNKNOWN' | 'ERROR';
  code?: string;
  fullResponse?: string;
  error?: string;
}

export interface GrizzlyCustomerGetStatusV2Result {
  success: boolean;
  hasSms: boolean;
  verificationType?: number;
  sms?: {
    dateTime: string;
    code: string;
    text: string;
  };
  rawResponse: string;
  status: 'WAITING_SMS' | 'SMS_RECEIVED' | 'CANCELLED' | 'ERROR' | 'UNKNOWN';
  error?: string;
  code?: string;
}

export interface GrizzlyPricesV1Entry {
  country: string;
  service: string;
  cost: number;
  count: number;
}

export interface GrizzlyPricesV1Result {
  success: boolean;
  data: Record<string, Record<string, { cost: number; count: number }>>;
  entries: GrizzlyPricesV1Entry[];
  rawResponse: string;
  error?: string;
}

export interface GrizzlyPricesV2Result {
  success: boolean;
  data: Record<string, Record<string, Record<string, number>>>;
  rawResponse: string;
  error?: string;
}

export interface GrizzlyProviderPriceInfo {
  providerId: string;
  count: number;
  prices: number[];
  lowestPrice: number;
  highestPrice: number;
}

export interface GrizzlyPricesV3ServiceData {
  price: number;
  count: number;
  providers: Record<string, {
    count: number;
    price: number[];
    provider_id?: string | number;
  }>;
  normalizedProviders: GrizzlyProviderPriceInfo[];
}

export interface GrizzlyPricesV3Result {
  success: boolean;
  data: Record<string, Record<string, GrizzlyPricesV3ServiceData>>;
  rawResponse: string;
  error?: string;
}

export interface GrizzlyRemoteActiveActivation {
  activationCost: number;
  activationId: string;
  activationStatus: number;
  activationTime: string;
  canGetAnotherSms: number;
  countryCode: string;
  countryName: string;
  currency: number | string;
  discount: number;
  phoneNumber: string;
  repeated: number;
  serviceCode: string;
  smsCode: string;
  smsText: string;
}

export interface GrizzlyActiveActivationsResult {
  success: boolean;
  activations: GrizzlyRemoteActiveActivation[];
  rawResponse: string;
  error?: string;
}

export class GrizzlyCustomerApiClient {
  private static defaultBaseUrl = 'https://api.grizzlysms.com/stubs/handler_api.php';

  /**
   * Helper to redact sensitive API keys from strings and URLs
   */
  public static redactApiKey(urlOrText: string): string {
    if (!urlOrText) return '';
    return urlOrText.replace(/(api_key=)[^&]+/gi, '$1[REDACTED_API_KEY]');
  }

  /**
   * Resolve active API key and configuration
   */
  private static resolveConfig(): { apiKey: string; baseUrl: string; timeoutMs: number } {
    const db = getDatabase();
    const config = db.prepare('SELECT * FROM grizzly_customer_config WHERE id = ?').get('default') as any;
    const apiKey = process.env.GRIZZLYSMS_CUSTOMER_API_KEY || config?.api_key || '';
    const baseUrl = config?.base_url || this.defaultBaseUrl;
    const timeoutMs = (config?.timeout_seconds || 15) * 1000;
    return { apiKey, baseUrl, timeoutMs };
  }

  /**
   * Log Customer API call to database diagnostics table
   */
  private static logApiCall(data: {
    correlationId: string;
    action: string;
    endpoint: string;
    requestParams: Record<string, any>;
    responseStatusCode?: number;
    responseBody?: string;
    parsedStatus?: string;
    isSuccess: boolean;
    errorMessage?: string;
    durationMs: number;
    userId?: string;
    clientIp?: string;
  }): void {
    try {
      const db = getDatabase();
      // Redact api_key from request params
      const sanitizedParams = { ...data.requestParams };
      if (sanitizedParams.api_key) {
        sanitizedParams.api_key = '[REDACTED_API_KEY]';
      }

      db.prepare(`
        INSERT INTO grizzly_customer_api_logs (
          id, correlation_id, action, endpoint, request_params,
          response_status_code, response_body, parsed_status, is_success,
          error_message, duration_ms, user_id, client_ip
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        data.correlationId,
        data.action,
        data.endpoint,
        JSON.stringify(sanitizedParams),
        data.responseStatusCode || 0,
        data.responseBody || null,
        data.parsedStatus || null,
        data.isSuccess ? 1 : 0,
        data.errorMessage || null,
        data.durationMs,
        data.userId || null,
        data.clientIp || null
      );
    } catch (err: any) {
      console.error('[GrizzlyCustomerApiClient] Failed to log API call:', err.message);
    }
  }

  /**
   * Helper to parse plain-text getNumber response strings (e.g. ACCESS_NUMBER:id:number or error strings)
   */
  public static parseGetNumberResponse(text: string): GrizzlyCustomerGetNumberResult {
    const cleanText = (text || '').trim();
    if (cleanText.startsWith('ACCESS_NUMBER:')) {
      const parts = cleanText.split(':');
      if (parts.length >= 3) {
        return {
          success: true,
          activationId: String(parts[1]).trim(),
          phoneNumber: String(parts[2]).trim(),
          provider: 'grizzlysms',
          status: 'NUMBER_ASSIGNED',
          rawResponse: cleanText
        };
      }
    }

    let errorCode = cleanText;
    let userFriendlyMessage = cleanText;

    if (cleanText === 'BAD_KEY') {
      errorCode = 'BAD_KEY';
      userFriendlyMessage = 'Invalid or unauthorized GrizzlySMS API key. Please contact administrator.';
    } else if (cleanText === 'NO_BALANCE') {
      errorCode = 'NO_BALANCE';
      userFriendlyMessage = 'GrizzlySMS account balance is insufficient. Administrator has been alerted.';
    } else if (cleanText === 'NO_NUMBERS') {
      errorCode = 'NO_NUMBERS';
      userFriendlyMessage = 'No eligible virtual numbers are currently available for this service. Try another country or service.';
    } else if (cleanText.includes('The service is prohibited for sale by administration') || cleanText === 'BAD_SERVICE') {
      errorCode = 'SERVICE_PROHIBITED';
      userFriendlyMessage = 'This service is currently prohibited for sale by provider administration.';
    } else if (cleanText === 'SERVICE_UNAVAILABLE_REGION') {
      errorCode = 'SERVICE_UNAVAILABLE_REGION';
      userFriendlyMessage = 'This service is restricted in the requested geographical region.';
    } else if (cleanText === 'BAD_ACTION') {
      errorCode = 'BAD_ACTION';
      userFriendlyMessage = 'Invalid protocol action requested.';
    } else {
      errorCode = 'UNKNOWN_RESPONSE';
      userFriendlyMessage = `Provider returned unrecognized status: ${cleanText}`;
    }

    return {
      success: false,
      error: cleanText,
      code: errorCode,
      message: userFriendlyMessage,
      isUnresolved: errorCode === 'UNKNOWN_RESPONSE',
      rawResponse: cleanText
    };
  }

  /**
   * SECTION 1 & 3: Official getNumber Request Builder and Requester
   * Plain-text protocol implementation with URL-encoding, parameter filtering, and strict error mapping.
   */
  public static async getNumber(params: GrizzlyCustomerGetNumberParams): Promise<GrizzlyCustomerGetNumberResult> {
    const correlationId = params.correlationId || `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const startTime = Date.now();
    const config = this.resolveConfig();
    const apiKey = params.apiKey || config.apiKey;

    if (!apiKey) {
      return {
        success: false,
        error: 'BAD_KEY',
        code: 'BAD_KEY',
        message: 'GrizzlySMS Customer API key is not configured. Please set the API key in Admin settings.',
        correlationId
      };
    }

    const service = (params.service || '').trim().toLowerCase();
    if (!service) {
      return {
        success: false,
        error: 'BAD_SERVICE',
        code: 'BAD_SERVICE',
        message: 'A valid service code (e.g. tg, wa, go) is required.',
        correlationId
      };
    }

    // Build URL and Query parameters strictly according to specification
    const url = new URL(config.baseUrl);
    const searchParams = url.searchParams;

    searchParams.set('api_key', apiKey);
    searchParams.set('action', 'getNumber');
    searchParams.set('service', service);

    // Country: numerical ID, string 'any', or omit if unset
    if (params.country !== undefined && params.country !== null && params.country !== '') {
      const cStr = String(params.country).trim();
      if (cStr && cStr.toLowerCase() !== 'all') {
        searchParams.set('country', cStr);
      }
    }

    // Price restrictions: validate numeric ranges
    if (params.maxPrice !== undefined && params.maxPrice !== null && !isNaN(params.maxPrice) && params.maxPrice > 0) {
      searchParams.set('maxPrice', String(params.maxPrice));
    }
    if (params.minPrice !== undefined && params.minPrice !== null && !isNaN(params.minPrice) && params.minPrice >= 0) {
      searchParams.set('minPrice', String(params.minPrice));
    }

    // Provider inclusion / exclusion lists
    if (params.providerIds && params.providerIds.trim()) {
      searchParams.set('providerIds', params.providerIds.trim());
    }
    if (params.exceptProviderIds && params.exceptProviderIds.trim()) {
      searchParams.set('exceptProviderIds', params.exceptProviderIds.trim());
    }

    // Phone prefix exclusion list
    if (params.phoneException && params.phoneException.trim()) {
      searchParams.set('phoneException', params.phoneException.trim());
    }

    const timeout = params.timeoutMs || config.timeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const logParamsObj = Object.fromEntries(searchParams.entries());

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'text/plain, */*',
          'User-Agent': 'PvtSender-VirtualNumber-CustomerClient/2.0'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const durationMs = Date.now() - startTime;
      const text = (await response.text()).trim();

      // Non-200 HTTP response
      if (!response.ok) {
        this.logApiCall({
          correlationId,
          action: 'getNumber',
          endpoint: config.baseUrl,
          requestParams: logParamsObj,
          responseStatusCode: response.status,
          responseBody: text,
          parsedStatus: 'HTTP_ERROR',
          isSuccess: false,
          errorMessage: `HTTP ${response.status}: ${response.statusText}`,
          durationMs,
          userId: params.userId,
          clientIp: params.clientIp
        });

        return {
          success: false,
          error: 'HTTP_ERROR',
          code: `HTTP_${response.status}`,
          message: `GrizzlySMS gateway returned HTTP ${response.status}`,
          rawResponse: text,
          correlationId
        };
      }

      // SECTION 4: Successful Response Parsing (e.g. ACCESS_NUMBER:38496653:66846426435)
      if (text.startsWith('ACCESS_NUMBER:')) {
        const parts = text.split(':');
        if (parts.length >= 3) {
          const activationId = String(parts[1]).trim();
          const phoneNumber = String(parts[2]).trim();

          this.logApiCall({
            correlationId,
            action: 'getNumber',
            endpoint: config.baseUrl,
            requestParams: logParamsObj,
            responseStatusCode: response.status,
            responseBody: text,
            parsedStatus: 'ACCESS_NUMBER',
            isSuccess: true,
            durationMs,
            userId: params.userId,
            clientIp: params.clientIp
          });

          return {
            success: true,
            activationId,
            phoneNumber,
            provider: 'grizzlysms',
            status: 'NUMBER_ASSIGNED',
            rawResponse: text,
            correlationId
          };
        }
      }

      // SECTION 5: Error Handling
      let parsedError = text;
      let errorCode = text;
      let userFriendlyMessage = text;

      if (text === 'BAD_KEY') {
        errorCode = 'BAD_KEY';
        userFriendlyMessage = 'Invalid or unauthorized GrizzlySMS API key. Please contact administrator.';
      } else if (text === 'NO_BALANCE') {
        errorCode = 'NO_BALANCE';
        userFriendlyMessage = 'GrizzlySMS account balance is insufficient. Administrator has been alerted.';
      } else if (text === 'NO_NUMBERS') {
        errorCode = 'NO_NUMBERS';
        userFriendlyMessage = 'No eligible virtual numbers are currently available for this service. Try another country or service.';
      } else if (text.includes('The service is prohibited for sale by administration') || text === 'BAD_SERVICE') {
        errorCode = 'SERVICE_PROHIBITED';
        userFriendlyMessage = 'This service is currently prohibited for sale by provider administration.';
      } else if (text === 'SERVICE_UNAVAILABLE_REGION') {
        errorCode = 'SERVICE_UNAVAILABLE_REGION';
        userFriendlyMessage = 'This service is restricted in the requested geographical region.';
      } else if (text === 'BAD_ACTION') {
        errorCode = 'BAD_ACTION';
        userFriendlyMessage = 'Invalid protocol action requested.';
      } else {
        errorCode = 'UNKNOWN_RESPONSE';
        userFriendlyMessage = `Provider returned unrecognized status: ${text}`;
      }

      this.logApiCall({
        correlationId,
        action: 'getNumber',
        endpoint: config.baseUrl,
        requestParams: logParamsObj,
        responseStatusCode: response.status,
        responseBody: text,
        parsedStatus: errorCode,
        isSuccess: false,
        errorMessage: userFriendlyMessage,
        durationMs,
        userId: params.userId,
        clientIp: params.clientIp
      });

      return {
        success: false,
        error: parsedError,
        code: errorCode,
        message: userFriendlyMessage,
        isUnresolved: errorCode === 'UNKNOWN_RESPONSE',
        rawResponse: text,
        correlationId
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      const durationMs = Date.now() - startTime;
      const isTimeout = err.name === 'AbortError' || err.message?.includes('timeout') || err.message?.includes('abort');

      const errMsg = isTimeout
        ? `Request timed out after ${timeout}ms. Outcome unresolved to prevent duplicate charge.`
        : (err.message || 'Network transport failure');

      this.logApiCall({
        correlationId,
        action: 'getNumber',
        endpoint: config.baseUrl,
        requestParams: logParamsObj,
        responseStatusCode: 0,
        responseBody: undefined,
        parsedStatus: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
        isSuccess: false,
        errorMessage: errMsg,
        durationMs,
        userId: params.userId,
        clientIp: params.clientIp
      });

      return {
        success: false,
        error: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
        code: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
        message: errMsg,
        isUnresolved: true, // Crucial: Uncertain outcome must NOT trigger automatic duplicate purchase
        correlationId
      };
    }
  }

  /**
   * SECTION 6: Non-Purchasing Test Connection via getBalance
   * Documented safe method to check connectivity and account funds without purchasing numbers.
   */
  public static async getBalance(params?: { apiKey?: string; timeoutMs?: number }): Promise<GrizzlyCustomerBalanceResult> {
    const startTime = Date.now();
    const config = this.resolveConfig();
    const apiKey = params?.apiKey || config.apiKey;

    if (!apiKey) {
      return {
        healthy: false,
        message: 'GrizzlySMS Customer API key is missing. Please configure your API key.'
      };
    }

    const url = new URL(config.baseUrl);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('action', 'getBalance');

    const timeout = params?.timeoutMs || 8000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'Accept': 'text/plain, */*' },
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startTime;
      const text = (await response.text()).trim();

      if (text.startsWith('ACCESS_BALANCE:')) {
        const balanceVal = parseFloat(text.replace('ACCESS_BALANCE:', '').trim()) || 0.0;
        return {
          healthy: true,
          balance: balanceVal,
          currency: 'RUB', // Standard GrizzlySMS balance currency
          latencyMs,
          message: `Connected successfully. Account Balance: ${balanceVal.toFixed(2)}`
        };
      }

      if (text === 'BAD_KEY') {
        return {
          healthy: false,
          error: 'BAD_KEY',
          latencyMs,
          message: 'Authentication failed: Invalid GrizzlySMS API key.'
        };
      }

      return {
        healthy: false,
        error: text,
        latencyMs,
        message: `Provider returned: ${text}`
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startTime;
      return {
        healthy: false,
        error: 'CONNECTION_FAILED',
        latencyMs,
        message: err.name === 'AbortError' ? 'Connection timed out' : (err.message || 'Network failure')
      };
    }
  }

  /**
   * Inquire activation SMS status: action=getStatus&id=...
   * Responses:
   *  - STATUS_WAIT_CODE
   *  - STATUS_OK:<code>
   *  - STATUS_CANCEL
   */
  public static async getStatus(activationId: string, apiKey?: string): Promise<GrizzlyCustomerSmsStatusResult> {
    const config = this.resolveConfig();
    const key = apiKey || config.apiKey;
    if (!key || !activationId) {
      return { success: false, status: 'ERROR', error: 'Missing apiKey or activationId' };
    }

    const url = new URL(config.baseUrl);
    url.searchParams.set('api_key', key);
    url.searchParams.set('action', 'getStatus');
    url.searchParams.set('id', String(activationId));

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'Accept': 'text/plain, */*' }
      });
      const text = (await response.text()).trim();

      if (text === 'STATUS_WAIT_CODE') {
        return { success: true, status: 'WAITING_CODE', fullResponse: text };
      }

      if (text.startsWith('STATUS_OK:')) {
        const code = text.replace('STATUS_OK:', '').trim();
        return { success: true, status: 'CODE_RECEIVED', code, fullResponse: text };
      }

      if (text === 'STATUS_CANCEL') {
        return { success: true, status: 'CANCELLED', fullResponse: text };
      }

      return { success: false, status: 'UNKNOWN', fullResponse: text, error: text };
    } catch (err: any) {
      return { success: false, status: 'ERROR', error: err.message };
    }
  }

  /**
   * Change activation status: action=setStatus&id=...&status=...
   * Status 1: ready / wait for SMS
   * Status 3: request another SMS
   * Status 6: finish / completed
   * Status 8: cancel activation (releases funds)
   */
  public static async setStatus(activationId: string, status: number, apiKey?: string): Promise<{ success: boolean; response: string }> {
    const config = this.resolveConfig();
    const key = apiKey || config.apiKey;
    if (!key || !activationId) {
      return { success: false, response: 'Missing apiKey or activationId' };
    }

    const url = new URL(config.baseUrl);
    url.searchParams.set('api_key', key);
    url.searchParams.set('action', 'setStatus');
    url.searchParams.set('id', String(activationId));
    url.searchParams.set('status', String(status));

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'Accept': 'text/plain, */*' }
      });
      const text = (await response.text()).trim();
      const isOk = text.startsWith('ACCESS_');
      return { success: isOk, response: text };
    } catch (err: any) {
      return { success: false, response: err.message };
    }
  }

  /**
   * SECTION 4 / PHASE 4: getNumberV2 Request Builder and Requester
   * JSON-first or plain-text fallback implementation of getNumberV2 with provider filtering and currency support.
   */
  public static async getNumberV2(params: GrizzlyCustomerGetNumberParams): Promise<GrizzlyCustomerGetNumberResult> {
    const correlationId = params.correlationId || `req_v2_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const startTime = Date.now();
    const config = this.resolveConfig();
    const apiKey = params.apiKey || config.apiKey;

    if (!apiKey) {
      return {
        success: false,
        error: 'BAD_KEY',
        code: 'BAD_KEY',
        message: 'GrizzlySMS Customer API key is not configured. Please set the API key in Admin settings.',
        correlationId
      };
    }

    const service = (params.service || '').trim().toLowerCase();
    if (!service) {
      return {
        success: false,
        error: 'BAD_SERVICE',
        code: 'BAD_SERVICE',
        message: 'A valid service code (e.g. tg, wa, go) is required.',
        correlationId
      };
    }

    let countryVal = params.country !== undefined ? String(params.country).trim() : 'any';
    if (!countryVal || countryVal === '0') countryVal = 'any';

    const url = new URL(config.baseUrl);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('action', 'getNumberV2');
    url.searchParams.set('service', service);
    url.searchParams.set('country', countryVal);

    if (params.maxPrice !== undefined && params.maxPrice > 0) {
      url.searchParams.set('maxPrice', String(params.maxPrice));
    }
    if (params.minPrice !== undefined && params.minPrice > 0) {
      url.searchParams.set('minPrice', String(params.minPrice));
    }
    if (params.providerIds && params.providerIds.trim()) {
      url.searchParams.set('providerIds', params.providerIds.trim());
    }
    if (params.exceptProviderIds && params.exceptProviderIds.trim()) {
      url.searchParams.set('exceptProviderIds', params.exceptProviderIds.trim());
    }
    if (params.phoneException && params.phoneException.trim()) {
      url.searchParams.set('phoneException', params.phoneException.trim());
    }

    const timeout = params.timeoutMs || config.timeoutMs || 15000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const requestParamsForLog: Record<string, any> = {
      action: 'getNumberV2',
      service,
      country: countryVal,
      maxPrice: params.maxPrice,
      minPrice: params.minPrice,
      providerIds: params.providerIds,
      exceptProviderIds: params.exceptProviderIds,
      phoneException: params.phoneException,
      api_key: apiKey
    };

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'User-Agent': 'GrizzlyCustomerClient/2.0'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const rawText = (await response.text()).trim();
      const durationMs = Date.now() - startTime;

      // Handle JSON response
      if (rawText.startsWith('{')) {
        try {
          const json = JSON.parse(rawText);
          if (json.activationId && json.phoneNumber) {
            const activationId = String(json.activationId);
            const phoneNumber = String(json.phoneNumber);
            const activationCost = typeof json.activationCost === 'number' ? json.activationCost : parseFloat(json.activationCost) || 0;
            const currency = json.currency || 643;
            const countryCode = json.countryCode ? String(json.countryCode) : countryVal;

            this.logApiCall({
              correlationId,
              action: 'getNumberV2',
              endpoint: config.baseUrl,
              requestParams: requestParamsForLog,
              responseStatusCode: response.status,
              responseBody: rawText,
              parsedStatus: 'NUMBER_ASSIGNED',
              isSuccess: true,
              durationMs,
              userId: params.userId,
              clientIp: params.clientIp
            });

            return {
              success: true,
              activationId,
              phoneNumber,
              activationCost,
              currency,
              countryCode,
              provider: 'grizzlysms',
              status: 'NUMBER_ASSIGNED',
              rawResponse: rawText,
              correlationId
            };
          }

          if (json.error) {
            const errStr = String(json.error);
            this.logApiCall({
              correlationId,
              action: 'getNumberV2',
              endpoint: config.baseUrl,
              requestParams: requestParamsForLog,
              responseStatusCode: response.status,
              responseBody: rawText,
              parsedStatus: 'FAILED',
              isSuccess: false,
              errorMessage: errStr,
              durationMs,
              userId: params.userId,
              clientIp: params.clientIp
            });

            return {
              success: false,
              error: errStr,
              code: errStr,
              message: json.message || `Provider returned error: ${errStr}`,
              rawResponse: rawText,
              correlationId
            };
          }
        } catch {
          // JSON parse failed, continue to text parsing
        }
      }

      // Plain-text parser fallback
      const parsed = this.parseGetNumberResponse(rawText);
      const isSuccess = parsed.success;

      this.logApiCall({
        correlationId,
        action: 'getNumberV2',
        endpoint: config.baseUrl,
        requestParams: requestParamsForLog,
        responseStatusCode: response.status,
        responseBody: rawText,
        parsedStatus: parsed.status,
        isSuccess,
        errorMessage: parsed.error,
        durationMs,
        userId: params.userId,
        clientIp: params.clientIp
      });

      return {
        ...parsed,
        correlationId
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      const durationMs = Date.now() - startTime;
      const isTimeout = err.name === 'AbortError' || err.message?.includes('aborted');
      const errMsg = isTimeout
        ? `GrizzlySMS API request timed out after ${timeout / 1000} seconds`
        : `Network connection failed: ${err.message || 'Unknown network error'}`;

      this.logApiCall({
        correlationId,
        action: 'getNumberV2',
        endpoint: config.baseUrl,
        requestParams: requestParamsForLog,
        responseStatusCode: 0,
        responseBody: undefined,
        parsedStatus: 'UNRESOLVED',
        isSuccess: false,
        errorMessage: errMsg,
        durationMs,
        userId: params.userId,
        clientIp: params.clientIp
      });

      return {
        success: false,
        error: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
        code: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
        message: errMsg,
        isUnresolved: true,
        correlationId
      };
    }
  }

  /**
   * PHASE 1: getStatusV2 Method
   * Action: action=getStatusV2&id={activationId}
   * Returns verificationType, SMS datetime, verification code, and full SMS text.
   */
  public static async getStatusV2(activationId: string, apiKey?: string): Promise<GrizzlyCustomerGetStatusV2Result> {
    const config = this.resolveConfig();
    const key = apiKey || config.apiKey;
    const cleanId = String(activationId || '').trim();

    if (!key || !cleanId) {
      return {
        success: false,
        hasSms: false,
        status: 'ERROR',
        error: 'Missing apiKey or activationId',
        rawResponse: ''
      };
    }

    const url = new URL(config.baseUrl);
    url.searchParams.set('api_key', key);
    url.searchParams.set('action', 'getStatusV2');
    url.searchParams.set('id', cleanId);

    const startTime = Date.now();
    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'User-Agent': 'GrizzlyCustomerClient/2.0'
        }
      });
      const text = (await response.text()).trim();
      const durationMs = Date.now() - startTime;

      // Handle JSON response
      if (text.startsWith('{')) {
        try {
          const json = JSON.parse(text);
          const verificationType = json.verificationType !== undefined ? Number(json.verificationType) : undefined;

          if (json.sms && (json.sms.code || json.sms.text)) {
            return {
              success: true,
              hasSms: true,
              verificationType,
              sms: {
                dateTime: String(json.sms.dateTime || new Date().toISOString()),
                code: String(json.sms.code || '').trim(),
                text: String(json.sms.text || '').trim()
              },
              rawResponse: text,
              status: 'SMS_RECEIVED'
            };
          }

          if (json.error) {
            return {
              success: false,
              hasSms: false,
              status: 'ERROR',
              error: String(json.error),
              code: String(json.error),
              rawResponse: text
            };
          }

          return {
            success: true,
            hasSms: false,
            verificationType,
            rawResponse: text,
            status: 'WAITING_SMS'
          };
        } catch {
          // Continue to plain text
        }
      }

      // Plain text check
      if (text === 'STATUS_WAIT_CODE') {
        return {
          success: true,
          hasSms: false,
          status: 'WAITING_SMS',
          rawResponse: text
        };
      }

      if (text.startsWith('STATUS_OK:')) {
        const code = text.replace('STATUS_OK:', '').trim();
        return {
          success: true,
          hasSms: true,
          verificationType: 1,
          sms: {
            dateTime: new Date().toISOString(),
            code,
            text: code
          },
          status: 'SMS_RECEIVED',
          rawResponse: text
        };
      }

      if (text === 'STATUS_CANCEL') {
        return {
          success: true,
          hasSms: false,
          status: 'CANCELLED',
          rawResponse: text
        };
      }

      if (['NO_ACTIVATION', 'BAD_KEY', 'BAD_ACTION', 'SERVICE_UNAVAILABLE_REGION'].includes(text)) {
        return {
          success: false,
          hasSms: false,
          status: 'ERROR',
          error: text,
          code: text,
          rawResponse: text
        };
      }

      return {
        success: false,
        hasSms: false,
        status: 'UNKNOWN',
        error: text,
        rawResponse: text
      };
    } catch (err: any) {
      return {
        success: false,
        hasSms: false,
        status: 'ERROR',
        error: err.message || 'Network request failed',
        rawResponse: ''
      };
    }
  }

  /**
   * PHASE 2: getPrices Method
   * Action: action=getPrices&service=...&country=...
   * Parses dynamic Country -> Service -> { cost, count } response.
   */
  public static async getPrices(params?: {
    service?: string;
    country?: string | number;
    apiKey?: string;
  }): Promise<GrizzlyPricesV1Result> {
    const config = this.resolveConfig();
    const key = params?.apiKey || config.apiKey;

    if (!key) {
      return {
        success: false,
        data: {},
        entries: [],
        rawResponse: '',
        error: 'Missing GrizzlySMS API key'
      };
    }

    const url = new URL(config.baseUrl);
    url.searchParams.set('api_key', key);
    url.searchParams.set('action', 'getPrices');

    if (params?.service && params.service !== 'all') {
      url.searchParams.set('service', params.service.trim().toLowerCase());
    }
    if (params?.country !== undefined && String(params.country) !== 'any' && String(params.country) !== 'all') {
      url.searchParams.set('country', String(params.country).trim());
    }

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'Accept': 'application/json, text/plain, */*' }
      });
      const text = (await response.text()).trim();

      if (!text.startsWith('{')) {
        return {
          success: false,
          data: {},
          entries: [],
          rawResponse: text,
          error: text || 'Invalid non-JSON response from provider'
        };
      }

      const json = JSON.parse(text);
      const data: Record<string, Record<string, { cost: number; count: number }>> = {};
      const entries: GrizzlyPricesV1Entry[] = [];

      for (const countryKey of Object.keys(json)) {
        const countryObj = json[countryKey];
        if (typeof countryObj !== 'object' || countryObj === null) continue;
        data[countryKey] = {};

        for (const serviceKey of Object.keys(countryObj)) {
          const serviceItem = countryObj[serviceKey];
          if (!serviceItem || typeof serviceItem !== 'object') continue;

          const cost = parseFloat(serviceItem.cost) || 0;
          const count = parseInt(serviceItem.count, 10) || 0;

          data[countryKey][serviceKey] = { cost, count };
          entries.push({
            country: countryKey,
            service: serviceKey,
            cost,
            count
          });
        }
      }

      return {
        success: true,
        data,
        entries,
        rawResponse: text
      };
    } catch (err: any) {
      return {
        success: false,
        data: {},
        entries: [],
        rawResponse: '',
        error: err.message || 'Failed to fetch prices'
      };
    }
  }

  /**
   * PHASE 3: getPricesV2 Method
   * Action: action=getPricesV2&service=...&country=...
   * Parses flexible dynamic price tier structures: country -> service -> { [tier]: quantity }
   */
  public static async getPricesV2(params?: {
    service?: string;
    country?: string | number;
    apiKey?: string;
  }): Promise<GrizzlyPricesV2Result> {
    const config = this.resolveConfig();
    const key = params?.apiKey || config.apiKey;

    if (!key) {
      return {
        success: false,
        data: {},
        rawResponse: '',
        error: 'Missing GrizzlySMS API key'
      };
    }

    const url = new URL(config.baseUrl);
    url.searchParams.set('api_key', key);
    url.searchParams.set('action', 'getPricesV2');

    if (params?.service && params.service !== 'all') {
      url.searchParams.set('service', params.service.trim().toLowerCase());
    }
    if (params?.country !== undefined && String(params.country) !== 'any' && String(params.country) !== 'all') {
      url.searchParams.set('country', String(params.country).trim());
    }

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'Accept': 'application/json, text/plain, */*' }
      });
      const text = (await response.text()).trim();

      if (!text.startsWith('{')) {
        return {
          success: false,
          data: {},
          rawResponse: text,
          error: text || 'Invalid non-JSON response from provider'
        };
      }

      const json = JSON.parse(text);
      const data: Record<string, Record<string, Record<string, number>>> = {};

      for (const countryKey of Object.keys(json)) {
        const countryObj = json[countryKey];
        if (typeof countryObj !== 'object' || countryObj === null) continue;
        data[countryKey] = {};

        for (const serviceKey of Object.keys(countryObj)) {
          const serviceObj = countryObj[serviceKey];
          if (!serviceObj || typeof serviceObj !== 'object') continue;
          data[countryKey][serviceKey] = {};

          for (const tierKey of Object.keys(serviceObj)) {
            const qty = parseInt(serviceObj[tierKey], 10) || 0;
            data[countryKey][serviceKey][tierKey] = qty;
          }
        }
      }

      return {
        success: true,
        data,
        rawResponse: text
      };
    } catch (err: any) {
      return {
        success: false,
        data: {},
        rawResponse: '',
        error: err.message || 'Failed to fetch prices v2'
      };
    }
  }

  /**
   * PHASE 4: getPricesV3 Method
   * Action: action=getPricesV3&service=...&country=...
   * Parses advanced provider pricing: country -> service -> { price, count, providers: { [provId]: { count, price: [], provider_id } } }
   */
  public static async getPricesV3(params?: {
    service?: string;
    country?: string | number;
    apiKey?: string;
  }): Promise<GrizzlyPricesV3Result> {
    const config = this.resolveConfig();
    const key = params?.apiKey || config.apiKey;

    if (!key) {
      return {
        success: false,
        data: {},
        rawResponse: '',
        error: 'Missing GrizzlySMS API key'
      };
    }

    const url = new URL(config.baseUrl);
    url.searchParams.set('api_key', key);
    url.searchParams.set('action', 'getPricesV3');

    if (params?.service && params.service !== 'all') {
      url.searchParams.set('service', params.service.trim().toLowerCase());
    }
    if (params?.country !== undefined && String(params.country) !== 'any' && String(params.country) !== 'all') {
      url.searchParams.set('country', String(params.country).trim());
    }

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'Accept': 'application/json, text/plain, */*' }
      });
      const text = (await response.text()).trim();

      if (!text.startsWith('{')) {
        return {
          success: false,
          data: {},
          rawResponse: text,
          error: text || 'Invalid non-JSON response from provider'
        };
      }

      const json = JSON.parse(text);
      const data: Record<string, Record<string, GrizzlyPricesV3ServiceData>> = {};

      for (const countryKey of Object.keys(json)) {
        const countryObj = json[countryKey];
        if (typeof countryObj !== 'object' || countryObj === null) continue;
        data[countryKey] = {};

        for (const serviceKey of Object.keys(countryObj)) {
          const serviceObj = countryObj[serviceKey];
          if (!serviceObj || typeof serviceObj !== 'object') continue;

          const overallPrice = typeof serviceObj.price === 'number' ? serviceObj.price : parseFloat(serviceObj.price) || 0;
          const overallCount = parseInt(serviceObj.count, 10) || 0;
          const providersRaw = serviceObj.providers || {};
          const normalizedProviders: GrizzlyProviderPriceInfo[] = [];

          for (const provKey of Object.keys(providersRaw)) {
            const p = providersRaw[provKey];
            if (!p || typeof p !== 'object') continue;

            const providerId = String(p.provider_id || provKey);
            const count = parseInt(p.count, 10) || 0;
            const priceArr: number[] = Array.isArray(p.price)
              ? p.price.map((val: any) => parseFloat(val) || 0)
              : [parseFloat(p.price) || 0];

            const validPrices = priceArr.filter((val: number) => !isNaN(val) && val > 0);
            const lowestPrice = validPrices.length > 0 ? Math.min(...validPrices) : overallPrice;
            const highestPrice = validPrices.length > 0 ? Math.max(...validPrices) : overallPrice;

            normalizedProviders.push({
              providerId,
              count,
              prices: validPrices.length > 0 ? validPrices : [overallPrice],
              lowestPrice,
              highestPrice
            });
          }

          // Sort providers by lowest available price ascending
          normalizedProviders.sort((a, b) => a.lowestPrice - b.lowestPrice);

          data[countryKey][serviceKey] = {
            price: overallPrice,
            count: overallCount,
            providers: providersRaw,
            normalizedProviders
          };
        }
      }

      return {
        success: true,
        data,
        rawResponse: text
      };
    } catch (err: any) {
      return {
        success: false,
        data: {},
        rawResponse: '',
        error: err.message || 'Failed to fetch prices v3'
      };
    }
  }

  /**
   * PHASE 5: getActiveActivations Method
   * Action: action=getActiveActivations
   * Fetches active remote activations for reconciliation.
   */
  public static async getActiveActivations(apiKey?: string): Promise<GrizzlyActiveActivationsResult> {
    const config = this.resolveConfig();
    const key = apiKey || config.apiKey;

    if (!key) {
      return {
        success: false,
        activations: [],
        rawResponse: '',
        error: 'Missing GrizzlySMS API key'
      };
    }

    const url = new URL(config.baseUrl);
    url.searchParams.set('api_key', key);
    url.searchParams.set('action', 'getActiveActivations');

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'Accept': 'application/json, text/plain, */*' }
      });
      const text = (await response.text()).trim();

      if (!text.startsWith('[')) {
        // If not array, it might be an error string like BAD_KEY or empty
        return {
          success: false,
          activations: [],
          rawResponse: text,
          error: text || 'Invalid non-array response from provider'
        };
      }

      const json = JSON.parse(text);
      if (!Array.isArray(json)) {
        return {
          success: false,
          activations: [],
          rawResponse: text,
          error: 'Expected JSON array of active activations'
        };
      }

      const activations: GrizzlyRemoteActiveActivation[] = json.map((item: any) => ({
        activationCost: typeof item.activationCost === 'number' ? item.activationCost : parseFloat(item.activationCost) || 0,
        activationId: String(item.activationId || ''),
        activationStatus: parseInt(item.activationStatus, 10) || 0,
        activationTime: String(item.activationTime || ''),
        canGetAnotherSms: parseInt(item.canGetAnotherSms, 10) || 0,
        countryCode: String(item.countryCode || ''),
        countryName: String(item.countryName || ''),
        currency: item.currency !== undefined ? item.currency : 643,
        discount: typeof item.discount === 'number' ? item.discount : parseFloat(item.discount) || 0,
        phoneNumber: String(item.phoneNumber || ''),
        repeated: parseInt(item.repeated, 10) || 0,
        serviceCode: String(item.serviceCode || ''),
        smsCode: String(item.smsCode || ''),
        smsText: String(item.smsText || '')
      }));

      return {
        success: true,
        activations,
        rawResponse: text
      };
    } catch (err: any) {
      return {
        success: false,
        activations: [],
        rawResponse: '',
        error: err.message || 'Failed to fetch active activations'
      };
    }
  }
}
