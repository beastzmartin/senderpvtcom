import { Request, Response, NextFunction } from 'express';
import { WhatsAppManager } from '../services/whatsapp/WhatsAppManager.js';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { SubscriptionService } from '../services/subscriptionService.js';

export class WhatsAppController {
  private whatsappManager: WhatsAppManager;

  constructor() {
    this.whatsappManager = WhatsAppManager.getInstance();
  }

  public getStatus = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      const sessionId = req.query.sessionId as string | undefined;
      const status = this.whatsappManager.getStatus(sessionId, userId);
      const accountInfo = this.whatsappManager.getAccountInfo(sessionId, userId);
      const qrState = this.whatsappManager.getQR(sessionId, userId);
      const activeSessionId = this.whatsappManager.getActiveSessionId(userId);

      res.json({
        status,
        provider: this.whatsappManager.getProviderName(sessionId, userId),
        connected: status === 'connected',
        accountInfo,
        hasQr: !!qrState,
        qrExpiresIn: qrState ? Math.max(0, 60 - Math.floor((Date.now() - qrState.generatedAt) / 1000)) : 0,
        activeSessionId
      });
    } catch (err) {
      next(err);
    }
  };

  public getQR = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      const sessionId = req.query.sessionId as string | undefined;
      const qrState = this.whatsappManager.getQR(sessionId, userId);
      const status = this.whatsappManager.getStatus(sessionId, userId);

      if (status === 'connected') {
        res.json({
          status: 'connected',
          message: 'WhatsApp device is already connected. QR code is not available.',
          qr: null,
          qrDataUrl: null
        });
        return;
      }

      if (!qrState) {
        res.json({
          status,
          message: status === 'connecting' ? 'Generating QR code, please wait...' : 'WhatsApp is disconnected. Click Connect to generate QR.',
          qr: null,
          qrDataUrl: null
        });
        return;
      }

      res.json({
        status,
        qr: qrState.qr,
        qrDataUrl: qrState.qrDataUrl,
        generatedAt: qrState.generatedAt,
        expiresInSeconds: Math.max(0, 60 - Math.floor((Date.now() - qrState.generatedAt) / 1000))
      });
    } catch (err) {
      next(err);
    }
  };

  public connect = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      let sessionId = (req.query.sessionId || req.body?.sessionId) as string | undefined;

      if (userId) {
        const sub = SubscriptionService.getInstance().getUserSubscription(userId);
        if (sub.status === 'expired' && sub.role !== 'admin') {
          res.status(403).json({
            error: 'Your license has expired. Please activate a valid license key in the License System.',
            licenseExpired: true
          });
          return;
        }
      }

      // If user has no sessions, create their first session
      if (userId && !sessionId) {
        const userSessions = this.whatsappManager.getAllSessions(userId);
        if (userSessions.length === 0) {
          const newDev = await this.whatsappManager.createSession(userId, 'Primary Device');
          sessionId = newDev.session_id;
        }
      }

      const forceNew = req.query.fresh === 'true' || req.body?.forceNew === true;
      if (forceNew) {
        this.whatsappManager.resetSession(sessionId, userId).catch((err) => {
          console.error('[WhatsApp Controller] Error resetting session:', err);
        });
        res.json({
          success: true,
          status: 'connecting',
          message: 'Previous credentials cleared. Generating fresh QR code...'
        });
        return;
      }

      const currentStatus = this.whatsappManager.getStatus(sessionId, userId);
      if (currentStatus === 'connected') {
        res.json({
          success: true,
          status: 'connected',
          message: 'WhatsApp device is already connected.',
          accountInfo: this.whatsappManager.getAccountInfo(sessionId, userId)
        });
        return;
      }

      // Trigger connection asynchronously
      this.whatsappManager.connect(sessionId, userId).catch((err) => {
        console.error('[WhatsApp Controller] Error during connect:', err);
      });

      res.json({
        success: true,
        status: 'connecting',
        message: 'WhatsApp connection initiated. Scan QR code once rendered.'
      });
    } catch (err) {
      next(err);
    }
  };

  public resetSession = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      const sessionId = (req.query.sessionId || req.body?.sessionId) as string | undefined;
      this.whatsappManager.resetSession(sessionId, userId).catch((err) => {
        console.error('[WhatsApp Controller] Error resetting session:', err);
      });

      res.json({
        success: true,
        status: 'connecting',
        message: 'Previous credentials cleared. Generating fresh QR code to link account...'
      });
    } catch (err) {
      next(err);
    }
  };

  public disconnect = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      const sessionId = (req.query.sessionId || req.body?.sessionId) as string | undefined;
      await this.whatsappManager.disconnect(sessionId, userId);
      res.json({
        success: true,
        status: 'disconnected',
        message: 'WhatsApp device has been disconnected successfully.'
      });
    } catch (err) {
      next(err);
    }
  };

  public checkNumber = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      const phone = req.query.phone as string;
      const sessionId = req.query.sessionId as string | undefined;
      if (!phone) {
        res.status(400).json({ error: 'Query parameter "phone" is required.' });
        return;
      }

      const result = await this.whatsappManager.checkNumberExists(phone, sessionId, userId);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  // ================= MULTI-DEVICE MANAGEMENT ENDPOINTS =================

  public getDevices = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      const devices = this.whatsappManager.getAllSessions(userId);
      res.json({
        success: true,
        devices,
        activeSessionId: this.whatsappManager.getActiveSessionId(userId)
      });
    } catch (err) {
      next(err);
    }
  };

  public createDevice = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const subscriptionService = SubscriptionService.getInstance();
      const sub = subscriptionService.getUserSubscription(userId);
      if (sub.status === 'expired' && sub.role !== 'admin') {
        res.status(403).json({
          error: 'Your license has expired. Please activate a valid license key in the License System.',
          licenseExpired: true
        });
        return;
      }
      if (sub.connectedDevices >= sub.maxDevices && sub.role !== 'admin') {
        res.status(403).json({
          error: `Device limit reached (${sub.connectedDevices}/${sub.maxDevices} devices). Please upgrade your license to connect more WhatsApp accounts.`,
          upgradeRequired: true,
          currentPlan: sub.planTier,
          maxDevices: sub.maxDevices
        });
        return;
      }

      const alias = req.body?.alias as string | undefined;
      const device = await this.whatsappManager.createSession(userId, alias);
      res.json({
        success: true,
        device,
        message: `New WhatsApp device account "${device.alias}" created successfully.`
      });
    } catch (err) {
      next(err);
    }
  };

  public deleteDevice = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      const sessionId = String(req.params.sessionId);
      await this.whatsappManager.deleteSession(sessionId, userId);
      res.json({
        success: true,
        message: `Device account [${sessionId}] deleted successfully.`
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to delete device' });
    }
  };

  public setDefaultDevice = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      const sessionId = String(req.params.sessionId);
      await this.whatsappManager.setDefaultSession(sessionId, userId);
      res.json({
        success: true,
        message: `Primary active device switched to [${sessionId}].`
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to set default device' });
    }
  };

  public updateDeviceAlias = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      const sessionId = String(req.params.sessionId);
      const alias = req.body?.alias as string;
      if (!alias) {
        res.status(400).json({ error: 'Device alias name is required' });
        return;
      }
      await this.whatsappManager.updateSessionAlias(sessionId, alias, userId);
      res.json({
        success: true,
        message: `Device name updated to "${alias.trim()}".`
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to update device alias' });
    }
  };

  public getDeviceQR = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      const sessionId = String(req.params.sessionId);
      const qrState = this.whatsappManager.getQR(sessionId, userId);
      const status = this.whatsappManager.getStatus(sessionId, userId);

      res.json({
        sessionId,
        status,
        qr: qrState?.qr || null,
        qrDataUrl: qrState?.qrDataUrl || null,
        expiresInSeconds: qrState ? Math.max(0, 60 - Math.floor((Date.now() - qrState.generatedAt) / 1000)) : 0
      });
    } catch (err) {
      next(err);
    }
  };

  public connectDevice = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      const sessionId = String(req.params.sessionId);
      this.whatsappManager.connect(sessionId, userId).catch((err) => {
        console.error(`[WhatsApp Controller] Error connecting [${sessionId}]:`, err);
      });
      res.json({
        success: true,
        status: 'connecting',
        message: `Device [${sessionId}] connection initiated.`
      });
    } catch (err) {
      next(err);
    }
  };

  public disconnectDevice = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      const sessionId = String(req.params.sessionId);
      await this.whatsappManager.disconnect(sessionId, userId);
      res.json({
        success: true,
        status: 'disconnected',
        message: `Device [${sessionId}] disconnected.`
      });
    } catch (err) {
      next(err);
    }
  };

  public resetDevice = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      const sessionId = String(req.params.sessionId);
      this.whatsappManager.resetSession(sessionId, userId).catch((err) => {
        console.error(`[WhatsApp Controller] Error resetting [${sessionId}]:`, err);
      });
      res.json({
        success: true,
        status: 'connecting',
        message: `Device [${sessionId}] reset. Fresh QR pairing initiated.`
      });
    } catch (err) {
      next(err);
    }
  };
}
