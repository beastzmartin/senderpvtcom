import { Request, Response } from 'express';
import { CurrencyService } from '../services/virtualNumber/CurrencyService.js';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';

export class CurrencyAdminController {
  private service: CurrencyService;

  constructor() {
    this.service = CurrencyService.getInstance();
  }

  /**
   * GET /api/admin/currency
   * List all currencies with administrative exchange rates
   */
  public getAllCurrencies = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const currencies = this.service.getAllCurrencies(false);
      res.json({ success: true, count: currencies.length, currencies });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to list administrative currencies' });
    }
  };

  /**
   * POST /api/admin/currency
   * Add or register a new currency with 5SIM base exchange rate
   */
  public addCurrency = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { code, name, symbol, rate_from_5sim_base, is_default, is_active } = req.body;

      if (!code || !name || !symbol || rate_from_5sim_base === undefined) {
        res.status(400).json({
          success: false,
          error: 'Fields code, name, symbol, and rate_from_5sim_base are required.'
        });
        return;
      }

      const record = this.service.saveCurrency({
        code: String(code),
        name: String(name),
        symbol: String(symbol),
        rate_from_5sim_base: Number(rate_from_5sim_base),
        is_default: Boolean(is_default),
        is_active: is_active !== false
      });

      res.status(201).json({
        success: true,
        message: `Currency '${record.code}' successfully saved.`,
        currency: record
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || 'Failed to save currency' });
    }
  };

  /**
   * PUT /api/admin/currency/:code
   * Update currency rate or configuration
   */
  public updateCurrency = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const code = String(req.params.code);
      const updates = req.body;

      const record = this.service.updateCurrency(code, updates);
      res.json({
        success: true,
        message: `Currency '${record.code}' updated successfully.`,
        currency: record
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || 'Failed to update currency' });
    }
  };

  /**
   * DELETE /api/admin/currency/:code
   * Delete a currency
   */
  public deleteCurrency = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const code = String(req.params.code);
      const deleted = this.service.deleteCurrency(code);

      if (!deleted) {
        res.status(404).json({ success: false, error: `Currency '${code}' not found.` });
        return;
      }

      res.json({ success: true, message: `Currency '${code}' deleted successfully.` });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || 'Failed to delete currency' });
    }
  };
}
