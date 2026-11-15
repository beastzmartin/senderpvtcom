import { Router } from 'express';
import { CurrencyAdminController } from '../controllers/currencyAdminController.js';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware.js';

const router = Router();
const controller = new CurrencyAdminController();

// Admin-protected currency management routes
router.use(requireAuth, requireAdmin);

router.get('/', controller.getAllCurrencies);
router.post('/', controller.addCurrency);
router.put('/:code', controller.updateCurrency);
router.delete('/:code', controller.deleteCurrency);

export default router;
