import { Response } from 'express';
import fs from 'fs';
import path from 'path';
import { getCrmDb } from '../db/index.js';
import { AuthenticatedRequest } from '../../middleware/authMiddleware.js';
import { CrmImportService } from '../services/CrmImportService.js';
import { CrmExportService } from '../services/CrmExportService.js';
import { CrmWebhookService } from '../services/CrmWebhookService.js';

export class CrmInternalController {
  private static async getWorkspaceId(req: AuthenticatedRequest): Promise<string> {
    const db = getCrmDb();
    const explicitWsId = req.header('X-Workspace-Id') || (req.query.workspace_id as string);
    if (explicitWsId) {
      const ws = await db.getWorkspace(explicitWsId);
      if (ws) return ws.id;
    }
    const defaultWs = await db.getUserDefaultWorkspace(req.user!.id);
    return defaultWs.id;
  }

  // =========================================================================
  // WORKSPACES
  // =========================================================================
  public static async getWorkspaces(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const workspaces = await db.getUserWorkspaces(req.user!.id);
      const defaultWs = await db.getUserDefaultWorkspace(req.user!.id);
      res.json({ success: true, workspaces, current_workspace: defaultWs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async createWorkspace(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const ws = await db.createWorkspace(req.user!.id, req.body.name, req.body.slug);
      res.status(201).json({ success: true, workspace: ws });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  // =========================================================================
  // CONTACTS
  // =========================================================================
  public static async listContacts(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const limit = parseInt(req.query.limit as string, 10) || 50;
      const cursor = req.query.cursor as string | undefined;
      const search = req.query.search as string | undefined;
      const listId = req.query.list_id as string | undefined;
      const tagId = req.query.tag_id as string | undefined;
      let filter = undefined;

      if (req.query.filter) {
        try {
          filter = JSON.parse(req.query.filter as string);
        } catch {}
      }

      const result = await db.listContacts(wsId, {
        filter,
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
      res.status(500).json({ error: err.message });
    }
  }

  public static async getContact(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const contact = await db.getContact(wsId, String(req.params.id));

      if (!contact) {
        res.status(404).json({ error: 'Contact not found' });
        return;
      }

      const activities = await db.listActivities(wsId, String(req.params.id), 20);
      res.json({ success: true, contact, activities });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async createContact(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const contact = await db.createContact(wsId, req.body);

      db.logActivity(wsId, {
        contact_id: contact.id,
        user_id: req.user!.id,
        type: 'note',
        title: 'Contact Created',
        details: { source: 'manual_ui' }
      }).catch(() => {});

      CrmWebhookService.getInstance().dispatchEvent(wsId, 'contact.created', contact).catch(() => {});

      res.status(201).json({ success: true, contact });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async updateContact(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const contact = await db.updateContact(wsId, String(req.params.id), req.body);

      db.logActivity(wsId, {
        contact_id: contact.id,
        user_id: req.user!.id,
        type: 'note',
        title: 'Contact Updated',
        details: req.body
      }).catch(() => {});

      CrmWebhookService.getInstance().dispatchEvent(wsId, 'contact.updated', contact).catch(() => {});

      res.json({ success: true, contact });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async deleteContact(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const soft = req.query.permanent !== 'true';

      await db.deleteContact(wsId, String(req.params.id), soft);
      CrmWebhookService.getInstance().dispatchEvent(wsId, 'contact.deleted', { id: String(req.params.id), deleted: true }).catch(() => {});

      res.json({ success: true, message: 'Contact deleted' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async restoreContact(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      await db.restoreContact(wsId, String(req.params.id));
      res.json({ success: true, message: 'Contact restored' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async bulkAction(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const { action, contact_ids, tag_id, list_id, update_fields } = req.body;
      const ids: string[] = Array.isArray(contact_ids) ? contact_ids : [];

      if (ids.length === 0) {
        res.status(400).json({ error: 'No contact IDs provided' });
        return;
      }

      let affected = 0;
      switch (action) {
        case 'tag':
          if (!tag_id) throw new Error('tag_id is required');
          affected = await db.tagContacts(wsId, tag_id, ids);
          break;
        case 'untag':
          if (!tag_id) throw new Error('tag_id is required');
          affected = await db.untagContacts(wsId, tag_id, ids);
          break;
        case 'add_to_list':
          if (!list_id) throw new Error('list_id is required');
          affected = await db.addContactsToList(wsId, list_id, ids);
          break;
        case 'remove_from_list':
          if (!list_id) throw new Error('list_id is required');
          affected = await db.removeContactsFromList(wsId, list_id, ids);
          break;
        case 'delete':
          for (const id of ids) {
            await db.deleteContact(wsId, id, true);
            affected++;
          }
          break;
        case 'edit_field':
          if (!update_fields) throw new Error('update_fields is required');
          for (const id of ids) {
            await db.updateContact(wsId, id, update_fields);
            affected++;
          }
          break;
        default:
          throw new Error(`Unknown bulk action: ${action}`);
      }

      res.json({ success: true, affected_count: affected });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async findDuplicates(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const duplicates = await db.findDuplicates(wsId, 50);
      res.json({ success: true, duplicates });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async mergeContacts(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const { primary_id, duplicate_id, field_resolutions } = req.body;

      const merged = await db.mergeContacts(wsId, primary_id, duplicate_id, field_resolutions || {});
      res.json({ success: true, contact: merged });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  // =========================================================================
  // LISTS & SEGMENTS
  // =========================================================================
  public static async listLists(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const lists = await db.listLists(wsId);
      res.json({ success: true, lists });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async createList(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const list = await db.createList(
        wsId,
        req.body.name,
        req.body.description,
        Boolean(req.body.is_dynamic),
        req.body.filter_definition
      );
      res.status(201).json({ success: true, list });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async updateList(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const list = await db.updateList(wsId, String(req.params.id), req.body);
      res.json({ success: true, list });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async deleteList(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      await db.deleteList(wsId, String(req.params.id));
      res.json({ success: true, message: 'List deleted' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async refreshListCount(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const count = await db.refreshListCount(wsId, String(req.params.id));
      res.json({ success: true, count });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // =========================================================================
  // TAGS
  // =========================================================================
  public static async listTags(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const tags = await db.listTags(wsId);
      res.json({ success: true, tags });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async createTag(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const tag = await db.createTag(wsId, req.body.name, req.body.color);
      res.status(201).json({ success: true, tag });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async deleteTag(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      await db.deleteTag(wsId, String(req.params.id));
      res.json({ success: true, message: 'Tag deleted' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // =========================================================================
  // CUSTOM FIELDS
  // =========================================================================
  public static async listCustomFields(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const fields = await db.listCustomFields(wsId);
      res.json({ success: true, fields });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async createCustomField(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const field = await db.createCustomField(wsId, req.body);
      res.status(201).json({ success: true, field });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async deleteCustomField(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      await db.deleteCustomField(wsId, String(req.params.id));
      res.json({ success: true, message: 'Custom field deleted' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // =========================================================================
  // COMPANIES
  // =========================================================================
  public static async listCompanies(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const search = req.query.search as string | undefined;
      const companies = await db.listCompanies(wsId, search);
      res.json({ success: true, companies });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async createCompany(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const company = await db.createCompany(wsId, req.body);
      res.status(201).json({ success: true, company });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  // =========================================================================
  // ACTIVITIES & TIMELINE
  // =========================================================================
  public static async listActivities(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const activities = await db.listActivities(wsId, String(req.params.contactId));
      res.json({ success: true, activities });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async logActivity(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const act = await db.logActivity(wsId, {
        contact_id: String(req.params.contactId),
        user_id: req.user!.id,
        type: req.body.type || 'note',
        title: req.body.title || 'Note',
        details: req.body.details || {}
      });
      res.status(201).json({ success: true, activity: act });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  // =========================================================================
  // IMPORTS WIZARD
  // =========================================================================
  public static async createImport(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const { filename, file_content_base64, column_mapping, dedupe_rule, list_id } = req.body;

      if (!filename || !file_content_base64) {
        res.status(400).json({ error: 'filename and file_content_base64 are required' });
        return;
      }

      const importsDir = path.resolve('data/crm_imports/uploads');
      if (!fs.existsSync(importsDir)) {
        fs.mkdirSync(importsDir, { recursive: true });
      }

      const filePath = path.join(importsDir, `${Date.now()}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
      fs.writeFileSync(filePath, Buffer.from(file_content_base64, 'base64'));

      const importJob = await db.createImport(wsId, {
        user_id: req.user!.id,
        filename,
        file_path: filePath,
        column_mapping: column_mapping || {},
        dedupe_rule: dedupe_rule || 'update',
        list_id: list_id || null
      });

      // Launch async stream import
      CrmImportService.getInstance().processImport(importJob.id, wsId).catch((err) => {
        console.error('[CrmImport] Async error:', err);
      });

      res.status(201).json({ success: true, import: importJob });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async listImports(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const imports = await db.listImports(wsId);
      res.json({ success: true, imports });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async getImport(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const imp = await db.getImport(wsId, String(req.params.id));
      if (!imp) {
        res.status(404).json({ error: 'Import job not found' });
        return;
      }
      res.json({ success: true, import: imp });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async downloadImportErrorReport(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const reportsDir = path.resolve('data/crm_imports/reports');
      const filePath = path.join(reportsDir, `error_report_${String(req.params.id)}.csv`);
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: 'Error report not found' });
        return;
      }
      res.download(filePath, `import_error_report_${String(req.params.id)}.csv`);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // =========================================================================
  // EXPORTS
  // =========================================================================
  public static async createExport(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const format = req.body.format || 'csv';

      const exportJob = await db.createExport(wsId, {
        user_id: req.user!.id,
        format,
        filter_definition: req.body.filter_definition
      });

      // Process export asynchronously
      CrmExportService.getInstance().processExport(exportJob.id, wsId).catch((err) => {
        console.error('[CrmExport] Async error:', err);
      });

      res.status(202).json({ success: true, export: exportJob });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async listExports(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const exportsList = await db.listExports(wsId);
      res.json({ success: true, exports: exportsList });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async downloadExport(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const exp = await db.getExport(wsId, String(req.params.id));

      if (!exp || !exp.file_path || !fs.existsSync(exp.file_path)) {
        res.status(404).json({ error: 'Export file not ready or expired' });
        return;
      }

      res.download(exp.file_path, `crm_export_${exp.id}.${exp.format}`);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // =========================================================================
  // SUPPRESSION LIST
  // =========================================================================
  public static async listSuppression(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const list = await db.listSuppression(wsId);
      res.json({ success: true, suppression: list });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async addSuppression(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const item = await db.addSuppression(wsId, req.body);
      res.status(201).json({ success: true, suppression: item });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async removeSuppression(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      await db.removeSuppression(wsId, String(req.params.id));
      res.json({ success: true, message: 'Removed from suppression list' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // =========================================================================
  // API KEYS
  // =========================================================================
  public static async listApiKeys(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const keys = await db.listApiKeys(wsId);
      res.json({ success: true, api_keys: keys });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async createApiKey(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const result = await db.createApiKey(wsId, {
        user_id: req.user!.id,
        name: req.body.name,
        scopes: req.body.scopes,
        is_test: Boolean(req.body.is_test)
      });
      res.status(201).json({ success: true, api_key: result.apiKey, secret_key: result.rawSecretKey });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async revokeApiKey(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      await db.revokeApiKey(wsId, String(req.params.id));
      res.json({ success: true, message: 'API key revoked' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // =========================================================================
  // WEBHOOKS
  // =========================================================================
  public static async listWebhooks(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const webhooks = await db.listWebhooks(wsId);
      res.json({ success: true, webhooks });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async createWebhook(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const hook = await db.createWebhook(wsId, req.body);
      res.status(201).json({ success: true, webhook: hook });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async deleteWebhook(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      await db.deleteWebhook(wsId, String(req.params.id));
      res.json({ success: true, message: 'Webhook deleted' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async listWebhookDeliveries(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const deliveries = await db.listWebhookDeliveries(wsId, String(req.params.id));
      res.json({ success: true, deliveries });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // =========================================================================
  // USAGE & AUDIT LOGS
  // =========================================================================
  public static async getUsageStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const stats = await db.getApiUsageStats(wsId, 30);
      res.json({ success: true, stats });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async listAuditLogs(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const logs = await db.listAuditLogs(wsId, 100);
      res.json({ success: true, logs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
