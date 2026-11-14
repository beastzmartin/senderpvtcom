import crypto from 'crypto';
import { getDatabase } from '../db/database.js';
import { getSocketIO } from '../socket/socketManager.js';
import { ExtractionJobRecord, ExtractionJobStatus } from './connectors/types.js';

export class ExtractionJobService {
  private static instance: ExtractionJobService | null = null;

  public static getInstance(): ExtractionJobService {
    if (!ExtractionJobService.instance) {
      ExtractionJobService.instance = new ExtractionJobService();
    }
    return ExtractionJobService.instance;
  }

  private mapRow(row: any): ExtractionJobRecord {
    return {
      id: row.id,
      user_id: row.user_id,
      source: row.source,
      keyword: row.keyword || null,
      location: row.location || null,
      requested_count: row.requested_count || 50,
      collected_count: row.collected_count || 0,
      duplicate_count: row.duplicate_count || 0,
      failed_count: row.failed_count || 0,
      status: row.status as ExtractionJobStatus,
      current_progress: row.current_progress || 0,
      settings: row.settings ? JSON.parse(row.settings) : null,
      error_message: row.error_message || null,
      started_at: row.started_at || null,
      completed_at: row.completed_at || null,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  public createJob(
    userId: string,
    data: {
      source: string;
      keyword?: string;
      location?: string;
      requested_count?: number;
      settings?: any;
    }
  ): ExtractionJobRecord {
    const db = getDatabase();
    const id = crypto.randomUUID();
    const count = Math.max(1, Math.min(1000, data.requested_count || 50));

    db.prepare(`
      INSERT INTO extraction_jobs (
        id, user_id, source, keyword, location, requested_count,
        collected_count, duplicate_count, failed_count, status,
        current_progress, settings, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        0, 0, 0, 'pending',
        0, ?, datetime('now'), datetime('now')
      )
    `).run(
      id,
      userId,
      data.source || 'google_maps',
      data.keyword ? data.keyword.trim() : null,
      data.location ? data.location.trim() : null,
      count,
      data.settings ? JSON.stringify(data.settings) : null
    );

    const job = this.getJobById(userId, id)!;
    try {
      getSocketIO()?.to(`user:${userId}`).emit('extraction:job_created', job);
    } catch {}

    return job;
  }

  public getJobById(userId: string, jobId: string): ExtractionJobRecord | null {
    const db = getDatabase();
    const row = db.prepare(`SELECT * FROM extraction_jobs WHERE id = ? AND user_id = ?`).get(jobId, userId) as any;
    if (!row) return null;
    return this.mapRow(row);
  }

  public listJobs(userId: string, limit: number = 50): ExtractionJobRecord[] {
    const db = getDatabase();
    const rows = db
      .prepare(`SELECT * FROM extraction_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`)
      .all(userId, limit) as any[];
    return rows.map((r) => this.mapRow(r));
  }

  public updateProgress(
    jobId: string,
    progress: number,
    collectedCount: number,
    duplicateCount: number = 0,
    failedCount: number = 0
  ): void {
    const db = getDatabase();
    db.prepare(`
      UPDATE extraction_jobs
      SET current_progress = ?, collected_count = ?, duplicate_count = ?, failed_count = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(Math.min(100, Math.max(0, progress)), collectedCount, duplicateCount, failedCount, jobId);

    const row = db.prepare(`SELECT * FROM extraction_jobs WHERE id = ?`).get(jobId) as any;
    if (row) {
      const job = this.mapRow(row);
      try {
        getSocketIO()?.to(`user:${job.user_id}`).emit('extraction:progress', {
          jobId,
          progress: job.current_progress,
          collected: job.collected_count,
          duplicates: job.duplicate_count,
          failed: job.failed_count
        });
      } catch {}
    }
  }

  public startJob(userId: string, jobId: string): ExtractionJobRecord {
    const db = getDatabase();
    db.prepare(`
      UPDATE extraction_jobs
      SET status = 'running', started_at = COALESCE(started_at, datetime('now')), updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(jobId, userId);

    const job = this.getJobById(userId, jobId)!;
    try {
      getSocketIO()?.to(`user:${userId}`).emit('extraction:job_updated', job);
    } catch {}
    return job;
  }

  public pauseJob(userId: string, jobId: string): ExtractionJobRecord {
    const db = getDatabase();
    db.prepare(`
      UPDATE extraction_jobs
      SET status = 'paused', updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(jobId, userId);

    const job = this.getJobById(userId, jobId)!;
    try {
      getSocketIO()?.to(`user:${userId}`).emit('extraction:job_updated', job);
    } catch {}
    return job;
  }

  public resumeJob(userId: string, jobId: string): ExtractionJobRecord {
    return this.startJob(userId, jobId);
  }

  public cancelJob(userId: string, jobId: string): ExtractionJobRecord {
    const db = getDatabase();
    db.prepare(`
      UPDATE extraction_jobs
      SET status = 'cancelled', completed_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(jobId, userId);

    const job = this.getJobById(userId, jobId)!;
    try {
      getSocketIO()?.to(`user:${userId}`).emit('extraction:job_updated', job);
    } catch {}
    return job;
  }

  public completeJob(jobId: string, finalCount: number, duplicates: number, failed: number): void {
    const db = getDatabase();
    db.prepare(`
      UPDATE extraction_jobs
      SET status = 'completed', current_progress = 100, collected_count = ?, duplicate_count = ?, failed_count = ?, completed_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(finalCount, duplicates, failed, jobId);

    const row = db.prepare(`SELECT * FROM extraction_jobs WHERE id = ?`).get(jobId) as any;
    if (row) {
      const job = this.mapRow(row);
      try {
        getSocketIO()?.to(`user:${job.user_id}`).emit('extraction:job_completed', job);
      } catch {}
    }
  }

  public failJob(jobId: string, errorMessage: string): void {
    const db = getDatabase();
    db.prepare(`
      UPDATE extraction_jobs
      SET status = 'failed', error_message = ?, completed_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(errorMessage, jobId);

    const row = db.prepare(`SELECT * FROM extraction_jobs WHERE id = ?`).get(jobId) as any;
    if (row) {
      const job = this.mapRow(row);
      try {
        getSocketIO()?.to(`user:${job.user_id}`).emit('extraction:job_failed', job);
      } catch {}
    }
  }

  public deleteJob(userId: string, jobId: string): boolean {
    const db = getDatabase();
    const res = db.prepare(`DELETE FROM extraction_jobs WHERE id = ? AND user_id = ?`).run(jobId, userId);
    return res.changes > 0;
  }
}
