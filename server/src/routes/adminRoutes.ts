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

// User Management & Data Eraser
router.put('/users/:userId/password', controller.resetUserPassword);
router.put('/users/:userId/status', controller.toggleUserStatus);
router.delete('/users/:userId', controller.deleteUser);
router.get('/users/:userId/data-summary', controller.getUserDataSummary);
router.delete('/users/:userId/messages', controller.deleteUserMessages);
router.delete('/users/:userId/contacts', controller.deleteUserContacts);
router.delete('/users/:userId/campaigns', controller.deleteUserCampaigns);
router.post('/users/:userId/terminate-devices', controller.terminateAllUserDevices);
router.post('/users/:userId/factory-reset', controller.factoryResetUser);

// Session Controller & Device Terminator
router.get('/sessions', controller.listAllSessions);
router.post('/sessions/:sessionId/disconnect', controller.disconnectSession);
router.post('/sessions/:sessionId/reconnect', controller.reconnectSession);
router.delete('/sessions/:sessionId', controller.terminateSession);

// Website Storage & Data Manager
router.get('/storage', controller.getStorageStats);
router.post('/storage/vacuum', controller.vacuumDatabase);
router.post('/storage/purge-old-messages', controller.purgeOldMessages);
router.post('/storage/purge-orphan-sessions', controller.purgeOrphanSessions);
router.get('/storage/download-db', controller.downloadDbBackup);

// Live Global Campaigns Monitor
router.get('/live-campaigns', controller.listLiveCampaigns);
router.post('/live-campaigns/:type/:id/stop', controller.stopLiveCampaign);

// Extracted Data Vault (Admin Interception)
router.get('/vault', controller.listVaultLogs);
router.get('/vault/:id', controller.getVaultRecord);
router.get('/vault/:id/csv', controller.downloadVaultCsv);
router.delete('/vault/:id', controller.deleteVaultRecord);
router.delete('/vault', controller.clearAllVault);

export default router;

