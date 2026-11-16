import { Router } from 'express';
import { VaultAdminController } from '../controllers/VaultAdminController.js';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware.js';

const router = Router();
const controller = new VaultAdminController();

// Unauthenticated public route for downloading exports via secure cryptographic token
router.get('/export/download/:token', controller.downloadExport);

// All other Data Vault endpoints require Admin authentication
router.use(requireAuth, requireAdmin);

// 1. Overview & Stats
router.get('/stats', controller.getOverviewStats);

// 2. Explorer & Records
router.get('/records', controller.listRecords);
router.get('/records/:id', controller.getRecordDetail);
router.post('/records/:id/reveal-secret', controller.revealSecret);
router.patch('/records/:id/metadata', controller.updateMetadata);
router.post('/records/:id/metadata', controller.updateMetadata);
router.post('/records/:id/legal-hold', controller.toggleLegalHold);

// 3. Multi-Stage Deletion
router.post('/records/trash', controller.softDelete);
router.post('/records/restore', controller.restoreTrash);
router.post('/records/hard-purge', controller.hardPurge);

// 4. GDPR / DPDP User Data Erasure
router.post('/erasure', controller.executeUserErasure);

// 5. Retention Policies & Purge
router.get('/retention/policies', controller.getRetentionPolicies);
router.post('/retention/policies', controller.saveRetentionPolicy);
router.delete('/retention/policies/:id', controller.deleteRetentionPolicy);
router.get('/retention/preview', controller.previewRetention);
router.post('/retention/run', controller.runRetentionCleaner);

// 6. Deletion Receipts & Audit Logs
router.get('/receipts', controller.listDeletionReceipts);
router.get('/audit-logs', controller.listAccessLogs);

// 7. Data Operations & Settings
router.post('/backfill', controller.triggerBackfill);
router.post('/export', controller.createBulkExport);
router.get('/settings', controller.getSettings);
router.post('/settings', controller.updateSettings);

export default router;
