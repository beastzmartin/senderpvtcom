import { Router } from 'express';
import { GrizzlyPartnerController } from '../controllers/grizzlyPartnerController.js';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware.js';

const router = Router();

// 1. Inbound GrizzlySMS Partner Protocol Endpoint (Public, authenticated via protocol key)
router.post('/partners/grizzlysms', GrizzlyPartnerController.handlePartnerRequest);
router.post('/grizzly/partner-webhook', GrizzlyPartnerController.handlePartnerRequest); // Alias

// 2. Admin Management Endpoints (Protected by JWT and Admin Role)
router.get('/admin/grizzly/overview', requireAuth, requireAdmin, GrizzlyPartnerController.getAdminOverview);
router.get('/admin/grizzly/config', requireAuth, requireAdmin, GrizzlyPartnerController.getAdminConfig);
router.put('/admin/grizzly/config', requireAuth, requireAdmin, GrizzlyPartnerController.updateAdminConfig);
router.get('/admin/grizzly/inventory', requireAuth, requireAdmin, GrizzlyPartnerController.getAdminInventory);
router.post('/admin/grizzly/inventory', requireAuth, requireAdmin, GrizzlyPartnerController.addAdminInventory);
router.get('/admin/grizzly/hardware', requireAuth, requireAdmin, GrizzlyPartnerController.getAdminHardware);
router.get('/admin/grizzly/activations', requireAuth, requireAdmin, GrizzlyPartnerController.getAdminActivations);
router.get('/admin/grizzly/sms', requireAuth, requireAdmin, GrizzlyPartnerController.getAdminSms);
router.get('/admin/grizzly/logs', requireAuth, requireAdmin, GrizzlyPartnerController.getAdminLogs);
router.get('/admin/grizzly/mappings', requireAuth, requireAdmin, GrizzlyPartnerController.getAdminMappings);
router.post('/admin/grizzly/activations/:activationId/finish', requireAuth, requireAdmin, GrizzlyPartnerController.finishActivationManually);

export default router;
