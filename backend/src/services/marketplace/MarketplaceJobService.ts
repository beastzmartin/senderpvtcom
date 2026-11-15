import crypto from 'crypto';
import { getDatabase } from '../../db/database.js';
import {
  ProductDefinition,
  MarketplaceJobRecord,
  MarketplaceJobResultItem,
  JobStatus
} from '../../types/marketplace.js';
import { MarketplaceChargingService } from './MarketplaceChargingService.js';
import { ProviderRegistry } from './provider/ProviderRegistry.js';
import { MarketplacePricingService } from './MarketplacePricingService.js';
import { WhiteLabelSanitizer } from './WhiteLabelSanitizer.js';
import { OutputFlattener } from './OutputFlattener.js';

export class MarketplaceJobService {
  private static instance: MarketplaceJobService | null = null;
  private chargingService: MarketplaceChargingService;
  private pricingService: MarketplacePricingService;

  private constructor() {
    this.chargingService = MarketplaceChargingService.getInstance();
    this.pricingService = MarketplacePricingService.getInstance();
  }

  public static getInstance(): MarketplaceJobService {
    if (!MarketplaceJobService.instance) {
      MarketplaceJobService.instance = new MarketplaceJobService();
    }
    return MarketplaceJobService.instance;
  }

  /**
   * Validate user input fields against ProductDefinition schema
   */
  public validateInput(
    product: ProductDefinition,
    userInput: Record<string, any>
  ): Record<string, any> {
    const sanitizedInput: Record<string, any> = {};
    const errors: string[] = [];

    for (const field of product.input.fields) {
      let val = userInput[field.key];
      if (val === undefined || val === null || val === '') {
        val = field.default !== undefined ? field.default : null;
      }

      if (field.required && (val === null || val === undefined || val === '')) {
        errors.push(`Field "${field.label}" (${field.key}) is required.`);
        continue;
      }

      if (val !== null && val !== undefined) {
        if (field.type === 'number') {
          const num = Number(val);
          if (isNaN(num)) {
            errors.push(`Field "${field.label}" must be a valid number.`);
          } else {
            if (field.min !== undefined && field.min !== null && num < field.min) {
              errors.push(`Field "${field.label}" cannot be less than ${field.min}.`);
            }
            if (field.max !== undefined && field.max !== null && num > field.max) {
              errors.push(`Field "${field.label}" cannot be greater than ${field.max}.`);
            }
            val = num;
          }
        } else if (field.type === 'boolean') {
          val = Boolean(val);
        } else if (field.type === 'url') {
          try {
            const parsed = new URL(String(val));
            if (!['http:', 'https:'].includes(parsed.protocol)) {
              errors.push(`Field "${field.label}" must be a valid web URL (http/https).`);
            }
          } catch {
            errors.push(`Field "${field.label}" is not a valid URL.`);
          }
        }
      }

      sanitizedInput[field.key] = val;
    }

    if (errors.length > 0) {
      throw new Error(`INVALID_INPUT: ${errors.join(' ')}`);
    }

    return sanitizedInput;
  }

  /**
   * Check subscription access requirement
   */
  public verifySubscriptionAccess(userId: string, product: ProductDefinition): void {
    if (!product.access?.requires_subscription) {
      return;
    }

    const db = getDatabase();
    const user = db.prepare('SELECT plan_tier, subscription_status, subscription_expires_at FROM users WHERE id = ?').get(userId) as any;
    if (!user) {
      throw new Error('User not found.');
    }

    const plan = (user.plan_tier || 'trial').toLowerCase();
    const isSubActive = user.subscription_status === 'active' || plan === 'enterprise' || plan === 'pro';

    if (!isSubActive) {
      throw new Error('SUBSCRIPTION_REQUIRED: This extraction product requires an active subscription plan.');
    }

    if (
      product.access.allowed_plan_slugs &&
      product.access.allowed_plan_slugs.length > 0 &&
      !product.access.allowed_plan_slugs.includes(plan)
    ) {
      throw new Error(`PLAN_NOT_PERMITTED: This product requires one of the following plans: ${product.access.allowed_plan_slugs.join(', ')}.`);
    }
  }

  /**
   * Create & schedule an extraction job
   */
  public async createJob(
    userId: string,
    productSlug: string,
    rawInput: Record<string, any>,
    requestedItems?: number,
    isTestRun: boolean = false,
    isAdminParam?: boolean
  ): Promise<MarketplaceJobRecord> {
    const db = getDatabase();

    const cleanSlug = (productSlug || '').trim();
    if (!cleanSlug) {
      throw new Error('PRODUCT_NOT_FOUND: Product identifier is required.');
    }

    // 1. Fetch product definition (case-insensitive, slug or id)
    const prodRow = db.prepare(`
      SELECT * FROM extraction_marketplace_products
      WHERE slug = ? OR id = ? OR lower(slug) = lower(?) OR lower(id) = lower(?)
      LIMIT 1
    `).get(cleanSlug, cleanSlug, cleanSlug, cleanSlug) as any;

    if (!prodRow) {
      throw new Error(`PRODUCT_NOT_FOUND: The requested extraction product "${cleanSlug}" is not available.`);
    }

    const product: ProductDefinition = JSON.parse(prodRow.definition_json);

    // Determine admin status
    let isAdmin = isAdminParam;
    if (isAdmin === undefined) {
      const userRow = db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as any;
      isAdmin = userRow?.role === 'admin';
    }

    // Status permission check
    if (prodRow.status === 'disabled' && !isAdmin) {
      throw new Error('PRODUCT_DISABLED: This extraction product is currently disabled by administrator.');
    }
    if (prodRow.status === 'draft' && !isAdmin && !isTestRun) {
      throw new Error('PRODUCT_NOT_AVAILABLE: This extraction product is currently in review/draft and not yet published.');
    }

    // 2. Subscription check (bypassed for admins and test runs)
    if (!isAdmin && !isTestRun) {
      this.verifySubscriptionAccess(userId, product);
    }

    // 3. Concurrency check (bypassed for test runs)
    if (!isTestRun) {
      const activeRuns = (db.prepare(`
        SELECT count(*) as count FROM marketplace_jobs
        WHERE user_id = ? AND status IN ('QUEUED', 'RUNNING')
      `).get(userId) as any)?.count || 0;

      const maxConcurrency = product.limits?.max_concurrent_runs_per_user || 2;
      if (activeRuns >= maxConcurrency) {
        throw new Error(`CONCURRENCY_LIMIT_REACHED: You currently have ${activeRuns} active extraction job(s). Maximum allowed is ${maxConcurrency}.`);
      }
    }

    // 4. Validate items count against product limits
    const minItems = product.limits?.min_items || 1;
    const maxItems = product.limits?.max_items_per_run || 1000;
    const items = isTestRun
      ? Math.min(requestedItems || 5, 20)
      : Math.max(minItems, Math.min(requestedItems || 50, maxItems));

    // 5. Validate input fields
    const validatedInput = this.validateInput(product, rawInput);

    // 6. Pre-reserve funds from user wallet (Step 4 & 5)
    const jobId = `job_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    let reservation: {
      reservationId: string;
      reservedAmount: number;
      providerCostUsd: number;
      providerCostConverted: number;
      currency: string;
    };

    if (isTestRun) {
      try {
        reservation = this.chargingService.reserveForJob(userId, product, items, jobId);
      } catch {
        // Zero-charge fallback for admin test runs
        reservation = {
          reservationId: `test_res_${Date.now()}`,
          reservedAmount: 0.0,
          providerCostUsd: 0.0,
          providerCostConverted: 0.0,
          currency: 'INR'
        };
      }
    } else {
      reservation = this.chargingService.reserveForJob(userId, product, items, jobId);
    }

    // 7. Persist initial queued job
    db.prepare(`
      INSERT INTO marketplace_jobs (
        id, user_id, product_id, product_slug, product_name,
        input_json, requested_items, status, provider_type,
        items_delivered, reserved_amount, charged_amount,
        provider_cost_usd, provider_cost_converted, currency,
        reservation_tx_id, is_test_run, job_type, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, 'QUEUED', ?,
        0, ?, 0.0,
        ?, ?, ?,
        ?, ?, ?, datetime('now'), datetime('now')
      )
    `).run(
      jobId,
      userId,
      prodRow.id,
      product.slug,
      product.display_name,
      JSON.stringify(validatedInput),
      items,
      product.provider.type || 'apify',
      reservation.reservedAmount,
      reservation.providerCostUsd,
      reservation.providerCostConverted,
      reservation.currency,
      reservation.reservationId,
      isTestRun ? 1 : 0,
      isTestRun ? 'ADMIN_TEST' : 'STANDARD'
    );

    const createdJob = this.getJobById(jobId, userId, isAdmin);

    // Trigger async execution worker
    setImmediate(async () => {
      try {
        const { MarketplaceJobWorker } = await import('./MarketplaceJobWorker.js');
        await MarketplaceJobWorker.getInstance().processJob(jobId);
      } catch (err) {
        console.error(`[Marketplace Worker] Error initiating job ${jobId}:`, err);
      }
    });

    return createdJob;
  }

  /**
   * Retrieve single job record for user or admin
   */
  public getJobById(jobId: string, userId?: string, isAdmin: boolean = false): MarketplaceJobRecord {
    const db = getDatabase();
    let effectiveAdmin = isAdmin;
    if (!effectiveAdmin && userId) {
      const user = db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as any;
      if (user?.role === 'admin') effectiveAdmin = true;
    }

    const query = (!effectiveAdmin && userId)
      ? 'SELECT * FROM marketplace_jobs WHERE id = ? AND user_id = ?'
      : 'SELECT * FROM marketplace_jobs WHERE id = ?';
    const params = (!effectiveAdmin && userId) ? [jobId, userId] : [jobId];
    const row = db.prepare(query).get(...params) as any;

    if (!row) {
      throw new Error('JOB_NOT_FOUND: The requested extraction job could not be found.');
    }

    return {
      id: row.id,
      user_id: row.user_id,
      product_id: row.product_id,
      product_slug: row.product_slug,
      product_name: row.product_name,
      input_data: JSON.parse(row.input_json || '{}'),
      requested_items: Number(row.requested_items),
      status: row.status as JobStatus,
      provider_type: row.provider_type,
      provider_run_id: row.provider_run_id,
      provider_dataset_id: row.provider_dataset_id,
      items_delivered: Number(row.items_delivered || 0),
      reserved_amount: Number(row.reserved_amount || 0),
      charged_amount: Number(row.charged_amount || 0),
      provider_cost_usd: Number(row.provider_cost_usd || 0),
      provider_cost_converted: Number(row.provider_cost_converted || 0),
      currency: row.currency || 'INR',
      reservation_tx_id: row.reservation_tx_id,
      settle_tx_id: row.settle_tx_id,
      error_code: row.error_code,
      error_message: row.error_message,
      started_at: row.started_at,
      finished_at: row.finished_at,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  /**
   * List jobs for a customer
   */
  public listUserJobs(
    userId: string,
    options?: { page?: number; limit?: number; status?: string }
  ): { jobs: MarketplaceJobRecord[]; total: number; page: number; limit: number } {
    const db = getDatabase();
    const page = Math.max(1, options?.page || 1);
    const limit = Math.min(100, options?.limit || 20);
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE user_id = ?';
    const params: any[] = [userId];

    if (options?.status && options.status !== 'all') {
      whereClause += ' AND status = ?';
      params.push(options.status.toUpperCase());
    }

    const countRow = db.prepare(`SELECT count(*) as count FROM marketplace_jobs ${whereClause}`).get(...params) as any;
    const total = countRow?.count || 0;

    const rows = db.prepare(`
      SELECT * FROM marketplace_jobs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as any[];

    const jobs = rows.map((r) => this.getJobById(r.id));
    return { jobs, total, page, limit };
  }

  /**
   * Get paginated extracted results
   */
  public getJobResults(
    jobId: string,
    userId: string,
    options?: { page?: number; limit?: number },
    isAdmin: boolean = false
  ): { items: Record<string, any>[]; total: number; page: number; limit: number } {
    // Verify ownership or admin
    this.getJobById(jobId, userId, isAdmin);

    const db = getDatabase();
    const page = Math.max(1, options?.page || 1);
    const limit = Math.min(250, options?.limit || 50);
    const offset = (page - 1) * limit;

    const total = (db.prepare('SELECT count(*) as cnt FROM marketplace_job_results WHERE job_id = ?').get(jobId) as any)?.cnt || 0;

    const rows = db.prepare(`
      SELECT data_json FROM marketplace_job_results
      WHERE job_id = ?
      ORDER BY row_index ASC
      LIMIT ? OFFSET ?
    `).all(jobId, limit, offset) as any[];

    const items = rows.map((r) => JSON.parse(r.data_json));
    return { items, total, page, limit };
  }

  /**
   * Export results in CSV, XLSX, or JSON formats
   */
  public async exportJobResults(
    jobId: string,
    userId: string,
    format: 'csv' | 'xlsx' | 'json' | 'jsonl',
    isAdmin: boolean = false
  ): Promise<{ filename: string; contentType: string; data: string | Buffer }> {
    const job = this.getJobById(jobId, userId, isAdmin);
    const db = getDatabase();

    const rows = db.prepare(`
      SELECT data_json FROM marketplace_job_results
      WHERE job_id = ?
      ORDER BY row_index ASC
    `).all(jobId) as any[];

    const items = rows.map((r) => JSON.parse(r.data_json));
    const safeSlug = job.product_slug.replace(/[^a-zA-Z0-9_-]/g, '_');
    const timestamp = new Date().toISOString().split('T')[0];

    if (format === 'json') {
      return {
        filename: `${safeSlug}_${jobId}_${timestamp}.json`,
        contentType: 'application/json',
        data: JSON.stringify(items, null, 2)
      };
    }

    if (format === 'jsonl') {
      return {
        filename: `${safeSlug}_${jobId}_${timestamp}.jsonl`,
        contentType: 'application/x-ndjson',
        data: items.map((it) => JSON.stringify(it)).join('\n')
      };
    }

    // Generate CSV / XLSX with Formula Injection protection
    const headersSet = new Set<string>();
    items.forEach((item) => {
      Object.keys(item).forEach((k) => headersSet.add(k));
    });
    const headers = Array.from(headersSet);

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '';
      const sanitized = OutputFlattener.sanitizeForCsvFormulaInjection(val);
      const str = typeof sanitized === 'object' ? JSON.stringify(sanitized) : String(sanitized);
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvLines = [
      headers.join(','),
      ...items.map((row) => headers.map((h) => escapeCsv(row[h])).join(','))
    ];

    // Prepend UTF-8 Byte Order Mark (\uFEFF) so Excel immediately parses UTF-8 encoding accurately
    const csvContent = '\uFEFF' + csvLines.join('\n');
    const ext = format === 'xlsx' ? 'xlsx' : 'csv';
    const mime = format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv; charset=utf-8';

    return {
      filename: `${safeSlug}_${jobId}_${timestamp}.${ext}`,
      contentType: mime,
      data: csvContent
    };
  }

  /**
   * Abort a running job
   */
  public async abortJob(jobId: string, userId: string, isAdmin: boolean = false): Promise<boolean> {
    const job = this.getJobById(jobId, userId, isAdmin);
    if (job.status !== 'RUNNING' && job.status !== 'QUEUED') {
      return false;
    }

    const db = getDatabase();
    if (job.provider_run_id) {
      try {
        const adapter = ProviderRegistry.getInstance().getAdapter(job.provider_type);
        await adapter.abortRun(job.provider_run_id);
      } catch (err) {
        console.warn(`[Marketplace] Warning aborting provider run ${job.provider_run_id}:`, err);
      }
    }

    // Settle partial items or refund
    if (job.items_delivered > 0) {
      this.chargingService.settleJob(jobId, job.items_delivered, job.provider_cost_usd);
    } else {
      this.chargingService.refundFailedJob(jobId, 'User requested abort before completion.');
    }

    db.prepare(`
      UPDATE marketplace_jobs
      SET status = 'ABORTED', finished_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(jobId);

    return true;
  }
}

