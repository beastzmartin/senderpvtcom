import React, { useState } from 'react';
import { useLicense } from '../../context/LicenseContext';
import {
  KeyRound,
  Copy,
  Check,
  ShieldCheck,
  Sparkles,
  ExternalLink,
  MessageCircle,
  AlertCircle,
  Laptop,
  CheckCircle2,
  ChevronRight
} from 'lucide-react';

export const LicenseActivationView: React.FC = () => {
  const { hwid, activateLicense, errorReason } = useLicense();
  const [licenseInput, setLicenseInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedHwid, setCopiedHwid] = useState(false);

  const handleCopyHwid = () => {
    if (!hwid) return;
    navigator.clipboard.writeText(hwid);
    setCopiedHwid(true);
    setTimeout(() => setCopiedHwid(false), 2500);
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = licenseInput.trim().toUpperCase();
    if (!clean) {
      setErrorMessage('Please enter your license activation key.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await activateLicense(clean);
    } catch (err: any) {
      setErrorMessage(err.message || 'License activation failed. Please verify your key.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // WhatsApp Support link with prefilled HWID message
  const supportPhone = '919876543210';
  const prefilledText = encodeURIComponent(
    `Hello! I need a License Key for WhatsApp Messaging & Extractor CRM.\nMy Machine HWID: ${hwid || 'PVT-UNKNOWN'}`
  );
  const buyLicenseUrl = `https://wa.me/${supportPhone}?text=${prefilledText}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 font-sans">
      <div className="w-full max-w-xl">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 text-white shadow-xl shadow-emerald-500/20 mb-4 border border-emerald-400/30">
            <ShieldCheck className="w-9 h-9" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            WhatsApp Suite <span className="text-emerald-400">Desktop Edition</span>
          </h1>
          <p className="text-sm text-slate-400 mt-2 max-w-md mx-auto">
            100% Offline Standalone CRM & High-Speed Multi-Protocol WhatsApp Extractor
          </p>
        </div>

        {/* Main Activation Card */}
        <div className="bg-slate-900/90 border border-slate-800 backdrop-blur-xl rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/60 relative overflow-hidden">
          {/* Subtle Accent Glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent" />

          <div className="flex items-center justify-between border-b border-slate-800/80 pb-4 mb-6">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-emerald-400" />
                Activate License
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Hardware-bound lifetime or subscription activation
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Machine Ready
            </span>
          </div>

          {/* Machine Hardware ID (HWID) Banner */}
          <div className="mb-6 bg-slate-950/70 border border-slate-800 rounded-2xl p-3.5 sm:p-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Laptop className="w-3.5 h-3.5 text-emerald-400" />
                Your Machine Hardware ID (HWID)
              </span>
              <span className="text-[10px] text-slate-500">Locked to this PC</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={hwid || 'Detecting hardware...'}
                className="w-full bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono font-bold text-emerald-400 select-all focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCopyHwid}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 shrink-0 transition active:scale-95 border border-slate-700/60"
                title="Copy Hardware ID"
              >
                {copiedHwid ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400 font-bold">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                    <span>Copy HWID</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-2">
              Provide this Machine HWID to your administrator or sales representative to receive your personal activation key.
            </p>
          </div>

          {/* Error Banner */}
          {(errorMessage || errorReason) && (
            <div className="mb-6 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2.5 animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold block">Activation Notice</span>
                <span className="text-rose-200/90">{errorMessage || errorReason}</span>
              </div>
            </div>
          )}

          {/* Key Input Form */}
          <form onSubmit={handleActivate} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                Enter License Activation Key
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={licenseInput}
                  onChange={(e) => setLicenseInput(e.target.value.toUpperCase())}
                  placeholder="PVT-ENTERPRISE-LIFETIME-XXXX"
                  className="w-full bg-slate-950/80 border border-slate-700 focus:border-emerald-500 rounded-2xl px-4 py-3 text-sm font-mono text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition tracking-wider uppercase font-semibold"
                />
                {licenseInput && (
                  <button
                    type="button"
                    onClick={() => setLicenseInput('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs px-1"
                  >
                    Clear
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-emerald-400" />
                Format: <code className="text-slate-400">PVT-[TIER]-[EXPIRY]-[SIGNATURE]</code> or standard key
              </p>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !licenseInput.trim()}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white text-sm font-extrabold shadow-lg shadow-emerald-600/25 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer active:scale-98"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Verifying Hardware & Key...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Activate Software Now</span>
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Buy / Support Section */}
          <div className="mt-6 pt-5 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="text-slate-400 text-center sm:text-left">
              <span>Don't have a license key?</span>
            </div>
            <a
              href={buyLicenseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold transition"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>Contact Support / Buy Key</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="mt-6 grid grid-cols-3 gap-3 text-center">
          <div className="p-2.5 rounded-2xl bg-slate-900/40 border border-slate-800/60">
            <span className="block text-xs font-bold text-slate-300">100% Offline</span>
            <span className="text-[10px] text-slate-400">Zero cloud dependency</span>
          </div>
          <div className="p-2.5 rounded-2xl bg-slate-900/40 border border-slate-800/60">
            <span className="block text-xs font-bold text-slate-300">Local Baileys</span>
            <span className="text-[10px] text-slate-400">Multi-device sockets</span>
          </div>
          <div className="p-2.5 rounded-2xl bg-slate-900/40 border border-slate-800/60">
            <span className="block text-xs font-bold text-slate-300">100M+ CRM</span>
            <span className="text-[10px] text-slate-400">Local SQLite engine</span>
          </div>
        </div>
      </div>
    </div>
  );
};
