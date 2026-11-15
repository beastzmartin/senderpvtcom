import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { AdvancedExtractionStudio } from './AdvancedExtractionStudio';
import {
  Search,
  Filter,
  Play,
  Download,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  Database,
  Layers,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Building2,
  Globe,
  FileText,
  ChevronRight,
  Ban,
  Wallet,
  Eye,
  Sliders,
  X
} from 'lucide-react';

interface ProductItem {
  id: string;
  slug: string;
  display_name: string;
  tagline: string;
  description_md: string;
  category: string;
  icon?: string;
  status: string;
  definition: any;
}

interface JobItem {
  id: string;
  product_slug: string;
  product_name: string;
  requested_items: number;
  items_delivered: number;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'ABORTED';
  reserved_amount: number;
  charged_amount: number;
  currency: string;
  error_message?: string;
  created_at: string;
  finished_at?: string;
}

interface DataMarketplaceViewProps {
  onNavigateToExtensions?: () => void;
  onNavigateToWallet?: () => void;
}

export const DataMarketplaceView: React.FC<DataMarketplaceViewProps> = ({
  onNavigateToExtensions,
  onNavigateToWallet
}) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'catalog' | 'jobs'>('catalog');
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Modal states
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [studioProduct, setStudioProduct] = useState<ProductItem | null>(null);
  const [configuredInput, setConfiguredInput] = useState<Record<string, any>>({});
  const [requestedCount, setRequestedCount] = useState<number>(100);
  const [priceEstimate, setPriceEstimate] = useState<number | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [startingJob, setStartingJob] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Results Preview Modal
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobResults, setJobResults] = useState<any[]>([]);
  const [resultsTotal, setResultsTotal] = useState(0);
  const [loadingResults, setLoadingResults] = useState(false);

  // Available categories
  const categories = ['all', 'B2B & Sales', 'E-Commerce', 'Social Media', 'Real Estate', 'Directories'];

  useEffect(() => {
    loadProducts();
    if (activeTab === 'jobs') {
      loadJobs();
    }
  }, [activeTab, selectedCategory]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const res = await api.dataMarketplace.listProducts(selectedCategory);
      if (res.success) {
        setProducts(res.products);
      }
    } catch (err: any) {
      console.error('Failed to load products:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadJobs = async () => {
    try {
      const res = await api.dataMarketplace.listUserJobs({ limit: 50 });
      if (res.success) {
        setJobs(res.jobs);
      }
    } catch (err: any) {
      console.error('Failed to load jobs:', err);
    }
  };

  // Open Product Run Modal & calculate initial estimate
  const handleOpenRunModal = (prod: ProductItem) => {
    setSelectedProduct(prod);
    setErrorMsg(null);
    const initialInput: Record<string, any> = {};
    const minItems = prod.definition?.limits?.min_items || 10;
    const defaultItems = Math.max(minItems, 100);
    setRequestedCount(defaultItems);

    (prod.definition?.input?.fields || []).forEach((f: any) => {
      initialInput[f.key] = f.default !== undefined ? f.default : '';
    });
    setConfiguredInput(initialInput);
    triggerPriceEstimate(prod.slug, defaultItems);
  };

  const triggerPriceEstimate = async (slug: string, items: number) => {
    setEstimating(true);
    try {
      const res = await api.dataMarketplace.estimatePrice(slug, items);
      if (res.success) {
        setPriceEstimate(res.sellPrice);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setEstimating(false);
    }
  };

  const handleStartExtraction = async () => {
    if (!selectedProduct) return;
    setStartingJob(true);
    setErrorMsg(null);

    try {
      const res = await api.dataMarketplace.createJob(
        selectedProduct.slug,
        configuredInput,
        requestedCount
      );

      if (res.success) {
        setSelectedProduct(null);
        setActiveTab('jobs');
        loadJobs();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to start extraction job.');
    } finally {
      setStartingJob(false);
    }
  };

  const handleOpenResults = async (jobId: string) => {
    setActiveJobId(jobId);
    setLoadingResults(true);
    try {
      const res = await api.dataMarketplace.getJobResults(jobId, { page: 1, limit: 50 });
      if (res.success) {
        setJobResults(res.items);
        setResultsTotal(res.total);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingResults(false);
    }
  };

  const handleAbort = async (jobId: string) => {
    if (!confirm('Are you sure you want to stop this extraction run?')) return;
    try {
      await api.dataMarketplace.abortJob(jobId);
      loadJobs();
    } catch (err: any) {
      alert(err.message || 'Failed to abort job');
    }
  };

  const filteredProducts = products.filter((p) => {
    const matchSearch =
      p.display_name.toLowerCase().includes(search.toLowerCase()) ||
      p.tagline?.toLowerCase().includes(search.toLowerCase());
    return matchSearch;
  });

  if (studioProduct) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <AdvancedExtractionStudio
          product={studioProduct as any}
          onBack={() => setStudioProduct(null)}
          onJobStarted={() => {
            setStudioProduct(null);
            setActiveTab('jobs');
            loadJobs();
          }}
        />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner Header */}
      <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 text-white rounded-2xl p-6 shadow-xl border border-emerald-900/40 relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 opacity-10 pointer-events-none flex items-center pr-10">
          <Database className="w-64 h-64 text-emerald-400" />
        </div>
        <div className="relative z-10 space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Automated Data Extraction Marketplace</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight">On-Demand Intelligence & Lead Extraction</h1>
          <p className="text-slate-300 text-sm max-w-2xl">
            Extract verified business directories, contacts, and web data on autopilot.
            Pay only for successfully extracted items with automatic reserve & settlement.
          </p>

          {/* Navigation Pill Tabs */}
          <div className="flex items-center gap-3 pt-3">
            <button
              onClick={() => setActiveTab('catalog')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                activeTab === 'catalog'
                  ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                  : 'bg-white/10 text-white hover:bg-white/15'
              }`}
            >
              <Database className="w-4 h-4" />
              <span>Catalog Marketplace</span>
            </button>
            <button
              onClick={() => setActiveTab('jobs')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                activeTab === 'jobs'
                  ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                  : 'bg-white/10 text-white hover:bg-white/15'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>My Extraction Jobs</span>
            </button>

            {onNavigateToExtensions && (
              <button
                onClick={onNavigateToExtensions}
                className="px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 bg-white/10 text-white hover:bg-white/15"
                title="View extensions and modules store"
              >
                <Layers className="w-4 h-4" />
                <span>Extensions & Modules</span>
              </button>
            )}

            {onNavigateToWallet && (
              <button
                onClick={onNavigateToWallet}
                className="px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 bg-white/10 text-white hover:bg-white/15"
                title="View platform wallet and balance"
              >
                <Wallet className="w-4 h-4" />
                <span>Platform Wallet</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* =====================================================================
          TAB 1: CATALOG MARKETPLACE
         ===================================================================== */}
      {activeTab === 'catalog' && (
        <div className="space-y-6">
          {/* Search & Category Filter Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search data extractors & directories..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                    selectedCategory === cat
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat === 'all' ? 'All Categories' : cat}
                </button>
              ))}
            </div>
          </div>

          {/* Product Cards Grid */}
          {loading ? (
            <div className="p-12 text-center text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-600 mb-2" />
              <span className="text-sm">Loading available extractors...</span>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="p-12 bg-white rounded-xl border border-slate-200 text-center text-slate-500">
              <Database className="w-8 h-8 mx-auto text-slate-400 mb-2" />
              <p className="text-sm font-semibold">No extraction products found matching your search.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProducts.map((prod) => {
                const pricing = prod.definition?.pricing;
                const per1000 = pricing?.sell?.per_1000_items || 0;
                const flatRun = pricing?.sell?.per_run_flat || 0;
                const requiresSub = prod.definition?.access?.requires_subscription;

                return (
                  <div
                    key={prod.id}
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition flex flex-col justify-between overflow-hidden group"
                  >
                    <div className="p-5 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                          <Building2 className="w-5 h-5" />
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                            {prod.category}
                          </span>
                          {requiresSub && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                              Subscription Plan Required
                            </span>
                          )}
                        </div>
                      </div>

                      <div>
                        <h3 className="font-bold text-base text-slate-900 group-hover:text-emerald-700 transition">
                          {prod.display_name}
                        </h3>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{prod.tagline}</p>
                      </div>

                      {/* Pricing Tag */}
                      <div className="pt-2 border-t border-slate-100 flex items-baseline justify-between">
                        <div>
                          <span className="text-xs text-slate-400">Pricing:</span>
                          <span className="text-sm font-bold text-slate-900 ml-1.5">
                            {pricing?.mode === 'per_item' && `₹${per1000} / 1k results`}
                            {pricing?.mode === 'per_run' && `₹${flatRun} / run`}
                            {pricing?.mode === 'per_item_plus_run' && `₹${flatRun} + ₹${per1000}/1k`}
                          </span>
                        </div>
                        <span className="text-[11px] text-emerald-600 font-semibold">Min: ₹{pricing?.min_charge || 5}</span>
                      </div>
                    </div>

                    <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[11px] text-slate-500 font-medium">Verified Outputs</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setStudioProduct(prod)}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition flex items-center gap-1.5"
                          title="Open dynamic parameters in Advanced Studio"
                        >
                          <Sliders className="w-3.5 h-3.5" />
                          <span>Extraction Studio</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 2: MY EXTRACTION JOBS
         ===================================================================== */}
      {activeTab === 'jobs' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-600" />
              <span>Extraction Run History</span>
            </h2>
            <button
              onClick={loadJobs}
              className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Refresh</span>
            </button>
          </div>

          {jobs.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <Clock className="w-8 h-8 mx-auto text-slate-400 mb-2" />
              <p className="text-sm font-semibold">No extraction runs recorded yet.</p>
              <p className="text-xs text-slate-400 mt-1">Select an extractor from the catalog to launch your first job.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Job ID</th>
                    <th className="py-3 px-4">Extractor</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Delivered / Target</th>
                    <th className="py-3 px-4">Charge Settle</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {jobs.map((job) => {
                    return (
                      <tr key={job.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-4 font-mono text-[11px] font-bold text-slate-900">
                          {job.id}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-800">
                          {job.product_name}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              job.status === 'COMPLETED'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : job.status === 'RUNNING'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200 animate-pulse'
                                : job.status === 'PARTIAL'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : job.status === 'QUEUED'
                                ? 'bg-slate-100 text-slate-700'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {job.status === 'COMPLETED' && <CheckCircle className="w-3 h-3" />}
                            {job.status === 'RUNNING' && <RefreshCw className="w-3 h-3 animate-spin" />}
                            {job.status === 'FAILED' && <XCircle className="w-3 h-3" />}
                            {job.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-700">
                          {job.items_delivered} / {job.requested_items} items
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">
                            ₹{job.charged_amount ? Number(job.charged_amount).toFixed(2) : '0.00'}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Res: ₹{Number(job.reserved_amount || 0).toFixed(2)}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                          {job.created_at ? new Date(job.created_at).toLocaleString() : '-'}
                        </td>
                        <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                          {job.items_delivered > 0 && (
                            <>
                              <button
                                onClick={() => handleOpenResults(job.id)}
                                className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded font-semibold text-[11px] transition inline-flex items-center gap-1"
                              >
                                <Eye className="w-3 h-3" />
                                <span>View Results ({job.items_delivered})</span>
                              </button>
                              <a
                                href={api.dataMarketplace.getExportUrl(job.id, 'csv')}
                                download
                                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-semibold inline-flex items-center gap-1 transition"
                                title="Download CSV"
                              >
                                <Download className="w-3 h-3" />
                                <span>CSV</span>
                              </a>
                              <a
                                href={api.dataMarketplace.getExportUrl(job.id, 'xlsx')}
                                download
                                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-semibold inline-flex items-center gap-1 transition"
                                title="Download Excel"
                              >
                                <Download className="w-3 h-3" />
                                <span>XLSX</span>
                              </a>
                            </>
                          )}
                          {job.status === 'RUNNING' && (
                            <button
                              onClick={() => handleAbort(job.id)}
                              className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded font-semibold text-[11px] transition inline-flex items-center gap-1"
                            >
                              <Ban className="w-3 h-3" />
                              <span>Abort</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          MODAL: CONFIGURE & RUN PRODUCT
         ===================================================================== */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-bold text-base text-slate-900">{selectedProduct.display_name}</h3>
                <p className="text-xs text-slate-500">Configure parameters & target dataset size</p>
              </div>
              <button
                onClick={() => setSelectedProduct(null)}
                className="text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Dynamic Inputs from ProductDefinition schema */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Extraction Inputs</h4>
                {(selectedProduct.definition?.input?.fields || []).map((field: any) => {
                  if (!field.visible_to_user) return null;

                  return (
                    <div key={field.key} className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                        <span>
                          {field.label} {field.required && <span className="text-rose-500">*</span>}
                        </span>
                        {field.help && <span className="text-[10px] text-slate-400">{field.help}</span>}
                      </label>

                      {field.type === 'select' ? (
                        <select
                          value={configuredInput[field.key] || ''}
                          onChange={(e) => setConfiguredInput({ ...configuredInput, [field.key]: e.target.value })}
                          className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          {(field.options || []).map((opt: any) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      ) : field.type === 'boolean' ? (
                        <div className="flex items-center gap-2 pt-1">
                          <input
                            type="checkbox"
                            id={`field-${field.key}`}
                            checked={Boolean(configuredInput[field.key])}
                            onChange={(e) => setConfiguredInput({ ...configuredInput, [field.key]: e.target.checked })}
                            className="rounded text-emerald-600 focus:ring-emerald-500"
                          />
                          <label htmlFor={`field-${field.key}`} className="text-xs text-slate-600">
                            Enable {field.label}
                          </label>
                        </div>
                      ) : field.type === 'textarea' ? (
                        <textarea
                          rows={3}
                          value={configuredInput[field.key] || ''}
                          onChange={(e) => setConfiguredInput({ ...configuredInput, [field.key]: e.target.value })}
                          className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      ) : (
                        <input
                          type={field.type === 'number' ? 'number' : 'text'}
                          value={configuredInput[field.key] || ''}
                          onChange={(e) => setConfiguredInput({ ...configuredInput, [field.key]: e.target.value })}
                          className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Items Count Slider & Real-Time Estimator */}
              <div className="pt-4 border-t border-slate-100 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800">Target Results Count:</label>
                  <span className="text-sm font-black text-emerald-700">{requestedCount} items</span>
                </div>

                <input
                  type="range"
                  min={selectedProduct.definition?.limits?.min_items || 10}
                  max={selectedProduct.definition?.limits?.max_items_per_run || 500}
                  step={10}
                  value={requestedCount}
                  onChange={(e) => {
                    const count = parseInt(e.target.value, 10);
                    setRequestedCount(count);
                    triggerPriceEstimate(selectedProduct.slug, count);
                  }}
                  className="w-full accent-emerald-600"
                />

                {/* Estimate & Wallet Balance Box */}
                <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-slate-500">Estimated Max Charge (Reserve):</span>
                    <div className="text-base font-black text-emerald-800">
                      {estimating ? (
                        <RefreshCw className="w-4 h-4 animate-spin text-emerald-600 inline" />
                      ) : (
                        `₹${priceEstimate ? priceEstimate.toFixed(2) : '0.00'}`
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500">Safe Settlement Rule:</span>
                    <p className="text-[10px] font-semibold text-emerald-700">Charged only for delivered results</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <button
                onClick={() => setSelectedProduct(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleStartExtraction}
                disabled={startingJob}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center gap-2"
              >
                {startingJob ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                <span>Start Extraction Run</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: JOB RESULTS PREVIEW & EXPORT
         ===================================================================== */}
      {activeJobId && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-bold text-sm text-slate-900">Extracted Results Preview</h3>
                <p className="text-xs text-slate-500">{resultsTotal} total records collected</p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={api.dataMarketplace.getExportUrl(activeJobId, 'csv')}
                  download
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>CSV</span>
                </a>
                <a
                  href={api.dataMarketplace.getExportUrl(activeJobId, 'xlsx')}
                  download
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Excel (.xlsx)</span>
                </a>
                <a
                  href={api.dataMarketplace.getExportUrl(activeJobId, 'json')}
                  download
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>JSON</span>
                </a>
                <button
                  onClick={() => setActiveJobId(null)}
                  className="text-slate-400 hover:text-slate-600 transition ml-2"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 overflow-auto flex-1">
              {loadingResults ? (
                <div className="p-12 text-center text-slate-500">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-600 mb-2" />
                  <span className="text-xs">Fetching collected dataset...</span>
                </div>
              ) : jobResults.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-xs">No records available for preview.</div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                        {Object.keys(jobResults[0] || {}).map((col) => (
                          <th key={col} className="p-2.5 capitalize whitespace-nowrap">
                            {col.replace(/_/g, ' ')}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {jobResults.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/70">
                          {Object.values(row).map((val: any, cIdx) => (
                            <td key={cIdx} className="p-2.5 max-w-xs truncate text-slate-800">
                              {typeof val === 'object' ? JSON.stringify(val) : String(val ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

