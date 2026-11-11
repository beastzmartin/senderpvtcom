import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { api } from '../services/api';
import { WhatsAppStatus, WhatsAppAccountInfo, WhatsAppDevice, QRState, Message } from '../types';

export interface WhatsAppContextType {
  status: WhatsAppStatus;
  accountInfo: WhatsAppAccountInfo | null;
  qrState: QRState | null;
  isConnecting: boolean;
  isConnected: boolean;
  isQrModalOpen: boolean;
  setIsQrModalOpen: (open: boolean) => void;
  connectWhatsApp: (sessionId?: string) => Promise<void>;
  disconnectWhatsApp: (sessionId?: string) => Promise<void>;
  resetSession: (sessionId?: string) => Promise<void>;
  refreshStatus: () => Promise<void>;
  lastIncomingMessage: Message | null;
  socket: Socket | null;

  // Multi-Device features
  devices: WhatsAppDevice[];
  activeDevice: WhatsAppDevice | null;
  activeSessionId: string;
  targetQrSessionId: string | null;
  setTargetQrSessionId: (sessionId: string | null) => void;
  isDeviceManagerOpen: boolean;
  setIsDeviceManagerOpen: (open: boolean) => void;
  loadDevices: () => Promise<WhatsAppDevice[]>;
  createDevice: (alias?: string) => Promise<WhatsAppDevice>;
  deleteDevice: (sessionId: string) => Promise<void>;
  setDefaultDevice: (sessionId: string) => Promise<void>;
  renameDevice: (sessionId: string, alias: string) => Promise<void>;
  connectDevice: (sessionId: string) => Promise<void>;
  disconnectDevice: (sessionId: string) => Promise<void>;
  resetDevice: (sessionId: string) => Promise<void>;
  openQrModalForDevice: (sessionId?: string) => void;
}

const WhatsAppContext = createContext<WhatsAppContextType | undefined>(undefined);

export const WhatsAppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [devices, setDevices] = useState<WhatsAppDevice[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('default');
  const [status, setStatus] = useState<WhatsAppStatus>('disconnected');
  const [accountInfo, setAccountInfo] = useState<WhatsAppAccountInfo | null>(null);
  const [qrState, setQrState] = useState<QRState | null>(null);
  const [targetQrSessionId, setTargetQrSessionId] = useState<string | null>(null);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isDeviceManagerOpen, setIsDeviceManagerOpen] = useState(false);
  const [lastIncomingMessage, setLastIncomingMessage] = useState<Message | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  const activeDevice = devices.find((d) => d.session_id === activeSessionId) || devices[0] || null;

  const loadDevices = useCallback(async (): Promise<WhatsAppDevice[]> => {
    try {
      const data = await api.whatsapp.getDevices();
      if (data && Array.isArray(data.devices)) {
        setDevices(data.devices);
        if (data.devices.length === 0) {
          setActiveSessionId('');
          setStatus('disconnected');
          setAccountInfo(null);
          setQrState(null);
          return [];
        }

        const currentActiveId = data.activeSessionId || data.devices[0].session_id;
        setActiveSessionId(currentActiveId);

        const active = data.devices.find((d) => d.session_id === currentActiveId) || data.devices[0];
        if (active) {
          setStatus(active.status);
          if (active.phone_number || active.display_name) {
            setAccountInfo({
              phone: active.phone_number || undefined,
              name: active.display_name || undefined,
              lid: active.lid || undefined,
              jid: active.jid || undefined,
              platform: active.platform || undefined
            });
          } else {
            setAccountInfo(null);
          }
        }
        return data.devices;
      }
    } catch (err) {
      console.error('[WhatsApp Context] Failed to load devices:', err);
    }
    return [];
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const currentDevices = await loadDevices();
      if (currentDevices.length === 0) {
        setStatus('disconnected');
        setAccountInfo(null);
        setQrState(null);
        return;
      }

      const currentTarget = targetQrSessionId || activeSessionId || currentDevices[0]?.session_id;
      const data = await api.whatsapp.getStatus();
      
      if (currentTarget) {
        try {
          const qrRes = await api.whatsapp.getDeviceQR(currentTarget);
          if (qrRes && qrRes.qr && qrRes.qrDataUrl) {
            setQrState({
              qr: qrRes.qr,
              qrDataUrl: qrRes.qrDataUrl,
              generatedAt: Date.now(),
              expiresInSeconds: qrRes.expiresInSeconds || 60
            });
          } else if (data.status === 'connected') {
            setQrState(null);
          }
        } catch {
          // Ignore
        }
      }
    } catch (err) {
      console.error('[WhatsApp Context] Failed to fetch status:', err);
    }
  }, [loadDevices, targetQrSessionId, activeSessionId]);

  useEffect(() => {
    refreshStatus();

    // Connect Socket.IO with auth token for per-user isolation
    const token = localStorage.getItem('wa_auth_token');
    
    // Resolve socket server target URL
    const getSocketUrl = (): string => {
      const envUrl = ((import.meta as any).env?.VITE_API_URL as string)?.trim();
      if (envUrl && envUrl.startsWith('http')) {
        try {
          const parsed = new URL(envUrl);
          return parsed.origin;
        } catch {
          // fallback
        }
      }
      if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        return 'https://taken-rough-hydrocodone-empirical.trycloudflare.com';
      }
      return window.location.origin;
    };

    const newSocket = io(getSocketUrl(), {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      auth: { token }
    });

    newSocket.on('connect', () => {
      console.log('[Socket.IO] Connected to backend');
      if (token) {
        newSocket.emit('authenticate', token);
      }
    });

    newSocket.on('devices:updated', (updatedDevices: WhatsAppDevice[]) => {
      if (Array.isArray(updatedDevices)) {
        setDevices(updatedDevices);
        if (updatedDevices.length === 0) {
          setActiveSessionId('');
          setStatus('disconnected');
          setAccountInfo(null);
          setQrState(null);
          return;
        }

        const defaultDev = updatedDevices.find((d) => d.is_default) || updatedDevices[0];
        if (defaultDev) {
          setActiveSessionId(defaultDev.session_id);
          setStatus(defaultDev.status);
          if (defaultDev.phone_number || defaultDev.display_name) {
            setAccountInfo({
              phone: defaultDev.phone_number || undefined,
              name: defaultDev.display_name || undefined,
              lid: defaultDev.lid || undefined,
              jid: defaultDev.jid || undefined,
              platform: defaultDev.platform || undefined
            });
          } else {
            setAccountInfo(null);
          }
        }
      }
    });

    newSocket.on('whatsapp:status', (payload: { status: WhatsAppStatus; accountInfo?: WhatsAppAccountInfo | null; sessionId?: string; activeSessionId?: string }) => {
      if (!payload.sessionId || payload.sessionId === activeSessionId) {
        setStatus(payload.status);
        if (payload.accountInfo !== undefined) {
          setAccountInfo(payload.accountInfo);
        }
        if (payload.status === 'connected') {
          setQrState(null);
          setIsQrModalOpen(false);
        }
      }
      if (payload.activeSessionId) {
        setActiveSessionId(payload.activeSessionId);
      }
      // Reload devices list to reflect real-time status change
      loadDevices();
    });

    newSocket.on('device:qr', (payload: { sessionId: string; qrState: QRState | null }) => {
      if (!targetQrSessionId || targetQrSessionId === payload.sessionId) {
        setQrState(payload.qrState);
      }
    });

    newSocket.on('whatsapp:qr', (qr: QRState | null) => {
      if (!targetQrSessionId || targetQrSessionId === activeSessionId) {
        setQrState(qr);
      }
    });

    newSocket.on('whatsapp:connected', (payload: { accountInfo?: WhatsAppAccountInfo; sessionId?: string }) => {
      if (!payload.sessionId || payload.sessionId === activeSessionId) {
        setStatus('connected');
        if (payload.accountInfo) {
          setAccountInfo(payload.accountInfo);
        }
        setQrState(null);
        setIsQrModalOpen(false);
      }
      loadDevices();
    });

    newSocket.on('whatsapp:disconnected', (payload?: { sessionId?: string }) => {
      if (!payload?.sessionId || payload.sessionId === activeSessionId) {
        setStatus('disconnected');
        setAccountInfo(null);
        setQrState(null);
      }
      loadDevices();
    });

    newSocket.on('message:received', (msg: any) => {
      setLastIncomingMessage(msg);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [refreshStatus, activeSessionId, targetQrSessionId, loadDevices]);

  const openQrModalForDevice = (sessionId?: string) => {
    let target = sessionId || activeSessionId;
    if (!target && devices.length === 0) {
      createDevice('Primary Device').catch((err) => {
        console.error('Failed to auto-create device:', err);
      });
      return;
    }
    setTargetQrSessionId(target || null);
    setIsQrModalOpen(true);
    if (target) {
      api.whatsapp.getDeviceQR(target).then((res) => {
        if (res && res.qr && res.qrDataUrl) {
          setQrState({
            qr: res.qr,
            qrDataUrl: res.qrDataUrl,
            generatedAt: Date.now(),
            expiresInSeconds: res.expiresInSeconds || 60
          });
        }
      }).catch(() => {});
    }
  };

  const createDevice = async (alias?: string): Promise<WhatsAppDevice> => {
    try {
      const res = await api.whatsapp.createDevice(alias);
      await loadDevices();
      if (res.device) {
        openQrModalForDevice(res.device.session_id);
      }
      return res.device;
    } catch (err: any) {
      console.error('[WhatsApp Context] Create device failed:', err);
      throw err;
    }
  };

  const deleteDevice = async (sessionId: string) => {
    try {
      await api.whatsapp.deleteDevice(sessionId);
      await loadDevices();
    } catch (err: any) {
      console.error('[WhatsApp Context] Delete device failed:', err);
      throw err;
    }
  };

  const setDefaultDevice = async (sessionId: string) => {
    try {
      await api.whatsapp.setDefaultDevice(sessionId);
      setActiveSessionId(sessionId);
      await loadDevices();
    } catch (err: any) {
      console.error('[WhatsApp Context] Set default device failed:', err);
      throw err;
    }
  };

  const renameDevice = async (sessionId: string, alias: string) => {
    try {
      await api.whatsapp.renameDevice(sessionId, alias);
      await loadDevices();
    } catch (err: any) {
      console.error('[WhatsApp Context] Rename device failed:', err);
      throw err;
    }
  };

  const connectDevice = async (sessionId: string) => {
    try {
      openQrModalForDevice(sessionId);
      await api.whatsapp.connectDevice(sessionId);
      await loadDevices();
    } catch (err: any) {
      console.error('[WhatsApp Context] Connect device failed:', err);
      throw err;
    }
  };

  const disconnectDevice = async (sessionId: string) => {
    try {
      await api.whatsapp.disconnectDevice(sessionId);
      await loadDevices();
    } catch (err: any) {
      console.error('[WhatsApp Context] Disconnect device failed:', err);
      throw err;
    }
  };

  const resetDevice = async (sessionId: string) => {
    try {
      openQrModalForDevice(sessionId);
      await api.whatsapp.resetDevice(sessionId);
      await loadDevices();
    } catch (err: any) {
      console.error('[WhatsApp Context] Reset device failed:', err);
      throw err;
    }
  };

  const connectWhatsApp = async (sessionId?: string) => {
    let target = sessionId || activeSessionId;
    if (!target && devices.length === 0) {
      const dev = await createDevice('Primary Device');
      target = dev.session_id;
    }
    return connectDevice(target);
  };

  const disconnectWhatsApp = async (sessionId?: string) => {
    const target = sessionId || activeSessionId;
    return disconnectDevice(target);
  };

  const resetSession = async (sessionId?: string) => {
    const target = sessionId || activeSessionId;
    return resetDevice(target);
  };

  return (
    <WhatsAppContext.Provider
      value={{
        status,
        accountInfo,
        qrState,
        isConnecting: status === 'connecting' || status === 'reconnecting',
        isConnected: status === 'connected',
        isQrModalOpen,
        setIsQrModalOpen,
        connectWhatsApp,
        disconnectWhatsApp,
        resetSession,
        refreshStatus,
        lastIncomingMessage,
        socket,

        // Multi-Device features
        devices,
        activeDevice,
        activeSessionId,
        targetQrSessionId,
        setTargetQrSessionId,
        isDeviceManagerOpen,
        setIsDeviceManagerOpen,
        loadDevices,
        createDevice,
        deleteDevice,
        setDefaultDevice,
        renameDevice,
        connectDevice,
        disconnectDevice,
        resetDevice,
        openQrModalForDevice
      }}
    >
      {children}
    </WhatsAppContext.Provider>
  );
};

export const useWhatsApp = (): WhatsAppContextType => {
  const context = useContext(WhatsAppContext);
  if (!context) {
    throw new Error('useWhatsApp must be used within a WhatsAppProvider');
  }
  return context;
};
