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
}
