import { Request, Response } from 'express';
import { GrizzlyCustomerPurchaseService } from '../services/virtualNumber/grizzly/GrizzlyCustomerPurchaseService.js';
import { GrizzlyCustomerConfigService } from '../services/virtualNumber/grizzly/GrizzlyCustomerConfigService.js';
import { GrizzlyCustomerPricingService } from '../services/virtualNumber/grizzly/GrizzlyCustomerPricingService.js';
import { GrizzlyCustomerReconciliationService } from '../services/virtualNumber/grizzly/GrizzlyCustomerReconciliationService.js';
import { GrizzlyCustomerApiClient } from '../services/virtualNumber/grizzly/GrizzlyCustomerApiClient.js';
import { GrizzlyCryptoFundingService } from '../services/virtualNumber/grizzly/GrizzlyCryptoFundingService.js';
import { GrizzlyCatalogSyncService } from '../services/virtualNumber/grizzly/GrizzlyCatalogSyncService.js';
import { getDatabase } from '../db/database.js';

export class GrizzlyCustomerController {
  // --- Customer Endpoints ---

  public static async getPurchaseOptions(_req: Request, res: Response): Promise<void> {
    try {
      const options = GrizzlyCustomerPurchaseService.getPurchaseOptions();
      res.json({ success: true, ...options });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async purchaseNumber(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized user.' });
        return;
      }

      const { service, country, maxPrice, idempotencyKey } = req.body;
      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

      const result = await GrizzlyCustomerPurchaseService.purchaseNumber({
        userId,
        workspaceId: req.body.workspaceId,
        service,
        country,
        maxPrice: maxPrice ? parseFloat(String(maxPrice)) : undefined,
        idempotencyKey,
        clientIp
      });

      res.json(result);
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  public static async getMyActivations(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized.' });
        return;
      }
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
      const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;
      const result = GrizzlyCustomerPurchaseService.getMyActivations(userId, limit, offset);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async checkActivationSms(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      const activationId = String(req.params.id);
      const result = await GrizzlyCustomerPurchaseService.checkActivationSms(userId, activationId);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  public static async checkActivationSmsV2(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      const isAdmin = (req as any).user?.role === 'admin';
      const activationId = String(req.params.id);
      const result = await GrizzlyCustomerPurchaseService.checkActivationSmsV2(userId, activationId, isAdmin);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  public static async getActivationSmsHistory(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      const isAdmin = (req as any).user?.role === 'admin';
      const activationId = String(req.params.id);
      const result = GrizzlyCustomerPurchaseService.getActivationSmsHistory(userId, activationId, isAdmin);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(403).json({ success: false, error: err.message });
    }
  }

  public static async getProviderComparison(req: Request, res: Response): Promise<void> {
    try {
      const country = String(req.query.country || 'any');
      const service = String(req.query.service || '');
      if (!service) {
        res.status(400).json({ success: false, error: 'service query parameter is required.' });
        return;
      }
      const comparison = GrizzlyCustomerPricingService.getProviderComparison(country, service);
      res.json({ success: true, comparison });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async cancelActivation(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      const activationId = String(req.params.id);
      const result = await GrizzlyCustomerPurchaseService.cancelActivation(userId, activationId);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  // --- Admin Endpoints ---

  public static async syncPrices(req: Request, res: Response): Promise<void> {
    try {
      const { endpoint, country, service } = req.body || {};
      const result = await GrizzlyCustomerPricingService.syncPrices({
        endpoint,
        country,
        service
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async getCachedPrices(req: Request, res: Response): Promise<void> {
    try {
      const countryId = req.query.countryId ? String(req.query.countryId) : undefined;
      const serviceCode = req.query.serviceCode ? String(req.query.serviceCode) : undefined;
      const search = req.query.search ? String(req.query.search) : undefined;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
      const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;

      const result = GrizzlyCustomerPricingService.getCachedPrices({
        countryId,
        serviceCode,
        search,
        limit,
        offset
      });
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async getProviderRules(_req: Request, res: Response): Promise<void> {
    try {
      const rules = GrizzlyCustomerPricingService.getProviderRules();
      res.json({ success: true, rules });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async saveProviderRule(req: Request, res: Response): Promise<void> {
    try {
      const result = GrizzlyCustomerPricingService.saveProviderRule(req.body);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  public static async deleteProviderRule(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      const success = GrizzlyCustomerPricingService.deleteProviderRule(id);
      res.json({ success });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async runReconciliation(_req: Request, res: Response): Promise<void> {
    try {
      const result = await GrizzlyCustomerReconciliationService.runReconciliation();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async getReconciliationRuns(req: Request, res: Response): Promise<void> {
    try {
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
      const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;
      const result = GrizzlyCustomerReconciliationService.getRuns(limit, offset);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async getReconciliationRecords(req: Request, res: Response): Promise<void> {
    try {
      const runId = req.query.runId ? String(req.query.runId) : undefined;
      const discrepancyType = req.query.discrepancyType ? String(req.query.discrepancyType) : undefined;
      const resolutionStatus = req.query.resolutionStatus ? String(req.query.resolutionStatus) : undefined;
      const search = req.query.search ? String(req.query.search) : undefined;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
      const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;

      const result = GrizzlyCustomerReconciliationService.getRecords({
        runId,
        discrepancyType,
        resolutionStatus,
        search,
        limit,
        offset
      });
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async resolveReconciliationRecord(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      const action = req.body.action === 'ignore' ? 'ignore' : 'resolve';
      const notes = req.body.notes;
      const success = GrizzlyCustomerReconciliationService.resolveRecord(id, action, notes);
      res.json({ success });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async getRemoteActiveActivations(_req: Request, res: Response): Promise<void> {
    try {
      const config = GrizzlyCustomerConfigService.getConfig(false);
      const result = await GrizzlyCustomerApiClient.getActiveActivations(config.api_key);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // --- Admin Endpoints ---

  public static async getAdminConfig(_req: Request, res: Response): Promise<void> {
    try {
      const config = GrizzlyCustomerConfigService.getConfig(true);
      res.json({ success: true, config });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async updateAdminConfig(req: Request, res: Response): Promise<void> {
    try {
      const updated = GrizzlyCustomerConfigService.updateConfig(req.body);
      res.json({ success: true, config: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async testAdminConnection(req: Request, res: Response): Promise<void> {
    try {
      const apiKeyOverride = req.body?.apiKey;
      const result = await GrizzlyCustomerConfigService.testConnection(apiKeyOverride);
      res.json({ success: result.healthy, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async getAdminLogs(req: Request, res: Response): Promise<void> {
    try {
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 100;
      const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;
      const result = GrizzlyCustomerConfigService.getLogs(limit, offset);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async getAdminActivations(req: Request, res: Response): Promise<void> {
    try {
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
      const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;
      const report = GrizzlyCustomerConfigService.getActivationsReport(limit, offset);
      res.json({ success: true, ...report });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // --- MODULE 1: Crypto Funding & Deposit Endpoints ---

  public static async getCryptoWallet(_req: Request, res: Response): Promise<void> {
    try {
      const walletInfo = GrizzlyCryptoFundingService.getCryptoWalletInfo();
      res.json({ success: true, wallet: walletInfo });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async refreshCryptoWallet(req: Request, res: Response): Promise<void> {
    try {
      const { coin, network, apiKey } = req.body || {};
      const result = await GrizzlyCryptoFundingService.refreshCryptoWallet({ coin, network, apiKey });
      if (!result.success) {
        res.status(400).json(result);
        return;
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async updateCryptoThreshold(req: Request, res: Response): Promise<void> {
    try {
      const threshold = parseFloat(String(req.body.thresholdUsd));
      const result = GrizzlyCryptoFundingService.updateThreshold(threshold);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  public static async getCryptoWalletHistory(req: Request, res: Response): Promise<void> {
    try {
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
      const history = GrizzlyCryptoFundingService.getWalletHistory(limit);
      res.json({ success: true, history });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // --- MODULE 2: Services Catalogue Endpoints ---

  public static async getServices(req: Request, res: Response): Promise<void> {
    try {
      const db = getDatabase();
      const search = req.query.search ? String(req.query.search) : undefined;
      const category = req.query.category ? String(req.query.category) : undefined;
      const activeOnly = req.query.all !== 'true';

      let sql = 'SELECT * FROM grizzly_services WHERE 1=1';
      const args: any[] = [];

      if (activeOnly) {
        sql += ' AND is_active = 1';
      }
      if (category) {
        sql += ' AND category = ?';
        args.push(category);
      }
      if (search) {
        sql += ' AND (LOWER(provider_service_code) LIKE ? OR LOWER(service_name) LIKE ? OR LOWER(display_name) LIKE ?)';
        const q = `%${search.toLowerCase()}%`;
        args.push(q, q, q);
      }
      sql += ' ORDER BY display_name ASC';

      const rows = db.prepare(sql).all(...args);
      res.json({ success: true, services: rows, total: rows.length });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async syncServices(_req: Request, res: Response): Promise<void> {
    try {
      const result = await GrizzlyCatalogSyncService.syncServicesCatalogue();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async updateAdminService(req: Request, res: Response): Promise<void> {
    try {
      const db = getDatabase();
      const code = String(req.params.code).toLowerCase();
      const { displayName, icon, category, description, isActive } = req.body;

      const current = db.prepare('SELECT * FROM grizzly_services WHERE provider_service_code = ?').get(code) as any;
      if (!current) {
        res.status(404).json({ success: false, error: `Service "${code}" not found.` });
        return;
      }

      db.prepare(`
        UPDATE grizzly_services
        SET display_name = COALESCE(?, display_name),
            icon = COALESCE(?, icon),
            category = COALESCE(?, category),
            description = COALESCE(?, description),
            is_active = COALESCE(?, is_active),
            updated_at = datetime('now')
        WHERE provider_service_code = ?
      `).run(
        displayName !== undefined ? displayName : null,
        icon !== undefined ? icon : null,
        category !== undefined ? category : null,
        description !== undefined ? description : null,
        isActive !== undefined ? (isActive ? 1 : 0) : null,
        code
      );

      const updated = db.prepare('SELECT * FROM grizzly_services WHERE provider_service_code = ?').get(code);
      res.json({ success: true, service: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async exportServices(req: Request, res: Response): Promise<void> {
    try {
      const format = req.query.format === 'csv' ? 'csv' : 'json';
      const output = GrizzlyCatalogSyncService.exportServices(format);

      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="grizzly_services.csv"');
        res.send(output);
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="grizzly_services.json"');
        res.send(output);
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // --- MODULE 3: Multilingual Countries Endpoints ---

  public static async getMultilingualCountries(req: Request, res: Response): Promise<void> {
    try {
      const query = req.query.search ? String(req.query.search) : undefined;
      const lang = req.query.lang ? String(req.query.lang) : 'eng';
      const activeOnly = req.query.all !== 'true';
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 100;
      const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;

      const result = GrizzlyCatalogSyncService.searchCountries({
        query,
        lang,
        activeOnly,
        limit,
        offset
      });
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async syncCountries(_req: Request, res: Response): Promise<void> {
    try {
      const result = await GrizzlyCatalogSyncService.syncCountriesCatalogue();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async updateAdminCountry(req: Request, res: Response): Promise<void> {
    try {
      const db = getDatabase();
      const id = parseInt(String(req.params.id), 10);
      const { customDisplayName, customFlag, adminNotes, isActive } = req.body;

      const current = db.prepare('SELECT * FROM grizzly_countries WHERE provider_country_id = ?').get(id) as any;
      if (!current) {
        res.status(404).json({ success: false, error: `Country with ID ${id} not found.` });
        return;
      }

      db.prepare(`
        UPDATE grizzly_countries
        SET custom_display_name = COALESCE(?, custom_display_name),
            custom_flag = COALESCE(?, custom_flag),
            admin_notes = COALESCE(?, admin_notes),
            is_active = COALESCE(?, is_active),
            updated_at = datetime('now')
        WHERE provider_country_id = ?
      `).run(
        customDisplayName !== undefined ? customDisplayName : null,
        customFlag !== undefined ? customFlag : null,
        adminNotes !== undefined ? adminNotes : null,
        isActive !== undefined ? (isActive ? 1 : 0) : null,
        id
      );

      const updated = db.prepare('SELECT * FROM grizzly_countries WHERE provider_country_id = ?').get(id);
      res.json({ success: true, country: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async exportCountries(req: Request, res: Response): Promise<void> {
    try {
      const format = req.query.format === 'csv' ? 'csv' : 'json';
      const output = GrizzlyCatalogSyncService.exportCountries(format);

      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="grizzly_countries.csv"');
        res.send(output);
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="grizzly_countries.json"');
        res.send(output);
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // --- MODULE 4: Unified Service-Country Availability Model ---

  public static async getUnifiedAvailability(req: Request, res: Response): Promise<void> {
    try {
      const countryId = req.query.countryId ? String(req.query.countryId) : undefined;
      const serviceCode = req.query.serviceCode ? String(req.query.serviceCode) : undefined;
      const lang = req.query.lang ? String(req.query.lang) : 'eng';
      const inStockOnly = req.query.inStockOnly === 'true';
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
      const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;

      const result = GrizzlyCatalogSyncService.getUnifiedAvailability({
        countryId,
        serviceCode,
        lang,
        inStockOnly,
        limit,
        offset
      });
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // --- MODULE 5: Data Synchronization Control Center Endpoints ---

  public static async getSyncJobs(_req: Request, res: Response): Promise<void> {
    try {
      const jobs = GrizzlyCatalogSyncService.getSyncJobsStatus();
      res.json({ success: true, jobs });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async triggerSyncJob(req: Request, res: Response): Promise<void> {
    try {
      const jobType = String(req.params.jobType);
      const result = await GrizzlyCatalogSyncService.triggerSyncJob(jobType);
      res.json({ success: true, result });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  public static async getSyncHistory(req: Request, res: Response): Promise<void> {
    try {
      const jobType = req.query.jobType ? String(req.query.jobType) : undefined;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
      const history = GrizzlyCatalogSyncService.getSyncHistory(jobType, limit);
      res.json({ success: true, history });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

