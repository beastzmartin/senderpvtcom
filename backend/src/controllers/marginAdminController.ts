import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { MarginService } from '../services/virtualNumber/MarginService.js';
import { NumberPurchaseService } from '../services/virtualNumber/NumberPurchaseService.js';
import { FiveSimConfigService } from '../services/virtualNumber/fivesim/FiveSimConfigService.js';

export class MarginAdminController {
  private marginService: MarginService;
  private purchaseService: NumberPurchaseService;
  private configService: FiveSimConfigService;

  constructor() {
    this.marginService = MarginService.getInstance();
    this.purchaseService = NumberPurchaseService.getInstance();
    this.configService = FiveSimConfigService.getInstance();
  }

  // --- Margin Rules CRUD ---
  public getRules = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const scope = req.query.scope as string;
      const enabled = req.query.enabled !== undefined ? req.query.enabled === 'true' : undefined;
      const rules = this.marginService.getMarginRules({ scope, enabled });
      res.json({ success: true, count: rules.length, rules });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public createRule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const {
        scope,
        country,
        product,
        operator,
        type,
        percent_value,
        fixed_value,
        min_price,
        max_price,
        custom_override_price,
        description,
        enabled
      } = req.body;

      if (!scope || !type) {
        res.status(400).json({ success: false, error: 'Scope and type are required fields.' });
        return;
      }

      const adminUser = req.user?.username || req.user?.id || 'admin';
      const rule = this.marginService.createMarginRule(
        {
          scope,
          country,
          product,
          operator,
          type,
          percent_value,
          fixed_value,
          min_price,
          max_price,
          custom_override_price,
          description,
          enabled
        },
        adminUser
      );

      res.status(201).json({ success: true, rule });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  };

  public updateRule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const id = String(req.params.id);
      const adminUser = req.user?.username || req.user?.id || 'admin';
      const rule = this.marginService.updateMarginRule(id, req.body, adminUser);
      res.json({ success: true, rule });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  };

  public deleteRule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const id = String(req.params.id);
      const adminUser = req.user?.username || req.user?.id || 'admin';
      const ok = this.marginService.deleteMarginRule(id, adminUser);
      res.json({ success: ok, message: ok ? 'Rule deleted successfully' : 'Rule not found' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public bulkUpdateRules = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { ruleIds, updates } = req.body;
      if (!Array.isArray(ruleIds) || ruleIds.length === 0) {
        res.status(400).json({ success: false, error: 'Array of ruleIds is required.' });
        return;
      }

      const adminUser = req.user?.username || req.user?.id || 'admin';
      const result = this.marginService.bulkUpdateRules(ruleIds, updates || {}, adminUser);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  };

  public exportCsv = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const csv = this.marginService.exportRulesCsv();
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="margin_rules.csv"');
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public importCsv = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const csvContent = req.body.csv || req.body.content;
      if (!csvContent || typeof csvContent !== 'string') {
        res.status(400).json({ success: false, error: 'CSV content string is required.' });
        return;
      }

      const adminUser = req.user?.username || req.user?.id || 'admin';
      const result = this.marginService.importRulesCsv(csvContent, adminUser);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  };

  public resetDefaults = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const adminUser = req.user?.username || req.user?.id || 'admin';
      this.marginService.resetDefaultRules(adminUser);
      res.json({ success: true, message: 'Margin rules reset to standard baseline.' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  // --- Audit Log & Undo ---
  public getAuditLogs = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const limit = Number(req.query.limit || 50);
      const logs = this.marginService.getAuditLogs(limit);
      res.json({ success: true, count: logs.length, logs });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public undoAuditLog = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const id = String(req.params.id);
      const adminUser = req.user?.username || req.user?.id || 'admin';
      const result = this.marginService.undoAuditLog(id, adminUser);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  };

  // --- Pricing Settings ---
  public getSettings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const settings = this.marginService.getPricingSettings();
      res.json({ success: true, settings });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public updateSettings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const adminUser = req.user?.username || req.user?.id || 'admin';
      const settings = this.marginService.updatePricingSettings(req.body, adminUser);
      res.json({ success: true, settings });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  };

  // --- Live Price Preview Tool (Step 3) ---
  public pricePreview = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { cost, country, product, operator, previewCurrencies } = req.body;
      if (cost === undefined || isNaN(Number(cost))) {
        res.status(400).json({ success: false, error: 'Valid numerical cost is required.' });
        return;
      }

      const preview = this.marginService.calculatePreview(
        Number(cost),
        country || undefined,
        product || undefined,
        operator || undefined,
        Array.isArray(previewCurrencies) ? previewCurrencies : ['USD', 'INR', 'EUR']
      );

      res.json({ success: true, preview });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  };

  // --- Admin Orders Inspection ---
  public getOrders = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const limit = Number(req.query.limit || 50);
      const offset = Number(req.query.offset || 0);
      const status = req.query.status as string;
      const country = req.query.country as string;
      const product = req.query.product as string;
      const userId = req.query.userId as string;

      const result = this.purchaseService.getAdminOrders({
        limit,
        offset,
        status,
        country,
        product,
        userId
      });

      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  // --- Profit Report ---
  public getProfitReport = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const period = (req.query.period as any) || 'daily';
      const report = this.purchaseService.getProfitReport(period);
      res.json({ success: true, report });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  // --- 5SIM Health & Balance ---
  public getFiveSimBalance = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const client = this.configService.getClient();
      const profile = await client.getProfile();
      const settings = this.marginService.getPricingSettings();
      const isLowBalance = profile.balance < settings.low_balance_threshold;

      res.json({
        success: true,
        profile,
        isLowBalance,
        lowBalanceThreshold: settings.low_balance_threshold
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  // --- Hidden Items Management ---
  public getHiddenItems = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const items = this.marginService.getHiddenItems();
      res.json({ success: true, count: items.length, items });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public addHiddenItem = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { type, value } = req.body;
      if (!type || !value) {
        res.status(400).json({ success: false, error: 'Type and value are required.' });
        return;
      }
      const item = this.marginService.addHiddenItem(type, value);
      res.status(201).json({ success: true, item });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  };

  public removeHiddenItem = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const id = String(req.params.id);
      const ok = this.marginService.removeHiddenItem(id);
      res.json({ success: ok, message: ok ? 'Item removed from hidden list' : 'Item not found' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };
}
