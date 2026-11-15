import crypto from 'crypto';
import { getDatabase } from '../db/database.js';
import { WhatsAppManager } from './whatsapp/WhatsAppManager.js';
import { getSocketIO } from '../socket/socketManager.js';
import { GroupInviteMetadata, JoinGroupResult } from './whatsapp/types.js';

export interface GroupJoinerSettings {
  minDelaySeconds: number;
  maxDelaySeconds: number;
  batchSize: number;
  batchPauseSeconds: number;
  autoExtractMembers: boolean;
  skipAlreadyMember: boolean;
  senderDeviceId?: string;
  deviceMode?: 'single' | 'round_robin';
}

export interface GroupJoinCampaign {
  id: string;
  user_id?: string | null;
  name: string;
  total_links: number;
  joined_count: number;
  failed_count: number;
  skipped_count: number;
  pending_approval_count: number;
  status: 'draft' | 'running' | 'paused' | 'completed' | 'stopped' | 'failed';
  settings: GroupJoinerSettings;
  current_index: number;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

export interface GroupJoinItem {
  id: string;
  campaign_id: string;
  invite_code: string;
  raw_link: string;
  group_name?: string | null;
  group_jid?: string | null;
  participant_count: number;
  is_community: boolean;
  status: 'pending' | 'inspecting' | 'joining' | 'joined' | 'already_member' | 'pending_approval' | 'invalid_link' | 'group_full' | 'failed';
  error_message?: string | null;
  joined_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateJoinCampaignOptions {
  name?: string;
  links: string[];
  settings?: Partial<GroupJoinerSettings>;
}

export const DEFAULT_JOINER_SETTINGS: GroupJoinerSettings = {
  minDelaySeconds: 15,
  maxDelaySeconds: 30,
  batchSize: 5,
  batchPauseSeconds: 60,
  autoExtractMembers: false,
  skipAlreadyMember: true,
  deviceMode: 'single'
};

export class GroupJoinerService {
  private static instance: GroupJoinerService | null = null;
  private whatsappManager: WhatsAppManager;
  private activeCampaignTimeouts = new Map<string, NodeJS.Timeout>();
  private activeCampaigns = new Set<string>();

  private constructor() {
    this.whatsappManager = WhatsAppManager.getInstance();
  }

  public static getInstance(): GroupJoinerService {
    if (!GroupJoinerService.instance) {
      GroupJoinerService.instance = new GroupJoinerService();
    }
    return GroupJoinerService.instance;
  }

  /**
   * Parse and extract clean WhatsApp invite codes from arbitrary text / URLs
   */
  public parseLinks(text: string): string[] {
    if (!text) return [];
    const lines = text.split(/[\r\n,; \t]+/);
    const seenCodes = new Set<string>();
    const results: string[] = [];

    for (const item of lines) {
      const clean = item.trim();
      if (!clean) continue;

      // Extract code from chat.whatsapp.com/INVITE_CODE or chat.whatsapp.com/invite/INVITE_CODE
      const match = clean.match(/(?:chat\.whatsapp\.com\/(?:invite\/)?|invite\/)?([a-zA-Z0-9_-]{15,35})/);
      const code = match ? match[1] : (clean.length >= 18 && clean.length <= 32 && /^[a-zA-Z0-9_-]+$/.test(clean) ? clean : null);

      if (code && !seenCodes.has(code.toLowerCase())) {
        seenCodes.add(code.toLowerCase());
        results.push(clean.startsWith('http') ? clean : `https://chat.whatsapp.com/${code}`);
      }
    }

    return results;
  }

  /**
   * Pre-inspect a batch of invite links before joining
   */
  public async inspectLinks(
    links: string[],
    sessionId?: string,
    userId?: string
  ): Promise<GroupInviteMetadata[]> {
    const results: GroupInviteMetadata[] = [];
    const cleanLinks = this.parseLinks(links.join('\n')).slice(0, 50); // safety cap to 50 links per inspection batch

    for (const link of cleanLinks) {
      try {
        const info = await this.whatsappManager.getGroupInviteInfo(link, sessionId, userId);
        results.push(info);
      } catch (err: any) {
        results.push({
          code: link,
          subject: 'Error Inspecting Link',
          status: 'error',
          errorMessage: err.message || 'Inspection failed'
        });
      }
    }

    return results;
  }

  /**
   * Instantly join a single group link
   */
  public async joinSingle(
    link: string,
    sessionId?: string,
    userId?: string
  ): Promise<JoinGroupResult> {
    return this.whatsappManager.acceptGroupInvite(link, sessionId, userId, false);
  }

  /**
   * Create and optionally launch a batch join campaign
   */
  public createCampaign(
    userId: string,
    options: CreateJoinCampaignOptions
  ): GroupJoinCampaign {
    const db = getDatabase();
    const parsedLinks = this.parseLinks(options.links.join('\n'));

    if (parsedLinks.length === 0) {
      throw new Error('No valid WhatsApp group invite links found in input.');
    }

    const campaignId = crypto.randomUUID();
    const campaignName = (options.name || `Joiner Campaign ${new Date().toLocaleDateString()}`).trim();
    const settings: GroupJoinerSettings = {
      ...DEFAULT_JOINER_SETTINGS,
      ...options.settings
    };

    const insertCampaign = db.prepare(`
      INSERT INTO group_join_campaigns (
        id, user_id, name, total_links, joined_count, failed_count, skipped_count, pending_approval_count,
        status, settings, current_index, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 0, 0, 0, 0, 'draft', ?, 0, datetime('now'), datetime('now'))
    `);

    const insertItem = db.prepare(`
      INSERT INTO group_join_items (
        id, campaign_id, invite_code, raw_link, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))
    `);

    db.transaction(() => {
      insertCampaign.run(
        campaignId,
        userId,
        campaignName,
        parsedLinks.length,
        JSON.stringify(settings)
      );

      for (const link of parsedLinks) {
        const codeMatch = link.match(/(?:chat\.whatsapp\.com\/(?:invite\/)?|invite\/)?([a-zA-Z0-9_-]{15,35})/);
        const code = codeMatch ? codeMatch[1] : link;
        insertItem.run(crypto.randomUUID(), campaignId, code, link);
      }
    })();

    return this.getCampaign(campaignId, userId)!;
  }

  /**
   * Start executing a join campaign
   */
  public async startCampaign(campaignId: string, userId: string): Promise<void> {
    const campaign = this.getCampaign(campaignId, userId);
    if (!campaign) {
      throw new Error('Join campaign not found.');
    }

    if (campaign.status === 'completed') {
      throw new Error('This join campaign is already completed.');
    }

    const db = getDatabase();
    db.prepare("UPDATE group_join_campaigns SET status = 'running', updated_at = datetime('now') WHERE id = ?").run(campaignId);
    this.activeCampaigns.add(campaignId);

    // Run background loop asynchronously
    this.processCampaignLoop(campaignId, userId).catch((err) => {
      console.error(`[Group Joiner] Campaign ${campaignId} background error:`, err);
    });
  }

  public pauseCampaign(campaignId: string, userId: string): void {
    const db = getDatabase();
    db.prepare("UPDATE group_join_campaigns SET status = 'paused', updated_at = datetime('now') WHERE id = ?").run(campaignId);
    this.activeCampaigns.delete(campaignId);

    const timer = this.activeCampaignTimeouts.get(campaignId);
    if (timer) {
      clearTimeout(timer);
      this.activeCampaignTimeouts.delete(campaignId);
    }

    this.emitProgress(campaignId, 'paused', { pauseReason: 'Paused by user.' });
  }

  public stopCampaign(campaignId: string, userId: string): void {
    const db = getDatabase();
    db.prepare("UPDATE group_join_campaigns SET status = 'stopped', updated_at = datetime('now') WHERE id = ?").run(campaignId);
    this.activeCampaigns.delete(campaignId);

    const timer = this.activeCampaignTimeouts.get(campaignId);
    if (timer) {
      clearTimeout(timer);
      this.activeCampaignTimeouts.delete(campaignId);
    }

    this.emitProgress(campaignId, 'stopped', { pauseReason: 'Campaign stopped by user.' });
  }

  public deleteCampaign(campaignId: string, userId: string): void {
    this.stopCampaign(campaignId, userId);
    const db = getDatabase();
    db.prepare('DELETE FROM group_join_campaigns WHERE id = ? AND (user_id = ? OR user_id IS NULL)').run(campaignId, userId);
  }

  public listCampaigns(userId: string): GroupJoinCampaign[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM group_join_campaigns 
      WHERE user_id = ? OR user_id IS NULL
      ORDER BY created_at DESC 
      LIMIT 100
    `).all(userId) as any[];

    return rows.map((r) => this.mapCampaign(r));
  }

  public getCampaign(campaignId: string, userId?: string): (GroupJoinCampaign & { items?: GroupJoinItem[] }) | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM group_join_campaigns WHERE id = ?').get(campaignId) as any;
    if (!row) return null;

    const campaign = this.mapCampaign(row);
    const itemRows = db.prepare('SELECT * FROM group_join_items WHERE campaign_id = ? ORDER BY created_at ASC').all(campaignId) as any[];

    const items: GroupJoinItem[] = itemRows.map((i) => ({
      id: i.id,
      campaign_id: i.campaign_id,
      invite_code: i.invite_code,
      raw_link: i.raw_link,
      group_name: i.group_name || null,
      group_jid: i.group_jid || null,
      participant_count: i.participant_count || 0,
      is_community: i.is_community === 1,
      status: i.status,
      error_message: i.error_message || null,
      joined_at: i.joined_at || null,
      created_at: i.created_at,
      updated_at: i.updated_at
    }));

    return { ...campaign, items };
  }

  /**
   * Internal Execution Loop with Anti-Ban jitter delays and batch pauses
   */
  private async processCampaignLoop(campaignId: string, userId: string): Promise<void> {
    const db = getDatabase();

    while (this.activeCampaigns.has(campaignId)) {
      const camp = this.getCampaign(campaignId, userId);
      if (!camp || camp.status !== 'running') {
        this.activeCampaigns.delete(campaignId);
        break;
      }

      // Fetch next pending link
      const nextItem = db.prepare(`
        SELECT * FROM group_join_items 
        WHERE campaign_id = ? AND status = 'pending' 
        ORDER BY created_at ASC LIMIT 1
      `).get(campaignId) as any;

      if (!nextItem) {
        // All items finished!
        db.prepare(`
          UPDATE group_join_campaigns 
          SET status = 'completed', completed_at = datetime('now'), updated_at = datetime('now')
          WHERE id = ?
        `).run(campaignId);
        this.activeCampaigns.delete(campaignId);
        this.emitProgress(campaignId, 'completed');
        break;
      }

      const settings = camp.settings;
      const isRoundRobin = settings.deviceMode === 'round_robin';
      const targetSession = settings.senderDeviceId || undefined;

      // 1. Inspect first to get group metadata
      let inviteInfo: GroupInviteMetadata | null = null;
      try {
        db.prepare("UPDATE group_join_items SET status = 'inspecting', updated_at = datetime('now') WHERE id = ?").run(nextItem.id);
        this.emitProgress(campaignId, 'inspecting', { currentCode: nextItem.invite_code });

        inviteInfo = await this.whatsappManager.getGroupInviteInfo(nextItem.invite_code, targetSession, userId);
        if (inviteInfo) {
          db.prepare(`
            UPDATE group_join_items 
            SET group_name = ?, participant_count = ?, is_community = ?, updated_at = datetime('now')
            WHERE id = ?
          `).run(inviteInfo.subject || null, inviteInfo.size || 0, inviteInfo.isCommunity ? 1 : 0, nextItem.id);
        }
      } catch (inspectErr: any) {
        console.warn(`[Group Joiner] Inspect error for ${nextItem.invite_code}:`, inspectErr.message);
      }

      // If already joined and skip setting is active
      if (inviteInfo?.status === 'already_joined' && settings.skipAlreadyMember) {
        db.prepare(`
          UPDATE group_join_items 
          SET status = 'already_member', error_message = 'Already a member in this group', updated_at = datetime('now')
          WHERE id = ?
        `).run(nextItem.id);

        db.prepare(`
          UPDATE group_join_campaigns 
          SET skipped_count = skipped_count + 1, current_index = current_index + 1, updated_at = datetime('now')
          WHERE id = ?
        `).run(campaignId);

        this.emitProgress(campaignId, 'already_member', { currentCode: nextItem.invite_code, groupName: inviteInfo?.subject });
        continue;
      }

      // If link is expired/revoked
      if (inviteInfo?.status === 'invalid_or_revoked') {
        db.prepare(`
          UPDATE group_join_items 
          SET status = 'invalid_link', error_message = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(inviteInfo.errorMessage || 'Link expired or revoked', nextItem.id);

        db.prepare(`
          UPDATE group_join_campaigns 
          SET failed_count = failed_count + 1, current_index = current_index + 1, updated_at = datetime('now')
          WHERE id = ?
        `).run(campaignId);

        this.emitProgress(campaignId, 'invalid_link', { currentCode: nextItem.invite_code, groupName: inviteInfo?.subject });
        continue;
      }

      // 2. Joining phase
      db.prepare("UPDATE group_join_items SET status = 'joining', updated_at = datetime('now') WHERE id = ?").run(nextItem.id);
      this.emitProgress(campaignId, 'joining', { currentCode: nextItem.invite_code, groupName: inviteInfo?.subject });

      const joinResult = await this.whatsappManager.acceptGroupInvite(nextItem.invite_code, targetSession, userId, isRoundRobin);

      if (joinResult.status === 'joined') {
        db.prepare(`
          UPDATE group_join_items 
          SET status = 'joined', group_jid = ?, joined_at = datetime('now'), updated_at = datetime('now')
          WHERE id = ?
        `).run(joinResult.groupJid || null, nextItem.id);

        db.prepare(`
          UPDATE group_join_campaigns 
          SET joined_count = joined_count + 1, current_index = current_index + 1, updated_at = datetime('now')
          WHERE id = ?
        `).run(campaignId);

        this.emitProgress(campaignId, 'joined', { currentCode: nextItem.invite_code, groupName: inviteInfo?.subject });
      } else if (joinResult.status === 'already_member') {
        db.prepare(`
          UPDATE group_join_items 
          SET status = 'already_member', error_message = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(joinResult.error || 'Already participant', nextItem.id);

        db.prepare(`
          UPDATE group_join_campaigns 
          SET skipped_count = skipped_count + 1, current_index = current_index + 1, updated_at = datetime('now')
          WHERE id = ?
        `).run(campaignId);

        this.emitProgress(campaignId, 'already_member', { currentCode: nextItem.invite_code, groupName: inviteInfo?.subject });
      } else if (joinResult.status === 'pending_approval') {
        db.prepare(`
          UPDATE group_join_items 
          SET status = 'pending_approval', error_message = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(joinResult.error || 'Awaiting admin approval', nextItem.id);

        db.prepare(`
          UPDATE group_join_campaigns 
          SET pending_approval_count = pending_approval_count + 1, current_index = current_index + 1, updated_at = datetime('now')
          WHERE id = ?
        `).run(campaignId);

        this.emitProgress(campaignId, 'pending_approval', { currentCode: nextItem.invite_code, groupName: inviteInfo?.subject });
      } else {
        db.prepare(`
          UPDATE group_join_items 
          SET status = ?, error_message = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(joinResult.status || 'failed', joinResult.error || 'Failed to join group', nextItem.id);

        db.prepare(`
          UPDATE group_join_campaigns 
          SET failed_count = failed_count + 1, current_index = current_index + 1, updated_at = datetime('now')
          WHERE id = ?
        `).run(campaignId);

        this.emitProgress(campaignId, 'failed', { currentCode: nextItem.invite_code, groupName: inviteInfo?.subject, error: joinResult.error });
      }

      // Check remaining
      const remainingCount = (db.prepare("SELECT COUNT(*) as count FROM group_join_items WHERE campaign_id = ? AND status = 'pending'").get(campaignId) as { count: number }).count;
      if (remainingCount === 0) {
        db.prepare(`
          UPDATE group_join_campaigns 
          SET status = 'completed', completed_at = datetime('now'), updated_at = datetime('now')
          WHERE id = ?
        `).run(campaignId);
        this.activeCampaigns.delete(campaignId);
        this.emitProgress(campaignId, 'completed');
        break;
      }

      // 3. Batch Pause Check
      const updatedCamp = this.getCampaign(campaignId, userId);
      const processedCount = (updatedCamp?.joined_count || 0) + (updatedCamp?.failed_count || 0) + (updatedCamp?.skipped_count || 0);

      let waitMs = 0;
      if (settings.batchSize > 0 && processedCount % settings.batchSize === 0) {
        waitMs = settings.batchPauseSeconds * 1000;
        this.emitProgress(campaignId, 'cooldown', {
          countdownSeconds: settings.batchPauseSeconds,
          pauseReason: `Batch limit reached (${settings.batchSize} groups). Resting for ${settings.batchPauseSeconds}s for Anti-Ban protection...`
        });
      } else {
        // Random Jitter Delay between min and max seconds
        const minS = Math.max(5, settings.minDelaySeconds);
        const maxS = Math.max(minS, settings.maxDelaySeconds);
        const delayS = Math.floor(Math.random() * (maxS - minS + 1)) + minS;
        waitMs = delayS * 1000;
        this.emitProgress(campaignId, 'delay', { countdownSeconds: delayS });
      }

      // Await pause / delay before next iteration
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, waitMs);
        this.activeCampaignTimeouts.set(campaignId, timeout);
      });
      this.activeCampaignTimeouts.delete(campaignId);
    }
  }

  private emitProgress(
    campaignId: string,
    phase: string,
    extra: {
      currentCode?: string;
      groupName?: string;
      countdownSeconds?: number;
      pauseReason?: string;
      error?: string;
    } = {}
  ): void {
    const camp = this.getCampaign(campaignId);
    if (!camp) return;

    const total = camp.total_links || 1;
    const processed = (camp.joined_count || 0) + (camp.failed_count || 0) + (camp.skipped_count || 0);
    const percentage = Math.min(100, Math.round((processed / total) * 100));

    try {
      const io = getSocketIO();
      if (io) {
        io.emit('joiner:progress', {
          campaignId,
          total,
          joined: camp.joined_count,
          failed: camp.failed_count,
          skipped: camp.skipped_count,
          pendingApproval: camp.pending_approval_count,
          percentage,
          status: camp.status,
          phase,
          ...extra
        });
      }
    } catch {}
  }

  private mapCampaign(row: any): GroupJoinCampaign {
    let settings: GroupJoinerSettings = DEFAULT_JOINER_SETTINGS;
    if (row.settings) {
      try {
        settings = { ...DEFAULT_JOINER_SETTINGS, ...JSON.parse(row.settings) };
      } catch {}
    }

    return {
      id: row.id,
      user_id: row.user_id || null,
      name: row.name,
      total_links: row.total_links || 0,
      joined_count: row.joined_count || 0,
      failed_count: row.failed_count || 0,
      skipped_count: row.skipped_count || 0,
      pending_approval_count: row.pending_approval_count || 0,
      status: row.status || 'draft',
      settings,
      current_index: row.current_index || 0,
      created_at: row.created_at,
      updated_at: row.updated_at,
      completed_at: row.completed_at || null
    };
  }
}

