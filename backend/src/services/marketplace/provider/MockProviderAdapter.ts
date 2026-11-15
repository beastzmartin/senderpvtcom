import crypto from 'crypto';
import {
  ProviderAdapter,
  ProviderActorInfo,
  ProviderRunOptions,
  ProviderRunResult,
  ProviderRunDetails,
  ProviderDatasetResult
} from './ProviderAdapter.js';

interface MockRunState {
  runId: string;
  actorId: string;
  datasetId: string;
  status: 'READY' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED-OUT' | 'ABORTED';
  input: Record<string, any>;
  options?: ProviderRunOptions;
  items: Record<string, any>[];
  startedAt: string;
  finishedAt?: string;
  usageTotalUsd: number;
}

export class MockProviderAdapter implements ProviderAdapter {
  public readonly providerType = 'mock';
  private runs: Map<string, MockRunState> = new Map();
  private defaultFailureMode: string | null = null;
  private partialCount: number | null = null;

  /**
   * Test control helpers
   */
  public setFailureMode(mode: 'FAILED' | 'TIMED-OUT' | 'NO_RESULTS' | null): void {
    this.defaultFailureMode = mode;
  }

  public setPartialResultCount(count: number | null): void {
    this.partialCount = count;
  }

  public async getActorInfo(actorId: string): Promise<ProviderActorInfo> {
    return {
      actorId: actorId || 'internal~b2b-mock-extractor',
      name: 'b2b-company-intelligence-extractor',
      title: 'B2B Company Intelligence & Directory Extractor',
      description: 'Mock high-fidelity business intelligence extractor for sandbox testing',
      pricingModel: 'pay_per_result',
      pricingInfo: {
        model: 'pay_per_result',
        usdPer1000Items: 2.50,
        usdPerRunStart: 0.05
      },
      inputSchema: {
        title: 'Input Schema',
        type: 'object',
        properties: {
          query: { type: 'string', title: 'Target Industry' },
          location: { type: 'string', title: 'Location' },
          requireEmail: { type: 'boolean', title: 'Require Email' }
        },
        required: ['query']
      },
      defaultMemoryMbytes: 1024,
      defaultTimeoutSecs: 1800
    };
  }

  public async startRun(
    actorId: string,
    input: Record<string, any>,
    options?: ProviderRunOptions
  ): Promise<ProviderRunResult> {
    const runId = `mock_run_${crypto.randomUUID().slice(0, 8)}`;
    const datasetId = `mock_ds_${crypto.randomUUID().slice(0, 8)}`;
    const requestedCount = options?.maxItems || 25;
    const countToGenerate = this.partialCount !== null
      ? this.partialCount
      : this.defaultFailureMode === 'NO_RESULTS'
        ? 0
        : requestedCount;

    const items: Record<string, any>[] = [];
    for (let i = 1; i <= countToGenerate; i++) {
      items.push({
        companyName: `Apex Enterprise Solutions #${i}`,
        websiteUrl: `https://apexsolutions-${i}.example.com`,
        contactEmail: `contact@apexsolutions-${i}.example.com`,
        phoneNumber: `+1-555-01${(i % 90 + 10).toString()}`,
        industrySector: input.query || 'Software & Technology',
        hqLocation: input.location || 'San Francisco, CA',
        linkedinUrl: `https://linkedin.com/company/apex-solutions-${i}`,
        _internalId: `int_${i}`,
        actorExecutionId: runId,
        provider_debug_info: 'test-metadata'
      });
    }

    const costPerItemUsd = 0.0025; // $2.50 / 1000
    const usageTotalUsd = Number((items.length * costPerItemUsd + 0.05).toFixed(4));
    const nowIso = new Date().toISOString();

    const runState: MockRunState = {
      runId,
      actorId,
      datasetId,
      status: this.defaultFailureMode === 'FAILED' ? 'FAILED' : 'SUCCEEDED',
      input,
      options,
      items,
      startedAt: nowIso,
      finishedAt: nowIso,
      usageTotalUsd
    };

    this.runs.set(runId, runState);

    return {
      runId,
      datasetId,
      status: runState.status,
      startedAt: nowIso,
      finishedAt: nowIso,
      usageTotalUsd
    };
  }

  public async getRun(runId: string): Promise<ProviderRunDetails> {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error('PROVIDER_RESOURCE_NOT_FOUND: Run not found in mock store.');
    }

    return {
      runId: run.runId,
      status: run.status,
      datasetId: run.datasetId,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      usageTotalUsd: run.usageTotalUsd,
      statusMessage: run.status === 'FAILED' ? 'Mock simulated execution failure' : undefined
    };
  }

  public async abortRun(runId: string): Promise<boolean> {
    const run = this.runs.get(runId);
    if (run) {
      run.status = 'ABORTED';
      run.finishedAt = new Date().toISOString();
      return true;
    }
    return false;
  }

  public async fetchResults(
    datasetId: string,
    options?: { offset?: number; limit?: number }
  ): Promise<ProviderDatasetResult> {
    // Locate run by datasetId
    let targetItems: Record<string, any>[] = [];
    for (const run of this.runs.values()) {
      if (run.datasetId === datasetId) {
        targetItems = run.items;
        break;
      }
    }

    const offset = options?.offset || 0;
    const limit = options?.limit || 100;
    const slice = targetItems.slice(offset, offset + limit);

    return {
      items: slice,
      total: targetItems.length,
      offset,
      limit
    };
  }

  public verifyWebhook(_secretOrSignature: string, _rawPayload: string): boolean {
    return true;
  }
}

