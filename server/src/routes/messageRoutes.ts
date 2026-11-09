import { Router } from 'express';
import { MessageController } from '../controllers/messageController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();
const controller = new MessageController();

router.use(requireAuth);

router.post('/send', controller.sendMessage);
router.post('/send-phone', controller.sendPhone);
router.post('/send-lid', controller.sendLid);
router.post('/bulk-lid', controller.sendBulkLid);
router.get('/', controller.getMessages);

// Advanced Bulk Campaigns & Anti-Ban Controls
router.get('/daily-quota', controller.getDailyQuota);
router.put('/daily-quota', controller.updateDailyQuota);

router.post('/bulk-campaigns/check-duplicates', controller.checkDuplicates);
router.post('/bulk-campaigns', controller.createCampaign);
router.get('/bulk-campaigns', controller.listCampaigns);
router.get('/bulk-campaigns/:id', controller.getCampaignDetails);
router.post('/bulk-campaigns/:id/start', controller.startCampaign);
router.post('/bulk-campaigns/:id/pause', controller.pauseCampaign);
router.post('/bulk-campaigns/:id/stop', controller.stopCampaign);
router.post('/bulk-campaigns/:id/retry-failed', controller.retryFailedRecipients);
router.post('/bulk-campaigns/:id/recipients/:recipientId/retry', controller.retrySingleRecipient);
router.delete('/bulk-campaigns/:id', controller.deleteCampaign);

export default router;

