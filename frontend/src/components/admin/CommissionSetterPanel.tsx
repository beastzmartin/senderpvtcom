import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { CustomCommissionRule } from '../../types';
import { useCurrency } from '../../context/CurrencyContext';
import {
  Percent,
  Coins,
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Sparkles,
  Calculator,
  ShieldCheck,
  TrendingUp,
  Tag,
  Users,
  Layers,
  ArrowRight,
  Info,
  DollarSign
} from 'lucide-react';

export const CommissionSetterPanel: React.FC = () => {
  const { currencySymbol, currencyCode } = useCurrency();
  const [rules, setRules] = useState<CustomCommissionRule[]>([]);
  const [productTypes, setProductTypes] = useState<string[]>(['all_products', 'virtual_numbers', 'marketplace', 'leads']);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [formName, setFormName] = useState('');
  const [formProductType, setFormProductType] = useState('all_products');
  const [formCustomProduct, setFormCustomProduct] = useState('');
  const [formTargetRole, setFormTargetRole] = useState('all');
  const [formTargetUserId, setFormTargetUserId] = useState('');
  const [formType, setFormType] = useState<'percent' | 'fixed' | 'percent_plus_fixed'>('percent');
  const [formPercentValue, setFormPercentValue] = useState<number>(20);
  const [formFixedValue, setFormFixedValue] = useState<number>(0);
  const [formMinCommission, setFormMinCommission] = useState<number>(1);
  const [formMaxCommission, setFormMaxCommission] = useState<string>('');
  const [formDescription, setFormDescription] = useState('');
  const [formEnabled, setFormEnabled] = useState(true);

  // Live Simulator State
  const [simBasePrice, setSimBasePrice] = useState<number>(50);
  const [simProductType, setSimProductType] = useState<string>('all_products');
  const [simRole, setSimRole] = useState<string>('all');
  const [simResult, setSimResult] = useState<any>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    runSimulator();
  }, [simBasePrice, simProductType, simRole, rules]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rulesRes, prodsRes] = await Promise.all([
        api.commissions.list(),
        api.commissions.getProductTypes()
      ]);
      if (rulesRes.success) setRules(rulesRes.rules);
      if (prodsRes.success && prodsRes.productTypes) setProductTypes(prodsRes.productTypes);
    } catch (err: any) {
      showToast(err.message || 'Failed to load commission rules', 'error');
    } finally {
      setLoading(false);
    }
  };

  const runSimulator = async () => {
    if (simBasePrice < 0) return;
    setIsSimulating(true);
    try {
      const res = await api.commissions.calculate({
        basePrice: Number(simBasePrice),
        product_type: simProductType,
        role: simRole
      });
      if (res.success) {
        setSimResult(res.result);
      }
    } catch {
    } finally {
      setIsSimulating(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingRuleId(null);
    setFormName('');
    setFormProductType('all_products');
    setFormCustomProduct('');
    setFormTargetRole('all');
    setFormTargetUserId('');
    setFormType('percent');
    setFormPercentValue(20);
    setFormFixedValue(0);
    setFormMinCommission(1);
    setFormMaxCommission('');
    setFormDescription('');
    setFormEnabled(true);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (rule: CustomCommissionRule) => {
    setEditingRuleId(rule.id);
    setFormName(rule.name);
    if (['all_products', 'virtual_numbers', 'marketplace', 'leads'].includes(rule.product_type)) {
      setFormProductType(rule.product_type);
      setFormCustomProduct('');
    } else {
      setFormProductType('custom');
      setFormCustomProduct(rule.product_type);
    }
    setFormTargetRole(rule.target_role || 'all');
    setFormTargetUserId(rule.target_user_id || '');
    setFormType(rule.type);
    setFormPercentValue(rule.percent_value);
    setFormFixedValue(rule.fixed_value);
    setFormMinCommission(rule.min_commission);
    setFormMaxCommission(rule.max_commission !== null ? String(rule.max_commission) : '');
    setFormDescription(rule.description || '');
    setFormEnabled(rule.enabled === 1);
    setIsModalOpen(true);
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      showToast('Please provide a commission rule name', 'error');
      return;
    }

    const resolvedProduct = formProductType === 'custom'
      ? formCustomProduct.trim().toLowerCase()
      : formProductType;

    if (!resolvedProduct) {
      showToast('Please specify a product type', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: any = {
        name: formName.trim(),
        product_type: resolvedProduct,
        target_role: formTargetRole,
        target_user_id: formTargetUserId.trim() || null,
        type: formType,
        percent_value: Number(formPercentValue),
        fixed_value: Number(formFixedValue),
        min_commission: Number(formMinCommission),
        max_commission: formMaxCommission ? Number(formMaxCommission) : null,
        description: formDescription.trim() || undefined,
        enabled: formEnabled
      };

      if (editingRuleId) {
        const res = await api.commissions.update(editingRuleId, payload);
        if (res.success) {
          showToast(res.message, 'success');
          setIsModalOpen(false);
          await loadData();
        }
      } else {
        const res = await api.commissions.create(payload);
        if (res.success) {
          showToast(res.message, 'success');
          setIsModalOpen(false);
          await loadData();
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to save commission rule', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleRule = async (rule: CustomCommissionRule) => {
    try {
      const res = await api.commissions.update(rule.id, { enabled: rule.enabled === 1 ? 0 : 1 });
      if (res.success) {
        showToast(`Rule '${rule.name}' is now ${rule.enabled === 1 ? 'disabled' : 'active'}.`, 'info');
        await loadData();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to toggle status', 'error');
    }
  };

  const handleDeleteRule = async (rule: CustomCommissionRule) => {
    if (!confirm(`Are you sure you want to delete commission rule '${rule.name}'?`)) return;
    try {
      const res = await api.commissions.delete(rule.id);
      if (res.success) {
        showToast(`Commission rule deleted.`, 'info');
        await loadData();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to delete rule', 'error');
    }
  };

  // KPI Calculations
  const activeCount = rules.filter((r) => r.enabled === 1).length;
  const universalRule = rules.find((r) => r.product_type === 'all_products' && r.target_role === 'all');
  const resellerRule = rules.find((r) => r.target_role === 'reseller');
  const userOverrideCount = rules.filter((r) => Boolean(r.target_user_id)).length;

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

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-950 text-white rounded-3xl p-6 shadow-md border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
              <Percent className="w-3 h-3 text-indigo-400" />
              Custom Commission Engine
            </span>
            <span className="text-xs text-slate-400 font-mono">Universal Multi-Product Profit Control</span>
          </div>

          <h2 className="text-xl font-black tracking-tight flex items-center gap-2.5">
            <Coins className="w-6 h-6 text-sky-400" />
            Custom Commission & Profit Setter
          </h2>

          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            Configure flexible commission formulas across all services: Virtual Numbers (5SIM), Google Maps Lead Extractor, Marketplace Extensions, and upcoming custom products.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleOpenCreate}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-emerald-600/30"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Commission Rule</span>
          </button>

          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition border border-white/10"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-2xs space-y-1">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Universal Base Rate</span>
            <Percent className="w-4 h-4 text-sky-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono">
            {universalRule ? `${universalRule.percent_value}%` : '20%'}
          </div>
          <p className="text-[11px] text-slate-500">Applies to all products by default</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-2xs space-y-1">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Active Commission Rules</span>
            <Tag className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono">
            {activeCount} <span className="text-xs text-slate-400 font-normal">/ {rules.length} total</span>
          </div>
          <p className="text-[11px] text-slate-500">Live operational markups</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-2xs space-y-1">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Reseller Tier Rate</span>
            <Users className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono">
            {resellerRule ? `${resellerRule.percent_value}%` : '8%'}
          </div>
          <p className="text-[11px] text-slate-500">Wholesale reseller markup</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-2xs space-y-1">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>User Overrides</span>
            <ShieldCheck className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono">
            {userOverrideCount}
          </div>
          <p className="text-[11px] text-slate-500">VIP / specific customer rules</p>
        </div>
      </div>

      {/* Rules Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-sky-600" />
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
              Configured Commission Rates & Markups ({rules.length})
            </h3>
          </div>
          <span className="text-[11px] text-slate-400 font-medium">
            Higher specific rules override universal defaults
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
              <tr>
                <th className="py-3 px-4">Rule Name</th>
                <th className="py-3 px-4">Product Target</th>
                <th className="py-3 px-4">Target Audience</th>
                <th className="py-3 px-4">Commission Formula</th>
                <th className="py-3 px-4">Min Floor</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
              {rules.map((rule) => {
                return (
                  <tr key={rule.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{rule.name}</div>
                      {rule.description && (
                        <div className="text-[11px] text-slate-400 font-normal">{rule.description}</div>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full font-mono font-bold text-[10px] uppercase ${
                          rule.product_type === 'all_products'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : rule.product_type === 'virtual_numbers'
                            ? 'bg-sky-100 text-sky-800 border border-sky-200'
                            : rule.product_type === 'leads'
                            ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                            : 'bg-purple-100 text-purple-800 border border-purple-200'
                        }`}
                      >
                        {rule.product_type.replace(/_/g, ' ')}
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      {rule.target_username ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                          @{rule.target_username}
                        </span>
                      ) : rule.target_role !== 'all' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 uppercase">
                          {rule.target_role}
                        </span>
                      ) : (
                        <span className="text-slate-500 font-normal">All Customers</span>
                      )}
                    </td>

                    <td className="py-3 px-4 font-mono font-black text-slate-900">
                      {rule.type === 'percent'
                        ? `+${rule.percent_value}%`
                        : rule.type === 'fixed'
                        ? `+${currencySymbol}${rule.fixed_value}`
                        : `+${rule.percent_value}% and +${currencySymbol}${rule.fixed_value}`}
                    </td>

                    <td className="py-3 px-4 font-mono text-slate-600">
                      {rule.min_commission > 0 ? `${currencySymbol}${rule.min_commission}` : 'None'}
                    </td>

                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => handleToggleRule(rule)}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition ${
                          rule.enabled === 1
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {rule.enabled === 1 ? 'Active' : 'Disabled'}
                      </button>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(rule)}
                          className="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition"
                          title="Edit Rule"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        {rule.id !== 'comm_default_universal' && (
                          <button
                            type="button"
                            onClick={() => handleDeleteRule(rule)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="Delete Rule"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live Commission Simulator Card */}
      <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-3xl p-6 shadow-md border border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Calculator className="w-4 h-4 text-sky-400" />
              <h4 className="text-sm font-black tracking-tight">Live Commission & Retail Price Simulator</h4>
            </div>
            <p className="text-xs text-slate-300">
              Test how commission rules are resolved for any wholesale product cost, customer role, or product category.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-300">Base Wholesale Cost ({currencyCode}):</label>
            <input
              type="number"
              min="0"
              step="1"
              value={simBasePrice}
              onChange={(e) => setSimBasePrice(Number(e.target.value))}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs font-mono font-bold text-white focus:outline-hidden focus:border-sky-400"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-300">Product Target:</label>
            <select
              value={simProductType}
              onChange={(e) => setSimProductType(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs font-bold text-white focus:outline-hidden focus:border-sky-400"
            >
              <option value="all_products">All Products (Universal)</option>
              <option value="virtual_numbers">Virtual Numbers (5SIM)</option>
              <option value="leads">Google Maps Leads</option>
              <option value="marketplace">Marketplace Modules</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-300">Customer Role:</label>
            <select
              value={simRole}
              onChange={(e) => setSimRole(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs font-bold text-white focus:outline-hidden focus:border-sky-400"
            >
              <option value="all">Standard Customer (All)</option>
              <option value="reseller">Reseller Partner</option>
              <option value="vip">VIP Tier</option>
            </select>
          </div>
        </div>

        {simResult && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-800">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
              <span className="text-[10px] text-slate-400 block">Wholesale Base Cost</span>
              <span className="text-base font-black font-mono text-white">
                {currencySymbol} {simResult.basePrice.toFixed(2)}
              </span>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
              <span className="text-[10px] text-emerald-400 block">Commission Added</span>
              <span className="text-base font-black font-mono text-emerald-400">
                +{currencySymbol} {simResult.commission.toFixed(2)}
              </span>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
              <span className="text-[10px] text-sky-400 block">Customer Sell Price</span>
              <span className="text-base font-black font-mono text-sky-300">
                {currencySymbol} {simResult.sellPrice.toFixed(2)}
              </span>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
              <span className="text-[10px] text-indigo-400 block">Profit Margin</span>
              <span className="text-base font-black font-mono text-indigo-300">
                {simResult.profitMarginPercent}%
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Rule Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <Percent className="w-4 h-4 text-emerald-600" />
                  {editingRuleId ? 'Edit Custom Commission Rule' : 'Establish New Commission Rule'}
                </h3>
                <p className="text-xs text-slate-500">Configure markup rates, product targets, and customer tiers.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRule} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Rule Display Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Virtual Numbers Retail 25%, Reseller VIP 8%"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Product Category</label>
                  <select
                    value={formProductType}
                    onChange={(e) => setFormProductType(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-hidden"
                  >
                    <option value="all_products">All Products (Universal)</option>
                    <option value="virtual_numbers">Virtual Numbers (5SIM)</option>
                    <option value="leads">Google Maps Leads</option>
                    <option value="marketplace">Marketplace Modules</option>
                    <option value="custom">Custom Product Slug...</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Target Audience</label>
                  <select
                    value={formTargetRole}
                    onChange={(e) => setFormTargetRole(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-hidden"
                  >
                    <option value="all">All Customers</option>
                    <option value="reseller">Resellers Only</option>
                    <option value="vip">VIP Tier</option>
                    <option value="user">Standard Users</option>
                  </select>
                </div>
              </div>

              {formProductType === 'custom' && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Custom Product Slug</label>
                  <input
                    type="text"
                    value={formCustomProduct}
                    onChange={(e) => setFormCustomProduct(e.target.value)}
                    placeholder="e.g. telegram_otp, email_validator, proxy_package"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:bg-white focus:outline-hidden"
                    required
                  />
                </div>
              )}

              {/* Commission Calculation Type */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Commission Model</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFormType('percent')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition border ${
                      formType === 'percent'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    Percent (%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormType('fixed')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition border ${
                      formType === 'fixed'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    Fixed ({currencySymbol})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormType('percent_plus_fixed')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition border ${
                      formType === 'percent_plus_fixed'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    Both (% + Fixed)
                  </button>
                </div>
              </div>

              {/* Value Fields */}
              <div className="grid grid-cols-2 gap-3">
                {(formType === 'percent' || formType === 'percent_plus_fixed') && (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Percentage Markup (%)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={formPercentValue}
                      onChange={(e) => setFormPercentValue(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-hidden"
                      required
                    />
                  </div>
                )}

                {(formType === 'fixed' || formType === 'percent_plus_fixed') && (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Fixed Fee ({currencySymbol})</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={formFixedValue}
                      onChange={(e) => setFormFixedValue(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-hidden"
                      required
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Minimum Floor ({currencySymbol})</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={formMinCommission}
                    onChange={(e) => setFormMinCommission(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Max Cap (Optional, {currencySymbol})</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={formMaxCommission}
                    onChange={(e) => setFormMaxCommission(e.target.value)}
                    placeholder="Leave empty for none"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:bg-white focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Internal Notes / Description</label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="e.g. Established wholesale tier for bulk partners"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden"
                />
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formEnabled}
                    onChange={(e) => setFormEnabled(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Active & Apply to Customer Orders</span>
                </label>
              </div>

              <div className="flex items-center gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : editingRuleId ? 'Update Rule' : 'Establish Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
