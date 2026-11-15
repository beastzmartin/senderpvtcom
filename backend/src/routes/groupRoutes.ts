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
router.post('/multi/members', controller.getMultiGroupMembers);
router.post('/multi/export-contacts', controller.exportMultiToContacts);
router.get('/:id/members', controller.getGroupMembers);
router.post('/:id/resolve-lids', controller.resolveGroupLids);
router.post('/:id/export-contacts', controller.exportMembersToContacts);

export default router;

