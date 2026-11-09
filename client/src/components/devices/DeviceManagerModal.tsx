import React, { useState } from 'react';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../common/Modal';
import { StatusBadge } from '../common/StatusBadge';
import { WhatsAppDevice } from '../../types';
import {
  Smartphone,
  Plus,
  Star,
  RefreshCw,
  PowerOff,
  Trash2,
  Edit2,
  Check,
  X,
  QrCode,
  Copy,
  CheckCircle2,
  ShieldCheck,
  Layers
} from 'lucide-react';

export const DeviceManagerModal: React.FC = () => {
  const {
    devices,
    activeSessionId,
    isDeviceManagerOpen,
    setIsDeviceManagerOpen,
    createDevice,
    deleteDevice,
    setDefaultDevice,
    renameDevice,
    connectDevice,
    disconnectDevice,
    resetDevice,
    openQrModalForDevice
  } = useWhatsApp();
  const { user } = useAuth();

  const maxAllowedDevices = user?.max_devices || 1;
  const isDeviceLimitReached = devices.length >= maxAllowedDevices && user?.role !== 'admin';

  const [isAddingDevice, setIsAddingDevice] = useState(false);
  const [newAlias, setNewAlias] = useState('');
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingAlias, setEditingAlias] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const connectedCount = devices.filter((d) => d.status === 'connected').length;

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsProcessing('create');
    try {
      await createDevice(newAlias.trim() || undefined);
      setNewAlias('');
      setIsAddingDevice(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create device');
    } finally {
      setIsProcessing(null);
    }
  };

  const handleRename = async (sessionId: string) => {
    if (!editingAlias.trim()) return;
    setIsProcessing(`rename-${sessionId}`);
    try {
      await renameDevice(sessionId, editingAlias.trim());
      setEditingSessionId(null);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to rename device');
    } finally {
      setIsProcessing(null);
    }
  };

  const handleDelete = async (sessionId: string, alias: string) => {
    if (!window.confirm(`Are you sure you want to remove account "${alias}"? This will terminate its session.`)) {
      return;
    }
    setIsProcessing(`delete-${sessionId}`);
    try {
      await deleteDevice(sessionId);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete device');
    } finally {
      setIsProcessing(null);
    }
  };

  return (
    <Modal
      isOpen={isDeviceManagerOpen}
      onClose={() => setIsDeviceManagerOpen(false)}
      title="Multi-Device & Multi-Account Manager"
      maxWidth="max-w-4xl"
    >
      <div className="space-y-6">
        {/* Header bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-emerald-600/20 shrink-0">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Linked WhatsApp Accounts</h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  {connectedCount} / {devices.length} Online
                </span>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
                  Capacity: {devices.length} / {maxAllowedDevices} Devices ({user?.plan_tier ? user.plan_tier.toUpperCase() : 'STARTER'})
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage multiple phone numbers and accounts. Use them independently or rotate during bulk sending.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (isDeviceLimitReached) {
                setErrorMsg(`Device limit reached for your ${user?.plan_tier?.toUpperCase() || 'STARTER'} plan (${devices.length}/${maxAllowedDevices}). Please upgrade in the Subscription tab to connect more accounts.`);
                return;
              }
              setIsAddingDevice(!isAddingDevice);
            }}
            className={`px-4 py-2 rounded-xl text-white font-semibold text-xs transition shadow-sm flex items-center justify-center gap-1.5 shrink-0 ${
              isDeviceLimitReached
                ? 'bg-purple-600 hover:bg-purple-500'
                : 'bg-emerald-600 hover:bg-emerald-500'
            }`}
          >
            <Plus className="w-4 h-4" />
            {isDeviceLimitReached ? 'Device Limit Reached (Upgrade)' : 'Add New WhatsApp Account'}
          </button>
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between">
            <span>{errorMsg}</span>
            <button type="button" onClick={() => setErrorMsg(null)} className="text-rose-500 hover:text-rose-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Add Device Form Drawer */}
        {isAddingDevice && (
          <form
            onSubmit={handleCreate}
            className="p-5 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 space-y-4 animate-in fade-in"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                <Smartphone className="w-4 h-4" />
                Link Another WhatsApp Device
              </span>
              <button
                type="button"
                onClick={() => setIsAddingDevice(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Account Label / Alias
                </label>
                <input
                  type="text"
                  value={newAlias}
                  onChange={(e) => setNewAlias(e.target.value)}
                  placeholder="e.g. Sales Team SIM, Marketing 2, Customer Support"
                  className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 shadow-sm"
                  autoFocus
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={isProcessing === 'create'}
                  className="w-full py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs shadow-sm flex items-center justify-center gap-1.5 transition h-[38px]"
                >
                  {isProcessing === 'create' ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Creating Session...
                    </>
                  ) : (
                    <>
                      <QrCode className="w-3.5 h-3.5" />
                      Create & Scan QR Code
                    </>
                  )}
                </button>
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              A fresh, completely isolated session folder will be created. Once created, you will be prompted to scan a QR code with that phone.
            </p>
          </form>
        )}

        {/* Devices list */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {devices.map((dev) => {
            const isDefault = dev.is_default || dev.session_id === activeSessionId;
            const isEditing = editingSessionId === dev.session_id;

            return (
              <div
                key={dev.session_id}
                className={`p-5 rounded-2xl bg-white border transition shadow-sm flex flex-col justify-between ${
                  isDefault
                    ? 'border-emerald-300 ring-2 ring-emerald-500/10'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div>
                  {/* Top card header */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 shadow-xs ${
                          dev.status === 'connected'
                            ? 'bg-emerald-100 text-emerald-700'
                            : dev.status === 'connecting'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        <Smartphone className="w-5 h-5" />
                      </div>

                      <div>
                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={editingAlias}
                              onChange={(e) => setEditingAlias(e.target.value)}
                              className="px-2 py-0.5 bg-slate-50 border border-slate-300 rounded text-xs font-semibold text-slate-900 focus:outline-none focus:border-emerald-500"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => handleRename(dev.session_id)}
                              className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-500"
                              title="Save name"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingSessionId(null)}
                              className="p-1 rounded bg-slate-200 text-slate-600 hover:bg-slate-300"
                              title="Cancel"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-sm text-slate-900">{dev.alias}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingSessionId(dev.session_id);
                                setEditingAlias(dev.alias);
                              }}
                              className="text-slate-400 hover:text-slate-600 transition"
                              title="Rename account"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}

                        <div className="flex items-center gap-2 mt-0.5">
                          <StatusBadge status={dev.status} />
                          {isDefault && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
                              Primary Active
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {!isDefault && (
                      <button
                        type="button"
                        onClick={() => setDefaultDevice(dev.session_id)}
                        className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-600 text-[11px] font-semibold transition border border-slate-200"
                        title="Set this as default device for quick actions"
                      >
                        Set as Primary
                      </button>
                    )}
                  </div>

                  {/* Account detail meta */}
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-1.5 text-xs mb-4">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Phone:</span>
                      {dev.phone_number ? (
                        <div className="flex items-center gap-1.5 font-mono font-medium text-emerald-700">
                          <span>{dev.phone_number}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(dev.phone_number!, `phone-${dev.session_id}`)}
                            className="text-slate-400 hover:text-slate-600"
                            title="Copy Phone"
                          >
                            {copiedId === `phone-${dev.session_id}` ? (
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Not paired yet</span>
                      )}
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">WhatsApp LID:</span>
                      {dev.lid ? (
                        <div className="flex items-center gap-1.5 font-mono text-[11px] text-sky-700">
                          <span className="truncate max-w-[170px]">{dev.lid}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(dev.lid!, `lid-${dev.session_id}`)}
                            className="text-slate-400 hover:text-slate-600"
                            title="Copy LID"
                          >
                            {copiedId === `lid-${dev.session_id}` ? (
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">—</span>
                      )}
                    </div>

                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-slate-500">Profile Name:</span>
                      <span className="font-medium text-slate-800">{dev.display_name || '—'}</span>
                    </div>

                    <div className="flex justify-between items-center text-[10px] text-slate-400 pt-1 border-t border-slate-200/60">
                      <span>Session ID:</span>
                      <code className="font-mono text-slate-500">{dev.session_id}</code>
                    </div>
                  </div>
                </div>

                {/* Card Action footer */}
                <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    {dev.status === 'connected' ? (
                      <button
                        type="button"
                        onClick={() => disconnectDevice(dev.session_id)}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition border border-slate-200 flex items-center gap-1"
                        title="Disconnect session temporarily"
                      >
                        <PowerOff className="w-3 h-3" />
                        Disconnect
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openQrModalForDevice(dev.session_id)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition shadow-xs flex items-center gap-1.5"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        Scan QR Code
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => resetDevice(dev.session_id)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 font-medium text-xs transition border border-slate-200"
                      title="Clear credentials and link a new phone number to this slot"
                    >
                      Relink (New QR)
                    </button>
                  </div>

                  {devices.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleDelete(dev.session_id, dev.alias)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                      title="Delete account"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Anti-Ban & Multi-Device Information Banner */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3 text-xs text-slate-600">
          <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-slate-900">How Multi-Device Anti-Ban Works:</span>
            <p>
              When you connect multiple WhatsApp accounts, the Bulk LID Sender and Broadcast Scheduler can use <strong>Round-Robin Rotation</strong>. Each message is distributed across your connected devices, dividing message velocity and shielding individual numbers from rate-limit bans.
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
};

