import { Router } from 'express';
import { MarketplaceController } from '../controllers/marketplaceController.js';
import { requireAuth, optionalAuth } from '../middleware/authMiddleware.js';

const router = Router();
const controller = new MarketplaceController();

// Catalog browsing (optional auth so guests or users see personal status)
router.get('/extensions', optionalAuth, controller.listExtensions);
router.get('/extensions/:id', optionalAuth, controller.getExtension);
router.get('/extensions/:id/modules', optionalAuth, controller.listModules);

// Customer Activation & Entitlements
router.get('/my-extensions', requireAuth, controller.getMyExtensions);
router.post('/extensions/:id/activate', requireAuth, controller.activateExtension);
router.post('/modules/:id/activate', requireAuth, controller.activateModule);

// Admin Module & Pricing Engine
router.post('/admin/modules', requireAuth, controller.adminCreateModule);
router.put('/admin/modules/:id', requireAuth, controller.adminUpdateModule);
router.delete('/admin/modules/:id', requireAuth, controller.adminDeleteModule);
router.post('/admin/entitlements/override', requireAuth, controller.adminSetOverride);

export default router;

