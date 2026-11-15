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
router.get('/grizzly-customer/activations/:id/check-sms-v2', requireAuth, GrizzlyCustomerController.checkActivationSmsV2);
router.get('/grizzly-customer/activations/:id/sms-history', requireAuth, GrizzlyCustomerController.getActivationSmsHistory);
router.get('/grizzly-customer/provider-comparison', requireAuth, GrizzlyCustomerController.getProviderComparison);
router.post('/grizzly-customer/activations/:id/cancel', requireAuth, GrizzlyCustomerController.cancelActivation);
router.get('/grizzly-customer/countries', requireAuth, GrizzlyCustomerController.getMultilingualCountries);
router.get('/grizzly-customer/services', requireAuth, GrizzlyCustomerController.getServices);
router.get('/grizzly-customer/availability', requireAuth, GrizzlyCustomerController.getUnifiedAvailability);

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

// --- GrizzlySMS Customer API Admin Settings, Pricing & Reconciliation ---
router.get('/admin/grizzly-customer/config', requireAuth, requireAdmin, GrizzlyCustomerController.getAdminConfig);
router.put('/admin/grizzly-customer/config', requireAuth, requireAdmin, GrizzlyCustomerController.updateAdminConfig);
router.post('/admin/grizzly-customer/test-connection', requireAuth, requireAdmin, GrizzlyCustomerController.testAdminConnection);
router.get('/admin/grizzly-customer/logs', requireAuth, requireAdmin, GrizzlyCustomerController.getAdminLogs);
router.get('/admin/grizzly-customer/activations', requireAuth, requireAdmin, GrizzlyCustomerController.getAdminActivations);

// Crypto Funding & Deposit Endpoints (Module 1)
router.get('/admin/grizzly-customer/crypto-wallet', requireAuth, requireAdmin, GrizzlyCustomerController.getCryptoWallet);
router.post('/admin/grizzly-customer/crypto-wallet/refresh', requireAuth, requireAdmin, GrizzlyCustomerController.refreshCryptoWallet);
router.put('/admin/grizzly-customer/crypto-wallet/threshold', requireAuth, requireAdmin, GrizzlyCustomerController.updateCryptoThreshold);
router.get('/admin/grizzly-customer/crypto-wallet/history', requireAuth, requireAdmin, GrizzlyCustomerController.getCryptoWalletHistory);

// Services Catalogue Management (Module 2)
router.get('/admin/grizzly-customer/services', requireAuth, requireAdmin, GrizzlyCustomerController.getServices);
router.post('/admin/grizzly-customer/services/sync', requireAuth, requireAdmin, GrizzlyCustomerController.syncServices);
router.put('/admin/grizzly-customer/services/:code', requireAuth, requireAdmin, GrizzlyCustomerController.updateAdminService);
router.get('/admin/grizzly-customer/services/export', requireAuth, requireAdmin, GrizzlyCustomerController.exportServices);

// Countries Catalogue Management (Module 3)
router.get('/admin/grizzly-customer/countries', requireAuth, requireAdmin, GrizzlyCustomerController.getMultilingualCountries);
router.post('/admin/grizzly-customer/countries/sync', requireAuth, requireAdmin, GrizzlyCustomerController.syncCountries);
router.put('/admin/grizzly-customer/countries/:id', requireAuth, requireAdmin, GrizzlyCustomerController.updateAdminCountry);
router.get('/admin/grizzly-customer/countries/export', requireAuth, requireAdmin, GrizzlyCustomerController.exportCountries);

// Pricing & Provider Comparison Endpoints
router.post('/admin/grizzly-customer/sync-prices', requireAuth, requireAdmin, GrizzlyCustomerController.syncPrices);
router.get('/admin/grizzly-customer/prices', requireAuth, requireAdmin, GrizzlyCustomerController.getCachedPrices);
router.get('/admin/grizzly-customer/provider-rules', requireAuth, requireAdmin, GrizzlyCustomerController.getProviderRules);
router.post('/admin/grizzly-customer/provider-rules', requireAuth, requireAdmin, GrizzlyCustomerController.saveProviderRule);
router.delete('/admin/grizzly-customer/provider-rules/:id', requireAuth, requireAdmin, GrizzlyCustomerController.deleteProviderRule);

// Active Activations & Reconciliation Endpoints
router.post('/admin/grizzly-customer/reconcile', requireAuth, requireAdmin, GrizzlyCustomerController.runReconciliation);
router.get('/admin/grizzly-customer/reconciliation/runs', requireAuth, requireAdmin, GrizzlyCustomerController.getReconciliationRuns);
router.get('/admin/grizzly-customer/reconciliation/records', requireAuth, requireAdmin, GrizzlyCustomerController.getReconciliationRecords);
router.post('/admin/grizzly-customer/reconciliation/records/:id/resolve', requireAuth, requireAdmin, GrizzlyCustomerController.resolveReconciliationRecord);
router.get('/admin/grizzly-customer/remote-active-activations', requireAuth, requireAdmin, GrizzlyCustomerController.getRemoteActiveActivations);

// Data Synchronization Control Center Endpoints (Module 5)
router.get('/admin/grizzly-customer/sync/jobs', requireAuth, requireAdmin, GrizzlyCustomerController.getSyncJobs);
router.post('/admin/grizzly-customer/sync/jobs/:jobType/trigger', requireAuth, requireAdmin, GrizzlyCustomerController.triggerSyncJob);
router.get('/admin/grizzly-customer/sync/history', requireAuth, requireAdmin, GrizzlyCustomerController.getSyncHistory);

export default router;

