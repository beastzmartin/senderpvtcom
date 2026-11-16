import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { useCurrency } from '../../context/CurrencyContext';
import {
  DollarSign,
  TrendingUp,
  Sliders,
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Plus,
  RefreshCw,
  Search,
  Filter,
  BarChart2,
  Layers,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Check,
  Clock,
  Eye,
  Percent,
  Tag,
  Grid,
  History,
  FileText,
  Trash2,
  Edit2
} from 'lucide-react';

interface MarginRuleV3 {
  id: string;
  name: string;
  priority: number;
  scope: 'global' | 'category' | 'product' | 'pricing_model';
  target_id: string | null;
  rule_type: 'percent' | 'fixed' | 'percent_plus_fixed' | 'multiplier';
  percent_value: number;
  fixed_value: number;
  multiplier_value: number;
  tier_mode: 'flat' | 'marginal' | 'cliff';
  volume_tiers: Array<{ min_items: number; max_items: number; percent: number; fixed: number }>;
  customer_plan_discounts: Record<string, number>;
  min_margin_percent: number;
  min_sell_price: number;
  maker_checker_status: 'approved' | 'pending_approval' | 'rejected';
  maker_checker_threshold_min: number;
  approved_by?: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface CouponRecord {
  id: string;
  code: string;
  description?: string;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  max_discount_amount?: number;
  min_order_amount: number;
  max_uses: number;
  current_uses: number;
  starts_at?: string;
  expires_at?: string;
  enabled: boolean;
}

interface WaterfallStep {
  step: number;
  name: string;
  description: string;
  deltaUsd: number;
  runningTotalUsd: number;
  deltaConverted: number;
  runningTotalConverted: number;
}

interface WaterfallQuote {
  quoteId: string;
  productSlug: string;
  requestedItems: number;
  currency: string;
  currencySymbol: string;
  exchangeRate: number;
  rawProviderCostUsd: number;
  overheadCostUsd: number;
  fxBufferUsd: number;
  loadedCostUsd: number;
  loadedCostConverted: number;
  baseMarginAmountUsd: number;
  volumeTierApplied: string | null;
  planDiscountPercent: number;
  planDiscountUsd: number;
  couponApplied: any | null;
  floorApplied: boolean;
  floorReason?: string;
  finalSellPriceUsd: number;
  finalSellPrice: number;
  profitUsd: number;
  profitConverted: number;
  profitMarginPercent: number;
  waterfall: WaterfallStep[];
}

export const MarginStudioTab: React.FC = () => {
  const { currencies, currencyCode } = useCurrency();
  const [activeSection, setActiveSection] = useState<'rules' | 'waterfall' | 'heatmap' | 'replay' | 'kpis' | 'coupons'>('rules');

  // Rules state
  const [rules, setRules] = useState<MarginRuleV3[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [editingRule, setEditingRule] = useState<Partial<MarginRuleV3> | null>(null);
  const [showRuleModal, setShowRuleModal] = useState(false);

  // Products list for simulators
  const [products, setProducts] = useState<any[]>([]);

  // Waterfall Simulator state
  const [simProductSlug, setSimProductSlug] = useState<string>('');
  const [simItems, setSimItems] = useState<number>(1000);
  const [simCurrency, setSimCurrency] = useState<string>(currencyCode || 'INR');
  const [simPlan, setSimPlan] = useState<string>('starter');
  const [simCoupon, setSimCoupon] = useState<string>('');
  const [simOverhead, setSimOverhead] = useState<string>('');
  const [simFxBuffer, setSimFxBuffer] = useState<string>('');
  const [simQuote, setSimQuote] = useState<WaterfallQuote | null>(null);
  const [simLoading, setSimLoading] = useState(false);

  // Heatmap Matrix state
  const [matrixProductSlug, setMatrixProductSlug] = useState<string>('');
  const [matrixData, setMatrixData] = useState<any | null>(null);
  const [matrixLoading, setMatrixLoading] = useState(false);

  // Historical Replay state
  const [replayDays, setReplayDays] = useState<number>(30);
  const [replayResult, setReplayResult] = useState<any | null>(null);
  const [replayLoading, setReplayLoading] = useState(false);

  // KPIs & Analytics state
  const [kpis, setKpis] = useState<any | null>(null);
  const [loadingKpis, setLoadingKpis] = useState(false);

  // Coupons state
  const [coupons, setCoupons] = useState<CouponRecord[]>([]);
  const [editingCoupon, setEditingCoupon] = useState<Partial<CouponRecord> | null>(null);
  const [showCouponModal, setShowCouponModal] = useState(false);

  // Load initial data
  useEffect(() => {
    loadRules();
    loadProducts();
    loadKpis();
    loadCoupons();
  }, []);

  const loadRules = async () => {
    setLoadingRules(true);
    try {
      const res = await api.get('/api/marketplace/admin/margin-studio/rules');
      setRules(res.data.rules || []);
    } catch (err) {
      console.error('Failed to load margin rules:', err);
    } finally {
      setLoadingRules(false);
    }
  };

  const loadProducts = async () => {
    try {
      const res = await api.get('/api/marketplace/products');
      const list = res.data.products || res.data || [];
      setProducts(list);
      if (list.length > 0 && !simProductSlug) {
        setSimProductSlug(list[0].slug);
        setMatrixProductSlug(list[0].slug);
      }
    } catch {}
  };

  const loadKpis = async () => {
    setLoadingKpis(true);
    try {
      const res = await api.get('/api/marketplace/admin/margin-studio/kpis');
      setKpis(res.data);
    } catch (err) {
      console.error('Failed to load KPIs:', err);
    } finally {
      setLoadingKpis(false);
    }
  };

  const loadCoupons = async () => {
    try {
      const res = await api.get('/api/marketplace/admin/margin-studio/coupons');
      setCoupons(res.data.coupons || []);
    } catch {}
  };

  const handleRunWaterfall = async () => {
    if (!simProductSlug) return;
    setSimLoading(true);
    try {
      const res = await api.post('/api/marketplace/admin/margin-studio/simulate-waterfall', {
        productSlug: simProductSlug,
        requestedItems: simItems,
        currency: simCurrency,
        customerPlan: simPlan,
        couponCode: simCoupon || undefined,
        customOverheadUsd: simOverhead ? Number(simOverhead) : undefined,
        customFxBufferPct: simFxBuffer ? Number(simFxBuffer) : undefined
      });
      setSimQuote(res.data);
    } catch (err) {
      console.error('Failed to run waterfall simulation:', err);
    } finally {
      setSimLoading(false);
    }
  };

  const handleRunMatrix = async () => {
    if (!matrixProductSlug) return;
    setMatrixLoading(true);
    try {
      const res = await api.post('/api/marketplace/admin/margin-studio/matrix-simulator', {
        productSlug: matrixProductSlug
      });
      setMatrixData(res.data);
    } catch (err) {
      console.error('Failed to run matrix simulator:', err);
    } finally {
      setMatrixLoading(false);
    }
  };

  const handleRunReplay = async () => {
    setReplayLoading(true);
    try {
      const res = await api.post('/api/marketplace/admin/margin-studio/historical-replay', {
        days: replayDays
      });
      setReplayResult(res.data);
    } catch (err) {
      console.error('Failed to run historical replay:', err);
    } finally {
      setReplayLoading(false);
    }
  };

  const handleApproveRule = async (ruleId: string) => {
    try {
      await api.post(`/api/marketplace/admin/margin-studio/rules/${ruleId}/approve`);
      await loadRules();
    } catch (err: any) {
      alert(err.response?.data?.error || err.message);
    }
  };

  const handleRejectRule = async (ruleId: string) => {
    try {
      await api.post(`/api/marketplace/admin/margin-studio/rules/${ruleId}/reject`);
      await loadRules();
    } catch (err: any) {
      alert(err.response?.data?.error || err.message);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm('Are you sure you want to delete this margin rule?')) return;
    try {
      await api.delete(`/api/marketplace/admin/margin-studio/rules/${ruleId}`);
      await loadRules();
    } catch (err: any) {
      alert(err.response?.data?.error || err.message);
    }
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRule) return;

    try {
      if (editingRule.id) {
        await api.put(`/api/marketplace/admin/margin-studio/rules/${editingRule.id}`, editingRule);
      } else {
        await api.post('/api/marketplace/admin/margin-studio/rules', editingRule);
      }
      setShowRuleModal(false);
      setEditingRule(null);
      await loadRules();
    } catch (err: any) {
      alert(err.response?.data?.error || err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-900/40 via-teal-900/30 to-slate-900/40 border border-emerald-500/30 rounded-2xl p-6 backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-500/20 rounded-xl text-emerald-400 border border-emerald-500/30">
              <Sliders className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                Advanced Margin Studio & Costing Engine
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                  v3 Sovereign
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Fully loaded costing (Vendor USD + Overhead + FX Buffer), deterministic rule hierarchies, hard floors, and parity waterfall simulators.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setEditingRule({
                  name: '',
                  priority: 100,
                  scope: 'global',
                  rule_type: 'percent',
                  percent_value: 35.0,
                  fixed_value: 0,
                  tier_mode: 'marginal',
                  min_margin_percent: 15.0,
                  min_sell_price: 0.50,
                  volume_tiers: [
                    { min_items: 0, max_items: 1000, percent: 35, fixed: 0 },
                    { min_items: 1001, max_items: 5000, percent: 30, fixed: 0 },
                    { min_items: 5001, max_items: 999999, percent: 25, fixed: 0 }
                  ],
                  customer_plan_discounts: { enterprise: 10, pro: 5 },
                  enabled: true
                });
                setShowRuleModal(true);
              }}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-emerald-900/30 transition"
            >
              <Plus className="w-4 h-4" />
              New Margin Rule
            </button>
          </div>
        </div>

        {/* Studio Sub-Navigation Bar */}
        <div className="flex items-center gap-1 mt-6 border-b border-slate-700/60 pb-1 overflow-x-auto">
          {[
            { id: 'rules', label: 'Rule Board', icon: Sliders },
            { id: 'waterfall', label: 'Waterfall Simulator', icon: BarChart2 },
            { id: 'heatmap', label: 'Matrix Heatmap', icon: Grid },
            { id: 'replay', label: 'Historical Replay', icon: History },
            { id: 'kpis', label: 'Profit KPIs & Traces', icon: TrendingUp },
            { id: 'coupons', label: 'Promo Codes', icon: Tag }
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeSection === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveSection(tab.id as any);
                  if (tab.id === 'waterfall' && !simQuote) handleRunWaterfall();
                  if (tab.id === 'heatmap' && !matrixData) handleRunMatrix();
                }}
                className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition whitespace-nowrap ${
                  active
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* SECTION 1: RULE BOARD */}
      {activeSection === 'rules' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">Configured Margin Rules</h2>
              <p className="text-xs text-slate-400">
                Evaluated deterministically in order of priority (Product &gt; Category &gt; Pricing Model &gt; Global).
              </p>
            </div>
            <button
              onClick={loadRules}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs flex items-center gap-1 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingRules ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Priority</th>
                    <th className="py-3 px-4 font-semibold">Rule Name</th>
                    <th className="py-3 px-4 font-semibold">Scope & Target</th>
                    <th className="py-3 px-4 font-semibold">Type & Value</th>
                    <th className="py-3 px-4 font-semibold">Volume Mode</th>
                    <th className="py-3 px-4 font-semibold">Floors</th>
                    <th className="py-3 px-4 font-semibold">Approval Status</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {rules.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500">
                        No margin rules configured. Click "New Margin Rule" above to create one.
                      </td>
                    </tr>
                  ) : (
                    rules.map((rule) => {
                      const isPending = rule.maker_checker_status === 'pending_approval';
                      return (
                        <tr key={rule.id} className="hover:bg-slate-800/40 transition">
                          <td className="py-3 px-4 font-mono text-slate-300 font-bold">
                            #{rule.priority}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-white">{rule.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{rule.id}</div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-slate-800 text-slate-300 border border-slate-700">
                              {rule.scope}
                            </span>
                            {rule.target_id && (
                              <span className="ml-1 text-[11px] text-emerald-400 font-mono">
                                {rule.target_id}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-semibold text-emerald-400 font-mono">
                              {rule.percent_value}%
                            </span>
                            {rule.fixed_value > 0 && (
                              <span className="text-slate-400 ml-1 font-mono">
                                + ${rule.fixed_value.toFixed(2)}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span className="capitalize text-slate-300">
                              {rule.tier_mode}
                            </span>
                            {rule.volume_tiers && rule.volume_tiers.length > 0 && (
                              <span className="text-[10px] text-slate-500 block">
                                {rule.volume_tiers.length} tiers configured
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-[11px] text-slate-300 font-mono">
                              Min: {rule.min_margin_percent}% | ${rule.min_sell_price}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {isPending ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                <Clock className="w-3 h-3" />
                                Review Required (&lt;{rule.maker_checker_threshold_min}%)
                              </span>
                            ) : rule.maker_checker_status === 'approved' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                <CheckCircle className="w-3 h-3" />
                                Approved
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/20 text-red-300 border border-red-500/30">
                                <XCircle className="w-3 h-3" />
                                Rejected
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {isPending && (
                                <>
                                  <button
                                    onClick={() => handleApproveRule(rule.id)}
                                    title="Approve sub-threshold rule"
                                    className="p-1 px-2 bg-emerald-600/30 hover:bg-emerald-600 text-emerald-300 hover:text-white rounded text-[11px] font-medium transition"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleRejectRule(rule.id)}
                                    title="Reject rule"
                                    className="p-1 px-2 bg-red-600/30 hover:bg-red-600 text-red-300 hover:text-white rounded text-[11px] font-medium transition"
                                  >
                                    Reject
                                  </button>
                                </>
                              )}
                              <button
                                onClick={() => {
                                  setEditingRule(rule);
                                  setShowRuleModal(true);
                                }}
                                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded transition"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteRule(rule.id)}
                                className="p-1.5 hover:bg-red-950 text-red-400 hover:text-red-300 rounded transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: INTERACTIVE WATERFALL SIMULATOR */}
      {activeSection === 'waterfall' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 backdrop-blur-md">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-emerald-400" />
              Waterfall Simulation Parameters
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1">Target Product</label>
                <select
                  value={simProductSlug}
                  onChange={(e) => setSimProductSlug(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  {products.map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {p.display_name} ({p.slug})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1">Requested Items</label>
                <input
                  type="number"
                  min="1"
                  step="50"
                  value={simItems}
                  onChange={(e) => setSimItems(Math.max(1, Number(e.target.value)))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1">Target Currency</label>
                <select
                  value={simCurrency}
                  onChange={(e) => setSimCurrency(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                >
                  {currencies.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} - {c.symbol} ({c.name})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1">Customer Plan</label>
                <select
                  value={simPlan}
                  onChange={(e) => setSimPlan(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 capitalize"
                >
                  <option value="starter">Starter / Free</option>
                  <option value="pro">Pro (5% Margin Discount)</option>
                  <option value="enterprise">Enterprise (10% Margin Discount)</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1">Promo Coupon Code</label>
                <input
                  type="text"
                  placeholder="e.g. WELCOME20"
                  value={simCoupon}
                  onChange={(e) => setSimCoupon(e.target.value.toUpperCase())}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white uppercase font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1">Overhead Override ($)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Default (4% or $0.02)"
                  value={simOverhead}
                  onChange={(e) => setSimOverhead(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1">FX Buffer Override (%)</label>
                <input
                  type="number"
                  step="0.5"
                  placeholder="Default (1.5%)"
                  value={simFxBuffer}
                  onChange={(e) => setSimFxBuffer(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-end">
                <button
                  onClick={handleRunWaterfall}
                  disabled={simLoading}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-md transition flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${simLoading ? 'animate-spin' : ''}`} />
                  Recalculate Waterfall
                </button>
              </div>
            </div>
          </div>

          {/* Waterfall Visualizer */}
          {simQuote && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left 2 Cols: Step-by-Step Waterfall List */}
              <div className="lg:col-span-2 space-y-4">
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-white mb-3 flex items-center justify-between">
                    <span>Deterministic Pricing Steps</span>
                    <span className="text-xs font-mono text-emerald-400 font-normal">
                      1 USD = {simQuote.exchangeRate.toFixed(2)} {simQuote.currency}
                    </span>
                  </h3>

                  <div className="space-y-3">
                    {simQuote.waterfall.map((step) => {
                      const isAddition = step.deltaUsd > 0;
                      const isDeduction = step.deltaUsd < 0;
                      return (
                        <div
                          key={step.step}
                          className="flex items-start justify-between p-3 rounded-lg bg-slate-950/60 border border-slate-800/80"
                        >
                          <div className="flex items-start gap-3">
                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-800 text-[11px] font-mono text-slate-300 font-bold shrink-0">
                              {step.step}
                            </span>
                            <div>
                              <div className="text-xs font-semibold text-white flex items-center gap-2">
                                {step.name}
                                {step.name.includes('Floor') && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                    Clamped
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 mt-0.5">{step.description}</div>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div
                              className={`text-xs font-mono font-bold ${
                                isAddition ? 'text-emerald-400' : isDeduction ? 'text-purple-400' : 'text-slate-300'
                              }`}
                            >
                              {isAddition ? '+' : ''}${step.deltaUsd.toFixed(4)}
                              <span className="text-[10px] font-normal text-slate-400 ml-1">
                                ({isAddition ? '+' : ''}{simQuote.currencySymbol}{step.deltaConverted.toFixed(2)})
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                              Cumulative: {simQuote.currencySymbol}{step.runningTotalConverted.toFixed(2)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right Col: Quote Card & Financial Metrics */}
              <div className="space-y-4">
                <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-emerald-500/30 rounded-xl p-5 shadow-xl">
                  <div className="text-xs text-emerald-400 font-semibold uppercase tracking-wider mb-1">
                    Customer Final Sell Price
                  </div>
                  <div className="text-3xl font-extrabold text-white font-mono flex items-baseline gap-1">
                    <span>{simQuote.currencySymbol}{simQuote.finalSellPrice.toFixed(2)}</span>
                    <span className="text-xs font-normal text-slate-400 uppercase">{simQuote.currency}</span>
                  </div>
                  <div className="text-xs text-slate-400 font-mono mt-1">
                    Equivalent: ${simQuote.finalSellPriceUsd.toFixed(4)} USD
                  </div>

                  <div className="mt-6 pt-5 border-t border-slate-800 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Upstream Raw Vendor Cost:</span>
                      <span className="text-slate-200 font-mono font-semibold">${simQuote.rawProviderCostUsd.toFixed(4)}</span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Fully Loaded Cost:</span>
                      <span className="text-slate-200 font-mono font-semibold">
                        {simQuote.currencySymbol}{simQuote.loadedCostConverted.toFixed(2)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Gross Margin Percent:</span>
                      <span className="text-emerald-400 font-mono font-bold text-sm">
                        {simQuote.profitMarginPercent}%
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Platform Net Profit:</span>
                      <span className="text-emerald-400 font-mono font-bold">
                        {simQuote.currencySymbol}{simQuote.profitConverted.toFixed(2)}
                      </span>
                    </div>

                    {simQuote.floorApplied && (
                      <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px]">
                        <ShieldCheck className="w-3.5 h-3.5 inline mr-1" />
                        {simQuote.floorReason}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION 3: MATRIX HEATMAP */}
      {activeSection === 'heatmap' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">Multi-Currency & Volume Heatmap</h2>
              <p className="text-xs text-slate-400">
                Live pricing matrix across volume tiers and enabled global currencies.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={matrixProductSlug}
                onChange={(e) => {
                  setMatrixProductSlug(e.target.value);
                }}
                className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white"
              >
                {products.map((p) => (
                  <option key={p.slug} value={p.slug}>{p.display_name}</option>
                ))}
              </select>

              <button
                onClick={handleRunMatrix}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${matrixLoading ? 'animate-spin' : ''}`} />
                Generate Matrix
              </button>
            </div>
          </div>

          {matrixData && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-x-auto p-4">
              <table className="w-full text-center text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2.5 px-3 text-left font-semibold">Currency</th>
                    {matrixData.volumes.map((v: number) => (
                      <th key={v} className="py-2.5 px-3 font-semibold">
                        {v.toLocaleString()} items
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 font-mono">
                  {matrixData.currencies.map((curr: string) => (
                    <tr key={curr} className="hover:bg-slate-800/30">
                      <td className="py-3 px-3 text-left font-bold text-white font-sans">{curr}</td>
                      {matrixData.volumes.map((vol: number) => {
                        const cell = matrixData.matrix[curr]?.[vol];
                        if (!cell) return <td key={vol} className="py-3 px-3 text-slate-600">-</td>;
                        const pct = cell.marginPct;
                        const heatClass = pct >= 35
                          ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/20'
                          : pct >= 25
                            ? 'bg-teal-950/50 text-teal-300 border-teal-500/20'
                            : pct >= 15
                              ? 'bg-amber-950/50 text-amber-300 border-amber-500/20'
                              : 'bg-red-950/50 text-red-300 border-red-500/20';

                        return (
                          <td key={vol} className="py-2 px-2">
                            <div className={`p-2 rounded-lg border ${heatClass}`}>
                              <div className="font-bold text-xs">{cell.sellPrice}</div>
                              <div className="text-[10px] opacity-80">{pct}% margin</div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SECTION 4: HISTORICAL REPLAY */}
      {activeSection === 'replay' && (
        <div className="space-y-4">
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
              <History className="w-4 h-4 text-emerald-400" />
              Historical Revenue & Profit Impact Simulator
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Re-evaluates actual past completed extraction jobs against your current pricing & margin configurations to preview revenue and profit impact before publishing changes.
            </p>

            <div className="flex items-center gap-3">
              <select
                value={replayDays}
                onChange={(e) => setReplayDays(Number(e.target.value))}
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
              >
                <option value={7}>Past 7 Days</option>
                <option value={30}>Past 30 Days</option>
                <option value={60}>Past 60 Days</option>
                <option value={90}>Past 90 Days</option>
              </select>

              <button
                onClick={handleRunReplay}
                disabled={replayLoading}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${replayLoading ? 'animate-spin' : ''}`} />
                Run Historical Replay
              </button>
            </div>
          </div>

          {replayResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                  <div className="text-xs text-slate-400">Total Jobs Replayed</div>
                  <div className="text-2xl font-bold text-white font-mono mt-1">
                    {replayResult.totalJobsReplayed}
                  </div>
                </div>

                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                  <div className="text-xs text-slate-400">Historical Actual Revenue</div>
                  <div className="text-2xl font-bold text-slate-300 font-mono mt-1">
                    ₹{replayResult.actualTotalRevenue.toFixed(2)}
                  </div>
                </div>

                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                  <div className="text-xs text-slate-400">Simulated Projected Revenue</div>
                  <div className="text-2xl font-bold text-emerald-400 font-mono mt-1">
                    ₹{replayResult.simulatedTotalRevenue.toFixed(2)}
                  </div>
                </div>

                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                  <div className="text-xs text-slate-400">Net Profit Difference</div>
                  <div
                    className={`text-2xl font-bold font-mono mt-1 ${
                      replayResult.profitDelta >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {replayResult.profitDelta >= 0 ? '+' : ''}₹{replayResult.profitDelta.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Sample Replay Table */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold">Job ID</th>
                      <th className="py-2.5 px-4 font-semibold">Product</th>
                      <th className="py-2.5 px-4 font-semibold">Items</th>
                      <th className="py-2.5 px-4 font-semibold">Actual Charged</th>
                      <th className="py-2.5 px-4 font-semibold">Simulated Charged</th>
                      <th className="py-2.5 px-4 font-semibold">Actual Profit</th>
                      <th className="py-2.5 px-4 font-semibold">Simulated Profit</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Delta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {replayResult.replayItems.map((item: any) => (
                      <tr key={item.jobId} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-4 text-slate-400">{item.jobId.slice(0, 8)}...</td>
                        <td className="py-2.5 px-4 text-white font-sans">{item.productName}</td>
                        <td className="py-2.5 px-4">{item.items}</td>
                        <td className="py-2.5 px-4 text-slate-300">
                          {item.currency} {item.actualCharged}
                        </td>
                        <td className="py-2.5 px-4 text-emerald-400">
                          {item.currency} {item.simulatedCharged}
                        </td>
                        <td className="py-2.5 px-4 text-slate-300">{item.actualProfit}</td>
                        <td className="py-2.5 px-4 text-emerald-400">{item.simulatedProfit}</td>
                        <td
                          className={`py-2.5 px-4 text-right font-bold ${
                            item.difference >= 0 ? 'text-emerald-400' : 'text-red-400'
                          }`}
                        >
                          {item.difference >= 0 ? '+' : ''}{item.difference}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION 5: KPIS & TRACES */}
      {activeSection === 'kpis' && (
        <div className="space-y-6">
          {kpis && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                <div className="text-xs text-slate-400">Total Completed Runs</div>
                <div className="text-2xl font-bold text-white font-mono mt-1">{kpis.totalJobs}</div>
              </div>

              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                <div className="text-xs text-slate-400">Gross Platform Revenue (GMV)</div>
                <div className="text-2xl font-bold text-emerald-400 font-mono mt-1">
                  ₹{kpis.totalRevenue.toFixed(2)}
                </div>
              </div>

              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                <div className="text-xs text-slate-400">Realized Gross Profit</div>
                <div className="text-2xl font-bold text-emerald-400 font-mono mt-1">
                  ₹{kpis.grossProfit.toFixed(2)}
                </div>
              </div>

              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                <div className="text-xs text-slate-400">Realized Margin %</div>
                <div className="text-2xl font-bold text-white font-mono mt-1">
                  {kpis.realizedMarginPct}%
                </div>
              </div>
            </div>
          )}

          {/* Leakage Alert */}
          {kpis && kpis.marginLeakageJobsCount > 0 && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <div>
                  <div className="text-xs font-bold text-amber-300">Margin Leakage Detected</div>
                  <div className="text-xs text-slate-300">
                    {kpis.marginLeakageJobsCount} job(s) completed with profit margin below the 15% safety threshold.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Recent Audit Traces */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-3">Recent Margin Audit Traces</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Trace ID</th>
                    <th className="py-2.5 px-4 font-semibold">Product</th>
                    <th className="py-2.5 px-4 font-semibold">Loaded Cost</th>
                    <th className="py-2.5 px-4 font-semibold">Sell Price</th>
                    <th className="py-2.5 px-4 font-semibold">Profit</th>
                    <th className="py-2.5 px-4 font-semibold">Margin %</th>
                    <th className="py-2.5 px-4 font-semibold">Rule Applied</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {kpis?.recentTraces?.map((t: any) => (
                    <tr key={t.id} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-4 text-slate-400">{t.id}</td>
                      <td className="py-2.5 px-4 text-white font-sans">{t.product_slug}</td>
                      <td className="py-2.5 px-4">${t.loaded_cost_usd?.toFixed(4)}</td>
                      <td className="py-2.5 px-4 font-bold text-slate-200">
                        {t.currency} {t.final_sell_price}
                      </td>
                      <td className="py-2.5 px-4 text-emerald-400">
                        {t.currency} {t.profit_amount}
                      </td>
                      <td className="py-2.5 px-4 text-emerald-400">{t.profit_margin_pct}%</td>
                      <td className="py-2.5 px-4 text-slate-400 font-sans">{t.rule_name || 'Global'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 6: PROMO CODES */}
      {activeSection === 'coupons' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">Active Promo Coupons</h2>
              <p className="text-xs text-slate-400">
                Discount codes redeemable in Studio checkout with hard floor margin protection.
              </p>
            </div>
            <button
              onClick={() => {
                setEditingCoupon({
                  code: '',
                  discount_type: 'percent',
                  discount_value: 15,
                  min_order_amount: 0,
                  max_uses: 100,
                  enabled: true
                });
                setShowCouponModal(true);
              }}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              Create Coupon
            </button>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-semibold">Code</th>
                  <th className="py-3 px-4 font-semibold">Description</th>
                  <th className="py-3 px-4 font-semibold">Discount</th>
                  <th className="py-3 px-4 font-semibold">Usage</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {coupons.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/30">
                    <td className="py-3 px-4 font-mono font-bold text-emerald-400">{c.code}</td>
                    <td className="py-3 px-4 text-slate-300">{c.description || '-'}</td>
                    <td className="py-3 px-4 font-mono">
                      {c.discount_type === 'percent' ? `${c.discount_value}%` : `$${c.discount_value}`}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-300">
                      {c.current_uses} / {c.max_uses}
                    </td>
                    <td className="py-3 px-4">
                      {c.enabled ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Active
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                          Disabled
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={async () => {
                          if (confirm(`Delete coupon ${c.code}?`)) {
                            await api.delete(`/api/marketplace/admin/margin-studio/coupons/${c.id}`);
                            loadCoupons();
                          }
                        }}
                        className="p-1 hover:bg-red-950 text-red-400 rounded transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Create/Edit Margin Rule */}
      {showRuleModal && editingRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-white">
              {editingRule.id ? 'Edit Margin Rule' : 'Create Advanced Margin Rule'}
            </h3>

            <form onSubmit={handleSaveRule} className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Rule Name</label>
                <input
                  type="text"
                  required
                  value={editingRule.name || ''}
                  onChange={(e) => setEditingRule({ ...editingRule, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Scope</label>
                  <select
                    value={editingRule.scope || 'global'}
                    onChange={(e) => setEditingRule({ ...editingRule, scope: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                  >
                    <option value="global">Global (Platform Default)</option>
                    <option value="category">Category</option>
                    <option value="product">Specific Product</option>
                    <option value="pricing_model">Pricing Model</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Target ID / Slug</label>
                  <input
                    type="text"
                    placeholder="Leave empty if global"
                    value={editingRule.target_id || ''}
                    onChange={(e) => setEditingRule({ ...editingRule, target_id: e.target.value || null })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Base Margin (%)</label>
                  <input
                    type="number"
                    step="0.5"
                    required
                    value={editingRule.percent_value || 0}
                    onChange={(e) => setEditingRule({ ...editingRule, percent_value: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Fixed Addon ($ USD)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={editingRule.fixed_value || 0}
                    onChange={(e) => setEditingRule({ ...editingRule, fixed_value: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Tier Mode</label>
                  <select
                    value={editingRule.tier_mode || 'marginal'}
                    onChange={(e) => setEditingRule({ ...editingRule, tier_mode: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                  >
                    <option value="marginal">Marginal Bracket (Tax style)</option>
                    <option value="cliff">Cliff Tier</option>
                    <option value="flat">Flat</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Hard Margin Floor (%)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={editingRule.min_margin_percent || 15}
                    onChange={(e) => setEditingRule({ ...editingRule, min_margin_percent: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRuleModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-lg text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold"
                >
                  Save Margin Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create Coupon */}
      {showCouponModal && editingCoupon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-white">Create Promotional Coupon</h3>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await api.post('/api/marketplace/admin/margin-studio/coupons', editingCoupon);
                setShowCouponModal(false);
                loadCoupons();
              }}
              className="space-y-3"
            >
              <div>
                <label className="text-xs text-slate-400 block mb-1">Promo Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. VIP25"
                  value={editingCoupon.code || ''}
                  onChange={(e) => setEditingCoupon({ ...editingCoupon, code: e.target.value.toUpperCase() })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white uppercase font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Discount Type</label>
                  <select
                    value={editingCoupon.discount_type || 'percent'}
                    onChange={(e) => setEditingCoupon({ ...editingCoupon, discount_type: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                  >
                    <option value="percent">Percentage (%)</option>
                    <option value="fixed">Fixed Amount ($)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Discount Value</label>
                  <input
                    type="number"
                    step="0.5"
                    required
                    value={editingCoupon.discount_value || 0}
                    onChange={(e) => setEditingCoupon({ ...editingCoupon, discount_value: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Max Redemptions</label>
                <input
                  type="number"
                  value={editingCoupon.max_uses || 100}
                  onChange={(e) => setEditingCoupon({ ...editingCoupon, max_uses: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCouponModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-lg text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold"
                >
                  Create Coupon
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

