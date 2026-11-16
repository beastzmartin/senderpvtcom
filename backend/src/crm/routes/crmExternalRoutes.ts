import { Router } from 'express';
import { requireCrmApiKey } from '../middleware/crmApiAuth.js';
import { CrmExternalApiController } from '../controllers/CrmExternalApiController.js';

const router = Router();

// Contacts Endpoints
router.get('/contacts', requireCrmApiKey('contacts:read'), CrmExternalApiController.listContacts);
router.post('/contacts', requireCrmApiKey('contacts:write'), CrmExternalApiController.createContact);
router.get('/contacts/:id', requireCrmApiKey('contacts:read'), CrmExternalApiController.getContact);
router.patch('/contacts/:id', requireCrmApiKey('contacts:write'), CrmExternalApiController.updateContact);
router.delete('/contacts/:id', requireCrmApiKey('contacts:write'), CrmExternalApiController.deleteContact);

// Bulk, Search & Dedupe
router.post('/contacts/bulk', requireCrmApiKey('contacts:write'), CrmExternalApiController.bulkUpsertContacts);
router.post('/contacts/search', requireCrmApiKey('contacts:read'), CrmExternalApiController.searchContacts);
router.post('/contacts/dedupe-check', requireCrmApiKey('contacts:read'), CrmExternalApiController.dedupeCheck);

// Lists
router.get('/lists', requireCrmApiKey('contacts:read'), CrmExternalApiController.listLists);
router.post('/lists', requireCrmApiKey('lists:write'), CrmExternalApiController.createList);
router.post('/lists/:id/contacts', requireCrmApiKey('lists:write'), CrmExternalApiController.addContactsToList);
router.delete('/lists/:id/contacts', requireCrmApiKey('lists:write'), CrmExternalApiController.removeContactsFromList);

// Tags
router.get('/tags', requireCrmApiKey('contacts:read'), CrmExternalApiController.listTags);
router.post('/tags', requireCrmApiKey('contacts:write'), CrmExternalApiController.createTag);

// Exports
router.post('/exports', requireCrmApiKey('contacts:read'), CrmExternalApiController.createExport);
router.get('/exports/:id', requireCrmApiKey('contacts:read'), CrmExternalApiController.getExportStatus);

// Extractions
router.post('/extractions', requireCrmApiKey('extractions:run'), CrmExternalApiController.triggerExtraction);

// Webhooks
router.get('/webhooks', requireCrmApiKey('contacts:read'), CrmExternalApiController.listWebhooks);
router.post('/webhooks', requireCrmApiKey('contacts:write'), CrmExternalApiController.createWebhook);

// Usage
router.get('/usage', requireCrmApiKey(), CrmExternalApiController.getUsage);

export default router;

