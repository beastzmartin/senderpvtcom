import { Router } from 'express';
import { WhatsAppController } from '../controllers/whatsappController.js';
import { optionalAuth, requireAuth } from '../middleware/authMiddleware.js';

const router = Router();
const controller = new WhatsAppController();

// Base WhatsApp routes (optionalAuth captures user session when provided)
router.get('/status', optionalAuth, controller.getStatus);
router.get('/qr', optionalAuth, controller.getQR);
router.post('/connect', optionalAuth, controller.connect);
router.post('/reset', optionalAuth, controller.resetSession);
router.post('/disconnect', optionalAuth, controller.disconnect);
router.get('/check-number', optionalAuth, controller.checkNumber);

// Multi-Device management routes (requireAuth guarantees tenant isolation)
router.get('/devices', requireAuth, controller.getDevices);
router.post('/devices', requireAuth, controller.createDevice);
router.delete('/devices/:sessionId', requireAuth, controller.deleteDevice);
router.post('/devices/:sessionId/default', requireAuth, controller.setDefaultDevice);
router.put('/devices/:sessionId/alias', requireAuth, controller.updateDeviceAlias);
router.get('/devices/:sessionId/qr', requireAuth, controller.getDeviceQR);
router.post('/devices/:sessionId/connect', requireAuth, controller.connectDevice);
router.post('/devices/:sessionId/disconnect', requireAuth, controller.disconnectDevice);
router.post('/devices/:sessionId/reset', requireAuth, controller.resetDevice);

export default router;
