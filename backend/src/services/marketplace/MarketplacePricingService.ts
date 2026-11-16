import crypto from 'crypto';
import { ProductDefinition, PricingMode, MarginType, MarketplacePriceQuote } from '../../types/marketplace.js';
import { CurrencyService } from '../virtualNumber/CurrencyService.js';
import { getDatabase } from '../../db/database.js';

export interface PriceEstimateResult {
  requestedItems: number;
  sellPrice: number;
  providerCostUsd: number;
  providerCostConverted: number;
  estimatedProfit: number;
  currency: string;
  isBelowCost: boolean;
  minChargeApplied: boolean;
}

export interface PriceSettlementResult {
  itemsDelivered: number;
  finalCharge: number;
  providerCostUsd: number;
  providerCostConverted: number;
  netProfit: number;
  currency: string;
  refundDue: number; // amount to release from initial reserve
}

export interface PriceTierPreview {
  items: number;
  customerPrice: number;
  providerCost: number;
  netProfit: number;
  marginPct: number;
}

export class MarketplacePricingService {
  private static instance: MarketplacePricingService | null = null;
  private currencyService: CurrencyService;

  private constructor() {
    this.currencyService = CurrencyService.getInstance();
  }

  public static getInstance(): MarketplacePricingService {
    if (!MarketplacePricingService.instance) {
      MarketplacePricingService.instance = new MarketplacePricingService();
    }
    return MarketplacePricingService.instance;
  }

  /**
   * Convert USD provider cost to the current platform currency (e.g. INR)
   */
  public convertUsdToPlatform(amountUsd: number, targetCurrency?: string): number {
    const currency = (targetCurrency || this.currencyService.getDefaultCurrency().code || 'INR').toUpperCase();
    return this.currencyService.convertBetween(amountUsd, 'USD', currency);
  }

  /**
   * Helper to retrieve currency record
   */
  public getCurrencyRecord(code?: string) {
    const target = (code || 'INR').toUpperCase();
    return this.currencyService.getCurrency(target) || this.currencyService.getDefaultCurrency();
  }

  /**
   * Calculate estimated max charge before running an extraction job (used for wallet reservation)
   */
  public calculateEstimatedPrice(
    product: ProductDefinition,
    requestedItems: number,
    targetCurrency?: string
  ): PriceEstimateResult {
    const currency = (targetCurrency || 'INR').toUpperCase();
    const pricing = product.pricing;
    const items = Math.max(1, requestedItems);

    // 1. Calculate base sell price in platform base currency (INR)
    let rawSellPriceBase = 0;
    if (pricing.mode === 'per_item') {
      rawSellPriceBase = (items / 1000) * (pricing.sell.per_1000_items || 0);
    } else if (pricing.mode === 'per_run') {
      rawSellPriceBase = pricing.sell.per_run_flat || 0;
    } else if (pricing.mode === 'per_item_plus_run') {
      rawSellPriceBase = ((items / 1000) * (pricing.sell.per_1000_items || 0)) + (pricing.sell.per_run_flat || 0);
    }

    // Apply minimum charge threshold in base currency
    const minChargeBase = pricing.min_charge || 0;
    const minChargeApplied = rawSellPriceBase < minChargeBase;
    const finalSellPriceBase = Math.max(rawSellPriceBase, minChargeBase);

    // Convert sell price from base (INR) to requested target currency
    const finalSellPrice = Number(
      (currency === 'INR'
        ? finalSellPriceBase
        : this.currencyService.convertBetween(finalSellPriceBase, 'INR', currency)
      ).toFixed(2)
    );

    // 2. Calculate estimated provider cost in USD
    const ref = pricing.provider_cost_reference;
    let providerCostUsd = 0;

    if (ref.model === 'pay_per_event') {
      // PPE Worst-Case Estimator
      const runStart = ref.usd_per_run_start || 0;
      let eventSum = 0;
      if (ref.pricing_per_event?.actorChargeEvents) {
        for (const evt of Object.values(ref.pricing_per_event.actorChargeEvents as Record<string, any>)) {
          const price = Number(evt.eventPriceUsd || evt.eventTieredPricingUsd?.FREE?.tieredEventPriceUsd || 0);
          eventSum += (evt.isPrimaryEvent ? items * price : 1 * price);
        }
      } else if (ref.usd_per_1000_items) {
        eventSum = (items / 1000) * ref.usd_per_1000_items;
      }
      providerCostUsd = runStart + eventSum;
    } else if (ref.model === 'rental') {
      // Rental fixed monthly cost (usage is flat)
      providerCostUsd = 0; // Marginal run cost is zero
    } else if (ref.model === 'free_usage_based') {
      // Platform compute usage cost estimator: (memory/1024) * (expectedDurationSecs/3600) * $0.25/GB-hr
      const memGb = (product.limits?.memory_mb || 1024) / 1024;
      const expectedSecs = Math.min(product.limits?.timeout_secs || 300, 300); // 5 min conservative estimate
      providerCostUsd = Number(((memGb * (expectedSecs / 3600) * 0.25) + 0.01).toFixed(4));
    } else {
      // Default: pay_per_result
      if (ref.usd_per_1000_items) {
        providerCostUsd += (items / 1000) * ref.usd_per_1000_items;
      }
      if (ref.usd_per_run_start) {
        providerCostUsd += ref.usd_per_run_start;
      }
    }
    providerCostUsd = Number(providerCostUsd.toFixed(4));

    // Convert cost to platform currency
    const providerCostConverted = this.convertUsdToPlatform(providerCostUsd, currency);
    const estimatedProfit = Number((finalSellPrice - providerCostConverted).toFixed(2));
    const isBelowCost = finalSellPrice < providerCostConverted;

    return {
      requestedItems: items,
      sellPrice: finalSellPrice,
      providerCostUsd,
      providerCostConverted,
      estimatedProfit,
      currency,
      isBelowCost,
      minChargeApplied
    };
  }

  /**
   * Calculate final settlement charge upon job completion
   */
  public calculateSettlementPrice(
    product: ProductDefinition,
    itemsDelivered: number,
    reservedAmount: number,
    actualProviderCostUsd: number,
    targetCurrency?: string
  ): PriceSettlementResult {
    const currency = (targetCurrency || 'INR').toUpperCase();
    const pricing = product.pricing;

    // Check zero-results policy from settings
    let chargeOnZero = false;
    try {
      const db = getDatabase();
      const setting = db.prepare("SELECT value FROM marketplace_settings WHERE key = 'charge_on_zero_results'").get() as any;
      chargeOnZero = setting?.value === '1';
    } catch {}

    let finalChargeBase = 0;
    if (itemsDelivered === 0 && !chargeOnZero) {
      finalChargeBase = 0;
    } else {
      if (pricing.mode === 'per_item') {
        finalChargeBase = (itemsDelivered / 1000) * (pricing.sell.per_1000_items || 0);
      } else if (pricing.mode === 'per_run') {
        finalChargeBase = pricing.sell.per_run_flat || 0;
      } else if (pricing.mode === 'per_item_plus_run') {
        finalChargeBase = ((itemsDelivered / 1000) * (pricing.sell.per_1000_items || 0)) + (pricing.sell.per_run_flat || 0);
      }

      if (itemsDelivered > 0 && finalChargeBase < (pricing.min_charge || 0)) {
        finalChargeBase = pricing.min_charge || 0;
      }
    }

    // Convert charge from base (INR) to user target currency
    const finalChargeConverted = Number(
      (currency === 'INR'
        ? finalChargeBase
        : this.currencyService.convertBetween(finalChargeBase, 'INR', currency)
      ).toFixed(2)
    );

    // Never charge more than initial reservation
    const finalCharge = Number(Math.min(finalChargeConverted, reservedAmount).toFixed(2));
    const refundDue = Number(Math.max(0, reservedAmount - finalCharge).toFixed(2));

    const providerCostConverted = this.convertUsdToPlatform(actualProviderCostUsd, currency);
    const netProfit = Number((finalCharge - providerCostConverted).toFixed(2));

    return {
      itemsDelivered,
      finalCharge,
      providerCostUsd: Number(actualProviderCostUsd.toFixed(4)),
      providerCostConverted,
      netProfit,
      currency,
      refundDue
    };
  }

  /**
   * Margin Helper: Auto-calculates suggested sell price from provider cost + margin rule
   */
  public calculateSuggestedSellPrice(
    providerCostUsd: number,
    marginType: MarginType,
    marginValue: number,
    targetCurrency?: string
  ): number {
    const baseCostPlatform = this.convertUsdToPlatform(providerCostUsd, targetCurrency);
    if (marginType === 'percent') {
      const markup = baseCostPlatform * (marginValue / 100);
      return Number((baseCostPlatform + markup).toFixed(2));
    }
    if (marginType === 'fixed') {
      return Number((baseCostPlatform + marginValue).toFixed(2));
    }
    return Number(baseCostPlatform.toFixed(2));
  }

  /**
   * Price Preview Calculator (Admin & Customer pricing simulator)
   */
  public generatePricePreview(
    product: ProductDefinition,
    targetCurrency?: string
  ): PriceTierPreview[] {
    const tiers = [100, 500, 1000, 5000, 10000];
    return tiers.map((count) => {
      const est = this.calculateEstimatedPrice(product, count, targetCurrency);
      const marginPct = est.sellPrice > 0
        ? Number(((est.estimatedProfit / est.sellPrice) * 100).toFixed(1))
        : 0;
      return {
        items: count,
        customerPrice: est.sellPrice,
        providerCost: est.providerCostConverted,
        netProfit: est.estimatedProfit,
        marginPct
      };
    });
  }

  /**
   * Generate an auditable, time-stamped price quote with TTL and signature
   */
  public generatePriceQuote(
    product: ProductDefinition,
    requestedItems: number,
    targetCurrency?: string
  ): MarketplacePriceQuote {
    const currency = targetCurrency || 'INR';
    const est = this.calculateEstimatedPrice(product, requestedItems, currency);

    const ttlSecs = product.pricing?.quote_ttl_secs || 300; // default 5 minutes
    const fxBufferPct = product.pricing?.fx_safety_buffer_percent || 5; // 5% FX safety buffer
    const fxBufferAmount = Number((est.providerCostConverted * (fxBufferPct / 100)).toFixed(2));

    const rate = this.convertUsdToPlatform(1.0, currency);
    const expiresAt = new Date(Date.now() + ttlSecs * 1000).toISOString();
    const quoteId = `quote_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const quotePayload = `${quoteId}|${product.slug}|${est.requestedItems}|${est.sellPrice}|${expiresAt}`;
    const signature = crypto.createHash('sha256').update(quotePayload).digest('hex').slice(0, 16);

    return {
      quoteId,
      productSlug: product.slug,
      requestedItems: est.requestedItems,
      currency,
      sellPrice: est.sellPrice,
      providerCostUsd: est.providerCostUsd,
      providerCostConverted: est.providerCostConverted,
      exchangeRate: Number(rate.toFixed(4)),
      fxBufferAmount,
      expiresAt,
      minChargeApplied: est.minChargeApplied,
      signature
    };
  }

  /**
   * Universal Multi-Currency Estimate Table Generator:
   * Generates a matrix of estimated sell prices for 100, 1,000, 10,000 items
   * across all active enabled currencies in the platform.
   */
  public generateMultiCurrencyMatrix(
    product: ProductDefinition
  ): Record<string, { [items: number]: number }> {
    const currencies = this.currencyService.getAllCurrencies(true).map((c: any) => c.code);
    const itemSteps = [100, 1000, 10000];
    const matrix: Record<string, { [items: number]: number }> = {};

    for (const curr of currencies) {
      matrix[curr] = {};
      for (const count of itemSteps) {
        const est = this.calculateEstimatedPrice(product, count, curr);
        matrix[curr][count] = est.sellPrice;
      }
    }

    return matrix;
  }

  /**
   * Rental Break-Even Calculator:
   * Estimates required subscriber volume to offset upstream monthly rental cost
   */
  public calculateRentalBreakEven(
    monthlyRentalUsd: number,
    platformSubscriptionPrice: number,
    targetCurrency?: string
  ): {
    rentalCostConverted: number;
    breakEvenSubscribers: number;
    currency: string;
  } {
    const currency = targetCurrency || 'INR';
    const rentalCostConverted = this.convertUsdToPlatform(monthlyRentalUsd, currency);
    const breakEven = platformSubscriptionPrice > 0
      ? Math.ceil(rentalCostConverted / platformSubscriptionPrice)
      : 0;

    return {
      rentalCostConverted,
      breakEvenSubscribers: breakEven,
      currency
    };
  }
}

