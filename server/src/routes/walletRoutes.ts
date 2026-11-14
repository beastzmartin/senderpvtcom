import { Router } from 'express';
import { WalletController } from '../controllers/walletController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();
const controller = new WalletController();

router.use(requireAuth);

router.get('/', controller.getWallet);
router.get('/transactions', controller.getTransactions);
router.post('/topup', controller.topUp);
router.post('/admin/adjust', controller.adminAdjust);

export default router;
