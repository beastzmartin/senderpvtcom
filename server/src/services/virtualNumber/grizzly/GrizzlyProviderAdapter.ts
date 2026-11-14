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
  ProviderWebhookResult
} from '../types.js';
import { getDatabase } from '../../../db/database.js';
import { GrizzlyProviderConfigService } from './GrizzlyProviderConfigService.js';
import { GrizzlyPartnerProtocolService } from './GrizzlyPartnerProtocolService.js';
import { GrizzlyFinishActivationAdapter } from './GrizzlyFinishActivationAdapter.js';

export class GrizzlyProviderAdapter implements IVirtualNumberProvider {
  public readonly providerId = 'grizzlysms';
  public readonly name = 'GrizzlySMS';
  public readonly isMock = false;

  public async initialize(_credentials: Record<string, any>, _config?: Record<string, any>): Promise<boolean> {
    try {
      GrizzlyProviderConfigService.getConfig();
      return true;
    } catch {
      return false;
    }
  }

  public async healthCheck(): Promise<{ healthy: boolean; latencyMs?: number; message?: string }> {
    const start = Date.now();
    try {
      const config = GrizzlyProviderConfigService.getConfig();
      const latency = Date.now() - start;
      const isHealthy = config.status === 'enabled';
      return {
        healthy: isHealthy,
        latencyMs: latency,
        message: isHealthy ? 'GrizzlySMS Partner Protocol active' : `Provider in ${config.status} status`
      };
    } catch (err: any) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        message: err.message
      };
    }
  }

  public async listCountries(): Promise<ProviderCountry[]> {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT DISTINCT c.iso_code, c.country_name, c.dial_code, c.flag_emoji
      FROM grizzly_country_mappings c
      WHERE c.is_enabled = 1
    `).all() as any[];

    return rows.map((r) => ({
      isoCode: r.iso_code,
      name: r.country_name,
      dialCode: r.dial_code,
      flagEmoji: r.flag_emoji || '🌐',
      supportedCapabilities: ['sms', 'partner_api']
    }));
  }

  public async searchAvailableNumbers(filter: {
    countryCode: string;
    numberType?: string;
    capabilities?: string[];
    limit?: number;
  }): Promise<ProviderNumberItem[]> {
    const db = getDatabase();
    const limit = filter.limit || 50;

    const rows = db.prepare(`
      SELECT
        i.id,
        i.phone_number,
        c.iso_code,
        i.cost_price,
        i.supported_services
      FROM grizzly_inventory i
      JOIN grizzly_country_mappings c ON i.country_id = c.grizzly_country_id
      WHERE c.iso_code = ? AND i.status = 'available'
      LIMIT ?
    `).all(filter.countryCode.toUpperCase(), limit) as any[];

    return rows.map((r) => {
      let services: string[] = [];
      try {
        services = JSON.parse(r.supported_services || '[]');
      } catch {
        services = ['tg', 'wa'];
      }

      return {
        phoneNumber: r.phone_number,
        countryCode: r.iso_code,
        numberType: 'mobile',
        capabilities: ['sms'],
        whatsappCompatible: services.includes('wa'),
        otpCompatible: true,
        baseCost: r.cost_price || 15.0,
        activationFee: 0.5,
        monthlyPrice: 3.5,
        renewalPrice: 3.5,
        providerRef: r.id
      };
    });
  }

  public async allocateNumber(request: NumberAllocationRequest): Promise<NumberAllocationResult> {
    const db = getDatabase();

    // Map ISO code to numeric Grizzly country ID
    const mapping = db.prepare(`
      SELECT grizzly_country_id FROM grizzly_country_mappings WHERE iso_code = ? LIMIT 1
    `).get(request.countryCode.toUpperCase()) as any;

    if (!mapping) {
      return {
        success: false,
        error: `Country "${request.countryCode}" is not mapped in GrizzlySMS configuration.`
      };
    }

    const config = GrizzlyProviderConfigService.getConfig();

    const getNumberResult = GrizzlyPartnerProtocolService.handleGetNumber({
      action: 'GET_NUMBER',
      key: config.protocol_key,
      country: mapping.grizzly_country_id,
      operator: 'any',
      service: 'tg',
      sum: 20.0,
      canGetAnotherSms: true
    });

    if (getNumberResult.status === 'SUCCESS') {
      const now = new Date();
      const expiration = new Date(now.getTime() + (request.durationDays || 30) * 86400000);
      return {
        success: true,
        allocatedNumber: `+${getNumberResult.number}`,
        providerNumberRef: String(getNumberResult.activationId),
        activationDate: now.toISOString(),
        expirationDate: expiration.toISOString(),
        metadata: {
          activationId: getNumberResult.activationId,
          flashcall: getNumberResult.flashcall,
          voice: getNumberResult.voice
        }
      };
    }

    return {
      success: false,
      error: 'NO_NUMBERS available from GrizzlySMS partner inventory.'
    };
  }

  public async renewNumber(request: NumberRenewalRequest): Promise<NumberRenewalResult> {
    const now = new Date();
    const newExp = new Date(now.getTime() + (request.durationDays || 30) * 86400000);
    return {
      success: true,
      newExpirationDate: newExp.toISOString(),
      providerRenewalRef: `grizzly_renew_${Date.now()}`
    };
  }

  public async releaseNumber(request: NumberReleaseRequest): Promise<NumberReleaseResult> {
    try {
      const adapter = new GrizzlyFinishActivationAdapter();
      const activationId = parseInt(request.providerNumberRef, 10);
      if (!isNaN(activationId)) {
        await adapter.finishActivation({
          activationId,
          statusCode: 8,
          notes: 'Released from customer portal'
        });
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async handleWebhook(payload: any, _headers?: Record<string, any>): Promise<ProviderWebhookResult> {
    if (payload?.action === 'GET_SERVICES') {
      const res = GrizzlyPartnerProtocolService.handleGetServices(payload);
      return { processed: true, eventType: 'GET_SERVICES', data: res };
    }
    if (payload?.action === 'GET_NUMBER') {
      const res = GrizzlyPartnerProtocolService.handleGetNumber(payload);
      return { processed: true, eventType: 'GET_NUMBER', data: res };
    }
    return { processed: false, eventType: 'UNKNOWN', error: 'Unrecognized GrizzlySMS partner action' };
  }
}
