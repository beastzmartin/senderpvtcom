import { Request, Response, NextFunction } from 'express';
import { SubscriptionService } from '../services/subscriptionService.js';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';

export class SubscriptionController {
  private subscriptionService: SubscriptionService;

  constructor() {
    this.subscriptionService = SubscriptionService.getInstance();
  }

  public getPlans = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const plans = this.subscriptionService.getPlans();
      res.json({ success: true, plans });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to fetch subscription plans.' });
    }
  };

  public getMyPlan = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const subscription = this.subscriptionService.getUserSubscription(req.user.id);
      res.json({ success: true, subscription });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to fetch user subscription.' });
    }
  };

  public upgrade = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const { planTier, billingCycle } = req.body;
      if (!planTier) {
        res.status(400).json({ error: 'Field "planTier" is required (starter, pro, enterprise).' });
        return;
      }

      const updatedSubscription = this.subscriptionService.upgradePlan(
        req.user.id,
        planTier,
        billingCycle || 'monthly'
      );

      res.json({
        success: true,
        message: `Plan successfully upgraded to ${updatedSubscription.planName}!`,
        subscription: updatedSubscription
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to upgrade plan.' });
    }
  };

  public redeemCode = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const { code } = req.body;
      if (!code || typeof code !== 'string') {
        res.status(400).json({ error: 'Please enter a valid license activation code.' });
        return;
      }

      const result = this.subscriptionService.redeemLicenseKey(req.user.id, code);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to redeem license code.' });
    }
  };

  public adminListCustomers = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const customers = this.subscriptionService.listAllCustomers(req.user.id);
      res.json({ success: true, customers });
    } catch (err: any) {
      res.status(403).json({ error: err.message || 'Access denied' });
    }
  };

  public adminListKeys = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const keys = this.subscriptionService.listLicenseKeys(req.user.id);
      res.json({ success: true, keys });
    } catch (err: any) {
      res.status(403).json({ error: err.message || 'Access denied' });
    }
  };

  public adminGenerateKey = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const { planTier, durationDays, note, maxDevices, dailyLimit } = req.body;
      if (!planTier) {
        res.status(400).json({ error: 'Field "planTier" is required.' });
        return;
      }

      const result = this.subscriptionService.generateLicenseKey(
        req.user.id,
        planTier,
        durationDays !== undefined ? parseInt(durationDays, 10) : 30,
        {
          note,
          maxDevices: maxDevices ? parseInt(maxDevices, 10) : undefined,
          dailyLimit: dailyLimit ? parseInt(dailyLimit, 10) : undefined
        }
      );

      res.status(201).json({
        success: true,
        message: 'License key created successfully',
        key: result
      });
    } catch (err: any) {
      res.status(403).json({ error: err.message || 'Failed to generate key.' });
    }
  };

  public adminBulkGenerateKeys = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const { planTier, durationDays, count, note, maxDevices, dailyLimit } = req.body;
      if (!planTier) {
        res.status(400).json({ error: 'Field "planTier" is required.' });
        return;
      }

      const keys = this.subscriptionService.bulkGenerateLicenseKeys(
        req.user.id,
        planTier,
        durationDays !== undefined ? parseInt(durationDays, 10) : 30,
        count ? parseInt(count, 10) : 5,
        {
          note,
          maxDevices: maxDevices ? parseInt(maxDevices, 10) : undefined,
          dailyLimit: dailyLimit ? parseInt(dailyLimit, 10) : undefined
        }
      );

      res.status(201).json({
        success: true,
        message: `Successfully generated ${keys.length} license key(s).`,
        keys
      });
    } catch (err: any) {
      res.status(403).json({ error: err.message || 'Failed to generate keys.' });
    }
  };

  public adminRevokeKey = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const { keyId } = req.body;
      if (!keyId) {
        res.status(400).json({ error: 'Field "keyId" is required.' });
        return;
      }

      const result = this.subscriptionService.revokeLicenseKey(req.user.id, keyId);
      res.json(result);
    } catch (err: any) {
      res.status(403).json({ error: err.message || 'Failed to revoke key.' });
    }
  };

  public adminDeleteKey = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const keyId = req.params.id as string;
      if (!keyId) {
        res.status(400).json({ error: 'Key ID parameter is required.' });
        return;
      }

      const result = this.subscriptionService.deleteLicenseKey(req.user.id, keyId);
      res.json(result);
    } catch (err: any) {
      res.status(403).json({ error: err.message || 'Failed to delete key.' });
    }
  };

  public adminUpdateCustomer = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const { targetUserId, planTier, subscriptionStatus, durationDays, maxDevices, dailyLimit, extractionLimit } = req.body;
      if (!targetUserId || !planTier) {
        res.status(400).json({ error: 'Fields "targetUserId" and "planTier" are required.' });
        return;
      }

      const updated = this.subscriptionService.adminUpdateCustomerPlan(req.user.id, targetUserId, {
        planTier,
        subscriptionStatus,
        durationDays: durationDays !== undefined ? parseInt(durationDays, 10) : undefined,
        maxDevices: maxDevices !== undefined ? parseInt(maxDevices, 10) : undefined,
        dailyLimit: dailyLimit !== undefined ? parseInt(dailyLimit, 10) : undefined,
        extractionLimit: extractionLimit !== undefined ? parseInt(extractionLimit, 10) : undefined
      });

      res.json({
        success: true,
        message: 'Customer plan & limits updated successfully',
        subscription: updated
      });
    } catch (err: any) {
      res.status(403).json({ error: err.message || 'Failed to update customer plan.' });
    }
  };

  public adminUpdatePlan = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }
      const planId = req.params.id as string;
      const { name, tagline, maxDevices, dailyMessageLimit, dailyExtractionLimit, priceMonthly, priceYearly, features, trialDays } = req.body;

      const updated = this.subscriptionService.adminUpdatePlan(req.user.id, planId, {
        name,
        tagline,
        maxDevices: maxDevices !== undefined ? parseInt(maxDevices, 10) : undefined,
        dailyMessageLimit: dailyMessageLimit !== undefined ? parseInt(dailyMessageLimit, 10) : undefined,
        dailyExtractionLimit: dailyExtractionLimit !== undefined ? parseInt(dailyExtractionLimit, 10) : undefined,
        priceMonthly: priceMonthly !== undefined ? parseInt(priceMonthly, 10) : undefined,
        priceYearly: priceYearly !== undefined ? parseInt(priceYearly, 10) : undefined,
        features,
        trialDays: trialDays !== undefined ? parseInt(trialDays, 10) : undefined
      });

      res.json({
        success: true,
        message: `Plan "${updated.name}" limits updated successfully`,
        plan: updated
      });
    } catch (err: any) {
      res.status(403).json({ error: err.message || 'Failed to update plan limits.' });
    }
  };

  public adminGetSettings = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }
      const settings = this.subscriptionService.adminGetSystemSettings(req.user.id);
      res.json({ success: true, settings });
    } catch (err: any) {
      res.status(403).json({ error: err.message || 'Failed to get system settings.' });
    }
  };

  public adminUpdateSettings = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }
      const settings = this.subscriptionService.adminUpdateSystemSettings(req.user.id, req.body.settings || {});
      res.json({ success: true, message: 'Settings updated successfully', settings });
    } catch (err: any) {
      res.status(403).json({ error: err.message || 'Failed to update system settings.' });
    }
  };

  // ==========================================
  // RESELLER CONTROLLER METHODS
  // ==========================================

  public getResellerStats = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const stats = this.subscriptionService.getResellerStats(req.user.id);
      res.json({ success: true, stats });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to get reseller stats.' });
    }
  };

  public listResellerKeys = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const keys = this.subscriptionService.listResellerKeys(req.user.id);
      res.json({ success: true, keys });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to list reseller keys.' });
    }
  };

  public resellerGenerateKey = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const { planTier, durationDays, note, maxDevices, dailyLimit } = req.body;
      if (!planTier) {
        res.status(400).json({ error: 'Field "planTier" is required.' });
        return;
      }

      const result = this.subscriptionService.generateLicenseKey(
        req.user.id,
        planTier,
        durationDays !== undefined ? parseInt(durationDays, 10) : 30,
        {
          note,
          maxDevices: maxDevices ? parseInt(maxDevices, 10) : undefined,
          dailyLimit: dailyLimit ? parseInt(dailyLimit, 10) : undefined
        }
      );

      res.status(201).json({
        success: true,
        message: 'Reseller license key generated successfully',
        key: result
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to generate reseller key.' });
    }
  };

  public resellerBulkGenerateKeys = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const { planTier, durationDays, count, note, maxDevices, dailyLimit } = req.body;
      if (!planTier) {
        res.status(400).json({ error: 'Field "planTier" is required.' });
        return;
      }

      const keys = this.subscriptionService.bulkGenerateLicenseKeys(
        req.user.id,
        planTier,
        durationDays !== undefined ? parseInt(durationDays, 10) : 30,
        count ? parseInt(count, 10) : 1,
        {
          note,
          maxDevices: maxDevices ? parseInt(maxDevices, 10) : undefined,
          dailyLimit: dailyLimit ? parseInt(dailyLimit, 10) : undefined
        }
      );

      res.status(201).json({
        success: true,
        message: `Successfully generated ${keys.length} reseller license key(s).`,
        keys
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to generate reseller keys.' });
    }
  };

  public resellerRevokeKey = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const { keyId } = req.body;
      if (!keyId) {
        res.status(400).json({ error: 'Field "keyId" is required.' });
        return;
      }

      const result = this.subscriptionService.revokeResellerKey(req.user.id, keyId);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to revoke reseller key.' });
    }
  };

  // ==========================================
  // ADMIN RESELLER MANAGEMENT METHODS
  // ==========================================

  public adminListResellers = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const resellers = this.subscriptionService.listAllResellers(req.user.id);
      res.json({ success: true, resellers });
    } catch (err: any) {
      res.status(403).json({ error: err.message || 'Access denied.' });
    }
  };

  public adminSetResellerQuota = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const { targetUserId, quota } = req.body;
      if (!targetUserId || quota === undefined) {
        res.status(400).json({ error: 'Fields "targetUserId" and "quota" are required.' });
        return;
      }

      const result = this.subscriptionService.setResellerQuota(req.user.id, targetUserId, quota);
      res.json(result);
    } catch (err: any) {
      res.status(403).json({ error: err.message || 'Failed to set reseller quota.' });
    }
  };

  public adminAddResellerCredits = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const { targetUserId, additionalCredits } = req.body;
      if (!targetUserId || !additionalCredits) {
        res.status(400).json({ error: 'Fields "targetUserId" and "additionalCredits" are required.' });
        return;
      }

      const result = this.subscriptionService.addResellerCredits(req.user.id, targetUserId, additionalCredits);
      res.json(result);
    } catch (err: any) {
      res.status(403).json({ error: err.message || 'Failed to add reseller credits.' });
    }
  };

  public adminDemoteReseller = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const targetUserId = req.params.userId as string;
      if (!targetUserId) {
        res.status(400).json({ error: 'Parameter "userId" is required.' });
        return;
      }

      const result = this.subscriptionService.demoteReseller(req.user.id, targetUserId);
      res.json(result);
    } catch (err: any) {
      res.status(403).json({ error: err.message || 'Failed to demote reseller.' });
    }
  };
}

