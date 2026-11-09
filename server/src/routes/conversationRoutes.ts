import { Router } from 'express';
import { ConversationController } from '../controllers/conversationController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();
const controller = new ConversationController();

router.use(requireAuth);

router.get('/', controller.getConversations);
router.get('/:id/messages', controller.getConversationMessages);
router.post('/:id/read', controller.markAsRead);

export default router;

