import { Request, Response } from 'express';
import { GrizzlyCustomerPurchaseService } from '../services/virtualNumber/grizzly/GrizzlyCustomerPurchaseService.js';
import { GrizzlyCustomerConfigService } from '../services/virtualNumber/grizzly/GrizzlyCustomerConfigService.js';

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

