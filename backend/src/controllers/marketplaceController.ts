import { Request, Response } from 'express';
import crypto from 'crypto';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { MarketplaceProductService } from '../services/marketplace/MarketplaceProductService.js';
import { MarketplaceJobService } from '../services/marketplace/MarketplaceJobService.js';
import { MarketplacePricingService } from '../services/marketplace/MarketplacePricingService.js';
import { ProviderRegistry } from '../services/marketplace/provider/ProviderRegistry.js';
import { ApifyAdapter } from '../services/marketplace/provider/ApifyAdapter.js';
import { MarketplaceService } from '../services/marketplaceService.js';
import { getDatabase } from '../db/database.js';

export class MarketplaceController {
  private productService = MarketplaceProductService.getInstance();
  private jobService = MarketplaceJobService.getInstance();
  private pricingService = MarketplacePricingService.getInstance();
  private extensionMarketplaceService = MarketplaceService.getInstance();

  // =========================================================================
  // EXISTING EXTENSIONS & MODULES MARKETPLACE CONTROLLER ACTIONS
  // =========================================================================
  public listExtensions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { category, search } = req.query;
      const extensions = this.extensionMarketplaceService.listExtensions(
        userId,
        category as string,
        search as string
      );
      res.json(extensions);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public getExtension = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const extId = req.params.id as string;
      const ext = this.extensionMarketplaceService.getExtension(extId, userId);
      if (!ext) {
        res.status(404).json({ error: 'Extension not found.' });
        return;
      }
      res.json(ext);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public activateExtension = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const extId = req.params.id as string;
      const result = this.extensionMarketplaceService.activateExtension(userId, extId);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  public listModules = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const extId = req.params.id as string;
      const modules = this.extensionMarketplaceService.listModules(extId, userId);
      res.json(modules);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public activateModule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const moduleId = req.params.id as string;
      const result = this.extensionMarketplaceService.activateModule(userId, moduleId);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  public getMyExtensions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const allExts = this.extensionMarketplaceService.listExtensions(userId);
      const activeOnly = allExts.filter((e) => e.is_activated || (e.modules || []).some((m) => m.is_activated));
      res.json(activeOnly);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public adminCreateModule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const adminUserId = req.user!.id;
      const created = this.extensionMarketplaceService.adminCreateModule(adminUserId, req.body);
      res.status(201).json(created);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  public adminUpdateModule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const adminUserId = req.user!.id;
      const moduleId = req.params.id as string;
      const updated = this.extensionMarketplaceService.adminUpdateModule(adminUserId, moduleId, req.body);
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  public adminDeleteModule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const adminUserId = req.user!.id;
      const moduleId = req.params.id as string;
      const success = this.extensionMarketplaceService.adminDeleteModule(adminUserId, moduleId);
      res.json({ success });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  public adminSetOverride = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const adminUserId = req.user!.id;
      const db = getDatabase();
      const admin = db.prepare('SELECT role FROM users WHERE id = ?').get(adminUserId) as any;
      if (!admin || admin.role !== 'admin') {
        res.status(403).json({ error: 'Administrator privileges required.' });
        return;
      }

      const { target_type, target_id, extension_id, module_id, quota_override, price_override } = req.body;

      if (module_id && target_type === 'user' && target_id) {
        db.prepare(`
          INSERT INTO module_activations (id, user_id, extension_id, module_id, status, custom_quota_override, custom_usage_price_override, activated_at)
          VALUES (?, ?, ?, ?, 'active', ?, ?, datetime('now'))
          ON CONFLICT(user_id, module_id) DO UPDATE SET
            custom_quota_override = excluded.custom_quota_override,
            custom_usage_price_override = excluded.custom_usage_price_override,
            status = 'active',
            updated_at = datetime('now')
        `).run(
          crypto.randomUUID(),
          target_id,
          extension_id,
          module_id,
          quota_override !== undefined ? Number(quota_override) : null,
          price_override !== undefined ? Number(price_override) : null
        );
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  // =========================================================================
  // DATA EXTRACTION MARKETPLACE CONTROLLER ACTIONS (WHITE-LABEL APIFY BASE)
  // =========================================================================

  /**
   * GET /api/marketplace/products
   * Customer: list available active extraction products
   */
  public listProducts = async (req: Request, res: Response): Promise<void> => {
    try {
      const category = req.query.category as string;
      const products = this.productService.listProducts(false, category);
      res.json({ success: true, products });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to list marketplace products' });
    }
  };

  /**
   * GET /api/marketplace/products/:slug
   * Customer: get single product definition and input fields
   */
  public getProduct = async (req: Request, res: Response): Promise<void> => {
    try {
      const slug = String(req.params.slug);
      const product = this.productService.getProductBySlug(slug, false);
      if (!product) {
        res.status(404).json({ error: 'Product not found or inactive.' });
        return;
      }
      res.json({ success: true, product });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to get product details' });
    }
  };

  /**
   * POST /api/marketplace/estimate
   * Customer: live price preview calculator based on items slider
   */
  public estimatePrice = async (req: Request, res: Response): Promise<void> => {
    try {
      const { slug, items } = req.body;
      const product = this.productService.getProductBySlug(slug, true);
      if (!product) {
        res.status(404).json({ error: 'Product not found.' });
        return;
      }

      const estimate = this.pricingService.calculateEstimatedPrice(product.definition, Number(items) || 100);
      res.json({
        success: true,
        sellPrice: estimate.sellPrice,
        currency: estimate.currency,
        minChargeApplied: estimate.minChargeApplied,
        requestedItems: estimate.requestedItems
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to estimate extraction price' });
    }
  };

  /**
   * POST /api/marketplace/jobs
   * Customer: launch an extraction job
   */
  public createJob = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { slug, input, requestedItems } = req.body;

      if (!slug) {
        res.status(400).json({ error: 'Product slug is required.' });
        return;
      }

      const job = await this.jobService.createJob(userId, slug, input || {}, requestedItems);
      res.status(201).json({ success: true, job });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to create extraction job.' });
    }
  };

  /**
   * GET /api/marketplace/jobs
   * Customer: list own extraction jobs
   */
  public listUserJobs = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 20;
      const status = req.query.status as string;

      const result = this.jobService.listUserJobs(userId, { page, limit, status });
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to list jobs' });
    }
  };

  /**
   * GET /api/marketplace/jobs/:id
   * Customer: get job status, item count and charge breakdown
   */
  public getJob = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const jobId = String(req.params.id);
      const job = this.jobService.getJobById(jobId, userId);
      res.json({ success: true, job });
    } catch (err: any) {
      res.status(404).json({ error: err.message || 'Job not found' });
    }
  };

  /**
   * GET /api/marketplace/jobs/:id/results
   * Customer: preview extracted results
   */
  public getJobResults = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const jobId = String(req.params.id);
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 50;

      const results = this.jobService.getJobResults(jobId, userId, { page, limit });
      res.json({ success: true, ...results });
    } catch (err: any) {
      res.status(404).json({ error: err.message || 'Failed to fetch job results' });
    }
  };

  /**
   * GET /api/marketplace/jobs/:id/export
   * Customer: download results as CSV, XLSX, or JSON
   */
  public exportJob = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const jobId = String(req.params.id);
      const format = ((req.query.format as string) || 'csv').toLowerCase() as 'csv' | 'xlsx' | 'json';

      const exp = await this.jobService.exportJobResults(jobId, userId, format);
      res.setHeader('Content-Type', exp.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${exp.filename}"`);
      res.send(exp.data);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to export job results' });
    }
  };

  /**
   * POST /api/marketplace/jobs/:id/abort
   * Customer: abort running extraction
   */
  public abortJob = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const jobId = String(req.params.id);
      const success = await this.jobService.abortJob(jobId, userId);
      res.json({ success });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to abort job' });
    }
  };

  /**
   * POST /api/marketplace/webhook/provider
   * Inbound provider webhook receiver
   */
  public handleWebhook = async (req: Request, res: Response): Promise<void> => {
    try {
      const secret = (req.headers['x-provider-secret'] || req.query.secret || '') as string;
      const adapter = ProviderRegistry.getInstance().getAdapter('apify');
      const isValid = adapter.verifyWebhook(secret, JSON.stringify(req.body));

      if (!isValid) {
        res.status(401).json({ error: 'Unauthorized webhook call' });
        return;
      }

      const eventPayload = req.body || {};
      const runId = eventPayload.eventData?.actorRunId || eventPayload.data?.id;
      const status = eventPayload.eventData?.status || eventPayload.data?.status;

      if (runId) {
        const db = getDatabase();
        // Log event
        db.prepare(`
          INSERT INTO marketplace_provider_events (id, provider_type, event_type, payload_json, status, created_at)
          VALUES (?, 'apify', ?, ?, 'processed', datetime('now'))
        `).run(
          `evt_${Date.now()}`,
          eventPayload.eventType || 'RUN_UPDATE',
          JSON.stringify(eventPayload)
        );

        // Find associated job
        const job = db.prepare('SELECT id FROM marketplace_jobs WHERE provider_run_id = ?').get(runId) as any;
        if (job) {
          const { MarketplaceJobWorker } = await import('../services/marketplace/MarketplaceJobWorker.js');
          await MarketplaceJobWorker.getInstance().handleRunCompleted(
            job.id,
            status || 'SUCCEEDED',
            eventPayload.data?.defaultDatasetId,
            Number(eventPayload.data?.usageTotalUsd || 0)
          );
        }
      }

      res.json({ status: 'ok' });
    } catch (err: any) {
      console.error('[Marketplace Webhook] Error processing event:', err);
      res.status(500).json({ error: 'Webhook processing error' });
    }
  };

  // =========================================================================
  // ADMIN PANEL CONTROLLER ACTIONS (EXTRACTION MARKETPLACE)
  // =========================================================================

  /**
   * GET /api/marketplace/admin/products
   * Admin: list all products including drafts & disabled
   */
  public adminListProducts = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const products = this.productService.listProducts(true);
      res.json({ success: true, products });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to list admin products' });
    }
  };

  /**
   * POST /api/marketplace/admin/products
   * Admin: create or update a product definition
   */
  public adminSaveProduct = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const adminUserId = req.user!.id;
      const { product, reason } = req.body;

      if (!product || !product.slug || !product.display_name) {
        res.status(400).json({ error: 'Valid product definition with slug and display_name is required.' });
        return;
      }

      const saved = this.productService.saveProduct(product, adminUserId, reason);
      res.json({ success: true, product: saved });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to save product.' });
    }
  };

  /**
   * POST /api/marketplace/admin/import-provider
   * Admin: "Import from Provider ID" tool
   */
  public adminImportFromProvider = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { providerType, actorIdOrUrl } = req.body;
      if (!actorIdOrUrl) {
        res.status(400).json({ error: 'Actor ID or URL is required.' });
        return;
      }

      const prefilled = await this.productService.importFromProvider(providerType || 'apify', actorIdOrUrl);
      res.json({ success: true, product: prefilled });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to import from provider.' });
    }
  };

  /**
   * POST /api/marketplace/admin/products/:slug/duplicate
   */
  public adminDuplicateProduct = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const slug = String(req.params.slug);
      const duplicated = this.productService.duplicateProduct(slug);
      res.json({ success: true, product: duplicated });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to duplicate product.' });
    }
  };

  /**
   * DELETE /api/marketplace/admin/products/:slug
   */
  public adminDeleteProduct = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const slug = String(req.params.slug);
      this.productService.deleteProduct(slug);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to delete product.' });
    }
  };

  /**
   * POST /api/marketplace/admin/products/:slug/test-run
   * Admin: run test extraction with 5 items to preview mapping
   */
  public adminTestRun = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const adminUserId = req.user!.id;
      const slug = String(req.params.slug);
      const { input } = req.body;

      const job = await this.jobService.createJob(adminUserId, slug, input || {}, 5);
      res.json({ success: true, job });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Test run failed.' });
    }
  };

  /**
   * GET /api/marketplace/admin/jobs
   * Admin: global jobs monitor with filtering
   */
  public adminListAllJobs = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 25;
      const status = req.query.status as string;
      const offset = (page - 1) * limit;

      let where = 'WHERE 1=1';
      const params: any[] = [];

      if (status && status !== 'all') {
        where += ' AND j.status = ?';
        params.push(status.toUpperCase());
      }

      const total = (db.prepare(`SELECT count(*) as count FROM marketplace_jobs j ${where}`).get(...params) as any)?.count || 0;

      const rows = db.prepare(`
        SELECT j.*, u.username, u.email as user_email
        FROM marketplace_jobs j
        LEFT JOIN users u ON j.user_id = u.id
        ${where}
        ORDER BY j.created_at DESC
        LIMIT ? OFFSET ?
      `).all(...params, limit, offset) as any[];

      res.json({ success: true, jobs: rows, total, page, limit });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to list admin jobs' });
    }
  };

  /**
   * GET /api/marketplace/admin/finance
   * Admin: revenue, provider cost, and net profit analytics
   */
  public adminFinanceStats = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();

      const totals = db.prepare(`
        SELECT
          COUNT(*) as total_jobs,
          SUM(items_delivered) as total_items,
          SUM(charged_amount) as total_revenue,
          SUM(provider_cost_converted) as total_cost,
          SUM(charged_amount - provider_cost_converted) as total_profit
        FROM marketplace_jobs
        WHERE status IN ('COMPLETED', 'PARTIAL')
      `).get() as any;

      const byProduct = db.prepare(`
        SELECT
          product_slug,
          product_name,
          COUNT(*) as jobs_count,
          SUM(items_delivered) as items_count,
          SUM(charged_amount) as revenue,
          SUM(provider_cost_converted) as cost,
          SUM(charged_amount - provider_cost_converted) as profit
        FROM marketplace_jobs
        WHERE status IN ('COMPLETED', 'PARTIAL')
        GROUP BY product_slug
        ORDER BY profit DESC
      `).all();

      res.json({
        success: true,
        stats: {
          totalJobs: totals.total_jobs || 0,
          totalItemsDelivered: totals.total_items || 0,
          totalRevenue: Number((totals.total_revenue || 0).toFixed(2)),
          totalCost: Number((totals.total_cost || 0).toFixed(2)),
          totalProfit: Number((totals.total_profit || 0).toFixed(2)),
          currency: 'INR'
        },
        byProduct
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to get finance stats' });
    }
  };

  /**
   * GET /api/marketplace/admin/provider-health
   */
  public adminProviderHealth = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const hasToken = Boolean(process.env.APIFY_API_TOKEN);
      const db = getDatabase();

      const recentFailures = (db.prepare(`
        SELECT count(*) as count FROM marketplace_jobs
        WHERE status = 'FAILED' AND created_at > datetime('now', '-24 hours')
      `).get() as any)?.count || 0;

      const activeRuns = (db.prepare(`
        SELECT count(*) as count FROM marketplace_jobs
        WHERE status = 'RUNNING'
      `).get() as any)?.count || 0;

      res.json({
        success: true,
        health: {
          tokenConfigured: hasToken,
          status: hasToken ? 'operational' : 'sandbox_mock_only',
          activeRuns,
          recentFailuresLast24h: recentFailures
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to get provider health' });
    }
  };

  /**
   * GET /api/marketplace/admin/settings
   */
  public adminGetSettings = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();
      const rows = db.prepare('SELECT key, value FROM marketplace_settings').all() as any[];
      const settings: Record<string, string> = {};
      rows.forEach((r) => { settings[r.key] = r.value; });
      res.json({ success: true, settings });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to get settings' });
    }
  };

  /**
   * POST /api/marketplace/admin/settings
   */
  public adminUpdateSettings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();
      const { settings } = req.body;
      if (settings && typeof settings === 'object') {
        const updateStmt = db.prepare(`
          INSERT INTO marketplace_settings (key, value, updated_at)
          VALUES (?, ?, datetime('now'))
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
        `);
        const updateTx = db.transaction(() => {
          for (const [k, v] of Object.entries(settings)) {
            updateStmt.run(k, String(v));
          }
        });
        updateTx();
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to update settings' });
    }
  };

  /**
   * POST /api/marketplace/admin/test-provider-auth
   */
  public adminTestProviderAuth = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { token } = req.body;
      const adapter = ProviderRegistry.getInstance().getAdapter('apify') as ApifyAdapter;
      const result = await adapter.testConnection(token);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to test provider authentication' });
    }
  };
}
