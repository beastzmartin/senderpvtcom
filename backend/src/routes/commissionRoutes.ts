import { Router } from 'express';
import { CommissionController } from '../controllers/commissionController.js';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware.js';

const router = Router();
const controller = new CommissionController();

// Public / Authenticated calculation endpoint
router.post('/calculate', requireAuth, controller.calculateCommission);
router.get('/products', requireAuth, controller.getProductTypes);

// Admin-managed commission configuration
router.get('/', requireAuth, requireAdmin, controller.listCommissions);
router.post('/', requireAuth, requireAdmin, controller.createCommission);
router.put('/:id', requireAuth, requireAdmin, controller.updateCommission);
router.delete('/:id', requireAuth, requireAdmin, controller.deleteCommission);

export default router;
