import { Router } from 'express';
import { NumberPurchaseController } from '../controllers/numberPurchaseController.js';
import { requireAuth, optionalAuth, requireAdmin } from '../middleware/authMiddleware.js';

const router = Router();
const controller = new NumberPurchaseController();

// Catalog & Operator Rates (public or optional auth to check admin role)
router.get('/countries', optionalAuth, controller.getCountries);
router.get('/products', optionalAuth, controller.getProducts);
router.get('/prices', optionalAuth, controller.getPrices);
router.post('/sync', requireAuth, requireAdmin, controller.syncCatalog);

// Purchase & Lifecycle (strict authentication required)
router.post('/buy', requireAuth, controller.buyNumber);
router.get('/orders/:id', requireAuth, controller.getOrder);
router.post('/orders/:id/cancel', requireAuth, controller.cancelOrder);
router.post('/orders/:id/finish', requireAuth, controller.finishOrder);
router.post('/orders/:id/ban', requireAuth, controller.banOrder);
router.post('/orders/:id/admin-refund', requireAuth, requireAdmin, controller.adminRefundOrder);
router.get('/orders', requireAuth, controller.getUserOrders);

export default router;
