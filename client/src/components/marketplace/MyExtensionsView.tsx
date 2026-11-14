import React, { useState, useEffect } from 'react';
import {
  Layers,
  CheckCircle2,
  Lock,
  Zap,
  RefreshCw,
  Wallet,
  Plus,
  Compass,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Building2,
  Globe
} from 'lucide-react';
import { api } from '../../services/api';
import { UserWallet } from '../../types';
import { WalletTopUpModal } from './WalletTopUpModal';

interface MyExtensionsViewProps {
  onNavigateToMarketplace?: () => void;
  onNavigateToWallet?: () => void;
  onNavigateToCRM?: () => void;
}

export const MyExtensionsView: React.FC<MyExtensionsViewProps> = ({
  onNavigateToMarketplace,
  onNavigateToWallet,
  onNavigateToCRM
}) => {
  const [data, setData] = useState<{ activations: any[]; modules: any[] }>({
    activations: [],
    modules: []
  });
  const [wallet, setWallet] = useState<UserWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedExtId, setSelectedExtId] = useState<string>('all');
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [activatingModuleId, setActivatingModuleId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [res, walletRes] = await Promise.all([
        api.marketplace.getMyExtensions(),
        api.wallet.get().catch(() => null)
      ]);
      setData(res || { activations: [], modules: [] });
      if (walletRes) setWallet(walletRes);
    } catch (err) {
      console.error('Failed to load my extensions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleActivateModule = async (moduleId: string, moduleName: string, fee: number) => {
    if (wallet && fee > 0 && wallet.balance < fee) {
      setNotice({
        type: 'error',
        text: `Insufficient wallet balance to activate "${moduleName}". Please top up ₹${(
          fee - wallet.balance
        ).toFixed(2)}.`
      });
      return;
    }

    try {
      setActivatingModuleId(moduleId);
      setNotice(null);
      await api.marketplace.activateModule(moduleId);
      setNotice({
        type: 'success',
        text: `Module "${moduleName}" activated successfully!`
      });
      fetchData();
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message || 'Failed to activate module.' });
    } finally {
      setActivatingModuleId(null);
    }
  };

  const filteredModules =
    selectedExtId === 'all'
      ? data.modules
      : data.modules.filter((m) => m.extension_id === selectedExtId);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 sm:p-8 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 text-xs font-semibold mb-2">
            <Layers className="w-3.5 h-3.5" />
            <span>Active Entitlements & Consumption Matrix</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold">My Extensions & Modules</h1>
          <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-xl">
            Monitor all your activated browser extensions, view real-time monthly usage meters, and
            unlock additional specialized modules instantly.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="bg-white/10 backdrop-blur-md px-4 py-3 rounded-xl border border-white/15 text-right">
            <div className="text-[11px] text-indigo-200">Wallet Balance</div>
            <div className="text-xl font-bold text-white">₹{(wallet?.balance || 0).toFixed(2)}</div>
          </div>
          <button
            onClick={() => setIsTopUpOpen(true)}
            className="py-3 px-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold text-xs rounded-xl shadow transition-all flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Top Up</span>
          </button>
        </div>
      </div>

      {notice && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-center justify-between ${
            notice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {notice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{notice.text}</span>
          </div>
          {notice.type === 'error' && (
            <button
              onClick={() => setIsTopUpOpen(true)}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg"
            >
              Recharge Now
            </button>
          )}
        </div>
      )}

      {/* Extension Filter Tabs */}
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setSelectedExtId('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              selectedExtId === 'all'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            All Modules ({data.modules.length})
          </button>
          {data.activations.map((act) => (
            <button
              key={act.extension_id}
              onClick={() => setSelectedExtId(act.extension_id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                selectedExtId === act.extension_id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span>{act.icon || '🧩'}</span>
              <span>{act.extension_name}</span>
            </button>
          ))}
        </div>

        {onNavigateToMarketplace && (
          <button
            onClick={onNavigateToMarketplace}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 shrink-0"
          >
            <span>Explore More Extensions</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Modules List Grid */}
      {loading ? (
        <div className="py-20 text-center space-y-3">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-500 font-medium">Loading your modules...</p>
        </div>
      ) : filteredModules.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 space-y-3">
          <Layers className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-lg font-bold text-slate-700">No active modules in this view</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Browse our extensions marketplace to activate Google Maps Lead Extractor, Website Scanner,
            and email discovery tools.
          </p>
          {onNavigateToMarketplace && (
            <button
              onClick={onNavigateToMarketplace}
              className="mt-3 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-sm inline-flex items-center gap-1.5"
            >
              <span>Browse Marketplace</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredModules.map((m) => {
            const isActivated = m.status === 'active';
            const quota = m.custom_quota_override || m.period_quota_limit || 1000;
            const price = m.custom_usage_price_override !== undefined && m.custom_usage_price_override !== null
              ? m.custom_usage_price_override
              : m.usage_price;

            return (
              <div
                key={m.module_id || m.id}
                className={`p-5 rounded-2xl border transition-all flex flex-col justify-between ${
                  isActivated
                    ? 'bg-white border-emerald-200 shadow-sm hover:shadow-md'
                    : 'bg-slate-50/60 border-slate-200 opacity-90'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-lg border border-indigo-100">
                        {m.icon || '⚡'}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-800">{m.name}</h4>
                        <span className="text-[10px] uppercase font-semibold text-slate-400">
                          {m.category || 'Module'} • {m.slug}
                        </span>
                      </div>
                    </div>

                    {isActivated ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        ACTIVE
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600 border border-slate-300 flex items-center gap-1">
                        <Lock className="w-3 h-3 text-slate-400" />
                        LOCKED
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">{m.description}</p>

                  {/* Quota & Pricing Pill */}
                  <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Billing Model:</span>
                      <strong className="text-indigo-600 font-semibold">
                        {price > 0
                          ? `₹${price.toFixed(2)} / ${m.usage_charging_model.replace('per_', '')}`
                          : 'Free Usage'}
                      </strong>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Monthly Limit:</span>
                      <span className="font-semibold text-slate-800">
                        {quota.toLocaleString()} / mo
                      </span>
                    </div>

                    {/* Quota Meter Bar */}
                    <div className="pt-1">
                      <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-indigo-600 h-1.5 rounded-full"
                          style={{ width: `${Math.min(100, isActivated ? 8 : 0)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Action */}
                <div className="mt-4 pt-3 border-t border-slate-100">
                  {isActivated ? (
                    <div className="flex items-center justify-between text-xs text-emerald-700 font-medium">
                      <span>✓ Ready in Chrome Extension</span>
                      {onNavigateToCRM && (
                        <button
                          onClick={onNavigateToCRM}
                          className="text-indigo-600 hover:text-indigo-700 font-semibold text-[11px]"
                        >
                          View Leads →
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => handleActivateModule(m.module_id, m.name, m.activation_fee || 0)}
                      disabled={activatingModuleId === m.module_id}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5"
                    >
                      {activatingModuleId === m.module_id ? (
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <Zap className="w-3.5 h-3.5" />
                          <span>
                            {m.activation_fee > 0
                              ? `Activate for ₹${m.activation_fee.toFixed(2)}`
                              : 'Activate Module (Free)'}
                          </span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Wallet Top-Up Modal */}
      <WalletTopUpModal
        isOpen={isTopUpOpen}
        onClose={() => setIsTopUpOpen(false)}
        currentBalance={wallet?.balance || 0}
        onSuccess={(newBal) => {
          setWallet((prev) => (prev ? { ...prev, balance: newBal } : null));
          fetchData();
        }}
      />
    </div>
  );
};
