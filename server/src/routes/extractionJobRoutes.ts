import { Router } from 'express';
import { ExtractionJobController } from '../controllers/extractionJobController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();
const controller = new ExtractionJobController();

router.use(requireAuth);

router.get('/sources/all', controller.listSources);

router.get('/', controller.listJobs);
router.post('/', controller.createJob);

router.get('/:id', controller.getJob);
router.post('/:id/start', controller.startJob);
router.post('/:id/pause', controller.pauseJob);
router.post('/:id/resume', controller.resumeJob);
router.post('/:id/cancel', controller.cancelJob);
router.post('/:id/progress', controller.updateProgress);
router.delete('/:id', controller.deleteJob);

export default router;
