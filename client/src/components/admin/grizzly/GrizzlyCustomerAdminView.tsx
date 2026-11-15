import React, { useState, useEffect } from 'react';
import { api } from '../../../services/api';
import {
  Key,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Coins,
  DollarSign,
  TrendingUp,
  Clock,
  Sliders,
  Save,
  Send,
  Eye,
  EyeOff,
  Filter,
  Activity,
  Layers,
  Database
} from 'lucide-react';

export const GrizzlyCustomerAdminView: React.FC = () => {
  const [activeSubView, setActiveSubView] = useState<'config' | 'activations' | 'logs'>('config');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Configuration Form State
  const [config, setConfig] = useState<any>({
    is_enabled: true,
    api_key: '',
    base_url: 'https://api.grizzlysms.com/stubs/handler_api.php',
    default_country: 'any',
    min_price: 0,
    max_price: 500,
    included_provider_ids: '',
    excluded_provider_ids: '',
    default_phone_exceptions: '',
    timeout_seconds: 15,
    markup_percentage: 25,
    fixed_fee: 5,
    customer_daily_limit: 50,
    cached_balance: 0,
    cached_balance_currency: 'RUB',
    last_health_check_at: null,
    last_error: null
  });

  const [testResult, setTestResult] = useState<{
    healthy?: boolean;
    balance?: number;
    currency?: string;
    latencyMs?: number;
    message?: string;
  } | null>(null);

  // Activations & Profit State
  const [activationsReport, setActivationsReport] = useState<{
    total: number;
    totalRevenue: number;
    totalCost: number;
    totalProfit: number;
    rows: any[];
  }>({ total: 0, totalRevenue: 0, totalCost: 0, totalProfit: 0, rows: [] });

  // Outbound Request Logs State
  const [logs, setLogs] = useState<any[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadConfig = async () => {
    try {
      setLoading(true);
      const res = await api.virtualNumbers.grizzlyCustomer.getAdminConfig();
      if (res.success && res.config) {
        setConfig(res.config);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load customer configuration', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadActivations = async () => {
    try {
      setLoading(true);
      const res = await api.virtualNumbers.grizzlyCustomer.getAdminActivations({ limit: 50 });
      if (res.success) {
        setActivationsReport(res);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load customer activations', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    try {
      setLoading(true);
      const res = await api.virtualNumbers.grizzlyCustomer.getAdminLogs({ limit: 50 });
      if (res.success) {
        setLogs(res.rows || []);
        setLogsTotal(res.total || 0);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load diagnostics logs', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeSubView === 'config') loadConfig();
    if (activeSubView === 'activations') loadActivations();
    if (activeSubView === 'logs') loadLogs();
  }, [activeSubView]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const res = await api.virtualNumbers.grizzlyCustomer.updateAdminConfig({
        is_enabled: config.is_enabled,
        api_key: config.api_key,
        base_url: config.base_url,
        default_country: config.default_country,
        min_price: parseFloat(config.min_price) || 0,
        max_price: parseFloat(config.max_price) || 0,
        included_provider_ids: config.included_provider_ids,
        excluded_provider_ids: config.excluded_provider_ids,
        default_phone_exceptions: config.default_phone_exceptions,
        timeout_seconds: parseInt(config.timeout_seconds, 10) || 15,
        markup_percentage: parseFloat(config.markup_percentage) || 0,
        fixed_fee: parseFloat(config.fixed_fee) || 0,
        customer_daily_limit: parseInt(config.customer_daily_limit, 10) || 50
      });

      if (res.success) {
        showToast('GrizzlySMS Customer API settings saved successfully.');
        setConfig(res.config);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to save configuration', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setTestingConnection(true);
      setTestResult(null);
      const res = await api.virtualNumbers.grizzlyCustomer.testConnection(
        config.api_key?.includes('••••') ? undefined : config.api_key
      );
      setTestResult(res);
      if (res.healthy) {
        showToast(`Connected! Grizzly account balance: ${res.balance?.toFixed(2)} ${res.currency || 'RUB'}`);
      } else {
        showToast(res.message || 'Connection test failed', 'error');
      }
    } catch (err: any) {
      setTestResult({ healthy: false, message: err.message || 'Connection test failed' });
      showToast(err.message || 'Connection test failed', 'error');
    } finally {
      setTestingConnection(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 text-white text-sm font-semibold transition-all ${
            toast.type === 'error' ? 'bg-rose-600' : 'bg-emerald-600'
          }`}
        >
          {toast.type === 'error' ? <AlertCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
          {toast.message}
        </div>
      )}

      {/* Hero Header */}
      <div className="bg-gradient-to-r from-slate-900 via-purple-950 to-slate-900 border border-slate-800 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
              GRIZZLYSMS CUSTOMER API
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              GETNUMBER NUMBER PURCHASING
            </span>
          </div>
          <h2 className="text-xl font-black tracking-tight">Customer Number Marketplace & Purchasing Gateway</h2>
          <p className="text-slate-400 text-xs mt-1 max-w-2xl leading-relaxed">
            Configure the outbound GrizzlySMS Customer API (<code>getNumber</code>) to let users purchase temporary virtual numbers directly with their platform wallet.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testingConnection}
            className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition disabled:opacity-50 shadow-md shadow-purple-600/20"
          >
            <RefreshCw className={`w-4 h-4 ${testingConnection ? 'animate-spin' : ''}`} />
            {testingConnection ? 'Testing Gateway...' : 'Test Connection'}
          </button>
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveSubView('config')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
            activeSubView === 'config'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Sliders className="w-4 h-4" />
          Gateway Settings & Pricing
        </button>

        <button
          onClick={() => setActiveSubView('activations')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
            activeSubView === 'activations'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Customer Activations & Profit ({activationsReport.total})
        </button>

        <button
          onClick={() => setActiveSubView('logs')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
            activeSubView === 'logs'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Database className="w-4 h-4" />
          Outbound getNumber Logs ({logsTotal})
        </button>
      </div>

      {/* VIEW 1: GATEWAY CONFIGURATION & PRICING */}
      {activeSubView === 'config' && (
        <form onSubmit={handleSaveConfig} className="space-y-6">
          {/* Test Connection Result Banner */}
          {testResult && (
            <div
              className={`p-4 rounded-2xl border flex items-center gap-3 text-xs leading-relaxed ${
                testResult.healthy
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              {testResult.healthy ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
              )}
              <div className="flex-1">
                <span className="font-bold">
                  {testResult.healthy ? 'Connection Verified (via non-purchasing getBalance):' : 'Connection Failed:'}
                </span>{' '}
                {testResult.message}
                {testResult.latencyMs && (
                  <span className="ml-2 font-mono text-[11px] opacity-75">
                    (Latency: {testResult.latencyMs}ms)
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Section A: Credentials & Connectivity */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Key className="w-4 h-4 text-purple-600" />
              1. GrizzlySMS Customer API Credentials
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 uppercase">Provider Status</label>
                <div className="flex items-center gap-4 pt-1">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="is_enabled"
                      checked={config.is_enabled === true || config.is_enabled === 1}
                      onChange={() => setConfig({ ...config, is_enabled: true })}
                      className="text-purple-600 focus:ring-purple-500"
                    />
                    Enabled (Allow Purchases)
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="is_enabled"
                      checked={config.is_enabled === false || config.is_enabled === 0}
                      onChange={() => setConfig({ ...config, is_enabled: false })}
                      className="text-purple-600 focus:ring-purple-500"
                    />
                    Disabled (Maintenance)
                  </label>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 uppercase">Gateway Base URL</label>
                <input
                  type="text"
                  value={config.base_url}
                  onChange={(e) => setConfig({ ...config, base_url: e.target.value })}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 bg-slate-50"
                />
              </div>
            </div>

            <div className="space-y-1 pt-2">
              <label className="text-xs font-bold text-slate-700 uppercase">GrizzlySMS Customer API Key</label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={config.api_key || ''}
                  onChange={(e) => setConfig({ ...config, api_key: e.target.value })}
                  placeholder="Paste your GrizzlySMS secret API key here..."
                  className="w-full pl-3 pr-10 py-2 text-xs font-mono border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 bg-slate-50"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Never shared with the client browser or exposed in frontend bundles. Redacted automatically in diagnostics.
              </p>
            </div>
          </div>

          {/* Section B: Pricing Engine & Profit Margins */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              2. Marketplace Pricing & Profit Margin Settings
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Percentage Markup (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={config.markup_percentage}
                  onChange={(e) => setConfig({ ...config, markup_percentage: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl font-mono focus:ring-2 focus:ring-purple-500"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">e.g. 25% added to acquisition cost</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Fixed Service Fee (₹)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={config.fixed_fee}
                  onChange={(e) => setConfig({ ...config, fixed_fee: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl font-mono focus:ring-2 focus:ring-purple-500"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">Fixed charge per allocated number</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Customer Daily Limit
                </label>
                <input
                  type="number"
                  min="1"
                  value={config.customer_daily_limit}
                  onChange={(e) => setConfig({ ...config, customer_daily_limit: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl font-mono focus:ring-2 focus:ring-purple-500"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">Maximum purchases per customer / day</p>
              </div>
            </div>

            {/* Live Pricing Simulation Box */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 text-xs">
              <div>
                <span className="font-bold text-slate-800">Sample Pricing Calculation (₹20 Base Cost):</span>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  Base ₹20.00 + ({config.markup_percentage || 0}% markup = ₹{((20 * (config.markup_percentage || 0)) / 100).toFixed(2)}) + Fixed Fee ₹{(parseFloat(config.fixed_fee) || 0).toFixed(2)}
                </p>
              </div>
              <div className="flex items-center gap-4 text-right">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Selling Price</span>
                  <span className="text-base font-black text-emerald-600 font-mono">
                    ₹{(20 + (20 * (config.markup_percentage || 0)) / 100 + (parseFloat(config.fixed_fee) || 0)).toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Admin Profit</span>
                  <span className="text-base font-black text-indigo-600 font-mono">
                    ₹{((20 * (config.markup_percentage || 0)) / 100 + (parseFloat(config.fixed_fee) || 0)).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Section C: Advanced Protocol Filtering & Restrictions */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Filter className="w-4 h-4 text-indigo-600" />
              3. Advanced Provider Parameters & Restrictions
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Default Country
                </label>
                <input
                  type="text"
                  placeholder="any or country ID (e.g. 22)"
                  value={config.default_country}
                  onChange={(e) => setConfig({ ...config, default_country: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl font-mono focus:ring-2 focus:ring-purple-500"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">Default country used when customer selects auto-pick</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Request Timeout (Seconds)
                </label>
                <input
                  type="number"
                  min="5"
                  max="60"
                  value={config.timeout_seconds}
                  onChange={(e) => setConfig({ ...config, timeout_seconds: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl font-mono focus:ring-2 focus:ring-purple-500"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">Outbound HTTP request timeout before safe abort</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Min & Max Provider Price Boundaries
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    placeholder="Min"
                    value={config.min_price}
                    onChange={(e) => setConfig({ ...config, min_price: e.target.value })}
                    className="w-1/2 px-3 py-2 text-xs border border-slate-200 rounded-xl font-mono"
                  />
                  <span className="text-slate-400 text-xs">to</span>
                  <input
                    type="number"
                    placeholder="Max"
                    value={config.max_price}
                    onChange={(e) => setConfig({ ...config, max_price: e.target.value })}
                    className="w-1/2 px-3 py-2 text-xs border border-slate-200 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Default Phone Prefix Exceptions
                </label>
                <input
                  type="text"
                  placeholder="e.g. 447472, 447890"
                  value={config.default_phone_exceptions}
                  onChange={(e) => setConfig({ ...config, default_phone_exceptions: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">Comma-separated phone prefixes to prohibit</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Included Provider IDs (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 1, 2, 4"
                  value={config.included_provider_ids}
                  onChange={(e) => setConfig({ ...config, included_provider_ids: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Excluded Provider IDs (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 3, 5"
                  value={config.excluded_provider_ids}
                  onChange={(e) => setConfig({ ...config, excluded_provider_ids: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl font-mono"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-md shadow-purple-600/20 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Customer API Configuration'}
            </button>
          </div>
        </form>
      )}

      {/* VIEW 2: CUSTOMER ACTIVATIONS & PROFIT REPORT */}
      {activeSubView === 'activations' && (
        <div className="space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Total Allocated Numbers
              </span>
              <span className="text-2xl font-black text-slate-900 mt-1 block">
                {activationsReport.total}
              </span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Total Customer Revenue
              </span>
              <span className="text-2xl font-black text-emerald-600 mt-1 block font-mono">
                ₹{activationsReport.totalRevenue.toFixed(2)}
              </span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Provider Acquisition Cost
              </span>
              <span className="text-2xl font-black text-slate-700 mt-1 block font-mono">
                ₹{activationsReport.totalCost.toFixed(2)}
              </span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Net Admin Margin
              </span>
              <span className="text-2xl font-black text-purple-600 mt-1 block font-mono">
                ₹{activationsReport.totalProfit.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Activation ID</th>
                    <th className="py-3 px-4">Phone Number</th>
                    <th className="py-3 px-4">Service</th>
                    <th className="py-3 px-4">Country</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Selling Price</th>
                    <th className="py-3 px-4 text-right">Admin Profit</th>
                    <th className="py-3 px-4 text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activationsReport.rows.map((act) => (
                    <tr key={act.id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4 font-mono font-bold text-purple-600">
                        #{act.provider_activation_id}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-800">
                        +{act.phone_number}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-700">
                        {act.service_name} ({act.service_code})
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {act.country_name || `Country #${act.country_id}`}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            act.status === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : act.status === 'NUMBER_ASSIGNED'
                              ? 'bg-blue-100 text-blue-800'
                              : act.status === 'CANCELLED'
                              ? 'bg-slate-100 text-slate-500'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {act.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-800">
                        ₹{Number(act.customer_selling_price || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600">
                        +₹{Number(act.admin_profit || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-400 font-mono text-[11px]">
                        {new Date(act.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {activationsReport.rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400 font-semibold">
                        No customer purchases recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: OUTBOUND DIAGNOSTICS LOGS */}
      {activeSubView === 'logs' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider">
              GrizzlySMS Outbound getNumber Diagnostics
            </h4>
            <button
              onClick={loadLogs}
              className="p-1 text-slate-400 hover:text-slate-600 rounded transition"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Correlation ID</th>
                  <th className="py-3 px-4">Parsed Status</th>
                  <th className="py-3 px-4 text-center">HTTP</th>
                  <th className="py-3 px-4 text-right">Latency</th>
                  <th className="py-3 px-4">Raw Response</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                      {new Date(log.created_at).toLocaleTimeString()}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-purple-700 text-[11px]">
                      {log.correlation_id}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                          log.is_success === 1
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {log.parsed_status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-mono">
                      {log.response_status_code || 200}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700">
                      {log.duration_ms} ms
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500 text-[11px] max-w-xs truncate">
                      {log.error_message || log.response_body}
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 font-semibold">
                      No outbound getNumber API requests logged yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

