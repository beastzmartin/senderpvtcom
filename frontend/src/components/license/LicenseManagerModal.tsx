import React, { useState } from 'react';
import { useLicense } from '../../context/LicenseContext';
import {
  ShieldCheck,
  Key,
  Copy,
  Check,
  Laptop,
  Calendar,
  AlertTriangle,
  RefreshCw,
  LogOut,
  X,
  Send,
  Download,
  Smartphone,
  ExternalLink
} from 'lucide-react';

interface LicenseManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LicenseManagerModal: React.FC<LicenseManagerModalProps> = ({ isOpen, onClose }) => {
  const { license, usage, hwid, deactivateLicense, refreshLicense } = useLicense();
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedHwid, setCopiedHwid] = useState(false);
  const [showConfirmDeactivate, setShowConfirmDeactivate] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  if (!isOpen) return null;

  const handleCopy = (text: string, type: 'key' | 'hwid') => {
    navigator.clipboard.writeText(text);
    if (type === 'key') {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } else {
      setCopiedHwid(true);
      setTimeout(() => setCopiedHwid(false), 2000);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshLicense();
    setIsRefreshing(false);
  };

  const handleConfirmDeactivate = async () => {
    await deactivateLicense();
    setShowConfirmDeactivate(false);
    onClose();
  };

  const msgPct = usage?.dailyMessageLimit
    ? Math.min(100, Math.round((usage.messagesSentToday / usage.dailyMessageLimit) * 100))
    : 0;

  const extPct = usage?.dailyExtractionLimit
    ? Math.min(100, Math.round((usage.extractionsDoneToday / usage.dailyExtractionLimit) * 100))
    : 0;

  const devPct = usage?.maxDevices
    ? Math.min(100, Math.round((usage.connectedDevices / usage.maxDevices) * 100))
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs font-sans">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-fadeIn">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">License & Workstation Status</h3>
              <p className="text-xs text-slate-400">Offline Standalone Desktop Node</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="Refresh License Quotas"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {/* Status & Plan Row */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-200">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Plan Tier & Status
              </span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-lg font-extrabold text-slate-900 uppercase">
                  {license?.plan_tier || 'ENTERPRISE'}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  ACTIVE
                </span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Duration / Expiry
              </span>
              <span className="text-xs font-bold text-slate-800 mt-1 block">
                {license?.is_lifetime ? (
                  <span className="text-emerald-700 font-extrabold">Permanent Lifetime Access</span>
                ) : license?.expires_at ? (
                  new Date(license.expires_at).toLocaleDateString()
                ) : (
                  'Active'
                )}
              </span>
            </div>
          </div>

          {/* Machine HWID & Key Details */}
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mb-1">
                <Laptop className="w-3.5 h-3.5 text-slate-400" />
                Bound Machine Hardware ID (HWID)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={hwid}
                  className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-700 select-all focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleCopy(hwid, 'hwid')}
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 shrink-0 border border-slate-200 transition"
                  title="Copy HWID"
                >
                  {copiedHwid ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedHwid ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mb-1">
                <Key className="w-3.5 h-3.5 text-slate-400" />
                Active License Key
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={license?.license_key || 'ACTIVE_LICENSE'}
                  className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-700 select-all focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleCopy(license?.license_key || '', 'key')}
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 shrink-0 border border-slate-200 transition"
                  title="Copy Key"
                >
                  {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Daily Quota Meters */}
          <div>
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-2.5">
              Daily Resource Quotas
            </h4>
            <div className="space-y-3">
              {/* Daily Messages Meter */}
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-bold text-slate-700 flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5 text-emerald-600" />
                    Daily Messages Sent
                  </span>
                  <span className="font-mono font-bold text-slate-800">
                    {usage?.messagesSentToday || 0} / {usage?.dailyMessageLimit || 10000}
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-300"
                    style={{ width: `${msgPct}%` }}
                  />
                </div>
              </div>

              {/* Daily Extractions Meter */}
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-bold text-slate-700 flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5 text-indigo-600" />
                    Daily Extracted Leads
                  </span>
                  <span className="font-mono font-bold text-slate-800">
                    {usage?.extractionsDoneToday || 0} / {usage?.dailyExtractionLimit || 10000}
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300"
                    style={{ width: `${extPct}%` }}
                  />
                </div>
              </div>

              {/* Devices Meter */}
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-bold text-slate-700 flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-amber-600" />
                    Connected WhatsApp Devices
                  </span>
                  <span className="font-mono font-bold text-slate-800">
                    {usage?.connectedDevices || 0} / {usage?.maxDevices || 10}
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-300"
                    style={{ width: `${devPct}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Deactivation / Key Change Section */}
          <div className="pt-2 border-t border-slate-200">
            {showConfirmDeactivate ? (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 space-y-3 animate-fadeIn">
                <div className="flex items-start gap-2.5 text-rose-800 text-xs">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block font-bold">Are you sure you want to deactivate?</strong>
                    <span>
                      This will release the license on this machine and lock access until another valid license key is provided.
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowConfirmDeactivate(false)}
                    className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDeactivate}
                    className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-xs"
                  >
                    Yes, Deactivate License
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Need to switch workstation or key?</span>
                <button
                  type="button"
                  onClick={() => setShowConfirmDeactivate(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200 text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Change / Deactivate Key</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
