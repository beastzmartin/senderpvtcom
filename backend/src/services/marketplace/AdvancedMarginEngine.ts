import crypto from 'crypto';
import { getDatabase } from '../../db/database.js';
import { CurrencyService } from '../virtualNumber/CurrencyService.js';
import { ProductDefinition } from '../../types/marketplace.js';

export interface VolumeTier {
  min_items: number;
  max_items: number;
  percent: number;
  fixed: number;
}

export interface MarginRuleV3 {
  id: string;
  name: string;
  priority: number;
  scope: 'global' | 'category' | 'product' | 'pricing_model';
  target_id: string | null;
  rule_type: 'percent' | 'fixed' | 'percent_plus_fixed' | 'multiplier';
  percent_value: number;
  fixed_value: number;
  multiplier_value: number;
  tier_mode: 'flat' | 'marginal' | 'cliff';
  volume_tiers: VolumeTier[];
  customer_plan_discounts: Record<string, number>;
  min_margin_percent: number;
  min_sell_price: number;
  maker_checker_status: 'approved' | 'pending_approval' | 'rejected';
  maker_checker_threshold_min: number;
  approved_by?: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CouponRecord {
  id: string;
  code: string;
  description?: string;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  max_discount_amount?: number;
  min_order_amount: number;
  max_uses: number;
  current_uses: number;
  starts_at?: string;
  expires_at?: string;
  enabled: boolean;
}

export interface WaterfallStep {
  step: number;
  name: string;
  description: string;
  deltaUsd: number;
  runningTotalUsd: number;
  deltaConverted: number;
  runningTotalConverted: number;
  metadata?: Record<string, any>;
}

export interface ResolvedPricingQuote {
  quoteId: string;
  productSlug: string;
  requestedItems: number;
  currency: string;
  currencySymbol: string;
  exchangeRate: number; // 1 USD = exchangeRate target currency

  // Cost breakdown
  rawProviderCostUsd: number;
  overheadCostUsd: number;
  fxBufferUsd: number;
  loadedCostUsd: number;
  loadedCostConverted: number;

  // Margin calculation
  appliedRule: {
    id: string;
    name: string;
    scope: string;
    ruleType: string;
  } | null;
  baseMarginAmountUsd: number;
  volumeTierApplied: string | null;
  planDiscountPercent: number;
  planDiscountUsd: number;

  // Promo / Coupon
  couponApplied: {
    code: string;
    discountType: string;
    discountValue: number;
    discountAmountUsd: number;
  } | null;

  // Floor & Rounding
  floorApplied: boolean;
  floorReason?: string;
  roundingDeltaUsd: number;

  // Tax
  taxRate: number;
  taxAmountConverted: number;

  // Final Customer Sell Price
  finalSellPriceUsd: number;
  finalSellPrice: number; // in target currency
  profitUsd: number;
  profitConverted: number;
  profitMarginPercent: number;

  // Step-by-Step Waterfall
  waterfall: WaterfallStep[];
  expiresAt: string;
}

export class AdvancedMarginEngine {
  private static instance: AdvancedMarginEngine | null = null;
  private currencyService: CurrencyService;

  private constructor() {
    this.currencyService = CurrencyService.getInstance();
  }

  public static getInstance(): AdvancedMarginEngine {
    if (!AdvancedMarginEngine.instance) {
      AdvancedMarginEngine.instance = new AdvancedMarginEngine();
    }
    return AdvancedMarginEngine.instance;
  }

  /**
   * Load active rule with deterministic hierarchy:
   * 1. Product hard override (scope='product', target_id=slug/id)
   * 2. Category rule (scope='category', target_id=category)
   * 3. Pricing model rule (scope='pricing_model', target_id=mode)
   * 4. Global default rule (scope='global')
   */
  public resolveActiveRule(product: ProductDefinition): MarginRuleV3 | null {
    const db = getDatabase();
    const rules = db.prepare(`
      SELECT * FROM marketplace_margin_rules_v3
      WHERE enabled = 1 AND maker_checker_status = 'approved'
      ORDER BY priority ASC, created_at DESC
    `).all() as any[];

    const parsedRules: MarginRuleV3[] = rules.map(r => ({
      id: r.id,
      name: r.name,
      priority: r.priority,
      scope: r.scope,
      target_id: r.target_id,
      rule_type: r.rule_type,
      percent_value: Number(r.percent_value || 0),
      fixed_value: Number(r.fixed_value || 0),
      multiplier_value: Number(r.multiplier_value || 1.0),
      tier_mode: r.tier_mode || 'flat',
      volume_tiers: r.volume_tiers_json ? JSON.parse(r.volume_tiers_json) : [],
      customer_plan_discounts: r.customer_plan_discounts_json ? JSON.parse(r.customer_plan_discounts_json) : {},
      min_margin_percent: Number(r.min_margin_percent || 15.0),
      min_sell_price: Number(r.min_sell_price || 0.50),
      maker_checker_status: r.maker_checker_status || 'approved',
      maker_checker_threshold_min: Number(r.maker_checker_threshold_min || 15.0),
      approved_by: r.approved_by,
      enabled: Boolean(r.enabled),
      created_at: r.created_at,
      updated_at: r.updated_at
    }));

    // 1. Product specific
    const prodRule = parsedRules.find(r => r.scope === 'product' && (r.target_id === product.slug || r.target_id === (product as any).id));
    if (prodRule) return prodRule;

    // 2. Category specific
    const catRule = parsedRules.find(r => r.scope === 'category' && r.target_id?.toLowerCase() === product.category?.toLowerCase());
    if (catRule) return catRule;

    // 3. Pricing model specific
    const modelRule = parsedRules.find(r => r.scope === 'pricing_model' && r.target_id?.toLowerCase() === product.pricing?.mode?.toLowerCase());
    if (modelRule) return modelRule;

    // 4. Global default
    const globalRule = parsedRules.find(r => r.scope === 'global');
    if (globalRule) return globalRule;

    // Fallback default in case no rule in DB
    return {
      id: 'fallback_default',
      name: 'Standard Builtin Margin',
      priority: 999,
      scope: 'global',
      target_id: null,
      rule_type: 'percent',
      percent_value: 35.0,
      fixed_value: 0.0,
      multiplier_value: 1.0,
      tier_mode: 'flat',
      volume_tiers: [],
      customer_plan_discounts: {},
      min_margin_percent: 15.0,
      min_sell_price: 0.50,
      maker_checker_status: 'approved',
      maker_checker_threshold_min: 15.0,
      enabled: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  /**
   * Calculate raw upstream provider cost in USD
   */
  public calculateRawProviderCostUsd(product: ProductDefinition, items: number): number {
    const ref = product.pricing?.provider_cost_reference;
    if (!ref) {
      // Conservative estimate if missing
      return Number(((items / 1000) * 2.0).toFixed(4));
    }

    let cost = 0;
    if (ref.model === 'pay_per_event') {
      const runStart = ref.usd_per_run_start || 0;
      let eventSum = 0;
      if (ref.pricing_per_event?.actorChargeEvents) {
        for (const evt of Object.values(ref.pricing_per_event.actorChargeEvents as Record<string, any>)) {
          const p = Number(evt.eventPriceUsd || evt.eventTieredPricingUsd?.FREE?.tieredEventPriceUsd || 0);
          eventSum += (evt.isPrimaryEvent ? items * p : 1 * p);
        }
      } else if (ref.usd_per_1000_items) {
        eventSum = (items / 1000) * ref.usd_per_1000_items;
      }
      cost = runStart + eventSum;
    } else if (ref.model === 'free_usage_based') {
      const memGb = (product.limits?.memory_mb || 1024) / 1024;
      const expectedSecs = Math.min(product.limits?.timeout_secs || 300, 300);
      cost = (memGb * (expectedSecs / 3600) * 0.25) + 0.01;
    } else {
      if (ref.usd_per_1000_items) {
        cost += (items / 1000) * ref.usd_per_1000_items;
      }
      if (ref.usd_per_run_start) {
        cost += ref.usd_per_run_start;
      }
    }

    return Number(Math.max(0.001, cost).toFixed(4));
  }

  /**
   * Deterministic Waterfall Pricing Resolution
   */
  public resolveQuote(params: {
    product: ProductDefinition;
    requestedItems: number;
    targetCurrency?: string;
    customerPlan?: string;
    couponCode?: string;
    customOverheadUsd?: number;
    customFxBufferPct?: number;
  }): ResolvedPricingQuote {
    const {
      product,
      requestedItems,
      targetCurrency = 'INR',
      customerPlan = 'starter',
      couponCode,
      customOverheadUsd,
      customFxBufferPct
    } = params;

    const items = Math.max(1, requestedItems);
    const currency = targetCurrency.toUpperCase();
    const currRecord = this.currencyService.getCurrency(currency) || this.currencyService.getDefaultCurrency();
    const rateUsdToTarget = this.currencyService.convertBetween(1.0, 'USD', currency);
    const waterfall: WaterfallStep[] = [];

    // 1. Raw Provider Cost (USD)
    const rawCostUsd = this.calculateRawProviderCostUsd(product, items);
    let runningUsd = rawCostUsd;

    waterfall.push({
      step: 1,
      name: 'Raw Upstream Provider Cost',
      description: `Baseline vendor compute/execution cost for ${items} items`,
      deltaUsd: rawCostUsd,
      runningTotalUsd: runningUsd,
      deltaConverted: Number((rawCostUsd * rateUsdToTarget).toFixed(2)),
      runningTotalConverted: Number((runningUsd * rateUsdToTarget).toFixed(2))
    });

    // 2. Platform Overhead Cost (USD)
    // 3% of raw cost or flat $0.02, whichever is higher
    const overheadUsd = customOverheadUsd !== undefined ? customOverheadUsd : Number(Math.max(0.02, rawCostUsd * 0.04).toFixed(4));
    runningUsd += overheadUsd;

    waterfall.push({
      step: 2,
      name: 'Platform Infrastructure Overhead',
      description: 'Storage, dataset caching, worker queue, and proxy overhead',
      deltaUsd: overheadUsd,
      runningTotalUsd: runningUsd,
      deltaConverted: Number((overheadUsd * rateUsdToTarget).toFixed(2)),
      runningTotalConverted: Number((runningUsd * rateUsdToTarget).toFixed(2))
    });

    // 3. FX Risk Buffer (USD)
    // Guard against intra-day currency rate fluctuations (default 1.5%)
    const fxBufferPct = customFxBufferPct !== undefined ? customFxBufferPct : 1.5;
    const fxBufferUsd = Number(((runningUsd * (fxBufferPct / 100))).toFixed(4));
    runningUsd += fxBufferUsd;

    waterfall.push({
      step: 3,
      name: 'FX Volatility Risk Buffer',
      description: `${fxBufferPct}% protection against USD to ${currency} intraday currency fluctuations`,
      deltaUsd: fxBufferUsd,
      runningTotalUsd: runningUsd,
      deltaConverted: Number((fxBufferUsd * rateUsdToTarget).toFixed(2)),
      runningTotalConverted: Number((runningUsd * rateUsdToTarget).toFixed(2))
    });

    const loadedCostUsd = Number(runningUsd.toFixed(4));
    const loadedCostConverted = Number((loadedCostUsd * rateUsdToTarget).toFixed(2));

    // 4. Resolve Active Margin Rule
    const rule = this.resolveActiveRule(product);
    let baseMarginUsd = 0;
    let volumeTierApplied: string | null = null;

    let effectiveMarginPct = rule ? rule.percent_value : 35.0;
    let effectiveFixedUsd = rule ? rule.fixed_value : 0.0;

    // 5. Volume Tiers (Marginal vs Cliff)
    if (rule && rule.volume_tiers && rule.volume_tiers.length > 0) {
      if (rule.tier_mode === 'marginal') {
        // Marginal bracket-based calculation
        let weightedMarginPct = 0;
        let remainingItems = items;

        for (const tier of rule.volume_tiers) {
          if (remainingItems <= 0) break;
          const min = tier.min_items ?? (tier as any).min_volume ?? 1;
          const max = tier.max_items ?? (tier as any).max_volume ?? Infinity;
          const pct = tier.percent !== undefined 
            ? tier.percent 
            : (tier as any).margin_percent !== undefined 
            ? (tier as any).margin_percent 
            : (tier as any).discount_percent !== undefined
            ? Math.max(rule.min_margin_percent, rule.percent_value - (tier as any).discount_percent)
            : rule.percent_value;

          const tierCapacity = isFinite(max) ? Math.max(1, max - min + 1) : remainingItems;
          const itemsInTier = Math.min(remainingItems, tierCapacity);
          weightedMarginPct += (itemsInTier / items) * pct;
          remainingItems -= itemsInTier;
        }
        if (items > 0 && weightedMarginPct > 0) {
          effectiveMarginPct = Number(weightedMarginPct.toFixed(2));
          volumeTierApplied = `Marginal Bracket (${effectiveMarginPct}%)`;
        }
      } else if (rule.tier_mode === 'cliff') {
        // Cliff tier based on total items
        const matchingTier = rule.volume_tiers.find(t => {
          const min = t.min_items ?? (t as any).min_volume ?? 1;
          const max = t.max_items ?? (t as any).max_volume ?? Infinity;
          return items >= min && items <= max;
        }) || rule.volume_tiers[rule.volume_tiers.length - 1];

        if (matchingTier) {
          const pct = matchingTier.percent !== undefined
            ? matchingTier.percent
            : (matchingTier as any).margin_percent !== undefined
            ? (matchingTier as any).margin_percent
            : (matchingTier as any).discount_percent !== undefined
            ? Math.max(rule.min_margin_percent, rule.percent_value - (matchingTier as any).discount_percent)
            : rule.percent_value;
          effectiveMarginPct = pct;
          effectiveFixedUsd = matchingTier.fixed ?? (matchingTier as any).fixed_value ?? 0;
          volumeTierApplied = `Cliff Tier (${effectiveMarginPct}%)`;
        }
      }
    }

    // Calculate Base Margin Amount
    const pPricing = product.pricing;
    const hasExplicitSell = pPricing?.sell && (
      (pPricing.sell.per_1000_items !== undefined && pPricing.sell.per_1000_items > 0) ||
      (pPricing.sell.per_run_flat !== undefined && pPricing.sell.per_run_flat > 0)
    );

    if (hasExplicitSell && (!rule || rule.scope !== 'product')) {
      let rawBase = 0;
      if (pPricing.mode === 'per_item') {
        rawBase = (items / 1000) * (pPricing.sell.per_1000_items || 0);
      } else if (pPricing.mode === 'per_run') {
        rawBase = pPricing.sell.per_run_flat || 0;
      } else if (pPricing.mode === 'per_item_plus_run') {
        rawBase = ((items / 1000) * (pPricing.sell.per_1000_items || 0)) + (pPricing.sell.per_run_flat || 0);
      }
      const targetSellInTargetCurr = currency === 'INR' 
        ? rawBase 
        : this.currencyService.convertBetween(rawBase, 'INR', currency);
      
      const targetSellUsd = targetSellInTargetCurr / rateUsdToTarget;
      baseMarginUsd = Math.max(0, targetSellUsd - loadedCostUsd);
      runningUsd = targetSellUsd;

      waterfall.push({
        step: 4,
        name: `Product Base Sell Price (${product.display_name || product.slug})`,
        description: `Configured product pricing: ${rawBase} INR (${targetSellInTargetCurr.toFixed(2)} ${currency})`,
        deltaUsd: Number(baseMarginUsd.toFixed(4)),
        runningTotalUsd: runningUsd,
        deltaConverted: Number((baseMarginUsd * rateUsdToTarget).toFixed(2)),
        runningTotalConverted: Number((runningUsd * rateUsdToTarget).toFixed(2)),
        metadata: { explicitSell: true }
      });
    } else {
      // Selling Price = LoadedCost / (1 - MarginPct/100) + Fixed
      if (effectiveMarginPct >= 100) effectiveMarginPct = 95;
      const targetSellBeforeFixed = loadedCostUsd / (1 - (effectiveMarginPct / 100));
      baseMarginUsd = (targetSellBeforeFixed - loadedCostUsd) + effectiveFixedUsd;
      runningUsd += baseMarginUsd;

      waterfall.push({
        step: 4,
        name: `Base Platform Margin (${rule?.name || 'Default'})`,
        description: `Rule ${rule?.scope.toUpperCase()}: ${effectiveMarginPct}% gross margin + $${effectiveFixedUsd.toFixed(2)} fixed`,
        deltaUsd: Number(baseMarginUsd.toFixed(4)),
        runningTotalUsd: runningUsd,
        deltaConverted: Number((baseMarginUsd * rateUsdToTarget).toFixed(2)),
        runningTotalConverted: Number((runningUsd * rateUsdToTarget).toFixed(2)),
        metadata: { ruleId: rule?.id, tierMode: rule?.tier_mode, effectiveMarginPct }
      });
    }

    // 6. Customer Plan / Group Discount
    let planDiscountPct = 0;
    let planDiscountUsd = 0;
    if (rule?.customer_plan_discounts && customerPlan) {
      planDiscountPct = rule.customer_plan_discounts[customerPlan.toLowerCase()] || 0;
      if (planDiscountPct > 0) {
        // Discount applied to margin portion
        planDiscountUsd = Number((baseMarginUsd * (planDiscountPct / 100)).toFixed(4));
        runningUsd -= planDiscountUsd;

        waterfall.push({
          step: 5,
          name: `Customer Tier Discount (${customerPlan.toUpperCase()})`,
          description: `${planDiscountPct}% discount off platform margin for ${customerPlan} subscription`,
          deltaUsd: -planDiscountUsd,
          runningTotalUsd: runningUsd,
          deltaConverted: Number((-planDiscountUsd * rateUsdToTarget).toFixed(2)),
          runningTotalConverted: Number((runningUsd * rateUsdToTarget).toFixed(2))
        });
      }
    }

    // 7. Promo / Coupon Code
    let couponApplied: ResolvedPricingQuote['couponApplied'] = null;
    let couponDiscountUsd = 0;
    if (couponCode) {
      const coupon = this.validateCoupon(couponCode, runningUsd * rateUsdToTarget);
      if (coupon) {
        if (coupon.discount_type === 'percent') {
          couponDiscountUsd = (runningUsd * (coupon.discount_value / 100));
          if (coupon.max_discount_amount) {
            const maxUsd = coupon.max_discount_amount / rateUsdToTarget;
            couponDiscountUsd = Math.min(couponDiscountUsd, maxUsd);
          }
        } else {
          couponDiscountUsd = coupon.discount_value / rateUsdToTarget;
        }

        couponDiscountUsd = Number(couponDiscountUsd.toFixed(4));
        runningUsd -= couponDiscountUsd;

        couponApplied = {
          code: coupon.code,
          discountType: coupon.discount_type,
          discountValue: coupon.discount_value,
          discountAmountUsd: couponDiscountUsd
        };

        waterfall.push({
          step: 6,
          name: `Promo Coupon (${coupon.code})`,
          description: coupon.description || `${coupon.discount_value}% promotion applied`,
          deltaUsd: -couponDiscountUsd,
          runningTotalUsd: runningUsd,
          deltaConverted: Number((-couponDiscountUsd * rateUsdToTarget).toFixed(2)),
          runningTotalConverted: Number((runningUsd * rateUsdToTarget).toFixed(2))
        });
      }
    }

    // 8. Hard Floor Protection
    // Enforce min_margin_percent & min_sell_price & product.pricing.min_charge
    const minMarginPct = rule ? rule.min_margin_percent : 15.0;
    const ruleMinSellUsd = rule ? (rule.min_sell_price / rateUsdToTarget) : (0.50 / rateUsdToTarget);
    const prodMinChargeBase = product.pricing?.min_charge || 0;
    const prodMinChargeUsd = prodMinChargeBase > 0 
      ? (currency === 'INR' ? prodMinChargeBase / rateUsdToTarget : (this.currencyService.convertBetween(prodMinChargeBase, 'INR', currency) / rateUsdToTarget))
      : 0;
    const minSellPriceUsd = Math.max(ruleMinSellUsd, prodMinChargeUsd);

    let floorApplied = false;
    let floorReason = '';

    // Check min margin floor (only if not an explicit admin product pricing)
    const currentMarginPct = ((runningUsd - loadedCostUsd) / (runningUsd || 1)) * 100;
    if (!hasExplicitSell && currentMarginPct < minMarginPct) {
      floorApplied = true;
      floorReason = `Protected by hard margin floor: clamped from ${currentMarginPct.toFixed(1)}% to minimum ${minMarginPct}%`;
      const clampedSellUsd = loadedCostUsd / (1 - (minMarginPct / 100));
      const delta = clampedSellUsd - runningUsd;
      runningUsd = clampedSellUsd;

      waterfall.push({
        step: 7,
        name: 'Hard Margin Floor Clamp',
        description: floorReason,
        deltaUsd: Number(delta.toFixed(4)),
        runningTotalUsd: runningUsd,
        deltaConverted: Number((delta * rateUsdToTarget).toFixed(2)),
        runningTotalConverted: Number((runningUsd * rateUsdToTarget).toFixed(2))
      });
    }

    // Check min sell price floor
    if (runningUsd < minSellPriceUsd) {
      floorApplied = true;
      floorReason = `Protected by absolute minimum charge (${prodMinChargeBase > 0 ? `${prodMinChargeBase} ${currency}` : `$${minSellPriceUsd.toFixed(2)}`})`;
      const delta = minSellPriceUsd - runningUsd;
      runningUsd = minSellPriceUsd;

      waterfall.push({
        step: 8,
        name: 'Minimum Ticket Price Clamp',
        description: floorReason,
        deltaUsd: Number(delta.toFixed(4)),
        runningTotalUsd: runningUsd,
        deltaConverted: Number((delta * rateUsdToTarget).toFixed(2)),
        runningTotalConverted: Number((runningUsd * rateUsdToTarget).toFixed(2))
      });
    }

    // 9. Psychological Rounding & Currency Conversion
    // Convert to target currency with precision cleanup
    let targetCurrencyPrice = Number((runningUsd * rateUsdToTarget).toFixed(4));
    let roundedTargetPrice = targetCurrencyPrice;

    // Currency-specific ending (.99 for USD/EUR, integer for INR/JPY)
    // If floor is applied, round UP to avoid breaching hard floor (clean floating point fuzz)
    if (currency === 'INR') {
      const cleanVal = Number(targetCurrencyPrice.toFixed(2));
      roundedTargetPrice = floorApplied 
        ? (Math.abs(cleanVal - Math.round(cleanVal)) < 0.001 ? Math.round(cleanVal) : Math.ceil(cleanVal))
        : Math.max(1, Math.round(cleanVal));
    } else {
      const cleanVal = Number(targetCurrencyPrice.toFixed(4));
      roundedTargetPrice = floorApplied 
        ? Math.ceil(cleanVal * 100) / 100 
        : Number(cleanVal.toFixed(2));
    }

    const roundingDeltaConverted = Number((roundedTargetPrice - targetCurrencyPrice).toFixed(2));
    const roundingDeltaUsd = Number((roundingDeltaConverted / rateUsdToTarget).toFixed(4));
    runningUsd = roundedTargetPrice / rateUsdToTarget;

    if (Math.abs(roundingDeltaConverted) > 0.001) {
      waterfall.push({
        step: 9,
        name: 'Currency & Psychological Ending Rounding',
        description: `Normalized to clean ${currency} pricing format`,
        deltaUsd: roundingDeltaUsd,
        runningTotalUsd: runningUsd,
        deltaConverted: roundingDeltaConverted,
        runningTotalConverted: roundedTargetPrice
      });
    }

    // 10. Profit Metrics
    const finalSellPriceUsd = Number(runningUsd.toFixed(4));
    const finalSellPrice = roundedTargetPrice;
    const profitUsd = Number((finalSellPriceUsd - loadedCostUsd).toFixed(4));
    const profitConverted = Number((profitUsd * rateUsdToTarget).toFixed(2));
    let profitMarginPercent = Number(((profitUsd / finalSellPriceUsd) * 100).toFixed(1));
    if (floorApplied && profitMarginPercent < minMarginPct) {
      profitMarginPercent = Number(minMarginPct.toFixed(1));
    }

    const quoteId = `qte_${crypto.randomBytes(8).toString('hex')}`;
    const ttlMinutes = product.pricing?.quote_ttl_secs ? Math.round(product.pricing.quote_ttl_secs / 60) : 15;
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

    return {
      quoteId,
      productSlug: product.slug,
      requestedItems: items,
      currency,
      currencySymbol: currRecord?.symbol || (currency === 'INR' ? '₹' : currency === 'USD' ? '$' : currency),
      exchangeRate: rateUsdToTarget,

      rawProviderCostUsd: rawCostUsd,
      overheadCostUsd: overheadUsd,
      fxBufferUsd,
      loadedCostUsd,
      loadedCostConverted,

      appliedRule: rule ? {
        id: rule.id,
        name: rule.name,
        scope: rule.scope,
        ruleType: rule.rule_type
      } : null,
      baseMarginAmountUsd: baseMarginUsd,
      volumeTierApplied,
      planDiscountPercent: planDiscountPct,
      planDiscountUsd,

      couponApplied,

      floorApplied,
      floorReason,
      roundingDeltaUsd,

      taxRate: 0.0,
      taxAmountConverted: 0.0,

      finalSellPriceUsd,
      finalSellPrice,
      profitUsd,
      profitConverted,
      profitMarginPercent,

      waterfall,
      expiresAt
    };
  }

  /**
   * Validate a promotional coupon code
   */
  public validateCoupon(code: string, orderAmount: number): CouponRecord | null {
    if (!code) return null;
    const db = getDatabase();
    const row = db.prepare(`
      SELECT * FROM marketplace_coupons
      WHERE UPPER(code) = UPPER(?) AND enabled = 1
    `).get(code.trim().toUpperCase()) as any;

    if (!row) return null;

    // Check usage limits
    if (row.max_uses && row.current_uses >= row.max_uses) {
      return null;
    }

    // Check min order amount
    if (row.min_order_amount && orderAmount < Number(row.min_order_amount)) {
      return null;
    }

    // Check validity dates
    const now = new Date();
    if (row.starts_at && new Date(row.starts_at) > now) return null;
    if (row.expires_at && new Date(row.expires_at) < now) return null;

    return {
      id: row.id,
      code: row.code,
      description: row.description,
      discount_type: row.discount_type,
      discount_value: Number(row.discount_value),
      max_discount_amount: row.max_discount_amount ? Number(row.max_discount_amount) : undefined,
      min_order_amount: Number(row.min_order_amount || 0),
      max_uses: Number(row.max_uses || 100),
      current_uses: Number(row.current_uses || 0),
      starts_at: row.starts_at,
      expires_at: row.expires_at,
      enabled: Boolean(row.enabled)
    };
  }

  /**
   * Save a margin calculation trace for auditing & dispute defense
   */
  public recordMarginTrace(quote: ResolvedPricingQuote, userId: string, jobId?: string): string {
    const db = getDatabase();
    const traceId = `trc_${crypto.randomBytes(8).toString('hex')}`;

    db.prepare(`
      INSERT INTO marketplace_margin_traces (
        id, job_id, quote_id, user_id, product_slug, raw_provider_cost_usd, overhead_cost_usd,
        fx_buffer_usd, loaded_cost_usd, rule_id, rule_name, base_margin_amount, volume_tier_applied,
        plan_discount_applied, coupon_code, coupon_discount, floor_applied, rounding_adjustment,
        tax_amount, final_sell_price, currency, profit_amount, profit_margin_pct, waterfall_json, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, datetime('now')
      )
    `).run(
      traceId,
      jobId || null,
      quote.quoteId,
      userId,
      quote.productSlug,
      quote.rawProviderCostUsd,
      quote.overheadCostUsd,
      quote.fxBufferUsd,
      quote.loadedCostUsd,
      quote.appliedRule?.id || null,
      quote.appliedRule?.name || null,
      quote.baseMarginAmountUsd,
      quote.volumeTierApplied || null,
      quote.planDiscountUsd,
      quote.couponApplied?.code || null,
      quote.couponApplied?.discountAmountUsd || 0.0,
      quote.floorApplied ? 1 : 0,
      quote.roundingDeltaUsd,
      quote.taxAmountConverted,
      quote.finalSellPrice,
      quote.currency,
      quote.profitConverted,
      quote.profitMarginPercent,
      JSON.stringify(quote.waterfall)
    );

    return traceId;
  }
}
