import { Router } from 'express';
import { FiveSimController } from '../controllers/fiveSimController.js';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware.js';

const router = Router();
const controller = new FiveSimController();

// --- 5SIM Configuration & Health Endpoints ---
router.get('/config', requireAuth, requireAdmin, controller.getConfig);
router.post('/config', requireAuth, requireAdmin, controller.updateConfig);
router.post('/test-connection', requireAuth, requireAdmin, controller.testConnection);

// --- Part 2: User Endpoints (Profile, Orders, Payments) ---
router.get('/profile', requireAuth, controller.getProfile);
router.get('/orders', requireAuth, controller.getOrders);
router.get('/payments', requireAuth, requireAdmin, controller.getPayments);

// --- Part 3: Price Limits (Max Prices) ---
router.get('/max-prices', requireAuth, controller.getMaxPrices);
router.post('/max-prices', requireAuth, requireAdmin, controller.setMaxPrice);
router.delete('/max-prices', requireAuth, requireAdmin, controller.deleteMaxPrice);

// --- Full Sync Action ---
router.post('/sync', requireAuth, requireAdmin, controller.syncAll);

export default router;

