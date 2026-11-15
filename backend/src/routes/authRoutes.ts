import { Router } from 'express';
import { AuthController } from '../controllers/authController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { authRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();
const controller = new AuthController();

router.post('/login', authRateLimiter, controller.login);
router.post('/register', controller.register);
router.get('/users', requireAuth as any, controller.listUsers as any);
router.get('/me', requireAuth as any, controller.getMe as any);
router.put('/profile', requireAuth as any, controller.updateProfile as any);
router.put('/password', requireAuth as any, controller.changePassword as any);

export default router;

