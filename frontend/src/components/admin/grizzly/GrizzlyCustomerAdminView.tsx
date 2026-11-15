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
  Database,
  Tag,
  GitCompare,
  FileCheck2,
  Plus,
  Trash2,
  AlertTriangle,
  Wallet,
  Globe,
  Languages,
  Download,
  Copy,
  Check,
  ExternalLink,
  Lock,
  Unlock,
  BookOpen
} from 'lucide-react';

export const GrizzlyCustomerAdminView: React.FC = () => {
  const [activeSubView, setActiveSubView] = useState<
    'config' | 'crypto' | 'services' | 'countries' | 'pricing' | 'providers' | 'reconciliation' | 'sync_center' | 'activations' | 'logs'
  >('config');
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
    pricing_endpoint: 'getPricesV3',
    price_sync_interval_minutes: 60,
    auto_price_sync: true,
    reconciliation_interval_minutes: 30,
    auto_reconciliation: true,
    preferred_providers: '',
    min_profit: 2,
    max_acceptable_provider_cost: 100,
    currency_conversion_rate: 1,
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

  // Pricing State
  const [cachedPrices, setCachedPrices] = useState<any[]>([]);
  const [pricesTotal, setPricesTotal] = useState(0);
  const [syncingPrices, setSyncingPrices] = useState(false);
  const [syncEndpoint, setSyncEndpoint] = useState<'getPrices' | 'getPricesV2' | 'getPricesV3'>('getPricesV3');
  const [priceFilterCountry, setPriceFilterCountry] = useState('');
  const [priceFilterService, setPriceFilterService] = useState('');

  // Provider Rules State
  const [providerRules, setProviderRules] = useState<any[]>([]);
  const [showAddRuleModal, setShowAddRuleModal] = useState(false);
  const [newRule, setNewRule] = useState<any>({
    scope: 'global',
    countryId: '',
    serviceCode: '',
    allowedProviderIds: '',
    excludedProviderIds: '',
    preferredProviderId: '',
    minPrice: '',
    maxPrice: '',
    markupPercentage: '',
    fixedFee: '',
    isActive: true
  });

  // Reconciliation State
  const [reconciling, setReconciling] = useState(false);
  const [reconRuns, setReconRuns] = useState<any[]>([]);
  const [reconRecords, setReconRecords] = useState<any[]>([]);
  const [reconTotal, setReconTotal] = useState(0);
  const [reconFilterType, setReconFilterType] = useState('all');
  const [reconFilterStatus, setReconFilterStatus] = useState('all');

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

  // Crypto Funding State (Module 1)
  const [cryptoWallet, setCryptoWallet] = useState<any>(null);
  const [cryptoThreshold, setCryptoThreshold] = useState<number>(50);
  const [cryptoHistory, setCryptoHistory] = useState<any[]>([]);
  const [refreshingCrypto, setRefreshingCrypto] = useState(false);
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);

  // Services Catalogue State (Module 2)
  const [servicesList, setServicesList] = useState<any[]>([]);
  const [servicesTotal, setServicesTotal] = useState(0);
  const [servicesSearch, setServicesSearch] = useState('');
  const [servicesCategory, setServicesCategory] = useState('');
  const [syncingServices, setSyncingServices] = useState(false);
  const [editingService, setEditingService] = useState<any>(null);

  // Multilingual Countries State (Module 3)
  const [countriesList, setCountriesList] = useState<any[]>([]);
  const [countriesTotal, setCountriesTotal] = useState(0);
  const [countriesSearch, setCountriesSearch] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('eng');
  const [syncingCountries, setSyncingCountries] = useState(false);
  const [editingCountry, setEditingCountry] = useState<any>(null);

  // Data Synchronization Control Center (Module 5)
  const [syncJobs, setSyncJobs] = useState<any[]>([]);
  const [syncHistory, setSyncHistory] = useState<any[]>([]);
  const [triggeringJob, setTriggeringJob] = useState<string | null>(null);

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

  const loadPrices = async () => {
    try {
      setLoading(true);
      const res = await api.virtualNumbers.grizzlyCustomer.getCachedPrices({
        countryId: priceFilterCountry || undefined,
        serviceCode: priceFilterService || undefined,
        limit: 50
      });
      if (res.success) {
        setCachedPrices(res.prices || []);
        setPricesTotal(res.total || 0);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load cached prices', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadProviderRules = async () => {
    try {
      setLoading(true);
      const res = await api.virtualNumbers.grizzlyCustomer.getProviderRules();
      if (res.success) {
        setProviderRules(res.rules || []);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load provider rules', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadReconciliation = async () => {
    try {
      setLoading(true);
      const [runsRes, recordsRes] = await Promise.all([
        api.virtualNumbers.grizzlyCustomer.getReconciliationRuns({ limit: 10 }),
        api.virtualNumbers.grizzlyCustomer.getReconciliationRecords({
          discrepancyType: reconFilterType !== 'all' ? reconFilterType : undefined,
          resolutionStatus: reconFilterStatus !== 'all' ? reconFilterStatus : undefined,
          limit: 50
        })
      ]);
      if (runsRes.success) setReconRuns(runsRes.runs || []);
      if (recordsRes.success) {
        setReconRecords(recordsRes.records || []);
        setReconTotal(recordsRes.total || 0);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load reconciliation data', 'error');
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

  const loadCrypto = async () => {
    try {
      setLoading(true);
      const [walletRes, histRes] = await Promise.all([
        api.virtualNumbers.grizzlyCustomer.getCryptoWallet(),
        api.virtualNumbers.grizzlyCustomer.getCryptoWalletHistory(10)
      ]);
      if (walletRes.success && walletRes.wallet) {
        setCryptoWallet(walletRes.wallet);
        setCryptoThreshold(walletRes.wallet.automaticCreditThresholdUsd || 50);
      }
      if (histRes.success) {
        setCryptoHistory(histRes.history || []);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load crypto wallet information', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshCrypto = async () => {
    try {
      setRefreshingCrypto(true);
      const res = await api.virtualNumbers.grizzlyCustomer.refreshCryptoWallet({ coin: 'usdt', network: 'tron' });
      if (res.success && res.walletInfo) {
        setCryptoWallet(res.walletInfo);
        showToast('Static deposit address refreshed from GrizzlySMS');
      } else {
        throw new Error(res.error || 'Failed to refresh crypto wallet');
      }
    } catch (err: any) {
      showToast(err.message || 'Crypto refresh failed', 'error');
    } finally {
      setRefreshingCrypto(false);
    }
  };

  const handleUpdateCryptoThreshold = async () => {
    try {
      setSavingThreshold(true);
      const res = await api.virtualNumbers.grizzlyCustomer.updateCryptoThreshold(cryptoThreshold);
      if (res.success) {
        showToast(`Automatic credit threshold updated to $${res.threshold} USD`);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to update threshold', 'error');
    } finally {
      setSavingThreshold(false);
    }
  };

  const loadServices = async () => {
    try {
      setLoading(true);
      const res = await api.virtualNumbers.grizzlyCustomer.getServices({
        search: servicesSearch,
        category: servicesCategory || undefined,
        all: true
      });
      if (res.success) {
        setServicesList(res.services || []);
        setServicesTotal(res.total || 0);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load services catalogue', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncServices = async () => {
    try {
      setSyncingServices(true);
      const res = await api.virtualNumbers.grizzlyCustomer.syncServices();
      if (res.success) {
        showToast(`Services synced: +${res.inserted} inserted, ${res.updated} updated, ${res.unchanged} unchanged (${res.durationMs}ms)`);
        loadServices();
      } else {
        throw new Error(res.error || 'Service sync failed');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to synchronize services', 'error');
    } finally {
      setSyncingServices(false);
    }
  };

  const loadCountries = async () => {
    try {
      setLoading(true);
      const res = await api.virtualNumbers.grizzlyCustomer.getCountries({
        search: countriesSearch,
        lang: selectedLanguage,
        all: true,
        limit: 150
      });
      if (res.success) {
        setCountriesList(res.rows || []);
        setCountriesTotal(res.total || 0);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load countries registry', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncCountries = async () => {
    try {
      setSyncingCountries(true);
      const res = await api.virtualNumbers.grizzlyCustomer.syncCountries();
      if (res.success) {
        showToast(`Countries synced: +${res.inserted} inserted, ${res.updated} updated, ${res.unchanged} unchanged (${res.durationMs}ms)`);
        loadCountries();
      } else {
        throw new Error(res.error || 'Country sync failed');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to synchronize countries', 'error');
    } finally {
      setSyncingCountries(false);
    }
  };

  const loadSyncJobs = async () => {
    try {
      setLoading(true);
      const [jobsRes, histRes] = await Promise.all([
        api.virtualNumbers.grizzlyCustomer.getSyncJobs(),
        api.virtualNumbers.grizzlyCustomer.getSyncHistory({ limit: 20 })
      ]);
      if (jobsRes.success) setSyncJobs(jobsRes.jobs || []);
      if (histRes.success) setSyncHistory(histRes.history || []);
    } catch (err: any) {
      showToast(err.message || 'Failed to load synchronization control center', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerSyncJob = async (jobType: string) => {
    try {
      setTriggeringJob(jobType);
      const res = await api.virtualNumbers.grizzlyCustomer.triggerSyncJob(jobType);
      if (res.success) {
        showToast(`Job "${jobType}" completed successfully!`);
        loadSyncJobs();
      } else {
        throw new Error((res as any).error || 'Sync job failed');
      }
    } catch (err: any) {
      showToast(err.message || 'Job trigger error', 'error');
    } finally {
      setTriggeringJob(null);
    }
  };

  useEffect(() => {
    if (activeSubView === 'config') loadConfig();
    if (activeSubView === 'crypto') loadCrypto();
    if (activeSubView === 'services') loadServices();
    if (activeSubView === 'countries') loadCountries();
    if (activeSubView === 'pricing') loadPrices();
    if (activeSubView === 'providers') loadProviderRules();
    if (activeSubView === 'reconciliation') loadReconciliation();
    if (activeSubView === 'sync_center') loadSyncJobs();
    if (activeSubView === 'activations') loadActivations();
    if (activeSubView === 'logs') loadLogs();
  }, [
    activeSubView,
    priceFilterCountry,
    priceFilterService,
    reconFilterType,
    reconFilterStatus,
    servicesSearch,
    servicesCategory,
    countriesSearch,
    selectedLanguage
  ]);

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
        customer_daily_limit: parseInt(config.customer_daily_limit, 10) || 50,
        pricing_endpoint: config.pricing_endpoint,
        price_sync_interval_minutes: parseInt(config.price_sync_interval_minutes, 10) || 60,
        auto_price_sync: Boolean(config.auto_price_sync),
        reconciliation_interval_minutes: parseInt(config.reconciliation_interval_minutes, 10) || 30,
        auto_reconciliation: Boolean(config.auto_reconciliation),
        preferred_providers: config.preferred_providers,
        min_profit: parseFloat(config.min_profit) || 2,
        max_acceptable_provider_cost: parseFloat(config.max_acceptable_provider_cost) || 100,
        currency_conversion_rate: parseFloat(config.currency_conversion_rate) || 1
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

  const handleSyncPrices = async () => {
    try {
      setSyncingPrices(true);
      const res = await api.virtualNumbers.grizzlyCustomer.syncPrices({
        endpoint: syncEndpoint
      });
      if (res.success) {
        showToast(`Synchronized ${res.syncedCount} country-service prices via ${res.endpoint}!`);
        loadPrices();
      } else {
        showToast(res.error || 'Failed to synchronize prices', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Price sync failed', 'error');
    } finally {
      setSyncingPrices(false);
    }
  };

  const handleRunReconciliation = async () => {
    if (!confirm('Run reconciliation against GrizzlySMS active activations now?')) return;
    try {
      setReconciling(true);
      const res = await api.virtualNumbers.grizzlyCustomer.runReconciliation();
      if (res.success && res.summary) {
        showToast(`Reconciliation complete! Matched: ${res.summary.matchedCount}, Discrepancies: ${res.summary.discrepancyCount}`);
        loadReconciliation();
      } else {
        showToast(res.error || 'Reconciliation failed', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Reconciliation error', 'error');
    } finally {
      setReconciling(false);
    }
  };

  const handleResolveRecord = async (recordId: string, action: 'resolve' | 'ignore') => {
    try {
      const res = await api.virtualNumbers.grizzlyCustomer.resolveReconciliationRecord(recordId, { action });
      if (res.success) {
        showToast(`Record marked as ${action}d`);
        loadReconciliation();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to update record', 'error');
    }
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.virtualNumbers.grizzlyCustomer.saveProviderRule({
        scope: newRule.scope,
        countryId: newRule.countryId || null,
        serviceCode: newRule.serviceCode || null,
        allowedProviderIds: newRule.allowedProviderIds || null,
        excludedProviderIds: newRule.excludedProviderIds || null,
        preferredProviderId: newRule.preferredProviderId || null,
        minPrice: newRule.minPrice ? parseFloat(newRule.minPrice) : null,
        maxPrice: newRule.maxPrice ? parseFloat(newRule.maxPrice) : null,
        markupPercentage: newRule.markupPercentage ? parseFloat(newRule.markupPercentage) : null,
        fixedFee: newRule.fixedFee ? parseFloat(newRule.fixedFee) : null,
        isActive: newRule.isActive
      });
      if (res.success) {
        showToast('Provider selection rule saved successfully');
        setShowAddRuleModal(false);
        loadProviderRules();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to save rule', 'error');
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm('Delete this provider selection rule?')) return;
    try {
      const res = await api.virtualNumbers.grizzlyCustomer.deleteProviderRule(id);
      if (res.success) {
        showToast('Rule deleted');
        loadProviderRules();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to delete rule', 'error');
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
          Gateway Settings
        </button>

        <button
          onClick={() => setActiveSubView('crypto')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
            activeSubView === 'crypto'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Wallet className="w-4 h-4" />
          Crypto Funding ($50 USD Threshold)
        </button>

        <button
          onClick={() => setActiveSubView('services')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
            activeSubView === 'services'
              ? 'bg-teal-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Send className="w-4 h-4" />
          Services Catalogue ({servicesTotal})
        </button>

        <button
          onClick={() => setActiveSubView('countries')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
            activeSubView === 'countries'
              ? 'bg-cyan-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Globe className="w-4 h-4" />
          Multilingual Countries ({countriesTotal})
        </button>

        <button
          onClick={() => setActiveSubView('pricing')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
            activeSubView === 'pricing'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Tag className="w-4 h-4" />
          Pricing Engine & Sync ({pricesTotal})
        </button>

        <button
          onClick={() => setActiveSubView('providers')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
            activeSubView === 'providers'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <GitCompare className="w-4 h-4" />
          Provider Rules ({providerRules.length})
        </button>

        <button
          onClick={() => setActiveSubView('reconciliation')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
            activeSubView === 'reconciliation'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <FileCheck2 className="w-4 h-4" />
          Reconciliation ({reconTotal})
        </button>

        <button
          onClick={() => setActiveSubView('sync_center')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
            activeSubView === 'sync_center'
              ? 'bg-violet-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Activity className="w-4 h-4" />
          Data Synchronization Control
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
          Customer Activations ({activationsReport.total})
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
          Diagnostics Logs ({logsTotal})
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

          {/* Section D: Automation, Price Sync & Reconciliation */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              4. Scheduled Automation & Sync Controls
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Preferred Pricing Endpoint
                </label>
                <select
                  value={config.pricing_endpoint || 'getPricesV3'}
                  onChange={(e) => setConfig({ ...config, pricing_endpoint: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl font-mono focus:ring-2 focus:ring-purple-500 bg-white"
                >
                  <option value="getPricesV3">getPricesV3 (Multi-provider routing & live prices)</option>
                  <option value="getPricesV2">getPricesV2 (Price tiers & inventory counts)</option>
                  <option value="getPrices">getPrices (Standard country-service prices)</option>
                </select>
                <p className="text-[10px] text-slate-400 mt-0.5">Primary endpoint used for price fetching and sync</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Price Sync Interval (Minutes)
                </label>
                <input
                  type="number"
                  min="5"
                  value={config.price_sync_interval_minutes || 60}
                  onChange={(e) => setConfig({ ...config, price_sync_interval_minutes: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl font-mono"
                />
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="checkbox"
                    id="auto_price_sync"
                    checked={Boolean(config.auto_price_sync)}
                    onChange={(e) => setConfig({ ...config, auto_price_sync: e.target.checked })}
                    className="rounded text-purple-600"
                  />
                  <label htmlFor="auto_price_sync" className="text-[11px] text-slate-600">
                    Enable Auto Price Sync
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Reconciliation Interval (Minutes)
                </label>
                <input
                  type="number"
                  min="5"
                  value={config.reconciliation_interval_minutes || 30}
                  onChange={(e) => setConfig({ ...config, reconciliation_interval_minutes: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl font-mono"
                />
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="checkbox"
                    id="auto_reconciliation"
                    checked={Boolean(config.auto_reconciliation)}
                    onChange={(e) => setConfig({ ...config, auto_reconciliation: e.target.checked })}
                    className="rounded text-purple-600"
                  />
                  <label htmlFor="auto_reconciliation" className="text-[11px] text-slate-600">
                    Enable Auto Reconciliation
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Minimum Profit Guarantee (₹)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={config.min_profit || 2}
                  onChange={(e) => setConfig({ ...config, min_profit: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">Guaranteed minimum margin per purchase</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Currency Conversion Rate
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={config.currency_conversion_rate || 1}
                  onChange={(e) => setConfig({ ...config, currency_conversion_rate: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">Multiplier from provider currency to INR</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Max Acceptable Provider Cost
                </label>
                <input
                  type="number"
                  step="1"
                  value={config.max_acceptable_provider_cost || 100}
                  onChange={(e) => setConfig({ ...config, max_acceptable_provider_cost: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">Provider quotes above this are rejected</p>
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

      {/* VIEW: CRYPTO FUNDING (MODULE 1) */}
      {activeSubView === 'crypto' && (
        <div className="space-y-6">
          {/* Important Payment Threshold & Financial Isolation Warning */}
          <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 space-y-2.5">
            <div className="flex items-center gap-2 font-bold text-sm text-amber-900">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              Official GrizzlySMS Deposit Threshold & Security Requirements
            </div>
            <ul className="text-xs space-y-1.5 pl-6 list-disc text-amber-800 leading-relaxed">
              <li>
                <strong>Automatic Credit Threshold:</strong> Funds are credited automatically by GrizzlySMS for amounts starting from <strong>${cryptoThreshold || 50} USD equivalent</strong>.
              </li>
              <li>
                <strong>Sub-threshold Warning:</strong> Deposits below this threshold must NOT be assumed to be automatically credited and require manual provider ticket review.
              </li>
              <li>
                <strong>Asset & Network:</strong> Transfers must be <strong>USDT</strong> strictly on the <strong>Tron (TRC-20)</strong> network. Other assets or chains will result in permanent loss.
              </li>
              <li>
                <strong>Financial Isolation:</strong> This static address funds our platform's master GrizzlySMS balance. It is completely isolated and never credits end-user customer wallets.
              </li>
            </ul>
          </div>

          {/* Primary Deposit Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-xl">
                  ₮
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                    GrizzlySMS Master Deposit Wallet
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        cryptoWallet?.status === 'active'
                          ? 'bg-emerald-100 text-emerald-800'
                          : cryptoWallet?.status === 'stale'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {cryptoWallet?.status || 'Active'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Asset: <strong>USDT</strong> &bull; Network: <strong>TRC-20 (Tron)</strong>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRefreshCrypto}
                  disabled={refreshingCrypto}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshingCrypto ? 'animate-spin' : ''}`} />
                  {refreshingCrypto ? 'Fetching Address...' : 'Refresh Address'}
                </button>
              </div>
            </div>

            {/* Wallet Address Display */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Master TRC-20 Deposit Address
              </label>
              <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 p-3.5 rounded-xl">
                <code className="text-sm font-mono font-bold text-purple-950 flex-1 break-all select-all">
                  {cryptoWallet?.walletAddress || 'Click "Refresh Address" to retrieve deposit address'}
                </code>
                {cryptoWallet?.walletAddress && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(cryptoWallet.walletAddress);
                      setCopiedAddress(true);
                      setTimeout(() => setCopiedAddress(false), 2000);
                      showToast('Address copied to clipboard!');
                    }}
                    className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition shrink-0"
                  >
                    {copiedAddress ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedAddress ? 'Copied' : 'Copy Address'}
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                Last Verified: {cryptoWallet?.lastFetchedAt ? new Date(cryptoWallet.lastFetchedAt).toLocaleString() : 'Never'}
              </p>
            </div>

            {/* Configurable Threshold */}
            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase">Automatic Credit Threshold ($ USD)</h4>
                <p className="text-[11px] text-slate-500">Documented provider default is $50 USD equivalent.</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">$</span>
                  <input
                    type="number"
                    min="10"
                    step="5"
                    value={cryptoThreshold}
                    onChange={(e) => setCryptoThreshold(parseFloat(e.target.value) || 50)}
                    className="w-28 pl-7 pr-3 py-1.5 text-xs font-mono border border-slate-200 rounded-xl"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleUpdateCryptoThreshold}
                  disabled={savingThreshold}
                  className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition"
                >
                  {savingThreshold ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>

          {/* Historical Wallets */}
          {cryptoHistory.length > 0 && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Address Verification History ({cryptoHistory.length})
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Address</th>
                      <th className="py-2.5 px-3">Coin & Network</th>
                      <th className="py-2.5 px-3">Threshold</th>
                      <th className="py-2.5 px-3">Verified At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {cryptoHistory.map((h) => (
                      <tr key={h.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-bold text-slate-800">{h.wallet_address}</td>
                        <td className="py-2.5 px-3 text-slate-600 uppercase">{h.coin} / {h.network}</td>
                        <td className="py-2.5 px-3 text-amber-700 font-bold">${h.threshold_usd}</td>
                        <td className="py-2.5 px-3 text-slate-400 text-[11px]">{new Date(h.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW: SERVICES CATALOGUE (MODULE 2) */}
      {activeSubView === 'services' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Official Services Catalogue</h3>
                <p className="text-xs text-slate-500">
                  Imported directly via <code>getServicesList</code>. Official codes and names are preserved.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleSyncServices}
                disabled={syncingServices}
                className="px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncingServices ? 'animate-spin' : ''}`} />
                {syncingServices ? 'Syncing...' : 'Sync getServicesList'}
              </button>
              <a
                href={api.virtualNumbers.grizzlyCustomer.getExportServicesUrl('csv')}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </a>
              <a
                href={api.virtualNumbers.grizzlyCustomer.getExportServicesUrl('json')}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
              >
                <Download className="w-3.5 h-3.5" />
                Export JSON
              </a>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <input
                type="text"
                placeholder="Search services by official code, official name, or display name..."
                value={servicesSearch}
                onChange={(e) => setServicesSearch(e.target.value)}
                className="w-full px-3.5 py-2 text-xs border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <select
              value={servicesCategory}
              onChange={(e) => setServicesCategory(e.target.value)}
              className="px-3 py-2 text-xs border border-slate-200 rounded-xl font-medium bg-white"
            >
              <option value="">All Categories</option>
              <option value="messaging">Messaging</option>
              <option value="social">Social Media</option>
              <option value="delivery">Delivery & Transport</option>
              <option value="general">General</option>
            </select>
          </div>

          {/* Services Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Official Code</th>
                    <th className="py-3 px-4">Official Provider Name</th>
                    <th className="py-3 px-4">Customer Display Name</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {servicesList.map((svc) => (
                    <tr key={svc.provider_service_code} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono font-black text-purple-700 uppercase">
                        {svc.provider_service_code}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {svc.service_name}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-700">
                        {svc.display_name}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 uppercase">
                          {svc.category || 'general'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            svc.is_active === 1
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {svc.is_active === 1 ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setEditingService(svc)}
                          className="px-2.5 py-1 text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                  {servicesList.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 font-semibold">
                        No services found. Click "Sync getServicesList" to import from GrizzlySMS.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: MULTILINGUAL COUNTRIES (MODULE 3) */}
      {activeSubView === 'countries' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-50 text-cyan-700 flex items-center justify-center">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Multilingual Countries Registry</h3>
                <p className="text-xs text-slate-500">
                  Synced via <code>getCountries</code>. Official Grizzly numeric IDs are strictly preserved.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleSyncCountries}
                disabled={syncingCountries}
                className="px-3.5 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncingCountries ? 'animate-spin' : ''}`} />
                {syncingCountries ? 'Syncing...' : 'Sync getCountries'}
              </button>
              <a
                href={api.virtualNumbers.grizzlyCustomer.getExportCountriesUrl('csv')}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </a>
              <a
                href={api.virtualNumbers.grizzlyCustomer.getExportCountriesUrl('json')}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
              >
                <Download className="w-3.5 h-3.5" />
                Export JSON
              </a>
            </div>
          </div>

          {/* Language Selector Pills */}
          <div className="flex items-center gap-2 flex-wrap bg-white p-3 rounded-2xl border border-slate-200 text-xs font-bold">
            <span className="text-slate-500 flex items-center gap-1 mr-2 uppercase text-[10px] tracking-wider">
              <Languages className="w-4 h-4 text-cyan-600" /> Display Language:
            </span>
            {[
              { code: 'eng', name: 'English (eng)' },
              { code: 'rus', name: 'Русский (rus)' },
              { code: 'chn', name: '中文 (chn)' },
              { code: 'tur', name: 'Türkçe (tur)' },
              { code: 'spa', name: 'Español (spa)' },
              { code: 'hin', name: 'हिन्दी (hin)' },
              { code: 'ara', name: 'العربية (ara)' },
              { code: 'fra', name: 'Français (fra)' }
            ].map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => setSelectedLanguage(l.code)}
                className={`px-3 py-1.5 rounded-xl transition ${
                  selectedLanguage === l.code
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-600'
                }`}
              >
                {l.name}
              </button>
            ))}
          </div>

          {/* Search Bar */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search across multilingual names, English names, or official Grizzly Country ID..."
              value={countriesSearch}
              onChange={(e) => setCountriesSearch(e.target.value)}
              className="w-full px-3.5 py-2 text-xs border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          {/* Countries Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Grizzly ID</th>
                    <th className="py-3 px-4">Flag</th>
                    <th className="py-3 px-4">Localized Name ({selectedLanguage.toUpperCase()})</th>
                    <th className="py-3 px-4">Official English Name</th>
                    <th className="py-3 px-4">Admin Custom Name</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {countriesList.map((c) => (
                    <tr key={c.provider_country_id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono font-black text-slate-900">
                        {c.provider_country_id}
                      </td>
                      <td className="py-3 px-4 text-base">
                        {c.custom_flag || c.flag || '🌐'}
                      </td>
                      <td className="py-3 px-4 font-bold text-cyan-900">
                        {c.resolvedName || c.eng || c.country_name}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {c.eng || c.country_name}
                      </td>
                      <td className="py-3 px-4 text-slate-500 italic">
                        {c.custom_display_name || '—'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            c.is_active === 1
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {c.is_active === 1 ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setEditingCountry(c)}
                          className="px-2.5 py-1 text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                  {countriesList.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 font-semibold">
                        No countries found. Click "Sync getCountries" to import multilingual catalogue.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: PRICING ENGINE & SYNCHRONIZATION */}
      {activeSubView === 'pricing' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
                <Tag className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Real-Time Provider Pricing Cache</h3>
                <p className="text-xs text-slate-500">
                  Sync country and service rate quotes via getPrices, getPricesV2, or getPricesV3.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <select
                value={syncEndpoint}
                onChange={(e) => setSyncEndpoint(e.target.value as any)}
                className="px-3 py-2 text-xs border border-slate-200 rounded-xl font-mono bg-slate-50"
              >
                <option value="getPricesV3">getPricesV3 (Recommended)</option>
                <option value="getPricesV2">getPricesV2</option>
                <option value="getPrices">getPrices</option>
              </select>

              <button
                type="button"
                onClick={handleSyncPrices}
                disabled={syncingPrices}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncingPrices ? 'animate-spin' : ''}`} />
                {syncingPrices ? 'Syncing...' : 'Sync Live Prices'}
              </button>
            </div>
          </div>

          {/* Pricing Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Cached Rate Quotes ({pricesTotal})
              </span>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Filter country (e.g. 22)"
                  value={priceFilterCountry}
                  onChange={(e) => setPriceFilterCountry(e.target.value)}
                  className="px-2.5 py-1 text-xs border border-slate-200 rounded-lg font-mono w-32"
                />
                <input
                  type="text"
                  placeholder="Filter service (e.g. tg)"
                  value={priceFilterService}
                  onChange={(e) => setPriceFilterService(e.target.value)}
                  className="px-2.5 py-1 text-xs border border-slate-200 rounded-lg font-mono w-32"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                    <th className="py-3 px-4">Country</th>
                    <th className="py-3 px-4">Service</th>
                    <th className="py-3 px-4">Source</th>
                    <th className="py-3 px-4 text-right">Overall Price</th>
                    <th className="py-3 px-4 text-right">Available Stock</th>
                    <th className="py-3 px-4 text-center">Routes</th>
                    <th className="py-3 px-4">Last Synced</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cachedPrices.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4 font-bold text-slate-800">
                        {p.country_name || `Country #${p.country_id}`}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-indigo-700 uppercase">
                        {p.service_code}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                        {p.pricing_source}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600">
                        ₹{Number(p.overall_price || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-700">
                        {p.overall_quantity || 0}
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-[11px]">
                        {p.providers_count || 1}
                      </td>
                      <td className="py-3 px-4 text-slate-400 text-[11px] font-mono">
                        {p.last_synced_at ? new Date(p.last_synced_at).toLocaleString() : 'Never'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            p.is_stale === 1
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {p.is_stale === 1 ? 'Stale' : 'Live'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {cachedPrices.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400 font-semibold">
                        No cached pricing data found. Click &quot;Sync Live Prices&quot; above to populate quotes.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: PROVIDER RULES & SELECTION */}
      {activeSubView === 'providers' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
                <GitCompare className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Provider Selection & Routing Rules</h3>
                <p className="text-xs text-slate-500">
                  Define included/excluded provider IDs, preferred routes, and country/service specific margins.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowAddRuleModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Selection Rule
            </button>
          </div>

          {/* Add Rule Form Modal */}
          {showAddRuleModal && (
            <div className="p-5 bg-blue-50/50 border border-blue-200 rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                  New Provider Routing Rule
                </h4>
                <button
                  onClick={() => setShowAddRuleModal(false)}
                  className="text-slate-400 hover:text-slate-600 text-xs font-bold"
                >
                  Cancel
                </button>
              </div>

              <form onSubmit={handleSaveRule} className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Scope</label>
                  <select
                    value={newRule.scope}
                    onChange={(e) => setNewRule({ ...newRule, scope: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono bg-white"
                  >
                    <option value="global">Global (All numbers)</option>
                    <option value="country">Country Specific</option>
                    <option value="service">Service Specific</option>
                    <option value="country_service">Country + Service Pair</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Country ID (if scoped)</label>
                  <input
                    type="text"
                    placeholder="e.g. 22"
                    value={newRule.countryId}
                    onChange={(e) => setNewRule({ ...newRule, countryId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Service Code (if scoped)</label>
                  <input
                    type="text"
                    placeholder="e.g. tg, wa"
                    value={newRule.serviceCode}
                    onChange={(e) => setNewRule({ ...newRule, serviceCode: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Allowed Provider IDs</label>
                  <input
                    type="text"
                    placeholder="e.g. 1, 2"
                    value={newRule.allowedProviderIds}
                    onChange={(e) => setNewRule({ ...newRule, allowedProviderIds: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Excluded Provider IDs</label>
                  <input
                    type="text"
                    placeholder="e.g. 4, 5"
                    value={newRule.excludedProviderIds}
                    onChange={(e) => setNewRule({ ...newRule, excludedProviderIds: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Max Price Cap (₹)</label>
                  <input
                    type="number"
                    placeholder="e.g. 50"
                    value={newRule.maxPrice}
                    onChange={(e) => setNewRule({ ...newRule, maxPrice: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono"
                  />
                </div>

                <div className="md:col-span-3 flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddRuleModal(false)}
                    className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition"
                  >
                    Save Rule
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Rules List Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Configured Rules ({providerRules.length})
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                    <th className="py-3 px-4">Scope</th>
                    <th className="py-3 px-4">Country</th>
                    <th className="py-3 px-4">Service</th>
                    <th className="py-3 px-4">Allowed IDs</th>
                    <th className="py-3 px-4">Excluded IDs</th>
                    <th className="py-3 px-4 text-right">Max Price</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {providerRules.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4 font-bold text-blue-700 uppercase font-mono">
                        {r.scope}
                      </td>
                      <td className="py-3 px-4 font-mono">
                        {r.countryId || 'ALL'}
                      </td>
                      <td className="py-3 px-4 font-mono uppercase">
                        {r.serviceCode || 'ALL'}
                      </td>
                      <td className="py-3 px-4 font-mono text-emerald-700">
                        {r.allowedProviderIds || '—'}
                      </td>
                      <td className="py-3 px-4 font-mono text-rose-700">
                        {r.excludedProviderIds || '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold">
                        {r.maxPrice ? `₹${r.maxPrice}` : '—'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${r.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
                          {r.isActive ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleDeleteRule(r.id)}
                          className="text-rose-600 hover:text-rose-700 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {providerRules.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400 font-semibold">
                        No custom provider rules defined. Default global parameters apply.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 4: RECONCILIATION ENGINE */}
      {activeSubView === 'reconciliation' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                <FileCheck2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Active Activations Reconciliation Engine</h3>
                <p className="text-xs text-slate-500">
                  Audit local pending activations against GrizzlySMS active numbers. Flags discrepancies without blind refunds.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRunReconciliation}
              disabled={reconciling}
              className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition disabled:opacity-50 shadow-md shadow-amber-600/20"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${reconciling ? 'animate-spin' : ''}`} />
              {reconciling ? 'Running Reconciliation...' : 'Run Reconciliation Now'}
            </button>
          </div>

          {/* Runs Summary Cards */}
          {reconRuns.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Remote Active</span>
                <span className="text-xl font-black text-slate-800 font-mono mt-0.5 block">{reconRuns[0].totalRemote}</span>
              </div>
              <div className="bg-white p-4 rounded-xl border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-emerald-600 block">Matched Activations</span>
                <span className="text-xl font-black text-emerald-700 font-mono mt-0.5 block">{reconRuns[0].matchedCount}</span>
              </div>
              <div className="bg-white p-4 rounded-xl border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-rose-600 block">Discrepancies</span>
                <span className="text-xl font-black text-rose-700 font-mono mt-0.5 block">{reconRuns[0].discrepancyCount}</span>
              </div>
              <div className="bg-white p-4 rounded-xl border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Last Run Status</span>
                <span className="text-sm font-bold text-slate-700 font-mono mt-1 block uppercase">{reconRuns[0].status} ({reconRuns[0].durationMs}ms)</span>
              </div>
            </div>
          )}

          {/* Discrepancies Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Reconciliation Discrepancy Records ({reconTotal})
              </span>

              <div className="flex items-center gap-2">
                <select
                  value={reconFilterType}
                  onChange={(e) => setReconFilterType(e.target.value)}
                  className="px-2.5 py-1 text-xs border border-slate-200 rounded-lg font-mono bg-slate-50"
                >
                  <option value="all">All Discrepancy Types</option>
                  <option value="matched">Matched</option>
                  <option value="missing_locally">Missing Locally</option>
                  <option value="missing_remotely">Missing Remotely</option>
                  <option value="cost_mismatch">Cost Mismatch</option>
                  <option value="status_mismatch">Status Mismatch</option>
                </select>

                <select
                  value={reconFilterStatus}
                  onChange={(e) => setReconFilterStatus(e.target.value)}
                  className="px-2.5 py-1 text-xs border border-slate-200 rounded-lg font-mono bg-slate-50"
                >
                  <option value="all">All Resolutions</option>
                  <option value="pending">Pending</option>
                  <option value="resolved">Resolved</option>
                  <option value="ignored">Ignored</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                    <th className="py-3 px-4">Provider Activation ID</th>
                    <th className="py-3 px-4">Local ID</th>
                    <th className="py-3 px-4">Phone Number</th>
                    <th className="py-3 px-4">Service</th>
                    <th className="py-3 px-4 text-right">Provider vs Local Cost</th>
                    <th className="py-3 px-4">Discrepancy Type</th>
                    <th className="py-3 px-4">Resolution</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reconRecords.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4 font-mono font-bold text-amber-800">
                        #{r.providerActivationId}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                        {r.localActivationId ? r.localActivationId.slice(0, 12) + '...' : '—'}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold">
                        {r.phoneNumber ? `+${r.phoneNumber}` : '—'}
                      </td>
                      <td className="py-3 px-4 font-mono uppercase">
                        {r.serviceCode || '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono">
                        ₹{Number(r.providerCost || 0).toFixed(2)} vs ₹{Number(r.localCost || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            r.discrepancyType === 'matched'
                              ? 'bg-emerald-100 text-emerald-800'
                              : r.discrepancyType === 'missing_remotely'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {r.discrepancyType.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            r.resolutionStatus === 'resolved'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {r.resolutionStatus}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {r.resolutionStatus === 'pending' ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleResolveRecord(r.id, 'resolve')}
                              className="px-2 py-0.5 bg-emerald-600 text-white rounded text-[10px] font-bold hover:bg-emerald-700"
                            >
                              Resolve
                            </button>
                            <button
                              onClick={() => handleResolveRecord(r.id, 'ignore')}
                              className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded text-[10px] font-bold hover:bg-slate-300"
                            >
                              Ignore
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-mono">Archived</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {reconRecords.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400 font-semibold">
                        No reconciliation discrepancy records found. Run reconciliation above to check.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: DATA SYNCHRONIZATION CONTROL CENTER (MODULE 5) */}
      {activeSubView === 'sync_center' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-700 flex items-center justify-center">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Data Synchronization Control Center</h3>
                <p className="text-xs text-slate-500">
                  Manage all 6 GrizzlySMS synchronization jobs with atomic worker locks and performance metrics.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={loadSyncJobs}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh Status
            </button>
          </div>

          {/* Grid of 6 Sync Jobs */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {syncJobs.map((job) => (
              <div key={job.jobType} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                      {job.jobType}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        job.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : job.status === 'running'
                          ? 'bg-blue-100 text-blue-800 animate-pulse'
                          : job.status === 'failed'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {job.status}
                    </span>
                  </div>

                  <h4 className="font-bold text-slate-900 text-sm">{job.jobName}</h4>

                  <div className="mt-3 space-y-1.5 text-[11px] text-slate-500">
                    <div className="flex justify-between">
                      <span>Last Success:</span>
                      <span className="font-mono text-slate-700">
                        {job.lastSuccessfulAt ? new Date(job.lastSuccessfulAt).toLocaleTimeString() : 'Never'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Duration:</span>
                      <span className="font-mono text-slate-700">{job.executionDurationMs} ms</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Records (Ins / Upd):</span>
                      <span className="font-mono text-slate-700 font-bold">
                        +{job.recordsInserted} / {job.recordsUpdated}
                      </span>
                    </div>
                    {job.recordsMarkedInactive > 0 && (
                      <div className="flex justify-between text-amber-700">
                        <span>Marked Inactive:</span>
                        <span className="font-mono font-bold">{job.recordsMarkedInactive}</span>
                      </div>
                    )}
                    {job.errorMessage && (
                      <p className="mt-2 text-[10px] text-rose-600 bg-rose-50 p-2 rounded-lg font-mono break-words">
                        {job.errorMessage}
                      </p>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                    {job.isLocked ? <Lock className="w-3 h-3 text-amber-600" /> : <Unlock className="w-3 h-3 text-slate-400" />}
                    {job.isLocked ? 'Locked' : 'Idle'}
                  </span>

                  <button
                    type="button"
                    onClick={() => handleTriggerSyncJob(job.jobType)}
                    disabled={triggeringJob === job.jobType || job.isLocked}
                    className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${triggeringJob === job.jobType ? 'animate-spin' : ''}`} />
                    {triggeringJob === job.jobType ? 'Running...' : 'Run Now'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Sync History Table */}
          {syncHistory.length > 0 && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Synchronization History Log ({syncHistory.length})
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Timestamp</th>
                      <th className="py-2.5 px-3">Job Type</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Inserted</th>
                      <th className="py-2.5 px-3 text-right">Updated</th>
                      <th className="py-2.5 px-3 text-right">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {syncHistory.map((h) => (
                      <tr key={h.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 text-slate-400 text-[11px]">{new Date(h.created_at).toLocaleString()}</td>
                        <td className="py-2.5 px-3 font-bold text-purple-800 uppercase">{h.job_type}</td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            h.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {h.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right text-emerald-700 font-bold">+{h.records_inserted}</td>
                        <td className="py-2.5 px-3 text-right text-slate-700">{h.records_updated}</td>
                        <td className="py-2.5 px-3 text-right text-slate-500">{h.execution_duration_ms} ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
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

      {/* EDIT SERVICE MODAL */}
      {editingService && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm">
                Edit Service: <span className="text-purple-600 uppercase font-mono">{editingService.provider_service_code}</span>
              </h3>
              <button onClick={() => setEditingService(null)} className="text-slate-400 hover:text-slate-600">
                &times;
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Official Provider Name</label>
                <input
                  type="text"
                  value={editingService.service_name}
                  disabled
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-500 font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">Original provider name cannot be overwritten</p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Customer Display Name</label>
                <input
                  type="text"
                  value={editingService.display_name || ''}
                  onChange={(e) => setEditingService({ ...editingService, display_name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Category</label>
                <select
                  value={editingService.category || 'general'}
                  onChange={(e) => setEditingService({ ...editingService, category: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-medium bg-white"
                >
                  <option value="messaging">Messaging</option>
                  <option value="social">Social Media</option>
                  <option value="delivery">Delivery & Transport</option>
                  <option value="general">General</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="service_is_active"
                  checked={editingService.is_active === 1}
                  onChange={(e) => setEditingService({ ...editingService, is_active: e.target.checked ? 1 : 0 })}
                  className="rounded text-purple-600"
                />
                <label htmlFor="service_is_active" className="font-bold text-slate-700">
                  Service Active in Marketplace
                </label>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingService(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await api.virtualNumbers.grizzlyCustomer.updateService(editingService.provider_service_code, {
                      displayName: editingService.display_name,
                      category: editingService.category,
                      isActive: editingService.is_active === 1
                    });
                    showToast('Service updated successfully');
                    setEditingService(null);
                    loadServices();
                  } catch (err: any) {
                    showToast(err.message || 'Failed to update service', 'error');
                  }
                }}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT COUNTRY MODAL */}
      {editingCountry && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm">
                Edit Country: <span className="text-cyan-600 font-mono">ID #{editingCountry.provider_country_id}</span>
              </h3>
              <button onClick={() => setEditingCountry(null)} className="text-slate-400 hover:text-slate-600">
                &times;
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Official English Name</label>
                <input
                  type="text"
                  value={editingCountry.eng || editingCountry.country_name}
                  disabled
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-500 font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">Original provider translation cannot be overwritten</p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Admin Custom Display Name</label>
                <input
                  type="text"
                  value={editingCountry.custom_display_name || ''}
                  onChange={(e) => setEditingCountry({ ...editingCountry, custom_display_name: e.target.value })}
                  placeholder="Optional custom display override"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Custom Flag Emoji</label>
                <input
                  type="text"
                  value={editingCountry.custom_flag || ''}
                  onChange={(e) => setEditingCountry({ ...editingCountry, custom_flag: e.target.value })}
                  placeholder="e.g. 🇺🇸, 🇮🇳"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-medium"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="country_is_active"
                  checked={editingCountry.is_active === 1}
                  onChange={(e) => setEditingCountry({ ...editingCountry, is_active: e.target.checked ? 1 : 0 })}
                  className="rounded text-cyan-600"
                />
                <label htmlFor="country_is_active" className="font-bold text-slate-700">
                  Country Active in Marketplace
                </label>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingCountry(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await api.virtualNumbers.grizzlyCustomer.updateCountry(editingCountry.provider_country_id, {
                      customDisplayName: editingCountry.custom_display_name,
                      customFlag: editingCountry.custom_flag,
                      isActive: editingCountry.is_active === 1
                    });
                    showToast('Country updated successfully');
                    setEditingCountry(null);
                    loadCountries();
                  } catch (err: any) {
                    showToast(err.message || 'Failed to update country', 'error');
                  }
                }}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-bold"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

