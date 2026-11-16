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
  provider_cost_raw: number;
  provider_cost_usd: number;
  margin_applied: number;
  margin_rule_id: string | null;
  final_price_usd: number;
  user_currency: string;
  final_price_user_currency: number;
  exchange_rate_at_purchase: number;
  cost_price: number;
  sell_price: number;
  profit: number;
  currency: string;
  otp_code: string | null;
  sms_text: string | null;
  sms_history: Array<{ sender?: string; date?: string; text?: string; code?: string }>;
  expires_at: string | null;
  created_at: string;
  finished_at: string | null;
  refunded: boolean;
  refund_at: string | null;
  wallet_transaction_id: string | null;
  refund_transaction_id: string | null;
  reservation_id: string | null;
  locked_price_usd: number;
  user_email?: string;
  user_name?: string;
}

export interface OperatorRateItem {
  operator: string;
  sell_price: number;
  final_price_usd: number;
  raw_cost: number;
  cost_usd: number;
  count: number;
  rate: number;
  is_available: boolean;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

export class NumberPurchaseService {
  private static instance: NumberPurchaseService | null = null;
  private configService: FiveSimConfigService;
  private walletService: WalletService;
  private marginService: MarginService;
  private currencyService: CurrencyService;

  // Server-side cache with short TTL (45s for prices, 15m for countries) & stale-while-revalidate
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
    this.currencyService = CurrencyService.getInstance();

    // Register cache invalidation hook on margin or settings update
    this.marginService.registerCacheInvalidation(() => this.clearPricesCache());

    this.startBackgroundPoller();
  }

  public clearPricesCache(): void {
    this.pricesCache.clear();
  }

  /**
   * Admin "Sync now" trigger: invalidates all caches and pre-fetches fresh countries
   */
  public async syncCatalogNow(): Promise<{ countriesCount: number; clearedCaches: number }> {
    const cleared = this.pricesCache.size + this.productsCache.size + (this.countriesCache ? 1 : 0);
    this.pricesCache.clear();
    this.productsCache.clear();
    this.countriesCache = null;

    const countries = await this.getCountries(true);
    return { countriesCount: countries.length, clearedCaches: cleared };
  }

  /**
   * Get cached list of supported countries dynamically from guest endpoint
   */
  public async getCountries(forceRefresh: boolean = false): Promise<any[]> {
    const now = Date.now();
    if (!forceRefresh && this.countriesCache && this.countriesCache.expiresAt > now) {
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

      list.sort((a, b) => a.name.localeCompare(b.name));

      this.countriesCache = {
        data: list,
        timestamp: now,
        expiresAt: now + 15 * 60 * 1000 // 15 mins TTL
      };

      return this.filterHiddenCountries(list);
    } catch (err: any) {
      if (this.countriesCache?.data) {
        return this.filterHiddenCountries(this.countriesCache.data);
      }
      throw new Error(`Failed to load countries from 5SIM: ${err.message}`);
    }
  }

  /**
   * Get products list for a given country and operator
   */
  public async getProducts(country = 'any', operator = 'any'): Promise<any[]> {
    const c = country.trim().toLowerCase();
    const op = operator.trim().toLowerCase();
    const cacheKey = `${c}:${op}`;
    const now = Date.now();

    const cached = this.productsCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return this.filterHiddenProducts(cached.data);
    }

    try {
      const client = this.configService.getClient();
      const raw = await client.getGuestProducts(c, op);
      const list: any[] = [];

      for (const [slug, data] of Object.entries(raw || {})) {
        const d = data as any;
        const price = Number(d?.Price || d?.cost || 0);
        const qty = Number(d?.Qty || d?.count || 0);
        list.push({
          slug,
          name: slug,
          category: d?.Category || 'activation',
          qty,
          price
        });
      }

      list.sort((a, b) => b.qty - a.qty);

      this.productsCache.set(cacheKey, {
        data: list,
        timestamp: now,
        expiresAt: now + 10 * 60 * 1000 // 10 mins TTL
      });

      return this.filterHiddenProducts(list);
    } catch (err: any) {
      if (cached?.data) {
        return this.filterHiddenProducts(cached.data);
      }
      throw new Error(`Failed to load services for ${c}: ${err.message}`);
    }
  }

  /**
   * Get exact operator prices with server-side caching (30-60s TTL, stale-while-revalidate)
   */
  public async getPrices(
    country: string,
    product: string,
    isAdmin: boolean = false,
    requestedCurrency?: string
  ): Promise<{
    country: string;
    product: string;
    currency: string;
    currency_symbol: string;
    exchange_rate: number;
    is_stale: boolean;
    last_updated_at: string;
    operators: OperatorRateItem[];
    bestOperator: OperatorRateItem | null;
  }> {
    const c = country.trim().toLowerCase();
    const p = product.trim().toLowerCase();
    const cacheKey = `${c}:${p}`;
    const now = Date.now();

    const cached = this.pricesCache.get(cacheKey);
    let rawData: any = null;
    let isStale = false;
    let lastUpdatedAt = new Date().toISOString();

    if (cached && cached.expiresAt > now) {
      rawData = cached.data;
      lastUpdatedAt = new Date(cached.timestamp).toISOString();
    } else {
      try {
        const client = this.configService.getClient();
        rawData = await client.getGuestPrices({ country: c, product: p });
        this.pricesCache.set(cacheKey, {
          data: rawData,
          timestamp: now,
          expiresAt: now + 45 * 1000 // 45 seconds TTL
        });
        lastUpdatedAt = new Date(now).toISOString();
      } catch (err: any) {
        if (cached) {
          rawData = cached.data;
          isStale = true;
          lastUpdatedAt = new Date(cached.timestamp).toISOString();
          console.warn(`[NumberPurchaseService] Serving stale prices for ${cacheKey} due to provider error: ${err.message}`);
        } else {
          throw new Error(`Failed to fetch live operator rates: ${err.message}`);
        }
      }
    }

    const countryData = rawData?.[c] || rawData;
    const productData = countryData?.[p] || countryData;

    const operators: OperatorRateItem[] = [];
    const settings = this.marginService.getPricingSettings();
    const chosenCurrency = (requestedCurrency || settings.display_currency || 'USD').toUpperCase();
    const currRecord = this.currencyService.getCurrency(chosenCurrency) || this.currencyService.getDefaultCurrency();

    if (productData && typeof productData === 'object') {
      for (const [operatorName, opDetails] of Object.entries(productData)) {
        if (!opDetails || typeof opDetails !== 'object') continue;
        const op = opDetails as any;
        const rawCost = Number(op.cost || op.Price || 0);
        const count = Number(op.count || op.Qty || 0);
        const rate = Number(op.rate || 0);

        // Apply central margin formula with sovereign USD base and user currency
        const calc: CalculatedPrice = this.marginService.calculateSellPrice(rawCost, c, p, operatorName, currRecord.code);

        operators.push({
          operator: operatorName,
          sell_price: calc.sellPrice,
          final_price_usd: calc.finalPriceUsd,
          raw_cost: rawCost,
          cost_usd: calc.providerCostUsd,
          count,
          rate,
          is_available: count > 0
        });
      }
    }

    // Sort: Available (count > 0) first, then delivery success rate descending, then price ascending
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
      exchange_rate: currRecord.rate_from_usd,
      is_stale: isStale,
      last_updated_at: lastUpdatedAt,
      operators,
      bestOperator
    };
  }

  /**
   * Executes number purchase flow with server balance reservation and idempotency (STEP 2)
   */
  public async buyNumber(
    userId: string,
    params: {
      country: string;
      operator?: string;
      product: string;
      idempotencyKey?: string;
      clientExpectedPrice?: number;
      clientExpectedPriceUsd?: number;
      confirmedPriceShift?: boolean;
    }
  ): Promise<{
    success: boolean;
    requiresConfirmation?: boolean;
    order?: NumberOrderRecord;
    message: string;
    currentPrice?: number;
    expectedPrice?: number;
    currency?: string;
  }> {
    const db = getDatabase();
    const c = params.country.trim().toLowerCase();
    const p = params.product.trim().toLowerCase();
    const requestedOp = params.operator ? params.operator.trim().toLowerCase() : 'any';

    // 1. Check if jurisdiction or product is hidden
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

    // 3. Determine user's active wallet currency & calculate price strictly on server
    const wallet = this.walletService.getOrCreateWallet(userId);
    const userCurrency = (wallet.currency || 'USD').toUpperCase();
    const currRecord = this.currencyService.getCurrency(userCurrency) || this.currencyService.getDefaultCurrency();

    const rawCost = chosenOperator.raw_cost;
    const calc = this.marginService.calculateSellPrice(rawCost, c, p, chosenOperator.operator, currRecord.code);
    const sellPriceInUserCurrency = calc.sellPrice;
    const finalPriceUsd = calc.finalPriceUsd;

    // Price change safety check: if client passed an expected price that changed by > 1% and hasn't confirmed
    if (
      params.clientExpectedPrice &&
      !params.confirmedPriceShift &&
      Math.abs(sellPriceInUserCurrency - params.clientExpectedPrice) / params.clientExpectedPrice > 0.01
    ) {
      return {
        success: false,
        requiresConfirmation: true,
        currentPrice: sellPriceInUserCurrency,
        expectedPrice: params.clientExpectedPrice,
        currency: currRecord.code,
        message: `Price has changed from ${currRecord.symbol}${params.clientExpectedPrice.toFixed(2)} to ${currRecord.symbol}${sellPriceInUserCurrency.toFixed(2)}. Please confirm to proceed.`
      };
    }

    // 4. Check user balance in active wallet currency
    const availableBalance = Number((wallet.balance - wallet.reserved_balance).toFixed(2));
    if (availableBalance < sellPriceInUserCurrency) {
      throw new Error(
        `Insufficient available wallet balance. Required: ${currRecord.symbol}${sellPriceInUserCurrency.toFixed(2)}, Available: ${currRecord.symbol}${availableBalance.toFixed(2)}. Please top up your wallet to continue.`
      );
    }

    // 5. Reserve balance in DB transaction with row lock before calling outbound 5SIM API
    const orderId = crypto.randomUUID();
    let reservationId: string;

    try {
      const reserveResult = this.walletService.reserveFunds(
        userId,
        sellPriceInUserCurrency,
        `Virtual Number Reservation: ${p.toUpperCase()} (${c})`,
        orderId,
        {
          currency: currRecord.code,
          country: c,
          product: p,
          operator: chosenOperator.operator,
          finalPriceUsd
        }
      );
      reservationId = reserveResult.reservationId;
    } catch (err: any) {
      throw new Error(`Wallet reservation failed: ${err.message}`);
    }

    // Record initial order state as PENDING_PURCHASE
    db.prepare(`
      INSERT INTO number_orders (
        id, user_id, fivesim_order_id, country, operator, product, phone,
        status, provider_cost_raw, provider_cost_usd, margin_applied, margin_rule_id,
        final_price_usd, user_currency, final_price_user_currency, exchange_rate_at_purchase,
        cost_price, sell_price, profit, currency, wallet_transaction_id, reservation_id,
        locked_price_usd, created_at
      ) VALUES (
        ?, ?, NULL, ?, ?, ?, NULL,
        'PENDING_PURCHASE', ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, NULL, ?,
        ?, datetime('now')
      )
    `).run(
      orderId,
      userId,
      c,
      chosenOperator.operator,
      p,
      rawCost,
      calc.providerCostUsd,
      calc.marginUsd,
      calc.appliedRule?.id || null,
      finalPriceUsd,
      currRecord.code,
      sellPriceInUserCurrency,
      calc.exchangeRate,
      calc.costPrice,
      sellPriceInUserCurrency,
      calc.profit,
      currRecord.code,
      reservationId,
      finalPriceUsd
    );

    // 6. Outbound API Call to 5SIM gateway
    const client = this.configService.getClient();
    let fiveSimOrder: any;

    try {
      // If operator is 'any', set maxPrice ceiling in provider currency to prevent unexpectedly expensive lines
      const costCeiling = requestedOp === 'any' ? Number((rawCost * 1.05).toFixed(2)) : undefined;

      fiveSimOrder = await client.buyActivation({
        country: c,
        operator: chosenOperator.operator,
        product: p,
        maxPrice: costCeiling
      });
    } catch (err: any) {
      // 7. Auto-Release reservation immediately on outbound failure
      console.warn(`[NumberPurchaseService] 5SIM purchase failed for order ${orderId}: ${err.message}. Releasing reserved funds.`);
      this.walletService.releaseReservation(userId, sellPriceInUserCurrency, reservationId, `Outbound 5SIM Failure: ${err.message}`);

      db.prepare(`
        UPDATE number_orders
        SET status = 'CANCELED', finished_at = datetime('now')
        WHERE id = ?
      `).run(orderId);

      if (err.code === 'NO_FREE_PHONES' || err.message.toLowerCase().includes('no free phones')) {
        throw new Error('No phone numbers are currently available for this operator. Please select another operator or country.');
      }
      if (err.code === 'NOT_ENOUGH_PROVIDER_BALANCE') {
        console.error('🚨 [ADMIN ALERT] 5SIM Master Provider balance is depleted! Urgent deposit required.');
        throw new Error('Telecom gateway temporarily undergoing maintenance. Your reserved funds have been completely released.');
      }
      throw new Error(`Number allocation failed: ${err.message}. Your reserved funds have been completely released.`);
    }

    // 8. Commit reservation upon verified outbound 5SIM response
    let commitTxId: string;
    try {
      const commitRes = this.walletService.commitReservation(
        userId,
        sellPriceInUserCurrency,
        reservationId,
        `Virtual Number Purchase: ${p.toUpperCase()} (${c}) #${fiveSimOrder.phone || fiveSimOrder.id}`,
        {
          orderId,
          fivesimOrderId: fiveSimOrder.id,
          phone: fiveSimOrder.phone,
          country: c,
          product: p,
          operator: fiveSimOrder.operator || chosenOperator.operator
        }
      );
      commitTxId = commitRes.transactionId;
    } catch (commitErr: any) {
      commitTxId = reservationId;
    }

    // Recompute actual cost and profit based on provider price returned
    const actualCostRaw = Number(fiveSimOrder.price || rawCost);
    const actualCalc = this.marginService.calculateSellPrice(actualCostRaw, c, p, chosenOperator.operator, currRecord.code);

    db.prepare(`
      UPDATE number_orders
      SET fivesim_order_id = ?, phone = ?, operator = ?, provider_cost_raw = ?, provider_cost_usd = ?,
          cost_price = ?, profit = ?, expires_at = ?, status = 'PENDING', wallet_transaction_id = ?
      WHERE id = ?
    `).run(
      fiveSimOrder.id,
      fiveSimOrder.phone,
      fiveSimOrder.operator || chosenOperator.operator,
      actualCostRaw,
      actualCalc.providerCostUsd,
      actualCalc.costPrice,
      Math.max(0, Number((sellPriceInUserCurrency - actualCalc.costPrice).toFixed(2))),
      fiveSimOrder.expires || new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      commitTxId,
      orderId
    );

    const updatedOrder = this.getOrderById(orderId)!;

    // Invalidate prices cache for fresh stock count
    this.pricesCache.delete(`${c}:${p}`);

    // Emit real-time Socket.IO notification to user
    try {
      getSocketIO()?.to(`user:${userId}`).emit('number:order_created', { order: updatedOrder });
    } catch {}

    return {
      success: true,
      order: updatedOrder,
      message: `Virtual line ${updatedOrder.phone} activated successfully! Waiting for SMS verification code.`
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
   * Check single order status, fetching latest data from 5SIM if active
   */
  public async getOrderStatus(orderId: string, userId: string): Promise<NumberOrderRecord> {
    const order = this.getOrderById(orderId);
    if (!order) throw new Error('Order not found.');
    if (order.user_id !== userId) throw new Error('Access denied to this order.');

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

    // Auto-refund user balance using the locked price snapshot
    this.refundOrderInternal(orderId, `User Cancellation: Virtual Number #${order.phone || orderId}`);

    const updated = this.getOrderById(orderId)!;
    return {
      success: true,
      message: 'Order cancelled successfully. Your wallet balance has been refunded in full.',
      order: updated
    };
  }

  /**
   * User action: Finish order after SMS is received (rewards provider rating +0.5)
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
   * User action: Ban / report number as already registered
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

    const settings = this.marginService.getPricingSettings();
    const shouldAutoRefund = settings.auto_refund_on_ban === 1 && settings.ban_refund_policy === 'auto';

    if (shouldAutoRefund) {
      this.refundOrderInternal(orderId, `Number Banned/Registered Report: #${order.phone || orderId}`);
    }

    const db = getDatabase();
    db.prepare("UPDATE number_orders SET status = 'BANNED', finished_at = datetime('now') WHERE id = ?").run(orderId);

    const updated = this.getOrderById(orderId)!;
    return {
      success: true,
      message: shouldAutoRefund
        ? 'Number reported as invalid/registered. Full refund has been credited to your wallet.'
        : 'Number reported as invalid/registered. Order marked as BANNED for administrator review.',
      order: updated
    };
  }

  /**
   * Admin manual refund handler
   */
  public async adminRefundOrder(
    orderId: string,
    adminUserId: string,
    reason: string
  ): Promise<{ success: boolean; message: string; order: NumberOrderRecord }> {
    const order = this.getOrderById(orderId);
    if (!order) throw new Error('Order not found.');

    if (order.refunded) {
      throw new Error('This order has already been refunded.');
    }

    const success = this.refundOrderInternal(orderId, `Admin Manual Refund by @${adminUserId}: ${reason}`);
    if (!success) {
      throw new Error('Failed to process wallet refund.');
    }

    const updated = this.getOrderById(orderId)!;
    return {
      success: true,
      message: `Order #${orderId} refunded successfully (${updated.currency} ${updated.final_price_user_currency.toFixed(2)}).`,
      order: updated
    };
  }

  /**
   * Idempotent internal wallet refund handler using locked price snapshot
   */
  public refundOrderInternal(orderId: string, reason: string): boolean {
    const db = getDatabase();
    const order = this.getOrderById(orderId);
    if (!order) return false;

    if (order.refunded) {
      return true;
    }

    try {
      const refundTxId = crypto.randomUUID();
      const refundAmount = order.final_price_user_currency || order.sell_price;

      this.walletService.refund(
        order.user_id,
        refundAmount,
        reason,
        order.wallet_transaction_id || undefined
      );

      db.prepare(`
        UPDATE number_orders
        SET refunded = 1, refund_at = datetime('now'), refund_transaction_id = ?,
            status = CASE WHEN status = 'PENDING' OR status = 'PENDING_PURCHASE' THEN 'CANCELED' ELSE status END
        WHERE id = ?
      `).run(refundTxId, orderId);

      const updated = this.getOrderById(orderId);
      try {
        getSocketIO()?.to(`user:${order.user_id}`).emit('number:order_updated', { order: updated });
      } catch {}

      return true;
    } catch (err: any) {
      console.error(`[NumberPurchaseService] Failed to issue wallet refund for order ${orderId}: ${err.message}`);
      return false;
    }
  }

  /**
   * Sync active order with 5SIM gateway
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
    const smsHistory = Array.isArray(remoteOrder.sms) ? remoteOrder.sms : order.sms_history || [];

    // Check SMS array
    if (smsHistory.length > 0) {
      const latestSms = smsHistory[smsHistory.length - 1];
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
      SET status = ?, otp_code = ?, sms_text = ?, sms_history = ?, phone = COALESCE(?, phone)
      WHERE id = ?
    `).run(
      newStatus,
      extractedOtp,
      fullSmsText,
      JSON.stringify(smsHistory),
      remoteOrder.phone || null,
      order.id
    );

    // If order was canceled or timed out remotely without SMS, auto-refund
    if ((newStatus === 'CANCELED' || newStatus === 'TIMEOUT') && !order.refunded && !extractedOtp) {
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
            smsText: fullSmsText,
            smsHistory
          });
        }
        getSocketIO()?.to(`user:${order.user_id}`).emit('number:order_updated', { order: updated });
      } catch {}
    }
  }

  /**
   * Background Poller: runs every 3.5s with 14-Minute Auto-Cancellation Shield (STEP 2)
   */
  private startBackgroundPoller(): void {
    if (this.pollerInterval) return;

    this.pollerInterval = setInterval(async () => {
      if (this.isPolling) return;
      this.isPolling = true;

      try {
        const db = getDatabase();
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
          // If order is PENDING without SMS and > 14 minutes old (within 1 min of 15m timeout),
          // cancel proactively to protect account rating from -0.15 timeout penalty!
          const createdAtMs = new Date(order.created_at).getTime();
          const ageMs = now - createdAtMs;
          const isNearTimeout = ageMs >= 14 * 60 * 1000 && !order.otp_code && order.status === 'PENDING';

          if (isNearTimeout && order.fivesim_order_id) {
            console.log(`[NumberPurchaseService] 🛡️ 14-Minute Shield triggered for order #${order.fivesim_order_id} (${order.phone}). Cancelling before provider timeout penalty.`);
            try {
              const client = this.configService.getClient();
              await client.cancelOrder(order.fivesim_order_id);
            } catch (err: any) {
              console.warn(`[NumberPurchaseService] Shield cancel error: ${err.message}`);
            }

            this.refundOrderInternal(order.id, '14-Minute Auto-Cancellation Shield (No SMS arrived)');
            db.prepare("UPDATE number_orders SET status = 'CANCELED', finished_at = datetime('now') WHERE id = ?").run(order.id);
            continue;
          }

          await this.syncOrderWith5Sim(order);
        }
      } catch {
        // Suppress poller loop errors
      } finally {
        this.isPolling = false;
      }
    }, 3500);

    if (this.pollerInterval?.unref) {
      this.pollerInterval.unref();
    }
  }

  /**
   * User order history (safe view without leaking provider cost or margin)
   */
  public getUserOrders(
    userId: string,
    params?: { limit?: number; offset?: number; status?: string }
  ): { orders: Omit<NumberOrderRecord, 'provider_cost_raw' | 'provider_cost_usd' | 'margin_applied' | 'cost_price' | 'profit'>[]; total: number } {
    const db = getDatabase();
    const limit = Math.min(100, Math.max(1, Number(params?.limit || 20)));
    const offset = Math.max(0, Number(params?.offset || 0));

    let query = 'SELECT * FROM number_orders WHERE user_id = ?';
    const queryParams: any[] = [userId];

    if (params?.status && params.status !== 'all') {
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
      const { provider_cost_raw, provider_cost_usd, margin_applied, cost_price, profit, ...safe } = full;
      return safe;
    });

    return { orders: safeOrders, total };
  }

  /**
   * Admin orders list with complete financial details & margin breakdown
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

    if (params?.status && params.status !== 'all') {
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

    const topProducts = db.prepare(`
      SELECT product, COUNT(*) as orders_count, SUM(profit) as total_profit
      FROM number_orders
      WHERE status != 'CANCELED'
      GROUP BY product
      ORDER BY total_profit DESC
      LIMIT 5
    `).all() as any[];

    const topCountries = db.prepare(`
      SELECT country, COUNT(*) as orders_count, SUM(profit) as total_profit
      FROM number_orders
      WHERE status != 'CANCELED'
      GROUP BY country
      ORDER BY total_profit DESC
      LIMIT 5
    `).all() as any[];

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

  private filterHiddenCountries(list: any[]): any[] {
    return list.filter((c) => !this.marginService.isItemHidden('country', c.slug));
  }

  private filterHiddenProducts(list: any[]): any[] {
    return list.filter((p) => !this.marginService.isItemHidden('product', p.slug));
  }

  private mapOrderRecord(r: any): NumberOrderRecord {
    let smsHistory: any[] = [];
    try {
      if (r.sms_history) smsHistory = JSON.parse(r.sms_history);
    } catch {}

    const finalPriceUsd = Number(r.final_price_usd ?? r.locked_price_usd ?? 0);
    const finalPriceUserCurrency = Number(r.final_price_user_currency ?? r.sell_price ?? 0);

    return {
      id: r.id,
      user_id: r.user_id,
      fivesim_order_id: r.fivesim_order_id ? Number(r.fivesim_order_id) : null,
      country: r.country,
      operator: r.operator,
      product: r.product,
      phone: r.phone || null,
      status: r.status,
      provider_cost_raw: Number(r.provider_cost_raw || 0),
      provider_cost_usd: Number(r.provider_cost_usd || 0),
      margin_applied: Number(r.margin_applied || 0),
      margin_rule_id: r.margin_rule_id || null,
      final_price_usd: finalPriceUsd,
      user_currency: r.user_currency || r.currency || 'USD',
      final_price_user_currency: finalPriceUserCurrency,
      exchange_rate_at_purchase: Number(r.exchange_rate_at_purchase || 1.0),
      cost_price: Number(r.cost_price || 0),
      sell_price: finalPriceUserCurrency,
      profit: Number(r.profit || 0),
      currency: r.currency || 'USD',
      otp_code: r.otp_code || null,
      sms_text: r.sms_text || null,
      sms_history: smsHistory,
      expires_at: r.expires_at || null,
      created_at: r.created_at,
      finished_at: r.finished_at || null,
      refunded: r.refunded === 1 || r.refunded === true,
      refund_at: r.refund_at || null,
      wallet_transaction_id: r.wallet_transaction_id || null,
      refund_transaction_id: r.refund_transaction_id || null,
      reservation_id: r.reservation_id || null,
      locked_price_usd: finalPriceUsd,
      user_email: r.user_email || undefined,
      user_name: r.user_name || undefined
    };
  }
}
