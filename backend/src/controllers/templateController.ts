import { Response, NextFunction } from 'express';
import { TemplateService } from '../services/templateService.js';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';

export class TemplateController {
  private templateService: TemplateService;

  constructor() {
    this.templateService = TemplateService.getInstance();
  }

  public listTemplates = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const category = req.query.category as string | undefined;
      const search = req.query.search as string | undefined;
      const templates = this.templateService.listTemplates(category, search, req.user?.id);
      res.json({
        success: true,
        data: templates,
        count: templates.length
      });
    } catch (err) {
      next(err);
    }
  };

  public getTemplate = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const template = this.templateService.getTemplateById(id, req.user?.id);
      if (!template) {
        res.status(404).json({ success: false, error: 'Template not found' });
        return;
      }
      res.json({ success: true, data: template });
    } catch (err) {
      next(err);
    }
  };

  public createTemplate = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, category, content } = req.body;
      const template = this.templateService.createTemplate({ name, category, content }, req.user?.id);
      res.status(201).json({
        success: true,
        message: 'Template created successfully',
        data: template
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || 'Failed to create template' });
    }
  };

  public updateTemplate = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const { name, category, content } = req.body;
      const template = this.templateService.updateTemplate(id, { name, category, content }, req.user?.id);
      res.json({
        success: true,
        message: 'Template updated successfully',
        data: template
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || 'Failed to update template' });
    }
  };

  public deleteTemplate = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      this.templateService.deleteTemplate(id, req.user?.id);
      res.json({
        success: true,
        message: 'Template deleted successfully'
      });
    } catch (err) {
      next(err);
    }
  };
}
