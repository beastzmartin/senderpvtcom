import React, { useEffect, useState } from 'react';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { Modal } from '../common/Modal';
import { StatusBadge } from '../common/StatusBadge';
import { QrCode, RefreshCw, CheckCircle, Smartphone, ShieldCheck, PowerOff, Layers } from 'lucide-react';

export const QrModal: React.FC = () => {
  const {
    isQrModalOpen,
    setIsQrModalOpen,
    devices,
    activeSessionId,
    targetQrSessionId,
    qrState,
    setIsDeviceManagerOpen,
    createDevice,
    connectDevice,
    disconnectDevice,
    resetDevice,
    refreshStatus
  } = useWhatsApp();

  const [countdown, setCountdown] = useState<number>(60);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const currentSessionId = targetQrSessionId || activeSessionId;
  const currentDevice = devices.find((d) => d.session_id === currentSessionId) || devices[0];
  const isConnected = currentDevice?.status === 'connected';
  const isConnecting = currentDevice?.status === 'connecting';
  const currentStatus = currentDevice?.status || 'disconnected';

  useEffect(() => {
    if (!isQrModalOpen || !qrState) return;

    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - qrState.generatedAt) / 1000);
      const remaining = Math.max(0, 60 - elapsed);
      setCountdown(remaining);

      if (remaining === 0) {
        refreshStatus();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isQrModalOpen, qrState, refreshStatus]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (!currentDevice) {
        await createDevice('Primary Device');
      } else {
        await connectDevice(currentDevice.session_id);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <Modal
      isOpen={isQrModalOpen}
      onClose={() => setIsQrModalOpen(false)}
      title={currentDevice ? `Link WhatsApp: ${currentDevice.alias}` : 'WhatsApp Account Connection'}
      maxWidth="max-w-lg"
    >
      <div className="flex flex-col items-center text-center">
        {/* Status bar */}
        <div className="flex items-center gap-2 mb-6">
          <span className="text-sm text-slate-500">Device Status ({currentDevice?.alias || 'Primary'}):</span>
          <StatusBadge status={currentStatus} />
        </div>

        {isConnected ? (
          /* Connected State View */
          <div className="w-full bg-emerald-50 border border-emerald-200 rounded-xl p-6 mb-4 flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
              <CheckCircle className="w-9 h-9" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-1">WhatsApp Connected!</h3>
            <p className="text-sm text-emerald-700 mb-4">
              Active Multi-Device connection established for <strong>{currentDevice?.alias}</strong>.
            </p>

            <div className="w-full bg-white rounded-lg p-4 text-left border border-slate-200 shadow-sm mb-5 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Account Label:</span>
                <span className="font-semibold text-slate-900">{currentDevice?.alias}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Account Name:</span>
                <span className="font-medium text-slate-900">{currentDevice?.display_name || 'WhatsApp User'}</span>
              </div>
              {currentDevice?.phone_number && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Phone Number:</span>
                  <span className="font-mono font-medium text-emerald-600">{currentDevice.phone_number}</span>
                </div>
              )}
              {currentDevice?.lid && (
                <div className="flex justify-between">
                  <span className="text-slate-500">WhatsApp LID:</span>
                  <span className="font-mono text-xs text-sky-600">{currentDevice.lid}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Session ID:</span>
                <span className="font-mono text-xs text-slate-500">{currentDevice?.session_id}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2.5 w-full">
              <div className="flex gap-2.5 w-full">
                <button
                  type="button"
                  onClick={() => setIsQrModalOpen(false)}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition text-xs shadow-sm"
                >
                  Continue to Dashboard
                </button>
                <button
                  type="button"
                  onClick={() => currentDevice && disconnectDevice(currentDevice.session_id)}
                  className="px-4 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-medium transition flex items-center gap-1.5 text-xs shadow-sm"
                  title="Disconnect without wiping credentials"
                >
                  <PowerOff className="w-3.5 h-3.5" />
                  Disconnect
                </button>
              </div>

              {/* Manage All Accounts button */}
              <button
                type="button"
                onClick={() => {
                  setIsQrModalOpen(false);
                  setIsDeviceManagerOpen(true);
                }}
                className="w-full px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium transition flex items-center justify-center gap-2 text-xs shadow-sm"
              >
                <Layers className="w-4 h-4" />
                Manage All WhatsApp Accounts ({devices.length} Total)
              </button>
            </div>
          </div>
        ) : (
          /* Connecting / QR Code Display */
          <div className="w-full flex flex-col items-center">
            {qrState?.qrDataUrl ? (
              <div className="flex flex-col items-center">
                <div className="relative p-4 bg-white rounded-2xl shadow-xl mb-4 border-4 border-emerald-500/30">
                  <img
                    src={qrState.qrDataUrl}
                    alt="WhatsApp QR Code"
                    className="w-64 h-64 block object-contain"
                  />
                  {countdown <= 10 && countdown > 0 && (
                    <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-bold text-xs">
                      Expiring in {countdown}s
                    </div>
                  )}
                </div>

                {/* Progress bar countdown */}
                <div className="w-64 h-1.5 bg-slate-200 rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-1000 ease-linear"
                    style={{ width: `${(countdown / 60) * 100}%` }}
                  />
                </div>

                <div className="flex items-center gap-2 mb-6">
                  <span className="text-xs text-slate-500">
                    QR rotates in <strong className="text-slate-800">{countdown}s</strong>
                  </span>
                  <button
                    type="button"
                    onClick={handleManualRefresh}
                    disabled={isRefreshing}
                    className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:underline disabled:opacity-50 font-medium"
                  >
                    <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                    Refresh now
                  </button>
                </div>
              </div>
            ) : (
              <div className="w-64 h-64 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col items-center justify-center p-6 mb-6 shadow-sm">
                {isConnecting ? (
                  <>
                    <RefreshCw className="w-10 h-10 text-emerald-500 animate-spin mb-3" />
                    <p className="text-sm font-semibold text-slate-900 mb-1">Connecting to WhatsApp...</p>
                    <p className="text-xs text-slate-500 text-center mb-4">
                      Generating secure QR code session for <strong>{currentDevice?.alias}</strong>.
                    </p>
                    <button
                      type="button"
                      onClick={() => currentDevice && resetDevice(currentDevice.session_id)}
                      className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-sky-600 border border-slate-300 text-xs font-medium flex items-center gap-1.5 transition shadow-sm"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      Force Fresh QR Code
                    </button>
                  </>
                ) : (
                  <>
                    <QrCode className="w-12 h-12 text-slate-400 mb-3" />
                    <p className="text-sm font-semibold text-slate-900 mb-1">Session Not Started</p>
                    <p className="text-xs text-slate-500 text-center mb-4">
                      Click below to generate a fresh QR code for <strong>{currentDevice?.alias}</strong>.
                    </p>
                    <div className="flex flex-col gap-2 w-full px-4">
                      <button
                        type="button"
                        onClick={handleManualRefresh}
                        className="w-full px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Generate QR Code
                      </button>
                      <button
                        type="button"
                        onClick={() => currentDevice && resetDevice(currentDevice.session_id)}
                        className="w-full px-4 py-2 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        Clean Reset Session
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Step by step mobile guide */}
            <div className="w-full bg-slate-50 rounded-xl p-4 border border-slate-200 text-left text-xs text-slate-600 space-y-2.5">
              <div className="font-semibold text-emerald-700 flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
                <Smartphone className="w-4 h-4" />
                How to link WhatsApp account ({currentDevice?.alias}):
              </div>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-600">
                <li>Open WhatsApp on the device for this account</li>
                <li>Tap <strong className="text-slate-900">Settings</strong> or <strong className="text-slate-900">Menu</strong> (three dots)</li>
                <li>Select <strong className="text-slate-900">Linked Devices</strong></li>
                <li>Tap <strong className="text-slate-900">Link a Device</strong></li>
                <li>Point your camera at this QR code to authenticate</li>
              </ol>
              <div className="pt-2 border-t border-slate-200 flex items-center gap-1.5 text-[11px] text-slate-500">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Multi-device encrypted session stored in an isolated local folder.
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
