import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { VaultService, AdminContext } from '../services/marketplace/VaultService.js';
import { getDatabase } from '../db/database.js';

export class VaultAdminController {
  private vaultService: VaultService;

  constructor() {
    this.vaultService = VaultService.getInstance();
  }

  private getAdminContext(req: AuthenticatedRequest): AdminContext {
    const db = getDatabase();
    let vaultRole = 'super_admin';
    try {
      const u = db.prepare('SELECT vault_role FROM users WHERE id = ?').get(req.user?.id) as any;
      if (u?.vault_role) vaultRole = u.vault_role;
    } catch {}

    const forwarded = req.headers['x-forwarded-for'];
    const ipAddress = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.socket.remoteAddress;

    return {
      id: req.user?.id || 'admin',
      username: req.user?.username || 'admin',
      role: vaultRole,
      ipAddress,
      userAgent: req.headers['user-agent']
    };
  }

  /**
   * Overview KPIs & Storage analytics
   */
  public getOverviewStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const stats = this.vaultService.getVaultOverviewStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch vault stats' });
    }
  };

  /**
   * List records with explorer filters
   */
  public listRecords = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const {
        userId,
        productSlug,
        productId,
        module,
        status,
        legalHold,
        inTrash,
        dateFrom,
        dateTo,
        tag,
        search,
        page,
        limit
      } = req.query;

      const results = this.vaultService.listVaultRecords({
        userId: userId ? String(userId) : undefined,
        productSlug: productSlug ? String(productSlug) : undefined,
        productId: productId ? String(productId) : undefined,
        module: module ? String(module) : undefined,
        status: status ? String(status) : undefined,
        legalHold: legalHold === 'true' ? true : legalHold === 'false' ? false : undefined,
        inTrash: inTrash === 'true',
        dateFrom: dateFrom ? String(dateFrom) : undefined,
        dateTo: dateTo ? String(dateTo) : undefined,
        tag: tag ? String(tag) : undefined,
        search: search ? String(search) : undefined,
        page: page ? parseInt(String(page), 10) : 1,
        limit: limit ? parseInt(String(limit), 10) : 25
      });

      res.json(results);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to list vault records' });
    }
  };

  /**
   * Get single record details with access audit logging
   */
  public getRecordDetail = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { reason } = req.query;
      const admin = this.getAdminContext(req);

      const record = this.vaultService.getVaultRecord(String(id), admin, reason ? String(reason) : undefined);
      if (!record) {
        res.status(404).json({ error: 'Vault record not found' });
        return;
      }

      // Also fetch related access logs for this record
      const accessLogs = this.vaultService.listAccessLogs({ recordId: record.id, limit: 20 });

      res.json({
        record,
        accessLogs: accessLogs.logs
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to retrieve vault record' });
    }
  };

  /**
   * Reveal encrypted credential with audited reason prompt
   */
  public revealSecret = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { fieldKey, reason } = req.body;
      const admin = this.getAdminContext(req);

      if (!fieldKey) {
        res.status(400).json({ error: 'fieldKey is required' });
        return;
      }

      const result = this.vaultService.revealSecret(String(id), fieldKey, admin, reason);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to reveal credential' });
    }
  };

  /**
   * Update record tags and notes
   */
  public updateMetadata = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { notes, tags } = req.body;
      const admin = this.getAdminContext(req);

      const updated = this.vaultService.updateMetadata(String(id), admin, { notes, tags });
      res.json({ success: true, record: updated });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to update metadata' });
    }
  };

  /**
   * Toggle Legal Hold
   */
  public toggleLegalHold = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { legalHold, reason } = req.body;
      const admin = this.getAdminContext(req);

      if (typeof legalHold !== 'boolean') {
        res.status(400).json({ error: 'legalHold boolean is required' });
        return;
      }

      const updated = this.vaultService.toggleLegalHold(String(id), legalHold, reason, admin);
      res.json({ success: true, record: updated });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to toggle Legal Hold' });
    }
  };

  /**
   * Move records to Trash (Soft Delete)
   */
  public softDelete = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { recordIds, reason } = req.body;
      if (!Array.isArray(recordIds) || recordIds.length === 0) {
        res.status(400).json({ error: 'recordIds array is required' });
        return;
      }

      const admin = this.getAdminContext(req);
      const result = this.vaultService.softDelete(recordIds, admin, reason);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to move records to trash' });
    }
  };

  /**
   * Restore records from Trash
   */
  public restoreTrash = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { recordIds } = req.body;
      if (!Array.isArray(recordIds) || recordIds.length === 0) {
        res.status(400).json({ error: 'recordIds array is required' });
        return;
      }

      const admin = this.getAdminContext(req);
      const result = this.vaultService.restoreFromTrash(recordIds, admin);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to restore records' });
    }
  };

  /**
   * Irreversible Hard Purge
   */
  public hardPurge = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { recordIds, reason, confirmationText } = req.body;
      if (!Array.isArray(recordIds) || recordIds.length === 0) {
        res.status(400).json({ error: 'recordIds array is required' });
        return;
      }

      const admin = this.getAdminContext(req);
      const receipt = await this.vaultService.hardPurge(recordIds, admin, reason, confirmationText);
      res.json({ success: true, receipt });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to execute hard purge' });
    }
  };

  /**
   * GDPR / DPDP User Data Erasure
   */
  public executeUserErasure = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { targetUserId, reason, confirmationText } = req.body;
      if (!targetUserId) {
        res.status(400).json({ error: 'targetUserId is required' });
        return;
      }

      const admin = this.getAdminContext(req);
      const receipt = await this.vaultService.executeUserErasure(targetUserId, admin, reason, confirmationText);
      res.json({ success: true, receipt });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to execute user data erasure' });
    }
  };

  /**
   * Retention Policies CRUD & Dry-run
   */
  public getRetentionPolicies = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const policies = this.vaultService.getRetentionPolicies();
      res.json(policies);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch retention policies' });
    }
  };

  public saveRetentionPolicy = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const policy = this.vaultService.saveRetentionPolicy(req.body);
      res.json({ success: true, policy });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to save retention policy' });
    }
  };

  public deleteRetentionPolicy = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const deleted = this.vaultService.deleteRetentionPolicy(String(id));
      res.json({ success: deleted });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to delete retention policy' });
    }
  };

  public previewRetention = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const preview = this.vaultService.previewRetentionPurge();
      res.json(preview);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to preview retention purge' });
    }
  };

  public runRetentionCleaner = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const result = await this.vaultService.executeRetentionCycle();
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to run retention cleaner' });
    }
  };

  /**
   * Deletion Receipts
   */
  public listDeletionReceipts = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
      const receipts = this.vaultService.listDeletionReceipts(limit);
      res.json(receipts);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to list deletion receipts' });
    }
  };

  /**
   * Audit Access Logs
   */
  public listAccessLogs = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { recordId, adminUserId, action, limit, offset } = req.query;
      const result = this.vaultService.listAccessLogs({
        recordId: recordId ? String(recordId) : undefined,
        adminUserId: adminUserId ? String(adminUserId) : undefined,
        action: action ? String(action) : undefined,
        limit: limit ? parseInt(String(limit), 10) : 50,
        offset: offset ? parseInt(String(offset), 10) : 0
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to list access logs' });
    }
  };

  /**
   * Backfill existing historical jobs into Data Vault
   */
  public triggerBackfill = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const result = this.vaultService.backfillExistingJobs();
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to execute backfill' });
    }
  };

  /**
   * Bulk Async Export
   */
  public createBulkExport = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { filters, format } = req.body;
      const admin = this.getAdminContext(req);
      const result = await this.vaultService.createAsyncExport(filters, format === 'csv' ? 'csv' : 'json', admin);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to start export' });
    }
  };

  /**
   * Public download link for export token
   */
  public downloadExport = async (req: Request, res: Response): Promise<void> => {
    try {
      const { token } = req.params;
      const exportFile = this.vaultService.getExportByToken(String(token));
      if (!exportFile) {
        res.status(404).send('Export not found or download link expired.');
        return;
      }

      res.setHeader('Content-Type', exportFile.format === 'csv' ? 'text/csv' : 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="vault_export_${token.slice(0, 8)}.${exportFile.format}"`);
      res.sendFile(exportFile.filePath);
    } catch (err: any) {
      res.status(500).send('Error downloading export');
    }
  };

  /**
   * Data Vault & Privacy Settings
   */
  public getSettings = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();
      const keys = [
        'vault_default_retention_days',
        'vault_trash_grace_days',
        'customer_delete_behavior',
        'privacy_terms_version',
        'privacy_policy_text',
        'vault_2fa_enforced',
        'vault_audit_reason_required'
      ];
      const placeholders = keys.map(() => '?').join(',');
      const rows = db.prepare(`SELECT key, value FROM marketplace_settings WHERE key IN (${placeholders})`).all(...keys) as Array<{ key: string; value: string }>;

      const settings: Record<string, string> = {};
      rows.forEach((r) => {
        settings[r.key] = r.value;
      });

      res.json(settings);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to load settings' });
    }
  };

  public updateSettings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();
      const updates = req.body;
      const allowedKeys = [
        'vault_default_retention_days',
        'vault_trash_grace_days',
        'customer_delete_behavior',
        'privacy_terms_version',
        'privacy_policy_text',
        'vault_2fa_enforced',
        'vault_audit_reason_required'
      ];

      const updateStmt = db.prepare(`
        INSERT INTO marketplace_settings (key, value, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
      `);

      for (const [k, v] of Object.entries(updates)) {
        if (allowedKeys.includes(k) && typeof v === 'string') {
          updateStmt.run(k, v);
        }
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to update settings' });
    }
  };
}
