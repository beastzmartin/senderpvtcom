import { Response, NextFunction } from 'express';
import { BroadcastSchedulerService } from '../services/broadcastSchedulerService.js';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';

export class SchedulerController {
  private schedulerService: BroadcastSchedulerService;

  constructor() {
    this.schedulerService = BroadcastSchedulerService.getInstance();
  }

  public listSchedules = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schedules = this.schedulerService.listSchedules(req.user?.id);
      res.json({
        success: true,
        data: schedules,
        count: schedules.length
      });
    } catch (err) {
      next(err);
    }
  };

  public getSchedule = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const statusFilter = req.query.status as string | undefined;
      const details = this.schedulerService.getScheduleDetails(id, statusFilter, req.user?.id);
      if (!details) {
        res.status(404).json({ success: false, error: 'Schedule not found' });
        return;
      }
      res.json({ success: true, data: details });
    } catch (err) {
      next(err);
    }
  };

  public createSchedule = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, templateId, templateContent, dailyLimit, scheduledTime, recipients, settings } = req.body;
      const schedule = this.schedulerService.createSchedule({
        name,
        templateId,
        templateContent,
        dailyLimit: typeof dailyLimit === 'number' ? dailyLimit : 20,
        scheduledTime,
        recipients,
        settings
      }, req.user?.id);
      res.status(201).json({
        success: true,
        message: 'Broadcast schedule created successfully',
        data: schedule
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || 'Failed to create schedule' });
    }
  };

  public pauseSchedule = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const schedule = this.schedulerService.pauseSchedule(id, req.user?.id);
      res.json({
        success: true,
        message: 'Schedule paused successfully',
        data: schedule
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || 'Failed to pause schedule' });
    }
  };

  public resumeSchedule = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const schedule = this.schedulerService.resumeSchedule(id, req.user?.id);
      res.json({
        success: true,
        message: 'Schedule resumed successfully',
        data: schedule
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || 'Failed to resume schedule' });
    }
  };

  public runBatchNow = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const result = await this.schedulerService.runBatchNow(id, req.user?.id);
      res.json({
        success: true,
        message: `Batch executed: ${result.sent} sent, ${result.failed} failed. (${result.remaining} remaining)`,
        data: result
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || 'Failed to run batch' });
    }
  };

  public deleteSchedule = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      this.schedulerService.deleteSchedule(id, req.user?.id);
      res.json({
        success: true,
        message: 'Schedule deleted successfully'
      });
    } catch (err) {
      next(err);
    }
  };
}
