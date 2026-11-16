import crypto from 'crypto';
import { ProductDefinition, PricingMode, MarginType, MarketplacePriceQuote } from '../../types/marketplace.js';
import { CurrencyService } from '../virtualNumber/CurrencyService.js';
import { getDatabase } from '../../db/database.js';
import { AdvancedMarginEngine } from './AdvancedMarginEngine.js';

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
    const items = Math.max(1, requestedItems);

    const resolved = AdvancedMarginEngine.getInstance().resolveQuote({
      product,
      requestedItems: items,
      targetCurrency: currency
    });

    return {
      requestedItems: items,
      sellPrice: resolved.finalSellPrice,
      providerCostUsd: resolved.rawProviderCostUsd,
      providerCostConverted: resolved.loadedCostConverted,
      estimatedProfit: resolved.profitConverted,
      currency: resolved.currency,
      isBelowCost: resolved.finalSellPrice < resolved.loadedCostConverted,
      minChargeApplied: resolved.floorApplied
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
    } catch { }

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
    const currency = (targetCurrency || 'INR').toUpperCase();
    const resolved = AdvancedMarginEngine.getInstance().resolveQuote({
      product,
      requestedItems,
      targetCurrency: currency
    });

    const quotePayload = `${resolved.quoteId}|${product.slug}|${resolved.requestedItems}|${resolved.finalSellPrice}|${resolved.expiresAt}`;
    const signature = crypto.createHash('sha256').update(quotePayload).digest('hex').slice(0, 16);

    return {
      quoteId: resolved.quoteId,
      productSlug: product.slug,
      requestedItems: resolved.requestedItems,
      currency: resolved.currency,
      sellPrice: resolved.finalSellPrice,
      providerCostUsd: resolved.rawProviderCostUsd,
      providerCostConverted: resolved.loadedCostConverted,
      exchangeRate: Number(resolved.exchangeRate.toFixed(4)),
      fxBufferAmount: Number((resolved.fxBufferUsd * resolved.exchangeRate).toFixed(2)),
      expiresAt: resolved.expiresAt,
      minChargeApplied: resolved.floorApplied,
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

