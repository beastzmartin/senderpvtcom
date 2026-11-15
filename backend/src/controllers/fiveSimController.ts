import { Request, Response } from 'express';
import { FiveSimConfigService } from '../services/virtualNumber/fivesim/FiveSimConfigService.js';
import { FiveSimUserService } from '../services/virtualNumber/fivesim/FiveSimUserService.js';
import { FiveSimPriceLimitsService } from '../services/virtualNumber/fivesim/FiveSimPriceLimitsService.js';

export class FiveSimController {
  private configService: FiveSimConfigService;
  private userService: FiveSimUserService;
  private priceLimitsService: FiveSimPriceLimitsService;

  constructor() {
    this.configService = FiveSimConfigService.getInstance();
    this.userService = new FiveSimUserService();
    this.priceLimitsService = new FiveSimPriceLimitsService();
  }

  // =========================================================================
  // Config & Status Endpoints
  // =========================================================================

  public getConfig = async (req: Request, res: Response): Promise<void> => {
    try {
      const config = this.configService.getConfig();
      res.json({
        success: true,
        config: config
          ? {
              ...config,
              // Mask API key for security unless empty
              apiKeyMasked: config.apiKey ? `${config.apiKey.slice(0, 4)}••••••••${config.apiKey.slice(-4)}` : ''
            }
          : null
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public updateConfig = async (req: Request, res: Response): Promise<void> => {
    try {
      const { apiKey, baseUrl, isEnabled, autoSync, maxRequestsPerSec } = req.body;
      const updated = this.configService.updateConfig({
        apiKey,
        baseUrl,
        isEnabled,
        autoSync,
        maxRequestsPerSec
      });
      res.json({ success: true, message: '5SIM configuration updated successfully.', config: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public testConnection = async (req: Request, res: Response): Promise<void> => {
    try {
      const { apiKey } = req.body || {};
      const result = await this.configService.testConnection(apiKey);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  // =========================================================================
  // Part 2: User Endpoints (Profile, Orders, Payments)
  // =========================================================================

  public getProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const profile = await this.userService.getProfile();
      res.json({ success: true, profile });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public getOrders = async (req: Request, res: Response): Promise<void> => {
    try {
      const category = (req.query.category as string) === 'hosting' ? 'hosting' : 'activation';
      const source = (req.query.source as string) || 'cached'; // 'live' or 'cached'
      const limit = parseInt(req.query.limit as string, 10) || 50;
      const offset = parseInt(req.query.offset as string, 10) || 0;
      const search = req.query.search as string;
      const status = req.query.status as string;

      if (source === 'live') {
        const liveData = await this.userService.fetchOrders({
          category,
          limit,
          offset,
          order: req.query.order as string,
          reverse: req.query.reverse === 'true',
          syncToDb: true
        });
        res.json({
          success: true,
          source: 'live',
          total: liveData.Total,
          orders: liveData.Data || [],
          productNames: liveData.ProductNames || [],
          statuses: liveData.Statuses || []
        });
        return;
      }

      // Default: cached with rich query filtering
      const cached = this.userService.getCachedOrders({
        category,
        limit,
        offset,
        search,
        status
      });

      res.json({
        success: true,
        source: 'cached',
        total: cached.total,
        orders: cached.rows
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public getPayments = async (req: Request, res: Response): Promise<void> => {
    try {
      const source = (req.query.source as string) || 'cached';
      const limit = parseInt(req.query.limit as string, 10) || 50;
      const offset = parseInt(req.query.offset as string, 10) || 0;

      if (source === 'live') {
        const liveData = await this.userService.fetchPayments({
          limit,
          offset,
          order: req.query.order as string,
          reverse: req.query.reverse === 'true',
          syncToDb: true
        });
        res.json({
          success: true,
          source: 'live',
          total: liveData.Total,
          payments: liveData.Data || []
        });
        return;
      }

      const cached = this.userService.getCachedPayments({ limit, offset });
      res.json({
        success: true,
        source: 'cached',
        total: cached.total,
        payments: cached.rows
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  // =========================================================================
  // Part 3: Price Limits (Max Prices)
  // =========================================================================

  public getMaxPrices = async (req: Request, res: Response): Promise<void> => {
    try {
      const source = (req.query.source as string) || 'cached';
      if (source === 'live') {
        const liveList = await this.priceLimitsService.syncMaxPrices();
        res.json({ success: true, source: 'live', maxPrices: liveList });
        return;
      }

      const cached = this.priceLimitsService.getCachedMaxPrices();
      res.json({ success: true, source: 'cached', maxPrices: cached });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public setMaxPrice = async (req: Request, res: Response): Promise<void> => {
    try {
      const { product, price } = req.body;
      if (!product || typeof price !== 'number') {
        res.status(400).json({ success: false, error: 'Product name and numeric price are required.' });
        return;
      }

      const result = await this.priceLimitsService.setMaxPrice(product, price);
      res.json({ success: true, message: `Max price for "${product}" set to ${price} successfully.`, item: result.item });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public deleteMaxPrice = async (req: Request, res: Response): Promise<void> => {
    try {
      const product = (req.query.product as string) || req.body.product;
      if (!product) {
        res.status(400).json({ success: false, error: 'Product name is required.' });
        return;
      }

      await this.priceLimitsService.deleteMaxPrice(product);
      res.json({ success: true, message: `Max price limit for "${product}" deleted successfully.` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  // =========================================================================
  // Full Synchronization Trigger
  // =========================================================================

  public syncAll = async (req: Request, res: Response): Promise<void> => {
    try {
      // 1. Profile
      const profile = await this.userService.getProfile();

      // 2. Activations
      const act = await this.userService.fetchOrders({ category: 'activation', limit: 100, syncToDb: true });

      // 3. Hosting
      const host = await this.userService.fetchOrders({ category: 'hosting', limit: 100, syncToDb: true });

      // 4. Payments
      const pay = await this.userService.fetchPayments({ limit: 100, syncToDb: true });

      // 5. Max Prices
      const maxPrices = await this.priceLimitsService.syncMaxPrices();

      res.json({
        success: true,
        message: 'Full 5SIM telemetry and order records synchronized successfully.',
        summary: {
          balance: profile.balance,
          rating: profile.rating,
          activationsCount: act.Total,
          hostingCount: host.Total,
          paymentsCount: pay.Total,
          maxPricesCount: maxPrices.length,
          syncedAt: new Date().toISOString()
        }
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };
}

