import crypto from 'crypto';
import { getDatabase } from '../db/database.js';
import { WhatsAppManager } from './whatsapp/WhatsAppManager.js';
import { MessageService } from './messageService.js';
import { getSocketIO } from '../socket/socketManager.js';
import { parseSpintax, interpolateVariables, DEFAULT_CAMPAIGN_SETTINGS, BulkCampaignSettings } from './bulkCampaignService.js';

export interface BroadcastSchedule {
  id: string;
  user_id?: string | null;
  name: string;
  template_id?: string | null;
  template_content: string;
  daily_limit: number;
  scheduled_time: string; // "HH:MM"
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  total_recipients: number;
  sent_recipients: number;
  failed_recipients: number;
  skipped_recipients: number;
  last_run_at?: string | null;
  next_run_at?: string | null;
  settings: BulkCampaignSettings;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

export interface BroadcastRecipient {
  id: string;
  schedule_id: string;
  lid: string;
  phone_number?: string | null;
  name?: string | null;
  custom_data?: Record<string, any> | null;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';
  batch_day: number;
  sent_at?: string | null;
  error_message?: string | null;
  provider_message_id?: string | null;
  sent_message?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateScheduleInput {
  name: string;
  templateId?: string;
  templateContent: string;
  dailyLimit: number; // e.g. 10, 20
  scheduledTime?: string; // "HH:MM", default "10:00"
  recipients: Array<{
    lid: string;
    phone_number?: string;
    name?: string;
    custom_data?: Record<string, any>;
  }>;
  settings?: Partial<BulkCampaignSettings>;
}

export class BroadcastSchedulerService {
  private static instance: BroadcastSchedulerService | null = null;
  private whatsappManager: WhatsAppManager;
  private messageService: MessageService;
  private timer: NodeJS.Timeout | null = null;
  private isProcessing: boolean = false;

  private constructor() {
    this.whatsappManager = WhatsAppManager.getInstance();
    this.messageService = MessageService.getInstance();
    this.startSchedulerLoop();
  }

  public static getInstance(): BroadcastSchedulerService {
    if (!BroadcastSchedulerService.instance) {
      BroadcastSchedulerService.instance = new BroadcastSchedulerService();
    }
    return BroadcastSchedulerService.instance;
  }

  private emitToUser(userId: string | null | undefined, event: string, data: any) {
    const io = getSocketIO();
    if (!io) return;
    if (userId) {
      io.to(`user:${userId}`).emit(event, data);
    } else {
      io.emit(event, data);
    }
  }

  /**
   * Background tick loop: checks for due schedules every 30 seconds
   */
  private startSchedulerLoop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(async () => {
      if (this.isProcessing) return;
      try {
        await this.checkAndRunDueSchedules();
      } catch (err) {
        console.error('[Broadcast Scheduler] Error during scheduled check:', err);
      }
    }, 30000); // 30s interval
    console.log('[Broadcast Scheduler] Background ticker initialized (30s interval).');
  }

  /**
   * Compute next run timestamp from given scheduled_time (HH:MM)
   */
  public computeNextRun(scheduledTimeStr: string, fromDate = new Date()): string {
    const [hours, minutes] = scheduledTimeStr.split(':').map((n) => parseInt(n, 10) || 0);
    const target = new Date(fromDate);
    target.setHours(hours, minutes, 0, 0);

    // If target time is already in the past for today, schedule for tomorrow
    if (target.getTime() <= fromDate.getTime()) {
      target.setDate(target.getDate() + 1);
    }
    return target.toISOString();
  }

  /**
   * Create a new broadcast schedule with audience
   */
  public createSchedule(input: CreateScheduleInput, userId?: string): BroadcastSchedule {
    const db = getDatabase();
    const { name, templateId, templateContent, dailyLimit, scheduledTime = '10:00', recipients, settings } = input;

    if (!name || !name.trim()) throw new Error('Schedule name is required.');
    if (!templateContent || !templateContent.trim()) throw new Error('Template content cannot be empty.');
    if (!dailyLimit || dailyLimit < 1) throw new Error('Daily limit must be at least 1.');
    if (!Array.isArray(recipients) || recipients.length === 0) throw new Error('At least one recipient is required.');

    // Sanitize recipients & remove duplicates
    const cleanMap = new Map<string, { lid: string; phone_number?: string; name?: string; custom_data?: any }>();
    for (const r of recipients) {
      let lid = (r.lid || '').trim();
      if (!lid) continue;
      if (!lid.endsWith('@lid') && /^\d+$/.test(lid)) {
        lid = `${lid}@lid`;
      }
      if (lid.endsWith('@lid') && !cleanMap.has(lid)) {
        cleanMap.set(lid, {
          lid,
          phone_number: r.phone_number?.trim() || undefined,
          name: r.name?.trim() || undefined,
          custom_data: r.custom_data || undefined
        });
      }
    }

    const uniqueRecipients = Array.from(cleanMap.values());
    if (uniqueRecipients.length === 0) {
      throw new Error('No valid WhatsApp LIDs found in recipient list.');
    }

    const scheduleId = crypto.randomUUID();
    const now = new Date().toISOString();
    const nextRun = this.computeNextRun(scheduledTime);
    const mergedSettings: BulkCampaignSettings = {
      ...DEFAULT_CAMPAIGN_SETTINGS,
      ...settings
    };

    db.prepare(`
      INSERT INTO broadcast_schedules (
        id, user_id, name, template_id, template_content, daily_limit, scheduled_time,
        status, total_recipients, sent_recipients, failed_recipients, skipped_recipients,
        next_run_at, settings, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, 0, 0, 0, ?, ?, ?, ?)
    `).run(
      scheduleId,
      userId || null,
      name.trim(),
      templateId || null,
      templateContent.trim(),
      Math.floor(dailyLimit),
      scheduledTime,
      uniqueRecipients.length,
      nextRun,
      JSON.stringify(mergedSettings),
      now,
      now
    );

    // Insert recipients
    const insertRec = db.prepare(`
      INSERT INTO broadcast_schedule_recipients (
        id, schedule_id, lid, phone_number, name, custom_data, status, batch_day, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)
    `);

    const insertMany = db.transaction((recs: typeof uniqueRecipients) => {
      for (const r of recs) {
        insertRec.run(
          crypto.randomUUID(),
          scheduleId,
          r.lid,
          r.phone_number || null,
          r.name || null,
          r.custom_data ? JSON.stringify(r.custom_data) : null,
          now,
          now
        );
      }
    });

    insertMany(uniqueRecipients);

    const created = this.getScheduleById(scheduleId, userId)!;
    this.emitToUser(userId, 'scheduler:status_changed', { scheduleId, status: 'active' });
    return created;
  }

  public getScheduleById(id: string, userId?: string): BroadcastSchedule | null {
    const db = getDatabase();
    let row: any;
    if (userId) {
      row = db.prepare('SELECT * FROM broadcast_schedules WHERE id = ? AND (user_id = ? OR user_id IS NULL)').get(id, userId);
    } else {
      row = db.prepare('SELECT * FROM broadcast_schedules WHERE id = ?').get(id);
    }
    if (!row) return null;
    return {
      ...row,
      settings: typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings
    };
  }

  public listSchedules(userId?: string): BroadcastSchedule[] {
    const db = getDatabase();
    let rows: any[];
    if (userId) {
      rows = db.prepare('SELECT * FROM broadcast_schedules WHERE (user_id = ? OR user_id IS NULL) ORDER BY created_at DESC').all(userId) as any[];
    } else {
      rows = db.prepare('SELECT * FROM broadcast_schedules ORDER BY created_at DESC').all() as any[];
    }
    return rows.map((r) => ({
      ...r,
      settings: typeof r.settings === 'string' ? JSON.parse(r.settings) : r.settings
    }));
  }

  public getScheduleDetails(
    id: string,
    filterStatus?: string,
    userId?: string
  ): { schedule: BroadcastSchedule; recipients: BroadcastRecipient[] } | null {
    const schedule = this.getScheduleById(id, userId);
    if (!schedule) return null;

    const db = getDatabase();
    let query = 'SELECT * FROM broadcast_schedule_recipients WHERE schedule_id = ?';
    const params: any[] = [id];

    if (filterStatus && filterStatus !== 'all') {
      query += ' AND status = ?';
      params.push(filterStatus);
    }

    query += ' ORDER BY rowid ASC';

    const rows = db.prepare(query).all(...params) as any[];
    const recipients: BroadcastRecipient[] = rows.map((r) => ({
      ...r,
      custom_data: typeof r.custom_data === 'string' ? JSON.parse(r.custom_data) : r.custom_data || null
    }));

    return { schedule, recipients };
  }

  public pauseSchedule(id: string, userId?: string): BroadcastSchedule {
    const schedule = this.getScheduleById(id, userId);
    if (!schedule) throw new Error('Schedule not found.');

    const db = getDatabase();
    db.prepare(`
      UPDATE broadcast_schedules 
      SET status = 'paused', updated_at = datetime('now') 
      WHERE id = ?
    `).run(id);

    const updated = this.getScheduleById(id, userId)!;
    this.emitToUser(schedule.user_id, 'scheduler:status_changed', { scheduleId: id, status: 'paused' });
    return updated;
  }

  public resumeSchedule(id: string, userId?: string): BroadcastSchedule {
    const schedule = this.getScheduleById(id, userId);
    if (!schedule) throw new Error('Schedule not found.');

    const nextRun = this.computeNextRun(schedule.scheduled_time);
    const db = getDatabase();
    db.prepare(`
      UPDATE broadcast_schedules 
      SET status = 'active', next_run_at = ?, updated_at = datetime('now') 
      WHERE id = ?
    `).run(nextRun, id);

    const updated = this.getScheduleById(id, userId)!;
    this.emitToUser(schedule.user_id, 'scheduler:status_changed', { scheduleId: id, status: 'active' });
    return updated;
  }

  public deleteSchedule(id: string, userId?: string): void {
    const db = getDatabase();
    if (userId) {
      db.prepare('DELETE FROM broadcast_schedules WHERE id = ? AND user_id = ?').run(id, userId);
    } else {
      db.prepare('DELETE FROM broadcast_schedules WHERE id = ?').run(id);
    }
  }

  /**
   * Trigger today's daily batch immediately (e.g. user clicks "Send Today's 20 Now")
   */
  public async runBatchNow(scheduleId: string, userId?: string): Promise<{ sent: number; failed: number; remaining: number }> {
    const schedule = this.getScheduleById(scheduleId, userId);
    if (!schedule) throw new Error('Schedule not found.');
    return this.executeDailyBatch(scheduleId, true);
  }

  /**
   * Check all active schedules and execute any that are due
   */
  private async checkAndRunDueSchedules(): Promise<void> {
    const db = getDatabase();
    const nowIso = new Date().toISOString();

    const dueSchedules = db.prepare(`
      SELECT id FROM broadcast_schedules 
      WHERE status = 'active' 
      AND next_run_at IS NOT NULL 
      AND datetime(next_run_at) <= datetime(?)
    `).all(nowIso) as { id: string }[];

    if (dueSchedules.length > 0) {
      console.log(`[Broadcast Scheduler] Found ${dueSchedules.length} due schedule(s) to execute.`);
      for (const item of dueSchedules) {
        try {
          await this.executeDailyBatch(item.id, false);
        } catch (err) {
          console.error(`[Broadcast Scheduler] Error running batch for schedule ${item.id}:`, err);
        }
      }
    }
  }

  /**
   * Execute one daily batch for a given schedule (e.g. 10 or 20 users)
   */
  private async executeDailyBatch(
    scheduleId: string,
    isManualTrigger = false
  ): Promise<{ sent: number; failed: number; remaining: number }> {
    const schedule = this.getScheduleById(scheduleId);
    if (!schedule) throw new Error(`Schedule ${scheduleId} not found.`);

    const connectedSessions = this.whatsappManager.getConnectedSessions(schedule.user_id || undefined);
    if (connectedSessions.length === 0) {
      console.warn(`[Broadcast Scheduler] WhatsApp disconnected. Deferring batch for ${schedule.name}.`);
      return { sent: 0, failed: 0, remaining: schedule.total_recipients - schedule.sent_recipients };
    }

    const db = getDatabase();

    // Determine current batch day number (e.g. Day 1, Day 2...)
    const maxDayRow = db.prepare(`
      SELECT MAX(batch_day) as max_day FROM broadcast_schedule_recipients WHERE schedule_id = ?
    `).get(scheduleId) as { max_day: number | null };
    const currentDay = (maxDayRow?.max_day || 0) + 1;

    // Fetch next N pending recipients up to dailyLimit
    const pendingRecipients = db.prepare(`
      SELECT * FROM broadcast_schedule_recipients 
      WHERE schedule_id = ? AND status = 'pending' 
      ORDER BY rowid ASC 
      LIMIT ?
    `).all(scheduleId, schedule.daily_limit) as any[];

    if (pendingRecipients.length === 0) {
      // All completed!
      db.prepare(`
        UPDATE broadcast_schedules 
        SET status = 'completed', completed_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).run(scheduleId);

      this.emitToUser(schedule.user_id, 'scheduler:status_changed', { scheduleId, status: 'completed' });
      return { sent: 0, failed: 0, remaining: 0 };
    }

    console.log(`[Broadcast Scheduler] Executing Day ${currentDay} batch (${pendingRecipients.length} users) for schedule "${schedule.name}"...`);

    let sentCount = 0;
    let failedCount = 0;

    for (let i = 0; i < pendingRecipients.length; i++) {
      const rec = pendingRecipients[i];
      const customData = typeof rec.custom_data === 'string' ? JSON.parse(rec.custom_data) : rec.custom_data || {};

      // Spintax & Variable replacement
      const spun = parseSpintax(schedule.template_content);
      let personalizedMsg = interpolateVariables(spun, {
        lid: rec.lid,
        name: rec.name,
        phone: rec.phone_number,
        index: schedule.sent_recipients + sentCount + 1,
        total: schedule.total_recipients
      });

      // Custom data tags interpolation (e.g. {company}, {city}, etc.)
      if (customData && typeof customData === 'object') {
        for (const [key, val] of Object.entries(customData)) {
          const tagRegex = new RegExp(`\\{${key}\\}`, 'gi');
          personalizedMsg = personalizedMsg.replace(tagRegex, String(val ?? ''));
        }
      }

      let success = false;
      let errorMsg: string | null = null;
      let providerMsgId: string | null = null;

      try {
        this.emitToUser(schedule.user_id, 'scheduler:progress', {
          scheduleId,
          currentLid: rec.lid,
          batchDay: currentDay,
          index: i + 1,
          batchTotal: pendingRecipients.length
        });

        const res = await this.messageService.sendMessageToLid(rec.lid, personalizedMsg, {
          simulateTyping: schedule.settings.simulateTyping,
          sessionId: schedule.settings.senderDeviceId,
          useRoundRobin: schedule.settings.deviceMode === 'round_robin'
        }, schedule.user_id || undefined);
        success = res.status === 'sent';
        providerMsgId = res.provider_message_id || null;
      } catch (err: any) {
        success = false;
        errorMsg = err.message || 'Transmission failed';
      }

      const now = new Date().toISOString();
      if (success) {
        sentCount++;
        db.prepare(`
          UPDATE broadcast_schedule_recipients 
          SET 
            status = 'sent',
            sent_message = ?,
            provider_message_id = ?,
            batch_day = ?,
            sent_at = ?,
            updated_at = ?
          WHERE id = ?
        `).run(personalizedMsg, providerMsgId, currentDay, now, now, rec.id);
      } else {
        failedCount++;
        db.prepare(`
          UPDATE broadcast_schedule_recipients 
          SET 
            status = 'failed',
            error_message = ?,
            batch_day = ?,
            updated_at = ?
          WHERE id = ?
        `).run(errorMsg, currentDay, now, rec.id);
      }

      // Safe Delay between batch items
      if (i < pendingRecipients.length - 1) {
        const minMs = Math.max(1000, (schedule.settings.minDelaySeconds || 8) * 1000);
        const maxMs = Math.max(minMs, (schedule.settings.maxDelaySeconds || 16) * 1000);
        const delayMs = Math.floor(minMs + Math.random() * (maxMs - minMs));
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    // Check remaining pending in schedule
    const remainingRow = db.prepare(`
      SELECT COUNT(*) as count FROM broadcast_schedule_recipients 
      WHERE schedule_id = ? AND status = 'pending'
    `).get(scheduleId) as { count: number };

    const remainingCount = remainingRow.count;
    const nowIso = new Date().toISOString();
    const isFinished = remainingCount === 0;

    // Compute next run time for tomorrow
    const nextRun = isFinished ? null : this.computeNextRun(schedule.scheduled_time, new Date());

    db.prepare(`
      UPDATE broadcast_schedules 
      SET 
        sent_recipients = sent_recipients + ?,
        failed_recipients = failed_recipients + ?,
        last_run_at = ?,
        next_run_at = ?,
        status = ?,
        completed_at = CASE WHEN ? THEN datetime('now') ELSE completed_at END,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      sentCount,
      failedCount,
      nowIso,
      nextRun,
      isFinished ? 'completed' : 'active',
      isFinished ? 1 : 0,
      scheduleId
    );

    console.log(`[Broadcast Scheduler] Batch finished for ${schedule.name}. Sent: ${sentCount}, Failed: ${failedCount}, Remaining: ${remainingCount}. Next Run: ${nextRun || 'Done'}`);

    this.emitToUser(schedule.user_id, 'scheduler:batch_completed', {
      scheduleId,
      sent: sentCount,
      failed: failedCount,
      remaining: remainingCount,
      nextRunAt: nextRun,
      isCompleted: isFinished
    });

    return { sent: sentCount, failed: failedCount, remaining: remainingCount };
  }
}
