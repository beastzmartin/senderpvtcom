import { IVirtualNumberProvider } from '../IVirtualNumberProvider.js';
import {
  ProviderCountry,
  ProviderNumberItem,
  NumberAllocationRequest,
  NumberAllocationResult,
  NumberRenewalRequest,
  NumberRenewalResult,
  NumberReleaseRequest,
  NumberReleaseResult,
  IncomingMessageItem,
  CallRecordItem
} from '../types.js';
import { FiveSimConfigService } from './FiveSimConfigService.js';
import { FiveSimCatalogService } from './FiveSimCatalogService.js';
import { FiveSimOrderService } from './FiveSimOrderService.js';
import { FiveSimApiClient } from './FiveSimApiClient.js';

export class FiveSimProviderAdapter implements IVirtualNumberProvider {
  public readonly providerId: string = 'fivesim';
  public readonly name: string = '5SIM.NET Virtual Telecom';
  public readonly isMock: boolean = false;

  private configService: FiveSimConfigService;
  private catalogService: FiveSimCatalogService;
  private orderService: FiveSimOrderService;
  private client: FiveSimApiClient;

  constructor() {
    this.configService = FiveSimConfigService.getInstance();
    this.catalogService = new FiveSimCatalogService();
    this.orderService = FiveSimOrderService.getInstance();
    this.client = this.configService.getClient();
  }

  public async initialize(credentials: Record<string, any>, config?: Record<string, any>): Promise<boolean> {
    if (credentials?.apiKey) {
      this.client.setApiKey(credentials.apiKey);
    }
    if (config?.baseUrl) {
      this.client.setBaseUrl(config.baseUrl);
    }
    return true;
  }

  public async healthCheck(): Promise<{ healthy: boolean; latencyMs?: number; message?: string }> {
    const test = await this.configService.testConnection();
    return {
      healthy: test.success,
      latencyMs: test.latencyMs,
      message: test.message
    };
  }

  public async checkProviderBalance(): Promise<{ balance: number; currency: string } | null> {
    try {
      const profile = await this.client.getProfile();
      this.configService.updateProfileStats(profile);
      return {
        balance: profile.balance,
        currency: 'RUB'
      };
    } catch (err) {
      console.error('[5SIM Provider] Balance check failed:', err);
      const cached = this.configService.getConfig();
      if (cached) {
        return {
          balance: cached.balance,
          currency: 'RUB'
        };
      }
      return null;
    }
  }

  public async listCountries(): Promise<ProviderCountry[]> {
    try {
      const rawCountries = await this.catalogService.getCountries();
      const list: ProviderCountry[] = [];

      for (const [slug, data] of Object.entries(rawCountries)) {
        if (!data) continue;
        const iso = data.iso ? Object.keys(data.iso)[0]?.toUpperCase() : slug.slice(0, 2).toUpperCase();
        const prefix = data.prefix ? Object.keys(data.prefix)[0] : '';
        const name = data.text_en || slug;

        list.push({
          isoCode: iso || slug.toUpperCase(),
          name: name.charAt(0).toUpperCase() + name.slice(1),
          dialCode: prefix || '+',
          flagEmoji: '🌐',
          supportedCapabilities: ['sms', 'hosting']
        });
      }

      if (list.length > 0) {
        return list;
      }
    } catch {}

    // Fallback standard list
    return [
      { isoCode: 'GB', name: 'England / United Kingdom', dialCode: '+44', flagEmoji: '🇬🇧', supportedCapabilities: ['sms', 'hosting'] },
      { isoCode: 'US', name: 'United States', dialCode: '+1', flagEmoji: '🇺🇸', supportedCapabilities: ['sms', 'hosting'] },
      { isoCode: 'IN', name: 'India', dialCode: '+91', flagEmoji: '🇮🇳', supportedCapabilities: ['sms'] },
      { isoCode: 'ID', name: 'Indonesia', dialCode: '+62', flagEmoji: '🇮🇩', supportedCapabilities: ['sms'] },
      { isoCode: 'FR', name: 'France', dialCode: '+33', flagEmoji: '🇫🇷', supportedCapabilities: ['sms'] },
      { isoCode: 'DE', name: 'Germany', dialCode: '+49', flagEmoji: '🇩🇪', supportedCapabilities: ['sms'] },
      { isoCode: 'BR', name: 'Brazil', dialCode: '+55', flagEmoji: '🇧🇷', supportedCapabilities: ['sms'] },
      { isoCode: 'CA', name: 'Canada', dialCode: '+1', flagEmoji: '🇨🇦', supportedCapabilities: ['sms'] }
    ];
  }

  public async searchAvailableNumbers(filter: {
    countryCode: string;
    numberType?: string;
    capabilities?: string[];
    limit?: number;
  }): Promise<ProviderNumberItem[]> {
    return [];
  }

  public async allocateNumber(request: NumberAllocationRequest): Promise<NumberAllocationResult> {
    try {
      const order = await this.orderService.buyActivation({
        country: request.countryCode || 'any',
        operator: 'any',
        product: 'whatsapp'
      }, request.userId);

      return {
        success: true,
        allocatedNumber: order.phone,
        providerNumberRef: String(order.id),
        activationDate: order.created_at,
        expirationDate: order.expires,
        metadata: {
          operator: order.operator,
          product: order.product,
          priceRub: order.price
        }
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Failed to allocate 5SIM number'
      };
    }
  }

  public async renewNumber(request: NumberRenewalRequest): Promise<NumberRenewalResult> {
    return {
      success: false,
      error: '5SIM numbers are temporary activations or fixed hosting rentals.'
    };
  }

  public async releaseNumber(request: NumberReleaseRequest): Promise<NumberReleaseResult> {
    try {
      await this.orderService.cancelOrder(request.providerNumberRef);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async getInboundMessages(phoneNumber: string, limit?: number): Promise<IncomingMessageItem[]> {
    return [];
  }

  public async getCallLogs(phoneNumber: string, limit?: number): Promise<CallRecordItem[]> {
    return [];
  }
}
