import { Router } from 'express';
import { ContactController } from '../controllers/contactController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();
const controller = new ContactController();

router.use(requireAuth);

router.get('/', controller.getContacts);
router.post('/resolve-lids', controller.bulkResolveLids);
router.post('/sync-group-lids', controller.syncGroupLidMappings);
router.get('/lid-mappings', controller.getLidMappings);
router.get('/:id', controller.getContactById);
router.post('/', controller.createContact);
router.put('/:id', controller.updateContact);
router.delete('/:id', controller.deleteContact);
router.post('/import', controller.importCsv);

export default router;

