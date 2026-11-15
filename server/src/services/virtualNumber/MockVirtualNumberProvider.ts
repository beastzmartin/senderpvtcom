import crypto from 'crypto';
import { IVirtualNumberProvider } from './IVirtualNumberProvider.js';
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
  CallRecordItem,
  ProviderWebhookResult
} from './types.js';

/**
 * Built-in Sandbox Mock Provider Adapter
 * For local development, integration validation, and automated testing ONLY.
 * Will be complemented by real telecom provider adapters upon receiving provider API documentation.
 */
export class MockVirtualNumberProvider implements IVirtualNumberProvider {
  public readonly providerId: string = 'global-telecom-sandbox';
  public readonly name: string = 'Global Telecom Gateway (Sandbox)';
  public readonly isMock: boolean = true;

  private credentials: Record<string, any> = {};
  private activeAllocations: Map<string, { phone: string; expiresAt: Date }> = new Map();

  public async initialize(credentials: Record<string, any>): Promise<boolean> {
    this.credentials = credentials;
    return true;
  }

  public async healthCheck(): Promise<{ healthy: boolean; latencyMs?: number; message?: string }> {
    return {
      healthy: true,
      latencyMs: 18,
      message: 'Sandbox provider responsive.'
    };
  }

  public async listCountries(): Promise<ProviderCountry[]> {
    return [
      { isoCode: 'US', name: 'United States', dialCode: '+1', flagEmoji: '🇺🇸', supportedCapabilities: ['sms', 'voice', 'whatsapp'] },
      { isoCode: 'GB', name: 'United Kingdom', dialCode: '+44', flagEmoji: '🇬🇧', supportedCapabilities: ['sms', 'voice', 'whatsapp'] },
      { isoCode: 'CA', name: 'Canada', dialCode: '+1', flagEmoji: '🇨🇦', supportedCapabilities: ['sms', 'voice'] },
      { isoCode: 'IN', name: 'India', dialCode: '+91', flagEmoji: '🇮🇳', supportedCapabilities: ['sms'] },
      { isoCode: 'AU', name: 'Australia', dialCode: '+61', flagEmoji: '🇦🇺', supportedCapabilities: ['sms', 'voice'] },
      { isoCode: 'DE', name: 'Germany', dialCode: '+49', flagEmoji: '🇩🇪', supportedCapabilities: ['sms', 'voice'] }
    ];
  }

  public async searchAvailableNumbers(filter: {
    countryCode: string;
    numberType?: string;
    capabilities?: string[];
    limit?: number;
  }): Promise<ProviderNumberItem[]> {
    const limit = filter.limit || 10;
    const items: ProviderNumberItem[] = [];
    const country = filter.countryCode.toUpperCase();

    const prefixMap: Record<string, string> = {
      US: '+1202555',
      GB: '+447911',
      CA: '+1416555',
      IN: '+9198765',
      AU: '+614123',
      DE: '+491512'
    };

    const basePrefix = prefixMap[country] || '+1202555';

    for (let i = 0; i < limit; i++) {
      const suffix = Math.floor(1000 + Math.random() * 9000);
      const phone = `${basePrefix}${suffix}`;
      const isWa = country === 'US' || country === 'GB';

      items.push({
        phoneNumber: phone,
        countryCode: country,
        numberType: 'mobile',
        capabilities: isWa ? ['sms', 'voice', 'whatsapp'] : ['sms', 'voice'],
        whatsappCompatible: isWa,
        otpCompatible: true,
        baseCost: country === 'GB' ? 120.0 : (country === 'US' ? 80.0 : 95.0),
        activationFee: 20.0,
        monthlyPrice: country === 'GB' ? 155.0 : 110.0,
        renewalPrice: country === 'GB' ? 140.0 : 100.0,
        providerRef: `mock_ref_${crypto.randomBytes(4).toString('hex')}`
      });
    }

    return items;
  }

  public async allocateNumber(request: NumberAllocationRequest): Promise<NumberAllocationResult> {
    const durationDays = request.durationDays || 30;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
    const renewalDate = new Date(expiresAt.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days before expiration

    const allocatedPhone = request.specificNumber || `+1202555${Math.floor(1000 + Math.random() * 9000)}`;
    const providerRef = `mock_alloc_${crypto.randomUUID().slice(0, 8)}`;

    this.activeAllocations.set(allocatedPhone, {
      phone: allocatedPhone,
      expiresAt
    });

    return {
      success: true,
      allocatedNumber: allocatedPhone,
      providerNumberRef: providerRef,
      activationDate: now.toISOString(),
      expirationDate: expiresAt.toISOString(),
      renewalDate: renewalDate.toISOString(),
      metadata: { sandbox: true }
    };
  }

  public async renewNumber(request: NumberRenewalRequest): Promise<NumberRenewalResult> {
    const durationDays = request.durationDays || 30;
    const now = new Date();
    const newExpires = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    return {
      success: true,
      newExpirationDate: newExpires.toISOString(),
      providerRenewalRef: `mock_ren_${crypto.randomUUID().slice(0, 8)}`
    };
  }

  public async releaseNumber(request: NumberReleaseRequest): Promise<NumberReleaseResult> {
    this.activeAllocations.delete(request.phoneNumber);
    return {
      success: true
    };
  }

  public async getInboundMessages(phoneNumber: string): Promise<IncomingMessageItem[]> {
    return [
      {
        messageId: `msg_${crypto.randomUUID().slice(0, 8)}`,
        toPhoneNumber: phoneNumber,
        fromSender: '+1234567890',
        messageText: 'Welcome! Your verification code is 492015. Valid for 10 minutes.',
        receivedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString()
      }
    ];
  }

  public async getCallLogs(phoneNumber: string): Promise<CallRecordItem[]> {
    return [
      {
        callId: `call_${crypto.randomUUID().slice(0, 8)}`,
        virtualNumber: phoneNumber,
        callerNumber: '+1987654321',
        direction: 'inbound',
        durationSeconds: 42,
        callStatus: 'completed',
        feeCharged: 1.20,
        startedAt: new Date(Date.now() - 3600 * 1000).toISOString()
      }
    ];
  }

  public async checkProviderBalance(): Promise<{ balance: number; currency: string } | null> {
    return {
      balance: 50000.0,
      currency: 'INR'
    };
  }

  public async handleWebhook(payload: any): Promise<ProviderWebhookResult> {
    return {
      processed: true,
      eventType: payload?.type || 'mock_event',
      data: payload
    };
  }
}

