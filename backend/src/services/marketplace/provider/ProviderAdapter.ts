/**
 * Provider Adapter Interface
 * Abstract provider contract for Data Extraction Marketplace
 */

export interface ProviderActorInfo {
  actorId: string;
  name: string;
  title?: string;
  description?: string;
  pricingModel?: string;
  pricingInfo?: {
    model: 'pay_per_result' | 'pay_per_event' | 'rental' | 'free_usage_based';
    usdPer1000Items?: number;
    usdPerRunStart?: number;
    monthlyRentalUsd?: number;
  };
  inputSchema?: {
    title?: string;
    description?: string;
    type?: string;
    properties?: Record<string, any>;
    required?: string[];
  };
  defaultMemoryMbytes?: number;
  defaultTimeoutSecs?: number;
}

export interface ProviderRunOptions {
  maxItems?: number;
  maxTotalChargeUsd?: number;
  timeoutSecs?: number;
  memoryMbytes?: number;
  build?: string;
  webhookUrl?: string;
}

export interface ProviderRunResult {
  runId: string;
  datasetId: string;
  status: 'READY' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED-OUT' | 'ABORTED';
  startedAt?: string;
  finishedAt?: string;
  usageTotalUsd?: number;
}

export interface ProviderRunDetails {
  runId: string;
  status: 'READY' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED-OUT' | 'ABORTED';
  datasetId: string;
  startedAt?: string;
  finishedAt?: string;
  usageTotalUsd: number;
  exitCode?: number;
  statusMessage?: string;
}

export interface ProviderDatasetResult {
  items: Record<string, any>[];
  total: number;
  offset: number;
  limit: number;
}

export interface ProviderAdapter {
  readonly providerType: string;

  /**
   * Fetch actor metadata, input schema & pricing model (Admin Import Tool)
   */
  getActorInfo(actorId: string): Promise<ProviderActorInfo>;

  /**
   * Start asynchronous run with safety cost & items bounds
   */
  startRun(
    actorId: string,
    input: Record<string, any>,
    options?: ProviderRunOptions
  ): Promise<ProviderRunResult>;

  /**
   * Get run status and recorded usage cost
   */
  getRun(runId: string): Promise<ProviderRunDetails>;

  /**
   * Abort an active run
   */
  abortRun(runId: string): Promise<boolean>;

  /**
   * Fetch paginated dataset results
   */
  fetchResults(
    datasetId: string,
    options?: { offset?: number; limit?: number }
  ): Promise<ProviderDatasetResult>;

  /**
   * Verify inbound webhook authenticity
   */
  verifyWebhook(secretOrSignature: string, rawPayload: string): boolean;
}

