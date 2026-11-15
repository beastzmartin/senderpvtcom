import { Response, NextFunction } from 'express';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { AuthService } from '../services/authService.js';
import { SubscriptionService } from '../services/subscriptionService.js';
import { WhatsAppManager } from '../services/whatsapp/WhatsAppManager.js';
import { BulkCampaignService } from '../services/bulkCampaignService.js';
import { GroupJoinerService } from '../services/groupJoinerService.js';
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

  // ==========================================================
  // SESSION CONTROLLER & USERS DEVICE TERMINATOR
  // ==========================================================

  public listAllSessions = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.ensureAdmin(req);
      const waManager = WhatsAppManager.getInstance();
      const sessions = waManager.adminGetAllSessions();
      const diskStats = waManager.adminGetSessionsDiskStats();
      res.json({ success: true, sessions, diskStats });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to fetch sessions' });
    }
  };

  public disconnectSession = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.ensureAdmin(req);
      const sessionId = req.params.sessionId as string;
      const waManager = WhatsAppManager.getInstance();
      await waManager.adminDisconnectDevice(sessionId);
      res.json({ success: true, message: `Device session [${sessionId}] forcefully disconnected.` });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to disconnect session' });
    }
  };

  public reconnectSession = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.ensureAdmin(req);
      const sessionId = req.params.sessionId as string;
      const waManager = WhatsAppManager.getInstance();
      await waManager.adminReconnectDevice(sessionId);
      res.json({ success: true, message: `Device session [${sessionId}] rebooted and reconnecting.` });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to reconnect session' });
    }
  };

  public terminateSession = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.ensureAdmin(req);
      const sessionId = req.params.sessionId as string;
      const waManager = WhatsAppManager.getInstance();
      await waManager.adminTerminateDevice(sessionId);
      res.json({ success: true, message: `Device session [${sessionId}] terminated and session keys wiped from disk.` });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to terminate session' });
    }
  };

  public terminateAllUserDevices = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.ensureAdmin(req);
      const targetUserId = req.params.userId as string;
      const waManager = WhatsAppManager.getInstance();
      const result = await waManager.adminTerminateAllUserDevices(targetUserId);
      res.json({
        success: true,
        message: `Terminated and wiped ${result.terminatedCount} device(s) for this user.`,
        ...result
      });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to terminate user devices' });
    }
  };

  // ==========================================================
  // WEBSITE STORAGE & DATA MANAGER
  // ==========================================================

  public getStorageStats = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.ensureAdmin(req);
      const db = getDatabase();
      const waManager = WhatsAppManager.getInstance();

      const getFileSize = (p: string): number => {
        try {
          return fs.existsSync(p) ? fs.statSync(p).size : 0;
        } catch {
          return 0;
        }
      };

      const dbSizeBytes = getFileSize(config.dbPath);
      const walSizeBytes = getFileSize(`${config.dbPath}-wal`);
      const shmSizeBytes = getFileSize(`${config.dbPath}-shm`);
      const totalDbBytes = dbSizeBytes + walSizeBytes + shmSizeBytes;

      const countTable = (table: string): number => {
        try {
          const r = db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as { c: number };
          return r?.c || 0;
        } catch {
          return 0;
        }
      };

      const tables = {
        users: countTable('users'),
        whatsapp_sessions: countTable('whatsapp_sessions'),
        messages: countTable('messages'),
        conversations: countTable('conversations'),
        contacts: countTable('contacts'),
        bulk_campaigns: countTable('bulk_campaigns'),
        broadcast_schedules: countTable('broadcast_schedules'),
        group_join_campaigns: countTable('group_join_campaigns'),
        extracted_data_vault: countTable('extracted_data_vault'),
        lid_mappings: countTable('lid_mappings'),
        templates: countTable('templates')
      };

      const sessionsStorage = waManager.adminGetSessionsDiskStats();
      const mem = process.memoryUsage();
      const totalOsMem = os.totalmem();
      const freeOsMem = os.freemem();

      res.json({
        success: true,
        storage: {
          server: {
            uptimeSeconds: Math.floor(process.uptime()),
            nodeVersion: process.version,
            platform: `${os.type()} ${os.release()} (${os.arch()})`,
            cpus: os.cpus().length,
            loadAvg: os.loadavg(),
            memory: {
              totalBytes: totalOsMem,
              freeBytes: freeOsMem,
              usedBytes: totalOsMem - freeOsMem,
              processRss: mem.rss,
              processHeapUsed: mem.heapUsed,
              processHeapTotal: mem.heapTotal
            }
          },
          database: {
            dbPath: config.dbPath,
            dbSizeBytes,
            walSizeBytes,
            shmSizeBytes,
            totalDbBytes,
            tables
          },
          sessionsStorage: {
            totalFolders: sessionsStorage.totalFolders,
            totalBytes: sessionsStorage.totalBytes,
            orphanFoldersCount: sessionsStorage.orphanFolders.length,
            orphanBytes: sessionsStorage.orphanBytes
          }
        }
      });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to fetch storage stats' });
    }
  };

  public vacuumDatabase = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.ensureAdmin(req);
      const db = getDatabase();
      db.pragma('wal_checkpoint(TRUNCATE)');
      db.exec('VACUUM;');
      res.json({ success: true, message: 'Database compacted (WAL checkpointed & VACUUM completed).' });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to vacuum database' });
    }
  };

  public purgeOldMessages = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.ensureAdmin(req);
      const { olderThanDays, onlyFailed } = req.body;
      const db = getDatabase();

      let deletedMessages = 0;
      if (onlyFailed) {
        const info = db.prepare("DELETE FROM messages WHERE status = 'failed'").run();
        deletedMessages = info.changes;
      } else {
        const days = Math.max(0, parseInt(String(olderThanDays ?? 30), 10));
        if (days === 0) {
          const info = db.prepare('DELETE FROM messages').run();
          deletedMessages = info.changes;
        } else {
          const info = db.prepare(`DELETE FROM messages WHERE created_at < datetime('now', '-' || ? || ' days')`).run(days);
          deletedMessages = info.changes;
        }
      }

      db.pragma('wal_checkpoint(TRUNCATE)');
      res.json({
        success: true,
        message: `Purged ${deletedMessages} message record(s) from database.`,
        deletedMessages
      });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to purge messages' });
    }
  };

  public purgeOrphanSessions = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.ensureAdmin(req);
      const waManager = WhatsAppManager.getInstance();
      const result = waManager.adminPurgeOrphanSessionFolders();
      res.json({
        success: true,
        message: `Cleaned ${result.deletedCount} orphan session folder(s) on disk.`,
        ...result
      });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to purge orphan sessions' });
    }
  };

  public downloadDbBackup = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.ensureAdmin(req);
      const db = getDatabase();
      const backupFileName = `whatsapp_db_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
      const tmpBackupPath = path.join(os.tmpdir(), backupFileName);

      await db.backup(tmpBackupPath);

      res.download(tmpBackupPath, backupFileName, (err) => {
        try {
          if (fs.existsSync(tmpBackupPath)) fs.unlinkSync(tmpBackupPath);
        } catch {}
        if (err && !res.headersSent) {
          res.status(500).json({ error: 'Failed to stream database backup' });
        }
      });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ error: err.message || 'Failed to create database backup' });
    }
  };

  // ==========================================================
  // PARTICULAR USER MESSAGE HISTORY & DATA ERASER
  // ==========================================================

  public getUserDataSummary = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.ensureAdmin(req);
      const targetUserId = req.params.userId as string;
      const db = getDatabase();

      const countFor = (sql: string): number => {
        try {
          const r = db.prepare(sql).get(targetUserId) as { c: number };
          return r?.c || 0;
        } catch {
          return 0;
        }
      };

      res.json({
        success: true,
        summary: {
          messages: countFor('SELECT COUNT(*) as c FROM messages WHERE user_id = ?'),
          conversations: countFor('SELECT COUNT(*) as c FROM conversations WHERE user_id = ?'),
          contacts: countFor('SELECT COUNT(*) as c FROM contacts WHERE user_id = ?'),
          bulkCampaigns: countFor('SELECT COUNT(*) as c FROM bulk_campaigns WHERE user_id = ?'),
          broadcastSchedules: countFor('SELECT COUNT(*) as c FROM broadcast_schedules WHERE user_id = ?'),
          joinCampaigns: countFor('SELECT COUNT(*) as c FROM group_join_campaigns WHERE user_id = ?'),
          templates: countFor('SELECT COUNT(*) as c FROM templates WHERE user_id = ?'),
          devices: countFor('SELECT COUNT(*) as c FROM whatsapp_sessions WHERE user_id = ?'),
          vaultExtractions: countFor('SELECT COUNT(*) as c FROM extracted_data_vault WHERE user_id = ?')
        }
      });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to fetch user data summary' });
    }
  };

  public deleteUserMessages = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.ensureAdmin(req);
      const targetUserId = req.params.userId as string;
      const db = getDatabase();

      let deletedMsgs = 0;
      let deletedConvs = 0;

      db.transaction(() => {
        const msgRes = db.prepare('DELETE FROM messages WHERE user_id = ?').run(targetUserId);
        deletedMsgs = msgRes.changes;
        const convRes = db.prepare('DELETE FROM conversations WHERE user_id = ?').run(targetUserId);
        deletedConvs = convRes.changes;
      })();

      res.json({
        success: true,
        message: `Deleted ${deletedMsgs} message(s) and ${deletedConvs} conversation(s) for this user.`,
        deletedMsgs,
        deletedConvs
      });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to delete user message history' });
    }
  };

  public deleteUserContacts = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.ensureAdmin(req);
      const targetUserId = req.params.userId as string;
      const db = getDatabase();
      const info = db.prepare('DELETE FROM contacts WHERE user_id = ?').run(targetUserId);
      res.json({ success: true, message: `Deleted ${info.changes} contact(s) for this user.` });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to delete user contacts' });
    }
  };

  public deleteUserCampaigns = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.ensureAdmin(req);
      const targetUserId = req.params.userId as string;
      const db = getDatabase();

      let totalDeleted = 0;
      db.transaction(() => {
        totalDeleted += db.prepare('DELETE FROM bulk_campaigns WHERE user_id = ?').run(targetUserId).changes;
        totalDeleted += db.prepare('DELETE FROM broadcast_schedules WHERE user_id = ?').run(targetUserId).changes;
        totalDeleted += db.prepare('DELETE FROM group_join_campaigns WHERE user_id = ?').run(targetUserId).changes;
      })();

      res.json({ success: true, message: `Deleted ${totalDeleted} campaign/schedule record(s) for this user.` });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to delete user campaigns' });
    }
  };

  public factoryResetUser = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.ensureAdmin(req);
      const targetUserId = req.params.userId as string;
      const waManager = WhatsAppManager.getInstance();
      const db = getDatabase();

      // 1. Terminate & wipe all WhatsApp devices for this user
      await waManager.adminTerminateAllUserDevices(targetUserId);

      // 2. Wipe all user operational data (keep login, license, and admin vault intact)
      db.transaction(() => {
        db.prepare('DELETE FROM messages WHERE user_id = ?').run(targetUserId);
        db.prepare('DELETE FROM conversations WHERE user_id = ?').run(targetUserId);
        db.prepare('DELETE FROM contacts WHERE user_id = ?').run(targetUserId);
        db.prepare('DELETE FROM bulk_campaigns WHERE user_id = ?').run(targetUserId);
        db.prepare('DELETE FROM broadcast_schedules WHERE user_id = ?').run(targetUserId);
        db.prepare('DELETE FROM group_join_campaigns WHERE user_id = ?').run(targetUserId);
        db.prepare('DELETE FROM templates WHERE user_id = ?').run(targetUserId);
      })();

      res.json({
        success: true,
        message: 'User account factory-reset completed (devices wiped, messages/contacts/campaigns deleted).'
      });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to factory reset user' });
    }
  };

  // ==========================================================
  // LIVE GLOBAL CAMPAIGNS MONITOR & SYSTEM SETTINGS
  // ==========================================================

  public listLiveCampaigns = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.ensureAdmin(req);
      const db = getDatabase();

      const bulkCampaigns = db.prepare(`
        SELECT 
          bc.id, bc.name, bc.user_id, bc.total_recipients as total, bc.sent_count as done,
          bc.failed_count as failed, bc.status, bc.created_at,
          u.username, u.name as user_name, 'bulk' as type
        FROM bulk_campaigns bc
        LEFT JOIN users u ON bc.user_id = u.id
        WHERE bc.status IN ('running', 'paused')
        ORDER BY bc.updated_at DESC
      `).all() as any[];

      const joinCampaigns = db.prepare(`
        SELECT 
          gj.id, gj.name, gj.user_id, gj.total_links as total, gj.joined_count as done,
          gj.failed_count as failed, gj.status, gj.created_at,
          u.username, u.name as user_name, 'joiner' as type
        FROM group_join_campaigns gj
        LEFT JOIN users u ON gj.user_id = u.id
        WHERE gj.status IN ('running', 'paused')
        ORDER BY gj.updated_at DESC
      `).all() as any[];

      res.json({
        success: true,
        campaigns: [...bulkCampaigns, ...joinCampaigns]
      });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to fetch live campaigns' });
    }
  };

  public stopLiveCampaign = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.ensureAdmin(req);
      const type = req.params.type as string;
      const id = req.params.id as string;

      if (type === 'bulk') {
        BulkCampaignService.getInstance().stopCampaign(id);
      } else if (type === 'joiner') {
        GroupJoinerService.getInstance().stopCampaign(id, req.user!.id);
      } else {
        res.status(400).json({ error: 'Unknown campaign type' });
        return;
      }

      res.json({ success: true, message: `Force stopped ${type} campaign [${id}].` });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to stop campaign' });
    }
  };
}

