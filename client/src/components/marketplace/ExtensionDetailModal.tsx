import React, { useState } from 'react';
import {
  X,
  Sparkles,
  CheckCircle2,
  Lock,
  ExternalLink,
  ShieldCheck,
  Zap,
  Globe,
  Layers,
  ChevronRight,
  AlertCircle,
  CreditCard,
  Download
} from 'lucide-react';
import { MarketplaceExtension, MarketplaceModule } from '../../types';
import { api } from '../../services/api';

interface ExtensionDetailModalProps {
  extension: MarketplaceExtension | null;
  isOpen: boolean;
  onClose: () => void;
  walletBalance: number;
  onRefreshData: () => void;
  onOpenTopUp: () => void;
}

export const ExtensionDetailModal: React.FC<ExtensionDetailModalProps> = ({
  extension,
  isOpen,
  onClose,
  walletBalance,
  onRefreshData,
  onOpenTopUp
}) => {
  const [activeTab, setActiveTab] = useState<'modules' | 'docs' | 'install'>('modules');
  const [activatingModuleId, setActivatingModuleId] = useState<string | null>(null);
  const [activatingExt, setActivatingExt] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen || !extension) return null;

  const handleActivateExtension = async () => {
    if (extension.activation_fee > 0 && walletBalance < extension.activation_fee) {
      setMessage({
        type: 'error',
        text: `Insufficient wallet balance (₹${walletBalance.toFixed(2)}). Please top up ₹${(
          extension.activation_fee - walletBalance
        ).toFixed(2)} to activate.`
      });
      return;
    }

    try {
      setActivatingExt(true);
      setMessage(null);
      await api.marketplace.activateExtension(extension.id);
      setMessage({
        type: 'success',
        text: `Extension "${extension.name}" activated successfully!`
      });
      onRefreshData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to activate extension.' });
    } finally {
      setActivatingExt(false);
    }
  };

  const handleActivateModule = async (module: MarketplaceModule) => {
    if (module.activation_fee > 0 && walletBalance < module.activation_fee) {
      setMessage({
        type: 'error',
        text: `Insufficient wallet balance (₹${walletBalance.toFixed(2)}). Please top up ₹${(
          module.activation_fee - walletBalance
        ).toFixed(2)} to activate "${module.name}".`
      });
      return;
    }

    try {
      setActivatingModuleId(module.id);
      setMessage(null);
      await api.marketplace.activateModule(module.id);
      setMessage({
        type: 'success',
        text: `Module "${module.name}" activated successfully!`
      });
      onRefreshData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to activate module.' });
    } finally {
      setActivatingModuleId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-100">
        {/* Header Ribbon */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-3xl shadow-lg border border-white/20">
                {extension.icon || '🧩'}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold">{extension.name}</h1>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                    v{extension.version}
                  </span>
                </div>
                <p className="text-slate-300 text-sm mt-1 max-w-xl">{extension.short_description}</p>
                <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                  <span>★ {extension.rating} ({extension.reviews_count} reviews)</span>
                  <span>•</span>
                  <span>Category: <strong className="text-indigo-300">{extension.category}</strong></span>
                  <span>•</span>
                  <span>Manifest V3</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-end gap-2 shrink-0">
              <div className="bg-white/10 px-3.5 py-1.5 rounded-xl border border-white/10 text-xs">
                <span className="text-slate-300">Wallet Balance: </span>
                <span className="font-bold text-emerald-400">₹{walletBalance.toFixed(2)}</span>
              </div>
              {!extension.is_activated ? (
                <button
                  onClick={handleActivateExtension}
                  disabled={activatingExt}
                  className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold text-xs rounded-xl shadow-md transition-all flex items-center gap-2"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>
                    {extension.activation_fee > 0
                      ? `Activate Extension (₹${extension.activation_fee.toFixed(2)})`
                      : 'Activate Extension (Free)'}
                  </span>
                </button>
              ) : (
                <div className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Extension Active</span>
                </div>
              )}
            </div>
          </div>

          {/* Navigation Sub-Tabs */}
          <div className="flex items-center gap-2 mt-6 pt-3 border-t border-white/10">
            <button
              onClick={() => setActiveTab('modules')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'modules'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Available Modules ({extension.modules?.length || 0})</span>
            </button>
            <button
              onClick={() => setActiveTab('install')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'install'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Installation Guide</span>
            </button>
            <button
              onClick={() => setActiveTab('docs')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'docs'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Features & Specs</span>
            </button>
          </div>
        </div>

        {/* Status Message */}
        {message && (
          <div
            className={`px-6 py-3 text-sm flex items-center justify-between border-b ${
              message.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-red-50 text-red-800 border-red-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {message.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <span>{message.text}</span>
            </div>
            {message.type === 'error' && message.text.includes('Insufficient') && (
              <button
                onClick={onOpenTopUp}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg shadow"
              >
                Top-Up Now
              </button>
            )}
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {activeTab === 'modules' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-800">
                    Extension Modules & Dynamic Capabilities
                  </h3>
                  <p className="text-xs text-slate-500">
                    Each module unlocks specialized extraction, enrichment, or export powers. Only pay
                    for what you activate.
                  </p>
                </div>
                <div className="text-xs text-slate-500">
                  {extension.modules?.filter((m) => m.is_activated).length || 0} of{' '}
                  {extension.modules?.length || 0} Modules Activated
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(extension.modules || []).map((mod) => (
                  <div
                    key={mod.id}
                    className={`p-4 rounded-xl border transition-all ${
                      mod.is_activated
                        ? 'border-emerald-200 bg-emerald-50/30'
                        : 'border-slate-200 bg-white hover:border-indigo-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-lg border border-indigo-100">
                          {mod.icon || '⚡'}
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-800">{mod.name}</h4>
                          <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                            {mod.category || 'Module'} • {mod.slug}
                          </span>
                        </div>
                      </div>

                      {mod.is_activated ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          ACTIVE
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1">
                          <Lock className="w-3 h-3 text-slate-400" />
                          LOCKED
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-600 mt-2.5 line-clamp-2">{mod.description}</p>

                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-slate-400 text-[11px]">Pricing: </span>
                        <strong className="text-indigo-600 font-semibold">
                          {mod.usage_price > 0
                            ? `₹${mod.usage_price.toFixed(2)} / ${mod.usage_charging_model.replace('per_', '')}`
                            : 'Free Usage'}
                        </strong>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Quota: <strong>{mod.period_quota_limit.toLocaleString()} / mo</strong>
                      </div>
                    </div>

                    <div className="mt-3 pt-2 flex items-center justify-between">
                      {mod.is_activated ? (
                        <div className="text-[11px] text-emerald-700 font-medium">
                          ✓ Entitled • Wallet auto-settlement active
                        </div>
                      ) : (
                        <button
                          onClick={() => handleActivateModule(mod)}
                          disabled={activatingModuleId === mod.id}
                          className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg shadow-sm transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          {activatingModuleId === mod.id ? (
                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <>
                              <Zap className="w-3.5 h-3.5" />
                              <span>
                                {mod.activation_fee > 0
                                  ? `Activate for ₹${mod.activation_fee.toFixed(2)}`
                                  : 'Activate Module (Free)'}
                              </span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'install' && (
            <div className="space-y-4">
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-indigo-950 text-xs">
                <h4 className="font-bold text-sm mb-1 text-indigo-900">Chrome Extension Setup Steps</h4>
                <ol className="list-decimal pl-4 space-y-1.5 mt-2 text-indigo-800">
                  <li>Open Google Chrome and navigate to <strong>chrome://extensions</strong>.</li>
                  <li>Toggle the <strong>Developer mode</strong> switch in the top right corner.</li>
                  <li>Click <strong>Load unpacked</strong> button in the top left.</li>
                  <li>Select the <code>/extension</code> folder from your project root.</li>
                  <li>The extension icon will appear in your Chrome toolbar. Click it to begin!</li>
                </ol>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-2">
                <h4 className="font-bold text-slate-900">Browser Compatibility</h4>
                <div className="flex gap-2">
                  {(extension.supported_browsers || ['Chrome', 'Chromium', 'Brave', 'Edge']).map(
                    (b, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg font-semibold text-slate-800"
                      >
                        {b}
                      </span>
                    )
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'docs' && (
            <div className="space-y-4 text-xs text-slate-700">
              <div>
                <h4 className="font-bold text-sm text-slate-900 mb-1">Architecture & Capabilities</h4>
                <p className="leading-relaxed">
                  {extension.description ||
                    'Built on modern Chromium Manifest V3 with background service workers and dynamic lead extraction injectors. Features continuous real-time synchronization with your centralized SaaS CRM and automatic wallet accounting.'}
                </p>
              </div>

              <div>
                <h4 className="font-bold text-sm text-slate-900 mb-2">Key Features Included</h4>
                <div className="grid grid-cols-2 gap-2">
                  {(extension.features || []).map((feat, i) => (
                    <div
                      key={i}
                      className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 flex items-center gap-2"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
