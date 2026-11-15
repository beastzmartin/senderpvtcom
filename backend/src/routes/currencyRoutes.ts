import { Router } from 'express';
import { CurrencyController } from '../controllers/currencyController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();
const controller = new CurrencyController();

// Public active currency catalog
router.get('/list', controller.listCurrencies);

// User-specific currency actions
router.get('/user', requireAuth, controller.getUserCurrency);
router.post('/switch', requireAuth, controller.switchCurrency);

export default router;
