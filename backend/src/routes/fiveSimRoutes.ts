import { Router } from 'express';
import { FiveSimController } from '../controllers/fiveSimController.js';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware.js';

const router = Router();
const controller = new FiveSimController();

// --- 5SIM Configuration & Health Endpoints ---
router.get('/config', requireAuth, requireAdmin, controller.getConfig);
router.post('/config', requireAuth, requireAdmin, controller.updateConfig);
router.post('/test-connection', requireAuth, requireAdmin, controller.testConnection);

// --- Part 2: User Endpoints (Profile, Orders, Payments) ---
router.get('/profile', requireAuth, controller.getProfile);
router.get('/orders', requireAuth, controller.getOrders);
router.get('/payments', requireAuth, requireAdmin, controller.getPayments);

// --- Part 3: Price Limits (Max Prices) ---
router.get('/max-prices', requireAuth, controller.getMaxPrices);
router.post('/max-prices', requireAuth, requireAdmin, controller.setMaxPrice);
router.delete('/max-prices', requireAuth, requireAdmin, controller.deleteMaxPrice);

// --- Part 4: Products & Prices (Guest / Public Endpoints) ---
router.get('/guest/countries', controller.getGuestCountries);
router.get('/guest/products/:country?/:operator?', controller.getGuestProducts);
router.get('/guest/prices', controller.getGuestPrices);
router.get('/guest/best-operator', controller.getBestOperator);

// --- Part 5: Purchase Flows (Activation, Hosting, Re-buy) ---
router.post('/buy/activation', requireAuth, controller.buyActivation);
router.post('/buy/hosting', requireAuth, controller.buyHosting);
router.post('/buy/reuse', requireAuth, controller.reuseNumber);

// --- Part 6: Order Management & SMS Inbox ---
router.get('/orders/:id/check', requireAuth, controller.checkOrder);
router.post('/orders/:id/finish', requireAuth, controller.finishOrder);
router.post('/orders/:id/cancel', requireAuth, controller.cancelOrder);
router.post('/orders/:id/ban', requireAuth, controller.banOrder);
router.get('/orders/:id/inbox', requireAuth, controller.getHostingInbox);

// --- Part 7: System Notifications & Flash Broadcasts ---
router.get('/flash/:lang?', controller.getFlash);

// --- Part 8: Vendor API (Partner & Reseller Suite) ---
router.get('/vendor/stats', requireAuth, requireAdmin, controller.getVendorStats);
router.get('/vendor/wallets', requireAuth, requireAdmin, controller.getVendorWallets);
router.get('/vendor/orders', requireAuth, requireAdmin, controller.getVendorOrders);
router.get('/vendor/payments', requireAuth, requireAdmin, controller.getVendorPayments);
router.post('/vendor/withdraw', requireAuth, requireAdmin, controller.requestVendorWithdraw);
router.get('/vendor/prices', requireAuth, requireAdmin, controller.getVendorPrices);
router.put('/vendor/prices', requireAuth, requireAdmin, controller.createVendorPrice);
router.post('/vendor/prices', requireAuth, requireAdmin, controller.updateVendorPrice);
router.post('/vendor/prices/disable', requireAuth, requireAdmin, controller.toggleVendorPrice);

// --- Part 9: Reference Catalog (Countries, Products, Aliases) ---
router.get('/reference/countries', controller.getReferenceCountries);
router.get('/reference/products', controller.getReferenceProducts);
router.get('/reference/resolve', controller.resolveReference);

// --- Part 10: 10-Point System Diagnostics & Checklist ---
router.get('/diagnostics', requireAuth, requireAdmin, controller.getDiagnostics);

// --- Full Sync Action ---
router.post('/sync', requireAuth, requireAdmin, controller.syncAll);

export default router;

