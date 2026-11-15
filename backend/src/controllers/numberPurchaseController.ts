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
      const countries = await this.service.getCountries();
      res.json({ success: true, count: countries.length, countries });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to load countries' });
    }
  };

  public getProducts = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const country = (req.query.country as string) || 'any';
      const products = await this.service.getProducts(country);
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
      const data = await this.service.getPrices(country, product, isAdmin);
      res.json({ success: true, ...data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to fetch prices' });
    }
  };

  public buyNumber = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user?.id) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const { country, operator, product, idempotencyKey } = req.body;
      if (!country || !product) {
        res.status(400).json({ success: false, error: 'Country and product are required.' });
        return;
      }

      const result = await this.service.buyNumber(req.user.id, {
        country,
        operator,
        product,
        idempotencyKey
      });

      // User response: NEVER reveals cost_price or profit
      const { cost_price, profit, ...safeOrder } = result.order;

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
      const { cost_price, profit, ...safeOrder } = order;

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
      const { cost_price, profit, ...safeOrder } = result.order;

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
      const { cost_price, profit, ...safeOrder } = result.order;

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
      const { cost_price, profit, ...safeOrder } = result.order;

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
}
