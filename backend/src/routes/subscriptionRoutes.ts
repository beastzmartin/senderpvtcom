import { Router } from 'express';
import { SubscriptionController } from '../controllers/subscriptionController.js';
import { requireAuth, optionalAuth } from '../middleware/authMiddleware.js';

const router = Router();
const controller = new SubscriptionController();

// Public plans list
router.get('/plans', controller.getPlans);

// User authenticated routes
router.get('/my-plan', requireAuth, controller.getMyPlan);
router.post('/upgrade', requireAuth, controller.upgrade);
router.post('/redeem-code', requireAuth, controller.redeemCode);

// Reseller routes
router.get('/reseller/stats', requireAuth, controller.getResellerStats);
router.get('/reseller/keys', requireAuth, controller.listResellerKeys);
router.post('/reseller/generate-key', requireAuth, controller.resellerGenerateKey);
router.post('/reseller/bulk-generate-keys', requireAuth, controller.resellerBulkGenerateKeys);
router.post('/reseller/revoke-key', requireAuth, controller.resellerRevokeKey);

// Admin management routes
router.get('/admin/customers', requireAuth, controller.adminListCustomers);
router.get('/admin/keys', requireAuth, controller.adminListKeys);
router.post('/admin/generate-key', requireAuth, controller.adminGenerateKey);
router.post('/admin/bulk-generate-keys', requireAuth, controller.adminBulkGenerateKeys);
router.post('/admin/revoke-key', requireAuth, controller.adminRevokeKey);
router.delete('/admin/keys/:id', requireAuth, controller.adminDeleteKey);
router.put('/admin/update-customer', requireAuth, controller.adminUpdateCustomer);
router.put('/admin/plans/:id', requireAuth, controller.adminUpdatePlan);
router.get('/admin/settings', requireAuth, controller.adminGetSettings);
router.post('/admin/settings', requireAuth, controller.adminUpdateSettings);
router.get('/admin/resellers', requireAuth, controller.adminListResellers);
router.post('/admin/resellers', requireAuth, controller.adminSetResellerQuota);
router.post('/admin/resellers/add-credits', requireAuth, controller.adminAddResellerCredits);
router.delete('/admin/resellers/:userId', requireAuth, controller.adminDemoteReseller);

export default router;

