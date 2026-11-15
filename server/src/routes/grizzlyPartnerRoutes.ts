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
router.get('/admin/grizzly/voice-calls', requireAuth, requireAdmin, GrizzlyPartnerController.getAdminVoiceCalls);
router.get('/admin/grizzly/call-records', requireAuth, requireAdmin, GrizzlyPartnerController.getAdminCallRecords);
router.get('/admin/grizzly/cancellations', requireAuth, requireAdmin, GrizzlyPartnerController.getAdminCancellations);
router.get('/admin/grizzly/quarantine', requireAuth, requireAdmin, GrizzlyPartnerController.getAdminQuarantine);
router.get('/admin/grizzly/prohibited', requireAuth, requireAdmin, GrizzlyPartnerController.getAdminProhibited);
router.get('/admin/grizzly/logs', requireAuth, requireAdmin, GrizzlyPartnerController.getAdminLogs);
router.get('/admin/grizzly/mappings', requireAuth, requireAdmin, GrizzlyPartnerController.getAdminMappings);
router.post('/admin/grizzly/activations/:activationId/finish', requireAuth, requireAdmin, GrizzlyPartnerController.finishActivationManually);
router.post('/admin/grizzly/trigger-call', requireAuth, requireAdmin, GrizzlyPartnerController.triggerPushCall);
router.post('/admin/grizzly/trigger-sms', requireAuth, requireAdmin, GrizzlyPartnerController.triggerPushSms);

export default router;
