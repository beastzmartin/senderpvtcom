import {
  FiveSimProfile,
  FiveSimOrdersResponse,
  FiveSimPaymentsResponse,
  FiveSimMaxPriceItem,
  FiveSimProductsMap,
  FiveSimCountriesResponse,
  FiveSimOrderItem,
  BuyActivationParams,
  BuyHostingParams,
  ReuseNumberParams,
  FiveSimHostingInboxResponse,
  FiveSimFlashNotification,
  FiveSimVendorStats,
  FiveSimVendorWallets,
  FiveSimVendorWithdrawParams,
  FiveSimVendorPricesResponse,
  FiveSimVendorPricesQueryParams,
  CreateVendorPriceParams,
  UpdateVendorPriceParams,
  ToggleVendorPriceParams
} from './types.js';

export interface FiveSimClientOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export class FiveSimApiClient {
  private apiKey: string;
  private baseUrl: string;
  private timeoutMs: number;
  private lastRequestTime = 0;
  private readonly minIntervalMs = 25; // Safe ~40 req/sec ceiling (below 100 req/s limit)

  // Request Queue implementation
  private queue: Array<() => Promise<void>> = [];
  private isProcessingQueue = false;

  // 10-minute rolling window strikes tracker for 429 / 503 (5 hits in 10 mins = 10 min ban)
  private rateLimitStrikes: number[] = [];

  private static instance: FiveSimApiClient | null = null;
  public static getInstance(): FiveSimApiClient {
    if (!FiveSimApiClient.instance) {
      FiveSimApiClient.instance = new FiveSimApiClient();
    }
    return FiveSimApiClient.instance;
  }

  constructor(options: FiveSimClientOptions = {}) {
    this.apiKey = options.apiKey || process.env.FIVESIM_API_KEY || '';
    this.baseUrl = (options.baseUrl || process.env.FIVESIM_BASE_URL || 'https://5sim.net/v1').replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs || 25000;
  }

  public setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  public setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/+$/, '');
  }

  public getApiKey(): string {
    return this.apiKey;
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Helper to mask API key in logs
   */
  public static maskKey(key: string): string {
    if (!key) return '(not configured)';
    if (key.length <= 8) return '****';
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
  }

  /**
   * Enqueue a request through the rate-limited serial queue
   */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const res = await task();
          resolve(res);
        } catch (err) {
          reject(err);
        }
      });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        // Enforce interval
        const now = Date.now();
        const elapsed = now - this.lastRequestTime;
        if (elapsed < this.minIntervalMs) {
          await new Promise((r) => setTimeout(r, this.minIntervalMs - elapsed));
        }
        this.lastRequestTime = Date.now();

        try {
          await task();
        } catch {
          // Task errors handled inside individual promise
        }
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Record a rate limit hit in a 10-minute rolling window
   */
  private recordRateLimitStrike(): number {
    const now = Date.now();
    const tenMinutesAgo = now - 10 * 60 * 1000;
    this.rateLimitStrikes = this.rateLimitStrikes.filter((t) => t > tenMinutesAgo);
    this.rateLimitStrikes.push(now);
    return this.rateLimitStrikes.length;
  }

  /**
   * Internal rate-limited request helper with retries for transient 429/503 errors and plain text parsing
   */
  private async request<T>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'DELETE' | 'PUT';
      params?: Record<string, any>;
      body?: any;
      isGuest?: boolean;
      retries?: number;
    } = {}
  ): Promise<T> {
    return this.enqueue(() => this.executeRequest<T>(endpoint, options));
  }

  private async executeRequest<T>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'DELETE' | 'PUT';
      params?: Record<string, any>;
      body?: any;
      isGuest?: boolean;
      retries?: number;
    } = {}
  ): Promise<T> {
    const { method = 'GET', params, body, isGuest = false, retries = 3 } = options;

    if (!isGuest && !this.apiKey) {
      throw new Error('5SIM API key is not configured. Please set your token in settings or FIVESIM_API_KEY.');
    }

    // Check rate limit safety window (avoid triggering the 5-hit 10-minute ban)
    const now = Date.now();
    const recentHits = this.rateLimitStrikes.filter((t) => t > now - 10 * 60 * 1000);
    if (recentHits.length >= 4) {
      console.warn(`[5SIM API] Approaching rate-limit ban limit (4 hits in 10 mins). Self-throttling 5000ms.`);
      await new Promise((r) => setTimeout(r, 5000));
    }

    // Construct URL with query parameters
    let url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    if (params) {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') {
          sp.set(k, String(v));
        }
      }
      const qs = sp.toString();
      if (qs) {
        url += (url.includes('?') ? '&' : '?') + qs;
      }
    }

    const headers: Record<string, string> = {
      Accept: 'application/json'
    };

    if (!isGuest && this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    let requestBody: any = undefined;
    if (body) {
      headers['Content-Type'] = 'application/json';
      requestBody = JSON.stringify(body);
    }

    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: requestBody,
        signal: controller.signal
      });

      clearTimeout(timeoutTimer);

      const status = response.status;
      const rawText = await response.text();

      // Log raw response with masked credentials for diagnostics if needed
      // console.debug(`[5SIM API] ${method} ${endpoint} -> HTTP ${status} (len ${rawText.length})`);

      // Handle 429 and 503 with exponential backoff & strike tracking
      if (status === 429 || status === 503) {
        const strikes = this.recordRateLimitStrike();
        console.warn(`[5SIM API] Rate limit hit HTTP ${status} (${strikes} strikes in 10m). Retries left: ${retries}`);

        if (retries > 0) {
          const backoffDelay = (4 - retries) * 1500 + Math.floor(Math.random() * 500);
          console.warn(`[5SIM API] Backing off for ${backoffDelay}ms before retry...`);
          await new Promise((r) => setTimeout(r, backoffDelay));
          return this.executeRequest<T>(endpoint, { ...options, retries: retries - 1 });
        }

        if (status === 429) {
          throw new Error('5SIM API Rate limit exceeded (429): Maximum 100 requests/second per API key.');
        } else {
          throw new Error('5SIM API Service Unavailable (503): Maximum 100 requests/second per IP.');
        }
      }

      if (status === 401) {
        throw new Error(`5SIM API Unauthorized (401): Invalid or expired API token (Key: ${FiveSimApiClient.maskKey(this.apiKey)}).`);
      }

      // Check for plain-text error keywords in response (can occur on HTTP 200 or 400)
      const lowerText = rawText.trim().toLowerCase();

      if (lowerText === 'no free phones' || lowerText.includes('no free phones') || lowerText === 'no_free_phones') {
        const err = new Error('NO_FREE_PHONES: No phone numbers currently available for this service/country.');
        (err as any).code = 'NO_FREE_PHONES';
        throw err;
      }

      if (lowerText.includes('not enough user balance')) {
        const err = new Error('NOT_ENOUGH_PROVIDER_BALANCE: Master 5SIM provider account balance is depleted.');
        (err as any).code = 'NOT_ENOUGH_PROVIDER_BALANCE';
        throw err;
      }

      if (lowerText.includes('not enough rating')) {
        const err = new Error('NOT_ENOUGH_RATING: 5SIM account rating is too low to order this service.');
        (err as any).code = 'NOT_ENOUGH_RATING';
        throw err;
      }

      if (lowerText.includes('bad country') || lowerText.includes('bad operator') || lowerText.includes('select country') || lowerText.includes('select operator')) {
        const err = new Error(`INVALID_OPERATOR: 5SIM rejected country or operator selection: ${rawText.trim()}`);
        (err as any).code = 'INVALID_OPERATOR';
        throw err;
      }

      if (lowerText.includes('no product')) {
        const err = new Error('NO_PRODUCT: 5SIM does not support the requested product for this country.');
        (err as any).code = 'NO_PRODUCT';
        throw err;
      }

      if (lowerText.includes('server offline')) {
        const err = new Error('SERVER_OFFLINE: 5SIM telecom node is currently offline.');
        (err as any).code = 'SERVER_OFFLINE';
        throw err;
      }

      if (lowerText.includes('order has sms')) {
        const err = new Error('ORDER_HAS_SMS: Cannot cancel order after SMS has already been received.');
        (err as any).code = 'ORDER_HAS_SMS';
        throw err;
      }

      if (lowerText.includes('order expired')) {
        const err = new Error('ORDER_EXPIRED: The virtual number order has expired.');
        (err as any).code = 'ORDER_EXPIRED';
        throw err;
      }

      if (!response.ok) {
        let errMsg = rawText || `HTTP ${status}`;
        try {
          const parsed = JSON.parse(rawText);
          errMsg = parsed.message || parsed.error || rawText;
        } catch {}
        throw new Error(`5SIM API Error (${status}): ${errMsg}`);
      }

      // Check for empty body
      if (!rawText || rawText.trim() === '') {
        return {} as T;
      }

      // Parse JSON
      try {
        return JSON.parse(rawText) as T;
      } catch (parseErr) {
        // If 200 OK returned plain text that didn't match known keywords
        return rawText as unknown as T;
      }
    } catch (err: any) {
      clearTimeout(timeoutTimer);
      if (err.name === 'AbortError') {
        throw new Error(`5SIM API request timed out after ${this.timeoutMs}ms.`);
      }
      throw err;
    }
  }

  // =========================================================================
  // USER ENDPOINTS (Profile, Orders, Payments)
  // =========================================================================

  /**
   * GET https://5sim.net/v1/user/profile
   */
  public async getProfile(): Promise<FiveSimProfile> {
    return this.request<FiveSimProfile>('/user/profile', {
      method: 'GET'
    });
  }

  /**
   * GET https://5sim.net/v1/user/orders?category=$category
   */
  public async getOrders(
    categoryOrParams?: 'activation' | 'hosting' | { category?: 'activation' | 'hosting'; limit?: number; offset?: number; order?: string; reverse?: boolean },
    limit?: number
  ): Promise<FiveSimOrdersResponse> {
    const params: Record<string, any> = {};
    if (typeof categoryOrParams === 'string') {
      params.category = categoryOrParams;
      if (limit) params.limit = limit;
    } else if (categoryOrParams && typeof categoryOrParams === 'object') {
      if (categoryOrParams.category) params.category = categoryOrParams.category;
      if (categoryOrParams.limit) params.limit = categoryOrParams.limit;
      if (categoryOrParams.offset) params.offset = categoryOrParams.offset;
      if (categoryOrParams.order) params.order = categoryOrParams.order;
      if (categoryOrParams.reverse !== undefined) params.reverse = categoryOrParams.reverse;
    }

    return this.request<FiveSimOrdersResponse>('/user/orders', {
      method: 'GET',
      params
    });
  }

  /**
   * GET https://5sim.net/v1/user/payments
   */
  public async getPayments(paramsInput?: { limit?: number; offset?: number; order?: string; reverse?: boolean }): Promise<FiveSimPaymentsResponse> {
    return this.request<FiveSimPaymentsResponse>('/user/payments', {
      method: 'GET',
      params: paramsInput
    });
  }

  /**
   * GET https://5sim.net/v1/user/max-prices
   */
  public async getMaxPrices(): Promise<FiveSimMaxPriceItem[]> {
    return this.request<FiveSimMaxPriceItem[]>('/user/max-prices', {
      method: 'GET'
    });
  }

  /**
   * POST https://5sim.net/v1/user/max-prices?product_name=$product&price=$price
   */
  public async setMaxPrice(product: string, price: number): Promise<any> {
    return this.request<any>('/user/max-prices', {
      method: 'POST',
      params: {
        product_name: product.toLowerCase().trim(),
        price: Number(price.toFixed(2))
      }
    });
  }

  /**
   * DELETE https://5sim.net/v1/user/max-prices?product_name=$product
   */
  public async deleteMaxPrice(product: string): Promise<any> {
    return this.request<any>('/user/max-prices', {
      method: 'DELETE',
      params: {
        product_name: product.toLowerCase().trim()
      }
    });
  }

  // =========================================================================
  // PRODUCTS & PRICES (GUEST ENDPOINTS)
  // =========================================================================

  /**
   * GET https://5sim.net/v1/guest/countries
   */
  public async getGuestCountries(): Promise<FiveSimCountriesResponse> {
    return this.request<FiveSimCountriesResponse>('/guest/countries', {
      method: 'GET',
      isGuest: true
    });
  }

  /**
   * GET https://5sim.net/v1/guest/products/$country/$operator
   */
  public async getGuestProducts(country = 'any', operator = 'any'): Promise<FiveSimProductsMap> {
    const cleanCountry = encodeURIComponent(country.toLowerCase().trim());
    const cleanOperator = encodeURIComponent(operator.toLowerCase().trim());
    return this.request<FiveSimProductsMap>(`/guest/products/${cleanCountry}/${cleanOperator}`, {
      method: 'GET',
      isGuest: true
    });
  }

  /**
   * GET https://5sim.net/v1/guest/prices
   * Supports ?country=X, ?product=Y, or both
   */
  public async getGuestPrices(params?: { country?: string; product?: string }): Promise<any> {
    return this.request<any>('/guest/prices', {
      method: 'GET',
      isGuest: true,
      params: params
        ? {
            country: params.country ? params.country.toLowerCase().trim() : undefined,
            product: params.product ? params.product.toLowerCase().trim() : undefined
          }
        : undefined
    });
  }

  // =========================================================================
  // PURCHASE (ACTIVATION, HOSTING, RE-BUY)
  // =========================================================================

  /**
   * GET https://5sim.net/v1/user/buy/activation/$country/$operator/$product
   */
  public async buyActivation(params: BuyActivationParams): Promise<FiveSimOrderItem> {
    const cleanCountry = encodeURIComponent((params.country || 'any').toLowerCase().trim());
    const cleanOperator = encodeURIComponent((params.operator || 'any').toLowerCase().trim());
    const cleanProduct = encodeURIComponent((params.product || '').toLowerCase().trim());

    if (!cleanProduct) {
      throw new Error('Product name is required to buy activation number.');
    }

    const endpoint = `/user/buy/activation/${cleanCountry}/${cleanOperator}/${cleanProduct}`;
    const queryParams: Record<string, any> = {};

    if (params.forwarding !== undefined) queryParams.forwarding = params.forwarding ? '1' : '0';
    if (params.number) queryParams.number = params.number.replace(/\D/g, '');
    if (params.reuse !== undefined) queryParams.reuse = params.reuse;
    if (params.voice !== undefined) queryParams.voice = params.voice;
    if (params.ref) queryParams.ref = params.ref;
    if (params.maxPrice !== undefined) queryParams.maxPrice = params.maxPrice;

    const res = await this.request<any>(endpoint, {
      method: 'GET',
      params: queryParams
    });

    if (typeof res === 'string') {
      try {
        return JSON.parse(res);
      } catch {
        throw new Error(`5SIM returned text response: ${res}`);
      }
    }

    return res as FiveSimOrderItem;
  }

  /**
   * GET https://5sim.net/v1/user/buy/hosting/$country/$operator/$product
   * (Hosting rental - phase 2)
   */
  public async buyHosting(params: BuyHostingParams): Promise<FiveSimOrderItem> {
    const cleanCountry = encodeURIComponent((params.country || 'any').toLowerCase().trim());
    const cleanOperator = encodeURIComponent((params.operator || 'any').toLowerCase().trim());
    const cleanProduct = encodeURIComponent((params.product || '3hours').toLowerCase().trim());

    const endpoint = `/user/buy/hosting/${cleanCountry}/${cleanOperator}/${cleanProduct}`;

    const res = await this.request<any>(endpoint, {
      method: 'GET'
    });

    if (typeof res === 'string') {
      try {
        return JSON.parse(res);
      } catch {
        throw new Error(`5SIM returned unexpected text: ${res}`);
      }
    }

    return res as FiveSimOrderItem;
  }

  /**
   * GET https://5sim.net/v1/user/reuse/$product/$number
   * (Re-buy / reuse - phase 2)
   */
  public async reuseNumber(params: ReuseNumberParams): Promise<FiveSimOrderItem> {
    const cleanProduct = encodeURIComponent(params.product.toLowerCase().trim());
    const cleanNumber = params.number.replace(/\D/g, '');

    const endpoint = `/user/reuse/${cleanProduct}/${cleanNumber}`;

    const res = await this.request<any>(endpoint, {
      method: 'GET'
    });

    if (typeof res === 'string') {
      try {
        return JSON.parse(res);
      } catch {
        throw new Error(`5SIM returned unexpected text: ${res}`);
      }
    }

    return res as FiveSimOrderItem;
  }

  // =========================================================================
  // ORDER MANAGEMENT & SMS INBOX
  // =========================================================================

  /**
   * GET https://5sim.net/v1/user/check/$id
   */
  public async checkOrder(id: number | string): Promise<FiveSimOrderItem> {
    return this.request<FiveSimOrderItem>(`/user/check/${id}`, {
      method: 'GET'
    });
  }

  /**
   * GET https://5sim.net/v1/user/finish/$id
   */
  public async finishOrder(id: number | string): Promise<FiveSimOrderItem> {
    return this.request<FiveSimOrderItem>(`/user/finish/${id}`, {
      method: 'GET'
    });
  }

  /**
   * GET https://5sim.net/v1/user/cancel/$id
   */
  public async cancelOrder(id: number | string): Promise<FiveSimOrderItem> {
    return this.request<FiveSimOrderItem>(`/user/cancel/${id}`, {
      method: 'GET'
    });
  }

  /**
   * GET https://5sim.net/v1/user/ban/$id
   */
  public async banOrder(id: number | string): Promise<FiveSimOrderItem> {
    return this.request<FiveSimOrderItem>(`/user/ban/${id}`, {
      method: 'GET'
    });
  }

  /**
   * GET https://5sim.net/v1/user/sms/inbox/$id
   */
  public async getHostingInbox(id: number | string): Promise<FiveSimHostingInboxResponse> {
    return this.request<FiveSimHostingInboxResponse>(`/user/sms/inbox/${id}`, {
      method: 'GET'
    });
  }

  /**
   * GET https://5sim.net/v1/guest/flash/$lang
   */
  public async getFlashNotifications(lang = 'en'): Promise<FiveSimFlashNotification> {
    try {
      return await this.request<FiveSimFlashNotification>(`/guest/flash/${encodeURIComponent(lang)}`, {
        method: 'GET',
        isGuest: true
      });
    } catch {
      return { text: '' };
    }
  }

  // =========================================================================
  // VENDOR ENDPOINTS
  // =========================================================================

  public async getVendorStats(): Promise<FiveSimVendorStats> {
    return this.request<FiveSimVendorStats>('/user/vendor', { method: 'GET' });
  }

  public async getVendorWallets(): Promise<FiveSimVendorWallets> {
    return this.request<FiveSimVendorWallets>('/vendor/wallets', { method: 'GET' });
  }

  public async getVendorOrders(
    categoryOrParams?: 'activation' | 'hosting' | { category?: 'activation' | 'hosting'; limit?: number; offset?: number; order?: string; reverse?: boolean }
  ): Promise<FiveSimOrdersResponse> {
    const params: Record<string, any> = {};
    if (typeof categoryOrParams === 'string') {
      params.category = categoryOrParams;
    } else if (categoryOrParams && typeof categoryOrParams === 'object') {
      if (categoryOrParams.category) params.category = categoryOrParams.category;
      if (categoryOrParams.limit) params.limit = categoryOrParams.limit;
      if (categoryOrParams.offset) params.offset = categoryOrParams.offset;
      if (categoryOrParams.order) params.order = categoryOrParams.order;
      if (categoryOrParams.reverse !== undefined) params.reverse = categoryOrParams.reverse;
    }
    return this.request<FiveSimOrdersResponse>('/vendor/orders', { method: 'GET', params });
  }

  public async getVendorPayments(params?: { limit?: number; offset?: number; order?: string; reverse?: boolean }): Promise<FiveSimPaymentsResponse> {
    return this.request<FiveSimPaymentsResponse>('/vendor/payments', { method: 'GET', params });
  }

  public async withdrawVendorFunds(params: FiveSimVendorWithdrawParams): Promise<any> {
    return this.request<any>('/vendor/withdraw', { method: 'POST', body: params });
  }

  public async requestVendorWithdraw(params: FiveSimVendorWithdrawParams): Promise<any> {
    return this.withdrawVendorFunds(params);
  }

  public async getVendorPrices(params?: FiveSimVendorPricesQueryParams): Promise<FiveSimVendorPricesResponse> {
    return this.request<FiveSimVendorPricesResponse>('/vendor/prices', { method: 'GET', params });
  }

  public async updateVendorPrices(params: UpdateVendorPriceParams[] | UpdateVendorPriceParams): Promise<any> {
    const body = Array.isArray(params) ? params : [params];
    return this.request<any>('/vendor/prices', { method: 'PUT', body });
  }

  public async updateVendorPrice(params: UpdateVendorPriceParams): Promise<any> {
    return this.updateVendorPrices(params);
  }

  public async createVendorPrices(params: CreateVendorPriceParams[] | CreateVendorPriceParams): Promise<any> {
    const body = Array.isArray(params) ? params : [params];
    return this.request<any>('/vendor/prices', { method: 'POST', body });
  }

  public async createVendorPrice(params: CreateVendorPriceParams): Promise<any> {
    return this.createVendorPrices(params);
  }

  public async toggleVendorPrices(params: ToggleVendorPriceParams): Promise<any> {
    return this.request<any>('/vendor/prices/disable', { method: 'POST', body: params });
  }

  public async toggleVendorPrice(params: ToggleVendorPriceParams): Promise<any> {
    return this.toggleVendorPrices(params);
  }
}
