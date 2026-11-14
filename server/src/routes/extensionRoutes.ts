import { Router } from 'express';
import { ExtensionController } from '../controllers/extensionController.js';
import { requireAuth, optionalAuth } from '../middleware/authMiddleware.js';

const router = Router();
const controller = new ExtensionController();

// Ping is optionalAuth so extension can test network reachability even before logging in
router.get('/ping', optionalAuth, controller.ping);

// Authenticated extension endpoints
router.get('/token', requireAuth, controller.getOrCreateToken);
router.get('/profile', requireAuth, controller.getProfile);
router.post('/sync', requireAuth, controller.syncBatch);

export default router;
