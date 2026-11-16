import React, { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { WalletTopUpModal } from './WalletTopUpModal';
import { UserWallet } from '../../types';
import {
  ArrowLeft,
  Play,
  Download,
  RefreshCw,
  Sliders,
  Sparkles,
  Save,
  Trash2,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Database,
  Plus,
  Trash,
  HelpCircle,
  FileSpreadsheet,
  FileText,
  FileCode,
  Search,
  Eye,
  Wallet,
  Copy,
  Check,
  Upload,
  Filter,
  Layers,
  BarChart2,
  Folder,
  ExternalLink,
  Share2,
  Code,
  MapPin,
  Image,
  UserPlus,
  Calendar,
  Command,
  Zap,
  Link2
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
  profile?: {
    capabilities?: {
      input_kinds?: string[];
      supports_max_items?: boolean;
      pricing_model?: string;
      output_kinds?: string[];
      dataset_views?: Array<{ title: string; fields: string[]; description?: string }>;
      kv_collections?: Array<{ key_prefix?: string; key?: string }>;
      runtime_class?: string;
      permission_level?: string;
      mode?: string;
    };
    compatibility?: {
      classification?: string;
      reasons?: string[];
    };
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
  runtime_seconds?: number;
  output_files_json?: string;
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
  const { currencies, currencyCode, currencySymbol, switchCurrency } = useCurrency();
  const def = product.definition;
  const capabilities = def.profile?.capabilities || {};

  // Capability Flags
  const hasFilesCapability =
    capabilities.output_kinds?.includes('key_value_files') ||
    (capabilities.kv_collections && capabilities.kv_collections.length > 0);
  const datasetViews = capabilities.dataset_views || [];

  // Studio Mode: 'configure' | 'results' | 'files' | 'history' | 'api'
  const [activeTab, setActiveTab] = useState<'configure' | 'results' | 'files' | 'history' | 'api'>('configure');
  const [guidedMode, setGuidedMode] = useState<boolean>(false);
  const [searchFilterText, setSearchFilterText] = useState<string>('');

  // Form State
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [requestedItems, setRequestedItems] = useState<number>(() => {
    const min = def.limits?.min_items || 10;
    return Math.max(min, 100);
  });
  const [maxBudget, setMaxBudget] = useState<number>(() => {
    return Math.max(500, (def.pricing?.sell?.per_1000_items || 399) * 2);
  });
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  // Presets State
  const [presets, setPresets] = useState<UserPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [newPresetName, setNewPresetName] = useState<string>('');
  const [showSavePresetModal, setShowSavePresetModal] = useState<boolean>(false);
  const [savingPreset, setSavingPreset] = useState<boolean>(false);

  // Bulk Upload Modal State
  const [bulkFieldTarget, setBulkFieldTarget] = useState<InputField | null>(null);
  const [bulkInputText, setBulkInputText] = useState<string>('');
  const [bulkParsing, setBulkParsing] = useState<boolean>(false);
  const [bulkParseResult, setBulkParseResult] = useState<any | null>(null);

  // Quote State
  const [quote, setQuote] = useState<PriceQuote | null>(null);
  const [selectedCurrency, setSelectedCurrency] = useState<string>(currencyCode || 'INR');
  const [quoteSecondsRemaining, setQuoteSecondsRemaining] = useState<number>(300);
  const [loadingQuote, setLoadingQuote] = useState<boolean>(false);

  // Wallet State
  const [wallet, setWallet] = useState<UserWallet | null>(null);
  const [walletLoading, setWalletLoading] = useState<boolean>(false);
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState<boolean>(false);

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
  const [selectedViewIdx, setSelectedViewIdx] = useState<number>(-1); // -1 = All columns
  const [selectedRowDetail, setSelectedRowDetail] = useState<any | null>(null);
  const [dedupeKey, setDedupeKey] = useState<string>('');

  // Files State
  const [jobFiles, setJobFiles] = useState<any[]>([]);
  const [loadingFiles, setLoadingFiles] = useState<boolean>(false);
  const [previewFile, setPreviewFile] = useState<any | null>(null);

  // History State
  const [historyJobs, setHistoryJobs] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [diffJobA, setDiffJobA] = useState<string>('');
  const [diffJobB, setDiffJobB] = useState<string>('');
  const [diffResult, setDiffResult] = useState<{ newRows: number; removedRows: number; commonRows: number } | null>(null);

  // Config Share & Export Modal
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // Power Features State (v3)
  const [isInlineAddFundsOpen, setIsInlineAddFundsOpen] = useState<boolean>(false);
  const [topUpAmountInput, setTopUpAmountInput] = useState<number>(0);
  const [toppingUp, setToppingUp] = useState<boolean>(false);
  const [showCommandPalette, setShowCommandPalette] = useState<boolean>(false);
  const [paletteSearch, setPaletteSearch] = useState<string>('');
  const [resultViewMode, setResultViewMode] = useState<'table' | 'map' | 'gallery' | 'json'>('table');

  // CRM Sync State
  const [showCrmModal, setShowCrmModal] = useState<boolean>(false);
  const [crmLists, setCrmLists] = useState<any[]>([]);
  const [selectedCrmListId, setSelectedCrmListId] = useState<string>('');
  const [crmDedupeRule, setCrmDedupeRule] = useState<'skip' | 'update' | 'merge'>('update');
  const [crmSyncing, setCrmSyncing] = useState<boolean>(false);
  const [crmSyncSuccess, setCrmSyncSuccess] = useState<any | null>(null);

  // Signed Share Link State
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [shareLinkData, setShareLinkData] = useState<{ token: string; shareUrl: string; expiresAt: string } | null>(null);
  const [generatingShare, setGeneratingShare] = useState<boolean>(false);

  // Recurring Runs Schedule State
  const [showScheduleModal, setShowScheduleModal] = useState<boolean>(false);
  const [scheduleCron, setScheduleCron] = useState<string>('0 9 * * 1'); // Every Monday 9am
  const [scheduleName, setScheduleName] = useState<string>('');
  const [scheduleBudget, setScheduleBudget] = useState<number>(500);
  const [savingSchedule, setSavingSchedule] = useState<boolean>(false);

  // Polling ref for active job
  const pollTimerRef = useRef<any>(null);

  // Initialize form defaults and local storage draft
  useEffect(() => {
    const initial: Record<string, any> = {};
    (def.input?.fields || []).forEach((field) => {
      if (field.locked_value !== undefined) {
        initial[field.key] = field.locked_value;
      } else if (field.default !== undefined && field.default !== null) {
        initial[field.key] = field.default;
      } else if (field.type === 'boolean') {
        initial[field.key] = false;
      } else if (field.type === 'url_list' || field.type === 'string_list' || field.type === 'multiselect') {
        initial[field.key] = [];
      } else if (field.type === 'key_value') {
        initial[field.key] = {};
      } else {
        initial[field.key] = '';
      }
    });

    // Check localStorage autosave
    try {
      const saved = localStorage.getItem(`mkt_draft_${product.slug}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        Object.assign(initial, parsed);
      }
    } catch {}

    setFormValues(initial);
    loadPresets();
    fetchQuote(requestedItems, selectedCurrency);
    fetchWallet();
  }, [product.slug]);

  // Live Wallet Data Fetcher
  const fetchWallet = async () => {
    try {
      setWalletLoading(true);
      const w = await api.wallet.get();
      setWallet(w);
    } catch (err) {
      console.warn('Failed to load wallet balance:', err);
    } finally {
      setWalletLoading(false);
    }
  };

  // Sync with global CurrencyContext
  useEffect(() => {
    fetchWallet();
  }, [currencyCode]);

  useEffect(() => {
    if (currencyCode && currencyCode !== selectedCurrency) {
      setSelectedCurrency(currencyCode);
      fetchQuote(requestedItems, currencyCode);
    }
  }, [currencyCode]);

  useEffect(() => {
    const handleCurrencySwitched = (e: any) => {
      const code = e.detail?.code || currencyCode;
      if (code) {
        setSelectedCurrency(code);
        fetchQuote(requestedItems, code);
      }
      fetchWallet();
    };
    const handleWalletUpdated = () => fetchWallet();

    window.addEventListener('currency:switched', handleCurrencySwitched);
    window.addEventListener('wallet:updated' as any, handleWalletUpdated);
    return () => {
      window.removeEventListener('currency:switched', handleCurrencySwitched);
      window.removeEventListener('wallet:updated' as any, handleWalletUpdated);
    };
  }, [requestedItems]);

  // Currency Switch Handler
  const handleCurrencyChange = async (newCode: string) => {
    setSelectedCurrency(newCode);
    try {
      await switchCurrency(newCode);
    } catch {}
    fetchQuote(requestedItems, newCode);
    fetchWallet();
  };

  // Autosave to localStorage on changes
  useEffect(() => {
    if (Object.keys(formValues).length > 0) {
      try {
        localStorage.setItem(`mkt_draft_${product.slug}`, JSON.stringify(formValues));
      } catch {}
    }
  }, [formValues, product.slug]);

  // Keyboard Shortcuts: Cmd+K / Ctrl+K for Palette, Cmd+Enter for Run
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette((prev) => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        if (activeTab === 'configure' && !submitting) {
          e.preventDefault();
          handleLaunchExtraction();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, submitting]);

  // In-Studio Inline Add Funds
  const handleInlineTopUp = async (amount: number) => {
    if (amount <= 0) return;
    setToppingUp(true);
    try {
      await api.wallet.topUp(amount, 'In-Studio Instant Top-Up');
      await fetchWallet();
      await fetchQuote(requestedItems, selectedCurrency);
      setIsInlineAddFundsOpen(false);
      appendLog(`Successfully topped up ${currencySymbol}${amount.toFixed(2)} to wallet!`);
    } catch (err: any) {
      alert(err.message || 'Failed to top up wallet');
    } finally {
      setToppingUp(false);
    }
  };

  // CRM List Integration
  const loadCrmLists = async () => {
    try {
      const res = await api.get('/api/crm/lists');
      setCrmLists(res.data?.lists || res.data || []);
    } catch {}
  };

  const handleSyncToCrm = async () => {
    if (!activeJob) return;
    setCrmSyncing(true);
    try {
      const res = await api.post(`/api/marketplace/jobs/${activeJob.id}/crm-sync`, {
        listId: selectedCrmListId || null,
        dedupeRule: crmDedupeRule
      });
      setCrmSyncSuccess(res.data);
      appendLog(`Synced ${res.data.inserted} new leads directly into CRM!`);
    } catch (err: any) {
      alert(err.message || 'CRM sync failed');
    } finally {
      setCrmSyncing(false);
    }
  };

  // Signed Share Link
  const handleCreateShareLink = async () => {
    if (!activeJob) return;
    setGeneratingShare(true);
    try {
      const res = await api.post(`/api/marketplace/jobs/${activeJob.id}/share`, {
        hoursValid: 72
      });
      setShareLinkData({
        token: res.data.token,
        shareUrl: `${window.location.origin}${res.data.shareUrl}`,
        expiresAt: res.data.expiresAt
      });
      setShowShareModal(true);
    } catch (err: any) {
      alert(err.message || 'Failed to generate share link');
    } finally {
      setGeneratingShare(false);
    }
  };

  // Recurring Runs Schedule
  const handleSaveSchedule = async () => {
    if (!scheduleName.trim()) return;
    setSavingSchedule(true);
    try {
      await api.post('/api/marketplace/schedules', {
        productSlug: product.slug,
        name: scheduleName.trim(),
        cronExpression: scheduleCron,
        inputJson: formValues,
        requestedItems,
        maxBudget: scheduleBudget
      });
      setShowScheduleModal(false);
      appendLog(`Created recurring schedule "${scheduleName}"!`);
      alert('Extraction schedule created successfully!');
    } catch (err: any) {
      alert(err.message || 'Failed to save schedule');
    } finally {
      setSavingSchedule(false);
    }
  };

  // Quote TTL Timer
  useEffect(() => {
    if (!quote?.expiresAt) return;
    const interval = setInterval(() => {
      const expiresMs = new Date(quote.expiresAt).getTime();
      const remainingSecs = Math.max(0, Math.floor((expiresMs - Date.now()) / 1000));
      setQuoteSecondsRemaining(remainingSecs);

      if (remainingSecs <= 0) {
        fetchQuote(requestedItems, selectedCurrency);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [quote?.expiresAt, requestedItems, selectedCurrency]);

  // Polling for Active Job
  useEffect(() => {
    if (activeJob && (activeJob.status === 'RUNNING' || activeJob.status === 'QUEUED')) {
      pollTimerRef.current = setTimeout(async () => {
        try {
          const res = await api.dataMarketplace.getJob(activeJob.id);
          if (res.success && res.job) {
            setActiveJob(res.job);
            if (res.job.status === 'RUNNING') {
              appendLog(`Running extraction... Delivered: ${res.job.items_delivered} items`);
              if (res.job.items_delivered > 0 && results.length < res.job.items_delivered) {
                loadJobResults(res.job.id);
              }
            } else if (res.job.status === 'COMPLETED' || res.job.status === 'PARTIAL') {
              appendLog(`Extraction finished! Delivered ${res.job.items_delivered} records.`);
              loadJobResults(res.job.id);
              setActiveTab('results');
              if (hasFilesCapability) {
                loadJobFiles(res.job.id);
              }
              fetchWallet();
              loadHistoryJobs();
            } else if (res.job.status === 'FAILED') {
              appendLog(`Extraction ended with error: ${res.job.error_message || 'Worker failure'}`);
              fetchWallet();
              loadHistoryJobs();
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
    setActivityLogs((prev) => [`[${timestamp}] ${msg}`, ...prev.slice(0, 50)]);
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

  const fetchQuote = async (items: number, currency: string) => {
    setLoadingQuote(true);
    try {
      const res = await api.dataMarketplace.createQuote(product.slug, items, currency);
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
        appendLog(`Preset "${newPresetName.trim()}" saved.`);
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

  const handleResetField = (field: InputField) => {
    const val = field.default !== undefined ? field.default : (field.type === 'boolean' ? false : '');
    handleFieldChange(field.key, val);
  };

  const handleResetAll = () => {
    if (!confirm('Reset all fields to smart defaults?')) return;
    const initial: Record<string, any> = {};
    (def.input?.fields || []).forEach((field) => {
      initial[field.key] = field.default !== undefined ? field.default : (field.type === 'boolean' ? false : '');
    });
    setFormValues(initial);
  };

  const handleItemsChange = (newCount: number) => {
    const min = def.limits?.min_items || 10;
    const max = def.limits?.max_items_per_run || 5000;
    const clamped = Math.max(min, Math.min(max, newCount));
    setRequestedItems(clamped);
    fetchQuote(clamped, selectedCurrency);
  };

  // Launch Extraction Job
  const handleLaunchExtraction = async () => {
    setSubmitting(true);
    setExecutionError(null);
    setActivityLogs([]);
    appendLog('Validating parameters and submitting extraction task...');

    try {
      const res = await api.dataMarketplace.createJob(
        product.slug,
        formValues,
        requestedItems,
        selectedCurrency
      );
      if (res.success && res.job) {
        setActiveJob(res.job);
        appendLog(`Job queued: ${res.job.id}`);
        appendLog(`Reserved amount: ${currencySymbol}${res.job.reserved_amount.toFixed(2)} ${res.job.currency}`);
        fetchWallet();
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
    if (!confirm('Abort extraction run? Unused reserved balance will be released immediately.')) return;
    try {
      await api.dataMarketplace.abortJob(activeJob.id);
      appendLog('Abort signal acknowledged. Terminating extraction...');
      const res = await api.dataMarketplace.getJob(activeJob.id);
      if (res.success) setActiveJob(res.job);
      fetchWallet();
    } catch (err: any) {
      alert(err.message || 'Failed to abort job');
    }
  };

  const loadJobResults = async (jobId: string, page = 1) => {
    setLoadingResults(true);
    try {
      const res = await api.dataMarketplace.getJobResults(jobId, { page, limit: 100 });
      if (res.success) {
        setResults(res.items || []);
        setResultsTotal(res.total || 0);
        setResultsPage(page);

        if (res.items && res.items.length > 0) {
          const sample = res.items[0];
          const cols = Object.keys(sample);
          setResultsColumns(cols);

          const initialVisible: Record<string, boolean> = {};
          cols.forEach((col, idx) => {
            initialVisible[col] = idx < 10;
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

  const loadJobFiles = async (jobId: string) => {
    setLoadingFiles(true);
    try {
      const res = await api.dataMarketplace.listJobFiles(jobId);
      if (res.success) {
        setJobFiles(res.files || []);
      }
    } catch (err) {
      console.error('Failed to load job files:', err);
    } finally {
      setLoadingFiles(false);
    }
  };

  const loadHistoryJobs = async () => {
    setLoadingHistory(true);
    try {
      const res = await api.dataMarketplace.listUserJobs({ limit: 20 });
      if (res.success) {
        const prodJobs = (res.jobs || []).filter((j: any) => j.product_slug === product.slug);
        setHistoryJobs(prodJobs);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Bulk input parser handler
  const handleParseBulkInput = async () => {
    if (!bulkFieldTarget || !bulkInputText.trim()) return;
    setBulkParsing(true);
    try {
      const isUrlMode = bulkFieldTarget.type === 'url_list';
      const res = await api.dataMarketplace.parseBulkInput(bulkInputText, isUrlMode ? 'url' : 'string', 5000);
      if (res.success) {
        setBulkParseResult(res);
        // Apply directly to target field
        handleFieldChange(bulkFieldTarget.key, res.items);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to parse input');
    } finally {
      setBulkParsing(false);
    }
  };

  // Group fields by section caption & filter by search
  const groupedFields = useMemo(() => {
    const fields = def.input?.fields || [];
    const groups: Array<{ caption: string; description?: string; fields: InputField[] }> = [];
    const captionMap = new Map<string, InputField[]>();

    fields.forEach((f) => {
      // Evaluate show_if condition
      if (f.show_if) {
        const dependentValue = formValues[f.show_if.field];
        if (dependentValue !== f.show_if.equals) {
          return;
        }
      }

      // Filter guided mode (only required/basic) vs expert mode
      if (guidedMode && f.advanced) {
        return;
      }

      // Filter advanced checkbox
      if (!guidedMode && !showAdvanced && f.advanced) {
        return;
      }

      // Search filter
      if (searchFilterText.trim()) {
        const q = searchFilterText.toLowerCase();
        const match =
          f.label.toLowerCase().includes(q) ||
          f.key.toLowerCase().includes(q) ||
          (f.help || '').toLowerCase().includes(q);
        if (!match) return;
      }

      const caption = f.section_caption || 'General Options';
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
  }, [def.input?.fields, formValues, showAdvanced, guidedMode, searchFilterText]);

  // Data Quality Metrics (Auto-calculated on delivered results)
  const dataQualityMetrics = useMemo(() => {
    if (!results || results.length === 0) return null;
    const totalRows = results.length;
    const completenessMap: Record<string, number> = {};

    resultsColumns.forEach((col) => {
      let count = 0;
      results.forEach((row) => {
        const val = row[col];
        if (val !== null && val !== undefined && val !== '') {
          count++;
        }
      });
      completenessMap[col] = Math.round((count / totalRows) * 100);
    });

    return {
      totalRows,
      completenessMap
    };
  }, [results, resultsColumns]);

  // Active columns based on selected dataset view tab
  const activeColumns = useMemo(() => {
    let cols: string[] = [];
    if (selectedViewIdx === -1) {
      cols = resultsColumns.filter((c) => visibleColumns[c] !== false);
    } else {
      const view = datasetViews[selectedViewIdx];
      if (view && view.fields && view.fields.length > 0) {
        cols = view.fields.filter((c) => resultsColumns.includes(c));
      }
      if (cols.length === 0) {
        cols = resultsColumns.filter((c) => visibleColumns[c] !== false);
      }
    }
    // Infallible Fallback: If no columns match but results exist, take top keys of first row
    if (cols.length === 0 && results && results.length > 0) {
      cols = Object.keys(results[0]).slice(0, 15);
    }
    return cols;
  }, [selectedViewIdx, datasetViews, resultsColumns, visibleColumns, results]);

  // Filtered & Deduped Results
  const filteredResults = useMemo(() => {
    let list = results;
    if (resultFilter.trim()) {
      const q = resultFilter.toLowerCase();
      list = list.filter((row) =>
        Object.values(row).some((val) => String(val || '').toLowerCase().includes(q))
      );
    }
    if (dedupeKey && resultsColumns.includes(dedupeKey)) {
      const seen = new Set<string>();
      list = list.filter((row) => {
        const val = String(row[dedupeKey] || '');
        if (seen.has(val)) return false;
        seen.add(val);
        return true;
      });
    }
    return list;
  }, [results, resultFilter, dedupeKey, resultsColumns]);

  // Wallet checks with Available vs Reserved balance
  const totalBalance = wallet ? Number(wallet.balance) : Number((user as any)?.balance || 0);
  const reservedBalance = wallet ? Number(wallet.reserved_balance || 0) : 0;
  const availableBalance = Math.max(0, totalBalance - reservedBalance);
  const requiredBalance = quote?.sellPrice || 0;
  const shortfall = Math.max(0, Number((requiredBalance - availableBalance).toFixed(2)));
  const isBalanceSufficient = availableBalance >= requiredBalance;
  const walletBalance = availableBalance;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-24 text-slate-800 dark:text-slate-100">
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
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                {product.category || 'Data Extractor'}
              </span>
              {capabilities.pricing_model && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-blue-500/20 text-blue-300 border border-blue-500/30 uppercase">
                  {capabilities.pricing_model}
                </span>
              )}
              {capabilities.runtime_class && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-purple-500/20 text-purple-300 border border-purple-500/30 capitalize">
                  {capabilities.runtime_class} runtime
                </span>
              )}
            </div>
            <h1 className="text-xl md:text-2xl font-black tracking-tight mt-1">{product.display_name}</h1>
            <p className="text-xs text-slate-400 max-w-xl">{product.tagline}</p>
          </div>
        </div>

        {/* Guided Toggle, Presets & Wallet Balance */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Guided Mode vs Expert Mode Pill */}
          <div className="bg-slate-800 p-1 rounded-xl flex items-center border border-slate-700 text-xs">
            <button
              onClick={() => setGuidedMode(false)}
              className={`px-3 py-1 rounded-lg font-bold transition ${
                !guidedMode ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Expert
            </button>
            <button
              onClick={() => setGuidedMode(true)}
              className={`px-3 py-1 rounded-lg font-bold transition ${
                guidedMode ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Guided
            </button>
          </div>

          {/* Wallet Balance Pill (Available vs Held) */}
          <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl px-3 py-1.5 flex items-center gap-2 text-xs shadow-inner">
            <Wallet className="w-4 h-4 text-emerald-400" />
            <div className="flex items-center gap-1.5 font-mono">
              <span className="text-slate-400 font-sans text-[11px]">Available:</span>
              <span className="font-bold text-emerald-400">
                {walletLoading ? '...' : `${currencySymbol}${availableBalance.toFixed(2)}`}
              </span>
              {reservedBalance > 0 && (
                <span className="text-slate-500 text-[10px] ml-1" title="Funds currently held for running extractions">
                  (Held: {currencySymbol}{reservedBalance.toFixed(2)})
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsInlineAddFundsOpen(true)}
              className="ml-1 px-2.5 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition flex items-center gap-1 shadow-sm"
              title="Add funds to wallet"
            >
              <Plus className="w-3 h-3" />
              <span>Add Funds</span>
            </button>
          </div>

          {/* Quick Tools: Presets, Recurring Schedule, Command Palette */}
          <div className="flex items-center gap-1.5">
            <select
              value={selectedPresetId}
              onChange={(e) => handleApplyPreset(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-xl px-2.5 py-1.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="">-- Presets --</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <button
              onClick={() => setShowSavePresetModal(true)}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl transition"
              title="Save current parameters as preset"
            >
              <Save className="w-3.5 h-3.5 text-emerald-400" />
            </button>

            <button
              onClick={() => {
                setScheduleName(`${product.display_name} Run`);
                setShowScheduleModal(true);
              }}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl transition"
              title="Schedule Recurring Run (Cron)"
            >
              <Calendar className="w-3.5 h-3.5 text-purple-400" />
            </button>

            <button
              onClick={() => setShowCommandPalette(true)}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl transition flex items-center gap-1 text-xs font-mono"
              title="Command Palette (Cmd+K)"
            >
              <Command className="w-3.5 h-3.5 text-slate-300" />
              <span className="hidden sm:inline text-[10px] text-slate-400 font-bold">⌘K</span>
            </button>

            <button
              onClick={() => setShowConfigModal(true)}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl transition"
              title="Export / Share JSON Config"
            >
              <Share2 className="w-3.5 h-3.5 text-blue-400" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Studio Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('configure')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'configure'
              ? 'bg-slate-900 text-white dark:bg-emerald-600 dark:text-white shadow-sm'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
          }`}
        >
          <Sliders className="w-4 h-4 text-emerald-500" />
          <span>Configure & Extract</span>
        </button>

        <button
          onClick={() => setActiveTab('results')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'results'
              ? 'bg-slate-900 text-white dark:bg-emerald-600 dark:text-white shadow-sm'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
          }`}
        >
          <Database className="w-4 h-4 text-blue-500" />
          <span>Results Data ({resultsTotal})</span>
        </button>

        {/* Files Module Tab (Capability Gated: only visible if actor provides files) */}
        {hasFilesCapability && (
          <button
            onClick={() => {
              setActiveTab('files');
              if (activeJob) loadJobFiles(activeJob.id);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'files'
                ? 'bg-slate-900 text-white dark:bg-emerald-600 dark:text-white shadow-sm'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
            }`}
          >
            <Folder className="w-4 h-4 text-amber-500" />
            <span>Files & Downloads ({jobFiles.length})</span>
          </button>
        )}

        <button
          onClick={() => {
            setActiveTab('history');
            loadHistoryJobs();
          }}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'history'
              ? 'bg-slate-900 text-white dark:bg-emerald-600 dark:text-white shadow-sm'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
          }`}
        >
          <Clock className="w-4 h-4 text-purple-500" />
          <span>Run History & Compare</span>
        </button>

        <button
          onClick={() => setActiveTab('api')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'api'
              ? 'bg-slate-900 text-white dark:bg-emerald-600 dark:text-white shadow-sm'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
          }`}
        >
          <Code className="w-4 h-4 text-slate-400" />
          <span>Developer Access</span>
        </button>
      </div>

      {/* Compliance Notice Banner */}
      {def.compliance?.contains_personal_data && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3.5 text-xs text-amber-300 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-amber-200">Public Intelligence Compliance: </span>
            {def.compliance?.disclaimer_md ||
              'This product extracts publicly available web data. Ensure compliance with electronic marketing regulations (CAN-SPAM/GDPR).'}
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 1: CONFIGURE & EXTRACT
         ===================================================================== */}
      {activeTab === 'configure' && (
        <div className="space-y-6">
          {activeJob && (activeJob.status === 'RUNNING' || activeJob.status === 'QUEUED' || activeJob.items_delivered > 0) && (
            <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white p-4 rounded-2xl shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-fade-in">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center font-bold shrink-0">
                  {activeJob.status === 'RUNNING' ? <RefreshCw className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                </div>
                <div>
                  <div className="font-bold text-sm flex items-center gap-2">
                    <span>Extraction {activeJob.status === 'COMPLETED' ? 'Completed' : 'Active'}</span>
                    <span className="bg-white/20 text-white text-[10px] font-mono px-2 py-0.5 rounded-full uppercase">
                      {activeJob.status}
                    </span>
                  </div>
                  <div className="text-xs text-emerald-100">
                    Delivered {activeJob.items_delivered} rows • Click to view live outputs & data preview.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  loadJobResults(activeJob.id);
                  setActiveTab('results');
                }}
                className="px-4 py-2 bg-white text-emerald-700 hover:bg-emerald-50 rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5 shrink-0"
              >
                <span>View Extracted Outputs</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Cols: Form Controls */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
              {/* Form Filter & Reset Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search parameter settings..."
                    value={searchFilterText}
                    onChange={(e) => setSearchFilterText(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="flex items-center gap-3">
                  {!guidedMode && (
                    <label className="text-xs text-slate-500 dark:text-slate-400 cursor-pointer flex items-center gap-2">
                      <span>Show Advanced Fields</span>
                      <input
                        type="checkbox"
                        checked={showAdvanced}
                        onChange={(e) => setShowAdvanced(e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-slate-700"
                      />
                    </label>
                  )}

                  <button
                    type="button"
                    onClick={handleResetAll}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition"
                  >
                    Reset All
                  </button>
                </div>
              </div>

              {/* Dynamic Field Groups */}
              {groupedFields.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  No matching parameters found for "{searchFilterText}".
                </div>
              ) : (
                groupedFields.map((group) => {
                  const isCollapsed = Boolean(collapsedSections[group.caption]);
                  return (
                    <div key={group.caption} className="space-y-4">
                      <div
                        onClick={() =>
                          setCollapsedSections((prev) => ({
                            ...prev,
                            [group.caption]: !isCollapsed
                          }))
                        }
                        className="flex items-center justify-between cursor-pointer select-none border-b border-slate-100 dark:border-slate-800 pb-2"
                      >
                        <div>
                          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                            <span>{group.caption}</span>
                            <span className="text-[10px] text-slate-400 font-normal">
                              ({group.fields.length} settings)
                            </span>
                          </h3>
                          {group.description && (
                            <p className="text-[11px] text-slate-400">{group.description}</p>
                          )}
                        </div>
                        {isCollapsed ? (
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </div>

                      {!isCollapsed && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {group.fields.map((field) => {
                            const val = formValues[field.key];
                            return (
                              <div
                                key={field.key}
                                className={`space-y-1.5 ${
                                  field.type === 'textarea' ||
                                  field.type === 'url_list' ||
                                  field.type === 'string_list' ||
                                  field.type === 'json' ||
                                  field.type === 'object'
                                    ? 'sm:col-span-2'
                                    : ''
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                    <span>{field.label}</span>
                                    {field.required && (
                                      <span className="text-rose-500 font-bold" title="Required">
                                        *
                                      </span>
                                    )}
                                    {field.affects_cost && (
                                      <span className="text-[10px] text-amber-500 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20 font-normal">
                                        Affects Cost
                                      </span>
                                    )}
                                  </label>

                                  <button
                                    type="button"
                                    onClick={() => handleResetField(field)}
                                    title="Reset to default value"
                                    className="text-[10px] text-slate-400 hover:text-slate-600 transition"
                                  >
                                    Reset
                                  </button>
                                </div>

                                {field.help && (
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                    {field.help}
                                  </p>
                                )}

                                {/* RENDER BY FIELD TYPE */}
                                {field.type === 'boolean' ? (
                                  <label className="flex items-center gap-2 cursor-pointer pt-1">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(val)}
                                      onChange={(e) => handleFieldChange(field.key, e.target.checked)}
                                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-slate-700 dark:bg-slate-800"
                                    />
                                    <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                                      {val ? 'Enabled' : 'Disabled'}
                                    </span>
                                  </label>
                                ) : field.type === 'select' ? (
                                  <select
                                    value={val ?? ''}
                                    onChange={(e) => handleFieldChange(field.key, e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                  >
                                    {(field.options || []).map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                ) : field.type === 'textarea' ? (
                                  <textarea
                                    rows={3}
                                    placeholder={field.placeholder || ''}
                                    value={val ?? ''}
                                    onChange={(e) => handleFieldChange(field.key, e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                  />
                                ) : field.type === 'url_list' || field.type === 'string_list' ? (
                                  <div className="space-y-2">
                                    <textarea
                                      rows={3}
                                      placeholder={`Enter one ${field.type === 'url_list' ? 'URL' : 'keyword'} per line or comma-separated...`}
                                      value={Array.isArray(val) ? val.join('\n') : String(val ?? '')}
                                      onChange={(e) =>
                                        handleFieldChange(
                                          field.key,
                                          e.target.value
                                            .split('\n')
                                            .map((s) => s.trim())
                                            .filter(Boolean)
                                        )
                                      }
                                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                    />
                                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                                      <span>{Array.isArray(val) ? val.length : 0} items configured</span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setBulkFieldTarget(field);
                                          setBulkInputText(Array.isArray(val) ? val.join('\n') : '');
                                          setBulkParseResult(null);
                                        }}
                                        className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline flex items-center gap-1"
                                      >
                                        <Upload className="w-3 h-3" />
                                        <span>Bulk Paste / CSV Upload</span>
                                      </button>
                                    </div>
                                  </div>
                                ) : field.type === 'number' ? (
                                  <input
                                    type="number"
                                    min={field.min ?? undefined}
                                    max={field.max ?? undefined}
                                    placeholder={field.placeholder || ''}
                                    value={val ?? ''}
                                    onChange={(e) =>
                                      handleFieldChange(
                                        field.key,
                                        e.target.value === '' ? null : Number(e.target.value)
                                      )
                                    }
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                  />
                                ) : (
                                  <input
                                    type="text"
                                    placeholder={field.placeholder || ''}
                                    value={val ?? ''}
                                    onChange={(e) => handleFieldChange(field.key, e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Sticky Quote, Budget & Live Monitor */}
          <div className="space-y-6">
            {/* Sticky Quote & Budget Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-5 sticky top-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Quote
                  </span>
                  {/* Currency Switcher Dropdown */}
                  <select
                    value={selectedCurrency}
                    onChange={(e) => handleCurrencyChange(e.target.value)}
                    className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-bold text-xs rounded-lg px-2 py-1 focus:ring-2 focus:ring-emerald-500 focus:outline-none cursor-pointer"
                  >
                    {currencies.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.symbol} {c.code}
                      </option>
                    ))}
                  </select>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-500 font-bold">
                  TTL: {quoteSecondsRemaining}s
                </span>
              </div>

              {/* Requested Items Slider */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Max Records Target:</span>
                  <span className="font-black text-slate-900 dark:text-white text-sm">
                    {requestedItems.toLocaleString()} items
                  </span>
                </div>
                <input
                  type="range"
                  min={def.limits?.min_items || 10}
                  max={Math.min(def.limits?.max_items_per_run || 2000, 2000)}
                  step={10}
                  value={requestedItems}
                  onChange={(e) => handleItemsChange(Number(e.target.value))}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
              </div>

              {/* Price Calculation Box */}
              <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Unit Rate</span>
                  <span>
                    {quote
                      ? `${currencySymbol}${((quote.sellPrice / Math.max(1, quote.requestedItems)) * 1000).toFixed(2)} / 1k`
                      : `${currencySymbol}${(def.pricing?.sell?.per_1000_items || 0)} / 1k`}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 font-mono">
                  <span className="font-sans">Available Funds</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {currencySymbol}{availableBalance.toFixed(2)} {selectedCurrency}
                  </span>
                </div>
                {reservedBalance > 0 && (
                  <div className="flex justify-between text-[11px] text-slate-400 dark:text-slate-500 font-mono">
                    <span className="font-sans">On-Hold (Active Runs)</span>
                    <span>{currencySymbol}{reservedBalance.toFixed(2)}</span>
                  </div>
                )}
                <div className="border-t border-slate-200 dark:border-slate-700 pt-2 flex justify-between items-baseline font-mono">
                  <span className="font-bold text-xs text-slate-900 dark:text-white font-sans">Required Hold Lock</span>
                  <span className="text-lg font-black text-slate-900 dark:text-white">
                    {loadingQuote ? '...' : `${currencySymbol}${quote?.sellPrice?.toFixed(2) || '0.00'} ${selectedCurrency}`}
                  </span>
                </div>
              </div>

              {/* Inline Add Funds Drawer */}
              {isInlineAddFundsOpen && (
                <div className="bg-slate-900 border border-emerald-500/40 rounded-xl p-4 space-y-3 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Instant Wallet Top-Up</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsInlineAddFundsOpen(false)}
                      className="text-slate-400 hover:text-white text-xs font-bold"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="text-[11px] text-slate-300">
                    Shortfall for this run: <strong className="text-rose-400 font-mono">{currencySymbol}{shortfall.toFixed(2)}</strong>
                  </div>

                  {/* Quick Add Buttons */}
                  <div className="grid grid-cols-2 gap-2">
                    {shortfall > 0 && (
                      <button
                        type="button"
                        onClick={() => handleInlineTopUp(shortfall)}
                        disabled={toppingUp}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600/30 border border-emerald-500/50 hover:bg-emerald-600 text-emerald-300 hover:text-white text-[11px] font-bold transition flex items-center justify-center gap-1 disabled:opacity-50"
                      >
                        <Plus className="w-3 h-3" />
                        Exact ({currencySymbol}{shortfall.toFixed(2)})
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleInlineTopUp(selectedCurrency === 'INR' ? 500 : 10)}
                      disabled={toppingUp}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold transition flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      <Plus className="w-3 h-3" />
                      +{currencySymbol}{selectedCurrency === 'INR' ? '500' : '10'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInlineTopUp(selectedCurrency === 'INR' ? 1000 : 25)}
                      disabled={toppingUp}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold transition flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      <Plus className="w-3 h-3" />
                      +{currencySymbol}{selectedCurrency === 'INR' ? '1,000' : '25'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInlineTopUp(selectedCurrency === 'INR' ? 2500 : 50)}
                      disabled={toppingUp}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold transition flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      <Plus className="w-3 h-3" />
                      +{currencySymbol}{selectedCurrency === 'INR' ? '2,500' : '50'}
                    </button>
                  </div>
                </div>
              )}

              {/* Launch Run Button */}
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={submitting || !isBalanceSufficient}
                  onClick={handleLaunchExtraction}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 fill-white" />
                  )}
                  <span>{submitting ? 'Initiating Task...' : 'Start Extraction Run'}</span>
                </button>

                {!isBalanceSufficient && !isInlineAddFundsOpen && (
                  <div className="p-3.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-xl text-center space-y-2.5">
                    <div className="flex items-center justify-center gap-1.5 text-rose-600 dark:text-rose-400 font-semibold text-xs">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>Insufficient wallet balance</span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                      Available: <span className="font-bold text-slate-800 dark:text-slate-200">{currencySymbol}{availableBalance.toFixed(2)}</span> • Needed: <span className="font-bold text-rose-600 dark:text-rose-400">{currencySymbol}{requiredBalance.toFixed(2)}</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsInlineAddFundsOpen(true)}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg shadow-sm transition flex items-center justify-center gap-1.5"
                    >
                      <Wallet className="w-3.5 h-3.5" />
                      <span>Add Funds ({currencySymbol}{shortfall.toFixed(2)} Shortfall)</span>
                    </button>
                  </div>
                )}
              </div>

              {executionError && (
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-xs text-rose-400">
                  {executionError}
                </div>
              )}

              {/* Active Run Monitor */}
              {activeJob && (
                <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700 dark:text-slate-300">Run Status</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        activeJob.status === 'COMPLETED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : activeJob.status === 'RUNNING'
                          ? 'bg-blue-100 text-blue-800 animate-pulse'
                          : activeJob.status === 'FAILED'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {activeJob.status}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-slate-500">
                      <span>Delivered:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {activeJob.items_delivered} / {activeJob.requested_items}
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full transition-all duration-300"
                        style={{
                          width: `${Math.min(100, Math.round((activeJob.items_delivered / Math.max(1, activeJob.requested_items)) * 100))}%`
                        }}
                      />
                    </div>
                  </div>

                  {activeJob.status === 'RUNNING' && (
                    <button
                      type="button"
                      onClick={handleAbortJob}
                      className="w-full py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-xs font-semibold border border-rose-200 transition"
                    >
                      Abort Run Early
                    </button>
                  )}

                  {/* Activity stream */}
                  <div className="bg-slate-950 rounded-xl p-2.5 h-24 overflow-y-auto font-mono text-[10px] text-slate-300 space-y-1">
                    {activityLogs.map((log, idx) => (
                      <div key={idx}>{log}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: RESULTS DATA & VIEWS
         ===================================================================== */}
      {activeTab === 'results' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
          {/* View Tabs (from Dataset Views if defined) */}
          {datasetViews.length > 0 && (
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <span className="text-xs text-slate-400 font-semibold mr-1">Views:</span>
              <button
                onClick={() => setSelectedViewIdx(-1)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  selectedViewIdx === -1
                    ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All Columns
              </button>
              {datasetViews.map((v, vIdx) => (
                <button
                  key={vIdx}
                  onClick={() => setSelectedViewIdx(vIdx)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                    selectedViewIdx === vIdx
                      ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {v.title}
                </button>
              ))}
            </div>
          )}

          {/* Data Quality Panel */}
          {dataQualityMetrics && (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <BarChart2 className="w-4 h-4 text-emerald-500" />
                  <span>Data Quality Summary</span>
                </span>
                <span className="text-xs text-slate-500">
                  {filteredResults.length} records displayed
                </span>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px]">
                {Object.entries(dataQualityMetrics.completenessMap)
                  .slice(0, 6)
                  .map(([col, pct]) => (
                    <span
                      key={col}
                      className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-mono"
                    >
                      {col}: <strong className="text-emerald-600 dark:text-emerald-400">{pct}%</strong>
                    </span>
                  ))}
              </div>
            </div>
          )}

          {/* Controls: Search, Dedupe, View Switcher, Actions, and Export Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search in delivered records..."
                  value={resultFilter}
                  onChange={(e) => setResultFilter(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {/* Dedupe Selector */}
              <select
                value={dedupeKey}
                onChange={(e) => setDedupeKey(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none"
              >
                <option value="">No Deduplication</option>
                {resultsColumns.map((c) => (
                  <option key={c} value={c}>
                    Dedupe by {c}
                  </option>
                ))}
              </select>

              {/* View Switcher: Table / Map / Gallery / JSON */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setResultViewMode('table')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                    resultViewMode === 'table'
                      ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Table</span>
                </button>
                <button
                  type="button"
                  onClick={() => setResultViewMode('map')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                    resultViewMode === 'map'
                      ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span>Map</span>
                </button>
                <button
                  type="button"
                  onClick={() => setResultViewMode('gallery')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                    resultViewMode === 'gallery'
                      ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <Image className="w-3.5 h-3.5" />
                  <span>Gallery</span>
                </button>
                <button
                  type="button"
                  onClick={() => setResultViewMode('json')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                    resultViewMode === 'json'
                      ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <Code className="w-3.5 h-3.5" />
                  <span>JSON</span>
                </button>
              </div>
            </div>

            {/* Actions & Export buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {activeJob && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      loadCrmLists();
                      setShowCrmModal(true);
                    }}
                    className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 text-xs font-bold rounded-xl flex items-center gap-1.5 transition shadow-sm"
                  >
                    <UserPlus className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Save to CRM</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCreateShareLink}
                    disabled={generatingShare}
                    className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 text-xs font-bold rounded-xl flex items-center gap-1.5 transition shadow-sm"
                  >
                    <Share2 className="w-3.5 h-3.5 text-blue-600" />
                    <span>{generatingShare ? 'Generating...' : 'Share (72h)'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowScheduleModal(true)}
                    className="px-3 py-1.5 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 hover:bg-purple-100 text-xs font-bold rounded-xl flex items-center gap-1.5 transition shadow-sm"
                  >
                    <Calendar className="w-3.5 h-3.5 text-purple-600" />
                    <span>Schedule</span>
                  </button>

                  {/* Standard Exports */}
                  <div className="flex items-center gap-1 border-l border-slate-200 dark:border-slate-700 pl-2">
                    <a
                      href={api.dataMarketplace.getExportUrl(activeJob.id, 'csv')}
                      download
                      className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-bold rounded-xl flex items-center gap-1 transition"
                      title="Download CSV"
                    >
                      <FileText className="w-3.5 h-3.5 text-emerald-500" />
                      <span>CSV</span>
                    </a>
                    <a
                      href={api.dataMarketplace.getExportUrl(activeJob.id, 'xlsx')}
                      download
                      className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-bold rounded-xl flex items-center gap-1 transition"
                      title="Download Excel"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-blue-500" />
                      <span>Excel</span>
                    </a>
                    <a
                      href={api.dataMarketplace.getExportUrl(activeJob.id, 'json')}
                      download
                      className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-bold rounded-xl flex items-center gap-1 transition"
                      title="Download JSON"
                    >
                      <FileCode className="w-3.5 h-3.5 text-amber-500" />
                      <span>JSON</span>
                    </a>
                    <a
                      href={api.dataMarketplace.getExportUrl(activeJob.id, 'jsonl')}
                      download
                      className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-bold rounded-xl flex items-center gap-1 transition"
                      title="Download JSONL"
                    >
                      <Code className="w-3.5 h-3.5 text-purple-500" />
                      <span>JSONL</span>
                    </a>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Results Views Switcher Rendering */}
          {filteredResults.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              No results extracted yet. Configure inputs and start an extraction run above.
            </div>
          ) : resultViewMode === 'table' ? (
            /* Table View */
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 max-h-[500px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold sticky top-0 border-b border-slate-200 dark:border-slate-700 z-10">
                  <tr>
                    <th className="px-3 py-2 w-12 text-center text-slate-400">#</th>
                    {activeColumns.map((col) => (
                      <th key={col} className="px-3 py-2 whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredResults.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="px-3 py-2 text-center text-slate-400 font-mono text-[10px]">
                        {rIdx + 1}
                      </td>
                      {activeColumns.map((col) => {
                        const cellVal = row[col];
                        const str = String(cellVal ?? '');
                        const isUrl = str.startsWith('http://') || str.startsWith('https://');
                        const isImg = isUrl && (str.endsWith('.png') || str.endsWith('.jpg') || str.endsWith('.jpeg'));

                        return (
                          <td key={col} className="px-3 py-2 max-w-xs truncate text-slate-700 dark:text-slate-300">
                            {isImg ? (
                              <img src={str} alt="" className="w-8 h-8 object-cover rounded shadow-sm inline" />
                            ) : isUrl ? (
                              <a
                                href={str}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-500 hover:underline flex items-center gap-1"
                              >
                                <span className="truncate">{str}</span>
                                <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                              </a>
                            ) : typeof cellVal === 'boolean' ? (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${cellVal ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                {cellVal ? 'TRUE' : 'FALSE'}
                              </span>
                            ) : typeof cellVal === 'object' && cellVal !== null ? (
                              <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                {JSON.stringify(cellVal)}
                              </span>
                            ) : (
                              str
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedRowDetail(row)}
                          className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded text-[11px] font-semibold"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : resultViewMode === 'map' ? (
            /* Map View */
            <div className="space-y-4">
              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-xl text-xs text-blue-700 dark:text-blue-300 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Showing geographical and location-aware records from extraction results.</span>
                </span>
                <span className="font-bold">{filteredResults.length} records mapped</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[500px] overflow-y-auto p-1">
                {filteredResults.map((row, idx) => {
                  const lat = row.latitude || row.lat || row.location?.lat || row.coordinates?.latitude;
                  const lng = row.longitude || row.lng || row.lon || row.location?.lng || row.coordinates?.longitude;
                  const address = row.address || row.formatted_address || row.street || row.city || row.location?.address;
                  const title = row.title || row.name || row.company || row.businessName || `Record #${idx + 1}`;
                  const mapsUrl = lat && lng 
                    ? `https://maps.google.com/?q=${lat},${lng}` 
                    : address 
                    ? `https://maps.google.com/?q=${encodeURIComponent(String(address))}` 
                    : null;

                  return (
                    <div
                      key={idx}
                      className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:border-emerald-500/50 transition space-y-2.5 flex flex-col justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-bold text-xs text-slate-900 dark:text-white line-clamp-1">{title}</h4>
                          <span className="text-[10px] font-mono text-slate-400">#{idx + 1}</span>
                        </div>
                        {address && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 flex items-start gap-1">
                            <MapPin className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                            <span>{String(address)}</span>
                          </p>
                        )}
                        {lat && lng && (
                          <div className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded w-fit">
                            {lat.toFixed ? lat.toFixed(5) : lat}, {lng.toFixed ? lng.toFixed(5) : lng}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                        {mapsUrl ? (
                          <a
                            href={mapsUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-500 hover:text-blue-600 flex items-center gap-1 font-semibold text-[11px]"
                          >
                            <span>Open in Maps</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-slate-400 text-[10px]">No geodata</span>
                        )}
                        <button
                          type="button"
                          onClick={() => setSelectedRowDetail(row)}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 rounded text-[11px] font-semibold"
                        >
                          View Details
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : resultViewMode === 'gallery' ? (
            /* Image Gallery View */
            <div className="space-y-4">
              <div className="p-3 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900 rounded-xl text-xs text-purple-700 dark:text-purple-300 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Image className="w-4 h-4 text-purple-600 shrink-0" />
                  <span>Showing extracted images, screenshots, logos, and media files.</span>
                </span>
                <span className="font-bold">{filteredResults.length} records</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 max-h-[500px] overflow-y-auto p-1">
                {filteredResults.map((row, idx) => {
                  // Find first image URL in row
                  let imgUrl: string | null = null;
                  for (const key of Object.keys(row)) {
                    const val = String(row[key] ?? '');
                    if (val.startsWith('http') && (val.includes('.png') || val.includes('.jpg') || val.includes('.jpeg') || val.includes('.webp') || key.toLowerCase().includes('image') || key.toLowerCase().includes('photo') || key.toLowerCase().includes('avatar') || key.toLowerCase().includes('logo'))) {
                      imgUrl = val;
                      break;
                    }
                  }
                  const title = row.title || row.name || row.company || `Item #${idx + 1}`;

                  return (
                    <div
                      key={idx}
                      className="group relative rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm hover:shadow-md transition flex flex-col"
                    >
                      <div className="aspect-square bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                        {imgUrl ? (
                          <img
                            src={imgUrl}
                            alt=""
                            loading="lazy"
                            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-slate-400 p-2 text-center">
                            <Image className="w-8 h-8 stroke-1 mb-1 opacity-50" />
                            <span className="text-[10px]">No image</span>
                          </div>
                        )}
                      </div>
                      <div className="p-2 space-y-1">
                        <div className="font-semibold text-slate-800 dark:text-slate-200 text-xs truncate">
                          {title}
                        </div>
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-400 font-mono">#{idx + 1}</span>
                          <button
                            type="button"
                            onClick={() => setSelectedRowDetail(row)}
                            className="text-emerald-600 hover:underline font-semibold"
                          >
                            Details
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Raw JSON View */
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-slate-950 px-4 py-2 rounded-t-xl border border-slate-800">
                <span className="text-xs font-mono text-slate-400">
                  {filteredResults.length} records (JSON format)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(filteredResults, null, 2));
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2000);
                  }}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? 'Copied!' : 'Copy All JSON'}</span>
                </button>
              </div>
              <pre className="bg-slate-950 p-4 rounded-b-xl border border-t-0 border-slate-800 text-xs font-mono text-emerald-400 max-h-[500px] overflow-auto whitespace-pre">
                {JSON.stringify(filteredResults, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 3: FILES & ARTIFACTS (Capability-Gated)
         ===================================================================== */}
      {activeTab === 'files' && hasFilesCapability && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Folder className="w-5 h-5 text-amber-500" />
                <span>Generated Output Files</span>
              </h3>
              <p className="text-xs text-slate-500">
                Binary artifacts, screenshot captures, PDFs, and archives stored securely on our servers.
              </p>
            </div>
            {activeJob && (
              <button
                onClick={() => loadJobFiles(activeJob.id)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-xs font-bold rounded-lg flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingFiles ? 'animate-spin' : ''}`} />
                <span>Refresh Files</span>
              </button>
            )}
          </div>

          {jobFiles.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              No files generated for this run yet. If the actor produces files, they will appear here automatically.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {jobFiles.map((f) => (
                <div key={f.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs truncate max-w-[180px]">{f.file_name}</span>
                    <span className="text-[10px] text-slate-400 uppercase font-mono">
                      {Math.round(f.byte_size / 1024)} KB
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono truncate">{f.content_type}</div>
                  <div className="flex items-center justify-between pt-2">
                    <a
                      href={f.download_url}
                      download
                      className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs flex items-center gap-1 transition"
                    >
                      <Download className="w-3 h-3" />
                      <span>Download</span>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 4: RUN HISTORY & RUN-TO-RUN COMPARE
         ===================================================================== */}
      {activeTab === 'history' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-purple-500" />
                <span>Extraction History for {product.display_name}</span>
              </h3>
              <p className="text-xs text-slate-500">
                Track past runs, charges, delivered counts, and compare result differences across runs.
              </p>
            </div>
            <button
              onClick={loadHistoryJobs}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-xs font-bold rounded-lg flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          {/* History List */}
          {historyJobs.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">No previous runs recorded.</div>
          ) : (
            <div className="space-y-3">
              {historyJobs.map((j) => (
                <div
                  key={j.id}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-white">{j.id}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          j.status === 'COMPLETED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : j.status === 'FAILED'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {j.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Delivered: {j.items_delivered} items • Charged: {currencySymbol}{j.charged_amount.toFixed(2)} {j.currency}
                      {j.runtime_seconds ? ` • Runtime: ${j.runtime_seconds}s` : ''}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveJob(j);
                        loadJobResults(j.id);
                        setActiveTab('results');
                      }}
                      className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-800 dark:text-slate-100 font-semibold rounded-lg text-xs"
                    >
                      View Results
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 5: DEVELOPER ACCESS
         ===================================================================== */}
      {activeTab === 'api' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4 text-xs">
          <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
            <Code className="w-5 h-5 text-emerald-500" />
            <span>Developer REST API Access</span>
          </h3>
          <p className="text-slate-500">
            Execute this extraction product programmatically from your backend, Python scripts, or CI pipelines using clean white-labeled endpoints.
          </p>

          <div className="bg-slate-950 p-4 rounded-xl text-slate-200 font-mono text-[11px] space-y-2 overflow-x-auto">
            <div className="text-slate-400"># Start extraction job programmatically</div>
            <div>curl -X POST https://api.yourdomain.com/api/marketplace/jobs \</div>
            <div className="pl-4">-H "Authorization: Bearer YOUR_API_TOKEN" \</div>
            <div className="pl-4">-H "Content-Type: application/json" \</div>
            <div className="pl-4">-d '{JSON.stringify({ productSlug: product.slug, requestedItems: 100, inputValues: formValues }, null, 2)}'</div>
          </div>
        </div>
      )}

      {/* Row Detail Drawer Modal */}
      {selectedRowDetail && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">Record Detail View</h3>
              <button onClick={() => setSelectedRowDetail(null)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>
            <div className="overflow-y-auto space-y-2 flex-1 text-xs">
              {Object.entries(selectedRowDetail).map(([k, v]) => (
                <div key={k} className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
                  <span className="font-bold text-slate-700 dark:text-slate-300 block mb-0.5 font-mono text-[11px]">{k}</span>
                  <span className="text-slate-600 dark:text-slate-400 break-all">
                    {typeof v === 'object' && v !== null ? JSON.stringify(v, null, 2) : String(v ?? '')}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedRowDetail(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Input / CSV Parser Modal */}
      {bulkFieldTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Upload className="w-4 h-4 text-emerald-500" />
              <span>Bulk Input / CSV Upload for "{bulkFieldTarget.label}"</span>
            </h3>
            <p className="text-xs text-slate-500">
              Paste many entries separated by newlines, commas, or semicolons. The system will automatically validate syntax, remove duplicates, and report errors.
            </p>

            <textarea
              rows={6}
              value={bulkInputText}
              onChange={(e) => setBulkInputText(e.target.value)}
              placeholder="Paste bulk list here..."
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />

            {bulkParseResult && (
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs space-y-1">
                <div className="flex justify-between font-bold">
                  <span className="text-emerald-600 dark:text-emerald-400">
                    ✅ {bulkParseResult.items?.length || 0} valid items imported
                  </span>
                  <span className="text-slate-400">
                    {bulkParseResult.duplicatesRemoved || 0} duplicates removed
                  </span>
                </div>
                {bulkParseResult.invalidRows?.length > 0 && (
                  <div className="text-rose-500 text-[11px] pt-1">
                    ⚠️ {bulkParseResult.invalidRows.length} rows had syntax errors and were skipped.
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setBulkFieldTarget(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold text-slate-600"
              >
                Close
              </button>
              <button
                type="button"
                disabled={bulkParsing || !bulkInputText.trim()}
                onClick={handleParseBulkInput}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold disabled:opacity-50"
              >
                {bulkParsing ? 'Parsing...' : 'Parse & Apply'}
              </button>
            </div>
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
              placeholder="e.g. Verified B2B SaaS Leads USA"
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

      {/* Config Share / Export Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 text-xs">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">Export / Share Configuration</h3>
            <p className="text-slate-500">
              Copy this customer-safe JSON configuration to share or reload your extraction setup.
            </p>
            <div className="bg-slate-950 rounded-xl p-3 font-mono text-[11px] text-slate-300 max-h-48 overflow-y-auto">
              {JSON.stringify(formValues, null, 2)}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(formValues, null, 2));
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }}
                className="px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copiedLink ? 'Copied!' : 'Copy Config'}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 rounded-xl font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          POWER FEATURES MODALS (v3)
         ===================================================================== */}

      {/* 1. Command Palette Modal (Cmd+K / Ctrl+K) */}
      {showCommandPalette && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-24 p-4"
          onClick={() => setShowCommandPalette(false)}
        >
          <div 
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center px-4 py-3 border-b border-slate-100 dark:border-slate-800 gap-3">
              <Command className="w-4 h-4 text-emerald-500 shrink-0" />
              <input
                type="text"
                autoFocus
                placeholder="Type a command or search action (e.g. 'run', 'crm', 'share', 'topup')..."
                value={paletteSearch}
                onChange={(e) => setPaletteSearch(e.target.value)}
                className="w-full bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
              />
              <kbd className="px-2 py-0.5 text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-500 rounded border border-slate-200 dark:border-slate-700">
                ESC
              </kbd>
            </div>

            <div className="max-h-72 overflow-y-auto p-2 space-y-1 text-xs">
              {[
                {
                  id: 'run',
                  title: 'Run Extraction',
                  shortcut: 'Cmd + Enter',
                  icon: Play,
                  action: () => {
                    setShowCommandPalette(false);
                    if (activeTab !== 'configure') setActiveTab('configure');
                    handleLaunchExtraction();
                  }
                },
                {
                  id: 'save-preset',
                  title: 'Save Current Configuration as Preset',
                  shortcut: 'Preset',
                  icon: Save,
                  action: () => {
                    setShowCommandPalette(false);
                    setShowSavePresetModal(true);
                  }
                },
                {
                  id: 'results',
                  title: 'View Extracted Results',
                  shortcut: 'Tab 2',
                  icon: Eye,
                  action: () => {
                    setShowCommandPalette(false);
                    setActiveTab('results');
                  }
                },
                {
                  id: 'crm',
                  title: 'Save Delivered Leads to CRM Contacts List',
                  shortcut: 'CRM',
                  icon: UserPlus,
                  action: () => {
                    setShowCommandPalette(false);
                    loadCrmLists();
                    setShowCrmModal(true);
                  }
                },
                {
                  id: 'share',
                  title: 'Create 72-Hour White-Labeled Share Link',
                  shortcut: 'Share',
                  icon: Share2,
                  action: () => {
                    setShowCommandPalette(false);
                    handleCreateShareLink();
                  }
                },
                {
                  id: 'schedule',
                  title: 'Schedule Recurring Automated Extraction',
                  shortcut: 'Cron',
                  icon: Calendar,
                  action: () => {
                    setShowCommandPalette(false);
                    setShowScheduleModal(true);
                  }
                },
                {
                  id: 'topup',
                  title: 'Instant In-Studio Wallet Top-Up',
                  shortcut: 'Wallet',
                  icon: Wallet,
                  action: () => {
                    setShowCommandPalette(false);
                    setIsInlineAddFundsOpen(true);
                  }
                },
                {
                  id: 'export-csv',
                  title: 'Export Active Job Results as CSV',
                  shortcut: 'CSV',
                  icon: FileText,
                  disabled: !activeJob,
                  action: () => {
                    setShowCommandPalette(false);
                    if (activeJob) window.location.href = api.dataMarketplace.getExportUrl(activeJob.id, 'csv');
                  }
                },
                {
                  id: 'export-xlsx',
                  title: 'Export Active Job Results as Excel',
                  shortcut: 'XLSX',
                  icon: FileSpreadsheet,
                  disabled: !activeJob,
                  action: () => {
                    setShowCommandPalette(false);
                    if (activeJob) window.location.href = api.dataMarketplace.getExportUrl(activeJob.id, 'xlsx');
                  }
                }
              ]
                .filter(
                  (item) =>
                    !paletteSearch.trim() ||
                    item.title.toLowerCase().includes(paletteSearch.toLowerCase()) ||
                    item.id.includes(paletteSearch.toLowerCase())
                )
                .map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={item.disabled}
                      onClick={item.action}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition text-left disabled:opacity-40"
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{item.title}</span>
                      </div>
                      <kbd className="px-2 py-0.5 text-[10px] font-mono bg-slate-50 dark:bg-slate-800/80 text-slate-400 rounded border border-slate-200 dark:border-slate-700">
                        {item.shortcut}
                      </kbd>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* 2. Save to CRM List Modal */}
      {showCrmModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center">
                  <UserPlus className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">Save Leads to Contacts CRM</h3>
                  <p className="text-[11px] text-slate-500">Flow extracted records directly into your CRM database</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCrmModal(false);
                  setCrmSyncSuccess(null);
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            {crmSyncSuccess ? (
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 space-y-2">
                <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-xs">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <span>CRM Sync Completed Successfully!</span>
                </div>
                <div className="text-[11px] text-emerald-700 dark:text-emerald-300 space-y-1 font-mono">
                  <div>• Leads Inserted: {crmSyncSuccess.inserted}</div>
                  <div>• Leads Updated/Deduplicated: {crmSyncSuccess.updated}</div>
                  <div>• Total Processed: {crmSyncSuccess.total}</div>
                </div>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCrmModal(false);
                      setCrmSyncSuccess(null);
                    }}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Target CRM List (Optional)
                  </label>
                  <select
                    value={selectedCrmListId}
                    onChange={(e) => setSelectedCrmListId(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none"
                  >
                    <option value="">Default (All Workspace Contacts)</option>
                    {crmLists.map((l: any) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({l.contact_count ?? l.member_count ?? 0} leads)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Deduplication Rule
                  </label>
                  <select
                    value={crmDedupeRule}
                    onChange={(e) => setCrmDedupeRule(e.target.value as any)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none"
                  >
                    <option value="update">Update existing contacts with newest info</option>
                    <option value="skip">Skip duplicates (keep original contact)</option>
                    <option value="merge">Merge new fields without overwriting existing data</option>
                  </select>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-[11px] text-slate-500 space-y-1">
                  <div>• Email & Phone will be normalized automatically (E.164 standard).</div>
                  <div>• All extra schema fields will be preserved in contact custom attributes.</div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCrmModal(false)}
                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={crmSyncing}
                    onClick={handleSyncToCrm}
                    className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 disabled:opacity-50 transition"
                  >
                    {crmSyncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                    <span>{crmSyncing ? 'Syncing...' : 'Sync Leads Now'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. Signed Share Link Modal (72 Hours White-Labeled) */}
      {showShareModal && shareLinkData && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center">
                  <Share2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">Share Extraction Results</h3>
                  <p className="text-[11px] text-slate-500">72-Hour White-Labeled Public Results Link</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900 rounded-xl text-xs text-blue-700 dark:text-blue-300">
                Anyone with this secure signed link can view and download the extracted records without needing an account. Upstream providers and internal pricing are strictly hidden.
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Signed Link (Expires in 72 hours)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareLinkData.shareUrl}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(shareLinkData.shareUrl);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2000);
                    }}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 transition"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedLink ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              <div className="flex justify-between items-center text-[11px] text-slate-400 pt-1">
                <span>Expires: {new Date(shareLinkData.expiresAt).toLocaleString()}</span>
                <a
                  href={shareLinkData.shareUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-500 hover:underline flex items-center gap-1"
                >
                  <span>Open Preview</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Schedule Recurring Run Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950 flex items-center justify-center">
                  <Calendar className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">Schedule Recurring Extraction</h3>
                  <p className="text-[11px] text-slate-500">Automate recurring data collection on a cron schedule</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Schedule Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Weekly Verified Tech Leads"
                  value={scheduleName}
                  onChange={(e) => setScheduleName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Frequency (Cron Expression)
                </label>
                <select
                  value={scheduleCron}
                  onChange={(e) => setScheduleCron(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none"
                >
                  <option value="0 9 * * 1">Every Monday at 9:00 AM</option>
                  <option value="0 9 * * *">Every Day at 9:00 AM</option>
                  <option value="0 0 1 * *">First Day of Every Month</option>
                  <option value="0 */6 * * *">Every 6 Hours</option>
                </select>
                <input
                  type="text"
                  value={scheduleCron}
                  onChange={(e) => setScheduleCron(e.target.value)}
                  placeholder="Custom Cron (e.g. 0 9 * * 1)"
                  className="w-full mt-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Items Target
                  </label>
                  <input
                    type="number"
                    value={requestedItems}
                    disabled
                    className="w-full bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-500 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Max Budget ({selectedCurrency})
                  </label>
                  <input
                    type="number"
                    value={scheduleBudget}
                    onChange={(e) => setScheduleBudget(Math.max(1, Number(e.target.value)))}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none"
                  />
                </div>
              </div>

              <div className="p-3 bg-purple-50/50 dark:bg-purple-950/20 rounded-xl text-[11px] text-purple-700 dark:text-purple-300">
                Scheduled runs reserve wallet funds at trigger time. If available balance is insufficient, the schedule will skip and notify you.
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingSchedule || !scheduleName.trim()}
                onClick={handleSaveSchedule}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-1.5 disabled:opacity-50 transition"
              >
                {savingSchedule ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Calendar className="w-3.5 h-3.5" />}
                <span>{savingSchedule ? 'Saving...' : 'Save Schedule'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wallet Instant Top-Up Modal */}
      <WalletTopUpModal
        isOpen={isTopUpModalOpen}
        onClose={() => setIsTopUpModalOpen(false)}
        currentBalance={walletBalance}
        onSuccess={(newBal) => {
          setWallet((prev) => (prev ? { ...prev, balance: newBal } : null));
          fetchWallet();
          fetchQuote(requestedItems, selectedCurrency);
        }}
      />
    </div>
  );
};
