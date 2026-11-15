import crypto from 'crypto';
import { getDatabase } from '../../db/database.js';
import { getSocketIO } from '../../socket/socketManager.js';
import { WalletService } from '../walletService.js';
import { FiveSimConfigService } from './fivesim/FiveSimConfigService.js';
import { FiveSimOrderService } from './fivesim/FiveSimOrderService.js';
import { MarginService, CalculatedPrice } from './MarginService.js';
import { CurrencyService } from './CurrencyService.js';

export interface NumberOrderRecord {
  id: string;
  user_id: string;
  fivesim_order_id: number | null;
  country: string;
  operator: string;
  product: string;
  phone: string | null;
  status: 'PENDING_PURCHASE' | 'PENDING' | 'RECEIVED' | 'CANCELED' | 'TIMEOUT' | 'FINISHED' | 'BANNED';
  cost_price: number;
  sell_price: number;
  profit: number;
  currency: string;
  otp_code: string | null;
  sms_text: string | null;
  expires_at: string | null;
  created_at: string;
  finished_at: string | null;
  refunded: boolean;
  refund_at: string | null;
  wallet_transaction_id: string | null;
  refund_transaction_id: string | null;
  user_email?: string;
  user_name?: string;
}

export interface OperatorRateItem {
  operator: string;
  sell_price: number;
  raw_cost_rub?: number; // Only exposed for admin preview
  count: number;
  rate: number;
  is_available: boolean;
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class NumberPurchaseService {
  private static instance: NumberPurchaseService | null = null;
  private configService: FiveSimConfigService;
  private walletService: WalletService;
  private marginService: MarginService;

  // In-memory caching for catalog requests (30-60s for prices, 15-30m for metadata)
  private countriesCache: CacheEntry<any[]> | null = null;
  private productsCache: Map<string, CacheEntry<any[]>> = new Map();
  private pricesCache: Map<string, CacheEntry<any>> = new Map();

  // Poller timer reference
  private pollerInterval: NodeJS.Timeout | null = null;
  private isPolling = false;

  public static getInstance(): NumberPurchaseService {
    if (!NumberPurchaseService.instance) {
      NumberPurchaseService.instance = new NumberPurchaseService();
    }
    return NumberPurchaseService.instance;
  }

  private constructor() {
    this.configService = FiveSimConfigService.getInstance();
    this.walletService = WalletService.getInstance();
    this.marginService = MarginService.getInstance();
    this.startBackgroundPoller();
  }

  /**
   * Get cached list of supported countries, filtering hidden items
   */
  public async getCountries(): Promise<any[]> {
    const now = Date.now();
    if (this.countriesCache && this.countriesCache.expiresAt > now) {
      return this.filterHiddenCountries(this.countriesCache.data);
    }

    try {
      const client = this.configService.getClient();
      const raw = await client.getGuestCountries();
      const list: any[] = [];

      for (const [slug, data] of Object.entries(raw || {})) {
        const d = data as any;
        const prefix = d?.prefix ? Object.keys(d.prefix)[0] || '' : '';
        list.push({
          slug,
          name: d?.text_en || slug,
          prefix: prefix ? `+${prefix}` : '',
          iso: d?.iso || slug
        });
      }

      // Sort alphabetically
      list.sort((a, b) => a.name.localeCompare(b.name));

      this.countriesCache = {
        data: list,
        expiresAt: now + 20 * 60 * 1000 // 20 minutes TTL
      };

      return this.filterHiddenCountries(list);
    } catch (err: any) {
      if (this.countriesCache) {
        return this.filterHiddenCountries(this.countriesCache.data);
      }
      throw new Error(`Failed to load countries: ${err.message}`);
    }
  }

  /**
   * Get cached list of supported products for a country, filtering hidden items
   */
  public async getProducts(country = 'any'): Promise<any[]> {
    const cSlug = country ? country.trim().toLowerCase() : 'any';
    const now = Date.now();
    const cached = this.productsCache.get(cSlug);
    if (cached && cached.expiresAt > now) {
      return this.filterHiddenProducts(cached.data);
    }

    try {
      const client = this.configService.getClient();
      const raw = await client.getGuestProducts(cSlug, 'any');
      const list: any[] = [];

      for (const [slug, data] of Object.entries(raw || {})) {
        const d = data as any;
        list.push({
          slug,
          name: d?.Name || d?.text_en || slug,
          category: d?.Category || 'general',
          quantity: d?.Quantity || 0,
          price: d?.Price || 0
        });
      }

      // Prioritize popular items
      const popularSlugs = ['whatsapp', 'telegram', 'google', 'openai', 'instagram', 'facebook', 'twitter', 'tiktok', 'amazon', 'tinder'];
      list.sort((a, b) => {
        const aPop = popularSlugs.indexOf(a.slug);
        const bPop = popularSlugs.indexOf(b.slug);
        if (aPop !== -1 && bPop !== -1) return aPop - bPop;
        if (aPop !== -1) return -1;
        if (bPop !== -1) return 1;
        return a.name.localeCompare(b.name);
      });

      this.productsCache.set(cSlug, {
        data: list,
        expiresAt: now + 20 * 60 * 1000 // 20 mins TTL
      });

      return this.filterHiddenProducts(list);
    } catch (err: any) {
      if (cached) {
        return this.filterHiddenProducts(cached.data);
      }
      throw new Error(`Failed to load products: ${err.message}`);
    }
  }

  /**
   * Get operator options with calculated sell prices and stock (cost price is hidden for users)
   */
  public async getPrices(
    country: string,
    product: string,
    isAdmin = false,
    requestedCurrency?: string
  ): Promise<{
    country: string;
    product: string;
    currency: string;
    currency_symbol: string;
    operators: OperatorRateItem[];
    bestOperator: OperatorRateItem | null;
  }> {
    const c = country.trim().toLowerCase();
    const p = product.trim().toLowerCase();
    const cacheKey = `${c}:${p}`;
    const now = Date.now();

    let rawData: any = null;
    const cached = this.pricesCache.get(cacheKey);

    if (cached && cached.expiresAt > now) {
      rawData = cached.data;
    } else {
      try {
        const client = this.configService.getClient();
        rawData = await client.getGuestPrices({ country: c, product: p });
        this.pricesCache.set(cacheKey, {
          data: rawData,
          expiresAt: now + 45 * 1000 // 45 seconds TTL
        });
      } catch (err: any) {
        if (cached) {
          rawData = cached.data;
        } else {
          throw new Error(`Failed to fetch live operator rates: ${err.message}`);
        }
      }
    }

    // In 5SIM response: rawData[country][product] contains operator keys
    const countryData = rawData?.[c] || rawData;
    const productData = countryData?.[p] || countryData;

    const operators: OperatorRateItem[] = [];
    const settings = this.marginService.getPricingSettings();
    const currencyService = CurrencyService.getInstance();
    const chosenCurrency = (requestedCurrency || settings.display_currency || 'INR').toUpperCase();
    const currRecord = currencyService.getCurrency(chosenCurrency) || currencyService.getDefaultCurrency();

    if (productData && typeof productData === 'object') {
      for (const [operatorName, opDetails] of Object.entries(productData)) {
        if (!opDetails || typeof opDetails !== 'object') continue;
        const op = opDetails as any;
        const costRub = Number(op.cost || 0);
        const count = Number(op.count || 0);
        const rate = Number(op.rate || 0);

        // Apply central margin formula with user's selected currency
        const calc: CalculatedPrice = this.marginService.calculateSellPrice(costRub, c, p, operatorName, currRecord.code);

        const item: OperatorRateItem = {
          operator: operatorName,
          sell_price: calc.sellPrice,
          count,
          rate,
          is_available: count > 0
        };

        if (isAdmin) {
          item.raw_cost_rub = costRub;
        }

        operators.push(item);
      }
    }

    // Sort: available operators with stock first, highest success rate, lowest sell price
    operators.sort((a, b) => {
      if (a.is_available && !b.is_available) return -1;
      if (!a.is_available && b.is_available) return 1;
      if (b.rate !== a.rate) return b.rate - a.rate;
      return a.sell_price - b.sell_price;
    });

    const bestOperator = operators.find((o) => o.is_available) || operators[0] || null;

    return {
      country: c,
      product: p,
      currency: currRecord.code,
      currency_symbol: currRecord.symbol,
      operators,
      bestOperator
    };
  }

  /**
   * Executes number purchase flow (Part B2 Specification)
   */
  public async buyNumber(
    userId: string,
    params: {
      country: string;
      operator?: string;
      product: string;
      idempotencyKey?: string;
    }
  ): Promise<{
    success: boolean;
    order: NumberOrderRecord;
    message: string;
  }> {
    const db = getDatabase();
    const c = params.country.trim().toLowerCase();
    const p = params.product.trim().toLowerCase();
    const requestedOp = params.operator ? params.operator.trim().toLowerCase() : 'any';

    // 1. Check if country or product is hidden
    if (this.marginService.isItemHidden('country', c)) {
      throw new Error(`Jurisdiction "${c}" is currently disabled for purchase.`);
    }
    if (this.marginService.isItemHidden('product', p)) {
      throw new Error(`Service "${p}" is currently disabled for purchase.`);
    }

    // 2. Fetch fresh operator rates
    const priceInfo = await this.getPrices(c, p, true);
    if (!priceInfo.operators || priceInfo.operators.length === 0) {
      throw new Error(`No available operators found for ${p} in ${c}.`);
    }

    // Resolve target operator
    let chosenOperator: OperatorRateItem;
    if (requestedOp === 'any') {
      const best = priceInfo.operators.find((o) => o.is_available);
      if (!best) {
        throw new Error(`All virtual lines for ${p} in ${c} are currently out of stock. Please try another country.`);
      }
      chosenOperator = best;
    } else {
      const found = priceInfo.operators.find((o) => o.operator === requestedOp);
      if (!found) {
        throw new Error(`Operator "${requestedOp}" is not available for ${p} in ${c}.`);
      }
      if (!found.is_available) {
        throw new Error(`Operator "${requestedOp}" is currently out of stock (${found.count} available). Please choose another operator.`);
      }
      chosenOperator = found;
    }

    // 3. Determine user's currency from wallet and calculate sell price & cost price
    const wallet = this.walletService.getOrCreateWallet(userId);
    const userCurrency = (wallet.currency || 'INR').toUpperCase();
    const currencyService = CurrencyService.getInstance();
    const currRecord = currencyService.getCurrency(userCurrency) || currencyService.getDefaultCurrency();

    const rawCostRub = chosenOperator.raw_cost_rub || 0;
    const calc = this.marginService.calculateSellPrice(rawCostRub, c, p, chosenOperator.operator, currRecord.code);
    const sellPrice = calc.sellPrice;
    const orderCurrency = currRecord.code;

    // 4. Check user wallet balance in user's active currency
    if (wallet.balance < sellPrice) {
      throw new Error(
        `Insufficient wallet balance. Required: ${currRecord.symbol}${sellPrice.toFixed(2)}, Available: ${currRecord.symbol}${wallet.balance.toFixed(2)}. Please add funds to your wallet to continue.`
      );
    }

    // 5. Create local order record with PENDING_PURCHASE in DB transaction
    const orderId = crypto.randomUUID();
    let deductTxId: string;

    try {
      const deductRes = this.walletService.deduct(
        userId,
        sellPrice,
        'usage_deduction',
        `Virtual Number Purchase: ${p.toUpperCase()} (${c})`,
        { referenceId: orderId, customData: { country: c, product: p, operator: chosenOperator.operator, currency: orderCurrency } }
      );
      deductTxId = deductRes.transactionId;
    } catch (err: any) {
      throw new Error(`Wallet deduction failed: ${err.message}`);
    }

    db.prepare(`
      INSERT INTO number_orders (
        id, user_id, fivesim_order_id, country, operator, product, phone,
        status, cost_price, sell_price, profit, currency, wallet_transaction_id, created_at
      ) VALUES (
        ?, ?, NULL, ?, ?, ?, NULL,
        'PENDING_PURCHASE', ?, ?, ?, ?, ?, datetime('now')
      )
    `).run(
      orderId,
      userId,
      c,
      chosenOperator.operator,
      p,
      calc.costPrice,
      sellPrice,
      calc.profit,
      orderCurrency,
      deductTxId
    );

    // 6. Call 5SIM API to acquire number
    const client = this.configService.getClient();
    let fiveSimOrder: any;

    try {
      // Calculate max price ceiling in 5SIM's currency (RUB)
      // When operator is 'any', maxPrice prevents 5SIM from picking an expensive operator that destroys margin
      const costCeiling = Math.ceil(rawCostRub * 1.05);

      fiveSimOrder = await client.buyActivation({
        country: c,
        operator: chosenOperator.operator,
        product: p,
        maxPrice: requestedOp === 'any' ? costCeiling : undefined
      });
    } catch (err: any) {
      // 7. Auto-Refund on failure (plain-text 'no free phones', 400 bad operator, low 5SIM balance, etc.)
      const errMsg = err.message || '';
      console.warn(`[NumberPurchaseService] 5SIM purchase failed for order ${orderId}: ${errMsg}. Issuing immediate wallet refund.`);

      this.refundOrderInternal(orderId, `5SIM Purchase Failure: ${errMsg}`);

      if (errMsg.toLowerCase().includes('no free phones') || errMsg.toLowerCase().includes('stock')) {
        throw new Error('No virtual numbers are currently free for this operator. Please select another operator or try a different country.');
      }
      if (errMsg.toLowerCase().includes('not enough user balance')) {
        console.error('🚨 [ADMIN ALERT] 5SIM Master Account balance is depleted! Urgent top-up needed.');
        throw new Error('Telecom gateway temporarily undergoing maintenance. Your wallet balance has been fully refunded.');
      }
      throw new Error(`Purchase unsuccessful: ${errMsg}. Your wallet balance has been fully refunded.`);
    }

    // 8. Update local order record with active 5SIM order details
    const actualCostRub = Number(fiveSimOrder.price || rawCostRub);
    const actualCalc = this.marginService.calculateSellPrice(actualCostRub, c, p, chosenOperator.operator, orderCurrency);
    const actualCostConverted = actualCalc.costPrice;
    const finalProfit = Number((sellPrice - actualCostConverted).toFixed(2));

    db.prepare(`
      UPDATE number_orders
      SET fivesim_order_id = ?, phone = ?, operator = ?, cost_price = ?, profit = ?, expires_at = ?, status = 'PENDING'
      WHERE id = ?
    `).run(
      fiveSimOrder.id,
      fiveSimOrder.phone,
      fiveSimOrder.operator || chosenOperator.operator,
      actualCostConverted,
      Math.max(0, finalProfit),
      fiveSimOrder.expires || new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      orderId
    );

    const updated = this.getOrderById(orderId)!;

    // Invalidate prices cache for fresh stock count
    this.pricesCache.delete(`${c}:${p}`);

    // Emit real-time Socket.IO notification to user
    try {
      getSocketIO()?.to(`user:${userId}`).emit('number:order_created', {
        order: updated
      });
    } catch {}

    return {
      success: true,
      order: updated,
      message: `Virtual line ${updated.phone} activated successfully! Waiting for SMS verification code.`
    };
  }

  /**
   * Get single order by ID
   */
  public getOrderById(orderId: string): NumberOrderRecord | null {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT o.*, u.username as user_name, u.email as user_email
      FROM number_orders o
      LEFT JOIN users u ON o.user_id = u.id
      WHERE o.id = ?
    `).get(orderId) as any;

    return row ? this.mapOrderRecord(row) : null;
  }

  /**
   * Check single order status, fetching latest data from 5SIM if still active
   */
  public async getOrderStatus(orderId: string, userId: string): Promise<NumberOrderRecord> {
    const order = this.getOrderById(orderId);
    if (!order) {
      throw new Error('Order not found.');
    }
    if (order.user_id !== userId) {
      throw new Error('Access denied to this order.');
    }

    // If order is still in active state, sync live with 5SIM
    if ((order.status === 'PENDING' || order.status === 'RECEIVED') && order.fivesim_order_id) {
      try {
        await this.syncOrderWith5Sim(order);
        return this.getOrderById(orderId)!;
      } catch (err: any) {
        console.warn(`[NumberPurchaseService] Failed live sync for order ${orderId}: ${err.message}`);
      }
    }

    return order;
  }

  /**
   * User action: Cancel order before SMS is received (with immediate refund)
   */
  public async cancelOrder(orderId: string, userId: string): Promise<{ success: boolean; message: string; order: NumberOrderRecord }> {
    const order = this.getOrderById(orderId);
    if (!order) throw new Error('Order not found.');
    if (order.user_id !== userId) throw new Error('Access denied.');

    if (order.status === 'FINISHED' || order.status === 'CANCELED' || order.status === 'TIMEOUT' || order.status === 'BANNED') {
      throw new Error(`Order is already in ${order.status} state.`);
    }

    // 5SIM rule: Cannot cancel if SMS has already arrived
    if (order.otp_code || order.sms_text) {
      throw new Error('Cannot cancel order after an SMS verification code has been delivered. Please finish the order.');
    }

    if (order.fivesim_order_id) {
      try {
        const client = this.configService.getClient();
        await client.cancelOrder(order.fivesim_order_id);
      } catch (err: any) {
        console.warn(`[NumberPurchaseService] 5SIM cancel call warning for order #${order.fivesim_order_id}: ${err.message}`);
      }
    }

    // Process idempotent refund to user wallet
    this.refundOrderInternal(orderId, `User Cancellation: Virtual Number #${order.phone || orderId}`);

    const updated = this.getOrderById(orderId)!;
    return {
      success: true,
      message: 'Order cancelled successfully. Your wallet balance has been refunded in full.',
      order: updated
    };
  }

  /**
   * User action: Finish order after SMS is received (rating +0.5 points)
   */
  public async finishOrder(orderId: string, userId: string): Promise<{ success: boolean; message: string; order: NumberOrderRecord }> {
    const db = getDatabase();
    const order = this.getOrderById(orderId);
    if (!order) throw new Error('Order not found.');
    if (order.user_id !== userId) throw new Error('Access denied.');

    if (order.status === 'FINISHED') {
      return { success: true, message: 'Order is already finished.', order };
    }

    if (order.fivesim_order_id) {
      try {
        const client = this.configService.getClient();
        await client.finishOrder(order.fivesim_order_id);
      } catch (err: any) {
        console.warn(`[NumberPurchaseService] 5SIM finish call error: ${err.message}`);
      }
    }

    db.prepare(`
      UPDATE number_orders
      SET status = 'FINISHED', finished_at = datetime('now')
      WHERE id = ?
    `).run(orderId);

    const updated = this.getOrderById(orderId)!;
    try {
      getSocketIO()?.to(`user:${userId}`).emit('number:order_updated', { order: updated });
    } catch {}

    return {
      success: true,
      message: 'Order finished successfully. Thank you for using our virtual telecom service!',
      order: updated
    };
  }

  /**
   * User action: Ban / report number as already registered (with refund)
   */
  public async banOrder(orderId: string, userId: string): Promise<{ success: boolean; message: string; order: NumberOrderRecord }> {
    const order = this.getOrderById(orderId);
    if (!order) throw new Error('Order not found.');
    if (order.user_id !== userId) throw new Error('Access denied.');

    if (order.otp_code || order.sms_text) {
      throw new Error('Cannot report or ban number after receiving an SMS verification code.');
    }

    if (order.fivesim_order_id) {
      try {
        const client = this.configService.getClient();
        await client.banOrder(order.fivesim_order_id);
      } catch (err: any) {
        console.warn(`[NumberPurchaseService] 5SIM ban call warning: ${err.message}`);
      }
    }

    this.refundOrderInternal(orderId, `Number Banned/Registered Report: #${order.phone || orderId}`);

    const db = getDatabase();
    db.prepare("UPDATE number_orders SET status = 'BANNED' WHERE id = ?").run(orderId);

    const updated = this.getOrderById(orderId)!;
    return {
      success: true,
      message: 'Number reported as invalid/registered. Full refund has been credited to your wallet.',
      order: updated
    };
  }

  /**
   * Get user order history (never leaks cost_price or profit)
   */
  public getUserOrders(
    userId: string,
    params?: { limit?: number; offset?: number; status?: string }
  ): { orders: Omit<NumberOrderRecord, 'cost_price' | 'profit'>[]; total: number } {
    const db = getDatabase();
    const limit = Math.min(100, Math.max(1, Number(params?.limit || 20)));
    const offset = Math.max(0, Number(params?.offset || 0));

    let query = 'SELECT * FROM number_orders WHERE user_id = ?';
    const queryParams: any[] = [userId];

    if (params?.status) {
      query += ' AND status = ?';
      queryParams.push(params.status);
    }

    const countRow = db.prepare(query.replace('SELECT *', 'SELECT COUNT(*) as cnt')).get(...queryParams) as any;
    const total = countRow?.cnt || 0;

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    queryParams.push(limit, offset);

    const rows = db.prepare(query).all(...queryParams) as any[];
    const safeOrders = rows.map((r) => {
      const full = this.mapOrderRecord(r);
      const { cost_price, profit, ...safe } = full;
      return safe;
    });

    return { orders: safeOrders, total };
  }

  /**
   * Get all orders for Admin console with cost, sell, profit, and user details
   */
  public getAdminOrders(params?: {
    limit?: number;
    offset?: number;
    status?: string;
    country?: string;
    product?: string;
    userId?: string;
  }): { orders: NumberOrderRecord[]; total: number } {
    const db = getDatabase();
    const limit = Math.min(100, Math.max(1, Number(params?.limit || 20)));
    const offset = Math.max(0, Number(params?.offset || 0));

    let query = `
      SELECT o.*, u.username as user_name, u.email as user_email
      FROM number_orders o
      LEFT JOIN users u ON o.user_id = u.id
      WHERE 1=1
    `;
    const queryParams: any[] = [];

    if (params?.status) {
      query += ' AND o.status = ?';
      queryParams.push(params.status);
    }
    if (params?.country) {
      query += ' AND o.country = ?';
      queryParams.push(params.country.toLowerCase());
    }
    if (params?.product) {
      query += ' AND o.product = ?';
      queryParams.push(params.product.toLowerCase());
    }
    if (params?.userId) {
      query += ' AND o.user_id = ?';
      queryParams.push(params.userId);
    }

    const countRow = db.prepare(query.replace('SELECT o.*, u.username as user_name, u.email as user_email', 'SELECT COUNT(*) as cnt')).get(...queryParams) as any;
    const total = countRow?.cnt || 0;

    query += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
    queryParams.push(limit, offset);

    const rows = db.prepare(query).all(...queryParams) as any[];
    return { orders: rows.map((r) => this.mapOrderRecord(r)), total };
  }

  /**
   * Admin Profit & Ledger Analytics Report
   */
  public getProfitReport(period: 'daily' | 'weekly' | 'monthly' = 'daily'): {
    summary: {
      totalRevenue: number;
      totalCost: number;
      netProfit: number;
      ordersCount: number;
      refundCount: number;
      successRatePercent: number;
    };
    breakdown: any[];
    topProducts: any[];
    topCountries: any[];
  } {
    const db = getDatabase();
    const settings = this.marginService.getPricingSettings();

    // Summary query
    const summaryRow = db.prepare(`
      SELECT
        COUNT(*) as total_orders,
        SUM(CASE WHEN status != 'CANCELED' AND status != 'TIMEOUT' THEN sell_price ELSE 0 END) as total_revenue,
        SUM(CASE WHEN status != 'CANCELED' AND status != 'TIMEOUT' THEN cost_price ELSE 0 END) as total_cost,
        SUM(CASE WHEN status != 'CANCELED' AND status != 'TIMEOUT' THEN profit ELSE 0 END) as net_profit,
        SUM(CASE WHEN refunded = 1 THEN 1 ELSE 0 END) as refund_count,
        SUM(CASE WHEN status = 'FINISHED' OR status = 'RECEIVED' THEN 1 ELSE 0 END) as completed_orders
      FROM number_orders
    `).get() as any;

    const totalOrders = Number(summaryRow?.total_orders || 0);
    const totalRevenue = Number(summaryRow?.total_revenue || 0);
    const totalCost = Number(summaryRow?.total_cost || 0);
    const netProfit = Number(summaryRow?.net_profit || 0);
    const refundCount = Number(summaryRow?.refund_count || 0);
    const completedOrders = Number(summaryRow?.completed_orders || 0);
    const successRatePercent = totalOrders > 0 ? Number(((completedOrders / totalOrders) * 100).toFixed(1)) : 100;

    // Top products
    const topProducts = db.prepare(`
      SELECT product, COUNT(*) as orders_count, SUM(profit) as total_profit
      FROM number_orders
      WHERE status != 'CANCELED'
      GROUP BY product
      ORDER BY total_profit DESC
      LIMIT 5
    `).all() as any[];

    // Top countries
    const topCountries = db.prepare(`
      SELECT country, COUNT(*) as orders_count, SUM(profit) as total_profit
      FROM number_orders
      WHERE status != 'CANCELED'
      GROUP BY country
      ORDER BY total_profit DESC
      LIMIT 5
    `).all() as any[];

    // Periodic breakdown
    let dateFormat = "%Y-%m-%d";
    if (period === 'monthly') dateFormat = "%Y-%m";
    else if (period === 'weekly') dateFormat = "%Y-W%W";

    const breakdown = db.prepare(`
      SELECT
        strftime('${dateFormat}', created_at) as date_bucket,
        COUNT(*) as orders_count,
        SUM(sell_price) as revenue,
        SUM(cost_price) as cost,
        SUM(profit) as profit
      FROM number_orders
      WHERE status != 'CANCELED'
      GROUP BY date_bucket
      ORDER BY date_bucket DESC
      LIMIT 14
    `).all() as any[];

    return {
      summary: {
        totalRevenue: Number(totalRevenue.toFixed(2)),
        totalCost: Number(totalCost.toFixed(2)),
        netProfit: Number(netProfit.toFixed(2)),
        ordersCount: totalOrders,
        refundCount,
        successRatePercent
      },
      breakdown,
      topProducts,
      topCountries
    };
  }

  /**
   * Idempotent internal wallet refund handler
   */
  public refundOrderInternal(orderId: string, reason: string): boolean {
    const db = getDatabase();
    const order = this.getOrderById(orderId);
    if (!order) return false;

    if (order.refunded) {
      console.log(`[NumberPurchaseService] Order ${orderId} is already refunded. Skipping duplicate refund.`);
      return true;
    }

    try {
      const refundTxId = crypto.randomUUID();
      this.walletService.refund(
        order.user_id,
        order.sell_price,
        reason,
        order.wallet_transaction_id || undefined
      );

      db.prepare(`
        UPDATE number_orders
        SET refunded = 1, refund_at = datetime('now'), refund_transaction_id = ?, status = CASE WHEN status = 'PENDING' OR status = 'PENDING_PURCHASE' THEN 'CANCELED' ELSE status END
        WHERE id = ?
      `).run(refundTxId, orderId);

      const updated = this.getOrderById(orderId);
      try {
        getSocketIO()?.to(`user:${order.user_id}`).emit('number:order_updated', { order: updated });
      } catch {}

      return true;
    } catch (err: any) {
      console.error(`[NumberPurchaseService] CRITICAL: Failed to issue wallet refund for order ${orderId}: ${err.message}`);
      return false;
    }
  }

  /**
   * Syncs active order with 5SIM gateway
   */
  private async syncOrderWith5Sim(order: NumberOrderRecord): Promise<void> {
    if (!order.fivesim_order_id) return;
    const db = getDatabase();
    const client = this.configService.getClient();

    const remoteOrder = await client.checkOrder(order.fivesim_order_id);
    if (!remoteOrder) return;

    let newStatus = order.status;
    let extractedOtp = order.otp_code;
    let fullSmsText = order.sms_text;

    // Check SMS array
    if (remoteOrder.sms && remoteOrder.sms.length > 0) {
      const latestSms = remoteOrder.sms[remoteOrder.sms.length - 1];
      fullSmsText = latestSms.text || fullSmsText;
      extractedOtp = latestSms.code || FiveSimOrderService.extractOtpFromText(fullSmsText || '') || extractedOtp;
      newStatus = 'RECEIVED';
    }

    // Map remote status
    if (remoteOrder.status === 'FINISHED') newStatus = 'FINISHED';
    else if (remoteOrder.status === 'CANCELED') newStatus = 'CANCELED';
    else if (remoteOrder.status === 'TIMEOUT') newStatus = 'TIMEOUT';
    else if (remoteOrder.status === 'BANNED') newStatus = 'BANNED';

    db.prepare(`
      UPDATE number_orders
      SET status = ?, otp_code = ?, sms_text = ?, phone = COALESCE(?, phone)
      WHERE id = ?
    `).run(newStatus, extractedOtp, fullSmsText, remoteOrder.phone || null, order.id);

    // If order was canceled or timed out remotely without SMS, auto-refund
    if ((newStatus === 'CANCELED' || newStatus === 'TIMEOUT' || newStatus === 'BANNED') && !order.refunded && !extractedOtp) {
      this.refundOrderInternal(order.id, `5SIM Remote Status Reconciled: ${newStatus}`);
    }

    // Emit Socket.IO notification if status or OTP changed
    if (newStatus !== order.status || extractedOtp !== order.otp_code) {
      const updated = this.getOrderById(order.id);
      try {
        if (extractedOtp && !order.otp_code) {
          getSocketIO()?.to(`user:${order.user_id}`).emit('number:sms_received', {
            orderId: order.id,
            phone: order.phone,
            code: extractedOtp,
            smsText: fullSmsText
          });
        }
        getSocketIO()?.to(`user:${order.user_id}`).emit('number:order_updated', { order: updated });
      } catch {}
    }
  }

  /**
   * Background Poller (every 4 seconds) with 14-Minute Auto-Cancellation Shield (Part 6.3 & B4)
   */
  private startBackgroundPoller(): void {
    if (this.pollerInterval) return;

    this.pollerInterval = setInterval(async () => {
      if (this.isPolling) return;
      this.isPolling = true;

      try {
        const db = getDatabase();
        // Fetch active orders requiring SMS check
        const activeRows = db.prepare(`
          SELECT * FROM number_orders
          WHERE status IN ('PENDING', 'RECEIVED') AND fivesim_order_id IS NOT NULL
          ORDER BY created_at ASC
          LIMIT 25
        `).all() as any[];

        const now = Date.now();

        for (const r of activeRows) {
          const order = this.mapOrderRecord(r);

          // 14-Minute Auto-Cancellation Shield:
          // If order is PENDING without SMS and is within 1 minute of expiring (or > 14 minutes old),
          // proactively cancel on 5SIM to avoid the -0.15 rating timeout penalty!
          const createdAtMs = new Date(order.created_at).getTime();
          const ageMs = now - createdAtMs;
          const isNearTimeout = ageMs >= 14 * 60 * 1000 && !order.otp_code && order.status === 'PENDING';

          if (isNearTimeout && order.fivesim_order_id) {
            console.log(`[NumberPurchaseService] 🛡️ 14-Minute Shield triggered for order #${order.fivesim_order_id} (${order.phone}). Canceling before timeout penalty.`);
            try {
              const client = this.configService.getClient();
              await client.cancelOrder(order.fivesim_order_id);
            } catch (err: any) {
              console.warn(`[NumberPurchaseService] Shield cancel error: ${err.message}`);
            }

            this.refundOrderInternal(order.id, '14-Minute Auto-Cancellation Shield (No SMS arrived)');
            db.prepare("UPDATE number_orders SET status = 'CANCELED' WHERE id = ?").run(order.id);
            continue;
          }

          // Otherwise, sync with 5SIM
          await this.syncOrderWith5Sim(order);
        }
      } catch (err: any) {
        // Suppress poller loop errors
      } finally {
        this.isPolling = false;
      }
    }, 4000);

    if (this.pollerInterval?.unref) {
      this.pollerInterval.unref();
    }
  }

  private filterHiddenCountries(list: any[]): any[] {
    return list.filter((c) => !this.marginService.isItemHidden('country', c.slug));
  }

  private filterHiddenProducts(list: any[]): any[] {
    return list.filter((p) => !this.marginService.isItemHidden('product', p.slug));
  }

  private mapOrderRecord(r: any): NumberOrderRecord {
    return {
      id: r.id,
      user_id: r.user_id,
      fivesim_order_id: r.fivesim_order_id ? Number(r.fivesim_order_id) : null,
      country: r.country,
      operator: r.operator,
      product: r.product,
      phone: r.phone || null,
      status: r.status,
      cost_price: Number(r.cost_price || 0),
      sell_price: Number(r.sell_price || 0),
      profit: Number(r.profit || 0),
      currency: r.currency || 'INR',
      otp_code: r.otp_code || null,
      sms_text: r.sms_text || null,
      expires_at: r.expires_at || null,
      created_at: r.created_at,
      finished_at: r.finished_at || null,
      refunded: r.refunded === 1 || r.refunded === true,
      refund_at: r.refund_at || null,
      wallet_transaction_id: r.wallet_transaction_id || null,
      refund_transaction_id: r.refund_transaction_id || null,
      user_email: r.user_email || undefined,
      user_name: r.user_name || undefined
    };
  }
}
