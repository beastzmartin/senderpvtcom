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
 * Standardized Virtual Number Provider Adapter Interface
 * All future real telecom provider integrations must implement this interface.
 * DO NOT invent specific vendor endpoints or parameters here.
 */
export interface IVirtualNumberProvider {
  /**
   * Unique provider system identifier (slug)
   */
  readonly providerId: string;

  /**
   * Human-readable provider name
   */
  readonly name: string;

  /**
   * Whether this provider instance is a sandbox mock (for testing/development)
   */
  readonly isMock: boolean;

  /**
   * Initialize and validate credentials
   */
  initialize(credentials: Record<string, any>, config?: Record<string, any>): Promise<boolean>;

  /**
   * Check connection health with provider API
   */
  healthCheck(): Promise<{ healthy: boolean; latencyMs?: number; message?: string }>;

  /**
   * Fetch list of countries supported by this provider
   */
  listCountries(): Promise<ProviderCountry[]>;

  /**
   * Search for available virtual numbers from provider inventory
   */
  searchAvailableNumbers(filter: {
    countryCode: string;
    numberType?: string;
    capabilities?: string[];
    limit?: number;
  }): Promise<ProviderNumberItem[]>;

  /**
   * Allocate / purchase a virtual number for a customer
   */
  allocateNumber(request: NumberAllocationRequest): Promise<NumberAllocationResult>;

  /**
   * Renew an active virtual number rental
   */
  renewNumber(request: NumberRenewalRequest): Promise<NumberRenewalResult>;

  /**
   * Cancel / release a virtual number back to the pool
   */
  releaseNumber(request: NumberReleaseRequest): Promise<NumberReleaseResult>;

  /**
   * Retrieve inbound SMS messages for a given virtual number (if supported by provider)
   */
  getInboundMessages?(phoneNumber: string, limit?: number): Promise<IncomingMessageItem[]>;

  /**
   * Retrieve voice call logs for a virtual number (if supported)
   */
  getCallLogs?(phoneNumber: string, limit?: number): Promise<CallRecordItem[]>;

  /**
   * Check provider account balance or credit limits
   */
  checkProviderBalance?(): Promise<{ balance: number; currency: string } | null>;

  /**
   * Handle incoming HTTP webhooks from the provider
   */
  handleWebhook?(payload: any, headers?: Record<string, any>): Promise<ProviderWebhookResult>;
}
