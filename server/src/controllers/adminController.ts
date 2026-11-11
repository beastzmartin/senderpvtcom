import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { AuthService } from '../services/authService.js';
import { SubscriptionService } from '../services/subscriptionService.js';
import { getDatabase } from '../db/database.js';

export class AdminController {
  private authService: AuthService;
  private subscriptionService: SubscriptionService;

  constructor() {
    this.authService = AuthService.getInstance();
    this.subscriptionService = SubscriptionService.getInstance();
  }

  private ensureAdmin(req: AuthenticatedRequest): string {
    if (!req.user || req.user.role !== 'admin') {
      const err: any = new Error('Access denied. Administrator privileges required.');
      err.statusCode = 403;
      throw err;
    }
    return req.user.id;
  }

  /**
   * System Overview Analytics
   */
  public getOverview = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.ensureAdmin(req);
      const db = getDatabase();

      const userStats = db.prepare(`
        SELECT 
          COUNT(*) as total_users,
          SUM(CASE WHEN COALESCE(is_active, 1) = 1 THEN 1 ELSE 0 END) as active_users,
          SUM(CASE WHEN plan_tier = 'trial' THEN 1 ELSE 0 END) as trial_users,
          SUM(CASE WHEN plan_tier != 'trial' AND plan_tier != 'free' THEN 1 ELSE 0 END) as paid_users
        FROM users
      `).get() as any;

      const deviceStats = db.prepare(`
        SELECT COUNT(*) as connected_devices FROM whatsapp_sessions WHERE status = 'connected'
      `).get() as any;

      const messageStats = db.prepare(`
        SELECT 
          COUNT(*) as total_messages,
          SUM(CASE WHEN status = 'delivered' OR status = 'read' OR status = 'sent' THEN 1 ELSE 0 END) as sent_messages
        FROM messages
      `).get() as any;

      const vaultStats = db.prepare(`
        SELECT 
          COUNT(*) as total_extractions,
          COALESCE(SUM(total_contacts), 0) as total_contacts,
          COALESCE(SUM(phone_count), 0) as total_phones,
          COALESCE(SUM(lid_count), 0) as total_lids
        FROM extracted_data_vault
      `).get() as any;

      const campaignStats = db.prepare(`
        SELECT COUNT(*) as total_campaigns FROM bulk_campaigns
      `).get() as any;

      res.json({
        success: true,
        stats: {
          totalUsers: userStats?.total_users || 0,
          activeUsers: userStats?.active_users || 0,
          trialUsers: userStats?.trial_users || 0,
          paidUsers: userStats?.paid_users || 0,
          connectedDevices: deviceStats?.connected_devices || 0,
          totalMessages: messageStats?.total_messages || 0,
          sentMessages: messageStats?.sent_messages || 0,
          totalCampaigns: campaignStats?.total_campaigns || 0,
          vault: {
            totalExtractions: vaultStats?.total_extractions || 0,
            totalContactsCaptured: vaultStats?.total_contacts || 0,
            totalPhonesCaptured: vaultStats?.total_phones || 0,
            totalLidsCaptured: vaultStats?.total_lids || 0
          }
        }
      });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to fetch admin overview' });
    }
  };

  /**
   * Super Admin Impersonation: Generate login session as target user
   */
  public impersonate = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const adminId = this.ensureAdmin(req);
      const { targetUserId } = req.body;

      if (!targetUserId) {
        res.status(400).json({ error: 'Field "targetUserId" is required.' });
        return;
      }

      const result = this.authService.impersonateUser(adminId, targetUserId);
      res.json({
        success: true,
        message: `Successfully logged in as ${result.user.name} (@${result.user.username}).`,
        token: result.token,
        user: result.user
      });
    } catch (err: any) {
      res.status(err.statusCode || 403).json({ error: err.message || 'Failed to impersonate user' });
    }
  };

  /**
   * Admin Reset User Password
   */
  public resetUserPassword = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const adminId = this.ensureAdmin(req);
      const targetUserId = req.params.userId as string;
      const { newPassword } = req.body;

      if (!targetUserId || !newPassword) {
        res.status(400).json({ error: 'Target user ID and newPassword are required.' });
        return;
      }

      this.authService.adminResetPassword(adminId, targetUserId, newPassword);
      res.json({ success: true, message: 'User password reset successfully.' });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to reset password' });
    }
  };

  /**
   * Admin Toggle User Active/Disabled Status
   */
  public toggleUserStatus = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const adminId = this.ensureAdmin(req);
      const targetUserId = req.params.userId as string;
      const { isActive } = req.body;

      if (!targetUserId || isActive === undefined) {
        res.status(400).json({ error: 'Target user ID and isActive status are required.' });
        return;
      }

      this.authService.adminToggleUserStatus(adminId, targetUserId, Boolean(isActive));
      res.json({
        success: true,
        message: `User account ${isActive ? 'activated' : 'disabled'} successfully.`
      });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to update user status' });
    }
  };

  /**
   * Admin Delete User Account
   */
  public deleteUser = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const adminId = this.ensureAdmin(req);
      const targetUserId = req.params.userId as string;

      if (!targetUserId) {
        res.status(400).json({ error: 'Target user ID is required.' });
        return;
      }

      this.authService.adminDeleteUser(adminId, targetUserId);
      res.json({ success: true, message: 'User account and associated data removed.' });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to delete user' });
    }
  };

  /**
   * Extracted Data Vault: List intercepted extractions
   */
  public listVaultLogs = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const adminId = this.ensureAdmin(req);
      const filterUserId = (req.query.userId as string) || undefined;

      const logs = this.subscriptionService.getVaultLogs(adminId, filterUserId);
      res.json({ success: true, logs, count: logs.length });
    } catch (err: any) {
      res.status(err.statusCode || 403).json({ error: err.message || 'Failed to fetch vault logs' });
    }
  };

  /**
   * Extracted Data Vault: Get single record with full contacts array
   */
  public getVaultRecord = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const adminId = this.ensureAdmin(req);
      const id = req.params.id as string;

      const record = this.subscriptionService.getVaultRecordById(adminId, id);
      res.json({ success: true, record });
    } catch (err: any) {
      res.status(err.statusCode || 404).json({ error: err.message || 'Vault record not found' });
    }
  };

  /**
   * Extracted Data Vault: Direct CSV download for Admin
   */
  public downloadVaultCsv = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const adminId = this.ensureAdmin(req);
      const id = req.params.id as string;

      const record = this.subscriptionService.getVaultRecordById(adminId, id);
      const contacts = record.contacts || [];

      const header = 'Name,Phone,WhatsApp_LID,Status,Role,Extracted_Group,Intercepted_From_User,Date\n';
      const rows = contacts.map((c: any) => {
        const name = (c.name || 'Anonymous Member').replace(/"/g, '""');
        const phone = c.phone || '';
        const lid = c.lid || '';
        const status = c.phone ? 'Resolved Real Number' : 'Masked WhatsApp LID';
        const role = c.role || 'member';
        const groupStr = (c.groupSubject || record.group_name || 'Extracted Audience').replace(/"/g, '""');
        const userStr = `${record.user_name || record.username || 'User'}`.replace(/"/g, '""');
        const dateStr = record.created_at || '';
        return `"${name}","${phone}","${lid}","${status}","${role}","${groupStr}","${userStr}","${dateStr}"`;
      }).join('\n');

      const safeGroupName = (record.group_name || 'leads').replace(/[^a-z0-9]/gi, '_');
      const filename = `admin_vault_${safeGroupName}_${record.id.slice(0, 8)}.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.status(200).send(header + rows);
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to download CSV' });
    }
  };

  /**
   * Extracted Data Vault: Delete single vault record
   */
  public deleteVaultRecord = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const adminId = this.ensureAdmin(req);
      const id = req.params.id as string;

      const result = this.subscriptionService.deleteVaultRecord(adminId, id);
      res.json(result);
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to delete record' });
    }
  };

  /**
   * Extracted Data Vault: Clear all vault records
   */
  public clearAllVault = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const adminId = this.ensureAdmin(req);
      const result = this.subscriptionService.clearAllVault(adminId);
      res.json(result);
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to clear vault' });
    }
  };
}

