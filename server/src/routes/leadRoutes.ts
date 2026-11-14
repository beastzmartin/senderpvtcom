import { Router } from 'express';
import { LeadController } from '../controllers/leadController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();
const controller = new LeadController();

router.use(requireAuth);

router.get('/', controller.listLeads);
router.get('/stats', controller.getStats);
router.get('/export/csv', controller.exportCsv);

// Tags
router.get('/tags', controller.listTags);
router.post('/tags', controller.createTag);
router.post('/tags/assign', controller.tagLead);
router.post('/tags/unassign', controller.untagLead);

// Bulk actions
router.post('/bulk-delete', controller.bulkDelete);
router.post('/bulk-status', controller.bulkUpdateStatus);
router.post('/batch', controller.batchSync);

// Single lead CRUD
router.post('/', controller.createLead);
router.get('/:id', controller.getLead);
router.put('/:id', controller.updateLead);
router.delete('/:id', controller.deleteLead);

// Enrichment & Notes
router.post('/:id/enrich', controller.enrichLead);
router.get('/:id/notes', controller.listNotes);
router.post('/:id/notes', controller.addNote);

export default router;
