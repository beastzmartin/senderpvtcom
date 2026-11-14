import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { MarketplaceService } from '../services/marketplaceService.js';
import { getDatabase } from '../db/database.js';

export class MarketplaceController {
  private marketplaceService: MarketplaceService;

  constructor() {
    this.marketplaceService = MarketplaceService.getInstance();
  }

  public listExtensions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { category, search } = req.query;
      const extensions = this.marketplaceService.listExtensions(
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
      const ext = this.marketplaceService.getExtension(extId, userId);
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
      const result = this.marketplaceService.activateExtension(userId, extId);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  public listModules = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const extId = req.params.id as string;
      const modules = this.marketplaceService.listModules(extId, userId);
      res.json(modules);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public activateModule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const moduleId = req.params.id as string;
      const result = this.marketplaceService.activateModule(userId, moduleId);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  public getMyExtensions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const allExts = this.marketplaceService.listExtensions(userId);
      const activeOnly = allExts.filter((e) => e.is_activated || (e.modules || []).some((m) => m.is_activated));
      res.json(activeOnly);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  // Admin Endpoints
  public adminCreateModule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const adminUserId = req.user!.id;
      const created = this.marketplaceService.adminCreateModule(adminUserId, req.body);
      res.status(201).json(created);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  public adminUpdateModule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const adminUserId = req.user!.id;
      const moduleId = req.params.id as string;
      const updated = this.marketplaceService.adminUpdateModule(adminUserId, moduleId, req.body);
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  public adminDeleteModule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const adminUserId = req.user!.id;
      const moduleId = req.params.id as string;
      const success = this.marketplaceService.adminDeleteModule(adminUserId, moduleId);
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
}

