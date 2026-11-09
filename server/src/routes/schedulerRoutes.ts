import { Router } from 'express';
import { SchedulerController } from '../controllers/schedulerController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();
const controller = new SchedulerController();

router.use(requireAuth);

router.get('/', controller.listSchedules);
router.post('/', controller.createSchedule);
router.get('/:id', controller.getSchedule);
router.post('/:id/pause', controller.pauseSchedule);
router.post('/:id/resume', controller.resumeSchedule);
router.post('/:id/run-now', controller.runBatchNow);
router.delete('/:id', controller.deleteSchedule);

export default router;
