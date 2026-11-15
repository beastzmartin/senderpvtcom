import { FiveSimConfigService } from './FiveSimConfigService.js';
import {
  FiveSimCountriesResponse,
  FiveSimProductsMap,
  FiveSimOperatorPrice
} from './types.js';

export interface BestOperatorRecommendation {
  operator: string;
  cost: number;
  count: number;
  rate?: number;
  recommended: boolean;
}

export class FiveSimCatalogService {
  private configService: FiveSimConfigService;
  private static cachedCountries: { data: FiveSimCountriesResponse; timestamp: number } | null = null;
  private static readonly CACHE_TTL_MS = 15 * 60 * 1000; // 15 mins

  constructor() {
    this.configService = FiveSimConfigService.getInstance();
  }

  private get client() {
    return this.configService.getClient();
  }

  /**
   * 4.1 / 9.1 Fetch countries list with available operators and metadata
   */
  public async getCountries(forceRefresh = false): Promise<FiveSimCountriesResponse> {
    const now = Date.now();
    if (
      !forceRefresh &&
      FiveSimCatalogService.cachedCountries &&
      now - FiveSimCatalogService.cachedCountries.timestamp < FiveSimCatalogService.CACHE_TTL_MS
    ) {
      return FiveSimCatalogService.cachedCountries.data;
    }

    try {
      const data = await this.client.getGuestCountries();
      FiveSimCatalogService.cachedCountries = { data, timestamp: now };
      return data;
    } catch (err) {
      if (FiveSimCatalogService.cachedCountries) {
        return FiveSimCatalogService.cachedCountries.data;
      }
      throw err;
    }
  }

  /**
   * 4.1 Products request for country & operator
   */
  public async getProducts(country = 'any', operator = 'any'): Promise<FiveSimProductsMap> {
    return this.client.getGuestProducts(country, operator);
  }

  /**
   * 4.2 - 4.5 Prices by country and/or product
   */
  public async getPrices(params?: { country?: string; product?: string }): Promise<any> {
    return this.client.getGuestPrices(params);
  }

  /**
   * Helper to find the best operator for a specific country and service
   * Filters out count === 0, ranks by rate (delivery %) and lowest cost
   */
  public async getBestOperator(country: string, product: string): Promise<{
    operators: BestOperatorRecommendation[];
    recommended: BestOperatorRecommendation | null;
  }> {
    const cleanCountry = country.toLowerCase().trim();
    const cleanProduct = product.toLowerCase().trim();

    const priceData = await this.client.getGuestPrices({
      country: cleanCountry,
      product: cleanProduct
    });

    let operatorMap: Record<string, FiveSimOperatorPrice> = {};

    // 5SIM returns either:
    // { [country]: { [product]: { [op]: { cost, count, rate } } } }
    // OR { [product]: { [country]: { [op]: { cost, count, rate } } } }
    if (priceData && typeof priceData === 'object') {
      if (priceData[cleanCountry]?.[cleanProduct]) {
        operatorMap = priceData[cleanCountry][cleanProduct];
      } else if (priceData[cleanProduct]?.[cleanCountry]) {
        operatorMap = priceData[cleanProduct][cleanCountry];
      } else if (cleanCountry === 'any' || cleanProduct === 'any') {
        // Fallback traverse
        const firstC = Object.keys(priceData)[0];
        if (firstC && priceData[firstC]?.[cleanProduct]) {
          operatorMap = priceData[firstC][cleanProduct];
        }
      }
    }

    const available: BestOperatorRecommendation[] = [];

    for (const [opName, details] of Object.entries(operatorMap)) {
      if (details && typeof details === 'object') {
        available.push({
          operator: opName,
          cost: details.cost,
          count: details.count,
          rate: details.rate,
          recommended: false
        });
      }
    }

    // Sort: 1. In stock (count > 0), 2. Higher rate, 3. Lower cost
    available.sort((a, b) => {
      if (a.count > 0 && b.count <= 0) return -1;
      if (b.count > 0 && a.count <= 0) return 1;

      const rateA = a.rate !== undefined ? a.rate : 0;
      const rateB = b.rate !== undefined ? b.rate : 0;
      if (rateB !== rateA) return rateB - rateA;

      return a.cost - b.cost;
    });

    let recommended: BestOperatorRecommendation | null = null;
    const bestStocked = available.find((o) => o.count > 0);
    if (bestStocked) {
      bestStocked.recommended = true;
      recommended = bestStocked;
    } else if (available.length > 0) {
      available[0].recommended = true;
      recommended = available[0];
    }

    return {
      operators: available,
      recommended
    };
  }
}
