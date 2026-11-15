import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { ExtractionJobService } from '../services/extractionJobService.js';
import { ConnectorRegistry } from '../services/connectors/ConnectorRegistry.js';
import { getDatabase } from '../db/database.js';

export class ExtractionJobController {
  private jobService: ExtractionJobService;

  constructor() {
    this.jobService = ExtractionJobService.getInstance();
  }

  public listJobs = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const jobs = this.jobService.listJobs(userId, limit);
      res.json(jobs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public getJob = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const jobId = req.params.id as string;
      const job = this.jobService.getJobById(userId, jobId);
      if (!job) {
        res.status(404).json({ error: 'Extraction job not found.' });
        return;
      }
      res.json(job);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public createJob = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { source, keyword, location, requested_count, settings } = req.body;

      if (!source) {
        res.status(400).json({ error: 'Extraction source is required.' });
        return;
      }

      const job = this.jobService.createJob(userId, {
        source,
        keyword,
        location,
        requested_count,
        settings
      });

      res.status(201).json(job);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  public startJob = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const jobId = req.params.id as string;
      const job = this.jobService.startJob(userId, jobId);
      res.json(job);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  public pauseJob = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const jobId = req.params.id as string;
      const job = this.jobService.pauseJob(userId, jobId);
      res.json(job);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  public resumeJob = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const jobId = req.params.id as string;
      const job = this.jobService.resumeJob(userId, jobId);
      res.json(job);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  public cancelJob = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const jobId = req.params.id as string;
      const job = this.jobService.cancelJob(userId, jobId);
      res.json(job);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  public updateProgress = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const jobId = req.params.id as string;
      const { progress, collected, duplicates, failed } = req.body;
      this.jobService.updateProgress(
        jobId,
        progress || 0,
        collected || 0,
        duplicates || 0,
        failed || 0
      );
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  public deleteJob = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const jobId = req.params.id as string;
      const success = this.jobService.deleteJob(userId, jobId);
      if (!success) {
        res.status(404).json({ error: 'Job not found.' });
        return;
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public listSources = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();
      const rows = db.prepare(`SELECT * FROM extraction_sources WHERE is_active = 1 ORDER BY category ASC, name ASC`).all() as any[];
      const sources = rows.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        description: r.description,
        icon: r.icon,
        badge: r.badge,
        is_active: r.is_active === 1,
        supported_fields: JSON.parse(r.supported_fields || '[]')
      }));
      res.json(sources);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };
}
