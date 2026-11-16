import { Router } from 'express';
import { MarketplaceController } from '../controllers/marketplaceController.js';
import { requireAuth, requireAdmin, optionalAuth } from '../middleware/authMiddleware.js';
import { WhiteLabelSanitizer } from '../services/marketplace/WhiteLabelSanitizer.js';

const router = Router();
const controller = new MarketplaceController();

// -------------------------------------------------------------------------
// PUBLIC / PROVIDER WEBHOOK
// -------------------------------------------------------------------------
router.post('/webhook/provider', controller.handleWebhook);

// -------------------------------------------------------------------------
// EXTENSIONS & MODULES MARKETPLACE (PRESERVED FOR BACKWARD COMPATIBILITY)
// -------------------------------------------------------------------------
router.get('/extensions', optionalAuth, controller.listExtensions);
router.get('/extensions/:id', optionalAuth, controller.getExtension);
router.get('/extensions/:id/modules', optionalAuth, controller.listModules);
router.get('/my-extensions', requireAuth, controller.getMyExtensions);
router.post('/extensions/:id/activate', requireAuth, controller.activateExtension);
router.post('/modules/:id/activate', requireAuth, controller.activateModule);
router.post('/admin/modules', requireAuth, controller.adminCreateModule);
router.put('/admin/modules/:id', requireAuth, controller.adminUpdateModule);
router.delete('/admin/modules/:id', requireAuth, controller.adminDeleteModule);
router.post('/admin/entitlements/override', requireAuth, controller.adminSetOverride);

// -------------------------------------------------------------------------
// DATA EXTRACTION MARKETPLACE (WHITE-LABEL SANITIZED CUSTOMER ENDPOINTS)
// -------------------------------------------------------------------------
router.get('/products', WhiteLabelSanitizer.middleware(), controller.listProducts);
router.get('/products/:slug', WhiteLabelSanitizer.middleware(), controller.getProduct);
router.get('/products/:slug/currency-matrix', WhiteLabelSanitizer.middleware(), controller.getProductCurrencyMatrix);
router.post('/parse-bulk-input', WhiteLabelSanitizer.middleware(), controller.parseBulkInput);
router.post('/estimate', WhiteLabelSanitizer.middleware(), controller.estimatePrice);
router.post('/quote', WhiteLabelSanitizer.middleware(), controller.createQuote);

router.get('/products/:slug/presets', requireAuth, WhiteLabelSanitizer.middleware(), controller.listUserPresets);
router.post('/products/:slug/presets', requireAuth, WhiteLabelSanitizer.middleware(), controller.saveUserPreset);
router.delete('/presets/:id', requireAuth, WhiteLabelSanitizer.middleware(), controller.deleteUserPreset);

router.post('/jobs', requireAuth, WhiteLabelSanitizer.middleware(), controller.createJob);
router.get('/jobs', requireAuth, WhiteLabelSanitizer.middleware(), controller.listUserJobs);
router.get('/jobs/:id', requireAuth, WhiteLabelSanitizer.middleware(), controller.getJob);
router.get('/jobs/:id/results', requireAuth, WhiteLabelSanitizer.middleware(), controller.getJobResults);
router.get('/jobs/:id/files', requireAuth, WhiteLabelSanitizer.middleware(), controller.listJobFiles);
router.get('/files/:id/download', controller.downloadJobFile);
router.get('/jobs/:id/export', requireAuth, controller.exportJob);
router.post('/jobs/:id/abort', requireAuth, WhiteLabelSanitizer.middleware(), controller.abortJob);
router.post('/jobs/:id/share', requireAuth, WhiteLabelSanitizer.middleware(), controller.createShareLink);
router.get('/shared/:token', WhiteLabelSanitizer.middleware(), controller.getSharedJob);
router.post('/jobs/:id/crm-sync', requireAuth, WhiteLabelSanitizer.middleware(), controller.syncJobToCrm);

router.get('/schedules', requireAuth, WhiteLabelSanitizer.middleware(), controller.listScheduledRuns);
router.post('/schedules', requireAuth, WhiteLabelSanitizer.middleware(), controller.createScheduledRun);
router.delete('/schedules/:id', requireAuth, WhiteLabelSanitizer.middleware(), controller.deleteScheduledRun);
router.post('/schedules/:id/toggle', requireAuth, WhiteLabelSanitizer.middleware(), controller.toggleScheduledRun);

// -------------------------------------------------------------------------
// DATA EXTRACTION MARKETPLACE ADMIN CONTROLS
// -------------------------------------------------------------------------
router.get('/admin/products', requireAuth, requireAdmin, controller.adminListProducts);
router.post('/admin/products', requireAuth, requireAdmin, controller.adminSaveProduct);
router.post('/admin/import-provider', requireAuth, requireAdmin, controller.adminImportFromProvider);
router.post('/admin/bulk-import', requireAuth, requireAdmin, controller.adminBulkImport);
router.post('/admin/products/:slug/drift', requireAuth, requireAdmin, controller.adminCheckDrift);
router.post('/admin/products/:slug/gates', requireAuth, requireAdmin, controller.adminUpdateWizardGate);
router.post('/admin/products/:slug/override-classification', requireAuth, requireAdmin, controller.adminOverrideClassification);
router.post('/admin/products/:slug/duplicate', requireAuth, requireAdmin, controller.adminDuplicateProduct);
router.delete('/admin/products/:slug', requireAuth, requireAdmin, controller.adminDeleteProduct);
router.post('/admin/products/:slug/test-run', requireAuth, requireAdmin, controller.adminTestRun);

router.get('/admin/jobs', requireAuth, requireAdmin, controller.adminListAllJobs);
router.get('/admin/finance', requireAuth, requireAdmin, controller.adminFinanceStats);
router.get('/admin/provider-health', requireAuth, requireAdmin, controller.adminProviderHealth);
router.get('/admin/settings', requireAuth, requireAdmin, controller.adminGetSettings);
router.post('/admin/settings', requireAuth, requireAdmin, controller.adminUpdateSettings);
router.post('/admin/test-provider-auth', requireAuth, requireAdmin, controller.adminTestProviderAuth);

export default router;
