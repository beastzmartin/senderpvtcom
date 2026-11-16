import { Response } from 'express';
import crypto from 'crypto';
import { getCrmDb } from '../db/index.js';
import { CrmApiRequest, cacheIdempotentResponse } from '../middleware/crmApiAuth.js';
import { CrmWebhookService } from '../services/CrmWebhookService.js';
import { CrmExportService } from '../services/CrmExportService.js';
import { CrmNormalizer } from '../services/crmNormalizer.js';
import { MarketplaceJobService } from '../../services/marketplace/MarketplaceJobService.js';

export class CrmExternalApiController {
  // =========================================================================
  // CONTACTS CRUD & BULK
  // =========================================================================
  public static async listContacts(req: CrmApiRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const workspaceId = req.crmWorkspaceId!;
      const limit = parseInt(req.query.limit as string, 10) || 50;
      const cursor = req.query.cursor as string | undefined;
      const search = req.query.search as string | undefined;
      const listId = req.query.list_id as string | undefined;
      const tagId = req.query.tag_id as string | undefined;

      const result = await db.listContacts(workspaceId, {
        search,
        listId,
        tagId,
        pagination: { limit, cursor }
      });

      res.json({
        success: true,
        data: result.data,
        pagination: {
          next_cursor: result.next_cursor,
          has_more: result.has_more,
          approximate_total: result.approximate_total
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
    }
  }

  public static async getContact(req: CrmApiRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const workspaceId = req.crmWorkspaceId!;
      const contact = await db.getContact(workspaceId, String(req.params.id));

      if (!contact) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Contact not found' });
        return;
      }

      res.json({ success: true, data: contact });
    } catch (err: any) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
    }
  }

  public static async createContact(req: CrmApiRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const workspaceId = req.crmWorkspaceId!;
      const idempotencyKey = req.header('Idempotency-Key');

      const contact = await db.createContact(workspaceId, {
        ...req.body,
        source: req.body.source || 'api'
      });

      // Dispatch webhook
      CrmWebhookService.getInstance().dispatchEvent(workspaceId, 'contact.created', contact).catch(() => {});

      const responsePayload = { success: true, data: contact };
      cacheIdempotentResponse(workspaceId, idempotencyKey, 201, responsePayload);

      res.status(201).json(responsePayload);
    } catch (err: any) {
      res.status(400).json({ error: 'BAD_REQUEST', message: err.message });
    }
  }

  public static async updateContact(req: CrmApiRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const workspaceId = req.crmWorkspaceId!;
      const contact = await db.updateContact(workspaceId, String(req.params.id), req.body);

      // Dispatch webhook
      CrmWebhookService.getInstance().dispatchEvent(workspaceId, 'contact.updated', contact).catch(() => {});

      res.json({ success: true, data: contact });
    } catch (err: any) {
      res.status(400).json({ error: 'BAD_REQUEST', message: err.message });
    }
  }

  public static async deleteContact(req: CrmApiRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const workspaceId = req.crmWorkspaceId!;
      const soft = req.query.permanent !== 'true';

      await db.deleteContact(workspaceId, String(req.params.id), soft);

      // Dispatch webhook
      CrmWebhookService.getInstance().dispatchEvent(workspaceId, 'contact.deleted', { id: String(req.params.id), deleted: true }).catch(() => {});

      res.json({ success: true, message: 'Contact deleted successfully' });
    } catch (err: any) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
    }
  }

  public static async bulkUpsertContacts(req: CrmApiRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const workspaceId = req.crmWorkspaceId!;
      const idempotencyKey = req.header('Idempotency-Key');
      const contacts = Array.isArray(req.body.contacts) ? req.body.contacts : [];
      const dedupeRule = req.body.dedupe_rule || 'update';

      if (contacts.length === 0) {
        res.status(400).json({ error: 'EMPTY_PAYLOAD', message: 'Array of contacts is required' });
        return;
      }

      // If contacts <= 1,000, process synchronously
      if (contacts.length <= 1000) {
        req.crmCreditCost = (req.crmCreditCost || 0.05) + contacts.length * 0.01; // ₹0.01 per contact
        const resStats = await db.bulkUpsertContacts(workspaceId, contacts, dedupeRule);

        const responsePayload = {
          success: true,
          mode: 'sync',
          total: contacts.length,
          inserted: resStats.inserted,
          updated: resStats.updated,
          skipped: resStats.skipped,
          errors_count: resStats.errors.length,
          errors: resStats.errors.slice(0, 10)
        };

        cacheIdempotentResponse(workspaceId, idempotencyKey, 200, responsePayload);
        res.json(responsePayload);
      } else {
        // Queue as background async job
        const jobId = crypto.randomUUID();
        // In background: process chunks
        setImmediate(async () => {
          try {
            await db.bulkUpsertContacts(workspaceId, contacts, dedupeRule);
          } catch (err) {
            console.error('[BulkAsyncJob] Error processing bulk contacts:', err);
          }
        });

        res.status(202).json({
          success: true,
          mode: 'async',
          job_id: jobId,
          message: `Batch of ${contacts.length} contacts accepted for processing in background.`,
          status_check_url: `/v1/jobs/${jobId}`
        });
      }
    } catch (err: any) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
    }
  }

  public static async searchContacts(req: CrmApiRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const workspaceId = req.crmWorkspaceId!;
      const filter = req.body.filter;
      const search = req.body.search;
      const limit = Math.min(200, Math.max(1, req.body.limit || 50));
      const cursor = req.body.cursor;

      const result = await db.listContacts(workspaceId, {
        filter,
        search,
        pagination: { limit, cursor }
      });

      res.json({
        success: true,
        data: result.data,
        pagination: {
          next_cursor: result.next_cursor,
          has_more: result.has_more,
          approximate_total: result.approximate_total
        }
      });
    } catch (err: any) {
      res.status(400).json({ error: 'BAD_REQUEST', message: err.message });
    }
  }

  public static async dedupeCheck(req: CrmApiRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const workspaceId = req.crmWorkspaceId!;
      const emailNorm = CrmNormalizer.normalizeEmail(req.body.email);
      const phoneE164 = CrmNormalizer.normalizePhone(req.body.phone);

      const existsEmail = emailNorm ? await db.listContacts(workspaceId, { search: emailNorm, pagination: { limit: 1 } }) : null;
      const existsPhone = phoneE164 ? await db.listContacts(workspaceId, { search: phoneE164, pagination: { limit: 1 } }) : null;

      const isSuppressed = await db.checkSuppressed(workspaceId, {
        email: emailNorm || undefined,
        phone: phoneE164 || undefined
      });

      res.json({
        success: true,
        is_duplicate: Boolean(existsEmail?.data[0] || existsPhone?.data[0]),
        is_suppressed: isSuppressed,
        matched_contact: existsEmail?.data[0] || existsPhone?.data[0] || null
      });
    } catch (err: any) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
    }
  }

  // =========================================================================
  // LISTS & SEGMENTS
  // =========================================================================
  public static async listLists(req: CrmApiRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const workspaceId = req.crmWorkspaceId!;
      const lists = await db.listLists(workspaceId);
      res.json({ success: true, data: lists });
    } catch (err: any) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
    }
  }

  public static async createList(req: CrmApiRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const workspaceId = req.crmWorkspaceId!;
      const list = await db.createList(
        workspaceId,
        req.body.name,
        req.body.description,
        Boolean(req.body.is_dynamic),
        req.body.filter_definition
      );
      res.status(201).json({ success: true, data: list });
    } catch (err: any) {
      res.status(400).json({ error: 'BAD_REQUEST', message: err.message });
    }
  }

  public static async addContactsToList(req: CrmApiRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const workspaceId = req.crmWorkspaceId!;
      const listId = String(req.params.id);
      const contactIds = Array.isArray(req.body.contact_ids) ? req.body.contact_ids : [];

      const count = await db.addContactsToList(workspaceId, listId, contactIds);
      res.json({ success: true, added_count: count });
    } catch (err: any) {
      res.status(400).json({ error: 'BAD_REQUEST', message: err.message });
    }
  }

  public static async removeContactsFromList(req: CrmApiRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const workspaceId = req.crmWorkspaceId!;
      const listId = String(req.params.id);
      const contactIds = Array.isArray(req.body.contact_ids) ? req.body.contact_ids : [];

      const count = await db.removeContactsFromList(workspaceId, listId, contactIds);
      res.json({ success: true, removed_count: count });
    } catch (err: any) {
      res.status(400).json({ error: 'BAD_REQUEST', message: err.message });
    }
  }

  // =========================================================================
  // TAGS
  // =========================================================================
  public static async listTags(req: CrmApiRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const workspaceId = req.crmWorkspaceId!;
      const tags = await db.listTags(workspaceId);
      res.json({ success: true, data: tags });
    } catch (err: any) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
    }
  }

  public static async createTag(req: CrmApiRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const workspaceId = req.crmWorkspaceId!;
      const tag = await db.createTag(workspaceId, req.body.name, req.body.color);
      res.status(201).json({ success: true, data: tag });
    } catch (err: any) {
      res.status(400).json({ error: 'BAD_REQUEST', message: err.message });
    }
  }

  // =========================================================================
  // EXPORTS
  // =========================================================================
  public static async createExport(req: CrmApiRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const workspaceId = req.crmWorkspaceId!;
      const format = req.body.format || 'csv';

      const exportJob = await db.createExport(workspaceId, {
        user_id: req.crmUserId || 'api',
        format,
        filter_definition: req.body.filter_definition
      });

      // Process export asynchronously
      CrmExportService.getInstance().processExport(exportJob.id, workspaceId).catch((err) => {
        console.error('[CrmExport] Async error:', err);
      });

      res.status(202).json({
        success: true,
        data: exportJob,
        message: 'Export initiated in background.',
        check_url: `/v1/exports/${exportJob.id}`
      });
    } catch (err: any) {
      res.status(400).json({ error: 'BAD_REQUEST', message: err.message });
    }
  }

  public static async getExportStatus(req: CrmApiRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const workspaceId = req.crmWorkspaceId!;
      const exp = await db.getExport(workspaceId, String(req.params.id));

      if (!exp) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Export job not found' });
        return;
      }

      res.json({ success: true, data: exp });
    } catch (err: any) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
    }
  }

  // =========================================================================
  // EXTRACTIONS TRIGGER
  // =========================================================================
  public static async triggerExtraction(req: CrmApiRequest, res: Response): Promise<void> {
    try {
      const workspaceId = req.crmWorkspaceId!;
      const userId = req.crmUserId!;
      const productSlug = req.body.product_slug;
      const input = req.body.input || {};
      const requestedItems = req.body.requested_items || 100;
      const crmListId = req.body.crm_list_id;

      if (!productSlug) {
        res.status(400).json({ error: 'MISSING_PARAM', message: 'product_slug is required' });
        return;
      }

      const jobService = MarketplaceJobService.getInstance();
      const job = await jobService.createJob(
        userId,
        productSlug,
        {
          ...input,
          crm_workspace_id: workspaceId,
          crm_list_id: crmListId
        },
        requestedItems
      );

      res.status(201).json({
        success: true,
        message: 'Extraction job scheduled into CRM pipeline.',
        job
      });
    } catch (err: any) {
      res.status(400).json({ error: 'EXTRACTION_ERROR', message: err.message });
    }
  }

  // =========================================================================
  // WEBHOOKS
  // =========================================================================
  public static async listWebhooks(req: CrmApiRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const workspaceId = req.crmWorkspaceId!;
      const hooks = await db.listWebhooks(workspaceId);
      res.json({ success: true, data: hooks });
    } catch (err: any) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
    }
  }

  public static async createWebhook(req: CrmApiRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const workspaceId = req.crmWorkspaceId!;
      const hook = await db.createWebhook(workspaceId, {
        url: req.body.url,
        description: req.body.description,
        events: req.body.events
      });
      res.status(201).json({ success: true, data: hook });
    } catch (err: any) {
      res.status(400).json({ error: 'BAD_REQUEST', message: err.message });
    }
  }

  // =========================================================================
  // API USAGE METRICS
  // =========================================================================
  public static async getUsage(req: CrmApiRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const workspaceId = req.crmWorkspaceId!;
      const stats = await db.getApiUsageStats(workspaceId, 30);
      res.json({
        success: true,
        key_info: {
          key_id: req.crmApiKey?.id,
          name: req.crmApiKey?.name,
          monthly_quota: req.crmApiKey?.monthly_quota,
          monthly_usage: req.crmApiKey?.monthly_usage,
          rate_limit_rpm: req.crmApiKey?.rate_limit_rpm
        },
        usage_last_30_days: stats
      });
    } catch (err: any) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
    }
  }
}
