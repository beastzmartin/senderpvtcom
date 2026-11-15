import { Request, Response } from 'express';
import { CommissionService } from '../services/CommissionService.js';

export class CommissionController {
  private service = CommissionService.getInstance();

  public listCommissions = async (req: Request, res: Response): Promise<void> => {
    try {
      const rules = this.service.getAllRules();
      res.json({
        success: true,
        count: rules.length,
        rules
      });
    } catch (err: any) {
      console.error('[CommissionController] List error:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to list commission rules' });
    }
  };

  public getProductTypes = async (req: Request, res: Response): Promise<void> => {
    try {
      const productTypes = this.service.getProductTypes();
      res.json({ success: true, productTypes });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to get product types' });
    }
  };

  public createCommission = async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        name,
        product_type,
        target_role,
        target_user_id,
        type,
        percent_value,
        fixed_value,
        min_commission,
        max_commission,
        description,
        enabled
      } = req.body;

      if (!name || !type) {
        res.status(400).json({ success: false, error: 'Rule name and type are required' });
        return;
      }

      const rule = this.service.createRule({
        name,
        product_type,
        target_role,
        target_user_id,
        type,
        percent_value: Number(percent_value || 0),
        fixed_value: Number(fixed_value || 0),
        min_commission: Number(min_commission || 0),
        max_commission: max_commission !== undefined && max_commission !== null ? Number(max_commission) : null,
        description,
        enabled: enabled !== false
      });

      res.status(201).json({
        success: true,
        message: `Commission rule '${rule.name}' established successfully`,
        rule
      });
    } catch (err: any) {
      console.error('[CommissionController] Create error:', err);
      res.status(400).json({ success: false, error: err.message || 'Failed to create commission rule' });
    }
  };

  public updateCommission = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = String(req.params.id);
      const rule = this.service.updateRule(id, req.body);
      res.json({
        success: true,
        message: `Commission rule '${rule.name}' updated successfully`,
        rule
      });
    } catch (err: any) {
      console.error('[CommissionController] Update error:', err);
      res.status(400).json({ success: false, error: err.message || 'Failed to update commission rule' });
    }
  };

  public deleteCommission = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = String(req.params.id);
      const success = this.service.deleteRule(id);
      if (!success) {
        res.status(404).json({ success: false, error: `Rule '${id}' not found` });
        return;
      }
      res.json({
        success: true,
        message: `Commission rule deleted successfully`
      });
    } catch (err: any) {
      console.error('[CommissionController] Delete error:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to delete commission rule' });
    }
  };

  public calculateCommission = async (req: Request, res: Response): Promise<void> => {
    try {
      const { basePrice, product_type, user_id, role } = req.body;
      if (basePrice === undefined || isNaN(Number(basePrice))) {
        res.status(400).json({ success: false, error: 'Valid basePrice is required' });
        return;
      }

      const result = this.service.resolveCommission(
        product_type || 'all_products',
        Number(basePrice),
        user_id || null,
        role || null
      );

      res.json({
        success: true,
        result
      });
    } catch (err: any) {
      console.error('[CommissionController] Calculate error:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to calculate commission' });
    }
  };
}
