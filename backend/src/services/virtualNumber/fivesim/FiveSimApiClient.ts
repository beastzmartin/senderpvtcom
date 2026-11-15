import {
  FiveSimProfile,
  FiveSimOrdersResponse,
  FiveSimPaymentsResponse,
  FiveSimMaxPriceItem
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
}

