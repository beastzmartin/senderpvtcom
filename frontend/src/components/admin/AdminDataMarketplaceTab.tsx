import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import {
  Database,
  Plus,
  Edit2,
  Copy,
  Trash2,
  Play,
  Download,
  RefreshCw,
  Sliders,
  DollarSign,
  Activity,
  Settings,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Search,
  ExternalLink,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';

export const AdminDataMarketplaceTab: React.FC = () => {
  const [subTab, setSubTab] = useState<'products' | 'jobs' | 'finance' | 'health' | 'settings'>('products');
  const [products, setProducts] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [finance, setFinance] = useState<any | null>(null);
  const [health, setHealth] = useState<any | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // Import Tool State
  const [importActorId, setImportActorId] = useState('');
  const [importing, setImporting] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [jsonText, setJsonText] = useState('');

  useEffect(() => {
    loadData();
  }, [subTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (subTab === 'products') {
        const res = await api.dataMarketplace.adminListProducts();
        if (res.success) setProducts(res.products);
      } else if (subTab === 'jobs') {
        const res = await api.dataMarketplace.adminListJobs({ limit: 50 });
        if (res.success) setJobs(res.jobs);
      } else if (subTab === 'finance') {
        const res = await api.dataMarketplace.adminFinanceStats();
        if (res.success) setFinance(res);
      } else if (subTab === 'health') {
        const res = await api.dataMarketplace.adminProviderHealth();
        if (res.success) setHealth(res.health);
      } else if (subTab === 'settings') {
        const res = await api.dataMarketplace.adminGetSettings();
        if (res.success) setSettings(res.settings);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleImportActor = async () => {
    if (!importActorId.trim()) return;
    setImporting(true);
    try {
      const res = await api.dataMarketplace.adminImportProvider('apify', importActorId.trim());
      if (res.success && res.product) {
        setEditingProduct(res.product);
        setJsonText(JSON.stringify(res.product, null, 2));
      }
    } catch (err: any) {
      alert(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleSaveProduct = async () => {
    try {
      setJsonError(null);
      const parsed = JSON.parse(jsonText);
      const res = await api.dataMarketplace.adminSaveProduct(parsed, 'Admin visual/JSON update');
      if (res.success) {
        setEditingProduct(null);
        loadData();
      }
    } catch (err: any) {
      setJsonError(err.message || 'Invalid JSON format');
    }
  };

  const handleDuplicate = async (slug: string) => {
    try {
      await api.dataMarketplace.adminDuplicateProduct(slug);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Duplicate failed');
    }
  };

  const handleDelete = async (slug: string) => {
    if (!confirm(`Are you sure you want to delete product "${slug}"?`)) return;
    try {
      await api.dataMarketplace.adminDeleteProduct(slug);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Delete failed');
    }
  };

  const handleTestRun = async (slug: string) => {
    if (!confirm(`Run test extraction (5 items) for "${slug}"?`)) return;
    try {
      const res = await api.dataMarketplace.adminTestRun(slug, {});
      alert(`Test run queued with Job ID: ${res.job?.id}`);
    } catch (err: any) {
      alert(err.message || 'Test run failed');
    }
  };

  const handleSaveSettings = async () => {
    try {
      await api.dataMarketplace.adminUpdateSettings(settings);
      alert('Settings updated successfully!');
    } catch (err: any) {
      alert(err.message || 'Failed to save settings');
    }
  };

  return (
    <div className="space-y-6">
      {/* Subtab Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setSubTab('products')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
            subTab === 'products' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>Products Manager</span>
        </button>
        <button
          onClick={() => setSubTab('jobs')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
            subTab === 'jobs' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Jobs Monitor</span>
        </button>
        <button
          onClick={() => setSubTab('finance')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
            subTab === 'finance' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <DollarSign className="w-3.5 h-3.5" />
          <span>Finance & Profit</span>
        </button>
        <button
          onClick={() => setSubTab('health')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
            subTab === 'health' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Provider Health</span>
        </button>
        <button
          onClick={() => setSubTab('settings')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
            subTab === 'settings' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Settings</span>
        </button>
      </div>

      {/* =====================================================================
          SUB-TAB 1: PRODUCTS MANAGER
         ===================================================================== */}
      {subTab === 'products' && (
        <div className="space-y-6">
          {/* Import from Provider ID Box */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Import Extractor from Provider ID / URL
                </h3>
                <p className="text-[11px] text-slate-500">
                  Paste any Actor ID or URL to auto-extract input fields, pricing model, and description.
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. username~actor-name or https://apify.com/username/actor-name"
                value={importActorId}
                onChange={(e) => setImportActorId(e.target.value)}
                className="flex-1 px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                onClick={handleImportActor}
                disabled={importing}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-sm transition flex items-center gap-1.5"
              >
                {importing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span>Import & Pre-Fill</span>
              </button>
            </div>
          </div>

          {/* Products List Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900">Configured Marketplace Products ({products.length})</h3>
              <button
                onClick={() => {
                  const sample = {
                    slug: `new-extractor-${Date.now().toString().slice(-4)}`,
                    display_name: 'New Custom Extractor',
                    tagline: 'Custom data extraction product',
                    description_md: '# Product Description\n\nCustom details here.',
                    category: 'General',
                    status: 'draft',
                    provider: { type: 'mock', actor_id: 'internal~custom' },
                    input: { fields: [], static_overrides: {}, hidden_defaults: {} },
                    limits: { min_items: 10, max_items_per_run: 500, max_concurrent_runs_per_user: 2, timeout_secs: 1800, memory_mb: 1024 },
                    pricing: { mode: 'per_item', provider_cost_reference: { model: 'pay_per_result', usd_per_1000_items: 2.0 }, sell: { per_1000_items: 299.0, per_run_flat: 0.0 }, margin: { type: 'percent', value: 40 }, min_charge: 10.0 },
                    access: { requires_subscription: false, allowed_plan_slugs: [] },
                    output: { item_mapping: [], drop_fields: [], preview_columns: [], export_formats: ['csv', 'xlsx', 'json'], sanitize: { strip_provider_urls: true } },
                    compliance: { contains_personal_data: false }
                  };
                  setEditingProduct(sample);
                  setJsonText(JSON.stringify(sample, null, 2));
                }}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Product</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Slug & Name</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Provider Type</th>
                    <th className="py-3 px-4">Sell Price</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {products.map((prod) => {
                    const pricing = prod.definition?.pricing;
                    return (
                      <tr key={prod.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{prod.display_name}</div>
                          <div className="font-mono text-[10px] text-slate-400">{prod.slug}</div>
                        </td>
                        <td className="py-3 px-4 text-slate-600">{prod.category}</td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-500 uppercase">
                          {prod.definition?.provider?.type || 'apify'}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900">
                          ₹{pricing?.sell?.per_1000_items || 0} / 1k
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              prod.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : prod.status === 'draft'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {prod.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right space-x-2">
                          <button
                            onClick={() => handleTestRun(prod.slug)}
                            title="Run 5-item test extraction"
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-semibold text-[11px]"
                          >
                            <Play className="w-3 h-3 inline mr-1" />
                            Test
                          </button>
                          <button
                            onClick={() => {
                              setEditingProduct(prod.definition);
                              setJsonText(JSON.stringify(prod.definition, null, 2));
                            }}
                            className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded font-semibold text-[11px]"
                          >
                            <Edit2 className="w-3 h-3 inline mr-1" />
                            Edit
                          </button>
                          <button
                            onClick={() => handleDuplicate(prod.slug)}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-semibold text-[11px]"
                          >
                            <Copy className="w-3 h-3 inline" />
                          </button>
                          <button
                            onClick={() => handleDelete(prod.slug)}
                            className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded font-semibold text-[11px]"
                          >
                            <Trash2 className="w-3 h-3 inline" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* JSON / Visual ProductDefinition Editor Modal */}
          {editingProduct && (
            <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl max-w-3xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">ProductDefinition Schema Editor (v1)</h3>
                    <p className="text-xs text-slate-500">Edit fields, provider mapping, margins and sell pricing</p>
                  </div>
                  <button onClick={() => setEditingProduct(null)} className="text-slate-400 hover:text-slate-600">
                    ✕
                  </button>
                </div>

                <div className="p-4 flex-1 flex flex-col space-y-2 overflow-hidden">
                  {jsonError && (
                    <div className="p-2 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded">
                      {jsonError}
                    </div>
                  )}
                  <textarea
                    value={jsonText}
                    onChange={(e) => setJsonText(e.target.value)}
                    className="w-full flex-1 p-3 font-mono text-xs bg-slate-900 text-emerald-400 rounded-xl focus:outline-none overflow-auto"
                    rows={20}
                  />
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                  <button
                    onClick={() => setEditingProduct(null)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveProduct}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm"
                  >
                    Save Product Definition
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          SUB-TAB 2: JOBS MONITOR
         ===================================================================== */}
      {subTab === 'jobs' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900">Global Extraction Jobs Monitor</h3>
            <button onClick={loadData} className="px-3 py-1 bg-slate-100 text-slate-700 rounded text-xs font-semibold">
              Refresh
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">Job ID</th>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Product</th>
                  <th className="py-3 px-4">Delivered</th>
                  <th className="py-3 px-4">Charged (Sell)</th>
                  <th className="py-3 px-4">Provider Cost</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobs.map((j) => (
                  <tr key={j.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">{j.id}</td>
                    <td className="py-3 px-4 text-slate-700">{j.username || j.user_id}</td>
                    <td className="py-3 px-4 font-semibold text-slate-800">{j.product_name}</td>
                    <td className="py-3 px-4 font-bold">{j.items_delivered} / {j.requested_items}</td>
                    <td className="py-3 px-4 font-bold text-slate-900">₹{Number(j.charged_amount || 0).toFixed(2)}</td>
                    <td className="py-3 px-4 text-slate-500">₹{Number(j.provider_cost_converted || 0).toFixed(2)} (${Number(j.provider_cost_usd || 0).toFixed(4)})</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                        {j.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-400">{j.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          SUB-TAB 3: FINANCE & PROFIT
         ===================================================================== */}
      {subTab === 'finance' && finance && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs text-slate-500">Total Completed Extractions</span>
              <div className="text-2xl font-black text-slate-900 mt-1">{finance.stats.totalJobs}</div>
            </div>
            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs text-slate-500">Delivered Results Count</span>
              <div className="text-2xl font-black text-slate-900 mt-1">{finance.stats.totalItemsDelivered.toLocaleString()}</div>
            </div>
            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs text-slate-500">Gross Marketplace Revenue</span>
              <div className="text-2xl font-black text-emerald-700 mt-1">₹{finance.stats.totalRevenue.toFixed(2)}</div>
            </div>
            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs text-slate-500">Net Profit Margin</span>
              <div className="text-2xl font-black text-emerald-800 mt-1">₹{finance.stats.totalProfit.toFixed(2)}</div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-900">Profit Breakdown By Product</h3>
            </div>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase">
                  <th className="py-3 px-4">Product</th>
                  <th className="py-3 px-4">Jobs</th>
                  <th className="py-3 px-4">Delivered</th>
                  <th className="py-3 px-4">Revenue</th>
                  <th className="py-3 px-4">Provider Cost</th>
                  <th className="py-3 px-4">Net Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(finance.byProduct || []).map((p: any) => (
                  <tr key={p.product_slug} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-bold text-slate-900">{p.product_name}</td>
                    <td className="py-3 px-4">{p.jobs_count}</td>
                    <td className="py-3 px-4 font-bold">{p.items_count}</td>
                    <td className="py-3 px-4 text-emerald-700 font-bold">₹{Number(p.revenue || 0).toFixed(2)}</td>
                    <td className="py-3 px-4 text-slate-500">₹{Number(p.cost || 0).toFixed(2)}</td>
                    <td className="py-3 px-4 text-emerald-800 font-black">₹{Number(p.profit || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          SUB-TAB 4: HEALTH & TOKENS
         ===================================================================== */}
      {subTab === 'health' && health && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="font-bold text-sm text-slate-900">Provider Health & Connection Status</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-500">API Token Configured</span>
              <div className="text-base font-bold text-slate-900 mt-1">
                {health.tokenConfigured ? (
                  <span className="text-emerald-600 flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" /> Yes (Active)
                  </span>
                ) : (
                  <span className="text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" /> Sandbox Mock Only
                  </span>
                )}
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-500">Active Concurrent Runs</span>
              <div className="text-base font-bold text-slate-900 mt-1">{health.activeRuns}</div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-500">Failures Last 24h</span>
              <div className="text-base font-bold text-slate-900 mt-1">{health.recentFailuresLast24h}</div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          SUB-TAB 5: SETTINGS
         ===================================================================== */}
      {subTab === 'settings' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4 max-w-xl">
          <h3 className="font-bold text-sm text-slate-900">Marketplace Global Policies</h3>

          <div className="space-y-3 text-xs">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Result Retention Policy (Days):</label>
              <input
                type="number"
                value={settings.retention_days || '30'}
                onChange={(e) => setSettings({ ...settings, retention_days: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Charge on Zero Results:</label>
              <select
                value={settings.charge_on_zero_results || '0'}
                onChange={(e) => setSettings({ ...settings, charge_on_zero_results: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg"
              >
                <option value="0">No (Release full reserve if 0 results)</option>
                <option value="1">Yes (Charge minimum flat run fee)</option>
              </select>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Refund Full Reserve on Job Failure:</label>
              <select
                value={settings.refund_on_failure || '1'}
                onChange={(e) => setSettings({ ...settings, refund_on_failure: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg"
              >
                <option value="1">Yes (Automatic Full Refund)</option>
                <option value="0">No (Manual Review)</option>
              </select>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Global Default Markup / Margin (%):</label>
              <input
                type="number"
                value={settings.global_default_margin_pct || '35'}
                onChange={(e) => setSettings({ ...settings, global_default_margin_pct: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg"
              />
            </div>

            <button
              onClick={handleSaveSettings}
              className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm"
            >
              Save Policies
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
