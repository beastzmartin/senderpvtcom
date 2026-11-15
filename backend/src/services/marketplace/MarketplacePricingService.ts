import { ProductDefinition, PricingMode, MarginType } from '../../types/marketplace.js';
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
    const currency = targetCurrency || this.currencyService.getDefaultCurrency().code || 'INR';
    return this.currencyService.convertBetween(amountUsd, 'USD', currency);
  }

  /**
   * Calculate estimated max charge before running an extraction job (used for wallet reservation)
   */
  public calculateEstimatedPrice(
    product: ProductDefinition,
    requestedItems: number,
    targetCurrency?: string
  ): PriceEstimateResult {
    const currency = targetCurrency || 'INR';
    const pricing = product.pricing;
    const items = Math.max(1, requestedItems);

    // 1. Calculate base sell price in platform currency
    let rawSellPrice = 0;
    if (pricing.mode === 'per_item') {
      rawSellPrice = (items / 1000) * (pricing.sell.per_1000_items || 0);
    } else if (pricing.mode === 'per_run') {
      rawSellPrice = pricing.sell.per_run_flat || 0;
    } else if (pricing.mode === 'per_item_plus_run') {
      rawSellPrice = ((items / 1000) * (pricing.sell.per_1000_items || 0)) + (pricing.sell.per_run_flat || 0);
    }

    // Apply minimum charge threshold
    const minCharge = pricing.min_charge || 0;
    const minChargeApplied = rawSellPrice < minCharge;
    const finalSellPrice = Number(Math.max(rawSellPrice, minCharge).toFixed(2));

    // 2. Calculate estimated provider cost in USD
    const ref = pricing.provider_cost_reference;
    let providerCostUsd = 0;
    if (ref.usd_per_1000_items) {
      providerCostUsd += (items / 1000) * ref.usd_per_1000_items;
    }
    if (ref.usd_per_run_start) {
      providerCostUsd += ref.usd_per_run_start;
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
    const currency = targetCurrency || 'INR';
    const pricing = product.pricing;

    // Check zero-results policy from settings
    let chargeOnZero = false;
    try {
      const db = getDatabase();
      const setting = db.prepare("SELECT value FROM marketplace_settings WHERE key = 'charge_on_zero_results'").get() as any;
      chargeOnZero = setting?.value === '1';
    } catch {}

    let finalCharge = 0;
    if (itemsDelivered === 0 && !chargeOnZero) {
      finalCharge = 0;
    } else {
      if (pricing.mode === 'per_item') {
        finalCharge = (itemsDelivered / 1000) * (pricing.sell.per_1000_items || 0);
      } else if (pricing.mode === 'per_run') {
        finalCharge = pricing.sell.per_run_flat || 0;
      } else if (pricing.mode === 'per_item_plus_run') {
        finalCharge = ((itemsDelivered / 1000) * (pricing.sell.per_1000_items || 0)) + (pricing.sell.per_run_flat || 0);
      }

      if (itemsDelivered > 0 && finalCharge < (pricing.min_charge || 0)) {
        finalCharge = pricing.min_charge || 0;
      }
    }

    // Never charge more than initial reservation
    finalCharge = Number(Math.min(finalCharge, reservedAmount).toFixed(2));
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
}
