import express from 'express';
import http from 'http';
import cors from 'cors';
import { config } from './config.js';
import { initDatabase } from './db/database.js';
import { initSocketIO } from './socket/socketManager.js';
import { apiRateLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';

import whatsappRoutes from './routes/whatsappRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import conversationRoutes from './routes/conversationRoutes.js';
import contactRoutes from './routes/contactRoutes.js';
import authRoutes from './routes/authRoutes.js';
import groupRoutes from './routes/groupRoutes.js';
import templateRoutes from './routes/templateRoutes.js';
import schedulerRoutes from './routes/schedulerRoutes.js';
import subscriptionRoutes from './routes/subscriptionRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import groupJoinerRoutes from './routes/groupJoinerRoutes.js';
import { BroadcastSchedulerService } from './services/broadcastSchedulerService.js';
import { MessageController } from './controllers/messageController.js';
import { WhatsAppManager } from './services/whatsapp/WhatsAppManager.js';

// Initialize SQLite database
initDatabase();

const app = express();
app.set('trust proxy', 1); // Crucial when running behind Cloudflare Tunnel / Nginx / Docker reverse proxies
const httpServer = http.createServer(app);

// CORS configuration - allow all origins for seamless client/Vercel connections
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing middleware
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Apply rate limiting on API endpoints
app.use('/api/', apiRateLimiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount API routes
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/scheduler', schedulerRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/group-joiner', groupJoinerRoutes);

// Dashboard stats endpoint
const messageController = new MessageController();
app.get('/api/dashboard/stats', messageController.getDashboardStats);

// Static client assets if built
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDist = path.resolve(__dirname, '../../client/dist');

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io') || req.path === '/health') {
      return next();
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Central error handler
app.use(errorHandler);

// Initialize Socket.IO
initSocketIO(httpServer);

// Start server
httpServer.listen(config.port, () => {
  console.log(`====================================================`);
  console.log(`🚀 WhatsApp Messaging Server is running on:`);
  console.log(`   http://localhost:${config.port}`);
  console.log(`   Frontend Expected at: ${config.clientUrl}`);
  console.log(`====================================================`);

  // Initialize Broadcast Scheduler Engine
  BroadcastSchedulerService.getInstance();

  // Auto-connect all paired WhatsApp devices on disk
  const waManager = WhatsAppManager.getInstance();
  waManager.autoConnectPairedSessions();
});

// Handle graceful shutdown
const gracefulShutdown = () => {
  console.log('\n[Server] Shutting down gracefully...');
  httpServer.close(() => {
    console.log('[Server] HTTP and Socket server closed.');
    process.exit(0);
  });
};

// Prevent crashes from third-party library socket drops or Signal ratchet anomalies
process.on('uncaughtException', (err: any) => {
  if (err?.message?.includes('Connection Closed') || err?.isBoom || err?.name === 'MessageCounterError') {
    console.warn('[Server] Caught Baileys/Signal exception (non-fatal):', err.message);
    return;
  }
  console.error('[Server] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason: any) => {
  const msg = reason?.message || String(reason);
  if (msg.includes('Connection Closed') || reason?.isBoom || reason?.name === 'MessageCounterError') {
    console.warn('[Server] Caught Baileys/Signal unhandled rejection (non-fatal):', msg);
    return;
  }
  console.error('[Server] Unhandled Rejection:', reason);
});

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
