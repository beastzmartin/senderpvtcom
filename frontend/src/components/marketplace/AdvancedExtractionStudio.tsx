import React, { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
  ArrowLeft,
  Play,
  Download,
  RefreshCw,
  Sliders,
  Sparkles,
  Save,
  Trash2,
  Bookmark,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Database,
  Lock,
  Plus,
  Trash,
  HelpCircle,
  FileSpreadsheet,
  FileText,
  FileCode,
  Search,
  Eye,
  Wallet
} from 'lucide-react';

interface InputField {
  key: string;
  provider_key: string;
  label: string;
  help?: string;
  type: string;
  required: boolean;
  default?: any;
  options?: Array<{ label: string; value: string | number }>;
  min?: number | null;
  max?: number | null;
  visible_to_user: boolean;
  section_caption?: string;
  section_description?: string;
  advanced?: boolean;
  locked_value?: any;
  show_if?: { field: string; equals: any };
  affects_cost?: boolean;
  unit?: string;
  pattern?: string;
  placeholder?: string;
}

interface ProductDefinition {
  slug: string;
  display_name: string;
  tagline: string;
  description_md: string;
  category: string;
  icon?: string;
  status: string;
  input: {
    fields: InputField[];
    static_overrides: Record<string, any>;
    hidden_defaults: Record<string, any>;
  };
  limits: {
    min_items: number;
    max_items_per_run: number;
    max_concurrent_runs_per_user: number;
    timeout_secs: number;
  };
  pricing: {
    mode: string;
    sell: {
      per_1000_items: number;
      per_run_flat: number;
    };
    min_charge: number;
    quote_ttl_secs?: number;
  };
  compliance?: {
    contains_personal_data: boolean;
    disclaimer_md?: string;
  };
}

interface UserPreset {
  id: string;
  name: string;
  input_data: Record<string, any>;
  created_at: string;
}

interface PriceQuote {
  quoteId: string;
  productSlug: string;
  requestedItems: number;
  currency: string;
  sellPrice: number;
  providerCostConverted: number;
  expiresAt: string;
  minChargeApplied: boolean;
  signature: string;
}

interface ActiveJob {
  id: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'ABORTED';
  requested_items: number;
  items_delivered: number;
  reserved_amount: number;
  charged_amount: number;
  currency: string;
  error_message?: string;
  created_at: string;
}

interface Props {
  product: {
    id: string;
    slug: string;
    display_name: string;
    tagline: string;
    category: string;
    definition: ProductDefinition;
  };
  onBack: () => void;
  onJobStarted?: (jobId: string) => void;
}

export const AdvancedExtractionStudio: React.FC<Props> = ({ product, onBack, onJobStarted }) => {
  const { user } = useAuth();
  const def = product.definition;

  // Form State
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [requestedItems, setRequestedItems] = useState<number>(() => {
    const min = def.limits?.min_items || 10;
    return Math.max(min, 100);
  });
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  // Presets State
  const [presets, setPresets] = useState<UserPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [newPresetName, setNewPresetName] = useState<string>('');
  const [showSavePresetModal, setShowSavePresetModal] = useState<boolean>(false);
  const [savingPreset, setSavingPreset] = useState<boolean>(false);

  // Quote State
  const [quote, setQuote] = useState<PriceQuote | null>(null);
  const [quoteSecondsRemaining, setQuoteSecondsRemaining] = useState<number>(300);
  const [loadingQuote, setLoadingQuote] = useState<boolean>(false);

  // Execution State
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);
  const [activityLogs, setActivityLogs] = useState<string[]>([]);
  const [executionError, setExecutionError] = useState<string | null>(null);

  // Results State
  const [results, setResults] = useState<any[]>([]);
  const [resultsTotal, setResultsTotal] = useState<number>(0);
  const [resultsColumns, setResultsColumns] = useState<string[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({});
  const [resultFilter, setResultFilter] = useState<string>('');
  const [resultsPage, setResultsPage] = useState<number>(1);
  const [loadingResults, setLoadingResults] = useState<boolean>(false);
  const [showColumnChooser, setShowColumnChooser] = useState<boolean>(false);

  // Polling ref for active job
  const pollTimerRef = useRef<any>(null);

  // Initialize form defaults
  useEffect(() => {
    const initial: Record<string, any> = {};
    (def.input?.fields || []).forEach((field) => {
      if (field.locked_value !== undefined) {
        initial[field.key] = field.locked_value;
      } else if (field.default !== undefined && field.default !== null) {
        initial[field.key] = field.default;
      } else if (field.type === 'boolean') {
        initial[field.key] = false;
      } else if (field.type === 'url_list' || field.type === 'string_list') {
        initial[field.key] = [];
      } else if (field.type === 'key_value') {
        initial[field.key] = {};
      } else {
        initial[field.key] = '';
      }
    });
    setFormValues(initial);
    loadPresets();
    fetchQuote(requestedItems);
  }, [product.slug]);

  // Quote TTL Timer
  useEffect(() => {
    if (!quote?.expiresAt) return;
    const interval = setInterval(() => {
      const expiresMs = new Date(quote.expiresAt).getTime();
      const remainingSecs = Math.max(0, Math.floor((expiresMs - Date.now()) / 1000));
      setQuoteSecondsRemaining(remainingSecs);

      if (remainingSecs <= 0) {
        // Auto-refresh expired quote
        fetchQuote(requestedItems);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [quote?.expiresAt, requestedItems]);

  // Polling for Active Job
  useEffect(() => {
    if (activeJob && (activeJob.status === 'RUNNING' || activeJob.status === 'QUEUED')) {
      pollTimerRef.current = setTimeout(async () => {
        try {
          const res = await api.dataMarketplace.getJob(activeJob.id);
          if (res.success && res.job) {
            setActiveJob(res.job);
            if (res.job.status === 'RUNNING') {
              appendLog(`Running extraction... ${res.job.items_delivered} records collected`);
            } else if (res.job.status === 'COMPLETED') {
              appendLog(`Extraction completed successfully. ${res.job.items_delivered} records delivered.`);
              loadJobResults(res.job.id);
            } else if (res.job.status === 'FAILED') {
              appendLog(`Extraction ended with error: ${res.job.error_message || 'Worker terminated'}`);
            }
          }
        } catch (err) {
          console.error('Job polling error:', err);
        }
      }, 2500);
    }

    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [activeJob?.status, activeJob?.id, activeJob?.items_delivered]);

  const appendLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setActivityLogs((prev) => [`[${timestamp}] ${msg}`, ...prev.slice(0, 40)]);
  };

  const loadPresets = async () => {
    try {
      const res = await api.dataMarketplace.listUserPresets(product.slug);
      if (res.success && res.presets) {
        setPresets(res.presets);
      }
    } catch (err) {
      console.error('Failed to load presets:', err);
    }
  };

  const fetchQuote = async (items: number) => {
    setLoadingQuote(true);
    try {
      const res = await api.dataMarketplace.createQuote(product.slug, items);
      if (res.success && res.quote) {
        setQuote(res.quote);
      }
    } catch (err) {
      console.error('Failed to fetch quote:', err);
    } finally {
      setLoadingQuote(false);
    }
  };

  const handleApplyPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    if (!presetId) return;
    const found = presets.find((p) => p.id === presetId);
    if (found) {
      setFormValues((prev) => ({
        ...prev,
        ...found.input_data
      }));
      appendLog(`Applied preset "${found.name}"`);
    }
  };

  const handleSavePreset = async () => {
    if (!newPresetName.trim()) return;
    setSavingPreset(true);
    try {
      const res = await api.dataMarketplace.saveUserPreset(product.slug, newPresetName.trim(), formValues);
      if (res.success) {
        appendLog(`Preset "${newPresetName.trim()}" saved`);
        setNewPresetName('');
        setShowSavePresetModal(false);
        await loadPresets();
        setSelectedPresetId(res.preset.id);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to save preset');
    } finally {
      setSavingPreset(false);
    }
  };

  const handleDeletePreset = async (presetId: string) => {
    if (!confirm('Are you sure you want to delete this preset?')) return;
    try {
      await api.dataMarketplace.deleteUserPreset(presetId);
      if (selectedPresetId === presetId) setSelectedPresetId('');
      loadPresets();
    } catch (err: any) {
      alert(err.message || 'Failed to delete preset');
    }
  };

  const handleFieldChange = (key: string, val: any) => {
    setFormValues((prev) => ({ ...prev, [key]: val }));
  };

  const handleItemsChange = (newCount: number) => {
    const min = def.limits?.min_items || 10;
    const max = def.limits?.max_items_per_run || 5000;
    const clamped = Math.max(min, Math.min(max, newCount));
    setRequestedItems(clamped);
    fetchQuote(clamped);
  };

  // Launch Job
  const handleLaunchExtraction = async () => {
    setSubmitting(true);
    setExecutionError(null);
    setActivityLogs([]);
    appendLog('Validating parameters and submitting extraction task...');

    try {
      const res = await api.dataMarketplace.createJob(product.slug, formValues, requestedItems);
      if (res.success && res.job) {
        setActiveJob(res.job);
        appendLog(`Extraction job created. Tracking run ID: ${res.job.id}`);
        appendLog(`Wallet reserve locked: ₹${res.job.reserved_amount.toFixed(2)} ${res.job.currency}`);
        if (onJobStarted) onJobStarted(res.job.id);
      } else {
        throw new Error('Failed to start extraction.');
      }
    } catch (err: any) {
      setExecutionError(err.message || 'Extraction launch rejected.');
      appendLog(`Error: ${err.message || 'Launch failed'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAbortJob = async () => {
    if (!activeJob) return;
    if (!confirm('Abort extraction run? Partial records extracted so far will be saved and unused reserve refunded.')) return;
    try {
      await api.dataMarketplace.abortJob(activeJob.id);
      appendLog('Abort signal sent. Terminating worker...');
      const res = await api.dataMarketplace.getJob(activeJob.id);
      if (res.success) setActiveJob(res.job);
    } catch (err: any) {
      alert(err.message || 'Failed to abort');
    }
  };

  const loadJobResults = async (jobId: string, page = 1) => {
    setLoadingResults(true);
    try {
      const res = await api.dataMarketplace.getJobResults(jobId, { page, limit: 50 });
      if (res.success) {
        setResults(res.items || []);
        setResultsTotal(res.total || 0);
        setResultsPage(page);

        // Derive columns from output items
        if (res.items && res.items.length > 0) {
          const sample = res.items[0];
          const cols = Object.keys(sample);
          setResultsColumns(cols);

          const initialVisible: Record<string, boolean> = {};
          cols.forEach((col, idx) => {
            initialVisible[col] = idx < 8; // default to first 8 columns
          });
          setVisibleColumns(initialVisible);
        }
      }
    } catch (err) {
      console.error('Failed to load results:', err);
    } finally {
      setLoadingResults(false);
    }
  };

  // Group fields by section caption
  const groupedFields = useMemo(() => {
    const fields = def.input?.fields || [];
    const groups: Array<{ caption: string; description?: string; fields: InputField[] }> = [];
    const captionMap = new Map<string, InputField[]>();

    fields.forEach((f) => {
      // Evaluate show_if condition
      if (f.show_if) {
        const dependentValue = formValues[f.show_if.field];
        if (dependentValue !== f.show_if.equals) {
          return; // Skip rendering hidden conditional field
        }
      }

      // Filter advanced vs basic
      if (!showAdvanced && f.advanced) {
        return;
      }

      const caption = f.section_caption || 'General Configuration';
      if (!captionMap.has(caption)) {
        captionMap.set(caption, []);
      }
      captionMap.get(caption)!.push(f);
    });

    captionMap.forEach((gFields, caption) => {
      groups.push({
        caption,
        description: gFields[0]?.section_description,
        fields: gFields
      });
    });

    return groups;
  }, [def.input?.fields, formValues, showAdvanced]);

  // Wallet check
  const walletBalance = Number((user as any)?.balance || 0);
  const requiredBalance = quote?.sellPrice || 0;
  const isBalanceSufficient = walletBalance >= requiredBalance;

  // Filtered Results
  const filteredResults = useMemo(() => {
    if (!resultFilter.trim()) return results;
    const q = resultFilter.toLowerCase();
    return results.filter((row) =>
      Object.values(row).some((val) => String(val || '').toLowerCase().includes(q))
    );
  }, [results, resultFilter]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      {/* Top Header Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
            title="Back to Catalog"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                {product.category || 'Data Extractor'}
              </span>
              <span className="text-xs text-slate-400">Advanced Extraction Studio</span>
            </div>
            <h1 className="text-xl md:text-2xl font-black tracking-tight mt-1">{product.display_name}</h1>
            <p className="text-xs text-slate-400 max-w-xl">{product.tagline}</p>
          </div>
        </div>

        {/* Preset Selector & Wallet Balance */}
        <div className="flex items-center gap-3">
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl px-3 py-2 flex items-center gap-2 text-xs">
            <Wallet className="w-4 h-4 text-emerald-400" />
            <span className="text-slate-400">Balance:</span>
            <span className="font-bold text-white">₹{walletBalance.toFixed(2)}</span>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedPresetId}
              onChange={(e) => handleApplyPreset(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="">-- Load Saved Preset --</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <button
              onClick={() => setShowSavePresetModal(true)}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
              title="Save current parameters as preset"
            >
              <Save className="w-3.5 h-3.5 text-emerald-400" />
              <span>Save Preset</span>
            </button>

            {selectedPresetId && (
              <button
                onClick={() => handleDeletePreset(selectedPresetId)}
                className="p-2 text-rose-400 hover:bg-rose-500/10 rounded-xl border border-rose-500/20 transition"
                title="Delete selected preset"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Compliance / Regulatory Notice if personal data */}
      {def.compliance?.contains_personal_data && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-xs text-amber-300 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-amber-200">Public Contact Data Notice: </span>
            {def.compliance?.disclaimer_md ||
              'This extraction product accesses publicly published contact information. Ensure compliance with CAN-SPAM, GDPR, and relevant data handling regulations in your jurisdiction.'}
          </div>
        </div>
      )}

      {/* Main Studio Layout: Dynamic Form on Left, Sticky Live Quote & Monitor on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Input Form (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800 mb-6">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-500" />
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Extraction Parameters</h2>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500 dark:text-slate-400 cursor-pointer flex items-center gap-2">
                  <span>Show Advanced Controls</span>
                  <input
                    type="checkbox"
                    checked={showAdvanced}
                    onChange={(e) => setShowAdvanced(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-slate-700 dark:bg-slate-800"
                  />
                </label>
              </div>
            </div>

            {/* Render Parameter Groups */}
            <div className="space-y-6">
              {groupedFields.map((group, gIdx) => {
                const isCollapsed = Boolean(collapsedSections[group.caption]);
                return (
                  <div key={gIdx} className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() =>
                        setCollapsedSections((prev) => ({
                          ...prev,
                          [group.caption]: !prev[group.caption]
                        }))
                      }
                      className="w-full bg-slate-50 dark:bg-slate-800/50 px-4 py-3 text-left flex items-center justify-between font-semibold text-xs text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                      <div className="flex items-center gap-2">
                        {isCollapsed ? <ChevronRight className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                        <span>{group.caption}</span>
                        <span className="text-[10px] text-slate-400 font-normal">({group.fields.length} controls)</span>
                      </div>
                      {group.description && <span className="text-[10px] text-slate-400 truncate max-w-xs">{group.description}</span>}
                    </button>

                    {!isCollapsed && (
                      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-white dark:bg-slate-900">
                        {group.fields.map((field) => {
                          const isFullWidth =
                            field.type === 'textarea' ||
                            field.type === 'url_list' ||
                            field.type === 'string_list' ||
                            field.type === 'key_value' ||
                            field.type === 'json' ||
                            field.type === 'object';
                          const isLocked = field.locked_value !== undefined;
                          const val = formValues[field.key];

                          return (
                            <div key={field.key} className={isFullWidth ? 'md:col-span-2 space-y-1.5' : 'space-y-1.5'}>
                              <div className="flex items-center justify-between">
                                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                  <span>{field.label}</span>
                                  {field.required && <span className="text-rose-500">*</span>}
                                  {isLocked && (
                                    <span title="Fixed platform default">
                                      <Lock className="w-3 h-3 text-amber-500" />
                                    </span>
                                  )}
                                </label>
                                {field.unit && <span className="text-[10px] text-slate-400">{field.unit}</span>}
                              </div>

                              {/* Field Type Specific Controls */}
                              {field.type === 'boolean' ? (
                                <div className="flex items-center gap-3 pt-1">
                                  <button
                                    type="button"
                                    disabled={isLocked}
                                    onClick={() => handleFieldChange(field.key, !val)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                                      val ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
                                    }`}
                                  >
                                    <span
                                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                        val ? 'translate-x-6' : 'translate-x-1'
                                      }`}
                                    />
                                  </button>
                                  <span className="text-xs text-slate-600 dark:text-slate-400">{val ? 'Enabled' : 'Disabled'}</span>
                                </div>
                              ) : field.type === 'select' ? (
                                <select
                                  disabled={isLocked}
                                  value={val ?? ''}
                                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                                >
                                  {(field.options || []).map((opt, oIdx) => (
                                    <option key={oIdx} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              ) : field.type === 'multiselect' ? (
                                <div className="flex flex-wrap gap-2 pt-1">
                                  {(field.options || []).map((opt, oIdx) => {
                                    const selectedArr = Array.isArray(val) ? val : [];
                                    const isSelected = selectedArr.includes(opt.value);
                                    return (
                                      <button
                                        key={oIdx}
                                        type="button"
                                        disabled={isLocked}
                                        onClick={() => {
                                          const next = isSelected
                                            ? selectedArr.filter((x) => x !== opt.value)
                                            : [...selectedArr, opt.value];
                                          handleFieldChange(field.key, next);
                                        }}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                                          isSelected
                                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                                        }`}
                                      >
                                        {opt.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : field.type === 'number' ? (
                                <input
                                  type="number"
                                  disabled={isLocked}
                                  min={field.min ?? undefined}
                                  max={field.max ?? undefined}
                                  value={val ?? ''}
                                  onChange={(e) => handleFieldChange(field.key, e.target.value ? Number(e.target.value) : '')}
                                  placeholder={field.placeholder || 'e.g. 50'}
                                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                                />
                              ) : field.type === 'textarea' ? (
                                <textarea
                                  disabled={isLocked}
                                  rows={3}
                                  value={val ?? ''}
                                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                                  placeholder={field.placeholder || ''}
                                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                                />
                              ) : field.type === 'url_list' || field.type === 'string_list' ? (
                                <div className="space-y-1.5">
                                  <textarea
                                    disabled={isLocked}
                                    rows={3}
                                    value={Array.isArray(val) ? val.join('\n') : (val || '')}
                                    onChange={(e) => {
                                      const lines = e.target.value.split('\n');
                                      handleFieldChange(field.key, lines);
                                    }}
                                    placeholder={field.placeholder || 'Enter one item per line...'}
                                    className="w-full font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                                  />
                                  <span className="text-[10px] text-slate-400">One item per line</span>
                                </div>
                              ) : field.type === 'date' ? (
                                <input
                                  type="date"
                                  disabled={isLocked}
                                  value={val ?? ''}
                                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                                />
                              ) : field.type === 'json' || field.type === 'object' ? (
                                <textarea
                                  disabled={isLocked}
                                  rows={4}
                                  value={typeof val === 'object' ? JSON.stringify(val, null, 2) : (val || '')}
                                  onChange={(e) => {
                                    try {
                                      const parsed = JSON.parse(e.target.value);
                                      handleFieldChange(field.key, parsed);
                                    } catch {
                                      handleFieldChange(field.key, e.target.value);
                                    }
                                  }}
                                  placeholder="{}"
                                  className="w-full font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                                />
                              ) : (
                                <input
                                  type={field.type === 'url' ? 'url' : 'text'}
                                  disabled={isLocked}
                                  value={val ?? ''}
                                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                                  placeholder={field.placeholder || ''}
                                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                                />
                              )}

                              {field.help && <p className="text-[11px] text-slate-500 dark:text-slate-400">{field.help}</p>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Live Quote, Wallet Balance & Run Monitor (1 col) */}
        <div className="space-y-6">
          {/* Quote & Checkout Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl text-white space-y-5 sticky top-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-sm">Real-Time Quote</h3>
              </div>
              {quote && (
                <div className="flex items-center gap-1.5 text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  <Clock className="w-3 h-3" />
                  <span>
                    {Math.floor(quoteSecondsRemaining / 60)}:
                    {(quoteSecondsRemaining % 60).toString().padStart(2, '0')}
                  </span>
                </div>
              )}
            </div>

            {/* Target Records Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Target Records:</span>
                <span className="font-bold text-emerald-400">{requestedItems} leads</span>
              </div>
              <input
                type="range"
                min={def.limits?.min_items || 10}
                max={def.limits?.max_items_per_run || 1000}
                step={10}
                value={requestedItems}
                onChange={(e) => handleItemsChange(Number(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>Min: {def.limits?.min_items || 10}</span>
                <span>Max: {def.limits?.max_items_per_run || 1000}</span>
              </div>
            </div>

            {/* Financial Breakdown */}
            <div className="space-y-2.5 pt-2 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Rate per 1,000 items:</span>
                <span className="text-slate-200">₹{(def.pricing?.sell?.per_1000_items || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Minimum charge:</span>
                <span className="text-slate-200">₹{(def.pricing?.min_charge || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Settlement policy:</span>
                <span className="text-emerald-400">Pay only for delivered items</span>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-between items-baseline">
                <div>
                  <span className="text-sm font-bold text-white">Estimated Reserve</span>
                  <p className="text-[10px] text-slate-400">Unused balance refunded instantly</p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-black text-emerald-400">
                    ₹{quote ? quote.sellPrice.toFixed(2) : '...'}
                  </span>
                  <span className="text-xs text-slate-400 ml-1">INR</span>
                </div>
              </div>
            </div>

            {/* Launch / Top-up Action */}
            {isBalanceSufficient ? (
              <button
                type="button"
                disabled={Boolean(submitting || (activeJob && (activeJob.status === 'RUNNING' || activeJob.status === 'QUEUED')))}
                onClick={handleLaunchExtraction}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 font-bold text-slate-950 text-sm shadow-lg shadow-emerald-500/20 disabled:opacity-50 transition flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Reserving & Disagreeing...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-slate-950" />
                    <span>Launch Extraction Run</span>
                  </>
                )}
              </button>
            ) : (
              <div className="space-y-2">
                <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-xs text-rose-300 flex items-center justify-between">
                  <span>Insufficient Balance</span>
                  <span className="font-bold">Short ₹{(requiredBalance - walletBalance).toFixed(2)}</span>
                </div>
                <a
                  href="/wallet"
                  className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-center font-bold text-emerald-400 text-xs border border-emerald-500/30 block transition"
                >
                  Top Up Wallet to Continue
                </a>
              </div>
            )}

            {executionError && (
              <div className="bg-rose-500/20 border border-rose-500/40 rounded-xl p-3 text-xs text-rose-300">
                {executionError}
              </div>
            )}
          </div>

          {/* Active Run Monitor & Neutral Activity Log */}
          {activeJob && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-500" />
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">Active Run Status</h4>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    activeJob.status === 'COMPLETED'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : activeJob.status === 'RUNNING'
                      ? 'bg-blue-500/20 text-blue-400 animate-pulse'
                      : activeJob.status === 'FAILED'
                      ? 'bg-rose-500/20 text-rose-400'
                      : 'bg-amber-500/20 text-amber-400'
                  }`}
                >
                  {activeJob.status}
                </span>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Progress</span>
                  <span className="font-bold text-slate-700 dark:text-slate-300">
                    {activeJob.items_delivered} / {activeJob.requested_items} items
                  </span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, Math.round((activeJob.items_delivered / Math.max(1, activeJob.requested_items)) * 100))}%`
                    }}
                  />
                </div>
              </div>

              {/* Abort button if running */}
              {activeJob.status === 'RUNNING' && (
                <button
                  type="button"
                  onClick={handleAbortJob}
                  className="w-full py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 font-semibold text-xs rounded-xl border border-rose-500/20 transition"
                >
                  Stop & Settle Run Early
                </button>
              )}

              {/* Neutral Activity Stream */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Activity Log</span>
                <div className="bg-slate-950 rounded-xl p-3 h-32 overflow-y-auto font-mono text-[10px] text-slate-300 space-y-1">
                  {activityLogs.map((log, idx) => (
                    <div key={idx} className="leading-tight">
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dynamic Results Viewer Section */}
      {results.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                <span>Extracted Records ({resultsTotal} delivered)</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Preview sanitized, high-integrity data outputs with one-click neutral export.
              </p>
            </div>

            {/* Export & Column Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter records..."
                  value={resultFilter}
                  onChange={(e) => setResultFilter(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {activeJob && (
                <>
                  <a
                    href={api.dataMarketplace.getExportUrl(activeJob.id, 'csv')}
                    download
                    className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 transition"
                  >
                    <FileText className="w-3.5 h-3.5 text-emerald-500" />
                    <span>CSV</span>
                  </a>
                  <a
                    href={api.dataMarketplace.getExportUrl(activeJob.id, 'xlsx')}
                    download
                    className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 transition"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-blue-500" />
                    <span>Excel</span>
                  </a>
                  <a
                    href={api.dataMarketplace.getExportUrl(activeJob.id, 'json')}
                    download
                    className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 transition"
                  >
                    <FileCode className="w-3.5 h-3.5 text-amber-500" />
                    <span>JSON</span>
                  </a>
                </>
              )}
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 max-h-[500px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold sticky top-0 border-b border-slate-200 dark:border-slate-700 z-10">
                <tr>
                  <th className="px-3 py-2 w-12 text-center text-slate-400">#</th>
                  {resultsColumns
                    .filter((c) => visibleColumns[c] !== false)
                    .map((col) => (
                      <th key={col} className="px-3 py-2 whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredResults.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <td className="px-3 py-2 text-center text-slate-400 font-mono text-[10px]">{rIdx + 1}</td>
                    {resultsColumns
                      .filter((c) => visibleColumns[c] !== false)
                      .map((col) => {
                        const cellVal = row[col];
                        return (
                          <td key={col} className="px-3 py-2 max-w-xs truncate text-slate-700 dark:text-slate-300">
                            {typeof cellVal === 'object' && cellVal !== null
                              ? JSON.stringify(cellVal)
                              : String(cellVal ?? '')}
                          </td>
                        );
                      })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Save Preset Modal */}
      {showSavePresetModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Save Parameter Preset</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Save your current form configuration for fast one-click re-runs in the future.
            </p>
            <input
              type="text"
              autoFocus
              placeholder="e.g. Shopify Brands USA with Direct Email"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSavePresetModal(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingPreset || !newPresetName.trim()}
                onClick={handleSavePreset}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 transition disabled:opacity-50"
              >
                {savingPreset ? 'Saving...' : 'Save Preset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
