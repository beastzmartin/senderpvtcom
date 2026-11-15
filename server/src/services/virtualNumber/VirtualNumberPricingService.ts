import { getDatabase } from '../../db/database.js';
import { CalculatedPricing, NumberType, RentalDuration } from './types.js';

export class VirtualNumberPricingService {
  private static instance: VirtualNumberPricingService | null = null;

  public static getInstance(): VirtualNumberPricingService {
    if (!VirtualNumberPricingService.instance) {
      VirtualNumberPricingService.instance = new VirtualNumberPricingService();
    }
    return VirtualNumberPricingService.instance;
  }

  /**
   * Calculate customer-facing price given base provider cost, country, product, duration, and optional customer overrides
   */
  public calculatePrice(params: {
    providerId?: string;
    countryCode: string;
    numberType?: NumberType;
    rentalDuration: RentalDuration;
    durationDays?: number;
    rawProviderBaseCost?: number;
    rawActivationFee?: number;
    userId?: string;
    workspaceId?: string;
  }): CalculatedPricing {
    const db = getDatabase();
    const {
      providerId,
      countryCode,
      rentalDuration,
      durationDays = 30,
      rawProviderBaseCost = 80.0,
      rawActivationFee = 20.0,
      userId,
      workspaceId
    } = params;

    // 1. Check for specific matching pricing rule in database:
    // Priority: User/Workspace specific -> Country specific -> Provider generic
    let rule: any = null;

    if (userId) {
      rule = db
        .prepare(`
          SELECT * FROM virtual_number_pricing
          WHERE is_active = 1 AND user_id = ? AND (country_code = ? OR country_code IS NULL)
          ORDER BY country_code DESC LIMIT 1
        `)
        .get(userId, countryCode);
    }

    if (!rule && countryCode) {
      rule = db
        .prepare(`
          SELECT * FROM virtual_number_pricing
          WHERE is_active = 1 AND country_code = ? AND user_id IS NULL
          ORDER BY provider_id DESC LIMIT 1
        `)
        .get(countryCode);
    }

    if (!rule && providerId) {
      rule = db
        .prepare(`
          SELECT * FROM virtual_number_pricing
          WHERE is_active = 1 AND provider_id = ? AND country_code IS NULL AND user_id IS NULL
          LIMIT 1
        `)
        .get(providerId);
    }

    // Default fallbacks if no explicit pricing rule row configured
    const baseCost = rule ? Number(rule.base_cost || rawProviderBaseCost) : rawProviderBaseCost;
    const activationFee = rule ? Number(rule.activation_fee || rawActivationFee) : rawActivationFee;
    const markupFixed = rule ? Number(rule.markup_amount || 30.0) : 30.0;
    const markupPct = rule ? Number(rule.markup_percentage || 0.0) : 0.0;
    const renewalPriceRule = rule ? Number(rule.renewal_price || 100.0) : 100.0;

    // Calculate duration-specific multiplier or pricing
    let rentalPrice = 0;
    if (rentalDuration === 'daily') {
      rentalPrice = rule?.daily_rental_price ? Number(rule.daily_rental_price) : Number(((baseCost + markupFixed) / 7).toFixed(2));
    } else if (rentalDuration === 'weekly') {
      rentalPrice = rule?.weekly_rental_price ? Number(rule.weekly_rental_price) : Number(((baseCost + markupFixed) / 2.5).toFixed(2));
    } else if (rentalDuration === 'annual') {
      rentalPrice = rule?.annual_rental_price ? Number(rule.annual_rental_price) : Number(((baseCost + markupFixed) * 10).toFixed(2));
    } else {
      // Monthly default (30 days)
      if (rule?.monthly_rental_price && rule.monthly_rental_price > 0) {
        rentalPrice = Number(rule.monthly_rental_price);
      } else {
        const pctAmount = (baseCost * markupPct) / 100;
        rentalPrice = Number((baseCost + markupFixed + pctAmount).toFixed(2));
      }
    }

    const totalFirstCharge = Number((activationFee + rentalPrice).toFixed(2));
    const renewalPrice = Number((renewalPriceRule || rentalPrice).toFixed(2));

    return {
      baseCost,
      activationFee,
      markupAmount: markupFixed,
      markupPercentage: markupPct,
      rentalPrice,
      totalFirstCharge,
      renewalPrice,
      currency: 'INR',
      pricingRuleId: rule?.id || 'default_rule'
    };
  }
}

