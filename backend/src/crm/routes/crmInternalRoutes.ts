import { Router } from 'express';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { CrmInternalController } from '../controllers/CrmInternalController.js';
import { getCrmOpenApiSpec } from '../services/CrmOpenApiSpec.js';
import { getCrmDb } from '../db/index.js';

const router = Router();

// OpenAPI Spec & Documentation route
router.get('/openapi.json', (_req, res) => {
  const host = _req.get('host') || 'localhost:3000';
  const protocol = _req.protocol || 'http';
  res.json(getCrmOpenApiSpec(`${protocol}://${host}`));
});

// All other internal CRM routes require session JWT auth
router.use(requireAuth);

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

export default router;

