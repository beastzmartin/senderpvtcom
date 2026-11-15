import { Router } from 'express';
import { GroupJoinerController } from '../controllers/groupJoinerController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();
const controller = new GroupJoinerController();

router.use(requireAuth);

router.post('/parse-links', controller.parseLinks);
router.post('/inspect-links', controller.inspectLinks);
router.post('/join-single', controller.joinSingle);

router.get('/campaigns', controller.listCampaigns);
router.post('/campaigns', controller.createCampaign);
router.get('/campaigns/:id', controller.getCampaign);
router.post('/campaigns/:id/start', controller.startCampaign);
router.post('/campaigns/:id/pause', controller.pauseCampaign);
router.post('/campaigns/:id/stop', controller.stopCampaign);
router.delete('/campaigns/:id', controller.deleteCampaign);

export default router;

