import React, { useState, useEffect } from 'react';
import { api } from '../../../services/api';
import {
  MarginRule,
  PricingSettings,
  ProfitReport,
  NumberOrder,
  HiddenItem,
  FiveSimProfile
} from '../../../types';
import {
  Coins,
  Percent,
  Sliders,
  DollarSign,
  TrendingUp,
  ShieldCheck,
  Plus,
  Trash2,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Zap,
  Info,
  Clock,
  ExternalLink,
  Layers,
  ArrowRight,
  Calculator,
  EyeOff,
  Eye,
  SlidersHorizontal
} from 'lucide-react';

export const MarginAdminPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'rules' | 'settings' | 'preview' | 'analytics' | 'hidden'>('rules');

  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Margin data
  const [rules, setRules] = useState<MarginRule[]>([]);
  const [settings, setSettings] = useState<PricingSettings | null>(null);
  const [hiddenItems, setHiddenItems] = useState<HiddenItem[]>([]);
  const [profitReport, setProfitReport] = useState<ProfitReport | null>(null);
  const [profitPeriod, setProfitPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [adminOrders, setAdminOrders] = useState<NumberOrder[]>([]);
  const [adminOrdersTotal, setAdminOrdersTotal] = useState(0);
  const [fiveSimHealth, setFiveSimHealth] = useState<{ profile: FiveSimProfile; isLowBalance: boolean; lowBalanceThreshold: number } | null>(null);

  // Settings form states
  const [fxRateInput, setFxRateInput] = useState<number>(1.0);
  const [minMarginInput, setMinMarginInput] = useState<number>(2.0);
  const [minSellPriceInput, setMinSellPriceInput] = useState<number>(5.0);
  const [roundingModeInput, setRoundingModeInput] = useState<'none' | '2_decimals' | 'nearest_1' | '99_cents'>('2_decimals');
  const [lowBalanceThresholdInput, setLowBalanceThresholdInput] = useState<number>(50.0);
  const [displayCurrencyInput, setDisplayCurrencyInput] = useState<string>('INR');
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Create Rule Modal states
  const [isCreateRuleOpen, setIsCreateRuleOpen] = useState(false);
  const [newScope, setNewScope] = useState<'global' | 'country' | 'product' | 'country_product' | 'country_product_operator'>('global');
  const [newCountry, setNewCountry] = useState('');
  const [newProduct, setNewProduct] = useState('');
  const [newOperator, setNewOperator] = useState('');
  const [newType, setNewType] = useState<'percent' | 'fixed' | 'percent_plus_fixed'>('percent');
  const [newPercentValue, setNewPercentValue] = useState<number>(25);
  const [newFixedValue, setNewFixedValue] = useState<number>(0);
  const [isSubmittingRule, setIsSubmittingRule] = useState(false);

  // Price Preview states
  const [previewCost, setPreviewCost] = useState<number>(15.0);
  const [previewCountry, setPreviewCountry] = useState<string>('england');
  const [previewProduct, setPreviewProduct] = useState<string>('whatsapp');
  const [previewOperator, setPreviewOperator] = useState<string>('any');
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);

  // Hidden item modal
  const [newHiddenType, setNewHiddenType] = useState<'country' | 'product'>('country');
  const [newHiddenValue, setNewHiddenValue] = useState('');

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadRules(),
        loadSettings(),
        loadHiddenItems(),
        loadProfitReport(profitPeriod),
        loadAdminOrders(),
        loadFiveSimHealth()
      ]);
    } catch (err: any) {
      showToast(err.message || 'Failed to load margin management data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadRules = async () => {
    const res = await api.margin.getRules();
    if (res.success) setRules(res.rules);
  };

  const loadSettings = async () => {
    const res = await api.margin.getSettings();
    if (res.success && res.settings) {
      setSettings(res.settings);
      setFxRateInput(res.settings.fx_rate);
      setMinMarginInput(res.settings.min_margin);
      setMinSellPriceInput(res.settings.min_sell_price);
      setRoundingModeInput(res.settings.rounding_mode);
      setLowBalanceThresholdInput(res.settings.low_balance_threshold);
      setDisplayCurrencyInput(res.settings.display_currency);
    }
  };

  const loadHiddenItems = async () => {
    const res = await api.margin.getHiddenItems();
    if (res.success) setHiddenItems(res.items);
  };

  const loadProfitReport = async (period: 'daily' | 'weekly' | 'monthly') => {
    const res = await api.margin.getProfitReport(period);
    if (res.success) setProfitReport(res.report);
  };

  const loadAdminOrders = async () => {
    const res = await api.margin.getOrders({ limit: 50 });
    if (res.success) {
      setAdminOrders(res.orders);
      setAdminOrdersTotal(res.total);
    }
  };

  const loadFiveSimHealth = async () => {
    try {
      const res = await api.margin.getFiveSimBalance();
      if (res.success) setFiveSimHealth(res);
    } catch {}
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      const res = await api.margin.updateSettings({
        fx_rate: Number(fxRateInput),
        min_margin: Number(minMarginInput),
        min_sell_price: Number(minSellPriceInput),
        rounding_mode: roundingModeInput,
        low_balance_threshold: Number(lowBalanceThresholdInput),
        display_currency: displayCurrencyInput
      });

      if (res.success) {
        setSettings(res.settings);
        showToast('Pricing settings saved and applied to all customer orders!', 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to update pricing settings', 'error');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingRule(true);
    try {
      const res = await api.margin.createRule({
        scope: newScope,
        country: newCountry || null,
        product: newProduct || null,
        operator: newOperator || null,
        type: newType,
        percent_value: Number(newPercentValue),
        fixed_value: Number(newFixedValue),
        enabled: true
      });

      if (res.success) {
        showToast('New margin rule established successfully!', 'success');
        setIsCreateRuleOpen(false);
        setNewCountry('');
        setNewProduct('');
        setNewOperator('');
        await loadRules();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to create margin rule', 'error');
    } finally {
      setIsSubmittingRule(false);
    }
  };

  const handleToggleRule = async (rule: MarginRule) => {
    try {
      const res = await api.margin.updateRule(rule.id, { enabled: !rule.enabled });
      if (res.success) {
        showToast(`Rule ${res.rule.enabled ? 'enabled' : 'disabled'} successfully.`, 'info');
        await loadRules();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to toggle rule', 'error');
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm('Are you sure you want to permanently delete this margin rule?')) return;
    try {
      const res = await api.margin.deleteRule(id);
      if (res.success) {
        showToast('Margin rule deleted.', 'success');
        await loadRules();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to delete rule', 'error');
    }
  };

  const handleRunPricePreview = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsPreviewing(true);
    try {
      const res = await api.margin.pricePreview({
        cost: Number(previewCost),
        country: previewCountry || undefined,
        product: previewProduct || undefined,
        operator: previewOperator || undefined
      });
      if (res.success) {
        setPreviewResult(res.preview);
      }
    } catch (err: any) {
      showToast(err.message || 'Preview failed', 'error');
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleAddHiddenItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHiddenValue.trim()) return;
    try {
      const res = await api.margin.addHiddenItem(newHiddenType, newHiddenValue.trim());
      if (res.success) {
        showToast(`Item "${res.item.value}" hidden from customer catalog.`, 'success');
        setNewHiddenValue('');
        await loadHiddenItems();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to hide item', 'error');
    }
  };

  const handleRemoveHiddenItem = async (id: string) => {
    try {
      const res = await api.margin.removeHiddenItem(id);
      if (res.success) {
        showToast('Item unhidden and restored to catalog.', 'info');
        await loadHiddenItems();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to unhide item', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toast && (
        <div
          className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-between shadow-md transition ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : toast.type === 'error'
              ? 'bg-rose-50 border-rose-300 text-rose-900'
              : 'bg-sky-50 border-sky-300 text-sky-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : toast.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-rose-600" />
            ) : (
              <Info className="w-4 h-4 text-sky-600" />
            )}
            <span>{toast.message}</span>
          </div>
          <button onClick={() => setToast(null)} className="text-slate-400 hover:text-slate-600 font-bold px-1">
            ×
          </button>
        </div>
      )}

      {/* 5SIM Remote Balance & Low Balance Alert Banner */}
      {fiveSimHealth && fiveSimHealth.isLowBalance && (
        <div className="bg-rose-50 border border-rose-300 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 text-rose-950">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-200/80 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-rose-700" />
            </div>
            <div>
              <div className="text-xs font-black uppercase tracking-wider text-rose-800">
                🚨 Master 5SIM Account Balance Depleted
              </div>
              <p className="text-xs text-rose-700 font-medium mt-0.5">
                Current 5SIM gateway balance is <strong className="font-bold">{fiveSimHealth.profile.balance.toFixed(2)} RUB</strong> (Threshold: {fiveSimHealth.lowBalanceThreshold} RUB). New customer activations will fail. Please top up your master 5SIM balance immediately.
              </p>
            </div>
          </div>
          <a
            href="https://5sim.net/payment"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 shadow-xs"
          >
            <span>Top Up 5SIM Gateway</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-950 text-white rounded-3xl p-6 shadow-md border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-emerald-400" />
              Margin & Markup Engine
            </span>
            <span className="text-xs text-slate-400 font-mono">Cost + Markup = Customer Sell Price</span>
          </div>

          <h2 className="text-xl font-black tracking-tight flex items-center gap-2.5">
            <Coins className="w-6 h-6 text-sky-400" />
            Virtual Number Pricing & Profit Control Center
          </h2>

          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            Manage granular markup rules (percent, fixed, combined), exchange rates (FX multiplier), profit floors, rounding modes, and catalog visibility across all 5SIM services.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsCreateRuleOpen(true)}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-emerald-600/30"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Margin Rule</span>
          </button>

          <button
            type="button"
            onClick={loadAllData}
            disabled={loading}
            className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition border border-white/10"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Sub Navigation Bar */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('rules')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
            activeTab === 'rules'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Margin Rules Hierarchy ({rules.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
            activeTab === 'settings'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Pricing Settings & FX Rate</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('preview');
            handleRunPricePreview();
          }}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
            activeTab === 'preview'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Calculator className="w-4 h-4" />
          <span>Live Price Preview Tool</span>
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
            activeTab === 'analytics'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Profit & Orders Ledger ({adminOrdersTotal})</span>
        </button>

        <button
          onClick={() => setActiveTab('hidden')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
            activeTab === 'hidden'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <EyeOff className="w-4 h-4" />
          <span>Hidden Items ({hiddenItems.length})</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: MARGIN RULES HIERARCHY */}
      {/* ========================================================================= */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          {/* Priority Explanation Card */}
          <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 text-xs text-sky-950 flex items-start gap-3">
            <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
            <div>
              <strong className="font-bold">Strict 5-Level Resolution Priority:</strong>
              <p className="mt-0.5 text-sky-800">
                1. <strong>Country + Product + Operator</strong> &gt; 2. <strong>Country + Product</strong> &gt; 3. <strong>Product</strong> &gt; 4. <strong>Country</strong> &gt; 5. <strong>Global Default</strong>. A more specific rule always overrides broader scopes.
              </p>
            </div>
          </div>

          {/* Rules Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Priority / Scope</th>
                    <th className="py-3 px-4">Country Target</th>
                    <th className="py-3 px-4">Product Target</th>
                    <th className="py-3 px-4">Operator</th>
                    <th className="py-3 px-4">Markup Model</th>
                    <th className="py-3 px-4">Configured Value</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                  {rules.map((rule, idx) => (
                    <tr key={rule.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full font-mono font-bold text-[10px] uppercase ${
                            rule.scope === 'country_product_operator'
                              ? 'bg-purple-100 text-purple-800 border border-purple-200'
                              : rule.scope === 'country_product'
                              ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                              : rule.scope === 'product'
                              ? 'bg-sky-100 text-sky-800 border border-sky-200'
                              : rule.scope === 'country'
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          {rule.scope}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold capitalize">{rule.country || 'Any Country'}</td>
                      <td className="py-3 px-4 font-bold capitalize">{rule.product || 'Any Service'}</td>
                      <td className="py-3 px-4 font-mono">{rule.operator || 'Any Operator'}</td>
                      <td className="py-3 px-4 capitalize font-semibold">{rule.type.replace(/_/g, ' ')}</td>
                      <td className="py-3 px-4 font-mono font-black text-slate-900">
                        {rule.type === 'percent'
                          ? `+${rule.percent_value}%`
                          : rule.type === 'fixed'
                          ? `+${settings?.display_currency || 'INR'} ${rule.fixed_value}`
                          : `+${rule.percent_value}% and +${settings?.display_currency || 'INR'} ${rule.fixed_value}`}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => handleToggleRule(rule)}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition ${
                            rule.enabled
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          {rule.enabled ? 'Active' : 'Disabled'}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {rule.scope !== 'global' && (
                          <button
                            type="button"
                            onClick={() => handleDeleteRule(rule.id)}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="Delete Rule"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: PRICING SETTINGS FORM */}
      {/* ========================================================================= */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs space-y-6">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-black text-slate-900">Global Pricing Parameters (Part A3 & C)</h3>
            <p className="text-xs text-slate-500">
              Configure currency exchange rate multipliers, floor profit margins, minimum sell prices, and rounding styles.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5 max-w-4xl">
            {/* FX Exchange Multiplier */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                Currency Exchange Rate (FX Multiplier)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={fxRateInput}
                onChange={(e) => setFxRateInput(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500/20"
                required
              />
              <p className="text-[11px] text-slate-400">
                1 RUB from 5SIM = {fxRateInput} {displayCurrencyInput}. Adjust to track market rates.
              </p>
            </div>

            {/* Minimum Margin Floor */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                Minimum Profit Margin ({displayCurrencyInput})
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={minMarginInput}
                onChange={(e) => setMinMarginInput(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500/20"
                required
              />
              <p className="text-[11px] text-slate-400">
                Guaranteed minimum profit per number, even if percentages yield less.
              </p>
            </div>

            {/* Minimum Sell Price Floor */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                Floor Sell Price ({displayCurrencyInput})
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={minSellPriceInput}
                onChange={(e) => setMinSellPriceInput(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500/20"
                required
              />
              <p className="text-[11px] text-slate-400">
                No number will ever be priced cheaper than this floor.
              </p>
            </div>

            {/* Rounding Mode */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">Rounding Algorithm</label>
              <select
                value={roundingModeInput}
                onChange={(e) => setRoundingModeInput(e.target.value as any)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500/20"
              >
                <option value="none">None (Exact decimal float)</option>
                <option value="2_decimals">Standard 2 Decimals (e.g. 15.45)</option>
                <option value="nearest_1">Round Up to Nearest Integer (e.g. 16.00)</option>
                <option value="99_cents">.99 Psychological Pricing (e.g. 15.99)</option>
              </select>
              <p className="text-[11px] text-slate-400">Controls how final customer prices are rendered.</p>
            </div>

            {/* Low Balance Alert Threshold */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">5SIM Low Balance Warning (RUB)</label>
              <input
                type="number"
                step="5"
                min="0"
                value={lowBalanceThresholdInput}
                onChange={(e) => setLowBalanceThresholdInput(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500/20"
                required
              />
              <p className="text-[11px] text-slate-400">Triggers admin red banner when 5SIM balance drops below this.</p>
            </div>

            {/* Display Currency */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">Display Currency Code</label>
              <input
                type="text"
                value={displayCurrencyInput}
                onChange={(e) => setDisplayCurrencyInput(e.target.value.toUpperCase())}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500/20"
                required
              />
              <p className="text-[11px] text-slate-400">e.g. INR (₹), USD ($), EUR (€).</p>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSavingSettings}
              className="px-6 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-50"
            >
              {isSavingSettings ? 'Saving Settings...' : 'Save Pricing Parameters'}
            </button>
          </div>
        </form>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: LIVE PRICE PREVIEW TOOL */}
      {/* ========================================================================= */}
      {activeTab === 'preview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Input Form */}
          <form onSubmit={handleRunPricePreview} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs space-y-4">
            <div>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Calculator className="w-4 h-4 text-sky-600" />
                Live Price & Profit Calculator (Part A3 & F)
              </h3>
              <p className="text-xs text-slate-500">
                Input a base 5SIM cost and test which margin rule is resolved, verifying floors, exchange rates, and final customer sell price.
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">5SIM Base Cost in RUB</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={previewCost}
                  onChange={(e) => setPreviewCost(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500/20"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Country Slug</label>
                <input
                  type="text"
                  value={previewCountry}
                  onChange={(e) => setPreviewCountry(e.target.value)}
                  placeholder="e.g. england, usa, russia"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500/20"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Service Slug</label>
                <input
                  type="text"
                  value={previewProduct}
                  onChange={(e) => setPreviewProduct(e.target.value)}
                  placeholder="e.g. whatsapp, telegram, google"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500/20"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Operator Slug</label>
                <input
                  type="text"
                  value={previewOperator}
                  onChange={(e) => setPreviewOperator(e.target.value)}
                  placeholder="e.g. vodafone, virtual59, any"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500/20"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isPreviewing}
              className="w-full py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isPreviewing ? 'Calculating...' : 'Evaluate Price & Margin'}</span>
            </button>
          </form>

          {/* Right: Calculated Price Result */}
          <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 text-white rounded-3xl p-6 shadow-md border border-slate-800 space-y-5 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="border-b border-white/10 pb-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-sky-400">Calculation Output</span>
                <h3 className="text-base font-black text-white mt-0.5">Price & Profit Breakdown</h3>
              </div>

              {previewResult ? (
                <div className="space-y-3 text-xs">
                  <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
                    <span className="text-slate-400">Matched Rule Scope:</span>
                    <span className="px-2 py-0.5 rounded-full font-mono font-bold text-[10px] uppercase bg-sky-500/20 text-sky-300 border border-sky-400/30">
                      {previewResult.matchedScope}
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Applied Formula</span>
                    <span className="font-mono text-xs text-sky-200">{previewResult.formula}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">Converted Cost</span>
                      <span className="font-mono font-black text-base text-slate-200">
                        {previewResult.displayCurrency} {previewResult.costPrice.toFixed(2)}
                      </span>
                    </div>

                    <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">Customer Sell Price</span>
                      <span className="font-mono font-black text-base text-emerald-400">
                        {previewResult.displayCurrency} {previewResult.sellPrice.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-emerald-300 uppercase block">Expected Net Profit</span>
                      <span className="font-mono font-black text-lg text-emerald-400">
                        +{previewResult.displayCurrency} {previewResult.profit.toFixed(2)}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-emerald-300 bg-emerald-500/20 px-2.5 py-1 rounded-xl">
                      {previewResult.costPrice > 0 ? `${((previewResult.profit / previewResult.costPrice) * 100).toFixed(1)}% ROI` : '100%'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-slate-400">
                  Click "Evaluate Price & Margin" to run live resolution.
                </div>
              )}
            </div>

            <div className="text-[11px] text-slate-400 pt-2 border-t border-white/10">
              Customers never see cost price or profit. Only the customer sell price is exposed on public APIs.
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: PROFIT ANALYTICS & AUDIT LEDGER */}
      {/* ========================================================================= */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          {profitReport?.summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-3xl bg-white border border-slate-200 shadow-2xs space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Customer Revenue</span>
                <div className="text-xl font-black font-mono text-slate-900">
                  {settings?.display_currency || 'INR'} {profitReport.summary.totalRevenue.toFixed(2)}
                </div>
              </div>

              <div className="p-4 rounded-3xl bg-white border border-slate-200 shadow-2xs space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">5SIM Telecom Cost</span>
                <div className="text-xl font-black font-mono text-rose-600">
                  {settings?.display_currency || 'INR'} {profitReport.summary.totalCost.toFixed(2)}
                </div>
              </div>

              <div className="p-4 rounded-3xl bg-emerald-50/70 border border-emerald-200 shadow-2xs space-y-1">
                <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">Net Profit Earned</span>
                <div className="text-xl font-black font-mono text-emerald-600">
                  +{settings?.display_currency || 'INR'} {profitReport.summary.netProfit.toFixed(2)}
                </div>
              </div>

              <div className="p-4 rounded-3xl bg-white border border-slate-200 shadow-2xs space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Completed Orders</span>
                <div className="text-xl font-black font-mono text-sky-700">
                  {profitReport.summary.ordersCount} ({profitReport.summary.successRatePercent}% delivery)
                </div>
              </div>
            </div>
          )}

          {/* Orders Audit Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-black text-slate-900">All Virtual Number Orders Ledger ({adminOrdersTotal})</h3>
                <p className="text-xs text-slate-500">Includes customer identity, wholesale cost, retail sell price, and exact profit earned.</p>
              </div>

              <button
                type="button"
                onClick={loadAdminOrders}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh Ledger</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase text-[10px]">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">User</th>
                    <th className="py-2.5 px-3">Platform</th>
                    <th className="py-2.5 px-3">Country</th>
                    <th className="py-2.5 px-3">Number</th>
                    <th className="py-2.5 px-3">Wholesale Cost</th>
                    <th className="py-2.5 px-3">Sell Price</th>
                    <th className="py-2.5 px-3">Net Profit</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                  {adminOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-500">
                        {new Date(order.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="py-3 px-3 font-bold text-slate-900">
                        {order.user_email || order.user_name || order.user_id}
                      </td>
                      <td className="py-3 px-3 font-bold uppercase">{order.product}</td>
                      <td className="py-3 px-3 capitalize">{order.country}</td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-900">{order.phone || '---'}</td>
                      <td className="py-3 px-3 font-mono text-rose-600 font-bold">
                        {order.currency === 'INR' ? '₹' : order.currency} {(order.cost_price || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-900 font-bold">
                        {order.currency === 'INR' ? '₹' : order.currency} {order.sell_price.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 font-mono text-emerald-600 font-black">
                        +{order.currency === 'INR' ? '₹' : order.currency} {(order.profit || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            order.status === 'FINISHED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : order.status === 'RECEIVED'
                              ? 'bg-sky-100 text-sky-800'
                              : order.status === 'PENDING'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {order.status}
                          {order.refunded && ' (Refunded)'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: HIDDEN / DISABLED CATALOG ITEMS */}
      {/* ========================================================================= */}
      {activeTab === 'hidden' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs space-y-5">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <EyeOff className="w-4 h-4 text-rose-600" />
              Hidden / Disabled Catalog Items (Part A3 & F)
            </h3>
            <p className="text-xs text-slate-500">
              Countries or services added here will be immediately hidden from the public customer purchase page.
            </p>
          </div>

          {/* Add Hidden Item Form */}
          <form onSubmit={handleAddHiddenItem} className="flex flex-col sm:flex-row items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <select
              value={newHiddenType}
              onChange={(e) => setNewHiddenType(e.target.value as any)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden"
            >
              <option value="country">Country</option>
              <option value="product">Service / Product</option>
            </select>

            <input
              type="text"
              value={newHiddenValue}
              onChange={(e) => setNewHiddenValue(e.target.value)}
              placeholder="Slug to hide (e.g. russia, tiktok)..."
              className="flex-1 px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800 placeholder:text-slate-400 focus:outline-hidden"
              required
            />

            <button
              type="submit"
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-xs"
            >
              <EyeOff className="w-3.5 h-3.5" />
              <span>Hide Item</span>
            </button>
          </form>

          {/* List of Hidden Items */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Target Slug</th>
                  <th className="py-2.5 px-3">Added Date</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                {hiddenItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-2.5 px-3 font-bold capitalize">{item.type}</td>
                    <td className="py-2.5 px-3 font-mono font-bold text-rose-700">{item.value}</td>
                    <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">
                      {new Date(item.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemoveHiddenItem(item.id)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition flex items-center gap-1 ml-auto"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Unhide</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CREATE MARGIN RULE */}
      {/* ========================================================================= */}
      {isCreateRuleOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Coins className="w-5 h-5 text-sky-600" />
                <h3 className="text-base font-black text-slate-900">Create Margin Rule</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateRuleOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateRule} className="space-y-4">
              {/* Scope Selector */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Priority Level & Scope</label>
                <select
                  value={newScope}
                  onChange={(e) => setNewScope(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-hidden"
                >
                  <option value="global">5. Global Default (Base fallback)</option>
                  <option value="country">4. Country Specific (Overrides Global)</option>
                  <option value="product">3. Service / Product Specific (Overrides Country)</option>
                  <option value="country_product">2. Country + Product Specific (Overrides Product)</option>
                  <option value="country_product_operator">1. Country + Product + Operator (Highest Priority)</option>
                </select>
              </div>

              {/* Conditional Country Input */}
              {(newScope === 'country' || newScope === 'country_product' || newScope === 'country_product_operator') && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Country Slug</label>
                  <input
                    type="text"
                    value={newCountry}
                    onChange={(e) => setNewCountry(e.target.value)}
                    placeholder="e.g. england, usa, india"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:bg-white focus:outline-hidden"
                    required
                  />
                </div>
              )}

              {/* Conditional Product Input */}
              {(newScope === 'product' || newScope === 'country_product' || newScope === 'country_product_operator') && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Product / Service Slug</label>
                  <input
                    type="text"
                    value={newProduct}
                    onChange={(e) => setNewProduct(e.target.value)}
                    placeholder="e.g. whatsapp, telegram, openai"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:bg-white focus:outline-hidden"
                    required
                  />
                </div>
              )}

              {/* Conditional Operator Input */}
              {newScope === 'country_product_operator' && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Operator Slug</label>
                  <input
                    type="text"
                    value={newOperator}
                    onChange={(e) => setNewOperator(e.target.value)}
                    placeholder="e.g. vodafone, virtual59"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:bg-white focus:outline-hidden"
                    required
                  />
                </div>
              )}

              {/* Margin Type */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Margin Calculation Type</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setNewType('percent')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition border ${
                      newType === 'percent'
                        ? 'bg-sky-600 text-white border-sky-600 shadow-2xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    Percent (%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewType('fixed')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition border ${
                      newType === 'fixed'
                        ? 'bg-sky-600 text-white border-sky-600 shadow-2xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    Fixed ({settings?.display_currency || 'INR'})
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewType('percent_plus_fixed')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition border ${
                      newType === 'percent_plus_fixed'
                        ? 'bg-sky-600 text-white border-sky-600 shadow-2xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    Both (% + Fixed)
                  </button>
                </div>
              </div>

              {/* Value Fields */}
              <div className="grid grid-cols-2 gap-3">
                {(newType === 'percent' || newType === 'percent_plus_fixed') && (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Percent Value (%)</label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={newPercentValue}
                      onChange={(e) => setNewPercentValue(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:outline-hidden"
                      required
                    />
                  </div>
                )}

                {(newType === 'fixed' || newType === 'percent_plus_fixed') && (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Fixed Amount ({settings?.display_currency || 'INR'})</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={newFixedValue}
                      onChange={(e) => setNewFixedValue(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:outline-hidden"
                      required
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsCreateRuleOpen(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRule}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-50"
                >
                  {isSubmittingRule ? 'Saving Rule...' : 'Establish Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

