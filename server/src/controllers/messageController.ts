import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { MessageService } from '../services/messageService.js';
import { BulkCampaignService } from '../services/bulkCampaignService.js';
import { SubscriptionService } from '../services/subscriptionService.js';
import { getSocketIO } from '../socket/socketManager.js';

export class MessageController {
  private messageService: MessageService;
  private bulkCampaignService: BulkCampaignService;

  constructor() {
    this.messageService = MessageService.getInstance();
    this.bulkCampaignService = BulkCampaignService.getInstance();
  }

  private checkLicense(userId?: string): void {
    if (!userId) return;
    const sub = SubscriptionService.getInstance().getUserSubscription(userId);
    if (sub.status === 'expired' && sub.role !== 'admin') {
      const err: any = new Error('Your license has expired. Please activate a valid license key in the License System.');
      err.statusCode = 403;
      err.licenseExpired = true;
      throw err;
    }
  }

  private emitToUser(userId: string | undefined, event: string, data: any) {
    const io = getSocketIO();
    if (!io) return;
    if (userId) {
      io.to(`user:${userId}`).emit(event, data);
    } else {
      io.emit(event, data);
    }
  }

  public sendMessage = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { recipient, message, identifierType, sessionId, useRoundRobin } = req.body;
      const userId = req.user?.id;
      this.checkLicense(userId);

      if (!recipient || typeof recipient !== 'string' || recipient.trim() === '') {
        res.status(400).json({ error: 'Field "recipient" is required and cannot be empty.' });
        return;
      }

      if (!message || typeof message !== 'string' || message.trim() === '') {
        res.status(400).json({ error: 'Field "message" is required and cannot be empty.' });
        return;
      }

      const record = await this.messageService.dispatchMessage({
        recipient: recipient.trim(),
        message: message.trim(),
        identifierType,
        sessionId,
        useRoundRobin: Boolean(useRoundRobin)
      }, userId);

      this.emitToUser(userId, 'message:sent', record);
      this.emitToUser(userId, 'conversation:updated', { identifier: recipient });

      res.status(201).json({
        success: true,
        message: 'Message dispatched successfully',
        data: record
      });
    } catch (err: any) {
      if ((err as any).messageRecord) {
        this.emitToUser(req.user?.id, 'message:failed', (err as any).messageRecord);
      }
      res.status(err.statusCode || 400).json({
        success: false,
        error: err.message || 'Failed to dispatch message',
        licenseExpired: !!err.licenseExpired
      });
    }
  };

  public sendPhone = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { phoneNumber, phone, message, sessionId, useRoundRobin } = req.body;
      const targetPhone = phoneNumber || phone;
      const userId = req.user?.id;
      this.checkLicense(userId);

      if (!targetPhone || typeof targetPhone !== 'string' || targetPhone.trim() === '') {
        res.status(400).json({ error: 'Field "phoneNumber" is required.' });
        return;
      }

      if (!message || typeof message !== 'string' || message.trim() === '') {
        res.status(400).json({ error: 'Field "message" is required.' });
        return;
      }

      const record = await this.messageService.sendMessageToPhone(
        targetPhone.trim(),
        message.trim(),
        sessionId,
        Boolean(useRoundRobin),
        userId
      );

      this.emitToUser(userId, 'message:sent', record);
      this.emitToUser(userId, 'conversation:updated', { identifier: targetPhone });

      res.status(201).json({
        success: true,
        message: 'Message sent to phone number successfully',
        data: record
      });
    } catch (err: any) {
      if ((err as any).messageRecord) {
        this.emitToUser(req.user?.id, 'message:failed', (err as any).messageRecord);
      }
      res.status(err.statusCode || 400).json({
        success: false,
        error: err.message || 'Failed to send message to phone number',
        licenseExpired: !!err.licenseExpired
      });
    }
  };

  public sendLid = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { lid, message, sessionId, useRoundRobin } = req.body;
      const userId = req.user?.id;
      this.checkLicense(userId);

      if (!lid || typeof lid !== 'string' || lid.trim() === '') {
        res.status(400).json({ error: 'Field "lid" is required (e.g. 7757465940199@lid or 7757465940199).' });
        return;
      }

      if (!message || typeof message !== 'string' || message.trim() === '') {
        res.status(400).json({ error: 'Field "message" is required.' });
        return;
      }

      const record = await this.messageService.sendMessageToLid(
        lid.trim(),
        message.trim(),
        {
          simulateTyping: true,
          typingDelayMs: 1500,
          sessionId,
          useRoundRobin: Boolean(useRoundRobin)
        },
        userId
      );

      this.emitToUser(userId, 'message:sent', record);
      this.emitToUser(userId, 'conversation:updated', { identifier: lid });

      res.status(201).json({
        success: true,
        message: 'Message sent to WhatsApp LID successfully',
        data: record
      });
    } catch (err: any) {
      if ((err as any).messageRecord) {
        this.emitToUser(req.user?.id, 'message:failed', (err as any).messageRecord);
      }
      res.status(err.statusCode || 400).json({
        success: false,
        error: err.message || 'Failed to send message to WhatsApp LID',
        licenseExpired: !!err.licenseExpired
      });
    }
  };

  public sendBulkLid = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { lids, message, delayMs } = req.body;
      const userId = req.user?.id;
      this.checkLicense(userId);

      if (!Array.isArray(lids) || lids.length === 0) {
        res.status(400).json({ error: 'Field "lids" must be a non-empty array of WhatsApp LID strings.' });
        return;
      }

      if (!message || typeof message !== 'string' || message.trim() === '') {
        res.status(400).json({ error: 'Field "message" is required and cannot be empty.' });
        return;
      }

      const summary = await this.messageService.sendBulkLidMessages({
        lids,
        message: message.trim(),
        delayMs: typeof delayMs === 'number' ? delayMs : 1500,
        onProgress: (progress) => {
          this.emitToUser(userId, 'bulk:progress', progress);
        }
      }, userId);

      res.json({
        success: true,
        message: `Bulk LID dispatch finished. ${summary.sent} sent, ${summary.failed} failed.`,
        data: summary
      });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({
        success: false,
        error: err.message || 'Failed to execute bulk LID dispatch',
        licenseExpired: !!err.licenseExpired
      });
    }
  };

  public getMessages = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const conversationId = req.query.conversationId as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
      const userId = req.user?.id;

      const messages = this.messageService.getMessages({ conversationId, limit, offset }, userId);
      res.json({
        data: messages,
        count: messages.length,
        limit,
        offset
      });
    } catch (err) {
      next(err);
    }
  };

  public getDashboardStats = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const stats = this.messageService.getDashboardStats(req.user?.id);
      res.json(stats);
    } catch (err) {
      next(err);
    }
  };

  // ==========================================
  // BULK CAMPAIGN & ANTI-BAN CONTROLLER METHODS
  // ==========================================

  public createCampaign = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, lids, templateMessage, settings, autoStart } = req.body;
      const userId = req.user?.id;
      this.checkLicense(userId);

      const campaign = this.bulkCampaignService.createCampaign({
        name,
        lids,
        templateMessage,
        settings
      }, userId);

      if (autoStart) {
        await this.bulkCampaignService.startCampaign(campaign.id, undefined, userId);
      }

      res.status(201).json({
        success: true,
        message: 'Bulk campaign created successfully',
        data: campaign
      });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({
        success: false,
        error: err.message || 'Failed to create bulk campaign',
        licenseExpired: !!err.licenseExpired
      });
    }
  };

  public listCampaigns = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 30;
      const campaigns = this.bulkCampaignService.listCampaigns(limit, req.user?.id);
      res.json({
        success: true,
        data: campaigns
      });
    } catch (err: any) {
      next(err);
    }
  };

  public getCampaignDetails = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const statusFilter = req.query.status as string | undefined;
      const search = req.query.search as string | undefined;

      const details = this.bulkCampaignService.getCampaignDetails(id, statusFilter, search, req.user?.id);
      if (!details) {
        res.status(404).json({ success: false, error: 'Campaign not found' });
        return;
      }

      res.json({
        success: true,
        data: details
      });
    } catch (err: any) {
      next(err);
    }
  };

  public startCampaign = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const maxToSend = req.body?.maxToSend ? parseInt(req.body.maxToSend, 10) : undefined;
      this.checkLicense(req.user?.id);
      const campaign = await this.bulkCampaignService.startCampaign(id, { maxToSend }, req.user?.id);
      res.json({
        success: true,
        message: maxToSend ? `Started batch run for up to ${maxToSend} recipient(s)` : 'Campaign started successfully',
        data: campaign
      });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({
        success: false,
        error: err.message || 'Failed to start campaign',
        licenseExpired: !!err.licenseExpired
      });
    }
  };

  public checkDuplicates = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { lids, scope } = req.body;
      if (!Array.isArray(lids)) {
        res.status(400).json({ success: false, error: 'lids must be an array' });
        return;
      }
      const result = this.bulkCampaignService.checkDuplicates(lids, scope || 'all_time', req.user?.id);
      res.json({
        success: true,
        data: result
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: err.message || 'Failed to check duplicates'
      });
    }
  };

  public pauseCampaign = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const campaign = this.bulkCampaignService.pauseCampaign(id, req.user?.id);
      res.json({
        success: true,
        message: 'Campaign paused successfully',
        data: campaign
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: err.message || 'Failed to pause campaign'
      });
    }
  };

  public stopCampaign = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const campaign = this.bulkCampaignService.stopCampaign(id, req.user?.id);
      res.json({
        success: true,
        message: 'Campaign stopped successfully',
        data: campaign
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: err.message || 'Failed to stop campaign'
      });
    }
  };

  public retryFailedRecipients = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const campaign = await this.bulkCampaignService.retryFailed(id, req.user?.id);
      res.json({
        success: true,
        message: 'Failed recipients queued for retry',
        data: campaign
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: err.message || 'Failed to retry failed recipients'
      });
    }
  };

  public retrySingleRecipient = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const recipientId = req.params.recipientId as string;
      const recipient = await this.bulkCampaignService.retrySingleRecipient(id, recipientId, req.user?.id);
      res.json({
        success: true,
        message: 'Recipient message re-dispatched',
        data: recipient
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: err.message || 'Failed to retry recipient message'
      });
    }
  };

  public deleteCampaign = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      this.bulkCampaignService.deleteCampaign(id, req.user?.id);
      res.json({
        success: true,
        message: 'Campaign deleted successfully'
      });
    } catch (err: any) {
      next(err);
    }
  };

  public getDailyQuota = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const quota = this.bulkCampaignService.getDailyQuota(req.user?.id);
      res.json({
        success: true,
        data: quota
      });
    } catch (err: any) {
      next(err);
    }
  };

  public updateDailyQuota = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { limit } = req.body;
      if (typeof limit !== 'number' || limit <= 0) {
        res.status(400).json({ error: 'Field "limit" must be a positive number.' });
        return;
      }
      const quota = this.bulkCampaignService.updateDailyLimit(limit, req.user?.id);
      res.json({
        success: true,
        message: `Daily safe sending limit updated to ${limit}`,
        data: quota
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: err.message || 'Failed to update daily quota limit'
      });
    }
  };
}
