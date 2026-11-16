import { Router } from 'express';
import { WalletController } from '../controllers/walletController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();
const controller = new WalletController();

router.use(requireAuth);

router.get('/', controller.getWallet);
router.get('/transactions', controller.getTransactions);
router.post('/topup', controller.topUp);
router.get('/spend-limits', controller.getSpendLimits);
router.post('/spend-limits', controller.setSpendLimits);
router.post('/reconcile', controller.reconcile);
router.post('/admin/adjust', controller.adminAdjust);

export default router;

