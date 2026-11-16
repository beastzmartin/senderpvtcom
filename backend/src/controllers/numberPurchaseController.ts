import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { NumberPurchaseService } from '../services/virtualNumber/NumberPurchaseService.js';

export class NumberPurchaseController {
  private service: NumberPurchaseService;

  constructor() {
    this.service = NumberPurchaseService.getInstance();
  }

  public getCountries = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const forceRefresh = req.query.refresh === 'true';
      const countries = await this.service.getCountries(forceRefresh);
      res.json({ success: true, count: countries.length, countries });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to load countries' });
    }
  };

  public getProducts = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const country = (req.query.country as string) || 'any';
      const operator = (req.query.operator as string) || 'any';
      const products = await this.service.getProducts(country, operator);
      res.json({ success: true, count: products.length, products });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to load services' });
    }
  };

  public getPrices = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const country = req.query.country as string;
      const product = req.query.product as string;

      if (!country || !product) {
        res.status(400).json({ success: false, error: 'Both country and product parameters are required.' });
        return;
      }

      const isAdmin = req.user?.role === 'admin';
      const requestedCurrency = req.query.currency as string | undefined;
      const data = await this.service.getPrices(country, product, isAdmin, requestedCurrency);
      res.json({ success: true, ...data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to fetch prices' });
    }
  };

  public syncCatalog = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const result = await this.service.syncCatalogNow();
      res.json({ success: true, message: 'Telecom catalog caches cleared and synchronized.', ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to sync catalog' });
    }
  };

  public buyNumber = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user?.id) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const {
        country,
        operator,
        product,
        idempotencyKey,
        clientExpectedPrice,
        clientExpectedPriceUsd,
        confirmedPriceShift
      } = req.body;

      if (!country || !product) {
        res.status(400).json({ success: false, error: 'Country and product are required.' });
        return;
      }

      const result = await this.service.buyNumber(req.user.id, {
        country,
        operator,
        product,
        idempotencyKey,
        clientExpectedPrice: clientExpectedPrice ? Number(clientExpectedPrice) : undefined,
        clientExpectedPriceUsd: clientExpectedPriceUsd ? Number(clientExpectedPriceUsd) : undefined,
        confirmedPriceShift: Boolean(confirmedPriceShift)
      });

      if (result.requiresConfirmation) {
        res.json({
          success: false,
          requiresConfirmation: true,
          currentPrice: result.currentPrice,
          expectedPrice: result.expectedPrice,
          currency: result.currency,
          message: result.message
        });
        return;
      }

      // User response: NEVER reveals cost_price, profit, or provider_cost
      const { provider_cost_raw, provider_cost_usd, margin_applied, cost_price, profit, ...safeOrder } = result.order!;

      res.json({
        success: true,
        message: result.message,
        order: safeOrder
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || 'Failed to purchase number' });
    }
  };

  public getOrder = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user?.id) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const orderId = String(req.params.id);
      const order = await this.service.getOrderStatus(orderId, req.user.id);
      const { provider_cost_raw, provider_cost_usd, margin_applied, cost_price, profit, ...safeOrder } = order;

      res.json({ success: true, order: safeOrder });
    } catch (err: any) {
      res.status(404).json({ success: false, error: err.message || 'Order not found' });
    }
  };

  public cancelOrder = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user?.id) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const orderId = String(req.params.id);
      const result = await this.service.cancelOrder(orderId, req.user.id);
      const { provider_cost_raw, provider_cost_usd, margin_applied, cost_price, profit, ...safeOrder } = result.order;

      res.json({
        success: true,
        message: result.message,
        order: safeOrder
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || 'Failed to cancel order' });
    }
  };

  public finishOrder = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user?.id) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const orderId = String(req.params.id);
      const result = await this.service.finishOrder(orderId, req.user.id);
      const { provider_cost_raw, provider_cost_usd, margin_applied, cost_price, profit, ...safeOrder } = result.order;

      res.json({
        success: true,
        message: result.message,
        order: safeOrder
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || 'Failed to finish order' });
    }
  };

  public banOrder = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user?.id) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const orderId = String(req.params.id);
      const result = await this.service.banOrder(orderId, req.user.id);
      const { provider_cost_raw, provider_cost_usd, margin_applied, cost_price, profit, ...safeOrder } = result.order;

      res.json({
        success: true,
        message: result.message,
        order: safeOrder
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || 'Failed to report number' });
    }
  };

  public getUserOrders = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user?.id) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const limit = Number(req.query.limit || 20);
      const offset = Number(req.query.offset || 0);
      const status = req.query.status as string;

      const result = this.service.getUserOrders(req.user.id, { limit, offset, status });
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to load order history' });
    }
  };

  public adminRefundOrder = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (req.user?.role !== 'admin') {
        res.status(403).json({ success: false, error: 'Administrator access required.' });
        return;
      }

      const orderId = String(req.params.id);
      const reason = (req.body.reason as string) || 'Admin Manual Refund';
      const result = await this.service.adminRefundOrder(orderId, req.user.username || 'admin', reason);

      res.json({ success: true, message: result.message, order: result.order });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || 'Failed to refund order' });
    }
  };
}
