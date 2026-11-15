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
import { FiveSimApiClient } from './FiveSimApiClient.js';

export class FiveSimProviderAdapter implements IVirtualNumberProvider {
  public readonly providerId: string = 'fivesim';
  public readonly name: string = '5SIM.NET Virtual Telecom';
  public readonly isMock: boolean = false;

  private configService: FiveSimConfigService;
  private client: FiveSimApiClient;

  constructor() {
    this.configService = FiveSimConfigService.getInstance();
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

  /**
   * Health check validates 5SIM token by requesting user profile
   */
  public async healthCheck(): Promise<{ healthy: boolean; latencyMs?: number; message?: string }> {
    const test = await this.configService.testConnection();
    return {
      healthy: test.success,
      latencyMs: test.latencyMs,
      message: test.message
    };
  }

  /**
   * Provider balance check in standard format
   */
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
    // Initial standard countries list mapped to 5SIM slugs
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
    return {
      success: false,
      error: '5SIM Number purchasing will be enabled in Phase 5.'
    };
  }

  public async renewNumber(request: NumberRenewalRequest): Promise<NumberRenewalResult> {
    return {
      success: false,
      error: '5SIM Number renewal will be enabled in Phase 5.'
    };
  }

  public async releaseNumber(request: NumberReleaseRequest): Promise<NumberReleaseResult> {
    return {
      success: false,
      error: '5SIM Number release will be enabled in Phase 6.'
    };
  }

  public async getInboundMessages(phoneNumber: string, limit?: number): Promise<IncomingMessageItem[]> {
    return [];
  }

  public async getCallLogs(phoneNumber: string, limit?: number): Promise<CallRecordItem[]> {
    return [];
  }
}

