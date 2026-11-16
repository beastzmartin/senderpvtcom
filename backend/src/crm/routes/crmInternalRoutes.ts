import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { crmIdempotencyMiddleware } from '../middleware/crmIdempotencyMiddleware.js';
import { CrmInternalController } from '../controllers/CrmInternalController.js';
import { getCrmOpenApiSpec } from '../services/CrmOpenApiSpec.js';
import { getCrmDb } from '../db/index.js';

const router = Router();

const uploadsDir = path.resolve('data/crm_imports/uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${Date.now()}_${safeName}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB
});

// OpenAPI Spec & Documentation route
router.get('/openapi.json', (_req, res) => {
  const host = _req.get('host') || 'localhost:3000';
  const protocol = _req.protocol || 'http';
  res.json(getCrmOpenApiSpec(`${protocol}://${host}`));
});

// All other internal CRM routes require session JWT auth
router.use(requireAuth);
router.use(crmIdempotencyMiddleware);

// Workspaces
router.get('/status', (_req, res) => {
  const db = getCrmDb();
  res.json({
    success: true,
    is_postgres: Boolean(db.isPostgres),
    engine: db.isPostgres ? 'PostgreSQL (64-way Hash Partitioned)' : 'SQLite 3 (Local Ultra-Fast WAL)'
  });
});
router.get('/workspaces', CrmInternalController.getWorkspaces);
router.post('/workspaces', CrmInternalController.createWorkspace);

// Contacts
router.get('/contacts', CrmInternalController.listContacts);
router.post('/contacts', CrmInternalController.createContact);
router.get('/contacts/duplicates', CrmInternalController.findDuplicates);
router.post('/contacts/merge', CrmInternalController.mergeContacts);
router.post('/contacts/bulk-action', CrmInternalController.bulkAction);
router.post('/contacts/bulk/update', (req, res) => {
  req.body.action = 'edit_field';
  req.body.update_fields = req.body.updates;
  return CrmInternalController.bulkAction(req as any, res);
});
router.post('/contacts/bulk/delete', (req, res) => {
  req.body.action = 'delete';
  return CrmInternalController.bulkAction(req as any, res);
});
router.get('/contacts/:id', CrmInternalController.getContact);
router.put('/contacts/:id', CrmInternalController.updateContact);
router.delete('/contacts/:id', CrmInternalController.deleteContact);
router.post('/contacts/:id/restore', CrmInternalController.restoreContact);
router.post('/contacts/:id/archive', CrmInternalController.archiveContact);
router.post('/contacts/:id/unarchive', CrmInternalController.unarchiveContact);

// Duplicates Aliases
router.get('/duplicates', CrmInternalController.findDuplicates);
router.post('/duplicates/merge', CrmInternalController.mergeContacts);

// Lists & Dynamic Segments
router.get('/lists', CrmInternalController.listLists);
router.post('/lists', CrmInternalController.createList);
router.put('/lists/:id', CrmInternalController.updateList);
router.delete('/lists/:id', CrmInternalController.deleteList);
router.post('/lists/:id/refresh-count', CrmInternalController.refreshListCount);
router.post('/lists/:id/members', (req, res) => {
  req.body.action = 'add_to_list';
  req.body.list_id = req.params.id;
  return CrmInternalController.bulkAction(req as any, res);
});
router.delete('/lists/:id/members', (req, res) => {
  req.body.action = 'remove_from_list';
  req.body.list_id = req.params.id;
  return CrmInternalController.bulkAction(req as any, res);
});

// Tags
router.get('/tags', CrmInternalController.listTags);
router.post('/tags', CrmInternalController.createTag);
router.delete('/tags/:id', CrmInternalController.deleteTag);

// Custom Fields
router.get('/custom-fields', CrmInternalController.listCustomFields);
router.post('/custom-fields', CrmInternalController.createCustomField);
router.delete('/custom-fields/:id', CrmInternalController.deleteCustomField);

// Companies
router.get('/companies', CrmInternalController.listCompanies);
router.post('/companies', CrmInternalController.createCompany);

// Activities
router.get('/activities/:contactId', CrmInternalController.listActivities);
router.post('/activities/:contactId', CrmInternalController.logActivity);

// Imports
router.post('/imports/upload', upload.single('file'), CrmInternalController.uploadImportFile);
router.post('/imports/execute', CrmInternalController.executeImport);
router.post('/imports', CrmInternalController.createImport);
router.get('/imports', CrmInternalController.listImports);
router.get('/imports/:id', CrmInternalController.getImport);
router.get('/imports/:id/error-report', CrmInternalController.downloadImportErrorReport);

// Exports
router.post('/exports', CrmInternalController.createExport);
router.get('/exports', CrmInternalController.listExports);
router.get('/exports/:id/download', CrmInternalController.downloadExport);

// Suppression
router.get('/suppression', CrmInternalController.listSuppression);
router.post('/suppression', CrmInternalController.addSuppression);
router.delete('/suppression/:id', CrmInternalController.removeSuppression);

// API Keys
router.get('/api-keys', CrmInternalController.listApiKeys);
router.post('/api-keys', CrmInternalController.createApiKey);
router.delete('/api-keys/:id', CrmInternalController.revokeApiKey);

// Webhooks
router.get('/webhooks', CrmInternalController.listWebhooks);
router.post('/webhooks', CrmInternalController.createWebhook);
router.delete('/webhooks/:id', CrmInternalController.deleteWebhook);
router.get('/webhooks/:id/deliveries', CrmInternalController.listWebhookDeliveries);

// Usage & Audit
router.get('/usage', CrmInternalController.getUsageStats);
router.get('/audit-logs', CrmInternalController.listAuditLogs);

// =========================================================================
// CRM V2 PHASE 1: CUSTOM OBJECTS & RECORDS
// =========================================================================
router.get('/objects', CrmInternalController.listCustomObjects);
router.post('/objects', CrmInternalController.createCustomObject);
router.get('/objects/:idOrSlug', CrmInternalController.getCustomObject);
router.delete('/objects/:id', CrmInternalController.deleteCustomObject);

router.get('/objects/:objectId/fields', CrmInternalController.listCustomObjectFields);
router.post('/objects/:objectId/fields', CrmInternalController.createCustomObjectField);
router.delete('/objects/:objectId/fields/:fieldId', CrmInternalController.deleteCustomObjectField);

router.get('/objects/:idOrSlug/records', CrmInternalController.listCustomObjectRecords);
router.post('/objects/:idOrSlug/records', CrmInternalController.createCustomObjectRecord);
router.get('/objects/:idOrSlug/records/:recordId', CrmInternalController.getCustomObjectRecord);
router.put('/objects/:idOrSlug/records/:recordId', CrmInternalController.updateCustomObjectRecord);
router.delete('/objects/:idOrSlug/records/:recordId', CrmInternalController.deleteCustomObjectRecord);

// =========================================================================
// CRM V2 PHASE 1: OBJECT RELATIONSHIPS & ASSOCIATIONS
// =========================================================================
router.get('/relationships', CrmInternalController.listObjectRelationships);
router.post('/relationships', CrmInternalController.createObjectRelationship);
router.post('/associations', CrmInternalController.associateObjects);
router.get('/associations/:entityType/:entityId', CrmInternalController.listAssociatedObjects);
router.delete('/associations/:associationId', CrmInternalController.removeAssociation);

// =========================================================================
// CRM V2 PHASE 1: FIELD-LEVEL HISTORY & RESTORE
// =========================================================================
router.get('/history/:entityType/:entityId', CrmInternalController.getFieldHistory);
router.post('/history/:historyId/restore', CrmInternalController.restoreFieldHistory);

// =========================================================================
// CRM V2 PHASE 2: IDENTITY RESOLUTION, GOLDEN RECORD & UNMERGE
// =========================================================================
router.post('/identity/scan', CrmInternalController.scanDuplicates);
router.get('/identity/candidates', CrmInternalController.listDuplicateCandidates);
router.post('/identity/merge', CrmInternalController.manualMergeIdentity);
router.post('/identity/dismiss/:id', CrmInternalController.dismissDuplicateCandidate);
router.post('/identity/unmerge/:mergeId', CrmInternalController.unmergeContacts);
router.get('/identity/merges', CrmInternalController.listMerges);

// =========================================================================
// CRM V2 PHASE 2: VERIFICATION PIPELINE
// =========================================================================
router.post('/verification/verify/:contactId', CrmInternalController.verifyContact);
router.post('/verification/batch', CrmInternalController.batchVerifyContacts);
router.get('/verification/logs/:contactId', CrmInternalController.listContactVerifications);

// =========================================================================
// CRM V2 PHASE 2: ENRICHMENT WATERFALL
// =========================================================================
router.post('/enrichment/enrich/:contactId', CrmInternalController.enrichContact);
router.get('/enrichment/providers', CrmInternalController.listEnrichmentProviders);
router.post('/enrichment/providers', CrmInternalController.saveEnrichmentProvider);

// =========================================================================
// CRM V2 PHASE 2: DATA HEALTH DASHBOARD & 1-CLICK FIXES
// =========================================================================
router.get('/data-health', CrmInternalController.getDataHealth);
router.post('/data-health/fix/normalize', CrmInternalController.fixNormalize);
router.post('/data-health/fix/verify-batch', CrmInternalController.fixBatchVerify);
router.post('/data-health/fix/auto-merge', CrmInternalController.fixAutoMerge);
router.post('/data-health/fix/archive-stale', CrmInternalController.fixArchiveStale);

// =========================================================================
// CRM V2 PHASE 3: NATURAL LANGUAGE SEARCH
// =========================================================================
router.post('/search/nl', CrmInternalController.parseNlSearch);

// =========================================================================
// CRM V2 PHASE 3: SAVED VIEWS & DYNAMIC SEGMENTS
// =========================================================================
router.get('/views', CrmInternalController.listSavedViews);
router.post('/views', CrmInternalController.createSavedView);
router.get('/views/:id', CrmInternalController.getSavedView);
router.put('/views/:id', CrmInternalController.updateSavedView);
router.delete('/views/:id', CrmInternalController.deleteSavedView);

// =========================================================================
// CRM V2 PHASE 3: BULK ACTIONS ENGINE
// =========================================================================
router.post('/bulk/start', CrmInternalController.startBulkJob);
router.get('/bulk/jobs', CrmInternalController.listBulkJobs);
router.get('/bulk/jobs/:id', CrmInternalController.getBulkJob);
router.post('/bulk/jobs/:id/pause', CrmInternalController.pauseBulkJob);
router.post('/bulk/jobs/:id/resume', CrmInternalController.resumeBulkJob);
router.post('/bulk/jobs/:id/cancel', CrmInternalController.cancelBulkJob);
router.post('/bulk/jobs/:id/undo', CrmInternalController.undoBulkJob);

// =========================================================================
// CRM V2 PHASE 4: AI LAYER & SMART ENGINES
// =========================================================================
router.post('/ai/score/:contactId', CrmInternalController.scoreContact);
router.post('/ai/score-batch', CrmInternalController.batchScoreContacts);
router.get('/ai/rules', CrmInternalController.listScoringRules);
router.post('/ai/rules', CrmInternalController.saveScoringRule);
router.delete('/ai/rules/:id', CrmInternalController.deleteScoringRule);
router.get('/ai/brief/:contactId', CrmInternalController.generateContactBrief);
router.post('/ai/compose', CrmInternalController.composeOutreach);
router.post('/ai/analyze-import-headers', CrmInternalController.analyzeImportHeaders);
router.get('/ai/usage', CrmInternalController.getAiUsageSummary);

// =========================================================================
// CRM V2 PHASE 5: WORKFLOW AUTOMATIONS & COMPLIANCE
// =========================================================================
router.get('/workflows', CrmInternalController.listWorkflows);
router.post('/workflows', CrmInternalController.createWorkflow);
router.get('/workflows/:id', CrmInternalController.getWorkflow);
router.put('/workflows/:id', CrmInternalController.updateWorkflow);
router.delete('/workflows/:id', CrmInternalController.deleteWorkflow);
router.post('/workflows/:id/trigger', CrmInternalController.triggerWorkflow);
router.get('/workflows/:id/runs', CrmInternalController.listWorkflowRuns);
router.get('/workflows/runs/:runId', CrmInternalController.getWorkflowRun);
router.get('/workflows/runs/:runId/logs', CrmInternalController.listWorkflowStepLogs);

router.get('/compliance/policy', CrmInternalController.getCompliancePolicy);
router.put('/compliance/policy', CrmInternalController.saveCompliancePolicy);
router.post('/compliance/check', CrmInternalController.checkCompliance);
router.post('/compliance/inbound', CrmInternalController.handleInboundKeyword);

// =========================================================================
// CRM V2 PHASE 6: PIPELINES, DEALS, TASKS & PRESENCE
// =========================================================================
router.get('/pipelines', CrmInternalController.listPipelines);
router.post('/pipelines', CrmInternalController.createPipeline);
router.get('/pipelines/:id/stages', CrmInternalController.listPipelineStages);
router.post('/pipelines/:id/stages', CrmInternalController.createPipelineStage);
router.put('/pipelines/:id/stages/:stageId', CrmInternalController.updatePipelineStage);
router.get('/kanban', CrmInternalController.getKanbanBoard);

router.get('/deals', CrmInternalController.listDeals);
router.post('/deals', CrmInternalController.createDeal);
router.get('/deals/:id', CrmInternalController.getDeal);
router.put('/deals/:id', CrmInternalController.updateDeal);
router.delete('/deals/:id', CrmInternalController.deleteDeal);

router.get('/tasks', CrmInternalController.listTasks);
router.post('/tasks', CrmInternalController.createTask);
router.put('/tasks/:id', CrmInternalController.updateTask);
router.delete('/tasks/:id', CrmInternalController.deleteTask);

router.post('/presence/heartbeat', CrmInternalController.presenceHeartbeat);
router.get('/presence/:entityType/:entityId', CrmInternalController.getPresenceCollisions);
router.post('/presence/leave', CrmInternalController.presenceLeave);

// =========================================================================
// CRM V2 PHASE 7: SECURITY, COMPLIANCE, RBAC & GDPR
// =========================================================================
router.get('/security/permissions', CrmInternalController.listRolePermissions);
router.post('/security/permissions', CrmInternalController.saveRolePermission);
router.get('/security/sensitive-fields', CrmInternalController.listSensitiveFields);
router.post('/security/sensitive-fields', CrmInternalController.addSensitiveField);
router.delete('/security/sensitive-fields/:id', CrmInternalController.removeSensitiveField);
router.post('/security/reveal', CrmInternalController.revealMaskedField);

router.post('/gdpr/erasure', CrmInternalController.executeGdprErasure);
router.get('/gdpr/certificate/:id', CrmInternalController.getErasureCertificate);
router.get('/gdpr/export/:contactId', CrmInternalController.exportSubjectDataBundle);
router.get('/audit/export', CrmInternalController.exportAuditLogs);

// =========================================================================
// CRM V2 PHASE 8: EXTERNAL API V2, WEBHOOKS & CLOUD API
// =========================================================================
router.post('/webhooks/:id/test', CrmInternalController.testWebhook);
router.post('/cloud-api/webhook', CrmInternalController.handleCloudApiWebhook);

// =========================================================================
// CRM V2 PHASE 9: ANALYTICS, FUNNELS, ATTRIBUTION & COHORTS
// =========================================================================
router.get('/analytics/funnel', CrmInternalController.getFunnelMetrics);
router.get('/analytics/attribution', CrmInternalController.getAttributionMetrics);
router.get('/analytics/cohorts', CrmInternalController.getCohortRetention);
router.post('/analytics/report', CrmInternalController.runCustomReport);

export default router;

