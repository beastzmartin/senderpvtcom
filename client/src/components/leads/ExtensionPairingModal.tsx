import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import {
  X,
  Copy,
  Check,
  Download,
  Key,
  ShieldCheck,
  Chrome,
  ExternalLink,
  RefreshCw,
  Sparkles
} from 'lucide-react';

interface ExtensionPairingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExtensionPairingModal: React.FC<ExtensionPairingModalProps> = ({ isOpen, onClose }) => {
  const [token, setToken] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadToken();
    }
  }, [isOpen]);

  const loadToken = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await api.extension.getToken();
      setToken(res.token);
    } catch (err: any) {
      setError(err.message || 'Failed to load extension token.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (!token) return;
    navigator.clipboard.writeText(token);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-emerald-500 flex items-center justify-center text-white shadow-md shadow-emerald-950/10">
              <Chrome className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Connect Chrome Extension
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  v2.0
                </span>
              </h2>
              <p className="text-xs text-slate-500 font-medium">Extract leads directly from Google Maps & Webpages</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
              {error}
            </div>
          )}

          {/* Token Box */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-emerald-600" />
              Your Personal Extension Session Key
            </label>
            <p className="text-xs text-slate-500">
              Paste this session token into your Chrome extension popup to securely link it with your account.
            </p>

            <div className="flex items-center gap-2">
              <div className="flex-1 bg-slate-100 border border-slate-200 rounded-xl px-3 py-2.5 font-mono text-xs text-slate-700 truncate select-all">
                {isLoading ? (
                  <span className="text-slate-400 flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Generating token...
                  </span>
                ) : (
                  token
                )}
              </div>
              <button
                onClick={handleCopy}
                disabled={isLoading || !token}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold rounded-xl text-xs transition flex items-center gap-1.5 shadow-sm shadow-emerald-950/10 shrink-0"
              >
                {isCopied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-200" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy Token
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Setup Steps */}
          <div className="border border-slate-100 bg-slate-50/70 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              Quick 3-Step Setup
            </h3>

            <ol className="text-xs text-slate-600 space-y-2.5 list-decimal list-inside font-medium">
              <li>
                In your Chrome browser, go to <strong className="text-slate-800">chrome://extensions</strong> and enable <strong className="text-slate-800">Developer mode</strong>.
              </li>
              <li>
                Click <strong className="text-slate-800">Load unpacked</strong> and select the extension folder:
                <div className="mt-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-mono text-[11px] text-slate-700 break-all select-all">
                  extension
                </div>
              </li>
              <li>
                Click the extension icon in your browser toolbar, paste your session token above, and click <strong className="text-slate-800">Connect to Dashboard</strong>.
              </li>
            </ol>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>All leads extracted via the extension are automatically synchronized in real-time to your dashboard.</span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 flex items-center justify-end bg-slate-50/60">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
