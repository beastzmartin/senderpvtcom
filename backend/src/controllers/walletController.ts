import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { WalletService } from '../services/walletService.js';

export class WalletController {
  private walletService: WalletService;

  constructor() {
    this.walletService = WalletService.getInstance();
  }

  public getWallet = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const wallet = this.walletService.getOrCreateWallet(userId);
      res.json(wallet);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public getTransactions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const transactions = this.walletService.listTransactions(userId, limit);
      res.json(transactions);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public topUp = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { amount, description, referenceId } = req.body;

      if (!amount || Number(amount) <= 0) {
        res.status(400).json({ error: 'Top-up amount must be a positive number.' });
        return;
      }

      const result = this.walletService.topUp(
        userId,
        Number(amount),
        description || 'Manual Wallet Top-Up',
        referenceId
      );

      res.status(200).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  public adminAdjust = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const adminUserId = req.user!.id;
      const { targetUserId, amount, reason } = req.body;

      if (!targetUserId || amount === undefined || isNaN(Number(amount))) {
        res.status(400).json({ error: 'targetUserId and valid numeric amount are required.' });
        return;
      }

      if (!reason || !reason.trim()) {
        res.status(400).json({ error: 'Reason for admin adjustment is required for auditing.' });
        return;
      }

      const result = this.walletService.adminAdjust(
        adminUserId,
        targetUserId,
        Number(amount),
        reason.trim()
      );

      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  public getSpendLimits = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const status = this.walletService.getSpendLimitStatus(userId);
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public setSpendLimits = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { daily, monthly, perJob } = req.body;
      const updated = this.walletService.setSpendLimits(userId, {
        daily: daily !== undefined ? Number(daily) : undefined,
        monthly: monthly !== undefined ? Number(monthly) : undefined,
        perJob: perJob !== undefined ? Number(perJob) : undefined
      });
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  public reconcile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const result = this.walletService.reconcileUserWallet(userId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };
}

