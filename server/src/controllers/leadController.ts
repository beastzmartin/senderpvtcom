import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { LeadService } from '../services/leadService.js';
import { LeadFilterOptions, LeadStatus } from '../services/connectors/types.js';

export class LeadController {
  private leadService: LeadService;

  constructor() {
    this.leadService = LeadService.getInstance();
  }

  public listLeads = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const {
        search,
        source,
        status,
        industry,
        city,
        tagId,
        hasPhone,
        hasEmail,
        hasWebsite,
        startDate,
        endDate,
        page,
        limit,
        sortBy,
        sortOrder
      } = req.query;

      const filters: LeadFilterOptions = {
        search: search as string,
        source: source as string,
        status: status as LeadStatus | 'all',
        industry: industry as string,
        city: city as string,
        tagId: tagId as string,
        hasPhone: hasPhone === 'true',
        hasEmail: hasEmail === 'true',
        hasWebsite: hasWebsite === 'true',
        startDate: startDate as string,
        endDate: endDate as string,
        page: page ? parseInt(page as string, 10) : 1,
        limit: limit ? parseInt(limit as string, 10) : 50,
        sortBy: (sortBy as any) || 'created_at',
        sortOrder: (sortOrder as any) || 'desc'
      };

      const result = this.leadService.listLeads(userId, filters);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public getStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const stats = this.leadService.getLeadStats(userId);
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public getLead = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const leadId = req.params.id as string;
      const lead = this.leadService.getLeadById(userId, leadId);
      if (!lead) {
        res.status(404).json({ error: 'Lead not found.' });
        return;
      }
      res.json(lead);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public createLead = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const lead = this.leadService.createLead(userId, req.body);
      res.status(201).json(lead);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  public batchSync = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { leads, jobId } = req.body;
      if (!Array.isArray(leads)) {
        res.status(400).json({ error: 'Payload must contain a "leads" array.' });
        return;
      }
      const result = this.leadService.batchCreateLeads(userId, leads, jobId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public updateLead = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const leadId = req.params.id as string;
      const updated = this.leadService.updateLead(userId, leadId, req.body);
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  public deleteLead = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const leadId = req.params.id as string;
      const success = this.leadService.deleteLead(userId, leadId);
      if (!success) {
        res.status(404).json({ error: 'Lead not found or already deleted.' });
        return;
      }
      res.json({ success: true, message: 'Lead deleted successfully.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public bulkDelete = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ error: 'Array of lead IDs is required.' });
        return;
      }
      const count = this.leadService.bulkDeleteLeads(userId, ids);
      res.json({ success: true, deletedCount: count });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public bulkUpdateStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { ids, status } = req.body;
      if (!Array.isArray(ids) || ids.length === 0 || !status) {
        res.status(400).json({ error: 'Array of lead IDs and a valid status are required.' });
        return;
      }
      const count = this.leadService.bulkUpdateStatus(userId, ids, status);
      res.json({ success: true, updatedCount: count });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public exportCsv = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const ids = req.query.ids ? (req.query.ids as string).split(',') : undefined;
      const csv = this.leadService.exportLeadsToCsv(userId, ids);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=leads_export_${Date.now()}.csv`);
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public enrichLead = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const leadId = req.params.id as string;
      const enriched = this.leadService.enrichLead(userId, leadId);
      res.json(enriched);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  public listTags = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const tags = this.leadService.listTags(userId);
      res.json(tags);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public createTag = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { name, color } = req.body;
      if (!name) {
        res.status(400).json({ error: 'Tag name is required.' });
        return;
      }
      const tag = this.leadService.createTag(userId, name, color);
      res.status(201).json(tag);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  public tagLead = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { leadId, tagId } = req.body;
      if (!leadId || !tagId) {
        res.status(400).json({ error: 'leadId and tagId are required.' });
        return;
      }
      this.leadService.tagLead(leadId, tagId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  public untagLead = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { leadId, tagId } = req.body;
      if (!leadId || !tagId) {
        res.status(400).json({ error: 'leadId and tagId are required.' });
        return;
      }
      this.leadService.untagLead(leadId, tagId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  public listNotes = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const leadId = req.params.id as string;
      const notes = this.leadService.listNotes(leadId);
      res.json(notes);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public addNote = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const leadId = req.params.id as string;
      const { content } = req.body;
      if (!content || !content.trim()) {
        res.status(400).json({ error: 'Note content cannot be empty.' });
        return;
      }
      const note = this.leadService.addNote(userId, leadId, content);
      res.status(201).json(note);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };
}
