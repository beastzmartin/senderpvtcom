import React, { useState, useEffect } from 'react';
import { api } from '../../../services/api';
import {
  FiveSimProfile,
  FiveSimOrderItem,
  FiveSimPaymentItem,
  FiveSimMaxPriceItem,
  FiveSimConfig
} from '../../../types';
import {
  Radio,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Key,
  Globe,
  Sliders,
  DollarSign,
  Plus,
  Trash2,
  Search,
  ExternalLink,
  Lock,
  Eye,
  EyeOff,
  Zap,
  Info,
  Clock,
  ArrowUpRight,
  Sparkles
} from 'lucide-react';

export const FiveSimAdminConsole: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'profile' | 'max-prices' | 'orders' | 'payments' | 'settings'>('profile');
  const [loading, setLoading] = useState<boolean>(true);
  const [testingConnection, setTestingConnection] = useState<boolean>(false);
  const [syncingAll, setSyncingAll] = useState<boolean>(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // 5SIM Data
  const [config, setConfig] = useState<FiveSimConfig | null>(null);
  const [profile, setProfile] = useState<FiveSimProfile | null>(null);
  const [maxPrices, setMaxPrices] = useState<FiveSimMaxPriceItem[]>([]);
  const [orders, setOrders] = useState<FiveSimOrderItem[]>([]);
  const [ordersTotal, setOrdersTotal] = useState<number>(0);
  const [payments, setPayments] = useState<FiveSimPaymentItem[]>([]);
  const [paymentsTotal, setPaymentsTotal] = useState<number>(0);

  // Settings form
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [baseUrlInput, setBaseUrlInput] = useState<string>('https://5sim.net/v1');
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [isSavingSettings, setIsSavingSettings] = useState<boolean>(false);

  // Max Price modal/form
  const [isAddPriceOpen, setIsAddPriceOpen] = useState<boolean>(false);
  const [newProductName, setNewProductName] = useState<string>('');
  const [newPriceValue, setNewPriceValue] = useState<number>(20);
  const [isSubmittingPrice, setIsSubmittingPrice] = useState<boolean>(false);

  // Orders filters
  const [orderCategory, setOrderCategory] = useState<'activation' | 'hosting'>('activation');
  const [orderSource, setOrderSource] = useState<'cached' | 'live'>('cached');
  const [orderSearch, setOrderSearch] = useState<string>('');

  // Payments filters
  const [paymentSource, setPaymentSource] = useState<'cached' | 'live'>('cached');

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const cfgRes = await api.fiveSim.getConfig();
      if (cfgRes?.config) {
        setConfig(cfgRes.config);
        setApiKeyInput(cfgRes.config.apiKey || '');
        setBaseUrlInput(cfgRes.config.baseUrl || 'https://5sim.net/v1');
      }

      // Load cached profile / limits
      await Promise.all([
        loadProfile(),
        loadMaxPrices('cached'),
        loadOrders('cached', 'activation'),
        loadPayments('cached')
      ]);
    } catch (err: any) {
      showToast(err.message || 'Failed to load 5SIM config.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadProfile = async () => {
    try {
      const res = await api.fiveSim.getProfile();
      if (res?.profile) {
        setProfile(res.profile);
      }
    } catch {}
  };

  const loadMaxPrices = async (source: 'live' | 'cached' = 'cached') => {
    try {
      const res = await api.fiveSim.getMaxPrices(source);
      if (res?.maxPrices) {
        setMaxPrices(res.maxPrices);
      }
    } catch {}
  };

  const loadOrders = async (source: 'live' | 'cached' = orderSource, category: 'activation' | 'hosting' = orderCategory) => {
    try {
      const res = await api.fiveSim.getOrders({
        category,
        source,
        search: orderSearch || undefined,
        limit: 50
      });
      if (res?.orders) {
        setOrders(res.orders);
        setOrdersTotal(res.total || res.orders.length);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch orders.', 'error');
    }
  };

  const loadPayments = async (source: 'live' | 'cached' = paymentSource) => {
    try {
      const res = await api.fiveSim.getPayments({ source, limit: 50 });
      if (res?.payments) {
        setPayments(res.payments);
        setPaymentsTotal(res.total || res.payments.length);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch payments.', 'error');
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    try {
      const res = await api.fiveSim.testConnection(apiKeyInput || undefined);
      if (res.success && res.profile) {
        setProfile(res.profile);
        showToast(res.message, 'success');
      } else {
        showToast(res.message, 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Connection test failed', 'error');
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      const res = await api.fiveSim.updateConfig({
        apiKey: apiKeyInput,
        baseUrl: baseUrlInput,
        isEnabled: true
      });
      if (res.success) {
        setConfig(res.config);
        showToast('5SIM API settings saved successfully!', 'success');
        handleTestConnection();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to save settings.', 'error');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleSyncAll = async () => {
    setSyncingAll(true);
    try {
      const res = await api.fiveSim.syncAll();
      if (res.success) {
        showToast(`Full Sync Complete: Balance: ${res.summary.balance} RUB, Rating: ${res.summary.rating}/96`, 'success');
        await loadInitialData();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to sync with 5SIM.', 'error');
    } finally {
      setSyncingAll(false);
    }
  };

  const handleSetMaxPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProductName.trim() || newPriceValue <= 0) return;
    setIsSubmittingPrice(true);
    try {
      const res = await api.fiveSim.setMaxPrice({
        product: newProductName.trim().toLowerCase(),
        price: Number(newPriceValue)
      });
      if (res.success) {
        showToast(`Max price limit set for ${newProductName}!`, 'success');
        setIsAddPriceOpen(false);
        setNewProductName('');
        setNewPriceValue(20);
        await loadMaxPrices('cached');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to set price limit.', 'error');
    } finally {
      setIsSubmittingPrice(false);
    }
  };

  const handleDeleteMaxPrice = async (product: string) => {
    if (!confirm(`Are you sure you want to remove the price limit for "${product}"?`)) return;
    try {
      const res = await api.fiveSim.deleteMaxPrice(product);
      if (res.success) {
        showToast(`Price limit for ${product} removed.`, 'success');
        await loadMaxPrices('cached');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to delete price limit.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast notification */}
      {toast && (
        <div
          className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-between shadow-md transition ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-rose-50 border-rose-300 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600" />
            )}
            <span>{toast.message}</span>
          </div>
          <button onClick={() => setToast(null)} className="text-slate-400 hover:text-slate-600">
            ×
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-sky-900 via-indigo-900 to-slate-900 text-white rounded-3xl p-6 shadow-md flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-sky-500/30 text-sky-200 border border-sky-400/30 flex items-center gap-1">
              <Zap className="w-3 h-3 text-sky-400" />
              Official API Integration (Parts 0 - 3)
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Active Protocol
            </span>
          </div>
          <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
            <Radio className="w-6 h-6 text-sky-400" />
            5SIM.NET Virtual Telecom Hub
          </h1>
          <p className="text-xs text-slate-300 max-w-xl">
            Live bearer authentication, real-time balance tracking, rating protection, orders & payment telemetry, and automated price ceiling management.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testingConnection}
            className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-white/10 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${testingConnection ? 'animate-spin' : ''}`} />
            <span>Test Connection</span>
          </button>

          <button
            type="button"
            onClick={handleSyncAll}
            disabled={syncingAll}
            className="px-4 py-2.5 bg-sky-500 hover:bg-sky-600 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-sky-500/20 disabled:opacity-50"
          >
            <Sparkles className={`w-3.5 h-3.5 ${syncingAll ? 'animate-spin' : ''}`} />
            <span>Sync All Telemetry</span>
          </button>
        </div>
      </div>

      {/* Sub Navigation Bar */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('profile')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
            activeTab === 'profile'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Profile & Rating</span>
        </button>

        <button
          onClick={() => setActiveTab('max-prices')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
            activeTab === 'max-prices'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Price Limits ({maxPrices.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('orders')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
            activeTab === 'orders'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Orders History ({ordersTotal})</span>
        </button>

        <button
          onClick={() => setActiveTab('payments')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
            activeTab === 'payments'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          <span>Payments ({paymentsTotal})</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
            activeTab === 'settings'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Key className="w-4 h-4" />
          <span>API Credentials</span>
        </button>
      </div>

      {/* TAB 1: PROFILE & RATING (PART 1 & 2.1) */}
      {activeTab === 'profile' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Balance */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-2xs space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                5SIM Account Balance
              </span>
              <div className="text-2xl font-black font-mono text-slate-900 flex items-baseline gap-1">
                <span>{(profile?.balance || config?.balance || 0).toFixed(2)}</span>
                <span className="text-xs font-bold text-slate-500">RUB</span>
              </div>
              <div className="text-[11px] text-slate-400 font-medium">
                Frozen: {(profile?.frozen_balance || config?.frozenBalance || 0).toFixed(2)} RUB
              </div>
            </div>

            {/* Rating */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Account Rating
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {(profile?.rating || config?.rating || 96) >= 90 ? 'Healthy Tier' : 'Action Needed'}
                </span>
              </div>
              <div className="text-2xl font-black font-mono text-emerald-600 flex items-baseline gap-1">
                <span>{profile?.rating || config?.rating || 96}</span>
                <span className="text-xs text-slate-400 font-medium">/ 96 max</span>
              </div>
              {/* Rating bar */}
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (((profile?.rating || config?.rating || 96) / 96) * 100))}%` }}
                />
              </div>
            </div>

            {/* Vendor & Identity */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-2xs space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Account Identity
              </span>
              <div className="text-sm font-bold text-slate-900 truncate">
                {profile?.email || config?.email || 'Authenticated User'}
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                Vendor: {profile?.vendor || config?.vendor || 'Standard'}
              </div>
            </div>

            {/* Default Region */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-2xs space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Default Configuration
              </span>
              <div className="text-sm font-bold text-slate-900 capitalize">
                {profile?.default_country?.name || config?.defaultCountry?.name || 'Any Country'}
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                Prefix: {profile?.default_country?.prefix || config?.defaultCountry?.prefix || 'Global'}
              </div>
            </div>
          </div>

          {/* Rating Mechanics Guide (Part 1.4) */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 text-slate-900">
              <Info className="w-5 h-5 text-sky-600" />
              <h2 className="text-sm font-black uppercase tracking-wider">5SIM Official Rating & Request Rules (Part 1.3 & 1.4)</h2>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Your 5SIM rating directly dictates your account capacity and order speed. If rating drops to 0, ordering is suspended for 24 hours. Follow these automated rules to maintain a score of 96:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3.5 bg-emerald-50/70 border border-emerald-100 rounded-2xl space-y-1">
                <span className="text-xs font-bold text-emerald-900 block">Account Replenishment</span>
                <span className="text-lg font-black font-mono text-emerald-700">+8.0 points</span>
                <p className="text-[11px] text-emerald-800">Depositing funds automatically boosts your rating score.</p>
              </div>

              <div className="p-3.5 bg-sky-50/70 border border-sky-100 rounded-2xl space-y-1">
                <span className="text-xs font-bold text-sky-900 block">Quick SMS Completion</span>
                <span className="text-lg font-black font-mono text-sky-700">+0.5 points</span>
                <p className="text-[11px] text-sky-800">Marking order "finished" immediately after receiving verification code.</p>
              </div>

              <div className="p-3.5 bg-rose-50/70 border border-rose-100 rounded-2xl space-y-1">
                <span className="text-xs font-bold text-rose-900 block">Order Timeout Penalty</span>
                <span className="text-lg font-black font-mono text-rose-700">-0.15 points</span>
                <p className="text-[11px] text-rose-800">Never let orders expire without action! Cancel unused numbers (-0.1 is better than timeout -0.15).</p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-600 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>Safe Polling Safeguard:</strong> Built-in rate limiter ensures all backend requests remain comfortably below the <strong>100 req/sec limit</strong>, preventing the 10-minute ban penalty.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PRICE LIMITS (PART 3) */}
      {activeTab === 'max-prices' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-slate-200 shadow-2xs">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Maximum Price Ceilings (Part 3)</h2>
              <p className="text-xs text-slate-500">
                Fix maximum purchase prices for services when using the "any" operator to avoid purchasing overpriced numbers.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => loadMaxPrices('live')}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Fetch Live from 5SIM</span>
              </button>

              <button
                type="button"
                onClick={() => setIsAddPriceOpen(true)}
                className="px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Price Limit</span>
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-2xs">
            {maxPrices.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <Sliders className="w-10 h-10 text-slate-300 mx-auto" />
                <h3 className="font-bold text-slate-900 text-sm">No Price Limits Configured</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Click "Add Price Limit" to set a maximum price for products like WhatsApp, Telegram, or Facebook.
                </p>
                <button
                  type="button"
                  onClick={() => setIsAddPriceOpen(true)}
                  className="px-3.5 py-1.5 bg-sky-50 text-sky-700 border border-sky-200 text-xs font-bold rounded-xl"
                >
                  Set First Limit
                </button>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-bold uppercase text-[10px]">
                    <th className="py-3 px-4">Product Name</th>
                    <th className="py-3 px-4">Max Price (RUB)</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {maxPrices.map((item) => (
                    <tr key={item.product} className="hover:bg-slate-50/60">
                      <td className="py-3 px-4 font-bold text-slate-900 capitalize">
                        {item.product}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-sky-700">
                        {item.price.toFixed(2)} RUB
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Active Ceiling
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteMaxPrice(item.product)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          title="Remove limit"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: ORDERS (PART 2.2) */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-slate-200 shadow-2xs">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setOrderCategory('activation');
                  loadOrders(orderSource, 'activation');
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  orderCategory === 'activation'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Activation Numbers
              </button>

              <button
                type="button"
                onClick={() => {
                  setOrderCategory('hosting');
                  loadOrders(orderSource, 'hosting');
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  orderCategory === 'hosting'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Hosting (Rentals)
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setOrderSource('live');
                  loadOrders('live', orderCategory);
                }}
                className="px-3 py-1.5 bg-sky-50 text-sky-700 border border-sky-200 rounded-xl text-xs font-bold flex items-center gap-1 hover:bg-sky-100"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Fetch Live from 5SIM</span>
              </button>
            </div>
          </div>

          {/* Orders Table */}
          <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-2xs">
            {orders.length === 0 ? (
              <div className="p-12 text-center space-y-2 text-slate-500 text-xs">
                <Clock className="w-8 h-8 text-slate-300 mx-auto" />
                <p>No orders recorded for category "{orderCategory}".</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-bold uppercase text-[10px]">
                      <th className="py-3 px-4">Order ID</th>
                      <th className="py-3 px-4">Phone Number</th>
                      <th className="py-3 px-4">Service</th>
                      <th className="py-3 px-4">Operator</th>
                      <th className="py-3 px-4">Price</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">SMS Received</th>
                      <th className="py-3 px-4">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {orders.map((o) => (
                      <tr key={o.id} className="hover:bg-slate-50/60">
                        <td className="py-3 px-4 font-mono text-slate-500 font-bold">#{o.id}</td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">{o.phone}</td>
                        <td className="py-3 px-4 capitalize font-semibold text-slate-700">{o.product}</td>
                        <td className="py-3 px-4 text-slate-500 uppercase">{o.operator || 'Any'}</td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">{o.price} RUB</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                              o.status === 'FINISHED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : o.status === 'RECEIVED'
                                ? 'bg-sky-100 text-sky-800'
                                : o.status === 'PENDING'
                                ? 'bg-amber-100 text-amber-800'
                                : o.status === 'CANCELED'
                                ? 'bg-slate-100 text-slate-600'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {o.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono">
                          {o.sms && o.sms.length > 0 ? (
                            <span className="text-emerald-700 font-bold">
                              {o.sms[0].code || 'Received'} ({o.sms.length})
                            </span>
                          ) : (
                            <span className="text-slate-400">None</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-400">{o.created_at?.slice(0, 16)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: PAYMENTS (PART 2.3) */}
      {activeTab === 'payments' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-3xl border border-slate-200 shadow-2xs">
            <div>
              <h2 className="text-sm font-bold text-slate-900">5SIM Payments & Replenishment History</h2>
              <p className="text-xs text-slate-500">Official ledger of balance charges and deposits made to 5SIM.net.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setPaymentSource('live');
                loadPayments('live');
              }}
              className="px-3.5 py-2 bg-sky-50 text-sky-700 border border-sky-200 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-sky-100"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Fetch Live from 5SIM</span>
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-2xs">
            {payments.length === 0 ? (
              <div className="p-12 text-center space-y-2 text-slate-500 text-xs">
                <DollarSign className="w-8 h-8 text-slate-300 mx-auto" />
                <p>No payment history records found.</p>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-bold uppercase text-[10px]">
                    <th className="py-3 px-4">Payment ID</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Provider</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Balance After</th>
                    <th className="py-3 px-4">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map((p) => (
                    <tr key={p.ID} className="hover:bg-slate-50/60">
                      <td className="py-3 px-4 font-mono font-bold text-slate-700">#{p.ID}</td>
                      <td className="py-3 px-4 capitalize font-semibold">{p.TypeName}</td>
                      <td className="py-3 px-4 uppercase text-slate-500">{p.ProviderName || 'System'}</td>
                      <td className="py-3 px-4 font-mono font-bold text-emerald-700">+{p.Amount} RUB</td>
                      <td className="py-3 px-4 font-mono text-slate-900">{p.Balance} RUB</td>
                      <td className="py-3 px-4 text-slate-400">{p.CreatedAt?.slice(0, 16)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: CREDENTIALS SETTINGS (PART 1.2) */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs space-y-5">
          <div>
            <h2 className="text-sm font-bold text-slate-900">5SIM API Authentication Credentials (Part 1.2)</h2>
            <p className="text-xs text-slate-500">
              Configure your 5SIM token from 5sim.net settings. All requests use Bearer authentication and standard JSON headers.
            </p>
          </div>

          <div className="space-y-4 max-w-2xl">
            {/* API Base URL */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Official API Base URL</label>
              <input
                type="text"
                value={baseUrlInput}
                onChange={(e) => setBaseUrlInput(e.target.value)}
                placeholder="https://5sim.net/v1"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
              />
            </div>

            {/* API Key */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">5SIM API Token (Bearer)</label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="Paste your 5SIM API token here..."
                  className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                Found under 5sim.net → Profile / Account Settings → API Key. Never expose this key publicly.
              </p>
            </div>

            <div className="pt-2 flex items-center gap-3">
              <button
                type="submit"
                disabled={isSavingSettings}
                className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition shadow-sm disabled:opacity-50"
              >
                {isSavingSettings ? 'Saving...' : 'Save Settings'}
              </button>

              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testingConnection}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${testingConnection ? 'animate-spin' : ''}`} />
                <span>Test Current Credentials</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Modal: Add Price Limit */}
      {isAddPriceOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-sky-600" />
                Configure Service Max Price (Part 3)
              </h3>
              <button onClick={() => setIsAddPriceOpen(false)} className="text-slate-400 hover:text-slate-600">
                ×
              </button>
            </div>

            <form onSubmit={handleSetMaxPrice} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Product / Service Name</label>
                <input
                  type="text"
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  placeholder="e.g. whatsapp, telegram, facebook, google"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500/20"
                  required
                />
                {/* Popular presets */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  {['whatsapp', 'telegram', 'facebook', 'google', 'openai'].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setNewProductName(p)}
                      className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-sky-50 hover:text-sky-700 text-[10px] font-bold text-slate-600 transition"
                    >
                      +{p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Max Purchase Price (RUB)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={newPriceValue}
                  onChange={(e) => setNewPriceValue(parseFloat(e.target.value) || 0)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500/20"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddPriceOpen(false)}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPrice}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl transition shadow-sm disabled:opacity-50"
                >
                  {isSubmittingPrice ? 'Setting Limit...' : 'Save Price Limit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

