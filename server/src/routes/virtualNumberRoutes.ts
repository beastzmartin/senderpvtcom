import { Router } from 'express';
import { VirtualNumberController } from '../controllers/virtualNumberController.js';
import { GrizzlyCustomerController } from '../controllers/grizzlyCustomerController.js';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware.js';

const router = Router();
const controller = new VirtualNumberController();

// --- Customer Marketplace & Management Routes ---
router.get('/countries', requireAuth, controller.getCountries);
router.get('/search', requireAuth, controller.searchNumbers);
router.post('/purchase', requireAuth, controller.purchaseNumber);
router.get('/rentals', requireAuth, controller.getMyRentals);
router.post('/rentals/:rentalId/renew', requireAuth, controller.renewRental);
router.patch('/rentals/:rentalId/auto-renew', requireAuth, controller.toggleAutoRenew);
router.post('/rentals/:rentalId/release', requireAuth, controller.releaseRental);
router.get('/messages', requireAuth, controller.getMessages);
router.patch('/messages/:messageId/read', requireAuth, controller.markMessageRead);
router.get('/calls', requireAuth, controller.getCallLogs);
router.get('/orders', requireAuth, controller.getOrderHistory);
router.get('/analytics', requireAuth, controller.getCustomerAnalytics);

// --- GrizzlySMS Customer API (Purchasing numbers from GrizzlySMS) ---
router.get('/grizzly-customer/options', requireAuth, GrizzlyCustomerController.getPurchaseOptions);
router.post('/grizzly-customer/purchase', requireAuth, GrizzlyCustomerController.purchaseNumber);
router.get('/grizzly-customer/activations', requireAuth, GrizzlyCustomerController.getMyActivations);
router.get('/grizzly-customer/activations/:id/check-sms', requireAuth, GrizzlyCustomerController.checkActivationSms);
router.post('/grizzly-customer/activations/:id/cancel', requireAuth, GrizzlyCustomerController.cancelActivation);

// --- Administrator Management Routes ---
router.get('/admin/overview', requireAuth, requireAdmin, controller.getAdminOverview);
router.get('/admin/providers', requireAuth, requireAdmin, controller.getAdminProviders);
router.post('/admin/providers', requireAuth, requireAdmin, controller.saveAdminProvider);
router.get('/admin/inventory', requireAuth, requireAdmin, controller.getAdminInventory);
router.post('/admin/inventory', requireAuth, requireAdmin, controller.addAdminInventory);
router.get('/admin/pricing', requireAuth, requireAdmin, controller.getAdminPricing);
router.post('/admin/pricing', requireAuth, requireAdmin, controller.saveAdminPricing);
router.get('/admin/rentals', requireAuth, requireAdmin, controller.getAdminRentals);
router.post('/admin/orders/:orderId/refund', requireAuth, requireAdmin, controller.refundAdminOrder);

// --- GrizzlySMS Customer API Admin Settings & Diagnostics ---
router.get('/admin/grizzly-customer/config', requireAuth, requireAdmin, GrizzlyCustomerController.getAdminConfig);
router.put('/admin/grizzly-customer/config', requireAuth, requireAdmin, GrizzlyCustomerController.updateAdminConfig);
router.post('/admin/grizzly-customer/test-connection', requireAuth, requireAdmin, GrizzlyCustomerController.testAdminConnection);
router.get('/admin/grizzly-customer/logs', requireAuth, requireAdmin, GrizzlyCustomerController.getAdminLogs);
router.get('/admin/grizzly-customer/activations', requireAuth, requireAdmin, GrizzlyCustomerController.getAdminActivations);

export default router;

