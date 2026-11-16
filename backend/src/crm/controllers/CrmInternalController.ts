import { Response } from 'express';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse';
import ExcelJS from 'exceljs';
import { getCrmDb } from '../db/index.js';
import { AuthenticatedRequest } from '../../middleware/authMiddleware.js';
import { CrmImportService } from '../services/CrmImportService.js';
import { CrmExportService } from '../services/CrmExportService.js';
import { CrmWebhookService } from '../services/CrmWebhookService.js';
import { CrmIdentityService } from '../services/CrmIdentityService.js';
import { CrmVerificationPipeline } from '../services/CrmVerificationPipeline.js';
import { CrmEnrichmentWaterfall } from '../services/CrmEnrichmentWaterfall.js';
import { CrmDataHealthService } from '../services/CrmDataHealthService.js';
import { CrmNlSearchService } from '../services/CrmNlSearchService.js';
import { CrmBulkActionService } from '../services/CrmBulkActionService.js';
import { CrmLeadScoringService } from '../services/CrmLeadScoringService.js';
import { CrmAiAssistantService } from '../services/CrmAiAssistantService.js';
import { CrmAiComposerService } from '../services/CrmAiComposerService.js';
import { CrmSmartImportService } from '../services/CrmSmartImportService.js';
import { CrmWorkflowEngine } from '../services/CrmWorkflowEngine.js';
import { CrmComplianceService } from '../services/CrmComplianceService.js';
import { CrmPipelineService } from '../services/CrmPipelineService.js';
import { CrmPresenceService } from '../services/CrmPresenceService.js';
import { CrmSecurityService } from '../services/CrmSecurityService.js';
import { CrmGdprService } from '../services/CrmGdprService.js';
import { CrmCloudApiAdapter } from '../services/CrmCloudApiAdapter.js';
import { CrmOpenApiService } from '../services/CrmOpenApiService.js';
import { CrmAnalyticsService } from '../services/CrmAnalyticsService.js';

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
        contacts: result.data || [],
        data: result.data || [],
        next_cursor: result.next_cursor || null,
        prev_cursor: null,
        has_more: Boolean(result.has_more),
        total_approx: result.approximate_total || 0,
        pagination: {
          next_cursor: result.next_cursor || null,
          has_more: Boolean(result.has_more),
          approximate_total: result.approximate_total || 0
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
      const limit = parseInt(req.query.limit as string, 10) || 50;
      const duplicates = await db.findDuplicates(wsId, limit);
      res.json({ success: true, duplicates: duplicates || [], duplicate_groups: duplicates || [] });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async mergeContacts(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const primary_id = req.body.primary_id || req.body.primary_contact_id;
      const duplicate_id = req.body.duplicate_id || req.body.duplicate_contact_id;
      const field_resolutions = req.body.field_resolutions || req.body.field_overrides || {};

      const merged = await db.mergeContacts(wsId, primary_id, duplicate_id, field_resolutions);
      res.json({ success: true, contact: merged, merged_contact: merged });
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
  public static async uploadImportFile(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const file = (req as any).file;
      if (!file) {
        res.status(400).json({ error: 'No file uploaded. Please select a valid CSV or Excel file.' });
        return;
      }

      const filePath = file.path;
      const originalName = file.originalname;
      const ext = path.extname(originalName).toLowerCase();

      let headers: string[] = [];
      let previewRows: any[] = [];

      if (ext === '.xlsx' || ext === '.xls') {
        const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
          entries: 'emit',
          sharedStrings: 'cache',
          hyperlinks: 'ignore',
          worksheets: 'emit'
        });

        for await (const worksheetReader of workbookReader) {
          for await (const row of worksheetReader) {
            const values = (row.values as any[]).slice(1);
            if (headers.length === 0) {
              headers = values.map((v) => String(v ?? '').trim()).filter(Boolean);
            } else if (previewRows.length < 5) {
              const rowObj: Record<string, any> = {};
              headers.forEach((h, idx) => {
                rowObj[h] = values[idx] !== undefined && values[idx] !== null ? String(values[idx]) : '';
              });
              previewRows.push(rowObj);
            } else {
              break;
            }
          }
          break; // only inspect first worksheet
        }
      } else {
        // Stream preview of CSV file
        const stream = fs.createReadStream(filePath, { start: 0, end: 128 * 1024 });
        const parser = stream.pipe(
          parse({
            relax_column_count: true,
            trim: true,
            skip_empty_lines: true
          })
        );

        let isHeader = true;
        for await (const record of parser) {
          if (isHeader) {
            headers = (record as string[]).map((h) => String(h ?? '').trim()).filter(Boolean);
            isHeader = false;
          } else if (previewRows.length < 5) {
            const rowObj: Record<string, any> = {};
            headers.forEach((h, idx) => {
              rowObj[h] = (record as any)[idx] ?? '';
            });
            previewRows.push(rowObj);
          } else {
            break;
          }
        }
      }

      res.json({
        success: true,
        file_path: filePath,
        original_name: originalName,
        headers,
        preview_rows: previewRows
      });
    } catch (err: any) {
      console.error('[CrmInternalController] uploadImportFile error:', err);
      res.status(400).json({ error: err.message || 'Failed to inspect uploaded file' });
    }
  }

  public static async executeImport(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const { file_path, file_name, column_mapping, dedupe_policy, target_list_id } = req.body;

      if (!file_path || !fs.existsSync(file_path)) {
        res.status(400).json({ error: 'Uploaded file not found or expired. Please upload again.' });
        return;
      }

      const filename = file_name || path.basename(file_path);
      const importJob = await db.createImport(wsId, {
        user_id: req.user!.id,
        filename,
        file_path,
        column_mapping: column_mapping || {},
        dedupe_rule: dedupe_policy || 'update',
        list_id: target_list_id || null
      });

      // Launch async stream import worker
      CrmImportService.getInstance().processImport(importJob.id, wsId).catch((err) => {
        console.error('[CrmImport] Async error:', err);
      });

      res.status(202).json({
        success: true,
        import_job_id: importJob.id,
        message: 'Import job scheduled successfully in background.'
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

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
      res.json({
        success: true,
        import: {
          ...imp,
          created_rows: imp.imported_rows
        }
      });
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

  // =========================================================================
  // CRM V2 PHASE 1: CONTACT ARCHIVING (HOT / COLD TIERING)
  // =========================================================================
  public static async archiveContact(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const success = await db.archiveContact(wsId, String(req.params.id));
      res.json({ success, message: success ? 'Contact archived (moved to cold tier)' : 'Contact not found' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async unarchiveContact(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const success = await db.unarchiveContact(wsId, String(req.params.id));
      res.json({ success, message: success ? 'Contact restored to hot tier' : 'Contact not found' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // =========================================================================
  // CRM V2 PHASE 1: CUSTOM OBJECTS & RECORDS
  // =========================================================================
  public static async listCustomObjects(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const objects = await db.listCustomObjects(wsId);
      res.json({ success: true, objects });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async getCustomObject(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const obj = await db.getCustomObject(wsId, String(req.params.idOrSlug));
      if (!obj) {
        res.status(404).json({ error: 'Custom object not found' });
        return;
      }
      const fields = await db.listCustomObjectFields(wsId, obj.id);
      res.json({ success: true, object: obj, fields });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async createCustomObject(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const obj = await db.createCustomObject(wsId, req.body);
      res.status(201).json({ success: true, object: obj });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async deleteCustomObject(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      await db.deleteCustomObject(wsId, String(req.params.id));
      res.json({ success: true, message: 'Custom object deleted' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async listCustomObjectFields(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const fields = await db.listCustomObjectFields(wsId, String(req.params.objectId));
      res.json({ success: true, fields });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async createCustomObjectField(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const field = await db.createCustomObjectField(wsId, {
        ...req.body,
        object_id: String(req.params.objectId)
      });
      res.status(201).json({ success: true, field });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async deleteCustomObjectField(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      await db.deleteCustomObjectField(wsId, String(req.params.fieldId));
      res.json({ success: true, message: 'Field deleted' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async listCustomObjectRecords(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const obj = await db.getCustomObject(wsId, String(req.params.idOrSlug));
      if (!obj) {
        res.status(404).json({ error: 'Custom object not found' });
        return;
      }
      const limit = parseInt(req.query.limit as string, 10) || 50;
      const cursor = req.query.cursor as string | undefined;

      const result = await db.listCustomObjectRecords(wsId, obj.id, { limit, cursor });
      res.json({
        success: true,
        records: result.data,
        data: result.data,
        next_cursor: result.next_cursor,
        has_more: result.has_more
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async getCustomObjectRecord(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const record = await db.getCustomObjectRecord(wsId, String(req.params.recordId));
      if (!record) {
        res.status(404).json({ error: 'Record not found' });
        return;
      }
      res.json({ success: true, record });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async createCustomObjectRecord(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const obj = await db.getCustomObject(wsId, String(req.params.idOrSlug));
      if (!obj) {
        res.status(404).json({ error: 'Custom object not found' });
        return;
      }
      const record = await db.createCustomObjectRecord(wsId, obj.id, req.body.properties || req.body);
      res.status(201).json({ success: true, record });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async updateCustomObjectRecord(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const record = await db.updateCustomObjectRecord(wsId, String(req.params.recordId), req.body.properties || req.body);
      res.json({ success: true, record });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async deleteCustomObjectRecord(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      await db.deleteCustomObjectRecord(wsId, String(req.params.recordId));
      res.json({ success: true, message: 'Record deleted' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // =========================================================================
  // RELATIONSHIPS & ASSOCIATIONS
  // =========================================================================
  public static async listObjectRelationships(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const relationships = await db.listObjectRelationships(wsId);
      res.json({ success: true, relationships });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async createObjectRelationship(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const relationship = await db.createObjectRelationship(wsId, req.body);
      res.status(201).json({ success: true, relationship });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async associateObjects(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const { relationship_id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, metadata } = req.body;
      const association = await db.associateObjects(
        wsId,
        relationship_id,
        source_entity_type,
        source_entity_id,
        target_entity_type,
        target_entity_id,
        metadata || {}
      );
      res.status(201).json({ success: true, association });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async listAssociatedObjects(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const associations = await db.listAssociatedObjects(wsId, String(req.params.entityType), String(req.params.entityId));
      res.json({ success: true, associations });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async removeAssociation(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      await db.removeAssociation(wsId, String(req.params.associationId));
      res.json({ success: true, message: 'Association removed' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // =========================================================================
  // FIELD HISTORY & 1-CLICK RESTORE
  // =========================================================================
  public static async getFieldHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const history = await db.getFieldHistory(wsId, String(req.params.entityType), String(req.params.entityId));
      res.json({ success: true, history });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async restoreFieldHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const success = await db.restoreFieldHistory(wsId, String(req.params.historyId));
      res.json({ success, message: success ? 'Field value restored to previous state' : 'Restore failed' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  // =========================================================================
  // CRM V2 PHASE 2: IDENTITY RESOLUTION & GOLDEN RECORD
  // =========================================================================
  public static async scanDuplicates(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const identityService = CrmIdentityService.getInstance();
      const autoMergeThreshold = req.body.auto_merge_threshold ? Number(req.body.auto_merge_threshold) : 95;
      const reviewThreshold = req.body.review_threshold ? Number(req.body.review_threshold) : 70;
      const survivorship = req.body.survivorship_strategy || 'most_complete';

      const result = await identityService.scanAndResolveDuplicates(wsId, {
        autoMergeThreshold,
        reviewThreshold,
        survivorshipStrategy: survivorship,
        limit: req.body.limit ? Number(req.body.limit) : 250
      });

      res.json({ success: true, result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async listDuplicateCandidates(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const status = req.query.status as string | undefined;
      const limit = parseInt(req.query.limit as string, 10) || 50;

      const candidates = await db.listDuplicateCandidates(wsId, status, limit);
      res.json({ success: true, candidates });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async manualMergeIdentity(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const identityService = CrmIdentityService.getInstance();
      const { primary_id, duplicate_id, field_overrides, survivorship_strategy } = req.body;

      if (!primary_id || !duplicate_id) {
        res.status(400).json({ error: 'primary_id and duplicate_id are required' });
        return;
      }

      const merged = await identityService.manualMerge(
        wsId,
        primary_id,
        duplicate_id,
        field_overrides,
        survivorship_strategy || 'most_complete'
      );

      res.json({ success: true, contact: merged });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async dismissDuplicateCandidate(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const success = await db.updateDuplicateCandidateStatus(wsId, String(req.params.id), 'dismissed', req.user?.id);
      res.json({ success, message: success ? 'Candidate dismissed' : 'Candidate not found' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async unmergeContacts(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const identityService = CrmIdentityService.getInstance();
      const success = await identityService.unmerge(wsId, String(req.params.mergeId));
      res.json({ success, message: success ? 'Contact successfully unmerged and restored' : 'Merge record not found or already unmerged' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async listMerges(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const limit = parseInt(req.query.limit as string, 10) || 50;
      const merges = await db.listMerges(wsId, limit);
      res.json({ success: true, merges });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // =========================================================================
  // CRM V2 PHASE 2: VERIFICATION PIPELINE
  // =========================================================================
  public static async verifyContact(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const pipeline = CrmVerificationPipeline.getInstance();
      const result = await pipeline.verifyContact(wsId, String(req.params.contactId));
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async batchVerifyContacts(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const pipeline = CrmVerificationPipeline.getInstance();
      const limit = parseInt(req.body.limit as string, 10) || 100;
      const result = await pipeline.batchVerifyContacts(wsId, limit);
      res.json({ success: true, result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async listContactVerifications(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const logs = await db.listVerifications(wsId, String(req.params.contactId));
      res.json({ success: true, logs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // =========================================================================
  // CRM V2 PHASE 2: ENRICHMENT WATERFALL
  // =========================================================================
  public static async enrichContact(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const waterfall = CrmEnrichmentWaterfall.getInstance();
      const result = await waterfall.enrichContact(wsId, String(req.params.contactId), req.user?.id);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async listEnrichmentProviders(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const providers = await db.listEnrichmentProviders(wsId);
      res.json({ success: true, providers });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async saveEnrichmentProvider(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const saved = await db.saveEnrichmentProvider(wsId, req.body);
      res.json({ success: true, provider: saved });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  // =========================================================================
  // CRM V2 PHASE 2: DATA HEALTH DASHBOARD & 1-CLICK FIXES
  // =========================================================================
  public static async getDataHealth(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const healthService = CrmDataHealthService.getInstance();
      const metrics = await healthService.getHealthDashboard(wsId);
      res.json({ success: true, metrics });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async fixNormalize(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const healthService = CrmDataHealthService.getInstance();
      const result = await healthService.cleanAndNormalizeJob(wsId);
      res.json({ success: true, message: `Normalized ${result.fixed} of ${result.examined} contacts`, result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async fixBatchVerify(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const healthService = CrmDataHealthService.getInstance();
      const result = await healthService.batchVerifyEmailsJob(wsId, req.body.limit ? Number(req.body.limit) : 200);
      res.json({ success: true, message: `Verified ${result.processed} contacts (${result.valid} valid, ${result.invalid} invalid, ${result.risky} risky)`, result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async fixAutoMerge(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const healthService = CrmDataHealthService.getInstance();
      const result = await healthService.autoMergeDuplicatesJob(wsId, req.body.threshold ? Number(req.body.threshold) : 95);
      res.json({ success: true, message: `Auto-merged ${result.auto_merged} high-confidence duplicate pairs`, result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async fixArchiveStale(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const healthService = CrmDataHealthService.getInstance();
      const result = await healthService.archiveStaleContactsJob(wsId, req.body.days ? Number(req.body.days) : 365);
      res.json({ success: true, message: `Archived ${result.archived_count} stale contacts to cold tier`, result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // =========================================================================
  // CRM V2 PHASE 3: NATURAL LANGUAGE SEARCH
  // =========================================================================
  public static async parseNlSearch(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const nlService = CrmNlSearchService.getInstance();
      const result = nlService.parseNaturalLanguageQuery(req.body.query || '');
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  // =========================================================================
  // CRM V2 PHASE 3: SAVED VIEWS & DYNAMIC SEGMENTS
  // =========================================================================
  public static async listSavedViews(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const views = await db.listSavedViews(wsId);
      res.json({ success: true, views });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async getSavedView(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const view = await db.getSavedView(wsId, String(req.params.id));
      if (!view) {
        res.status(404).json({ error: 'Saved view not found' });
        return;
      }
      res.json({ success: true, view });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async createSavedView(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const view = await db.createSavedView(wsId, {
        ...req.body,
        user_id: req.user?.id
      });
      res.status(201).json({ success: true, view });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async updateSavedView(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const view = await db.updateSavedView(wsId, String(req.params.id), req.body);
      res.json({ success: true, view });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async deleteSavedView(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      await db.deleteSavedView(wsId, String(req.params.id));
      res.json({ success: true, message: 'Saved view deleted' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // =========================================================================
  // CRM V2 PHASE 3: BULK ACTIONS ENGINE
  // =========================================================================
  public static async startBulkJob(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const bulkService = CrmBulkActionService.getInstance();
      const { action_type, filter, payload } = req.body;

      if (!action_type) {
        res.status(400).json({ error: 'action_type is required' });
        return;
      }

      const job = await bulkService.startJob(
        wsId,
        req.user?.id,
        action_type,
        filter || { combinator: 'AND', conditions: [] },
        payload || {}
      );

      res.status(202).json({ success: true, job });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async listBulkJobs(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const limit = parseInt(req.query.limit as string, 10) || 20;
      const jobs = await db.listBulkJobs(wsId, limit);
      res.json({ success: true, jobs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async getBulkJob(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const job = await db.getBulkJob(wsId, String(req.params.id));
      if (!job) {
        res.status(404).json({ error: 'Bulk job not found' });
        return;
      }
      res.json({ success: true, job });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async pauseBulkJob(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const bulkService = CrmBulkActionService.getInstance();
      const success = await bulkService.pauseJob(wsId, String(req.params.id));
      res.json({ success, message: 'Bulk job paused' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async resumeBulkJob(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const bulkService = CrmBulkActionService.getInstance();
      const success = await bulkService.resumeJob(wsId, String(req.params.id));
      res.json({ success, message: 'Bulk job resumed' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async cancelBulkJob(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const bulkService = CrmBulkActionService.getInstance();
      const success = await bulkService.cancelJob(wsId, String(req.params.id));
      res.json({ success, message: 'Bulk job cancelled' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async undoBulkJob(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const bulkService = CrmBulkActionService.getInstance();
      const result = await bulkService.undoJob(wsId, String(req.params.id));
      res.json({ success: true, message: `Successfully reverted mutations for ${result.restored_count} contacts`, result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  // =========================================================================
  // CRM V2 PHASE 4: AI LAYER & SMART ENGINES
  // =========================================================================
  public static async scoreContact(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const contactId = String(req.params.contactId);
      const scoringService = CrmLeadScoringService.getInstance();
      const result = await scoringService.scoreContact(wsId, contactId);
      res.json({ success: true, result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async batchScoreContacts(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const { filter, limit } = req.body;
      const scoringService = CrmLeadScoringService.getInstance();
      const result = await scoringService.batchScoreContacts(wsId, filter, limit);
      res.json({ success: true, result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async listScoringRules(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const rules = await db.listScoringRules(wsId);
      res.json({ success: true, rules });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async saveScoringRule(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const rule = await db.saveScoringRule(wsId, req.body);
      res.json({ success: true, rule });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async deleteScoringRule(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const success = await db.deleteScoringRule(wsId, String(req.params.id));
      res.json({ success });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async generateContactBrief(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const contactId = String(req.params.contactId);
      const forceRefresh = req.query.force === 'true';
      const aiAssistant = CrmAiAssistantService.getInstance();
      const brief = await aiAssistant.generateContactBrief(wsId, contactId, {
        userId: req.user?.id,
        forceRefresh
      });
      res.json({ success: true, brief });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async composeOutreach(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const { contact_id, channel, goal, tone, language, custom_instructions } = req.body;
      if (!contact_id) {
        res.status(400).json({ error: 'contact_id is required' });
        return;
      }
      const composer = CrmAiComposerService.getInstance();
      const result = await composer.composeOutreach(wsId, {
        contactId: contact_id,
        channel: channel || 'whatsapp',
        goal,
        tone,
        language,
        customInstructions: custom_instructions,
        userId: req.user?.id
      });
      res.json({ success: true, result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async analyzeImportHeaders(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { headers, sample_rows } = req.body;
      if (!headers || !Array.isArray(headers)) {
        res.status(400).json({ error: 'headers array is required' });
        return;
      }
      const importAi = CrmSmartImportService.getInstance();
      const analysis = importAi.analyzeHeaders(headers, sample_rows || []);
      res.json({ success: true, analysis });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async getAiUsageSummary(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const days = parseInt(req.query.days as string, 10) || 30;
      const summary = await db.getAiUsageSummary(wsId, days);
      res.json({ success: true, summary });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // =========================================================================
  // CRM V2 PHASE 5: WORKFLOW AUTOMATIONS & RUNS
  // =========================================================================
  public static async listWorkflows(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const workflows = await db.listWorkflows(wsId);
      res.json({ success: true, workflows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async getWorkflow(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const workflow = await db.getWorkflow(wsId, String(req.params.id));
      if (!workflow) {
        res.status(404).json({ error: 'Workflow not found' });
        return;
      }
      res.json({ success: true, workflow });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async createWorkflow(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const workflow = await db.createWorkflow(wsId, req.body);
      res.status(201).json({ success: true, workflow });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async updateWorkflow(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const workflow = await db.updateWorkflow(wsId, String(req.params.id), req.body);
      res.json({ success: true, workflow });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async deleteWorkflow(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const success = await db.deleteWorkflow(wsId, String(req.params.id));
      res.json({ success });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async triggerWorkflow(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const workflowId = String(req.params.id);
      const { contact_id, event_data } = req.body;
      if (!contact_id) {
        res.status(400).json({ error: 'contact_id is required' });
        return;
      }
      const wf = await db.getWorkflow(wsId, workflowId);
      if (!wf) {
        res.status(404).json({ error: 'Workflow not found' });
        return;
      }
      const engine = CrmWorkflowEngine.getInstance();
      const runs = await engine.triggerEvent(wsId, wf.trigger_type, contact_id, event_data || {});
      res.json({ success: true, message: `Workflow triggered successfully`, runs });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async listWorkflowRuns(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const workflowId = req.query.workflow_id as string | undefined;
      const limit = parseInt(req.query.limit as string, 10) || 50;
      const runs = await db.listWorkflowRuns(wsId, workflowId, limit);
      res.json({ success: true, runs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async getWorkflowRun(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const run = await db.getWorkflowRun(wsId, String(req.params.runId));
      if (!run) {
        res.status(404).json({ error: 'Workflow run not found' });
        return;
      }
      res.json({ success: true, run });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async listWorkflowStepLogs(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const logs = await db.listWorkflowStepLogs(String(req.params.runId));
      res.json({ success: true, logs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // =========================================================================
  // CRM V2 PHASE 5: COMPLIANCE & DELIVERABILITY POLICIES
  // =========================================================================
  public static async getCompliancePolicy(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const policy = await db.getCompliancePolicy(wsId);
      res.json({ success: true, policy });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async saveCompliancePolicy(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const policy = await db.saveCompliancePolicy(wsId, req.body);
      res.json({ success: true, policy });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async checkCompliance(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const { contact_id, channel } = req.body;
      if (!contact_id) {
        res.status(400).json({ error: 'contact_id is required' });
        return;
      }
      const compliance = CrmComplianceService.getInstance();
      const check = await compliance.canSendMessage(wsId, contact_id, channel || 'whatsapp');
      res.json({ success: true, check });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async handleInboundKeyword(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const { contact_id, message } = req.body;
      if (!contact_id || !message) {
        res.status(400).json({ error: 'contact_id and message are required' });
        return;
      }
      const compliance = CrmComplianceService.getInstance();
      const result = await compliance.handleInboundKeyword(wsId, contact_id, message);
      res.json({ success: true, result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  // =========================================================================
  // CRM V2 PHASE 6: PIPELINES, DEALS, TASKS & PRESENCE
  // =========================================================================
  public static async listPipelines(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const pipelines = await db.listPipelines(wsId);
      res.json({ success: true, pipelines });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async createPipeline(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const { name, is_default } = req.body;
      const pipeline = await db.createPipeline(wsId, name || 'New Pipeline', Boolean(is_default));
      res.status(201).json({ success: true, pipeline });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async listPipelineStages(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const stages = await db.listPipelineStages(wsId, String(req.params.id));
      res.json({ success: true, stages });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async createPipelineStage(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const pipelineId = String(req.params.id);
      const stage = await db.createPipelineStage(wsId, { ...req.body, pipeline_id: pipelineId });
      res.status(201).json({ success: true, stage });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async updatePipelineStage(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const stageId = String(req.params.stageId);
      const stage = await db.updatePipelineStage(wsId, stageId, req.body);
      res.json({ success: true, stage });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async getKanbanBoard(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const pipelineId = req.query.pipeline_id as string | undefined;
      const pipelineService = CrmPipelineService.getInstance();
      const board = await pipelineService.getKanbanBoard(wsId, pipelineId);
      res.json({ success: true, board });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async listDeals(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const { pipeline_id, stage_id, contact_id, status } = req.query;
      const deals = await db.listDeals(wsId, {
        pipelineId: pipeline_id as string,
        stageId: stage_id as string,
        contactId: contact_id as string,
        status: status as string
      });
      res.json({ success: true, deals });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async getDeal(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const deal = await db.getDeal(wsId, String(req.params.id));
      if (!deal) {
        res.status(404).json({ error: 'Deal not found' });
        return;
      }
      res.json({ success: true, deal });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async createDeal(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const pipelineService = CrmPipelineService.getInstance();
      const deal = await pipelineService.saveDeal(wsId, {
        ...req.body,
        owner_user_id: req.user?.id
      });
      res.status(201).json({ success: true, deal });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async updateDeal(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const pipelineService = CrmPipelineService.getInstance();
      const deal = await pipelineService.saveDeal(wsId, {
        ...req.body,
        id: String(req.params.id)
      });
      res.json({ success: true, deal });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async deleteDeal(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const success = await db.deleteDeal(wsId, String(req.params.id));
      res.json({ success });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async listTasks(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const { contact_id, deal_id, status, assigned_to } = req.query;
      const tasks = await db.listTasks(wsId, {
        contactId: contact_id as string,
        dealId: deal_id as string,
        status: status as string,
        assignedTo: assigned_to as string
      });
      res.json({ success: true, tasks });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async createTask(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const task = await db.createTask(wsId, {
        ...req.body,
        assigned_to_user_id: req.body.assigned_to_user_id || req.user?.id
      });
      res.status(201).json({ success: true, task });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async updateTask(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const task = await db.updateTask(wsId, String(req.params.id), req.body);
      res.json({ success: true, task });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async deleteTask(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const success = await db.deleteTask(wsId, String(req.params.id));
      res.json({ success });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async presenceHeartbeat(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const { entity_type, entity_id, action } = req.body;
      if (!entity_type || !entity_id) {
        res.status(400).json({ error: 'entity_type and entity_id are required' });
        return;
      }
      const presence = CrmPresenceService.getInstance();
      await presence.heartbeat(
        wsId,
        entity_type,
        entity_id,
        req.user!.id,
        req.user!.username || 'Teammate',
        action || 'viewing'
      );
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async getPresenceCollisions(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const entityType = req.params.entityType as 'contact' | 'deal';
      const entityId = String(req.params.entityId);
      const presence = CrmPresenceService.getInstance();
      const collisions = await presence.getCollisions(wsId, entityType, entityId, req.user?.id);
      res.json({ success: true, ...collisions });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async presenceLeave(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const { entity_type, entity_id } = req.body;
      const presence = CrmPresenceService.getInstance();
      await presence.leave(wsId, entity_type, entity_id, req.user!.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  // =========================================================================
  // CRM V2 PHASE 7: RBAC, PRIVACY, MASKING & GDPR ERASURE
  // =========================================================================
  public static async listRolePermissions(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const permissions = await db.listRolePermissions(wsId);
      res.json({ success: true, permissions });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async saveRolePermission(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const perm = await db.saveRolePermission(wsId, req.body);
      res.json({ success: true, permission: perm });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async listSensitiveFields(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const fields = await db.listSensitiveFields(wsId);
      res.json({ success: true, fields });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async addSensitiveField(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const field = await db.addSensitiveField(wsId, req.body);
      res.status(201).json({ success: true, field });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async removeSensitiveField(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const success = await db.removeSensitiveField(wsId, String(req.params.id));
      res.json({ success });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async revealMaskedField(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const { contact_id, field_name } = req.body;
      if (!contact_id || !field_name) {
        res.status(400).json({ error: 'contact_id and field_name are required' });
        return;
      }
      const db = getCrmDb();
      const contact = await db.getContact(wsId, contact_id);
      if (!contact) {
        res.status(404).json({ error: 'Contact not found' });
        return;
      }

      // Log the reveal audit
      const security = CrmSecurityService.getInstance();
      await security.logRevealAudit(wsId, req.user!.id, contact_id, field_name, req.ip);

      let rawValue = (contact as any)[field_name];
      if (rawValue === undefined && contact.custom_fields) {
        rawValue = contact.custom_fields[field_name];
      }

      res.json({ success: true, field_name, value: rawValue });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async executeGdprErasure(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const { contact_id, requester_email } = req.body;
      if (!contact_id || !requester_email) {
        res.status(400).json({ error: 'contact_id and requester_email are required' });
        return;
      }
      const gdprService = CrmGdprService.getInstance();
      const cert = await gdprService.executeErasure(wsId, contact_id, requester_email, req.user?.id);
      res.json({
        success: true,
        message: 'Data subject hard deleted and cryptographic erasure certificate generated',
        certificate: cert
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async getErasureCertificate(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const cert = await db.getErasureCertificate(String(req.params.id));
      if (!cert) {
        res.status(404).json({ error: 'Certificate not found' });
        return;
      }
      res.json({ success: true, certificate: cert });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async exportSubjectDataBundle(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const contactId = String(req.params.contactId);
      const gdprService = CrmGdprService.getInstance();
      const bundle = await gdprService.exportSubjectDataBundle(wsId, contactId);
      res.json({ success: true, bundle });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async exportAuditLogs(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const db = getCrmDb();
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const limit = parseInt(req.query.limit as string, 10) || 100;
      const logs = await db.listAuditLogs(wsId, limit);
      res.json({ success: true, logs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // =========================================================================
  // CRM V2 PHASE 8: EXTERNAL API V2 & CLOUD API
  // =========================================================================
  public static async testWebhook(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const webhookId = String(req.params.id);
      const webhookService = CrmWebhookService.getInstance();
      const result = await webhookService.testWebhook(wsId, webhookId);
      res.json({ success: true, result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async handleCloudApiWebhook(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const adapter = CrmCloudApiAdapter.getInstance();
      const result = await adapter.handleWebhookPayload(wsId, req.body || {});
      res.json({ success: true, result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async getOpenApiSpec(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const openApi = CrmOpenApiService.getInstance();
      const spec = openApi.getOpenApiSpec();
      res.json(spec);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // =========================================================================
  // CRM V2 PHASE 9: ANALYTICS, FUNNELS, ATTRIBUTION & COHORTS
  // =========================================================================
  public static async getFunnelMetrics(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const pipelineId = req.query.pipeline_id as string | undefined;
      const analytics = CrmAnalyticsService.getInstance();
      const funnel = await analytics.getFunnelMetrics(wsId, pipelineId);
      res.json({ success: true, funnel });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async getAttributionMetrics(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const analytics = CrmAnalyticsService.getInstance();
      const attribution = await analytics.getAttributionMetrics(wsId);
      res.json({ success: true, attribution });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async getCohortRetention(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const months = parseInt(req.query.months as string, 10) || 6;
      const analytics = CrmAnalyticsService.getInstance();
      const cohorts = await analytics.getCohortRetention(wsId, months);
      res.json({ success: true, cohorts });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async runCustomReport(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const wsId = await CrmInternalController.getWorkspaceId(req);
      const { dimension, metrics, chart_type, format } = req.body;
      const analytics = CrmAnalyticsService.getInstance();

      const result = await analytics.runCustomReport(wsId, {
        dimension: dimension || 'country',
        metrics: metrics || ['count'],
        chart_type: chart_type || 'bar'
      });

      if (format === 'csv' || req.query.format === 'csv') {
        const csv = analytics.exportReportCsv(result);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=report-${dimension}-${Date.now()}.csv`);
        res.send(csv);
        return;
      }

      res.json({ success: true, report: result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
}
