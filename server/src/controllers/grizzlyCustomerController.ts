import { Request, Response } from 'express';
import { GrizzlyCustomerPurchaseService } from '../services/virtualNumber/grizzly/GrizzlyCustomerPurchaseService.js';
import { GrizzlyCustomerConfigService } from '../services/virtualNumber/grizzly/GrizzlyCustomerConfigService.js';
import { GrizzlyCustomerPricingService } from '../services/virtualNumber/grizzly/GrizzlyCustomerPricingService.js';
import { GrizzlyCustomerReconciliationService } from '../services/virtualNumber/grizzly/GrizzlyCustomerReconciliationService.js';
import { GrizzlyCustomerApiClient } from '../services/virtualNumber/grizzly/GrizzlyCustomerApiClient.js';

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
}

