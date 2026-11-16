import { Router } from 'express';
import { GroupController } from '../controllers/groupController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();
const controller = new GroupController();

router.use(requireAuth);

router.get('/', controller.getGroups);
router.get('/quota', controller.getExtractionQuota);
router.post('/sync-all-lids', controller.syncAllGroupsLids);
router.post('/track-action', controller.trackUserAction);

// Extracted Files Vault & Library for Users (including Community extractions)
router.get('/extracted-files', controller.listUserExtractedFiles);
router.post('/extracted-files', controller.saveUserExtractedFile);
router.get('/extracted-files/:id', controller.getUserExtractedFile);
router.get('/extracted-files/:id/download', controller.downloadUserExtractedFile);
router.delete('/extracted-files/:id', controller.deleteUserExtractedFile);

router.post('/multi/members', controller.getMultiGroupMembers);
router.post('/multi/export-contacts', controller.exportMultiToContacts);
router.get('/:id/members', controller.getGroupMembers);
router.post('/:id/resolve-lids', controller.resolveGroupLids);
router.post('/:id/export-contacts', controller.exportMembersToContacts);

export default router;

