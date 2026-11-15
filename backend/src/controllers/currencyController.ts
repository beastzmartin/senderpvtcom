import { Request, Response } from 'express';
import { CurrencyService } from '../services/virtualNumber/CurrencyService.js';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';

export class CurrencyController {
  private service: CurrencyService;

  constructor() {
    this.service = CurrencyService.getInstance();
  }

  /**
   * GET /api/currency/list
   * Public list of all available active currencies
   */
  public listCurrencies = async (req: Request, res: Response): Promise<void> => {
    try {
      const currencies = this.service.getAllCurrencies(true);
      res.json({ success: true, count: currencies.length, currencies });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to list currencies' });
    }
  };

  /**
   * GET /api/currency/user
   * Get user's preferred currency and current wallet balance
   */
  public getUserCurrency = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user?.id) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const info = this.service.getUserCurrency(req.user.id);
      res.json({ success: true, ...info });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to get user currency' });
    }
  };

  /**
   * POST /api/currency/switch
   * Switch user's wallet currency and platform display currency
   */
  public switchCurrency = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user?.id) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const { currency } = req.body;
      if (!currency || typeof currency !== 'string') {
        res.status(400).json({ success: false, error: 'Currency code is required.' });
        return;
      }

      const result = this.service.switchUserCurrency(req.user.id, currency);
      res.json({
        message: `Successfully switched currency to ${result.newCurrency}`,
        ...result
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || 'Failed to switch currency' });
    }
  };
}
