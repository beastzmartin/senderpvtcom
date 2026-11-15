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
  private readonly minIntervalMs = 20; // Throttling safeguard (~50 req/sec max to stay safely under 100 limit)

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
   * Internal rate-limited request helper with retries for transient 429/503 errors
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
    const { method = 'GET', params, body, isGuest = false, retries = 2 } = options;

    if (!isGuest && !this.apiKey) {
      throw new Error('5SIM API key is not configured. Please set your token in settings or FIVESIM_API_KEY.');
    }

    // Rate limiter throttle to prevent hitting 100 req/sec ceiling
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minIntervalMs) {
      await new Promise((resolve) => setTimeout(resolve, this.minIntervalMs - elapsed));
    }
    this.lastRequestTime = Date.now();

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
      const responseText = await response.text();

      // Handle transient rate limits with backoff
      if ((status === 429 || status === 503) && retries > 0) {
        console.warn(`[5SIM API] Rate limit hit (HTTP ${status}). Backing off for 1000ms...`);
        await new Promise((r) => setTimeout(r, 1000));
        return this.request<T>(endpoint, { ...options, retries: retries - 1 });
      }

      if (status === 401) {
        throw new Error('5SIM API Unauthorized (401): Invalid or expired API token.');
      }

      if (status === 429) {
        throw new Error('5SIM API Rate limit exceeded (429): Maximum 100 requests/second per API key.');
      }

      if (status === 503) {
        throw new Error('5SIM API Service Unavailable (503): Maximum 100 requests/second per IP.');
      }

      if (!response.ok) {
        let errMsg = responseText || `HTTP ${status}`;
        try {
          const parsed = JSON.parse(responseText);
          errMsg = parsed.message || parsed.error || responseText;
        } catch {}
        throw new Error(`5SIM API Error (${status}): ${errMsg}`);
      }

      // Check for plain-text response that might not be valid JSON
      if (!responseText || responseText.trim() === '') {
        return {} as T;
      }

      try {
        return JSON.parse(responseText) as T;
      } catch {
        return responseText as unknown as T;
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
  // PART 2: USER ENDPOINTS (Profile, Orders, Payments)
  // =========================================================================

  /**
   * 2.1 Balance / Profile
   * GET https://5sim.net/v1/user/profile
   */
  public async getProfile(): Promise<FiveSimProfile> {
    return this.request<FiveSimProfile>('/user/profile', { method: 'GET' });
  }

  /**
   * 2.2 Order History
   * GET https://5sim.net/v1/user/orders?category=$category
   */
  public async getOrders(params: {
    category: 'activation' | 'hosting';
    limit?: number;
    offset?: number;
    order?: string;
    reverse?: boolean;
  }): Promise<FiveSimOrdersResponse> {
    if (!params.category) {
      throw new Error('Category parameter is required ("activation" or "hosting").');
    }
    return this.request<FiveSimOrdersResponse>('/user/orders', {
      method: 'GET',
      params: {
        category: params.category,
        limit: params.limit,
        offset: params.offset,
        order: params.order,
        reverse: params.reverse !== undefined ? String(params.reverse) : undefined
      }
    });
  }

  /**
   * 2.3 Payments History
   * GET https://5sim.net/v1/user/payments
   */
  public async getPayments(params?: {
    limit?: number;
    offset?: number;
    order?: string;
    reverse?: boolean;
  }): Promise<FiveSimPaymentsResponse> {
    return this.request<FiveSimPaymentsResponse>('/user/payments', {
      method: 'GET',
      params: params
        ? {
            limit: params.limit,
            offset: params.offset,
            order: params.order,
            reverse: params.reverse !== undefined ? String(params.reverse) : undefined
          }
        : undefined
    });
  }

  // =========================================================================
  // PART 3: PRICE LIMITS (Max Prices)
  // =========================================================================

  /**
   * 3.1 List of Price Limits
   * GET https://5sim.net/v1/user/max-prices
   */
  public async getMaxPrices(): Promise<FiveSimMaxPriceItem[]> {
    const res = await this.request<FiveSimMaxPriceItem[] | any>('/user/max-prices', { method: 'GET' });
    if (Array.isArray(res)) {
      return res;
    }
    return [];
  }

  /**
   * 3.2 Create or Update Price Limit
   * POST https://5sim.net/v1/user/max-prices?product_name=$product&price=$price
   */
  public async setMaxPrice(productName: string, price: number): Promise<{ success: boolean; data?: any }> {
    if (!productName || !productName.trim()) {
      throw new Error('product_name is required to set max price limit.');
    }
    if (typeof price !== 'number' || price <= 0) {
      throw new Error('price must be a positive number.');
    }

    const cleanProduct = productName.trim().toLowerCase();

    // 5SIM documentation specifies product_name and price as query params
    const res = await this.request<any>('/user/max-prices', {
      method: 'POST',
      params: {
        product_name: cleanProduct,
        price
      }
    });

    return { success: true, data: res };
  }

  /**
   * 3.3 Delete Price Limit
   * DELETE https://5sim.net/v1/user/max-prices?product_name=$product
   */
  public async deleteMaxPrice(productName: string): Promise<{ success: boolean; data?: any }> {
    if (!productName || !productName.trim()) {
      throw new Error('product_name is required to delete price limit.');
    }

    const cleanProduct = productName.trim().toLowerCase();

    const res = await this.request<any>('/user/max-prices', {
      method: 'DELETE',
      params: {
        product_name: cleanProduct
      }
    });

    return { success: true, data: res };
  }

  // =========================================================================
  // PART 4: PRODUCTS & PRICES (GUEST ENDPOINTS)
  // =========================================================================

  /**
   * 9.1 / Guest Countries List (Returns countries and available operators)
   * GET https://5sim.net/v1/guest/countries
   */
  public async getGuestCountries(): Promise<FiveSimCountriesResponse> {
    return this.request<FiveSimCountriesResponse>('/guest/countries', {
      method: 'GET',
      isGuest: true
    });
  }

  /**
   * 4.1 Products Request
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
   * 4.2 - 4.5 Prices Request (all, by country, by product, or by both)
   * GET https://5sim.net/v1/guest/prices
   */
  public async getGuestPrices(params?: { country?: string; product?: string }): Promise<any> {
    return this.request<any>('/guest/prices', {
      method: 'GET',
      isGuest: true,
      params: params
        ? {
            country: params.country?.toLowerCase().trim(),
            product: params.product?.toLowerCase().trim()
          }
        : undefined
    });
  }

  // =========================================================================
  // PART 5: PURCHASE (ACTIVATION, HOSTING, RE-BUY)
  // =========================================================================

  /**
   * 5.1 Buy Activation Number
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
      if (res.includes('no free phones') || res.includes('NO_FREE_PHONES')) {
        throw new Error('NO_FREE_PHONES: No phone numbers currently available for this service/country.');
      }
      try {
        return JSON.parse(res);
      } catch {
        throw new Error(`5SIM returned unexpected text response: ${res}`);
      }
    }

    return res as FiveSimOrderItem;
  }

  /**
   * 5.2 Buy Hosting Number (Rental)
   * GET https://5sim.net/v1/user/buy/hosting/$country/$operator/$product
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
      if (res.includes('no free phones')) {
        throw new Error('NO_FREE_PHONES: No hosting phone numbers currently available.');
      }
      try {
        return JSON.parse(res);
      } catch {
        throw new Error(`5SIM returned unexpected text: ${res}`);
      }
    }

    return res as FiveSimOrderItem;
  }

  /**
   * 5.3 Re-buy Number (Reuse)
   * GET https://5sim.net/v1/user/reuse/$product/$number
   */
  public async reuseNumber(params: ReuseNumberParams): Promise<FiveSimOrderItem> {
    const cleanProduct = encodeURIComponent(params.product.toLowerCase().trim());
    const cleanNumber = params.number.replace(/\D/g, '');

    const endpoint = `/user/reuse/${cleanProduct}/${cleanNumber}`;

    const res = await this.request<any>(endpoint, {
      method: 'GET'
    });

    if (typeof res === 'string') {
      if (res.includes('no free phones')) {
        throw new Error('NO_FREE_PHONES');
      }
      try {
        return JSON.parse(res);
      } catch {
        throw new Error(`5SIM returned unexpected text: ${res}`);
      }
    }

    return res as FiveSimOrderItem;
  }

  // =========================================================================
  // PART 6: ORDER MANAGEMENT & SMS INBOX
  // =========================================================================

  /**
   * 6.1 Check Order (Poll for SMS)
   * GET https://5sim.net/v1/user/check/$id
   */
  public async checkOrder(id: number | string): Promise<FiveSimOrderItem> {
    return this.request<FiveSimOrderItem>(`/user/check/${id}`, {
      method: 'GET'
    });
  }

  /**
   * 6.2 Finish Order (Mark as Complete)
   * GET https://5sim.net/v1/user/finish/$id
   */
  public async finishOrder(id: number | string): Promise<FiveSimOrderItem> {
    return this.request<FiveSimOrderItem>(`/user/finish/${id}`, {
      method: 'GET'
    });
  }

  /**
   * 6.3 Cancel Order (Before SMS arrives)
   * GET https://5sim.net/v1/user/cancel/$id
   */
  public async cancelOrder(id: number | string): Promise<FiveSimOrderItem> {
    return this.request<FiveSimOrderItem>(`/user/cancel/${id}`, {
      method: 'GET'
    });
  }

  /**
   * 6.4 Ban Order (When number is already used)
   * GET https://5sim.net/v1/user/ban/$id
   */
  public async banOrder(id: number | string): Promise<FiveSimOrderItem> {
    return this.request<FiveSimOrderItem>(`/user/ban/${id}`, {
      method: 'GET'
    });
  }

  /**
   * 6.5 SMS Inbox List (For Hosting / Rented numbers only)
   * GET https://5sim.net/v1/user/sms/inbox/$id
   */
  public async getHostingInbox(id: number | string): Promise<FiveSimHostingInboxResponse> {
    return this.request<FiveSimHostingInboxResponse>(`/user/sms/inbox/${id}`, {
      method: 'GET'
    });
  }

  // =========================================================================
  // PART 7: NOTIFICATIONS & FLASH BROADCASTS
  // =========================================================================

  /**
   * 7.1 Flash Notifications
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
  // PART 8: VENDOR API (PARTNER & RESELLER ENDPOINTS)
  // =========================================================================

  /**
   * 8.1 Vendor Statistics
   * GET https://5sim.net/v1/user/vendor
   */
  public async getVendorStats(): Promise<FiveSimVendorStats> {
    return this.request<FiveSimVendorStats>('/user/vendor', {
      method: 'GET'
    });
  }

  /**
   * 8.2 Wallets Reserve
   * GET https://5sim.net/v1/vendor/wallets
   */
  public async getVendorWallets(): Promise<FiveSimVendorWallets> {
    return this.request<FiveSimVendorWallets>('/vendor/wallets', {
      method: 'GET'
    });
  }

  /**
   * 8.3 Vendor Orders History
   * GET https://5sim.net/v1/vendor/orders?category=$category
   */
  public async getVendorOrders(params: {
    category: 'activation' | 'hosting';
    limit?: number;
    offset?: number;
    order?: string;
    reverse?: boolean;
  }): Promise<FiveSimOrdersResponse> {
    return this.request<FiveSimOrdersResponse>('/vendor/orders', {
      method: 'GET',
      params: {
        category: params.category,
        limit: params.limit,
        offset: params.offset,
        order: params.order,
        reverse: params.reverse !== undefined ? String(params.reverse) : undefined
      }
    });
  }

  /**
   * 8.4 Vendor Payments History
   * GET https://5sim.net/v1/vendor/payments
   */
  public async getVendorPayments(params?: {
    limit?: number;
    offset?: number;
    order?: string;
    reverse?: boolean;
  }): Promise<FiveSimPaymentsResponse> {
    return this.request<FiveSimPaymentsResponse>('/vendor/payments', {
      method: 'GET',
      params: params
        ? {
            limit: params.limit,
            offset: params.offset,
            order: params.order,
            reverse: params.reverse !== undefined ? String(params.reverse) : undefined
          }
        : undefined
    });
  }

  /**
   * 8.5 Create Payouts
   * POST https://5sim.net/v1/vendor/withdraw
   */
  public async requestVendorWithdraw(params: FiveSimVendorWithdrawParams): Promise<{ success: boolean; data?: any }> {
    const res = await this.request<any>('/vendor/withdraw', {
      method: 'POST',
      body: params
    });
    return { success: true, data: res };
  }

  /**
   * 8.6 Vendor Prices — Get List
   * GET https://5sim.net/v1/vendor/prices
   */
  public async getVendorPrices(params?: FiveSimVendorPricesQueryParams): Promise<FiveSimVendorPricesResponse> {
    const queryParams: Record<string, any> = {};
    if (params?.filters && Object.keys(params.filters).length > 0) {
      queryParams._filters = JSON.stringify(params.filters);
    }
    if (params?.sortDir) queryParams._sortDir = params.sortDir;
    if (params?.sortField) queryParams._sortField = params.sortField;
    if (params?.page !== undefined) queryParams._page = params.page;
    if (params?.perPage !== undefined) queryParams._perPage = params.perPage;

    return this.request<FiveSimVendorPricesResponse>('/vendor/prices', {
      method: 'GET',
      params: queryParams
    });
  }

  /**
   * 8.7 Create Vendor Price
   * PUT https://5sim.net/v1/vendor/prices
   */
  public async createVendorPrice(params: CreateVendorPriceParams): Promise<{ success: boolean; data?: any }> {
    const res = await this.request<any>('/vendor/prices', {
      method: 'PUT',
      body: params
    });
    return { success: true, data: res };
  }

  /**
   * 8.8 Change Vendor Price
   * POST https://5sim.net/v1/vendor/prices
   */
  public async updateVendorPrice(params: UpdateVendorPriceParams): Promise<{ success: boolean; data?: any }> {
    const res = await this.request<any>('/vendor/prices', {
      method: 'POST',
      body: params
    });
    return { success: true, data: res };
  }

  /**
   * 8.9 Enable / Disable Vendor Price
   * POST https://5sim.net/v1/vendor/prices/disable
   */
  public async toggleVendorPrice(params: ToggleVendorPriceParams): Promise<{ success: boolean; data?: any }> {
    const res = await this.request<any>('/vendor/prices/disable', {
      method: 'POST',
      body: params
    });
    return { success: true, data: res };
  }
}

