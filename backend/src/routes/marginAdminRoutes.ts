import { Router } from 'express';
import { MarginAdminController } from '../controllers/marginAdminController.js';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware.js';

const router = Router();
const controller = new MarginAdminController();

// Enforce authentication & administrator privileges on ALL margin routes
router.use(requireAuth, requireAdmin);

// Margin Rules CRUD
router.get('/rules', controller.getRules);
router.post('/rules', controller.createRule);
router.put('/rules/:id', controller.updateRule);
router.delete('/rules/:id', controller.deleteRule);

// Global Pricing Settings
router.get('/settings', controller.getSettings);
router.put('/settings', controller.updateSettings);

// Price Preview Calculator Tool
router.post('/price-preview', controller.pricePreview);

// Orders & Profit Analytics
router.get('/orders', controller.getOrders);
router.get('/profit-report', controller.getProfitReport);
router.get('/fivesim-balance', controller.getFiveSimBalance);

// Hidden Items Toggle
router.get('/hidden-items', controller.getHiddenItems);
router.post('/hidden-items', controller.addHiddenItem);
router.delete('/hidden-items/:id', controller.removeHiddenItem);

export default router;

