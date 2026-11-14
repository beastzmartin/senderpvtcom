import { Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { getDatabase } from '../db/database.js';
import { LeadService } from '../services/leadService.js';
import { ExtractionJobService } from '../services/extractionJobService.js';
import { AuthService } from '../services/authService.js';
import { WalletService } from '../services/walletService.js';
import { EntitlementService } from '../services/entitlementService.js';
import { config } from '../config.js';

export class ExtensionController {
  private leadService: LeadService;
  private jobService: ExtractionJobService;
  private authService: AuthService;
  private walletService: WalletService;
  private entitlementService: EntitlementService;

  constructor() {
    this.leadService = LeadService.getInstance();
    this.jobService = ExtractionJobService.getInstance();
    this.authService = AuthService.getInstance();
    this.walletService = WalletService.getInstance();
    this.entitlementService = EntitlementService.getInstance();
  }

  /**
   * Fast connection heartbeat check
   */
  public ping = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    res.json({
      status: 'online',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      user: req.user ? { id: req.user.id, username: req.user.username, role: req.user.role } : null
    });
  };

  /**
   * Generate or retrieve an Extension Session Token for the authenticated dashboard user
   */
  public getOrCreateToken = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const db = getDatabase();

      let session = db.prepare(`SELECT * FROM extension_sessions WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1`).get(userId) as any;

      if (!session) {
        const id = crypto.randomUUID();
        const token = jwt.sign(
          {
            id: userId,
            username: req.user!.username,
            role: req.user!.role,
            isExtension: true
          },
          config.jwtSecret,
          { expiresIn: '30d' }
        );

        db.prepare(`
          INSERT INTO extension_sessions (id, user_id, token, name, created_at)
          VALUES (?, ?, ?, 'Chrome Browser Extension', datetime('now'))
        `).run(id, userId, token);

        session = { id, user_id: userId, token, name: 'Chrome Browser Extension', created_at: new Date().toISOString() };
      }

      res.json({
        token: session.token,
        userId: session.user_id,
        created_at: session.created_at
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  /**
   * Return workspace profile and extraction quota info for the connected extension
   */
  public getProfile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const user = this.authService.getUserById(userId);
      if (!user) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      const db = getDatabase();
      // Count leads extracted today
      const todayCount = (db.prepare(`
        SELECT COUNT(*) as count FROM leads WHERE user_id = ? AND date(created_at) = date('now')
      `).get(userId) as { count: number }).count;

      const totalCount = (db.prepare(`
        SELECT COUNT(*) as count FROM leads WHERE user_id = ?
      `).get(userId) as { count: number }).count;

      const wallet = this.walletService.getOrCreateWallet(userId);

      res.json({
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          email: user.email,
          role: user.role,
          plan_tier: user.plan_tier,
          subscription_status: user.subscription_status,
          daily_extraction_limit: user.daily_extraction_limit || 500,
          leads_extracted_today: todayCount,
          total_leads: totalCount,
          wallet_balance: wallet.balance,
          currency: wallet.currency
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  /**
   * Extension batch sync endpoint: receives leads parsed in browser, validates module entitlement & wallet,
   * applies deduplication, stores to database, updates job progress, deducts billable usage, and broadcasts.
   */
  public syncBatch = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { leads, jobId, source } = req.body;

      if (!Array.isArray(leads) || leads.length === 0) {
        res.status(400).json({ error: 'Payload must contain a non-empty "leads" array.' });
        return;
      }

      // Determine module ID from source
      const moduleId = (source === 'google_maps' || !source) ? 'gmaps-search' : (source === 'website_extractor' ? 'web-scanner' : source);

      // Validate Module Entitlement and Wallet Quota
      const entitlement = this.entitlementService.validateModuleAccess(userId, moduleId, leads.length);
      if (!entitlement.allowed) {
        res.status(403).json({
          error: entitlement.reason || 'Unauthorized module execution.',
          code: 'ENTITLEMENT_DENIED',
          walletBalance: entitlement.walletBalance
        });
        return;
      }

      // Check daily extraction limit
      const user = this.authService.getUserById(userId);
      const db = getDatabase();
      const todayCount = (db.prepare(`
        SELECT COUNT(*) as count FROM leads WHERE user_id = ? AND date(created_at) = date('now')
      `).get(userId) as { count: number }).count;

      const dailyLimit = user?.daily_extraction_limit || 500;
      if (user?.role !== 'admin' && todayCount >= dailyLimit) {
        res.status(403).json({
          error: `Daily extraction quota reached (${todayCount}/${dailyLimit}). Please upgrade your plan or wait until tomorrow.`
        });
        return;
      }

      // Save leads
      const result = this.leadService.batchCreateLeads(userId, leads, jobId);

      // Settle usage and wallet deduction based on successfully stored leads
      const settlement = this.entitlementService.recordUsageAndSettle(userId, moduleId, result.created.length, {
        jobId,
        description: `Extracted ${result.created.length} new leads via ${moduleId}`
      });

      // If tied to a job, update progress
      if (jobId) {
        const job = this.jobService.getJobById(userId, jobId);
        if (job) {
          const totalCollected = job.collected_count + result.created.length;
          const totalDuplicates = job.duplicate_count + result.duplicates;
          const totalFailed = job.failed_count + result.failed;
          const progress = Math.min(100, Math.round((totalCollected / (job.requested_count || 50)) * 100));

          this.jobService.updateProgress(jobId, progress, totalCollected, totalDuplicates, totalFailed);
        }
      }

      // Record in extension_sessions last active
      db.prepare(`UPDATE extension_sessions SET last_active_at = datetime('now') WHERE user_id = ?`).run(userId);

      res.json({
        success: true,
        syncedCount: result.created.length,
        duplicates: result.duplicates,
        failed: result.failed,
        remainingToday: Math.max(0, dailyLimit - (todayCount + result.created.length)),
        walletBalance: settlement.newBalance,
        totalCost: settlement.totalCost,
        unitsCharged: settlement.unitsCharged
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };
}

