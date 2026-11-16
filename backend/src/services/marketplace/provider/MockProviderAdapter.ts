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
  private fixtures: Map<string, ProviderActorInfo> = new Map();
  private mockFiles: Map<string, Map<string, { buffer: Buffer; contentType: string }>> = new Map();

  constructor() {
    this.registerDefaultFixtures();
  }

  public registerFixture(actorId: string, info: ProviderActorInfo): void {
    this.fixtures.set(actorId.toLowerCase(), info);
  }

  private registerDefaultFixtures(): void {
    // 1. Simple Keyword + PPR
    this.registerFixture('fixture~keyword-ppr', {
      actorId: 'fixture~keyword-ppr',
      name: 'keyword-ppr-scraper',
      title: 'Simple Keyword Lead Scraper',
      description: 'PPR model keyword extraction',
      pricingModel: 'pay_per_result',
      pricingInfo: {
        model: 'pay_per_result',
        usdPer1000Items: 2.0,
        usdPerRunStart: 0.05
      },
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', title: 'Keywords' },
          maxItems: { type: 'integer', title: 'Max Leads', default: 50 }
        },
        required: ['query']
      }
    });

    // 2. Nested/Object-heavy
    this.registerFixture('fixture~nested-objects', {
      actorId: 'fixture~nested-objects',
      name: 'nested-objects-scraper',
      title: 'Nested Config Directory Scraper',
      description: 'Complex nested configuration schemas',
      pricingModel: 'pay_per_result',
      pricingInfo: {
        model: 'pay_per_result',
        usdPer1000Items: 3.5,
        usdPerRunStart: 0.10
      },
      inputSchema: {
        type: 'object',
        properties: {
          searchParams: {
            type: 'object',
            title: 'Search Filters',
            properties: {
              category: { type: 'string', title: 'Category' },
              minRevenue: { type: 'number', title: 'Min Revenue' }
            }
          },
          targetLocation: { type: 'string', title: 'Location' }
        }
      }
    });

    // 3. URL-list heavy
    this.registerFixture('fixture~url-list', {
      actorId: 'fixture~url-list',
      name: 'url-list-scraper',
      title: 'Bulk URL Content Scraper',
      description: 'Scrapes lists of starting URLs',
      pricingModel: 'pay_per_result',
      pricingInfo: {
        model: 'pay_per_result',
        usdPer1000Items: 4.0
      },
      inputSchema: {
        type: 'object',
        properties: {
          startUrls: {
            type: 'array',
            title: 'Start URLs',
            editor: 'requestListSources',
            items: { type: 'string' }
          }
        },
        required: ['startUrls']
      }
    });

    // 4. PPE with Multiple Events
    this.registerFixture('fixture~ppe-events', {
      actorId: 'fixture~ppe-events',
      name: 'ppe-event-extractor',
      title: 'Multi-Event Pay-Per-Event Scraper',
      description: 'Charges per search query and per enriched profile item',
      pricingModel: 'pay_per_event',
      pricingInfo: {
        model: 'pay_per_event',
        usdPerRunStart: 0.20,
        usdPer1000Items: 5.0,
        pricingPerEvent: {
          actorChargeEvents: {
            search_query: { eventTitle: 'Search Query', eventPriceUsd: 0.05 },
            enriched_item: { eventTitle: 'Enriched Contact', eventPriceUsd: 0.005, isPrimaryEvent: true }
          }
        }
      },
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', title: 'Search Query' },
          enrichEmails: { type: 'boolean', title: 'Enrich Emails', default: true }
        }
      }
    });

    // 5. Rental / Subscription Actor
    this.registerFixture('fixture~rental', {
      actorId: 'fixture~rental',
      name: 'rental-actor',
      title: 'Enterprise Dedicated Extractor (Rental)',
      description: 'Monthly flat-rate rental actor with zero per-result fees',
      pricingModel: 'rental',
      pricingInfo: {
        model: 'rental',
        monthlyRentalUsd: 49.0
      },
      inputSchema: {
        type: 'object',
        properties: {
          targetDomain: { type: 'string', title: 'Target Domain' }
        }
      }
    });

    // 6. Files-Only Output (Key-Value Store screenshots & PDFs)
    this.registerFixture('fixture~files-only', {
      actorId: 'fixture~files-only',
      name: 'website-screenshot-pdf-generator',
      title: 'Website Screenshot & PDF Archive Extractor',
      description: 'Outputs binary screenshot images and PDF reports stored in key-value store',
      pricingModel: 'pay_per_result',
      pricingInfo: {
        model: 'pay_per_result',
        usdPer1000Items: 10.0
      },
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', title: 'Page URL' },
          format: { type: 'string', enum: ['png', 'pdf'], title: 'File Format' }
        }
      },
      actorDefinition: {
        storages: {
          keyValueStore: {
            collections: [
              { keyPrefix: 'screenshot-', contentTypes: ['image/png', 'application/pdf'] }
            ]
          }
        }
      }
    });

    // 7. Multi Dataset-Views + Output Schema
    this.registerFixture('fixture~multi-views', {
      actorId: 'fixture~multi-views',
      name: 'multi-views-scraper',
      title: 'Omnichannel Store Intelligence',
      description: 'Provides multiple dataset views and output properties',
      pricingModel: 'pay_per_result',
      pricingInfo: {
        model: 'pay_per_result',
        usdPer1000Items: 2.5
      },
      inputSchema: {
        type: 'object',
        properties: {
          industry: { type: 'string', title: 'Industry' }
        }
      },
      datasetSchema: {
        views: [
          {
            title: 'Overview View',
            transformation: { fields: ['companyName', 'websiteUrl', 'contactEmail'] }
          },
          {
            title: 'Social & Marketing View',
            transformation: { fields: ['companyName', 'linkedinUrl', 'phoneNumber'] }
          }
        ]
      }
    });

    // 8. Custom Code + Credentials + Proxy + Unknown-type inputs
    this.registerFixture('fixture~code-credentials-proxy', {
      actorId: 'fixture~code-credentials-proxy',
      name: 'raw-eval-crawler',
      title: 'Developer Custom Evaluator Crawler',
      description: 'High-risk crawler exposing pageFunction, cookies, and proxy configuration',
      pricingModel: 'free_usage_based',
      pricingInfo: {
        model: 'free_usage_based',
        usdPer1000Items: 1.0
      },
      inputSchema: {
        type: 'object',
        properties: {
          pageFunction: { type: 'string', title: 'Page Function Code', editor: 'javascript' },
          loginCookies: { type: 'string', title: 'Session Cookies', isSecret: true },
          proxyConfiguration: { type: 'object', title: 'Proxy Settings' },
          experimentalWidget: { type: 'custom_widget_unknown', title: 'Custom Unknown' }
        }
      }
    });

    // 9. Full-Permission Actor
    this.registerFixture('fixture~full-permission', {
      actorId: 'fixture~full-permission',
      name: 'account-backup-manager',
      title: 'Account Master Backup Extractor',
      description: 'Requests full account permissions across the provider',
      permissions: 'full',
      pricingModel: 'free_usage_based',
      pricingInfo: {
        model: 'free_usage_based',
        usdPer1000Items: 1.0
      },
      inputSchema: {
        type: 'object',
        properties: {
          backupName: { type: 'string', title: 'Backup Name' }
        }
      }
    });

    // 10. Standby-Mode Actor
    this.registerFixture('fixture~standby-mode', {
      actorId: 'fixture~standby-mode',
      name: 'streaming-standby-server',
      title: 'Live HTTP Standby Streamer',
      description: 'Persistent HTTP standby container actor',
      mode: 'standby',
      pricingModel: 'free_usage_based',
      pricingInfo: {
        model: 'free_usage_based',
        usdPer1000Items: 1.0
      },
      inputSchema: {
        type: 'object',
        properties: {
          streamChannel: { type: 'string', title: 'Channel' }
        }
      }
    });
  }

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
    const clean = (actorId || '').toLowerCase().trim();
    if (this.fixtures.has(clean)) {
      return this.fixtures.get(clean)!;
    }

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

  public async fetchKeyValueRecords(
    _keyValueStoreId: string
  ): Promise<Array<{ key: string; size?: number; contentType?: string }>> {
    return [
      { key: 'screenshot-full.png', size: 102400, contentType: 'image/png' },
      { key: 'report-summary.pdf', size: 204800, contentType: 'application/pdf' },
      { key: 'page-archive.zip', size: 512000, contentType: 'application/zip' }
    ];
  }

  public async fetchKeyValueRecordBuffer(
    _keyValueStoreId: string,
    recordKey: string
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    const dummy = Buffer.from(`MOCK FILE CONTENT FOR ${recordKey}`);
    const contentType = recordKey.endsWith('.pdf')
      ? 'application/pdf'
      : recordKey.endsWith('.png')
        ? 'image/png'
        : 'application/octet-stream';

    return {
      buffer: dummy,
      contentType
    };
  }

  public verifyWebhook(_secretOrSignature: string, _rawPayload: string): boolean {
    return true;
  }

  public async deleteDataset(_datasetId: string): Promise<boolean> {
    return true;
  }

  public async deleteRun(_runId: string): Promise<boolean> {
    return true;
  }

  public async deleteKeyValueStore(_keyValueStoreId: string): Promise<boolean> {
    return true;
  }
}

