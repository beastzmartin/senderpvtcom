import crypto from 'crypto';
import { getDatabase } from '../../../db/database.js';
import {
  ProviderAdapter,
  ProviderActorInfo,
  ProviderRunOptions,
  ProviderRunResult,
  ProviderRunDetails,
  ProviderDatasetResult
} from './ProviderAdapter.js';

export class ApifyAdapter implements ProviderAdapter {
  public readonly providerType = 'apify';
  private baseUrl = 'https://api.apify.com/v2';
  private apiToken: string;

  constructor(token?: string) {
    this.apiToken = token || '';
  }

  public getToken(tokenOverride?: string): string {
    if (tokenOverride && tokenOverride.trim()) {
      return tokenOverride.trim();
    }
    if (this.apiToken && this.apiToken.trim()) {
      return this.apiToken.trim();
    }
    try {
      const db = getDatabase();
      const row = db.prepare("SELECT value FROM marketplace_settings WHERE key = 'apify_api_token'").get() as any;
      if (row?.value && row.value.trim()) {
        return row.value.trim();
      }
    } catch {}
    const envToken = process.env.APIFY_API_TOKEN || '';
    if (!envToken) {
      throw new Error('PROVIDER_AUTH_MISSING: Upstream data provider token is not configured. Please add your Apify API Token in Admin Settings.');
    }
    return envToken.trim();
  }

  public getWebhookSecret(): string {
    try {
      const db = getDatabase();
      const row = db.prepare("SELECT value FROM marketplace_settings WHERE key = 'apify_webhook_secret'").get() as any;
      if (row?.value && row.value.trim()) {
        return row.value.trim();
      }
    } catch {}
    return process.env.APIFY_WEBHOOK_SECRET || process.env.MARKETPLACE_WEBHOOK_SECRET || '';
  }

  /**
   * Test live Apify API token validity by fetching user profile
   */
  public async testConnection(tokenOverride?: string): Promise<{ success: boolean; username?: string; email?: string; error?: string }> {
    try {
      const token = this.getToken(tokenOverride);
      const res = await fetch(`${this.baseUrl}/users/me?token=${token}`, {
        headers: { Accept: 'application/json' }
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as any;
        return {
          success: false,
          error: body?.error?.message || `HTTP ${res.status}: Invalid Apify API Token`
        };
      }
      const data = (await res.json()) as any;
      return {
        success: true,
        username: data?.data?.username || 'Verified User',
        email: data?.data?.email
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Network connection failed'
      };
    }
  }

  /**
   * Safe fetch with error wrapping to ensure zero provider leaks in thrown exceptions
   */
  private async safeRequest<T>(
    endpoint: string,
    options: RequestInit = {},
    isIdempotentGet: boolean = false
  ): Promise<T> {
    const token = this.getToken();
    const url = new URL(`${this.baseUrl}${endpoint}`);
    url.searchParams.set('token', token);

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {})
    };

    let attempt = 0;
    const maxRetries = isIdempotentGet ? 2 : 0;

    while (attempt <= maxRetries) {
      try {
        const res = await fetch(url.toString(), {
          ...options,
          headers
        });

        if (!res.ok) {
          const status = res.status;
          let bodyText = '';
          try {
            bodyText = await res.text();
          } catch {}

          if (status === 401 || status === 403) {
            throw new Error('PROVIDER_UNAVAILABLE: Authentication failed with upstream extraction provider.');
          }
          if (status === 404) {
            throw new Error('PROVIDER_RESOURCE_NOT_FOUND: The requested extractor specification or dataset could not be found.');
          }
          if (status === 429) {
            throw new Error('PROVIDER_RATE_LIMIT: Upstream provider capacity threshold reached. Please retry shortly.');
          }
          if (status >= 400 && status < 500) {
            throw new Error(`INVALID_INPUT: Provided parameters rejected by extraction engine. (${status})`);
          }
          throw new Error(`PROVIDER_UNAVAILABLE: Upstream extraction service encountered a temporary error (${status}).`);
        }

        const data = await res.json();
        return data as T;
      } catch (err: any) {
        attempt++;
        if (attempt > maxRetries || !isIdempotentGet) {
          // Sanitize message to strip any upstream domains or tokens
          const safeMessage = (err.message || 'Unknown network error')
            .replace(/https?:\/\/[^\s]+/gi, '[redacted-url]')
            .replace(/apify/gi, 'provider')
            .replace(/actor/gi, 'extractor');
          throw new Error(safeMessage);
        }
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }

    throw new Error('PROVIDER_UNAVAILABLE: Maximum retry attempts exceeded.');
  }

  /**
   * Fetch Actor info & input schema for Admin "Import from Provider ID"
   */
  public async getActorInfo(actorId: string): Promise<ProviderActorInfo> {
    let rawClean = actorId.trim()
      .replace(/^https?:\/\/(?:www\.)?(?:console\.)?apify\.com\/(?:actors\/)?/i, '')
      .replace(/\/+$/, '');
    if (rawClean.includes('/') && !rawClean.includes('~')) {
      rawClean = rawClean.replace(/\//g, '~');
    }
    const cleanId = encodeURIComponent(rawClean);
    const response = await this.safeRequest<any>(`/acts/${cleanId}`, { method: 'GET' }, true);
    const data = response.data || {};

    let pricingModel = 'free_usage_based';
    let usdPer1000Items: number | undefined;
    let usdPerRunStart: number | undefined;
    let monthlyRentalUsd: number | undefined;
    let pricingPerEvent: any = undefined;

    const pricingInfos = data.pricingInfos || [];
    if (pricingInfos.length > 0) {
      const activePricing = pricingInfos[pricingInfos.length - 1];
      pricingModel = activePricing.pricingModel || 'free_usage_based';
      if (activePricing.pricePerUnitUsd) {
        usdPer1000Items = Number(activePricing.pricePerUnitUsd) * 1000;
      }
      if (activePricing.pricePerRunUsd) {
        usdPerRunStart = Number(activePricing.pricePerRunUsd);
      }
      if (activePricing.monthlyRentalUsd || activePricing.priceUsd) {
        monthlyRentalUsd = Number(activePricing.monthlyRentalUsd || activePricing.priceUsd);
      }
      // Check event tiered pricing (e.g. pay per lead or pay per dataset item)
      pricingPerEvent = activePricing.pricingPerEvent;
      const events = activePricing.pricingPerEvent?.actorChargeEvents;
      if (events) {
        for (const [evtKey, evtVal] of Object.entries(events as Record<string, any>)) {
          if (evtVal.isPrimaryEvent || evtKey.includes('lead') || evtKey.includes('store') || evtKey.includes('item')) {
            const tiered = evtVal.eventTieredPricingUsd?.FREE?.tieredEventPriceUsd || evtVal.eventPriceUsd;
            if (tiered) {
              usdPer1000Items = Number(tiered) * 1000;
            }
          }
        }
      }
    }

    // Try fetching the input schema, dataset schema, actor definition, readme from latest build or versions
    let inputSchema: any = undefined;
    let datasetSchema: any = undefined;
    let actorDefinition: any = undefined;
    let readme: string | undefined = undefined;
    let buildNumber = data.taggedBuilds?.latest?.buildNumber;

    if (data.taggedBuilds?.latest?.buildId) {
      try {
        const buildRes = await this.safeRequest<any>(`/actor-builds/${data.taggedBuilds.latest.buildId}`, { method: 'GET' }, true);
        const bData = buildRes?.data || {};
        if (bData.inputSchema) {
          inputSchema = typeof bData.inputSchema === 'string' ? JSON.parse(bData.inputSchema) : bData.inputSchema;
        }
        if (bData.datasetSchema) {
          datasetSchema = typeof bData.datasetSchema === 'string' ? JSON.parse(bData.datasetSchema) : bData.datasetSchema;
        }
        if (bData.actorDefinition) {
          actorDefinition = typeof bData.actorDefinition === 'string' ? JSON.parse(bData.actorDefinition) : bData.actorDefinition;
        }
        if (bData.readme) {
          readme = bData.readme;
        }
      } catch {}
    }

    if (!inputSchema && data.versions && data.versions.length > 0) {
      for (const ver of data.versions) {
        try {
          const versionRes = await this.safeRequest<any>(`/acts/${cleanId}/versions/${ver.versionNumber}`, { method: 'GET' }, true);
          const vData = versionRes?.data || {};
          if (vData.inputSchema) {
            inputSchema = typeof vData.inputSchema === 'string' ? JSON.parse(vData.inputSchema) : vData.inputSchema;
          }
          if (vData.datasetSchema && !datasetSchema) {
            datasetSchema = typeof vData.datasetSchema === 'string' ? JSON.parse(vData.datasetSchema) : vData.datasetSchema;
          }
          if (vData.actorDefinition && !actorDefinition) {
            actorDefinition = typeof vData.actorDefinition === 'string' ? JSON.parse(vData.actorDefinition) : vData.actorDefinition;
          }
          if (vData.readme && !readme) {
            readme = vData.readme;
          }
          if (inputSchema) break;
        } catch {}
      }
    }

    if (!readme) {
      try {
        const readmeRes = await this.safeRequest<any>(`/acts/${cleanId}/readme`, { method: 'GET' }, true);
        if (typeof readmeRes === 'string') {
          readme = readmeRes;
        } else if (readmeRes?.data?.readme) {
          readme = readmeRes.data.readme;
        }
      } catch {}
    }

    return {
      actorId: data.id || actorId,
      name: data.name || actorId,
      username: data.username,
      title: data.title || data.name,
      description: data.description || '',
      pricingModel,
      pricingInfo: {
        model: (pricingModel as any) || 'free_usage_based',
        usdPer1000Items,
        usdPerRunStart,
        monthlyRentalUsd,
        pricingPerEvent,
        rawPricingInfos: pricingInfos
      },
      inputSchema,
      datasetSchema,
      actorDefinition,
      readme,
      categories: data.categories || [],
      stats: data.stats || {},
      permissions: data.permissions || (data.isPublic ? 'limited' : undefined),
      mode: data.mode || (data.actorStandbyConfig ? 'standby' : 'normal'),
      buildNumber,
      defaultMemoryMbytes: data.defaultRunOptions?.memoryMbytes || 1024,
      defaultTimeoutSecs: data.defaultRunOptions?.timeoutSecs || 3600
    };
  }

  /**
   * Start an asynchronous run with guaranteed maxItems and maxTotalChargeUsd caps
   */
  public async startRun(
    actorId: string,
    input: Record<string, any>,
    options?: ProviderRunOptions
  ): Promise<ProviderRunResult> {
    const cleanId = encodeURIComponent(actorId.trim().replace(/^https?:\/\/[^/]+\//, ''));
    const queryParams = new URLSearchParams();

    if (options?.build) queryParams.set('build', options.build);
    if (options?.memoryMbytes) queryParams.set('memory', String(options.memoryMbytes));
    if (options?.timeoutSecs) queryParams.set('timeout', String(options.timeoutSecs));

    // Hard bounds: enforce cost and items ceilings to protect our margins
    if (options?.maxItems && options.maxItems > 0) {
      queryParams.set('maxItems', String(options.maxItems));
    }
    if (options?.maxTotalChargeUsd && options.maxTotalChargeUsd > 0) {
      // Cap max total charge to avoid runaway charges
      queryParams.set('maxTotalChargeUsd', options.maxTotalChargeUsd.toFixed(4));
    }
    if (options?.webhookUrl) {
      queryParams.set('webhooks', JSON.stringify([
        {
          eventTypes: ['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED', 'ACTOR.RUN.ABORTED', 'ACTOR.RUN.TIMED_OUT'],
          requestUrl: options.webhookUrl
        }
      ]));
    }

    const endpoint = `/acts/${cleanId}/runs?${queryParams.toString()}`;
    const response = await this.safeRequest<any>(endpoint, {
      method: 'POST',
      body: JSON.stringify(input || {})
    });

    const run = response.data || {};
    return {
      runId: run.id,
      datasetId: run.defaultDatasetId,
      status: run.status || 'RUNNING',
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      usageTotalUsd: Number(run.usageTotalUsd || 0)
    };
  }

  /**
   * Query details and cost metrics of an active or finished run
   */
  public async getRun(runId: string): Promise<ProviderRunDetails> {
    const cleanRunId = encodeURIComponent(runId.trim());
    const response = await this.safeRequest<any>(`/actor-runs/${cleanRunId}`, { method: 'GET' }, true);
    const run = response.data || {};

    return {
      runId: run.id,
      status: run.status || 'RUNNING',
      datasetId: run.defaultDatasetId,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      usageTotalUsd: Number(run.usageTotalUsd || 0),
      exitCode: run.exitCode,
      statusMessage: run.statusMessage
    };
  }

  /**
   * Abort an executing run
   */
  public async abortRun(runId: string): Promise<boolean> {
    const cleanRunId = encodeURIComponent(runId.trim());
    try {
      await this.safeRequest<any>(`/actor-runs/${cleanRunId}/abort`, { method: 'POST' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Fetch paginated results from the provider dataset
   */
  public async fetchResults(
    datasetId: string,
    options?: { offset?: number; limit?: number }
  ): Promise<ProviderDatasetResult> {
    const cleanDatasetId = encodeURIComponent(datasetId.trim());
    const offset = Math.max(0, options?.offset || 0);
    const limit = Math.min(1000, options?.limit || 200);

    const token = this.getToken();
    const url = new URL(`${this.baseUrl}/datasets/${cleanDatasetId}/items`);
    url.searchParams.set('token', token);
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('clean', 'true');

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });

    if (!res.ok) {
      throw new Error(`PROVIDER_UNAVAILABLE: Failed to download dataset items (${res.status})`);
    }

    const items = (await res.json()) as Record<string, any>[];
    const totalHeader = res.headers.get('x-apify-pagination-total');
    const total = totalHeader ? parseInt(totalHeader, 10) : items.length + offset;

    return {
      items: Array.isArray(items) ? items : [],
      total: isNaN(total) ? items.length : total,
      offset,
      limit
    };
  }

  /**
   * Fetch list of keys/files in a key-value store
   */
  public async fetchKeyValueRecords(
    keyValueStoreId: string
  ): Promise<Array<{ key: string; size?: number; contentType?: string }>> {
    const cleanId = encodeURIComponent(keyValueStoreId.trim());
    try {
      const res = await this.safeRequest<any>(`/key-value-stores/${cleanId}/keys`, { method: 'GET' }, true);
      const items = res?.data?.items || [];
      return items.map((it: any) => ({
        key: it.key,
        size: it.size,
        contentType: it.contentType
      }));
    } catch {
      return [];
    }
  }

  /**
   * Fetch a single binary/text file from key-value store
   */
  public async fetchKeyValueRecordBuffer(
    keyValueStoreId: string,
    recordKey: string
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    const cleanStoreId = encodeURIComponent(keyValueStoreId.trim());
    const cleanKey = encodeURIComponent(recordKey.trim());
    const token = this.getToken();
    const url = new URL(`${this.baseUrl}/key-value-stores/${cleanStoreId}/records/${cleanKey}`);
    url.searchParams.set('token', token);

    try {
      const res = await fetch(url.toString());
      if (!res.ok) return null;
      const arrayBuffer = await res.arrayBuffer();
      const contentType = res.headers.get('content-type') || 'application/octet-stream';
      return {
        buffer: Buffer.from(arrayBuffer),
        contentType
      };
    } catch {
      return null;
    }
  }

  /**
   * Verify inbound webhook secret or signature
   */
  public verifyWebhook(secretOrSignature: string, rawPayload: string): boolean {
    const configuredSecret = this.getWebhookSecret();
    if (!configuredSecret) return true; // If no secret configured, accept in development

    if (secretOrSignature === configuredSecret) {
      return true;
    }

    try {
      // Optional HMAC sha256 verification
      const expectedHmac = crypto.createHmac('sha256', configuredSecret).update(rawPayload).digest('hex');
      return crypto.timingSafeEqual(Buffer.from(secretOrSignature), Buffer.from(expectedHmac));
    } catch {
      return false;
    }
  }
}

