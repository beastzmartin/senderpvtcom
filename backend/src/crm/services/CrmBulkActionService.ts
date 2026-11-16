import fs from 'fs';
import path from 'path';
import { getCrmDb } from '../db/index.js';
import { BulkActionType, CrmBulkJob, FilterGroup, Contact } from '../models/types.js';

const SNAPSHOTS_DIR = path.resolve('data/crm_bulk_snapshots');
if (!fs.existsSync(SNAPSHOTS_DIR)) {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
}

export class CrmBulkActionService {
  private static instance: CrmBulkActionService | null = null;
  private activeJobs: Map<string, { paused: boolean; cancelled: boolean }> = new Map();

  public static getInstance(): CrmBulkActionService {
    if (!CrmBulkActionService.instance) {
      CrmBulkActionService.instance = new CrmBulkActionService();
    }
    return CrmBulkActionService.instance;
  }

  /**
   * Enqueue and start a tracked bulk action job
   */
  public async startJob(
    workspaceId: string,
    userId: string | undefined,
    actionType: BulkActionType,
    filter: FilterGroup,
    payload: Record<string, any>
  ): Promise<CrmBulkJob> {
    const db = getCrmDb();

    // Query matched contacts count
    const count = await db.getApproximateContactCount(workspaceId, filter);

    const snapshotFilename = `job_${Date.now()}_${Math.random().toString(36).substring(7)}.json`;
    const snapshotPath = path.join(SNAPSHOTS_DIR, snapshotFilename);

    const job = await db.createBulkJob(workspaceId, {
      user_id: userId,
      action_type: actionType,
      filter_criteria: filter,
      action_payload: payload,
      total_matched: count,
      undo_snapshot_available: true,
      undo_snapshot_path: snapshotPath
    });

    // Run execution in non-blocking background task
    this.activeJobs.set(job.id, { paused: false, cancelled: false });
    this.executeJobAsync(workspaceId, job.id, filter, actionType, payload, snapshotPath).catch((err) => {
      console.error(`[CrmBulkActionService] Uncaught error in job ${job.id}:`, err);
    });

    return job;
  }

  public async pauseJob(workspaceId: string, jobId: string): Promise<boolean> {
    const db = getCrmDb();
    const ctrl = this.activeJobs.get(jobId);
    if (ctrl) ctrl.paused = true;
    await db.updateBulkJobProgress(jobId, { status: 'paused' });
    return true;
  }

  public async resumeJob(workspaceId: string, jobId: string): Promise<boolean> {
    const db = getCrmDb();
    const job = await db.getBulkJob(workspaceId, jobId);
    if (!job) return false;

    let ctrl = this.activeJobs.get(jobId);
    if (!ctrl) {
      ctrl = { paused: false, cancelled: false };
      this.activeJobs.set(jobId, ctrl);
      this.executeJobAsync(workspaceId, jobId, job.filter_criteria, job.action_type, job.action_payload, job.undo_snapshot_path || '').catch(() => {});
    } else {
      ctrl.paused = false;
    }

    await db.updateBulkJobProgress(jobId, { status: 'running' });
    return true;
  }

  public async cancelJob(workspaceId: string, jobId: string): Promise<boolean> {
    const db = getCrmDb();
    const ctrl = this.activeJobs.get(jobId);
    if (ctrl) ctrl.cancelled = true;
    await db.updateBulkJobProgress(jobId, { status: 'cancelled' });
    return true;
  }

  /**
   * Revert all mutations made by a completed job using its snapshot
   */
  public async undoJob(workspaceId: string, jobId: string): Promise<{ restored_count: number }> {
    const db = getCrmDb();
    const job = await db.getBulkJob(workspaceId, jobId);
    if (!job) throw new Error('Bulk job not found');
    if (!job.undo_snapshot_path || !fs.existsSync(job.undo_snapshot_path)) {
      throw new Error('Undo snapshot is not available for this job');
    }

    const raw = fs.readFileSync(job.undo_snapshot_path, 'utf8');
    const snapshot: Record<string, Partial<Contact>> = JSON.parse(raw || '{}');
    let restored = 0;

    for (const [contactId, prevData] of Object.entries(snapshot)) {
      try {
        if (job.action_type === 'bulk_delete') {
          await db.restoreContact(workspaceId, contactId);
        } else if (job.action_type === 'bulk_archive') {
          await db.unarchiveContact(workspaceId, contactId);
        } else if (job.action_type === 'bulk_unarchive') {
          await db.archiveContact(workspaceId, contactId);
        } else {
          // Revert updated fields
          await db.updateContact(workspaceId, contactId, prevData);
        }
        restored++;
      } catch (err) {
        console.warn(`[CrmBulkActionService] Error restoring contact ${contactId}:`, err);
      }
    }

    await db.updateBulkJobProgress(jobId, { status: 'undone' });
    db.emitOutboxEvent(workspaceId, 'bulk_job.undone', 'bulk_job', jobId, { restored_count: restored }).catch(() => {});

    return { restored_count: restored };
  }

  private async executeJobAsync(
    workspaceId: string,
    jobId: string,
    filter: FilterGroup,
    actionType: BulkActionType,
    payload: Record<string, any>,
    snapshotPath: string
  ): Promise<void> {
    const db = getCrmDb();
    await db.updateBulkJobProgress(jobId, { status: 'running' });

    const ctrl = this.activeJobs.get(jobId);
    const snapshotMap: Record<string, Partial<Contact>> = {};

    let processed = 0;
    let success = 0;
    let errors = 0;
    const errorDetails: Array<{ contact_id: string; error: string }> = [];

    let cursor: string | undefined = undefined;
    const chunkSize = 200;

    while (true) {
      if (ctrl?.cancelled) {
        await db.updateBulkJobProgress(jobId, { status: 'cancelled' });
        break;
      }

      if (ctrl?.paused) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      const listRes = await db.listContacts(workspaceId, {
        filter,
        pagination: { limit: chunkSize, cursor }
      });

      const contacts = listRes.data;
      if (contacts.length === 0) break;

      for (const c of contacts) {
        if (ctrl?.cancelled) break;

        try {
          // Record pre-mutation snapshot
          snapshotMap[c.id] = {
            status: c.status,
            title: c.title,
            company_id: c.company_id,
            custom_fields: { ...(c.custom_fields || {}) },
            is_archived: c.is_archived
          };

          if (actionType === 'bulk_update') {
            await db.updateContact(workspaceId, c.id, payload.updates || payload);
          } else if (actionType === 'bulk_archive') {
            await db.archiveContact(workspaceId, c.id);
          } else if (actionType === 'bulk_unarchive') {
            await db.unarchiveContact(workspaceId, c.id);
          } else if (actionType === 'bulk_delete') {
            await db.deleteContact(workspaceId, c.id, true);
          } else if (actionType === 'bulk_add_to_list' && payload.list_id) {
            await db.addContactsToList(workspaceId, payload.list_id, [c.id]);
          } else if (actionType === 'bulk_remove_from_list' && payload.list_id) {
            await db.removeContactsFromList(workspaceId, payload.list_id, [c.id]);
          } else if (actionType === 'bulk_tag' && payload.tag_id) {
            await db.tagContacts(workspaceId, payload.tag_id, [c.id]);
          } else if (actionType === 'bulk_untag' && payload.tag_id) {
            await db.untagContacts(workspaceId, payload.tag_id, [c.id]);
          }

          success++;
        } catch (err: any) {
          errors++;
          errorDetails.push({ contact_id: c.id, error: err.message });
        } finally {
          processed++;
        }
      }

      // Periodically flush snapshot and progress
      fs.writeFileSync(snapshotPath, JSON.stringify(snapshotMap), 'utf8');
      await db.updateBulkJobProgress(jobId, {
        processed_count: processed,
        success_count: success,
        error_count: errors,
        error_details: errorDetails.slice(-20) // Keep last 20 errors
      });

      if (!listRes.has_more || !listRes.next_cursor) break;
      cursor = listRes.next_cursor;
    }

    this.activeJobs.delete(jobId);
    if (!ctrl?.cancelled) {
      await db.updateBulkJobProgress(jobId, {
        status: errors > 0 && success === 0 ? 'failed' : 'completed',
        processed_count: processed,
        success_count: success,
        error_count: errors
      });
      db.emitOutboxEvent(workspaceId, 'bulk_job.completed', 'bulk_job', jobId, {
        action_type: actionType,
        total_processed: processed,
        success_count: success
      }).catch(() => {});
    }
  }
}

