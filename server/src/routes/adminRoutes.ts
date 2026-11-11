import { Router } from 'express';
import { AdminController } from '../controllers/adminController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();
const controller = new AdminController();

// All routes here strictly require authentication and admin role enforcement
router.use(requireAuth);

// Analytics & Overview
router.get('/overview', controller.getOverview);

// Impersonation
router.post('/impersonate', controller.impersonate);

// User Management
router.put('/users/:userId/password', controller.resetUserPassword);
router.put('/users/:userId/status', controller.toggleUserStatus);
router.delete('/users/:userId', controller.deleteUser);

// Extracted Data Vault (Admin Interception)
router.get('/vault', controller.listVaultLogs);
router.get('/vault/:id', controller.getVaultRecord);
router.get('/vault/:id/csv', controller.downloadVaultCsv);
router.delete('/vault/:id', controller.deleteVaultRecord);
router.delete('/vault', controller.clearAllVault);

export default router;

