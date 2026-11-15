import { Request, Response } from 'express';
import { FiveSimConfigService } from '../services/virtualNumber/fivesim/FiveSimConfigService.js';
import { FiveSimUserService } from '../services/virtualNumber/fivesim/FiveSimUserService.js';
import { FiveSimPriceLimitsService } from '../services/virtualNumber/fivesim/FiveSimPriceLimitsService.js';
import { FiveSimCatalogService } from '../services/virtualNumber/fivesim/FiveSimCatalogService.js';
import { FiveSimOrderService } from '../services/virtualNumber/fivesim/FiveSimOrderService.js';

export class FiveSimController {
  private configService: FiveSimConfigService;
  private userService: FiveSimUserService;
  private priceLimitsService: FiveSimPriceLimitsService;
  private catalogService: FiveSimCatalogService;
  private orderService: FiveSimOrderService;

  constructor() {
    this.configService = FiveSimConfigService.getInstance();
    this.userService = new FiveSimUserService();
    this.priceLimitsService = new FiveSimPriceLimitsService();
    this.catalogService = new FiveSimCatalogService();
    this.orderService = FiveSimOrderService.getInstance();
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
      const categoryParam = req.query.category as string;
      const category: 'activation' | 'hosting' = categoryParam === 'hosting' ? 'hosting' : 'activation';
      const cachedCategory = categoryParam === 'all' || !categoryParam ? undefined : category;
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
        category: cachedCategory,
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
  // PART 4: PRODUCTS & PRICES (GUEST ENDPOINTS)
  // =========================================================================

  public getGuestCountries = async (req: Request, res: Response): Promise<void> => {
    try {
      const countries = await this.catalogService.getCountries(req.query.refresh === 'true');
      res.json({ success: true, countries });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public getGuestProducts = async (req: Request, res: Response): Promise<void> => {
    try {
      const country = String(req.params.country || 'any');
      const operator = String(req.params.operator || 'any');
      const products = await this.catalogService.getProducts(country, operator);
      res.json({ success: true, products });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public getGuestPrices = async (req: Request, res: Response): Promise<void> => {
    try {
      const country = req.query.country as string | undefined;
      const product = req.query.product as string | undefined;
      const prices = await this.catalogService.getPrices({ country, product });
      res.json({ success: true, prices });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public getBestOperator = async (req: Request, res: Response): Promise<void> => {
    try {
      const country = (req.query.country as string) || 'any';
      const product = (req.query.product as string) || 'whatsapp';
      const analysis = await this.catalogService.getBestOperator(country, product);
      res.json({ success: true, ...analysis });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  // =========================================================================
  // PART 5: PURCHASE (ACTIVATION, HOSTING, RE-BUY)
  // =========================================================================

  public buyActivation = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      const { country = 'any', operator = 'any', product, forwarding, number, reuse, voice, ref, maxPrice } = req.body;

      if (!product) {
        res.status(400).json({ success: false, error: 'Product name is required (e.g. whatsapp, telegram).' });
        return;
      }

      const order = await this.orderService.buyActivation(
        {
          country,
          operator,
          product,
          forwarding,
          number,
          reuse,
          voice,
          ref,
          maxPrice
        },
        userId
      );

      res.json({
        success: true,
        message: 'Virtual number successfully purchased from 5SIM!',
        order
      });
    } catch (err: any) {
      const status = err.message?.includes('NO_FREE_PHONES') ? 409 : 500;
      res.status(status).json({ success: false, error: err.message });
    }
  };

  public buyHosting = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      const { country = 'any', operator = 'any', product = '3hours' } = req.body;

      const order = await this.orderService.buyHosting({ country, operator, product }, userId);
      res.json({ success: true, message: 'Hosting rental allocated successfully.', order });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public reuseNumber = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      const { product, number } = req.body;

      if (!product || !number) {
        res.status(400).json({ success: false, error: 'Product name and phone number are required.' });
        return;
      }

      const order = await this.orderService.reuseNumber({ product, number }, userId);
      res.json({ success: true, message: 'Number successfully re-acquired for reuse.', order });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  // =========================================================================
  // PART 6: ORDER MANAGEMENT & SMS INBOX
  // =========================================================================

  public checkOrder = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      const id = String(req.params.id);
      const order = await this.orderService.checkOrder(id, userId);
      res.json({ success: true, order });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public finishOrder = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      const id = String(req.params.id);
      const order = await this.orderService.finishOrder(id, userId);
      res.json({ success: true, message: 'Order successfully finished and marked complete (+0.5 rating points).', order });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public cancelOrder = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      const id = String(req.params.id);
      const order = await this.orderService.cancelOrder(id, userId);
      res.json({ success: true, message: 'Order canceled successfully.', order });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public banOrder = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      const id = String(req.params.id);
      const order = await this.orderService.banOrder(id, userId);
      res.json({ success: true, message: 'Number marked as banned.', order });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public getHostingInbox = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = String(req.params.id);
      const inbox = await this.orderService.getHostingInbox(id);
      res.json({ success: true, total: inbox.Total, messages: inbox.Data || [] });
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
