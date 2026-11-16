import { Router } from 'express';
import { MarginStudioController } from '../controllers/MarginStudioController.js';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware.js';

const router = Router();
const controller = new MarginStudioController();

// All Margin Studio endpoints are strictly administrator-only
router.use(requireAuth, requireAdmin);

// 1. Rules CRUD & Maker-Checker
router.get('/rules', controller.listRules);
router.post('/rules', controller.createRule);
router.put('/rules/:id', controller.updateRule);
router.delete('/rules/:id', controller.deleteRule);
router.post('/rules/:id/approve', controller.approveRule);
router.post('/rules/:id/reject', controller.rejectRule);

// 2. Interactive Simulators
router.post('/simulate-waterfall', controller.simulateWaterfall);
router.post('/matrix-simulator', controller.simulateMatrix);
router.post('/historical-replay', controller.historicalReplay);

// 3. Profit Analytics & KPIs
router.get('/kpis', controller.getKpis);

// 4. Coupons & Promos
router.get('/coupons', controller.listCoupons);
router.post('/coupons', controller.saveCoupon);
router.delete('/coupons/:id', controller.deleteCoupon);

export default router;

