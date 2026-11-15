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
  ArrowRight,
  Key,
  Eye,
  EyeOff,
  X,
  ChevronLeft,
  ChevronRight,
  Filter
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

  // Bulk Importer State
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkInputText, setBulkInputText] = useState('');
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ drafts: any[]; existing: string[]; errors: any[] } | null>(null);

  // Review & Activate Wizard State
  const [wizardProduct, setWizardProduct] = useState<any | null>(null);
  const [updatingGate, setUpdatingGate] = useState<string | null>(null);

  // Actor Profile & Evidence State
  const [selectedProfileProduct, setSelectedProfileProduct] = useState<any | null>(null);
  const [overrideClass, setOverrideClass] = useState<string>('');
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [savingOverride, setSavingOverride] = useState<boolean>(false);

  const handleOverrideClassification = async (slug: string) => {
    if (!overrideClass || !overrideReason.trim()) {
      alert('Please choose a classification and provide a written justification reason.');
      return;
    }
    setSavingOverride(true);
    try {
      const res = await api.dataMarketplace.adminOverrideClassification(slug, overrideClass, overrideReason.trim());
      if (res.success) {
        alert('Compatibility classification successfully updated!');
        setSelectedProfileProduct(res.product?.definition || res.product);
        loadData();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to override classification');
    } finally {
      setSavingOverride(false);
    }
  };

  // Drift Check State
  const [driftResult, setDriftResult] = useState<{ slug: string; data: any } | null>(null);
  const [driftCheckingSlug, setDriftCheckingSlug] = useState<string | null>(null);

  // Jobs Monitor Inspection & Results Viewer State
  const [selectedJobForResults, setSelectedJobForResults] = useState<any | null>(null);
  const [jobResults, setJobResults] = useState<any[]>([]);
  const [resultsTotal, setResultsTotal] = useState(0);
  const [resultsPage, setResultsPage] = useState(1);
  const [loadingResults, setLoadingResults] = useState(false);
  const [resultsSearch, setResultsSearch] = useState('');
  const [jobStatusFilter, setJobStatusFilter] = useState('all');
  const [jobSearchTerm, setJobSearchTerm] = useState('');

  const handleOpenJobResults = async (job: any, page = 1) => {
    setSelectedJobForResults(job);
    setResultsPage(page);
    setLoadingResults(true);
    setResultsSearch('');
    try {
      const res = await api.dataMarketplace.getJobResults(job.id, { page, limit: 50 });
      if (res.success) {
        setJobResults(res.items || []);
        setResultsTotal(res.total || 0);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to load extracted job results');
    } finally {
      setLoadingResults(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    if (!selectedJobForResults || newPage < 1) return;
    handleOpenJobResults(selectedJobForResults, newPage);
  };

  // Apify Provider Settings & Live Test State
  const [showToken, setShowToken] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [testAuthLoading, setTestAuthLoading] = useState(false);
  const [testAuthResult, setTestAuthResult] = useState<{ success: boolean; username?: string; email?: string; error?: string } | null>(null);

  const handleTestApifyAuth = async () => {
    setTestAuthLoading(true);
    setTestAuthResult(null);
    try {
      const res = await api.dataMarketplace.adminTestProviderAuth(settings.apify_api_token);
      setTestAuthResult(res);
    } catch (err: any) {
      setTestAuthResult({ success: false, error: err.message || 'Connection failed' });
    } finally {
      setTestAuthLoading(false);
    }
  };

  const handleBulkImport = async () => {
    const lines = bulkInputText.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      alert('Please enter at least one Actor ID or URL.');
      return;
    }
    setBulkImporting(true);
    try {
      const res = await api.dataMarketplace.adminBulkImport(lines);
      if (res.success) {
        setBulkResult(res);
      }
    } catch (err: any) {
      alert(err.message || 'Bulk import failed');
    } finally {
      setBulkImporting(false);
    }
  };

  const handleSaveBulkDrafts = async () => {
    if (!bulkResult || !bulkResult.drafts || bulkResult.drafts.length === 0) return;
    setBulkImporting(true);
    try {
      for (const draft of bulkResult.drafts) {
        await api.dataMarketplace.adminSaveProduct(draft, 'Bulk imported draft');
      }
      alert(`Successfully saved ${bulkResult.drafts.length} draft products to catalog!`);
      setShowBulkModal(false);
      setBulkResult(null);
      setBulkInputText('');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to save drafts');
    } finally {
      setBulkImporting(false);
    }
  };

  const handleToggleGate = async (slug: string, gateKey: string, currentValue: boolean) => {
    setUpdatingGate(gateKey);
    try {
      const res = await api.dataMarketplace.adminUpdateWizardGate(slug, gateKey, !currentValue);
      if (res.success) {
        setWizardProduct(res.product.definition);
        loadData();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to update gate');
    } finally {
      setUpdatingGate(null);
    }
  };

  const handleCheckDrift = async (slug: string) => {
    setDriftCheckingSlug(slug);
    try {
      const res = await api.dataMarketplace.adminCheckDrift(slug);
      if (res.success) {
        setDriftResult({ slug, data: res.drift });
        loadData();
      }
    } catch (err: any) {
      alert(err.message || 'Drift check failed');
    } finally {
      setDriftCheckingSlug(null);
    }
  };

  const handleActivateFromWizard = async (productDef: any) => {
    try {
      const updated = {
        ...productDef,
        status: 'active'
      };
      const res = await api.dataMarketplace.adminSaveProduct(updated, 'Activated via 8-gate wizard');
      if (res.success) {
        alert(`Product "${updated.display_name}" is now ACTIVE on customer catalog!`);
        setWizardProduct(null);
        loadData();
      }
    } catch (err: any) {
      alert(err.message || 'Activation failed');
    }
  };

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
    if (!importActorId.trim()) {
      alert('Please enter an Actor ID or URL (e.g. username~actor-name or https://apify.com/username/actor-name)');
      return;
    }
    setImporting(true);
    try {
      const res = await api.dataMarketplace.adminImportProvider('apify', importActorId.trim());
      if (res.success && res.product) {
        setEditingProduct(res.product);
        setJsonText(JSON.stringify(res.product, null, 2));
      } else {
        alert('Could not import actor details. Please check the Actor ID or URL.');
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

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="e.g. username~actor-name or https://apify.com/username/actor-name"
                value={importActorId}
                onChange={(e) => setImportActorId(e.target.value)}
                className="flex-1 px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleImportActor}
                  disabled={importing}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-sm transition flex items-center gap-1.5"
                >
                  {importing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  <span>Import Link</span>
                </button>
                <button
                  onClick={() => setShowBulkModal(true)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg shadow-sm transition flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Bulk Add-by-Link</span>
                </button>
              </div>
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
                    const profile = prod.definition?.profile;
                    const classification = profile?.compatibility?.classification || 'FULLY_SUPPORTED';

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
                          <div className="flex flex-col gap-1 items-start">
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
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${
                                classification === 'FULLY_SUPPORTED'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : classification === 'SUPPORTED_WITH_LIMITS'
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : classification === 'ADMIN_REVIEW_REQUIRED'
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-rose-50 text-rose-700 border-rose-200'
                              }`}
                            >
                              {classification.replace(/_/g, ' ')}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                          <button
                            onClick={() => {
                              setSelectedProfileProduct(prod.definition);
                              setOverrideClass(classification);
                              setOverrideReason('');
                            }}
                            title="View Capability Profile & Compatibility Classification"
                            className="px-2 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded font-semibold text-[11px] border border-purple-200"
                          >
                            <ShieldAlert className="w-3 h-3 inline mr-1 text-purple-600" />
                            Profile
                          </button>
                          <button
                            onClick={() => setWizardProduct(prod.definition)}
                            title="10-Gate Review & Activate Wizard"
                            className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 rounded font-semibold text-[11px] border border-amber-500/30"
                          >
                            <CheckCircle className="w-3 h-3 inline mr-1 text-amber-500" />
                            Wizard
                          </button>
                          <button
                            onClick={() => handleCheckDrift(prod.slug)}
                            disabled={driftCheckingSlug === prod.slug}
                            title="Check Upstream Schema & Price Drift"
                            className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded font-semibold text-[11px] border border-blue-200"
                          >
                            <RefreshCw className={`w-3 h-3 inline mr-1 ${driftCheckingSlug === prod.slug ? 'animate-spin' : ''}`} />
                            Drift
                          </button>
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

          {/* Bulk Link Importer Modal */}
          {showBulkModal && (
            <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl max-w-3xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">Bulk Link Importer</h3>
                    <p className="text-xs text-slate-500">
                      Paste multiple Actor URLs or identifiers (one per line) to batch-import draft products
                    </p>
                  </div>
                  <button onClick={() => { setShowBulkModal(false); setBulkResult(null); }} className="text-slate-400 hover:text-slate-600">
                    ✕
                  </button>
                </div>

                <div className="p-4 space-y-4 flex-1 overflow-y-auto">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Actor Links / IDs (one per line)</label>
                    <textarea
                      rows={6}
                      value={bulkInputText}
                      onChange={(e) => setBulkInputText(e.target.value)}
                      placeholder="https://apify.com/clearpath/shopify-store-leads&#10;ecommerce_leads/store-leads-14m-e-commerce-leads&#10;scrapesage/ycombinator-scraper"
                      className="w-full font-mono text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={bulkImporting || !bulkInputText.trim()}
                      onClick={handleBulkImport}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition disabled:opacity-50"
                    >
                      {bulkImporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                      <span>Fetch & Validate Batch</span>
                    </button>
                  </div>

                  {bulkResult && (
                    <div className="space-y-3 pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">
                          Batch Preview: {bulkResult.drafts.length} Valid Drafts, {bulkResult.existing.length} Duplicates, {bulkResult.errors.length} Errors
                        </span>
                        {bulkResult.drafts.length > 0 && (
                          <button
                            type="button"
                            disabled={bulkImporting}
                            onClick={handleSaveBulkDrafts}
                            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition"
                          >
                            Save {bulkResult.drafts.length} Drafts to Catalog
                          </button>
                        )}
                      </div>

                      <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                            <tr>
                              <th className="p-2.5">Title & Slug</th>
                              <th className="p-2.5">Input Fields</th>
                              <th className="p-2.5">Suggested Sell</th>
                              <th className="p-2.5">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {bulkResult.drafts.map((d: any, idx: number) => (
                              <tr key={idx} className="hover:bg-slate-50">
                                <td className="p-2.5">
                                  <div className="font-bold text-slate-900">{d.display_name}</div>
                                  <div className="font-mono text-[10px] text-slate-400">{d.slug}</div>
                                </td>
                                <td className="p-2.5 text-slate-600">
                                  {d.input?.fields?.length || 0} mapped fields
                                </td>
                                <td className="p-2.5 font-bold text-slate-900">
                                  ₹{d.pricing?.sell?.per_1000_items || 0} / 1k
                                </td>
                                <td className="p-2.5">
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700">
                                    Ready Draft
                                  </span>
                                </td>
                              </tr>
                            ))}
                            {bulkResult.existing.map((ex: string, idx: number) => (
                              <tr key={`ex-${idx}`} className="bg-amber-50/50">
                                <td colSpan={3} className="p-2.5 text-slate-700 font-mono text-[11px]">
                                  {ex}
                                </td>
                                <td className="p-2.5">
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                                    Already Exists
                                  </span>
                                </td>
                              </tr>
                            ))}
                            {bulkResult.errors.map((er: any, idx: number) => (
                              <tr key={`err-${idx}`} className="bg-rose-50/50">
                                <td colSpan={3} className="p-2.5 text-rose-700 text-xs">
                                  <div className="font-mono text-[11px]">{er.input}</div>
                                  <div className="text-[10px] text-rose-500">{er.error}</div>
                                </td>
                                <td className="p-2.5">
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                                    Error
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 10-Gate Review & Activate Wizard Modal */}
          {wizardProduct && (
            <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-800">
                        10-Gate Quality Checklist
                      </span>
                      {wizardProduct.profile?.compatibility && (
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            wizardProduct.profile.compatibility.classification === 'FULLY_SUPPORTED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : wizardProduct.profile.compatibility.classification === 'SUPPORTED_WITH_LIMITS'
                              ? 'bg-blue-100 text-blue-800'
                              : wizardProduct.profile.compatibility.classification === 'ADMIN_REVIEW_REQUIRED'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {wizardProduct.profile.compatibility.classification.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-base text-slate-900 mt-1">{wizardProduct.display_name}</h3>
                    <p className="text-xs text-slate-500">
                      Verify all 10 quality gates before publishing this product to customer catalog
                    </p>
                  </div>
                  <button onClick={() => setWizardProduct(null)} className="text-slate-400 hover:text-slate-600">
                    ✕
                  </button>
                </div>

                {wizardProduct.profile?.compatibility?.classification === 'UNSUPPORTED' && (
                  <div className="bg-rose-50 border-b border-rose-200 px-5 py-3 text-xs text-rose-800 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Activation Blocked: </span>
                      This actor was classified as <strong>UNSUPPORTED</strong> ({wizardProduct.profile.compatibility.reasons?.join('; ')}).
                      Admin review & override is required before it can be published.
                    </div>
                  </div>
                )}

                <div className="p-5 space-y-2.5 flex-1 overflow-y-auto">
                  {[
                    {
                      key: 'link_imported',
                      label: '1. Link Normalized & Metadata Fetched',
                      desc: `Actor ID normalized to "${wizardProduct.provider?.actor_id || 'internal'}". Version & limits cached.`
                    },
                    {
                      key: 'actor_profile_approved',
                      label: '2. Actor Profile & Compatibility Classification Verified',
                      desc: `Classified as ${wizardProduct.profile?.compatibility?.classification || 'FULLY_SUPPORTED'} with capability detector.`
                    },
                    {
                      key: 'schema_mapped',
                      label: '3. Input Schema Mapped',
                      desc: `${wizardProduct.input?.fields?.length || 0} parameter fields typed with options, validation, and smart defaults.`
                    },
                    {
                      key: 'whitelabel_passed',
                      label: '4. White-Label Blocklist Scan',
                      desc: 'Zero upstream provider trademarks, URLs or author references found in customer-facing copy.'
                    },
                    {
                      key: 'pricing_validated',
                      label: '5. Pricing Floor & Margin Validated',
                      desc: `Sell price (₹${wizardProduct.pricing?.sell?.per_1000_items || 0}) covers provider cost with healthy profit margin.`
                    },
                    {
                      key: 'test_run_passed',
                      label: '6. Internal Test Run Verified',
                      desc: 'Executed a 5-item test extraction to confirm upstream execution and data delivery.'
                    },
                    {
                      key: 'output_reviewed',
                      label: '7. Output Views & File Formats Reviewed',
                      desc: 'Verified dataset views, key-value file attachments, preview columns and sanitized drop list.'
                    },
                    {
                      key: 'compliance_set',
                      label: '8. Compliance & Regulatory Disclaimers',
                      desc: wizardProduct.compliance?.contains_personal_data
                        ? 'Flagged: Contains personal contact data. GDPR / electronic marketing disclaimers applied.'
                        : 'Standard web intelligence extraction. No regulated personal data.'
                    },
                    {
                      key: 'studio_preview_verified',
                      label: '9. Extraction Studio Preview Verified',
                      desc: 'Dynamic form controls, sections, and live quotes verified in preview.'
                    },
                    {
                      key: 'multi_customer_risk_decided',
                      label: '10. Multi-Customer Isolation & Risk Decided',
                      desc: 'Isolated session memory, deduplication state, and customer namespaces confirmed.'
                    }
                  ].map((gate) => {
                    const gatesObj = wizardProduct.wizard_gates || {};
                    const isChecked = Boolean(gatesObj[gate.key]);
                    return (
                      <div
                        key={gate.key}
                        className={`p-3 rounded-xl border flex items-start justify-between gap-3 transition ${
                          isChecked ? 'bg-emerald-50/50 border-emerald-200' : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            disabled={updatingGate === gate.key}
                            onClick={() => handleToggleGate(wizardProduct.slug, gate.key, isChecked)}
                            className="mt-0.5 text-slate-400 hover:text-emerald-600 transition"
                          >
                            {isChecked ? (
                              <CheckCircle className="w-4 h-4 text-emerald-600 fill-emerald-100" />
                            ) : (
                              <div className="w-4 h-4 rounded-full border-2 border-slate-300" />
                            )}
                          </button>
                          <div>
                            <h4 className="text-xs font-bold text-slate-800">{gate.label}</h4>
                            <p className="text-[11px] text-slate-500 mt-0.5">{gate.desc}</p>
                          </div>
                        </div>

                        {gate.key === 'test_run_passed' && !isChecked && (
                          <button
                            type="button"
                            onClick={() => handleTestRun(wizardProduct.slug)}
                            className="px-2.5 py-1 bg-slate-900 text-white rounded-lg text-[11px] font-bold shrink-0 hover:bg-slate-800 transition"
                          >
                            Run Test
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    {Object.values(wizardProduct.wizard_gates || {}).filter(Boolean).length} / 10 Gates Verified
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setWizardProduct(null)}
                      className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      disabled={wizardProduct.profile?.compatibility?.classification === 'UNSUPPORTED'}
                      onClick={() => handleActivateFromWizard(wizardProduct)}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-bold rounded-xl shadow-md transition"
                    >
                      Publish & Activate Product
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Actor Profile & Evidence Modal */}
          {selectedProfileProduct && (
            <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl max-w-3xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                  <div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-100 text-purple-800">
                      Actor Profile & Capability Intelligence
                    </span>
                    <h3 className="font-bold text-base text-slate-900 mt-1">
                      {selectedProfileProduct.display_name || selectedProfileProduct.slug}
                    </h3>
                    <p className="text-xs text-slate-500 font-mono">
                      Provider ID: {selectedProfileProduct.provider?.actor_id || 'internal'}
                    </p>
                  </div>
                  <button onClick={() => setSelectedProfileProduct(null)} className="text-slate-400 hover:text-slate-600">
                    ✕
                  </button>
                </div>

                <div className="p-5 space-y-5 flex-1 overflow-y-auto text-xs">
                  {/* Compatibility Classification Card */}
                  {selectedProfileProduct.profile?.compatibility ? (
                    <div className="p-4 rounded-xl border bg-slate-50/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800">Compatibility Classification:</span>
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                            selectedProfileProduct.profile.compatibility.classification === 'FULLY_SUPPORTED'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : selectedProfileProduct.profile.compatibility.classification === 'SUPPORTED_WITH_LIMITS'
                              ? 'bg-blue-100 text-blue-800 border border-blue-300'
                              : selectedProfileProduct.profile.compatibility.classification === 'ADMIN_REVIEW_REQUIRED'
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : 'bg-rose-100 text-rose-800 border border-rose-300'
                          }`}
                        >
                          {selectedProfileProduct.profile.compatibility.classification.replace(/_/g, ' ')}
                        </span>
                      </div>

                      {selectedProfileProduct.profile.compatibility.reasons?.length > 0 && (
                        <div className="space-y-1 bg-white p-3 rounded-lg border border-slate-200">
                          <span className="font-semibold text-slate-700">Classification Assessment:</span>
                          <ul className="list-disc pl-4 space-y-0.5 text-slate-600">
                            {selectedProfileProduct.profile.compatibility.reasons.map((r: string, idx: number) => (
                              <li key={idx}>{r}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Evidence Checklist */}
                      {selectedProfileProduct.profile.compatibility.evidence?.length > 0 && (
                        <div className="space-y-1">
                          <span className="font-bold text-slate-700">Why? Security & Compatibility Evidence:</span>
                          <div className="rounded-lg border border-slate-200 overflow-hidden">
                            <table className="w-full text-left">
                              <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                                <tr>
                                  <th className="p-2">Check Name</th>
                                  <th className="p-2">Evidence Detail</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 bg-white">
                                {selectedProfileProduct.profile.compatibility.evidence.map((ev: any, idx: number) => (
                                  <tr key={idx} className="hover:bg-slate-50">
                                    <td className="p-2 font-mono text-[11px] text-slate-800 font-bold">{ev.check}</td>
                                    <td className="p-2 text-slate-600">{ev.detail}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800">
                      No cached ActorProfile detected for this product. Re-sync via drift check or import to analyze.
                    </div>
                  )}

                  {/* Capabilities Matrix */}
                  {selectedProfileProduct.profile?.capabilities && (
                    <div className="space-y-3">
                      <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                        Detected Capabilities (Studio Driver)
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        <div className="p-2.5 rounded-lg border border-slate-200 bg-white">
                          <span className="text-[10px] text-slate-400 block font-semibold uppercase">Pricing Model</span>
                          <span className="font-bold text-slate-900">{selectedProfileProduct.profile.capabilities.pricing_model}</span>
                        </div>
                        <div className="p-2.5 rounded-lg border border-slate-200 bg-white">
                          <span className="text-[10px] text-slate-400 block font-semibold uppercase">Runtime Class</span>
                          <span className="font-bold text-slate-900 capitalize">{selectedProfileProduct.profile.capabilities.runtime_class}</span>
                        </div>
                        <div className="p-2.5 rounded-lg border border-slate-200 bg-white">
                          <span className="text-[10px] text-slate-400 block font-semibold uppercase">Supports Max Items</span>
                          <span className="font-bold text-slate-900">
                            {selectedProfileProduct.profile.capabilities.supports_max_items ? '✅ Yes' : '❌ No'}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-lg border border-slate-200 bg-white">
                          <span className="text-[10px] text-slate-400 block font-semibold uppercase">Dataset Views</span>
                          <span className="font-bold text-slate-900">
                            {selectedProfileProduct.profile.capabilities.dataset_views?.length || 0} View Tabs
                          </span>
                        </div>
                        <div className="p-2.5 rounded-lg border border-slate-200 bg-white">
                          <span className="text-[10px] text-slate-400 block font-semibold uppercase">Files Output</span>
                          <span className="font-bold text-slate-900">
                            {selectedProfileProduct.profile.capabilities.output_kinds?.includes('key_value_files')
                              ? '📁 Key-Value Files'
                              : '📄 Dataset Only'}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-lg border border-slate-200 bg-white">
                          <span className="text-[10px] text-slate-400 block font-semibold uppercase">Permission Level</span>
                          <span className={`font-bold uppercase ${selectedProfileProduct.profile.capabilities.permission_level === 'full' ? 'text-rose-600' : 'text-slate-900'}`}>
                            {selectedProfileProduct.profile.capabilities.permission_level}
                          </span>
                        </div>
                      </div>

                      {/* Input Kinds Tags */}
                      <div className="p-3 rounded-lg border border-slate-200 bg-white space-y-1.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Detected Input Kinds:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {(selectedProfileProduct.profile.capabilities.input_kinds || []).map((k: string) => (
                            <span key={k} className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-700 font-mono text-[10px]">
                              {k}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Admin Override Panel */}
                  <div className="p-4 rounded-xl border border-purple-200 bg-purple-50/50 space-y-3">
                    <h4 className="font-bold text-purple-900 text-xs flex items-center gap-1.5">
                      <Edit2 className="w-3.5 h-3.5 text-purple-600" />
                      <span>Admin Classification Override</span>
                    </h4>
                    <p className="text-[11px] text-purple-700">
                      Super-admins may override the automatic classifier. All overrides are logged with an audit trail and timestamp.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] font-bold text-purple-900 block mb-1">Target Classification</label>
                        <select
                          value={overrideClass}
                          onChange={(e) => setOverrideClass(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg border border-purple-300 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                          <option value="FULLY_SUPPORTED">FULLY_SUPPORTED (All features auto)</option>
                          <option value="SUPPORTED_WITH_LIMITS">SUPPORTED_WITH_LIMITS (Safe limits active)</option>
                          <option value="ADMIN_REVIEW_REQUIRED">ADMIN_REVIEW_REQUIRED (Manual confirmation needed)</option>
                          <option value="UNSUPPORTED">UNSUPPORTED (Blocked from activation)</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-purple-900 block mb-1">Justification Reason (Mandatory)</label>
                        <input
                          type="text"
                          placeholder="e.g. Code reviewed manually and confirmed benign"
                          value={overrideReason}
                          onChange={(e) => setOverrideReason(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg border border-purple-300 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        disabled={savingOverride || !overrideReason.trim()}
                        onClick={() => handleOverrideClassification(selectedProfileProduct.slug)}
                        className="px-4 py-1.5 bg-purple-700 hover:bg-purple-800 text-white rounded-lg font-bold text-xs shadow-sm transition disabled:opacity-50"
                      >
                        {savingOverride ? 'Saving...' : 'Apply Classification Override'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setSelectedProfileProduct(null)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
          {driftResult && (
            <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-slate-900">Upstream Drift Check</h3>
                  <button onClick={() => setDriftResult(null)} className="text-slate-400 hover:text-slate-600">
                    ✕
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                    <span className="text-xs text-slate-600 font-medium">Sync Status:</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        driftResult.data.status === 'IN_SYNC'
                          ? 'bg-emerald-100 text-emerald-800'
                          : driftResult.data.status === 'SCHEMA_CHANGED'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {driftResult.data.status}
                    </span>
                  </div>

                  {driftResult.data.diffNotes && driftResult.data.diffNotes.length > 0 ? (
                    <div className="space-y-1">
                      <span className="text-xs font-bold text-slate-700">Detected Changes:</span>
                      <ul className="list-disc list-inside text-xs text-slate-600 space-y-1 bg-slate-50 p-3 rounded-xl">
                        {driftResult.data.diffNotes.map((note: string, idx: number) => (
                          <li key={idx}>{note}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      The extractor input schema, configuration hash, and pricing match upstream specifications perfectly.
                    </p>
                  )}
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => setDriftResult(null)}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          SUB-TAB 2: JOBS MONITOR & EXTRACTED DATA VIEWER
         ===================================================================== */}
      {subTab === 'jobs' && (
        <div className="space-y-4">
          {/* Controls Bar: Search & Status Filter */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 w-full md:w-auto flex-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by Job ID, Product, or User..."
                  value={jobSearchTerm}
                  onChange={(e) => setJobSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <select
                value={jobStatusFilter}
                onChange={(e) => setJobStatusFilter(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value="all">All Statuses</option>
                <option value="COMPLETED">Completed</option>
                <option value="RUNNING">Running</option>
                <option value="QUEUED">Queued</option>
                <option value="PARTIAL">Partial</option>
                <option value="FAILED">Failed</option>
                <option value="ABORTED">Aborted</option>
              </select>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto justify-end">
              <span className="text-xs text-slate-500">
                {jobs.filter((j) => (jobStatusFilter === 'all' || j.status === jobStatusFilter)).length} Job(s) Recorded
              </span>
              <button
                onClick={loadData}
                disabled={loading}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Jobs Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
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
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {jobs
                    .filter((j) => {
                      if (jobStatusFilter !== 'all' && j.status !== jobStatusFilter) return false;
                      if (jobSearchTerm.trim()) {
                        const q = jobSearchTerm.toLowerCase();
                        const matchId = (j.id || '').toLowerCase().includes(q);
                        const matchProduct = (j.product_name || j.product_slug || '').toLowerCase().includes(q);
                        const matchUser = (j.username || j.user_id || '').toLowerCase().includes(q);
                        return matchId || matchProduct || matchUser;
                      }
                      return true;
                    })
                    .map((j) => {
                      const delivered = Number(j.items_delivered || 0);
                      return (
                        <tr key={j.id} className="hover:bg-slate-50/80 transition">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">{j.id}</td>
                          <td className="py-3 px-4 text-slate-700">
                            <div className="font-semibold">{j.username || 'System User'}</div>
                            <div className="text-[10px] text-slate-400 font-mono truncate max-w-[120px]">{j.user_id}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-800">{j.product_name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{j.product_slug}</div>
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-800">
                            <span className={delivered > 0 ? 'text-emerald-700' : 'text-slate-500'}>
                              {delivered}
                            </span>
                            <span className="text-slate-400"> / {j.requested_items} items</span>
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-900">
                            ₹{Number(j.charged_amount || 0).toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-slate-500">
                            ₹{Number(j.provider_cost_converted || 0).toFixed(2)} (${Number(j.provider_cost_usd || 0).toFixed(4)})
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1 ${
                                j.status === 'COMPLETED'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : j.status === 'RUNNING'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200 animate-pulse'
                                  : j.status === 'PARTIAL'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : j.status === 'QUEUED'
                                  ? 'bg-slate-100 text-slate-700'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              {j.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                            {j.created_at ? new Date(j.created_at).toLocaleString() : '-'}
                          </td>
                          <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                            <button
                              onClick={() => handleOpenJobResults(j)}
                              className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg font-semibold text-xs transition inline-flex items-center gap-1"
                              title="View Extracted Data Table"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View Data ({delivered})</span>
                            </button>

                            {delivered > 0 && (
                              <>
                                <a
                                  href={api.dataMarketplace.getExportUrl(j.id, 'csv')}
                                  download
                                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition"
                                  title="Export CSV"
                                >
                                  <Download className="w-3 h-3" />
                                  <span>CSV</span>
                                </a>
                                <a
                                  href={api.dataMarketplace.getExportUrl(j.id, 'xlsx')}
                                  download
                                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition"
                                  title="Export Excel (.xlsx)"
                                >
                                  <Download className="w-3 h-3" />
                                  <span>XLSX</span>
                                </a>
                                <a
                                  href={api.dataMarketplace.getExportUrl(j.id, 'json')}
                                  download
                                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition"
                                  title="Export JSON"
                                >
                                  <Download className="w-3 h-3" />
                                  <span>JSON</span>
                                </a>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>

              {jobs.length === 0 && (
                <div className="p-12 text-center text-slate-400 text-xs">
                  No extraction jobs have been executed yet.
                </div>
              )}
            </div>
          </div>

          {/* =====================================================================
              MODAL: EXTRACTED RECORDS VIEWER & DATA INSPECTION
             ===================================================================== */}
          {selectedJobForResults && (
            <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl max-w-6xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Modal Header */}
                <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">Extracted Records Viewer</span>
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-mono text-[10px] font-bold rounded">
                        {selectedJobForResults.id}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-700">{selectedJobForResults.product_name}</span>
                      <span>•</span>
                      <span>User: {selectedJobForResults.username || selectedJobForResults.user_id}</span>
                      <span>•</span>
                      <span className="font-bold text-emerald-700">{resultsTotal} Records Collected</span>
                    </div>
                  </div>

                  {/* Export Options & Close */}
                  <div className="flex items-center gap-2">
                    <a
                      href={api.dataMarketplace.getExportUrl(selectedJobForResults.id, 'csv')}
                      download
                      className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition shadow-sm"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Download CSV</span>
                    </a>
                    <a
                      href={api.dataMarketplace.getExportUrl(selectedJobForResults.id, 'xlsx')}
                      download
                      className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition shadow-sm"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Excel (.xlsx)</span>
                    </a>
                    <a
                      href={api.dataMarketplace.getExportUrl(selectedJobForResults.id, 'json')}
                      download
                      className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition shadow-sm"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-600" />
                      <span>JSON</span>
                    </a>
                    <button
                      onClick={() => setSelectedJobForResults(null)}
                      className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition ml-2"
                      title="Close"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Sub-header Filter inside Modal */}
                <div className="p-3 border-b border-slate-100 bg-white flex items-center justify-between gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Filter records in current view..."
                      value={resultsSearch}
                      onChange={(e) => setResultsSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1 bg-slate-50 border border-slate-200 rounded-md text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="text-xs text-slate-500">
                    Showing Page {resultsPage} (Total {resultsTotal} items)
                  </div>
                </div>

                {/* Modal Table Body */}
                <div className="p-4 overflow-auto flex-1 bg-slate-50/50">
                  {loadingResults ? (
                    <div className="p-12 text-center text-slate-500">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-600 mb-2" />
                      <span className="text-xs">Fetching extracted records from storage...</span>
                    </div>
                  ) : jobResults.length === 0 ? (
                    <div className="p-12 text-center text-slate-400">
                      <Database className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                      <p className="text-xs font-semibold">No records extracted for this job.</p>
                      <p className="text-[11px] text-slate-400 mt-1">Status: {selectedJobForResults.status}</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                      <div className="overflow-x-auto max-h-[55vh]">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold sticky top-0 z-10">
                              <th className="py-2.5 px-3 w-12 text-center font-mono text-[10px] text-slate-400">#</th>
                              {Array.from(
                                new Set(jobResults.flatMap((item) => Object.keys(item || {})))
                              ).map((headerKey) => (
                                <th key={headerKey} className="py-2.5 px-3 uppercase tracking-wider text-[11px] whitespace-nowrap">
                                  {headerKey.replace(/_/g, ' ')}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {jobResults
                              .filter((item) => {
                                if (!resultsSearch.trim()) return true;
                                const q = resultsSearch.toLowerCase();
                                return Object.values(item).some((v) =>
                                  String(v ?? '').toLowerCase().includes(q)
                                );
                              })
                              .map((item, idx) => {
                                const allHeaders = Array.from(
                                  new Set(jobResults.flatMap((it) => Object.keys(it || {})))
                                );
                                return (
                                  <tr key={idx} className="hover:bg-slate-50/80 transition">
                                    <td className="py-2.5 px-3 text-center font-mono text-[10px] text-slate-400 bg-slate-50/50">
                                      {(resultsPage - 1) * 50 + idx + 1}
                                    </td>
                                    {allHeaders.map((header) => {
                                      const val = item[header];
                                      const isObj = val && typeof val === 'object';
                                      return (
                                        <td key={header} className="py-2.5 px-3 text-slate-700 max-w-xs truncate font-mono text-[11px]">
                                          {isObj ? (
                                            <span className="text-[10px] text-slate-500 bg-slate-100 px-1 py-0.5 rounded">
                                              {JSON.stringify(val)}
                                            </span>
                                          ) : val !== null && val !== undefined && val !== '' ? (
                                            String(val)
                                          ) : (
                                            <span className="text-slate-300">-</span>
                                          )}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                {/* Modal Footer with Pagination */}
                <div className="p-3 border-t border-slate-100 bg-white flex items-center justify-between">
                  <div className="text-xs text-slate-500">
                    Total: <strong className="text-slate-800">{resultsTotal}</strong> records
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handlePageChange(resultsPage - 1)}
                      disabled={resultsPage <= 1 || loadingResults}
                      className="px-2.5 py-1 border border-slate-200 rounded text-xs font-semibold text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition flex items-center gap-1"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Prev</span>
                    </button>
                    <span className="text-xs text-slate-600 font-semibold px-2">
                      Page {resultsPage} of {Math.max(1, Math.ceil(resultsTotal / 50))}
                    </span>
                    <button
                      onClick={() => handlePageChange(resultsPage + 1)}
                      disabled={resultsPage >= Math.ceil(resultsTotal / 50) || loadingResults}
                      className="px-2.5 py-1 border border-slate-200 rounded text-xs font-semibold text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition flex items-center gap-1"
                    >
                      <span>Next</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setSelectedJobForResults(null)}
                      className="ml-3 px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
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
        <div className="space-y-6 max-w-2xl">
          {/* Apify Provider API Credentials */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Key className="w-5 h-5 text-blue-600" />
              <div>
                <h3 className="font-bold text-sm text-slate-900">Upstream Provider API (Apify Engine)</h3>
                <p className="text-xs text-slate-500">
                  Configure your primary upstream actor engine. Customer UI and exports remain 100% white-labeled.
                </p>
              </div>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Apify API Token:
                </label>
                <div className="relative">
                  <input
                    type={showToken ? 'text' : 'password'}
                    value={settings.apify_api_token || ''}
                    onChange={(e) => setSettings({ ...settings, apify_api_token: e.target.value })}
                    placeholder="apify_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="w-full p-2.5 pr-20 border border-slate-200 rounded-lg font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <div className="absolute right-2 top-2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="p-1 text-slate-400 hover:text-slate-600 rounded"
                    >
                      {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Obtained from Apify Console → Settings → Integrations → API Tokens.
                </p>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Apify Webhook Signing Secret (Optional):
                </label>
                <div className="relative">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    value={settings.apify_webhook_secret || ''}
                    onChange={(e) => setSettings({ ...settings, apify_webhook_secret: e.target.value })}
                    placeholder="Your webhook shared secret or HMAC key"
                    className="w-full p-2.5 pr-10 border border-slate-200 rounded-lg font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    className="absolute right-3 top-2.5 p-1 text-slate-400 hover:text-slate-600 rounded"
                  >
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleTestApifyAuth}
                  disabled={testAuthLoading || !settings.apify_api_token}
                  className="px-3.5 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold rounded-lg border border-blue-200 flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  {testAuthLoading ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Activity className="w-3.5 h-3.5" />
                  )}
                  {testAuthLoading ? 'Verifying Token...' : 'Test Apify Connection'}
                </button>
              </div>

              {testAuthResult && (
                <div
                  className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
                    testAuthResult.success
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  {testAuthResult.success ? (
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="font-bold">
                      {testAuthResult.success ? 'Apify Connection Successful' : 'Connection Failed'}
                    </div>
                    <div className="text-[11px] mt-0.5 opacity-90">
                      {testAuthResult.success
                        ? `Authenticated as @${testAuthResult.username}${testAuthResult.email ? ` (${testAuthResult.email})` : ''}. Upstream actor executions are ready.`
                        : testAuthResult.error}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Marketplace Global Policies */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-3">
              Marketplace Global Policies
            </h3>

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

              <div className="pt-3">
                <button
                  onClick={handleSaveSettings}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm transition"
                >
                  Save API Credentials & Policies
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

