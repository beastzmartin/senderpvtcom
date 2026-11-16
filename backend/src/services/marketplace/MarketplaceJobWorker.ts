import crypto from 'crypto';
import { getDatabase } from '../../db/database.js';
import { getSocketIO } from '../../socket/socketManager.js';
import { ProductDefinition, MarketplaceJobRecord } from '../../types/marketplace.js';
import { ProviderRegistry } from './provider/ProviderRegistry.js';
import { MarketplaceChargingService } from './MarketplaceChargingService.js';
import { WhiteLabelSanitizer } from './WhiteLabelSanitizer.js';
import { MarketplaceCircuitBreakerService } from './MarketplaceCircuitBreakerService.js';
import { MarketplaceFileService } from './MarketplaceFileService.js';
import { MarketplaceProductService } from './MarketplaceProductService.js';
import { CrmExtractorPipelineService } from '../../crm/services/CrmExtractorPipelineService.js';
import { getCrmDb } from '../../crm/db/index.js';

export class MarketplaceJobWorker {
  private static instance: MarketplaceJobWorker | null = null;
  private chargingService: MarketplaceChargingService;
  private tickerInterval: NodeJS.Timeout | null = null;
  private isProcessingBatch: boolean = false;

  private constructor() {
    this.chargingService = MarketplaceChargingService.getInstance();
    this.startBackgroundPoller();
  }

  public static getInstance(): MarketplaceJobWorker {
    if (!MarketplaceJobWorker.instance) {
      MarketplaceJobWorker.instance = new MarketplaceJobWorker();
    }
    return MarketplaceJobWorker.instance;
  }

  /**
   * Background fallback poller for active RUNNING jobs
   */
  private startBackgroundPoller(): void {
    if (this.tickerInterval) return;

    this.tickerInterval = setInterval(async () => {
      if (this.isProcessingBatch) return;
      this.isProcessingBatch = true;
      try {
        await this.pollRunningJobs();
      } catch (err) {
        console.error('[Marketplace Worker] Error during polling tick:', err);
      } finally {
        this.isProcessingBatch = false;
      }
    }, 10000); // 10s check
  }

  /**
   * Process a freshly queued job
   */
  public async processJob(jobId: string): Promise<void> {
    const db = getDatabase();
    const job = db.prepare('SELECT * FROM marketplace_jobs WHERE id = ?').get(jobId) as any;
    if (!job || job.status !== 'QUEUED') return;

    const prodRow = db.prepare('SELECT definition_json FROM extraction_marketplace_products WHERE id = ?').get(job.product_id) as any;
    if (!prodRow) {
      this.chargingService.refundFailedJob(jobId, 'Product specification missing');
      return;
    }

    // Circuit Breaker check
    const cb = MarketplaceCircuitBreakerService.getStatus(job.product_slug);
    if (cb.state === 'OPEN') {
      const err = `CIRCUIT_BREAKER_OPEN: Service temporarily paused for maintenance. ${cb.tripReason || ''}`;
      this.chargingService.refundFailedJob(jobId, err);
      this.emitJobUpdate(job.user_id, jobId, 'FAILED', err);
      return;
    }

    const product: ProductDefinition = JSON.parse(prodRow.definition_json);
    const userInput: Record<string, any> = JSON.parse(job.input_json || '{}');

    // 1. Build provider-facing payload
    const providerInput: Record<string, any> = {};

    // Apply hidden defaults
    if (product.input.hidden_defaults) {
      Object.assign(providerInput, product.input.hidden_defaults);
    }

    // Map input fields to provider keys
    for (const field of product.input.fields) {
      const val = userInput[field.key];
      if (val !== undefined && val !== null) {
        providerInput[field.provider_key] = val;
      }
    }

    // Apply static overrides
    if (product.input.static_overrides) {
      Object.assign(providerInput, product.input.static_overrides);
    }

    // 2. Start provider run with safety caps
    try {
      const adapter = ProviderRegistry.getInstance().getAdapter(product.provider.type);
      const runResult = await adapter.startRun(
        product.provider.actor_id,
        providerInput,
        {
          maxItems: job.requested_items,
          maxTotalChargeUsd: Number((job.provider_cost_usd * 1.5).toFixed(4)), // safety cap
          memoryMbytes: product.limits.memory_mb,
          timeoutSecs: product.limits.timeout_secs,
          build: product.provider.build
        }
      );

      // Update job to RUNNING
      db.prepare(`
        UPDATE marketplace_jobs
        SET status = 'RUNNING',
            provider_run_id = ?,
            provider_dataset_id = ?,
            started_at = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?
      `).run(runResult.runId, runResult.datasetId, jobId);

      this.emitJobUpdate(job.user_id, jobId, 'RUNNING');

      // If provider finished synchronously (e.g. mock adapter or fast run)
      if (['SUCCEEDED', 'FAILED', 'TIMED-OUT', 'ABORTED'].includes(runResult.status)) {
        await this.handleRunCompleted(jobId, runResult.status, runResult.datasetId, runResult.usageTotalUsd || 0);
      }
    } catch (err: any) {
      console.error(`[Marketplace Worker] Failed to start run for job ${jobId}:`, err);
      const safeError = (err.message || 'Failed to start extraction')
        .replace(/https?:\/\/[^\s]+/gi, '[redacted]')
        .replace(/apify/gi, 'provider');

      this.chargingService.refundFailedJob(jobId, safeError);
      this.emitJobUpdate(job.user_id, jobId, 'FAILED', safeError);
    }
  }

  /**
   * Poll active jobs
   */
  public async pollRunningJobs(): Promise<void> {
    const db = getDatabase();
    const runningJobs = db.prepare(`
      SELECT id, user_id, provider_type, provider_run_id, provider_dataset_id
      FROM marketplace_jobs
      WHERE status = 'RUNNING' AND provider_run_id IS NOT NULL
      LIMIT 20
    `).all() as any[];

    for (const job of runningJobs) {
      try {
        const adapter = ProviderRegistry.getInstance().getAdapter(job.provider_type);
        const details = await adapter.getRun(job.provider_run_id);

        if (['SUCCEEDED', 'FAILED', 'TIMED-OUT', 'ABORTED'].includes(details.status)) {
          await this.handleRunCompleted(
            job.id,
            details.status,
            details.datasetId || job.provider_dataset_id,
            details.usageTotalUsd
          );
        }
      } catch (err) {
        console.warn(`[Marketplace Worker] Error polling run ${job.provider_run_id}:`, err);
      }
    }

    // Reconcile and refund stuck orphan jobs (queued > 1 hour without provider run or running > 4 hours)
    try {
      const stuckJobs = db.prepare(`
        SELECT id FROM marketplace_jobs
        WHERE (status = 'QUEUED' AND created_at < datetime('now', '-1 hour'))
           OR (status = 'RUNNING' AND started_at < datetime('now', '-4 hours'))
        LIMIT 10
      `).all() as any[];

      for (const stuck of stuckJobs) {
        this.chargingService.refundFailedJob(stuck.id, 'Extraction run expired and was reconciled automatically.');
      }
    } catch {}
  }

  /**
   * Ingest and process completed provider run
   */
  public async handleRunCompleted(
    jobId: string,
    status: string,
    datasetId?: string,
    usageTotalUsd: number = 0
  ): Promise<void> {
    const db = getDatabase();
    const job = db.prepare('SELECT * FROM marketplace_jobs WHERE id = ?').get(jobId) as any;
    if (!job || ['COMPLETED', 'PARTIAL', 'FAILED', 'ABORTED'].includes(job.status)) {
      return;
    }

    if (status !== 'SUCCEEDED') {
      const errorMsg = status === 'ABORTED'
        ? 'Extraction was aborted.'
        : status === 'TIMED-OUT'
          ? 'Extraction timed out before completing.'
          : 'Extraction failed during execution.';

      MarketplaceCircuitBreakerService.recordFailure(job.product_slug, errorMsg);
      this.chargingService.refundFailedJob(jobId, errorMsg);
      this.emitJobUpdate(job.user_id, jobId, 'FAILED', errorMsg);
      return;
    }

    MarketplaceCircuitBreakerService.recordSuccess(job.product_slug);

    const prodRow = db.prepare('SELECT definition_json FROM extraction_marketplace_products WHERE id = ?').get(job.product_id) as any;
    if (!prodRow) {
      this.chargingService.refundFailedJob(jobId, 'Product definition missing.');
      return;
    }
    const product: ProductDefinition = JSON.parse(prodRow.definition_json);

    // 1. Paginate & fetch all results from provider dataset
    const adapter = ProviderRegistry.getInstance().getAdapter(job.provider_type);
    const targetDatasetId = datasetId || job.provider_dataset_id;
    let fetchedItems: Record<string, any>[] = [];

    if (targetDatasetId) {
      try {
        let offset = 0;
        const limit = 500;
        let hasMore = true;

        while (hasMore && fetchedItems.length < job.requested_items * 2) {
          const res = await adapter.fetchResults(targetDatasetId, { offset, limit });
          if (!res.items || res.items.length === 0) {
            hasMore = false;
            break;
          }
          fetchedItems.push(...res.items);
          offset += res.items.length;
          if (offset >= res.total || res.items.length < limit) {
            hasMore = false;
          }
        }
      } catch (err) {
        console.error(`[Marketplace Worker] Error fetching dataset items for job ${jobId}:`, err);
      }
    }

    // 1.5 Fetch Key-Value Store files (if actor produces files)
    const storedFileRecords: any[] = [];
    if (adapter.fetchKeyValueRecords && adapter.fetchKeyValueRecordBuffer) {
      try {
        const kvStoreId = (adapter as any).getRunKeyValueStoreId?.(job.provider_run_id) || targetDatasetId;
        const kvRecords = await adapter.fetchKeyValueRecords(kvStoreId);
        for (const rec of kvRecords) {
          // Ignore internal system keys
          if (rec.key.startsWith('INPUT') || rec.key.startsWith('OUTPUT') || rec.key.startsWith('__')) {
            continue;
          }
          const bufObj = await adapter.fetchKeyValueRecordBuffer(kvStoreId, rec.key);
          if (bufObj) {
            const savedFile = MarketplaceFileService.getInstance().saveJobFile({
              jobId,
              userId: job.user_id,
              fileName: rec.key,
              buffer: bufObj.buffer,
              contentType: bufObj.contentType || rec.contentType || 'application/octet-stream',
              recordKey: rec.key
            });
            storedFileRecords.push(savedFile);
          }
        }
      } catch (fileErr) {
        console.warn(`[Marketplace Worker] Note: Key-value store file ingestion skipped for ${jobId}:`, fileErr);
      }
    }

    // 2. Transform items: apply item_mapping, drop_fields, sanitize
    const dropSet = new Set(product.output.drop_fields || []);
    const mapping = product.output.item_mapping || [];
    const shouldStripUrls = product.output.sanitize?.strip_provider_urls !== false;

    const transformedItems: Record<string, any>[] = [];

    for (const rawItem of fetchedItems) {
      const item: Record<string, any> = {};

      if (mapping.length > 0) {
        for (const m of mapping) {
          if (m.hidden) continue;
          const val = rawItem[m.from];
          if (val !== undefined) {
            item[m.to] = val;
          }
        }
      } else {
        Object.assign(item, rawItem);
      }

      // Drop disallowed fields
      for (const drop of dropSet) {
        delete item[drop];
      }

      // Sanitize
      const cleanItem = shouldStripUrls ? WhiteLabelSanitizer.sanitizeData(item) : item;
      transformedItems.push(cleanItem);

      if (transformedItems.length >= job.requested_items) {
        break; // Bound to requested count
      }
    }

    // 3. Persist results in our SQLite DB (We own the data)
    const insertResultStmt = db.prepare(`
      INSERT INTO marketplace_job_results (id, job_id, row_index, data_json, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `);

    const saveBatchTx = db.transaction(() => {
      // Clear previous if any
      db.prepare('DELETE FROM marketplace_job_results WHERE job_id = ?').run(jobId);

      for (let idx = 0; idx < transformedItems.length; idx++) {
        insertResultStmt.run(
          `res_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
          jobId,
          idx + 1,
          JSON.stringify(transformedItems[idx])
        );
      }
    });

    saveBatchTx();

    // Calculate runtime seconds
    const startedMs = job.started_at ? new Date(job.started_at).getTime() : Date.now();
    const runtimeSeconds = Math.max(0, Number(((Date.now() - startedMs) / 1000).toFixed(1)));

    db.prepare(`
      UPDATE marketplace_jobs
      SET runtime_seconds = ?,
          output_files_json = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      runtimeSeconds,
      storedFileRecords.length > 0 ? JSON.stringify(storedFileRecords) : null,
      jobId
    );

    // 4. Settle actual charges & release remaining reserve
    const deliveredCount = transformedItems.length;
    this.chargingService.settleJob(jobId, deliveredCount, usageTotalUsd);

    // 5. Auto-flow into CRM List if configured or user's default workspace
    try {
      const inputObj = JSON.parse(job.input_json || '{}');
      const crmListId = inputObj.crm_list_id || inputObj._crm_list_id;
      const targetWorkspaceId = inputObj.crm_workspace_id || inputObj._crm_workspace_id;

      if (transformedItems.length > 0) {
        const crmDb = getCrmDb();
        const ws = targetWorkspaceId
          ? await crmDb.getWorkspace(targetWorkspaceId)
          : await crmDb.getUserDefaultWorkspace(job.user_id);

        if (ws) {
          await CrmExtractorPipelineService.getInstance().ingestExtractorResults(
            ws.id,
            crmListId || null,
            transformedItems,
            `extractor:${job.product_slug}`,
            job.id,
            'update'
          );
        }
      }
    } catch (crmErr) {
      console.warn('[MarketplaceJobWorker] Failed to auto-flow leads into CRM:', crmErr);
    }

    // If ADMIN_TEST run, automatically satisfy test_run_passed gate
    if (job.is_test_run === 1 || job.job_type === 'ADMIN_TEST') {
      try {
        MarketplaceProductService.getInstance().updateWizardGate(job.product_slug, 'test_run_passed', true);
      } catch {}
    }

    const finalStatus = deliveredCount >= job.requested_items ? 'COMPLETED' : deliveredCount > 0 ? 'PARTIAL' : 'COMPLETED';
    this.emitJobUpdate(job.user_id, jobId, finalStatus);
  }

  private emitJobUpdate(userId: string, jobId: string, status: string, error?: string): void {
    try {
      getSocketIO()?.to(`user:${userId}`).emit('marketplace:job_updated', {
        jobId,
        status,
        error
      });
    } catch {}
  }
}
