import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { GroupJoinerService } from '../services/groupJoinerService.js';
import { SubscriptionService } from '../services/subscriptionService.js';

export class GroupJoinerController {
  private service: GroupJoinerService;
  private subscriptionService: SubscriptionService;

  constructor() {
    this.service = GroupJoinerService.getInstance();
    this.subscriptionService = SubscriptionService.getInstance();
  }

  private checkLicense(userId?: string): void {
    if (!userId) return;
    const sub = this.subscriptionService.getUserSubscription(userId);
    if (sub.status === 'expired' && sub.role !== 'admin') {
      const err: any = new Error('Your license has expired. Please activate a valid license key.');
      err.statusCode = 403;
      throw err;
    }
  }

  public parseLinks = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { text } = req.body;
      const links = this.service.parseLinks(text || '');
      res.json({ success: true, count: links.length, links });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to parse links.' });
    }
  };

  public inspectLinks = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.checkLicense(req.user?.id);
      const { links, sessionId } = req.body;
      if (!Array.isArray(links) || links.length === 0) {
        res.status(400).json({ error: 'Please provide an array of WhatsApp group invite links.' });
        return;
      }

      const results = await this.service.inspectLinks(links, sessionId, req.user?.id);
      res.json({ success: true, count: results.length, results });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to inspect group links.' });
    }
  };

  public joinSingle = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.checkLicense(req.user?.id);
      const { link, sessionId } = req.body;
      if (!link) {
        res.status(400).json({ error: 'Link or invite code is required.' });
        return;
      }

      const result = await this.service.joinSingle(link, sessionId, req.user?.id);
      res.json({ success: result.success, result });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to join group.' });
    }
  };

  public createCampaign = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      this.checkLicense(userId);

      const { name, links, settings, autoStart } = req.body;
      if (!Array.isArray(links) || links.length === 0) {
        res.status(400).json({ error: 'Please provide at least one group invite link.' });
        return;
      }

      const campaign = this.service.createCampaign(userId, { name, links, settings });

      if (autoStart) {
        await this.service.startCampaign(campaign.id, userId);
      }

      const updated = this.service.getCampaign(campaign.id, userId);
      res.status(201).json({
        success: true,
        message: `Join campaign "${campaign.name}" created with ${campaign.total_links} links.`,
        campaign: updated
      });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to create join campaign.' });
    }
  };

  public startCampaign = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      this.checkLicense(userId);

      const campaignId = req.params.id as string;
      await this.service.startCampaign(campaignId, userId);
      res.json({ success: true, message: 'Group joiner campaign started.' });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to start join campaign.' });
    }
  };

  public pauseCampaign = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const campaignId = req.params.id as string;
      this.service.pauseCampaign(campaignId, userId);
      res.json({ success: true, message: 'Group joiner campaign paused.' });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to pause join campaign.' });
    }
  };

  public stopCampaign = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const campaignId = req.params.id as string;
      this.service.stopCampaign(campaignId, userId);
      res.json({ success: true, message: 'Group joiner campaign stopped.' });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to stop join campaign.' });
    }
  };

  public listCampaigns = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const campaigns = this.service.listCampaigns(userId);
      res.json({ success: true, campaigns, count: campaigns.length });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to list join campaigns.' });
    }
  };

  public getCampaign = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      const campaignId = req.params.id as string;
      const campaign = this.service.getCampaign(campaignId, userId);

      if (!campaign) {
        res.status(404).json({ error: 'Campaign not found' });
        return;
      }

      res.json({ success: true, campaign });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to get join campaign.' });
    }
  };

  public deleteCampaign = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const campaignId = req.params.id as string;
      this.service.deleteCampaign(campaignId, userId);
      res.json({ success: true, message: 'Campaign deleted.' });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to delete campaign.' });
    }
  };
}

