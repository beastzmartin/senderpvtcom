import { Request, Response } from 'express';
import { FiveSimConfigService } from '../services/virtualNumber/fivesim/FiveSimConfigService.js';
import { FiveSimUserService } from '../services/virtualNumber/fivesim/FiveSimUserService.js';
import { FiveSimPriceLimitsService } from '../services/virtualNumber/fivesim/FiveSimPriceLimitsService.js';
import { FiveSimCatalogService } from '../services/virtualNumber/fivesim/FiveSimCatalogService.js';
import { FiveSimOrderService } from '../services/virtualNumber/fivesim/FiveSimOrderService.js';
import { FiveSimVendorService } from '../services/virtualNumber/fivesim/FiveSimVendorService.js';
import { FiveSimReferenceService } from '../services/virtualNumber/fivesim/FiveSimReferenceService.js';
import { FiveSimDiagnosticsService } from '../services/virtualNumber/fivesim/FiveSimDiagnosticsService.js';

export class FiveSimController {
  private configService: FiveSimConfigService;
  private userService: FiveSimUserService;
  private priceLimitsService: FiveSimPriceLimitsService;
  private catalogService: FiveSimCatalogService;
  private orderService: FiveSimOrderService;
  private vendorService: FiveSimVendorService;
  private referenceService: FiveSimReferenceService;
  private diagnosticsService: FiveSimDiagnosticsService;

  constructor() {
    this.configService = FiveSimConfigService.getInstance();
    this.userService = new FiveSimUserService();
    this.priceLimitsService = new FiveSimPriceLimitsService();
    this.catalogService = new FiveSimCatalogService();
    this.orderService = FiveSimOrderService.getInstance();
    this.vendorService = FiveSimVendorService.getInstance();
    this.referenceService = FiveSimReferenceService.getInstance();
    this.diagnosticsService = new FiveSimDiagnosticsService();
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

  // =========================================================================
  // PART 7: FLASH NOTIFICATIONS
  // =========================================================================

  public getFlash = async (req: Request, res: Response): Promise<void> => {
    try {
      const lang = (req.params.lang as string) || 'en';
      const flash = await this.configService.getClient().getFlashNotifications(lang);
      res.json({ success: true, flash });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  // =========================================================================
  // PART 8: VENDOR API (PARTNER & RESELLER SUITE)
  // =========================================================================

  public getVendorStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const stats = await this.vendorService.getVendorStats();
      res.json({ success: true, stats });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public getVendorWallets = async (req: Request, res: Response): Promise<void> => {
    try {
      const wallets = await this.vendorService.getVendorWallets();
      res.json({ success: true, wallets });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public getVendorOrders = async (req: Request, res: Response): Promise<void> => {
    try {
      const category = (req.query.category as string) === 'hosting' ? 'hosting' : 'activation';
      const limit = parseInt(req.query.limit as string, 10) || 50;
      const offset = parseInt(req.query.offset as string, 10) || 0;
      const order = req.query.order as string;
      const reverse = req.query.reverse === 'true';

      const orders = await this.vendorService.getVendorOrders({
        category,
        limit,
        offset,
        order,
        reverse
      });

      res.json({ success: true, orders });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public getVendorPayments = async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = parseInt(req.query.limit as string, 10) || 50;
      const offset = parseInt(req.query.offset as string, 10) || 0;
      const order = req.query.order as string;
      const reverse = req.query.reverse === 'true';

      const payments = await this.vendorService.getVendorPayments({
        limit,
        offset,
        order,
        reverse
      });

      res.json({ success: true, payments });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public requestVendorWithdraw = async (req: Request, res: Response): Promise<void> => {
    try {
      const { receiver, method, amount, fee } = req.body;
      if (!receiver || !method || !amount || !fee) {
        res.status(400).json({ success: false, error: 'receiver, method, amount, and fee are required.' });
        return;
      }

      const result = await this.vendorService.requestWithdraw({ receiver, method, amount, fee });
      res.json({ success: true, message: 'Withdrawal payout requested successfully.', result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public getVendorPrices = async (req: Request, res: Response): Promise<void> => {
    try {
      const source = (req.query.source as string) || 'cached'; // 'live' or 'cached'

      if (source === 'live') {
        const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
        const perPage = req.query.perPage ? parseInt(req.query.perPage as string, 10) : undefined;
        const sortDir = req.query.sortDir as 'ASC' | 'DESC';
        const sortField = req.query.sortField as string;

        let filters: any;
        if (req.query.filters) {
          try {
            filters = typeof req.query.filters === 'string' ? JSON.parse(req.query.filters) : req.query.filters;
          } catch {}
        }

        const liveData = await this.vendorService.fetchVendorPrices({
          filters,
          sortDir,
          sortField,
          page,
          perPage
        });

        res.json({ success: true, source: 'live', data: liveData });
        return;
      }

      // Default: cached
      const cached = this.vendorService.getCachedVendorPrices({
        product: req.query.product as string,
        country: req.query.country as string,
        operator: req.query.operator as string,
        enabled: req.query.enabled !== undefined ? req.query.enabled === 'true' : undefined,
        limit: parseInt(req.query.limit as string, 10) || 50,
        offset: parseInt(req.query.offset as string, 10) || 0
      });

      res.json({
        success: true,
        source: 'cached',
        total: cached.total,
        prices: cached.rows
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public createVendorPrice = async (req: Request, res: Response): Promise<void> => {
    try {
      const { Price, ProductName, CountryName, OperatorName } = req.body;
      if (!Price || !ProductName || !CountryName || !OperatorName) {
        res.status(400).json({ success: false, error: 'Price, ProductName, CountryName, OperatorName are required.' });
        return;
      }

      const result = await this.vendorService.createVendorPrice({
        Price: Number(Price),
        ProductName: String(ProductName).toLowerCase(),
        CountryName: String(CountryName).toLowerCase(),
        OperatorName: String(OperatorName).toLowerCase()
      });

      res.json({ success: true, message: 'Vendor price created successfully.', result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public updateVendorPrice = async (req: Request, res: Response): Promise<void> => {
    try {
      const { Price, Product, Country, Operator } = req.body;
      if (!Price || !Product || !Country || !Operator) {
        res.status(400).json({ success: false, error: 'Price, Product, Country, Operator are required.' });
        return;
      }

      const result = await this.vendorService.updateVendorPrice({
        Price: Number(Price),
        Product: String(Product).toLowerCase(),
        Country: String(Country).toLowerCase(),
        Operator: String(Operator).toLowerCase()
      });

      res.json({ success: true, message: 'Vendor price updated successfully.', result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public toggleVendorPrice = async (req: Request, res: Response): Promise<void> => {
    try {
      const { Disable, List } = req.body;
      const result = await this.vendorService.toggleVendorPrices({
        Disable: Boolean(Disable),
        List: Array.isArray(List) ? List : undefined
      });

      res.json({
        success: true,
        message: Disable ? 'Vendor prices disabled.' : 'Vendor prices enabled.',
        result
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  // =========================================================================
  // PART 9: REFERENCE DIRECTORY (COUNTRIES, OPERATORS, PRODUCTS)
  // =========================================================================

  public getReferenceCountries = async (req: Request, res: Response): Promise<void> => {
    try {
      const countries = this.referenceService.getReferenceCountries();
      res.json({ success: true, count: countries.length, countries });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public getReferenceProducts = async (req: Request, res: Response): Promise<void> => {
    try {
      const category = req.query.category as string;
      const search = req.query.search as string;
      const products = this.referenceService.getCatalogProducts({ category, search });
      res.json({ success: true, count: products.length, products });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  public resolveReference = async (req: Request, res: Response): Promise<void> => {
    try {
      const query = (req.query.query as string) || '';
      const type = (req.query.type as string) || 'product'; // 'product' or 'country'

      if (type === 'country') {
        const resolvedSlug = this.referenceService.resolveCountrySlug(query);
        res.json({ success: true, query, resolvedSlug });
      } else {
        const resolvedSlug = this.referenceService.resolveProductSlug(query);
        res.json({ success: true, query, resolvedSlug });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  // =========================================================================
  // PART 10: 10-POINT DIAGNOSTICS & SYSTEM INTEGRATION CHECKLIST
  // =========================================================================

  public getDiagnostics = async (req: Request, res: Response): Promise<void> => {
    try {
      const report = await this.diagnosticsService.runFullDiagnostics();
      res.json({ success: true, report });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };
}
