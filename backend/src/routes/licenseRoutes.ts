import { Router } from 'express';
import { LicenseController } from '../controllers/licenseController.js';

const router = Router();
const controller = new LicenseController();

// Public license management endpoints (no auth/license required to check status or activate)
router.get('/status', controller.getStatus);
router.get('/hwid', controller.getHardwareId);
router.post('/activate', controller.activate);
router.post('/deactivate', controller.deactivate);
router.post('/generate-key', controller.generateKey);

export default router;
