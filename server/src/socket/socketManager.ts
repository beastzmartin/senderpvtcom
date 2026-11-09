import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { WhatsAppManager } from '../services/whatsapp/WhatsAppManager.js';
import { MessageService } from '../services/messageService.js';
import { AuthService } from '../services/authService.js';
import { config } from '../config.js';

let ioInstance: SocketIOServer | null = null;

export function initSocketIO(httpServer: HTTPServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      credentials: true
    }
  });

  const whatsappManager = WhatsAppManager.getInstance();
  const authService = AuthService.getInstance();

  // Socket middleware for tenant authentication and room subscription
  io.use((socket, next) => {
    try {
      const rawToken =
        socket.handshake.auth?.token ||
        (socket.handshake.headers?.authorization && socket.handshake.headers.authorization.replace(/^Bearer\s+/i, ''));

      if (rawToken) {
        const payload = authService.verifyToken(rawToken);
        if (payload) {
          (socket as any).userId = payload.id;
          (socket as any).user = payload;
        }
      }
    } catch (err) {
      console.warn('[Socket.IO] Auth verification warning:', err);
    }
    next();
  });

  io.on('connection', (socket) => {
    const userId = (socket as any).userId as string | undefined;
    console.log(`[Socket.IO] Client connected: ${socket.id} (User: ${userId || 'guest'})`);

    if (userId) {
      // Join isolated per-user private room
      socket.join(`user:${userId}`);

      // Emit initial status, devices, and QR strictly scoped to this authenticated user
      socket.emit('whatsapp:status', {
        status: whatsappManager.getStatus(undefined, userId),
        accountInfo: whatsappManager.getAccountInfo(undefined, userId),
        activeSessionId: whatsappManager.getActiveSessionId(userId)
      });

      socket.emit('devices:updated', whatsappManager.getAllSessions(userId));

      const currentQR = whatsappManager.getQR(undefined, userId);
      if (currentQR) {
        socket.emit('whatsapp:qr', currentQR);
      }
    } else {
      // Unauthenticated socket gets generic disconnected state with 0 devices
      socket.emit('whatsapp:status', {
        status: 'disconnected',
        accountInfo: null,
        activeSessionId: ''
      });
      socket.emit('devices:updated', []);
    }

    // Allow dynamic room subscription when client authenticates after socket connect
    socket.on('authenticate', (token: string) => {
      try {
        if (!token) return;
        const payload = authService.verifyToken(token);
        if (payload?.id) {
          (socket as any).userId = payload.id;
          (socket as any).user = payload;
          socket.join(`user:${payload.id}`);

          socket.emit('whatsapp:status', {
            status: whatsappManager.getStatus(undefined, payload.id),
            accountInfo: whatsappManager.getAccountInfo(undefined, payload.id),
            activeSessionId: whatsappManager.getActiveSessionId(payload.id)
          });
          socket.emit('devices:updated', whatsappManager.getAllSessions(payload.id));
        }
      } catch {}
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
  });

  // Wire WhatsApp provider events to tenant-isolated Socket.IO broadcasts
  whatsappManager.on('status', (status, accountInfo, sessionId, userId) => {
    const target = userId ? io.to(`user:${userId}`) : io;
    target.emit('whatsapp:status', {
      status,
      accountInfo,
      sessionId,
      activeSessionId: whatsappManager.getActiveSessionId(userId)
    });
    if (status === 'connected') {
      target.emit('whatsapp:connected', { accountInfo, sessionId });
    } else if (status === 'disconnected') {
      target.emit('whatsapp:disconnected', { sessionId });
    }
    if (userId) {
      target.emit('devices:updated', whatsappManager.getAllSessions(userId));
    }
  });

  whatsappManager.on('qr', (qrState, sessionId, userId) => {
    const target = userId ? io.to(`user:${userId}`) : io;
    target.emit('whatsapp:qr', qrState);
    target.emit('device:qr', { sessionId, qrState });
  });

  whatsappManager.on('devices:updated', (payload) => {
    if (payload && payload.userId) {
      io.to(`user:${payload.userId}`).emit('devices:updated', payload.devices);
    } else if (Array.isArray(payload)) {
      io.emit('devices:updated', payload);
    }
  });

  whatsappManager.on('message', async (incoming, sessionId, userId) => {
    const target = userId ? io.to(`user:${userId}`) : io;
    target.emit('message:received', incoming);
    target.emit('conversation:updated', { identifier: incoming.senderIdentifier });
  });

  whatsappManager.on('message_update', async (update, sessionId, userId) => {
    const target = userId ? io.to(`user:${userId}`) : io;
    target.emit('message:received', update);
    target.emit('message:updated', update);
    target.emit('conversation:updated', { identifier: update.senderIdentifier });
  });

  whatsappManager.on('message_status', (update, sessionId, userId) => {
    const target = userId ? io.to(`user:${userId}`) : io;
    target.emit('message:status', update);
  });

  ioInstance = io;
  return io;
}

export function getSocketIO(): SocketIOServer | null {
  return ioInstance;
}

