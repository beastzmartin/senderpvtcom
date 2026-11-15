import { Request, Response, NextFunction } from 'express';
import { ContactService } from '../services/contactService.js';
import { WhatsAppManager } from '../services/whatsapp/WhatsAppManager.js';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';

export class ContactController {
  private contactService: ContactService;
  private whatsappManager: WhatsAppManager;

  constructor() {
    this.contactService = ContactService.getInstance();
    this.whatsappManager = WhatsAppManager.getInstance();
  }

  public getContacts = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const search = req.query.search as string | undefined;
      const contacts = this.contactService.getContacts(search, req.user?.id);
      res.json({
        data: contacts,
        count: contacts.length
      });
    } catch (err) {
      next(err);
    }
  };

  public getContactById = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const contact = this.contactService.getContactById(id, req.user?.id);
      if (!contact) {
        res.status(404).json({ error: `Contact with id "${id}" not found.` });
        return;
      }
      res.json(contact);
    } catch (err) {
      next(err);
    }
  };

  public createContact = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, phone_number, lid, avatar_url, notes } = req.body;

      if (!name || typeof name !== 'string' || name.trim() === '') {
        res.status(400).json({ error: 'Name is required.' });
        return;
      }

      if (!phone_number && !lid) {
        res.status(400).json({ error: 'Please provide either a phone number or a WhatsApp LID.' });
        return;
      }

      const contact = this.contactService.createContact({
        name,
        phone_number,
        lid,
        avatar_url,
        notes
      }, req.user?.id);

      res.status(201).json({
        success: true,
        message: 'Contact created successfully',
        data: contact
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  public updateContact = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { name, phone_number, lid, avatar_url, notes } = req.body;

      const contact = this.contactService.updateContact(id, {
        name,
        phone_number,
        lid,
        avatar_url,
        notes
      }, req.user?.id);

      res.json({
        success: true,
        message: 'Contact updated successfully',
        data: contact
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  public deleteContact = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      this.contactService.deleteContact(id, req.user?.id);
      res.json({
        success: true,
        message: 'Contact deleted successfully'
      });
    } catch (err: any) {
      next(err);
    }
  };

  public importCsv = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { csvContent } = req.body;
      if (!csvContent || typeof csvContent !== 'string') {
        res.status(400).json({ error: 'Field "csvContent" is required as a string.' });
        return;
      }

      const result = this.contactService.importCsv(csvContent, req.user?.id);
      res.json({
        success: true,
        message: `Imported ${result.imported} contacts. ${result.skipped} skipped.`,
        data: result
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };

  /**
   * Bulk resolve a list of LIDs to real WhatsApp phone numbers
   */
  public bulkResolveLids = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { lids } = req.body;
      if (!Array.isArray(lids) || lids.length === 0) {
        res.status(400).json({ error: 'Field "lids" must be a non-empty array of WhatsApp LIDs.' });
        return;
      }

      console.log(`[Contact Controller] Resolving ${lids.length} LIDs in bulk...`);
      let results;

      if (this.whatsappManager.getStatus(undefined, req.user?.id) === 'connected') {
        results = await this.whatsappManager.resolveLidsToPhones(lids, undefined, req.user?.id);
      } else {
        // Fallback to local database resolution
        results = this.contactService.bulkResolveLidsLocally(lids);
      }

      const resolvedCount = results.filter((r) => r.status === 'resolved').length;
      const unresolvedCount = results.filter((r) => r.status === 'unresolved').length;

      res.json({
        success: true,
        total: results.length,
        resolved: resolvedCount,
        unresolved: unresolvedCount,
        results
      });
    } catch (err: any) {
      console.error('[Contact Controller] Error resolving LIDs:', err);
      res.status(500).json({ error: err.message || 'Failed to resolve LIDs.' });
    }
  };

  /**
   * Harvest and sync LID mappings across all participating WhatsApp groups
   */
  public syncGroupLidMappings = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (this.whatsappManager.getStatus(undefined, req.user?.id) !== 'connected') {
        res.status(400).json({ error: 'WhatsApp is not connected. Connect via QR code first.' });
        return;
      }

      const result = await this.whatsappManager.syncAllGroupLids(undefined, req.user?.id);
      res.json({
        success: true,
        message: `Scanned ${result.totalScanned} participants across ${result.totalGroups} groups. Discovered ${result.newMappings} new mappings. Total mappings: ${result.totalMappings}.`,
        data: result
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to sync group LID mappings.' });
    }
  };

  /**
   * Get all stored LID mappings with search and pagination
   */
  public getLidMappings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const search = req.query.search as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

      const result = this.contactService.getLidMappings({ search, limit, offset });
      res.json({
        data: result.data,
        total: result.total,
        limit,
        offset
      });
    } catch (err: any) {
      next(err);
    }
  };
}
