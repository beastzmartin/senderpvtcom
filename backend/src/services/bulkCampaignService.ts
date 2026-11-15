import crypto from 'crypto';
import { getDatabase } from '../db/database.js';
import { WhatsAppManager } from './whatsapp/WhatsAppManager.js';
import { MessageService } from './messageService.js';
import { getSocketIO } from '../socket/socketManager.js';
import { SubscriptionService } from './subscriptionService.js';

export interface BulkCampaignSettings {
  minDelaySeconds: number;
  maxDelaySeconds: number;
  batchSize: number;
  batchPauseSeconds: number;
  simulateTyping: boolean;
  skipAlreadySentToday: boolean;
  antiDuplicateScope?: 'none' | 'today' | 'last_7_days' | 'all_time';
  dailyLimit: number;
  senderDeviceId?: string;
  deviceMode?: 'single' | 'round_robin';
}

export interface BulkCampaign {
  id: string;
  user_id?: string | null;
  name: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  status: 'draft' | 'running' | 'paused' | 'completed' | 'stopped' | 'failed';
  template_message: string;
  settings: BulkCampaignSettings;
  current_index: number;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

export interface BulkCampaignRecipient {
  id: string;
  campaign_id: string;
  lid: string;
  phone_number?: string | null;
  name?: string | null;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';
  sent_message?: string | null;
  provider_message_id?: string | null;
  error_message?: string | null;
  sent_at?: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
}

export interface DailyQuotaStats {
  sentTodayLid: number;
  sentTodayTotal: number;
  dailyLimit: number;
  remainingLid: number;
  dateStr: string;
  isLimitReached: boolean;
  planTier?: string;
  planName?: string;
  isTrial?: boolean;
  daysRemaining?: number | null;
  subscriptionStatus?: string;
}

export interface CreateCampaignOptions {
  name?: string;
  lids: string[];
  templateMessage: string;
  settings?: Partial<BulkCampaignSettings>;
}

export const DEFAULT_CAMPAIGN_SETTINGS: BulkCampaignSettings = {
  minDelaySeconds: 8,
  maxDelaySeconds: 16,
  batchSize: 20,
  batchPauseSeconds: 60,
  simulateTyping: true,
  skipAlreadySentToday: true,
  antiDuplicateScope: 'all_time',
  dailyLimit: 100
};

/**
 * Recursive Spintax Parser
 * Replaces patterns like {Hi|Hello|Hey} with a randomized choice.
 * Ignores non-spintax tags without a pipe like {lid}, {name}, {random}.
 */
export function parseSpintax(text: string): string {
  let spun = text;
  const spintaxRegex = /\{([^{}|]+\|[^{}]+)\}/g;
  let iterations = 0;
  while (spintaxRegex.test(spun) && iterations < 15) {
    spun = spun.replace(spintaxRegex, (_match, choices) => {
      const parts = choices.split('|');
      const randomChoice = parts[Math.floor(Math.random() * parts.length)];
      return randomChoice;
    });
    iterations++;
  }
  return spun;
}

/**
 * Dynamic message variable interpolator
 */
export function interpolateVariables(
  template: string,
  vars: {
    lid: string;
    name?: string | null;
    phone?: string | null;
    index: number;
    total: number;
  }
): string {
  let result = template;
  result = result.replace(/\{lid\}/gi, vars.lid);
  result = result.replace(/\{name\}/gi, vars.name || 'there');
  result = result.replace(/\{phone\}/gi, vars.phone || '');
  result = result.replace(/\{index\}/gi, String(vars.index));
  result = result.replace(/\{total\}/gi, String(vars.total));
  result = result.replace(/\{random\}/gi, Math.floor(1000 + Math.random() * 9000).toString());
  result = result.replace(/\{time\}/gi, new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  result = result.replace(/\{date\}/gi, new Date().toLocaleDateString());
  return result;
}

export class BulkCampaignService {
  private static instance: BulkCampaignService | null = null;
  private whatsappManager: WhatsAppManager;
  private messageService: MessageService;
  private activeControllers: Map<string, { abort: boolean; pause: boolean; maxToSend?: number; sentInThisRun: number }> = new Map();

  private constructor() {
    this.whatsappManager = WhatsAppManager.getInstance();
    this.messageService = MessageService.getInstance();
    this.recoverUnfinishedCampaigns();
  }

  public static getInstance(): BulkCampaignService {
    if (!BulkCampaignService.instance) {
      BulkCampaignService.instance = new BulkCampaignService();
    }
    return BulkCampaignService.instance;
  }

  /**
   * If server restarts while campaigns are marked 'running', mark them 'paused' so user can resume
   */
  private recoverUnfinishedCampaigns(): void {
    try {
      const db = getDatabase();
      const updated = db.prepare(`
        UPDATE bulk_campaigns 
        SET status = 'paused', updated_at = datetime('now')
        WHERE status = 'running'
      `).run();
      if (updated.changes > 0) {
        console.log(`[Bulk Campaign Service] Recovered ${updated.changes} active campaign(s) into paused state.`);
      }
    } catch (err) {
      console.error('[Bulk Campaign Service] Failed to recover unfinished campaigns:', err);
    }
  }

  /**
   * Helper to emit scoped socket events
   */
  private emitToUser(userId: string | null | undefined, event: string, data: any): void {
    const io = getSocketIO();
    if (!io) return;
    if (userId) {
      io.to(`user:${userId}`).emit(event, data);
    } else {
      io.emit(event, data);
    }
  }

  /**
   * Fetch daily quota statistics
   */
  public getDailyQuota(userId?: string): DailyQuotaStats {
    const db = getDatabase();
    const today = new Date().toISOString().split('T')[0];

    // Read configured limit
    let dailyLimit = 100;
    let planTier: string | undefined;
    let planName: string | undefined;
    let isTrial: boolean | undefined;
    let daysRemaining: number | null | undefined;
    let subscriptionStatus: string | undefined;

    if (userId) {
      try {
        const sub = SubscriptionService.getInstance().getUserSubscription(userId);
        dailyLimit = sub.dailyMessageLimit;
        planTier = sub.planTier;
        planName = sub.planName;
        isTrial = sub.isTrial || sub.planTier === 'trial' || sub.status === 'trialing';
        daysRemaining = sub.daysRemaining;
        subscriptionStatus = sub.status;
      } catch {
        const userRow = db.prepare('SELECT daily_message_limit, plan_tier, subscription_status FROM users WHERE id = ?').get(userId) as any;
        if (userRow?.daily_message_limit) {
          dailyLimit = userRow.daily_message_limit;
        }
        planTier = userRow?.plan_tier;
        subscriptionStatus = userRow?.subscription_status;
      }
    } else {
      const settingRow = db
        .prepare('SELECT value FROM application_settings WHERE key = ?')
        .get('daily_lid_limit') as { value: string } | undefined;
      dailyLimit = settingRow ? parseInt(settingRow.value, 10) || 100 : 100;
    }

    let sentTodayLid = 0;
    let sentTodayTotal = 0;

    if (userId) {
      const lidCountRow = db
        .prepare(`
          SELECT COUNT(*) as count FROM messages 
          WHERE direction = 'outgoing' 
          AND status = 'sent' 
          AND identifier_type = 'lid'
          AND (date(created_at) = date('now') OR date(timestamp) = date('now'))
          AND user_id = ?
        `)
        .get(userId) as { count: number };

      const totalCountRow = db
        .prepare(`
          SELECT COUNT(*) as count FROM messages 
          WHERE direction = 'outgoing' 
          AND status = 'sent' 
          AND (date(created_at) = date('now') OR date(timestamp) = date('now'))
          AND user_id = ?
        `)
        .get(userId) as { count: number };

      sentTodayLid = lidCountRow ? lidCountRow.count : 0;
      sentTodayTotal = totalCountRow ? totalCountRow.count : 0;
    } else {
      const lidCountRow = db
        .prepare(`
          SELECT COUNT(*) as count FROM messages 
          WHERE direction = 'outgoing' 
          AND status = 'sent' 
          AND identifier_type = 'lid'
          AND (date(created_at) = date('now') OR date(timestamp) = date('now'))
        `)
        .get() as { count: number };

      const totalCountRow = db
        .prepare(`
          SELECT COUNT(*) as count FROM messages 
          WHERE direction = 'outgoing' 
          AND status = 'sent' 
          AND (date(created_at) = date('now') OR date(timestamp) = date('now'))
        `)
        .get() as { count: number };

      sentTodayLid = lidCountRow ? lidCountRow.count : 0;
      sentTodayTotal = totalCountRow ? totalCountRow.count : 0;
    }

    const remainingLid = Math.max(0, dailyLimit - sentTodayLid);

    return {
      sentTodayLid,
      sentTodayTotal,
      dailyLimit,
      remainingLid,
      dateStr: today,
      isLimitReached: sentTodayLid >= dailyLimit,
      planTier,
      planName,
      isTrial,
      daysRemaining,
      subscriptionStatus
    };
  }

  /**
   * Update configured daily limit
   */
  public updateDailyLimit(newLimit: number, userId?: string): DailyQuotaStats {
    if (!Number.isFinite(newLimit) || newLimit < 1) {
      throw new Error('Daily limit must be a positive integer greater than 0.');
    }
    const db = getDatabase();
    if (userId) {
      db.prepare('UPDATE users SET daily_message_limit = ? WHERE id = ?').run(Math.floor(newLimit), userId);
    } else {
      db.prepare(`
        INSERT INTO application_settings (key, value, updated_at)
        VALUES ('daily_lid_limit', ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
      `).run(String(Math.floor(newLimit)));
    }

    const quota = this.getDailyQuota(userId);
    this.emitToUser(userId, 'campaign:quota_updated', quota);
    return quota;
  }

  /**
   * Create a new campaign with sanitized recipients
   */
  public createCampaign(options: CreateCampaignOptions, userId?: string): BulkCampaign {
    const db = getDatabase();
    const { lids, templateMessage, settings: customSettings } = options;

    if (!Array.isArray(lids) || lids.length === 0) {
      throw new Error('At least one WhatsApp LID is required.');
    }

    if (!templateMessage || templateMessage.trim().length === 0) {
      throw new Error('Template message cannot be empty.');
    }

    // Clean and validate LIDs
    const cleanLids: string[] = [];
    for (const raw of lids) {
      const trimmed = (raw || '').trim();
      if (!trimmed) continue;
      let target = trimmed;
      if (!target.endsWith('@lid') && /^\d+$/.test(target)) {
        target = `${target}@lid`;
      }
      if (target.endsWith('@lid') && !cleanLids.includes(target)) {
        cleanLids.push(target);
      }
    }

    if (cleanLids.length === 0) {
      throw new Error('No valid WhatsApp LIDs found. Must end with @lid or be numeric.');
    }

    const mergedSettings: BulkCampaignSettings = {
      ...DEFAULT_CAMPAIGN_SETTINGS,
      ...customSettings
    };

    const campaignId = crypto.randomUUID();
    const now = new Date().toISOString();
    const name = options.name?.trim() || `Campaign ${new Date().toLocaleDateString()} - ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    const insertCampaign = db.prepare(`
      INSERT INTO bulk_campaigns (
        id, user_id, name, total_recipients, sent_count, failed_count, skipped_count,
        status, template_message, settings, current_index, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 0, 0, 0, 'draft', ?, ?, 0, ?, ?)
    `);

    insertCampaign.run(
      campaignId,
      userId || null,
      name,
      cleanLids.length,
      templateMessage.trim(),
      JSON.stringify(mergedSettings),
      now,
      now
    );

    // Prepare insert for recipients with contact / lid_mappings resolution
    const insertRecipient = db.prepare(`
      INSERT INTO bulk_campaign_recipients (
        id, campaign_id, lid, phone_number, name, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
    `);

    const selectMapping = db.prepare(`
      SELECT phone_number, display_name FROM lid_mappings WHERE lid = ?
    `);

    const selectContact = db.prepare(`
      SELECT phone_number, name FROM contacts WHERE lid = ? AND (user_id = ? OR user_id IS NULL)
    `);

    const insertMany = db.transaction((lidsToInsert: string[]) => {
      for (const lid of lidsToInsert) {
        let phone: string | null = null;
        let displayName: string | null = null;

        const mapRow = selectMapping.get(lid) as { phone_number: string | null; display_name: string | null } | undefined;
        if (mapRow) {
          phone = mapRow.phone_number;
          displayName = mapRow.display_name;
        }

        if (!phone) {
          const contactRow = selectContact.get(lid, userId || null) as { phone_number: string | null; name: string | null } | undefined;
          if (contactRow) {
            phone = contactRow.phone_number;
            if (!displayName) displayName = contactRow.name;
          }
        }

        insertRecipient.run(crypto.randomUUID(), campaignId, lid, phone, displayName, now, now);
      }
    });

    insertMany(cleanLids);

    return this.getCampaignById(campaignId, userId)!;
  }

  /**
   * Retrieve campaign by ID
   */
  public getCampaignById(campaignId: string, userId?: string): BulkCampaign | null {
    const db = getDatabase();
    let row: any;
    if (userId) {
      row = db.prepare('SELECT * FROM bulk_campaigns WHERE id = ? AND (user_id = ? OR user_id IS NULL)').get(campaignId, userId) as any;
    } else {
      row = db.prepare('SELECT * FROM bulk_campaigns WHERE id = ?').get(campaignId) as any;
    }
    if (!row) return null;

    return {
      ...row,
      settings: typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings
    };
  }

  /**
   * Retrieve all campaigns ordered by newest
   */
  public listCampaigns(limit = 20, userId?: string): BulkCampaign[] {
    const db = getDatabase();
    let rows: any[];
    if (userId) {
      rows = db
        .prepare('SELECT * FROM bulk_campaigns WHERE (user_id = ? OR user_id IS NULL) ORDER BY created_at DESC LIMIT ?')
        .all(userId, limit) as any[];
    } else {
      rows = db
        .prepare('SELECT * FROM bulk_campaigns ORDER BY created_at DESC LIMIT ?')
        .all(limit) as any[];
    }

    return rows.map((r) => ({
      ...r,
      settings: typeof r.settings === 'string' ? JSON.parse(r.settings) : r.settings
    }));
  }

  /**
   * Retrieve campaign with its recipients list
   */
  public getCampaignDetails(
    campaignId: string,
    filterStatus?: string,
    search?: string,
    userId?: string
  ): { campaign: BulkCampaign; recipients: BulkCampaignRecipient[] } | null {
    const campaign = this.getCampaignById(campaignId, userId);
    if (!campaign) return null;

    const db = getDatabase();
    let query = 'SELECT * FROM bulk_campaign_recipients WHERE campaign_id = ?';
    const params: any[] = [campaignId];

    if (filterStatus && filterStatus !== 'all') {
      query += ' AND status = ?';
      params.push(filterStatus);
    }

    if (search && search.trim()) {
      query += ' AND (lid LIKE ? OR phone_number LIKE ? OR name LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    query += ' ORDER BY rowid ASC';

    const recipients = db.prepare(query).all(...params) as BulkCampaignRecipient[];
    return { campaign, recipients };
  }

  /**
   * Start or resume an active campaign
   * @param options.maxToSend If specified, will process only this many recipients and then pause gracefully
   */
  public async startCampaign(
    campaignId: string,
    options?: { maxToSend?: number },
    userId?: string
  ): Promise<BulkCampaign> {
    const campaign = this.getCampaignById(campaignId, userId);
    if (!campaign) {
      throw new Error(`Campaign with ID "${campaignId}" not found.`);
    }

    if (this.activeControllers.has(campaignId)) {
      console.log(`[Bulk Campaign] Campaign ${campaignId} is already running.`);
      return campaign;
    }

    const connectedSessions = this.whatsappManager.getConnectedSessions(campaign.user_id || undefined);
    if (connectedSessions.length === 0) {
      throw new Error('WhatsApp is disconnected. Please connect a device before starting campaign.');
    }

    // Check license status and broadcast limits before starting
    if (campaign.user_id) {
      const sub = SubscriptionService.getInstance().getUserSubscription(campaign.user_id);
      if (sub.status === 'expired' && sub.role !== 'admin') {
        const err: any = new Error('Your license has expired. Please activate a valid license key in the License System.');
        err.statusCode = 403;
        err.licenseExpired = true;
        throw err;
      }
      if (sub.role !== 'admin' && sub.messagesSentToday >= sub.dailyMessageLimit) {
        const err: any = new Error(
          `Daily broadcast limit reached (${sub.messagesSentToday}/${sub.dailyMessageLimit} messages sent today as per your ${sub.planName} license). Upgrade license or wait until tomorrow to send more.`
        );
        err.statusCode = 403;
        err.broadcastLimitReached = true;
        throw err;
      }
    }

    const dailyQuota = this.getDailyQuota(campaign.user_id || undefined);
    const maxLimit = campaign.settings.dailyLimit || dailyQuota.dailyLimit;
    if (dailyQuota.sentTodayLid >= maxLimit) {
      throw new Error(
        `Daily sending limit reached (${dailyQuota.sentTodayLid}/${maxLimit} messages sent today). Please increase daily limit or wait until tomorrow to protect your account from ban.`
      );
    }

    const maxToSend = options?.maxToSend && options.maxToSend > 0 ? Math.floor(options.maxToSend) : undefined;
    const control = { abort: false, pause: false, maxToSend, sentInThisRun: 0 };
    this.activeControllers.set(campaignId, control);

    const db = getDatabase();
    db.prepare(`
      UPDATE bulk_campaigns 
      SET status = 'running', updated_at = datetime('now') 
      WHERE id = ?
    `).run(campaignId);

    this.emitToUser(campaign.user_id, 'campaign:status_changed', { campaignId, status: 'running' });

    // Run execution loop asynchronously in background
    this.runCampaignLoop(campaignId, control).catch((err) => {
      console.error(`[Bulk Campaign] Fatal error in campaign loop for ${campaignId}:`, err);
    });

    return this.getCampaignById(campaignId, userId)!;
  }

  /**
   * Pause a running campaign gracefully
   */
  public pauseCampaign(campaignId: string, userId?: string): BulkCampaign {
    const campaign = this.getCampaignById(campaignId, userId);
    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found.`);
    }

    const control = this.activeControllers.get(campaignId);
    if (control) {
      control.pause = true;
    }

    const db = getDatabase();
    db.prepare(`
      UPDATE bulk_campaigns 
      SET status = 'paused', updated_at = datetime('now') 
      WHERE id = ?
    `).run(campaignId);

    this.emitToUser(campaign.user_id, 'campaign:status_changed', { campaignId, status: 'paused', reason: 'Paused by user' });

    return this.getCampaignById(campaignId, userId)!;
  }

  /**
   * Stop/abort a campaign completely
   */
  public stopCampaign(campaignId: string, userId?: string): BulkCampaign {
    const campaign = this.getCampaignById(campaignId, userId);
    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found.`);
    }

    const control = this.activeControllers.get(campaignId);
    if (control) {
      control.abort = true;
    }

    const db = getDatabase();
    db.prepare(`
      UPDATE bulk_campaigns 
      SET status = 'stopped', updated_at = datetime('now') 
      WHERE id = ?
    `).run(campaignId);

    this.emitToUser(campaign.user_id, 'campaign:status_changed', { campaignId, status: 'stopped', reason: 'Stopped by user' });

    return this.getCampaignById(campaignId, userId)!;
  }

  /**
   * Retry all failed recipients for this campaign
   */
  public async retryFailed(campaignId: string, userId?: string): Promise<BulkCampaign> {
    const campaign = this.getCampaignById(campaignId, userId);
    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found.`);
    }

    const db = getDatabase();
    const updated = db.prepare(`
      UPDATE bulk_campaign_recipients 
      SET status = 'pending', error_message = NULL, retry_count = retry_count + 1, updated_at = datetime('now')
      WHERE campaign_id = ? AND status = 'failed'
    `).run(campaignId);

    // Refresh campaign stats
    this.refreshCampaignCounters(campaignId);

    console.log(`[Bulk Campaign] Reset ${updated.changes} failed recipients to pending for campaign ${campaignId}.`);

    return this.startCampaign(campaignId, undefined, userId);
  }

  /**
   * Retry a single recipient
   */
  public async retrySingleRecipient(
    campaignId: string,
    recipientId: string,
    userId?: string
  ): Promise<BulkCampaignRecipient> {
    const db = getDatabase();
    const recipient = db
      .prepare('SELECT * FROM bulk_campaign_recipients WHERE id = ? AND campaign_id = ?')
      .get(recipientId, campaignId) as BulkCampaignRecipient | undefined;

    if (!recipient) {
      throw new Error('Recipient not found in this campaign.');
    }

    const campaign = this.getCampaignById(campaignId, userId);
    if (!campaign) {
      throw new Error('Campaign not found.');
    }

    // Process Spintax & interpolation
    const spun = parseSpintax(campaign.template_message);
    const finalMsg = interpolateVariables(spun, {
      lid: recipient.lid,
      name: recipient.name,
      phone: recipient.phone_number,
      index: 1,
      total: 1
    });

    try {
      const record = await this.messageService.sendMessageToLid(recipient.lid, finalMsg, {
        simulateTyping: campaign.settings.simulateTyping,
        sessionId: campaign.settings.senderDeviceId,
        useRoundRobin: campaign.settings.deviceMode === 'round_robin'
      }, campaign.user_id || undefined);

      const isSent = record.status === 'sent';
      const now = new Date().toISOString();

      db.prepare(`
        UPDATE bulk_campaign_recipients 
        SET 
          status = ?,
          sent_message = ?,
          provider_message_id = ?,
          error_message = ?,
          sent_at = ?,
          retry_count = retry_count + 1,
          updated_at = ?
        WHERE id = ?
      `).run(
        isSent ? 'sent' : 'failed',
        finalMsg,
        record.provider_message_id || null,
        isSent ? null : 'Failed provider delivery',
        isSent ? now : null,
        now,
        recipientId
      );

      this.refreshCampaignCounters(campaignId);

      const updatedRecipient = db
        .prepare('SELECT * FROM bulk_campaign_recipients WHERE id = ?')
        .get(recipientId) as BulkCampaignRecipient;

      this.emitToUser(campaign.user_id, 'campaign:recipient_updated', { campaignId, recipient: updatedRecipient });
      this.emitToUser(campaign.user_id, 'campaign:quota_updated', this.getDailyQuota(campaign.user_id || undefined));

      return updatedRecipient;
    } catch (err: any) {
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE bulk_campaign_recipients 
        SET 
          status = 'failed',
          error_message = ?,
          retry_count = retry_count + 1,
          updated_at = ?
        WHERE id = ?
      `).run(err.message || 'Dispatch error', now, recipientId);

      this.refreshCampaignCounters(campaignId);
      const updatedRecipient = db
        .prepare('SELECT * FROM bulk_campaign_recipients WHERE id = ?')
        .get(recipientId) as BulkCampaignRecipient;

      this.emitToUser(campaign.user_id, 'campaign:recipient_updated', { campaignId, recipient: updatedRecipient });

      throw err;
    }
  }

  /**
   * Delete campaign
   */
  public deleteCampaign(campaignId: string, userId?: string): void {
    const campaign = this.getCampaignById(campaignId, userId);
    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found.`);
    }

    if (this.activeControllers.has(campaignId)) {
      this.stopCampaign(campaignId, userId);
    }
    const db = getDatabase();
    if (userId) {
      db.prepare('DELETE FROM bulk_campaigns WHERE id = ? AND (user_id = ? OR user_id IS NULL)').run(campaignId, userId);
    } else {
      db.prepare('DELETE FROM bulk_campaigns WHERE id = ?').run(campaignId);
    }
  }

  /**
   * Check duplicate and already contacted recipients in an input list
   */
  public checkDuplicates(
    lids: string[],
    scope: 'none' | 'today' | 'last_7_days' | 'all_time' = 'all_time',
    userId?: string
  ): {
    totalInput: number;
    uniqueLidsCount: number;
    duplicateInListCount: number;
    alreadySentCount: number;
    cleanEligibleCount: number;
    alreadySentLids: string[];
    cleanEligibleLids: string[];
  } {
    const db = getDatabase();
    const cleanLidsSet = new Set<string>();
    let duplicateInListCount = 0;

    for (let target of lids) {
      target = target.trim();
      if (!target) continue;
      if (!target.endsWith('@lid') && /^\d+$/.test(target)) {
        target = `${target}@lid`;
      }
      if (target.endsWith('@lid')) {
        if (cleanLidsSet.has(target)) {
          duplicateInListCount++;
        } else {
          cleanLidsSet.add(target);
        }
      }
    }

    const uniqueLids = Array.from(cleanLidsSet);
    const totalInput = lids.length;
    const uniqueLidsCount = uniqueLids.length;

    if (scope === 'none' || uniqueLidsCount === 0) {
      return {
        totalInput,
        uniqueLidsCount,
        duplicateInListCount,
        alreadySentCount: 0,
        cleanEligibleCount: uniqueLidsCount,
        alreadySentLids: [],
        cleanEligibleLids: uniqueLids
      };
    }

    let timeCondition = '';
    if (scope === 'today') {
      timeCondition = "AND datetime(created_at) >= datetime('now', '-24 hours')";
    } else if (scope === 'last_7_days') {
      timeCondition = "AND datetime(created_at) >= datetime('now', '-7 days')";
    }

    const checkStmt = db.prepare(`
      SELECT 1 FROM messages 
      WHERE (recipient_identifier = ? OR recipient_identifier = ?) 
      AND status = 'sent' 
      ${userId ? 'AND (user_id = ? OR user_id IS NULL)' : ''}
      ${timeCondition}
      LIMIT 1
    `);

    const alreadySentLids: string[] = [];
    const cleanEligibleLids: string[] = [];

    for (const lid of uniqueLids) {
      const bare = lid.replace('@lid', '');
      const found = userId ? checkStmt.get(lid, bare, userId) : checkStmt.get(lid, bare);
      if (found) {
        alreadySentLids.push(lid);
      } else {
        cleanEligibleLids.push(lid);
      }
    }

    return {
      totalInput,
      uniqueLidsCount,
      duplicateInListCount,
      alreadySentCount: alreadySentLids.length,
      cleanEligibleCount: cleanEligibleLids.length,
      alreadySentLids,
      cleanEligibleLids
    };
  }

  /**
   * Recalculate and update campaign counter fields
   */
  private refreshCampaignCounters(campaignId: string): void {
    const db = getDatabase();
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
      FROM bulk_campaign_recipients
      WHERE campaign_id = ?
    `).get(campaignId) as { total: number; sent: number; failed: number; skipped: number; pending: number };

    db.prepare(`
      UPDATE bulk_campaigns 
      SET 
        total_recipients = ?,
        sent_count = ?,
        failed_count = ?,
        skipped_count = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(stats.total, stats.sent, stats.failed, stats.skipped, campaignId);
  }

  /**
   * Core Campaign Execution Loop with Rate Limiting, Random Delays, Batching, Typing Simulation
   */
  private async runCampaignLoop(
    campaignId: string,
    control: { abort: boolean; pause: boolean; maxToSend?: number; sentInThisRun: number }
  ): Promise<void> {
    const db = getDatabase();
    let batchCounter = 0;

    console.log(`[Bulk Campaign] Starting execution loop for campaign ${campaignId}...`);

    try {
      while (true) {
        // 1. Check control interrupts
        if (control.abort) {
          console.log(`[Bulk Campaign] Loop aborted by user for ${campaignId}.`);
          break;
        }

        if (control.pause) {
          console.log(`[Bulk Campaign] Loop paused by user for ${campaignId}.`);
          break;
        }

        // 2. Fetch fresh campaign settings
        const campaign = this.getCampaignById(campaignId);
        if (!campaign || campaign.status === 'stopped' || campaign.status === 'paused') {
          break;
        }

        // 3. Check WhatsApp connection
        const connectedSessions = this.whatsappManager.getConnectedSessions(campaign.user_id || undefined);
        if (connectedSessions.length === 0) {
          console.warn(`[Bulk Campaign] WhatsApp disconnected! Pausing campaign ${campaignId}.`);
          this.pauseWithReason(campaignId, 'WhatsApp disconnected. Reconnect a device to resume.');
          break;
        }

        // 4. Check Daily Limit & License
        if (campaign.user_id) {
          const sub = SubscriptionService.getInstance().getUserSubscription(campaign.user_id);
          if (sub.status === 'expired' && sub.role !== 'admin') {
            console.warn(`[Bulk Campaign] License expired for user ${campaign.user_id}! Pausing campaign.`);
            this.pauseWithReason(campaignId, 'Your license has expired. Please activate a valid license key.');
            break;
          }
          if (sub.role !== 'admin' && sub.messagesSentToday >= sub.dailyMessageLimit) {
            console.warn(`[Bulk Campaign] Daily broadcast limit reached for user ${campaign.user_id}! Pausing campaign.`);
            this.pauseWithReason(
              campaignId,
              `Daily broadcast limit reached (${sub.messagesSentToday}/${sub.dailyMessageLimit} today as per your ${sub.planName} license). Paused to protect WhatsApp account from ban.`
            );
            break;
          }
        }

        const quota = this.getDailyQuota(campaign.user_id || undefined);
        const maxDaily = campaign.settings.dailyLimit || quota.dailyLimit;
        if (quota.sentTodayLid >= maxDaily) {
          console.warn(`[Bulk Campaign] Daily limit of ${maxDaily} reached! Pausing campaign to avoid ban.`);
          this.pauseWithReason(
            campaignId,
            `Daily sending limit reached (${quota.sentTodayLid}/${maxDaily} today). Paused to protect WhatsApp account from ban.`
          );
          break;
        }

        // 5. Fetch next pending recipient
        const recipient = db.prepare(`
          SELECT * FROM bulk_campaign_recipients 
          WHERE campaign_id = ? AND status = 'pending' 
          ORDER BY rowid ASC 
          LIMIT 1
        `).get(campaignId) as BulkCampaignRecipient | undefined;

        if (!recipient) {
          // No more pending recipients!
          console.log(`[Bulk Campaign] Finished all items for campaign ${campaignId}!`);
          db.prepare(`
            UPDATE bulk_campaigns 
            SET status = 'completed', completed_at = datetime('now'), updated_at = datetime('now') 
            WHERE id = ?
          `).run(campaignId);

          this.emitToUser(campaign.user_id, 'campaign:status_changed', { campaignId, status: 'completed' });
          this.emitProgress(campaignId, 'completed');
          break;
        }

        // 6. Anti-Duplicate Protection: Check if recipient already received a message
        const antiDuplicateScope = campaign.settings.antiDuplicateScope || (campaign.settings.skipAlreadySentToday ? 'today' : 'none');
        if (antiDuplicateScope !== 'none') {
          let timeCondition = '';
          if (antiDuplicateScope === 'today') {
            timeCondition = "AND datetime(created_at) >= datetime('now', '-24 hours')";
          } else if (antiDuplicateScope === 'last_7_days') {
            timeCondition = "AND datetime(created_at) >= datetime('now', '-7 days')";
          }
          // If 'all_time', timeCondition is empty string -> check entire message history

          const bareLid = recipient.lid.replace('@lid', '');
          const alreadySent = db.prepare(`
            SELECT id FROM messages 
            WHERE (recipient_identifier = ? OR recipient_identifier = ?) 
            AND status = 'sent' 
            ${campaign.user_id ? 'AND (user_id = ? OR user_id IS NULL)' : ''}
            ${timeCondition}
            LIMIT 1
          `).get(...(campaign.user_id ? [recipient.lid, bareLid, campaign.user_id] : [recipient.lid, bareLid]));

          if (alreadySent) {
            console.log(`[Bulk Campaign] Anti-duplicate: Skipping ${recipient.lid} (${antiDuplicateScope}).`);
            const now = new Date().toISOString();
            const reason = antiDuplicateScope === 'all_time'
              ? 'Skipped: Already received a message previously (All-Time Anti-Repeat)'
              : antiDuplicateScope === 'last_7_days'
              ? 'Skipped: Already received a message within last 7 days'
              : 'Skipped: Already received a message within last 24h';

            db.prepare(`
              UPDATE bulk_campaign_recipients 
              SET status = 'skipped', error_message = ?, updated_at = ?
              WHERE id = ?
            `).run(reason, now, recipient.id);

            db.prepare(`
              UPDATE bulk_campaigns 
              SET skipped_count = skipped_count + 1, updated_at = datetime('now')
              WHERE id = ?
            `).run(campaignId);

            const updatedRec: BulkCampaignRecipient = {
              ...recipient,
              status: 'skipped' as const,
              error_message: reason,
              updated_at: now
            };
            this.emitToUser(campaign.user_id, 'campaign:recipient_updated', { campaignId, recipient: updatedRec });
            this.emitProgress(campaignId, 'sending', recipient.lid);
            continue; // Next recipient immediately
          }
        }

        // 7. Mark recipient as 'sending'
        db.prepare(`
          UPDATE bulk_campaign_recipients 
          SET status = 'sending', updated_at = datetime('now') 
          WHERE id = ?
        `).run(recipient.id);

        this.emitToUser(campaign.user_id, 'campaign:recipient_updated', {
          campaignId,
          recipient: { ...recipient, status: 'sending' }
        });
        this.emitProgress(campaignId, 'sending', recipient.lid);

        // 8. Generate personalized Spintax message
        const spunTemplate = parseSpintax(campaign.template_message);
        const currentSentCount = campaign.sent_count + 1;
        const personalizedMsg = interpolateVariables(spunTemplate, {
          lid: recipient.lid,
          name: recipient.name,
          phone: recipient.phone_number,
          index: currentSentCount,
          total: campaign.total_recipients
        });

        // 9. Dispatch to WhatsApp LID
        let success = false;
        let providerMessageId: string | null = null;
        let errorMessage: string | null = null;

        try {
          if (campaign.settings.simulateTyping) {
            this.emitProgress(campaignId, 'typing', recipient.lid);
          }

          const record = await this.messageService.sendMessageToLid(recipient.lid, personalizedMsg, {
            simulateTyping: campaign.settings.simulateTyping,
            sessionId: campaign.settings.senderDeviceId,
            useRoundRobin: campaign.settings.deviceMode === 'round_robin'
          }, campaign.user_id || undefined);

          success = record.status === 'sent';
          providerMessageId = record.provider_message_id || null;
        } catch (err: any) {
          success = false;
          errorMessage = err.message || 'Transmission failed';
        }

        // 10. Update recipient row and campaign stats
        const now = new Date().toISOString();
        if (success) {
          db.prepare(`
            UPDATE bulk_campaign_recipients 
            SET 
              status = 'sent',
              sent_message = ?,
              provider_message_id = ?,
              sent_at = ?,
              updated_at = ?
            WHERE id = ?
          `).run(personalizedMsg, providerMessageId, now, now, recipient.id);

          db.prepare(`
            UPDATE bulk_campaigns 
            SET sent_count = sent_count + 1, updated_at = datetime('now')
            WHERE id = ?
          `).run(campaignId);

          batchCounter++;
          control.sentInThisRun++;
        } else {
          db.prepare(`
            UPDATE bulk_campaign_recipients 
            SET 
              status = 'failed',
              error_message = ?,
              updated_at = ?
            WHERE id = ?
          `).run(errorMessage, now, recipient.id);

          db.prepare(`
            UPDATE bulk_campaigns 
            SET failed_count = failed_count + 1, updated_at = datetime('now')
            WHERE id = ?
          `).run(campaignId);
        }

        const updatedRecipient: BulkCampaignRecipient = {
          ...recipient,
          status: success ? 'sent' : 'failed',
          sent_message: success ? personalizedMsg : null,
          provider_message_id: providerMessageId,
          error_message: errorMessage,
          sent_at: success ? now : null,
          updated_at: now
        };

        this.emitToUser(campaign.user_id, 'campaign:recipient_updated', { campaignId, recipient: updatedRecipient });
        this.emitToUser(campaign.user_id, 'campaign:quota_updated', this.getDailyQuota(campaign.user_id || undefined));
        this.emitProgress(campaignId, 'sending', recipient.lid);

        // Backward compatibility with legacy bulk:progress
        const camp = this.getCampaignById(campaignId);
        if (camp) {
          this.emitToUser(campaign.user_id, 'bulk:progress', {
            total: camp.total_recipients,
            sent: camp.sent_count,
            failed: camp.failed_count,
            currentLid: recipient.lid,
            status: success ? 'sent' : 'failed',
            providerMessageId: providerMessageId || undefined,
            error: errorMessage || undefined,
            percentage: Math.round(((camp.sent_count + camp.failed_count + camp.skipped_count) / camp.total_recipients) * 100),
            isCompleted: false
          });
        }

        // Check if user's requested batch limit (e.g. 20 or 30) for this run was reached!
        if (control.maxToSend && control.sentInThisRun >= control.maxToSend) {
          console.log(`[Bulk Campaign] Requested batch limit of ${control.maxToSend} reached for campaign ${campaignId}.`);
          const pendingCountRow = db
            .prepare("SELECT COUNT(*) as count FROM bulk_campaign_recipients WHERE campaign_id = ? AND status = 'pending'")
            .get(campaignId) as { count: number };
          const remaining = pendingCountRow ? pendingCountRow.count : 0;

          this.pauseWithReason(
            campaignId,
            `Batch completed: Successfully sent to ${control.sentInThisRun} recipient(s). ${remaining} remaining for your next batch.`
          );

          this.emitToUser(campaign.user_id, 'campaign:batch_completed', {
            campaignId,
            sentInBatch: control.sentInThisRun,
            remaining,
            reason: `Batch limit of ${control.maxToSend} reached.`
          });
          break; // Stop this run so user can send rest when ready
        }

        // 11. Check if more pending exist
        const pendingCountRow = db
          .prepare('SELECT COUNT(*) as count FROM bulk_campaign_recipients WHERE campaign_id = ? AND status = \'pending\'')
          .get(campaignId) as { count: number };

        if (pendingCountRow.count === 0) {
          console.log(`[Bulk Campaign] Finished all items for campaign ${campaignId}!`);
          db.prepare(`
            UPDATE bulk_campaigns 
            SET status = 'completed', completed_at = datetime('now'), updated_at = datetime('now') 
            WHERE id = ?
          `).run(campaignId);

          this.emitToUser(campaign.user_id, 'campaign:status_changed', { campaignId, status: 'completed' });
          this.emitProgress(campaignId, 'completed');
          break;
        }

        // 12. Batch Cooldown Pause
        if (campaign.settings.batchSize > 0 && batchCounter >= campaign.settings.batchSize) {
          batchCounter = 0;
          const cooldownSeconds = campaign.settings.batchPauseSeconds || 60;
          console.log(`[Bulk Campaign] Cooldown batch reached (${campaign.settings.batchSize} msgs). Pausing for ${cooldownSeconds}s...`);

          for (let sec = cooldownSeconds; sec > 0; sec--) {
            if (control.abort || control.pause) break;
            this.emitProgress(campaignId, 'cooldown', undefined, sec);
            await new Promise((r) => setTimeout(r, 1000));
          }
          if (control.abort || control.pause) break;
        } else {
          // 13. Randomized Human Delay between messages
          const minMs = Math.max(1000, (campaign.settings.minDelaySeconds || 8) * 1000);
          const maxMs = Math.max(minMs, (campaign.settings.maxDelaySeconds || 16) * 1000);
          const delayMs = Math.floor(minMs + Math.random() * (maxMs - minMs));
          const delaySeconds = Math.round(delayMs / 1000);

          for (let sec = delaySeconds; sec > 0; sec--) {
            if (control.abort || control.pause) break;
            this.emitProgress(campaignId, 'delay', undefined, sec);
            await new Promise((r) => setTimeout(r, 1000));
          }
          if (control.abort || control.pause) break;
        }
      }
    } finally {
      this.activeControllers.delete(campaignId);
      console.log(`[Bulk Campaign] Exited loop for campaign ${campaignId}.`);
    }
  }

  private pauseWithReason(campaignId: string, reason: string): void {
    const db = getDatabase();
    db.prepare(`
      UPDATE bulk_campaigns 
      SET status = 'paused', updated_at = datetime('now') 
      WHERE id = ?
    `).run(campaignId);

    const campaign = this.getCampaignById(campaignId);
    this.emitToUser(campaign?.user_id, 'campaign:status_changed', { campaignId, status: 'paused', reason });
  }

  private emitProgress(
    campaignId: string,
    phase: 'idle' | 'sending' | 'typing' | 'delay' | 'cooldown' | 'completed' | 'paused',
    currentLid?: string,
    phaseCountdownSeconds?: number
  ): void {
    const campaign = this.getCampaignById(campaignId);
    if (!campaign) return;

    const processed = campaign.sent_count + campaign.failed_count + campaign.skipped_count;
    const percentage = campaign.total_recipients > 0 ? Math.round((processed / campaign.total_recipients) * 100) : 0;
    const pending = Math.max(0, campaign.total_recipients - processed);

    this.emitToUser(campaign.user_id, 'campaign:progress', {
      campaignId,
      total: campaign.total_recipients,
      sent: campaign.sent_count,
      failed: campaign.failed_count,
      skipped: campaign.skipped_count,
      pending,
      percentage,
      status: campaign.status,
      currentLid,
      phase,
      phaseCountdownSeconds
    });
  }
}
