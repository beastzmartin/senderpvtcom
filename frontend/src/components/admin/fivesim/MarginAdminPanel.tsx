import React, { useState, useEffect } from 'react';
import { api } from '../../../services/api';
import {
  MarginRule,
  PricingSettings,
  ProfitReport,
  NumberOrder,
  HiddenItem,
  FiveSimProfile,
  CurrencyRecord,
  MarginAuditLogRecord
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
  SlidersHorizontal,
  Edit2,
  Save,
  Globe,
  Star,
  Download,
  Upload,
  History,
  CheckSquare,
  Square,
  Undo2
} from 'lucide-react';

export const MarginAdminPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'rules' | 'settings' | 'currencies' | 'preview' | 'analytics' | 'audit' | 'hidden'>('rules');

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

  // Bulk Selection for Rules
  const [selectedRuleIds, setSelectedRuleIds] = useState<Set<string>>(new Set());
  const [isBulkAdjustModalOpen, setIsBulkAdjustModalOpen] = useState(false);
  const [bulkPercentDelta, setBulkPercentDelta] = useState<number>(5);
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);

  // CSV Import / Export & Sync States
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [csvImportText, setCsvImportText] = useState('');
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [isSyncingCatalog, setIsSyncingCatalog] = useState(false);

  // Audit Logs
  const [auditLogs, setAuditLogs] = useState<MarginAuditLogRecord[]>([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);
  const [operatingAuditId, setOperatingAuditId] = useState<string | null>(null);

  // Multi-Currency Admin States
  const [currencies, setCurrencies] = useState<CurrencyRecord[]>([]);
  const [loadingCurrencies, setLoadingCurrencies] = useState(false);
  const [isAddCurrencyOpen, setIsAddCurrencyOpen] = useState(false);
  const [editingCurrencyCode, setEditingCurrencyCode] = useState<string | null>(null);
  const [editingCurrencyRate, setEditingCurrencyRate] = useState<number>(1.0);
  const [isSavingCurrency, setIsSavingCurrency] = useState(false);
  const [newCurrency, setNewCurrency] = useState({
    code: '',
    name: '',
    symbol: '',
    rate_from_5sim_base: 1.0,
    rate_from_usd: 1.0,
    is_default: false,
    is_active: true
  });
  const [currencyTestUsd, setCurrencyTestUsd] = useState<number>(1.0);

  // Settings form states
  const [providerCurrencyInput, setProviderCurrencyInput] = useState<string>('USD');
  const [providerCurrencyRateInput, setProviderCurrencyRateInput] = useState<number>(1.0);
  const [fxRateInput, setFxRateInput] = useState<number>(1.0);
  const [minMarginInput, setMinMarginInput] = useState<number>(0.25);
  const [minSellPriceInput, setMinSellPriceInput] = useState<number>(0.50);
  const [roundingModeInput, setRoundingModeInput] = useState<'none' | '2_decimals' | 'nearest_1' | '99_cents'>('2_decimals');
  const [lowBalanceThresholdInput, setLowBalanceThresholdInput] = useState<number>(50.0);
  const [displayCurrencyInput, setDisplayCurrencyInput] = useState<string>('INR');
  const [banRefundPolicyInput, setBanRefundPolicyInput] = useState<'auto' | 'manual'>('auto');
  const [autoRefundOnBanInput, setAutoRefundOnBanInput] = useState<boolean>(true);
  const [syncIntervalInput, setSyncIntervalInput] = useState<number>(60);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Create Rule Modal states
  const [isCreateRuleOpen, setIsCreateRuleOpen] = useState(false);
  const [newScope, setNewScope] = useState<'global' | 'provider' | 'country' | 'product' | 'country_product' | 'country_product_operator'>('global');
  const [newCountry, setNewCountry] = useState('');
  const [newProduct, setNewProduct] = useState('');
  const [newOperator, setNewOperator] = useState('');
  const [newType, setNewType] = useState<'percent' | 'fixed' | 'percent_plus_fixed'>('percent');
  const [newPercentValue, setNewPercentValue] = useState<number>(25);
  const [newFixedValue, setNewFixedValue] = useState<number>(0);
  const [newMinPrice, setNewMinPrice] = useState<number | undefined>(undefined);
  const [newMaxPrice, setNewMaxPrice] = useState<number | undefined>(undefined);
  const [newCustomOverride, setNewCustomOverride] = useState<number | undefined>(undefined);
  const [newDescription, setNewDescription] = useState<string>('');
  const [isSubmittingRule, setIsSubmittingRule] = useState(false);

  // Price Preview states
  const [previewCost, setPreviewCost] = useState<number>(0.89);
  const [previewCountry, setPreviewCountry] = useState<string>('england');
  const [previewProduct, setPreviewProduct] = useState<string>('whatsapp');
  const [previewOperator, setPreviewOperator] = useState<string>('any');
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);

  // Hidden item modal
  const [newHiddenType, setNewHiddenType] = useState<'country' | 'product'>('country');
  const [newHiddenValue, setNewHiddenValue] = useState('');

  // Manual Refund modal
  const [refundModalOrder, setRefundModalOrder] = useState<NumberOrder | null>(null);
  const [refundReason, setRefundReason] = useState<string>('Admin manual cancellation and refund');
  const [isRefunding, setIsRefunding] = useState(false);

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
        loadCurrencies(),
        loadHiddenItems(),
        loadProfitReport(profitPeriod),
        loadAdminOrders(),
        loadFiveSimHealth(),
        loadAuditLogs()
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
      setProviderCurrencyInput(res.settings.provider_currency || 'USD');
      setProviderCurrencyRateInput(res.settings.provider_currency_to_usd_rate || 1.0);
      setFxRateInput(res.settings.fx_rate);
      setMinMarginInput(res.settings.min_margin);
      setMinSellPriceInput(res.settings.min_sell_price);
      setRoundingModeInput(res.settings.rounding_mode);
      setLowBalanceThresholdInput(res.settings.low_balance_threshold);
      setDisplayCurrencyInput(res.settings.display_currency);
      setBanRefundPolicyInput(res.settings.ban_refund_policy || 'auto');
      setAutoRefundOnBanInput(res.settings.auto_refund_on_ban !== 0);
      setSyncIntervalInput(res.settings.sync_interval_seconds || 60);
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

  const loadAuditLogs = async () => {
    try {
      setLoadingAuditLogs(true);
      const res = await api.margin.getAuditLogs(100);
      if (res.success) {
        const logs = res.auditLogs || res.logs || [];
        setAuditLogs(logs);
      }
    } catch (err: any) {
      console.warn('Failed to load audit logs:', err);
    } finally {
      setLoadingAuditLogs(false);
    }
  };

  const handleSyncCatalog = async () => {
    setIsSyncingCatalog(true);
    try {
      const res = await api.numbers.sync();
      if (res.success) {
        showToast(res.message || '5SIM catalog synchronized and cache refreshed!', 'success');
        await loadAllData();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to sync catalog', 'error');
    } finally {
      setIsSyncingCatalog(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      const res = await api.margin.updateSettings({
        provider_currency: providerCurrencyInput,
        provider_currency_to_usd_rate: Number(providerCurrencyRateInput),
        fx_rate: Number(fxRateInput),
        min_margin: Number(minMarginInput),
        min_sell_price: Number(minSellPriceInput),
        rounding_mode: roundingModeInput,
        low_balance_threshold: Number(lowBalanceThresholdInput),
        display_currency: displayCurrencyInput,
        ban_refund_policy: banRefundPolicyInput,
        auto_refund_on_ban: autoRefundOnBanInput ? 1 : 0,
        sync_interval_seconds: Number(syncIntervalInput)
      });

      if (res.success) {
        setSettings(res.settings);
        showToast('Pricing & provider settings saved! Applied across all customer orders.', 'success');
        await loadAuditLogs();
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
        min_price: newMinPrice !== undefined && !isNaN(newMinPrice) ? Number(newMinPrice) : undefined,
        max_price: newMaxPrice !== undefined && !isNaN(newMaxPrice) ? Number(newMaxPrice) : undefined,
        custom_override_price: newCustomOverride !== undefined && !isNaN(newCustomOverride) ? Number(newCustomOverride) : undefined,
        description: newDescription || undefined,
        enabled: true
      });

      if (res.success) {
        showToast('New margin rule established successfully!', 'success');
        setIsCreateRuleOpen(false);
        setNewCountry('');
        setNewProduct('');
        setNewOperator('');
        setNewMinPrice(undefined);
        setNewMaxPrice(undefined);
        setNewCustomOverride(undefined);
        setNewDescription('');
        await Promise.all([loadRules(), loadAuditLogs()]);
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
        await Promise.all([loadRules(), loadAuditLogs()]);
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
        await Promise.all([loadRules(), loadAuditLogs()]);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to delete rule', 'error');
    }
  };

  // Bulk Selection Handlers
  const toggleSelectRule = (id: string) => {
    const next = new Set(selectedRuleIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedRuleIds(next);
  };

  const toggleSelectAllRules = () => {
    if (selectedRuleIds.size === rules.length) {
      setSelectedRuleIds(new Set());
    } else {
      setSelectedRuleIds(new Set(rules.map((r) => r.id)));
    }
  };

  const handleBulkUpdateStatus = async (enabled: boolean) => {
    if (selectedRuleIds.size === 0) return;
    setIsProcessingBulk(true);
    try {
      const res = await api.margin.bulkUpdate({
        rule_ids: Array.from(selectedRuleIds),
        enabled
      });
      if (res.success) {
        showToast(`Updated ${res.updatedCount} rules successfully.`, 'success');
        setSelectedRuleIds(new Set());
        await Promise.all([loadRules(), loadAuditLogs()]);
      }
    } catch (err: any) {
      showToast(err.message || 'Bulk update failed', 'error');
    } finally {
      setIsProcessingBulk(false);
    }
  };

  const handleBulkAdjustPercent = async () => {
    if (selectedRuleIds.size === 0) return;
    setIsProcessingBulk(true);
    try {
      const res = await api.margin.bulkUpdate({
        rule_ids: Array.from(selectedRuleIds),
        percent_delta: Number(bulkPercentDelta)
      });
      if (res.success) {
        showToast(`Adjusted percentage for ${res.updatedCount} rules by ${bulkPercentDelta > 0 ? '+' : ''}${bulkPercentDelta}%.`, 'success');
        setSelectedRuleIds(new Set());
        setIsBulkAdjustModalOpen(false);
        await Promise.all([loadRules(), loadAuditLogs()]);
      }
    } catch (err: any) {
      showToast(err.message || 'Bulk adjustment failed', 'error');
    } finally {
      setIsProcessingBulk(false);
    }
  };

  const handleExportCsv = async () => {
    try {
      const res = await api.margin.exportCsv();
      if (res.success && res.csv) {
        const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `5sim_margin_rules_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('Margin rules exported to CSV successfully.', 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to export CSV', 'error');
    }
  };

  const handleImportCsv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvImportText.trim()) {
      showToast('Please paste valid CSV content or upload a CSV file', 'error');
      return;
    }
    setIsImportingCsv(true);
    try {
      const res = await api.margin.importCsv(csvImportText);
      if (res.success) {
        const count = res.importedCount ?? res.imported ?? 0;
        showToast(`Imported ${count} margin rules successfully!`, 'success');
        setIsImportModalOpen(false);
        setCsvImportText('');
        await Promise.all([loadRules(), loadAuditLogs()]);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to import CSV rules', 'error');
    } finally {
      setIsImportingCsv(false);
    }
  };

  const handleResetDefaults = async () => {
    if (!confirm('Are you sure you want to reset margin rules to clean defaults (+25% Global Markup)? All custom overrides will be replaced.')) return;
    try {
      const res = await api.margin.resetDefaults();
      if (res.success) {
        showToast('Margin rules restored to sovereign factory defaults.', 'success');
        await Promise.all([loadRules(), loadAuditLogs()]);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to reset rules', 'error');
    }
  };

  const handleUndoAudit = async (logId: string) => {
    if (!confirm('Revert this administrative action to its prior state?')) return;
    setOperatingAuditId(logId);
    try {
      const res = await api.margin.undoAuditLog(logId);
      if (res.success) {
        showToast(res.message || 'Action reverted successfully!', 'success');
        await Promise.all([loadRules(), loadSettings(), loadAuditLogs()]);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to undo action', 'error');
    } finally {
      setOperatingAuditId(null);
    }
  };

  const handleExecuteAdminRefund = async () => {
    if (!refundModalOrder) return;
    setIsRefunding(true);
    try {
      const res = await api.numbers.adminRefund(refundModalOrder.id, refundReason);
      if (res.success) {
        showToast(res.message || 'Order refunded successfully to customer wallet!', 'success');
        setRefundModalOrder(null);
        await Promise.all([loadAdminOrders(), loadProfitReport(profitPeriod)]);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to process admin refund', 'error');
    } finally {
      setIsRefunding(false);
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
      showToast(err.message || 'Preview calculation failed', 'error');
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

  // --- Multi-Currency Handlers ---
  const loadCurrencies = async () => {
    try {
      setLoadingCurrencies(true);
      const res = await api.currency.admin.getAll();
      if (res.success && res.currencies) {
        setCurrencies(res.currencies);
      }
    } catch (err: any) {
      console.warn('Failed to load admin currencies:', err);
    } finally {
      setLoadingCurrencies(false);
    }
  };

  const handleAddCurrency = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCurrency.code.trim() || !newCurrency.name.trim() || !newCurrency.symbol.trim()) {
      showToast('Please fill all required currency fields', 'error');
      return;
    }
    const rateUsd = Number(newCurrency.rate_from_usd || newCurrency.rate_from_5sim_base);
    if (rateUsd <= 0) {
      showToast('Exchange rate from USD must be > 0', 'error');
      return;
    }
    setIsSavingCurrency(true);
    try {
      const res = await api.currency.admin.add({
        code: newCurrency.code.toUpperCase(),
        name: newCurrency.name,
        symbol: newCurrency.symbol,
        rate_from_usd: rateUsd,
        rate_from_5sim_base: rateUsd,
        is_default: newCurrency.is_default,
        is_active: newCurrency.is_active
      });
      if (res.success) {
        showToast(res.message, 'success');
        setIsAddCurrencyOpen(false);
        setNewCurrency({ code: '', name: '', symbol: '', rate_from_5sim_base: 1.0, rate_from_usd: 1.0, is_default: false, is_active: true });
        await loadCurrencies();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to add currency', 'error');
    } finally {
      setIsSavingCurrency(false);
    }
  };

  const handleUpdateCurrencyRate = async (code: string) => {
    if (editingCurrencyRate <= 0) {
      showToast('Exchange rate must be > 0', 'error');
      return;
    }
    setIsSavingCurrency(true);
    try {
      const res = await api.currency.admin.update(code, {
        rate_from_usd: editingCurrencyRate,
        rate_from_5sim_base: editingCurrencyRate,
        manual_override: 1
      });
      if (res.success) {
        showToast(`Rate for ${code} updated to ${editingCurrencyRate}!`, 'success');
        setEditingCurrencyCode(null);
        await loadCurrencies();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to update rate', 'error');
    } finally {
      setIsSavingCurrency(false);
    }
  };

  const handleToggleCurrencyActive = async (curr: CurrencyRecord) => {
    try {
      const res = await api.currency.admin.update(curr.code, { is_active: curr.is_active !== 1 });
      if (res.success) {
        showToast(`Currency ${curr.code} is now ${curr.is_active === 1 ? 'disabled' : 'active'}.`, 'info');
        await loadCurrencies();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to toggle status', 'error');
    }
  };

  const handleDeleteCurrency = async (code: string) => {
    if (!confirm(`Are you sure you want to delete currency '${code}'?`)) return;
    try {
      const res = await api.currency.admin.delete(code);
      if (res.success) {
        showToast(`Currency '${code}' deleted.`, 'info');
        await loadCurrencies();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to delete currency', 'error');
    }
  };

  const handleSetDefaultCurrency = async (code: string) => {
    try {
      const res = await api.currency.admin.update(code, { is_default: true, is_active: true });
      if (res.success) {
        showToast(`Default system currency set to ${code}!`, 'success');
        await loadCurrencies();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to set default currency', 'error');
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
                🚨 Master 5SIM Provider Balance Depleted
              </div>
              <p className="text-xs text-rose-700 font-medium mt-0.5">
                Current 5SIM gateway balance is <strong className="font-bold">{fiveSimHealth.profile.balance.toFixed(2)} USD</strong> (Threshold: {fiveSimHealth.lowBalanceThreshold} USD). Rating: {fiveSimHealth.profile.rating}. Please top up your master account immediately.
              </p>
            </div>
          </div>
          <a
            href="https://5sim.net/payment"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 shadow-xs"
          >
            <span>Top Up 5SIM Account</span>
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
              Sovereign USD Margin & Multi-Currency Engine
            </span>
            <span className="text-xs text-slate-400 font-mono">Provider USD → Margin Rules → User Currency</span>
          </div>

          <h2 className="text-xl font-black tracking-tight flex items-center gap-2.5">
            <Coins className="w-6 h-6 text-sky-400" />
            5SIM Virtual Number Pricing, Margins & Multi-Currency Control Center
          </h2>

          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            Exact provider wholesale pricing with zero hardcoding. 6-level precedence hierarchy, CSV bulk operations, live 3-currency calculators, and immutable audit logs with instant rollback.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={handleSyncCatalog}
            disabled={isSyncingCatalog}
            className="px-3.5 py-2 bg-sky-600/30 hover:bg-sky-600/50 border border-sky-400/40 text-sky-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
            title="Clear cache and re-sync telecom prices from 5SIM"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncingCatalog ? 'animate-spin' : ''}`} />
            <span>{isSyncingCatalog ? 'Syncing...' : 'Sync 5SIM Catalog'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCreateRuleOpen(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-emerald-600/30"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Margin Rule</span>
          </button>

          <button
            type="button"
            onClick={loadAllData}
            disabled={loading}
            className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition border border-white/10"
            title="Refresh All"
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
          <span>Margin Rules ({rules.length})</span>
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
          <span>Pricing & Provider Settings</span>
        </button>

        <button
          onClick={() => setActiveTab('currencies')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
            activeTab === 'currencies'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Globe className="w-4 h-4" />
          <span>Currencies & USD Rates ({currencies.length})</span>
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
          <span>Live 3-Currency Preview</span>
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
          onClick={() => setActiveTab('audit')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
            activeTab === 'audit'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Audit Log & Rollback ({auditLogs.length})</span>
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
          {/* Priority Explanation Card & Bulk Action Bar */}
          <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 text-xs text-sky-950 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold">Strict 6-Level Precedence Resolution:</strong>
                <p className="mt-0.5 text-sky-800">
                  1. <strong>Country + Product + Operator</strong> &gt; 2. <strong>Country + Product</strong> &gt; 3. <strong>Country</strong> &gt; 4. <strong>Product</strong> &gt; 5. <strong>Provider Default</strong> &gt; 6. <strong>Global Default</strong>.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleExportCsv}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-xl font-bold flex items-center gap-1.5 shadow-2xs"
              >
                <Download className="w-3.5 h-3.5 text-slate-600" />
                <span>Export CSV</span>
              </button>

              <button
                type="button"
                onClick={() => setIsImportModalOpen(true)}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-xl font-bold flex items-center gap-1.5 shadow-2xs"
              >
                <Upload className="w-3.5 h-3.5 text-slate-600" />
                <span>Import CSV</span>
              </button>

              <button
                type="button"
                onClick={handleResetDefaults}
                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-xl font-bold flex items-center gap-1.5"
                title="Reset to global standard default markup"
              >
                <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
                <span>Reset Defaults</span>
              </button>
            </div>
          </div>

          {/* Bulk Action Controls when rows selected */}
          {selectedRuleIds.size > 0 && (
            <div className="bg-indigo-900 text-white rounded-2xl p-3 px-4 flex flex-wrap items-center justify-between gap-3 shadow-md animate-in fade-in duration-100">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-indigo-700 rounded-full font-bold font-mono text-xs">
                  {selectedRuleIds.size} Selected
                </span>
                <span className="text-xs text-indigo-200">Bulk operations apply to all checked rules.</span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleBulkUpdateStatus(true)}
                  disabled={isProcessingBulk}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-bold transition"
                >
                  Enable Selected
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkUpdateStatus(false)}
                  disabled={isProcessingBulk}
                  className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-bold transition"
                >
                  Disable Selected
                </button>
                <button
                  type="button"
                  onClick={() => setIsBulkAdjustModalOpen(true)}
                  disabled={isProcessingBulk}
                  className="px-3 py-1 bg-sky-600 hover:bg-sky-500 rounded-lg text-xs font-bold transition flex items-center gap-1"
                >
                  <Percent className="w-3 h-3" />
                  <span>Adjust Percent...</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedRuleIds(new Set())}
                  className="px-2.5 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-semibold text-slate-300"
                >
                  Clear Selection
                </button>
              </div>
            </div>
          )}

          {/* Rules Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="py-3 px-4 w-10">
                      <button
                        type="button"
                        onClick={toggleSelectAllRules}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        {selectedRuleIds.size === rules.length && rules.length > 0 ? (
                          <CheckSquare className="w-4 h-4 text-sky-600" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400" />
                        )}
                      </button>
                    </th>
                    <th className="py-3 px-4">Priority / Scope</th>
                    <th className="py-3 px-4">Country Target</th>
                    <th className="py-3 px-4">Product Target</th>
                    <th className="py-3 px-4">Operator</th>
                    <th className="py-3 px-4">Markup Model</th>
                    <th className="py-3 px-4">Configured Markup</th>
                    <th className="py-3 px-4">Min / Max Floor</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                  {rules.map((rule) => {
                    const isSelected = selectedRuleIds.has(rule.id);
                    return (
                      <tr key={rule.id} className={`hover:bg-slate-50/80 transition ${isSelected ? 'bg-sky-50/40' : ''}`}>
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => toggleSelectRule(rule.id)}
                            className="text-slate-400 hover:text-slate-600"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-sky-600" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-400" />
                            )}
                          </button>
                        </td>
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
                          {rule.custom_override_price !== undefined && rule.custom_override_price !== null ? (
                            <span className="text-purple-600 font-bold">Override: ${rule.custom_override_price.toFixed(2)} USD</span>
                          ) : rule.type === 'percent' ? (
                            `+${rule.percent_value}%`
                          ) : rule.type === 'fixed' ? (
                            `+$${rule.fixed_value.toFixed(2)} USD`
                          ) : (
                            `+${rule.percent_value}% and +$${rule.fixed_value.toFixed(2)} USD`
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                          {rule.min_price || rule.max_price
                            ? `$${rule.min_price?.toFixed(2) || '0.00'} – $${rule.max_price?.toFixed(2) || '∞'}`
                            : '---'}
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: PRICING & PROVIDER SETTINGS FORM */}
      {/* ========================================================================= */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs space-y-6">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-black text-slate-900">Sovereign USD Pricing & 5SIM Gateway Settings</h3>
            <p className="text-xs text-slate-500">
              Provider wholesale prices are in USD. All conversions and margins are computed in USD first, then translated into customer currencies.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5 max-w-5xl">
            {/* Provider Currency Setting */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                Provider Native Currency
              </label>
              <select
                value={providerCurrencyInput}
                onChange={(e) => setProviderCurrencyInput(e.target.value.toUpperCase())}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-hidden"
              >
                <option value="USD">USD ($) — Sovereign Verified</option>
                <option value="RUB">RUB (₽) — Russian Ruble</option>
                <option value="EUR">EUR (€) — Euro</option>
              </select>
              <p className="text-[11px] text-slate-400">
                Verified unit in 5SIM API: <strong>USD</strong>.
              </p>
            </div>

            {/* Provider -> USD Rate */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                Provider Currency → USD Rate
              </label>
              <input
                type="number"
                step="0.0001"
                min="0.000001"
                value={providerCurrencyRateInput}
                onChange={(e) => setProviderCurrencyRateInput(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-hidden"
                required
              />
              <p className="text-[11px] text-slate-400">
                Multiplier to convert provider prices to USD (1.0 for USD).
              </p>
            </div>

            {/* Ban Refund Policy */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                Banned Number Refund Policy
              </label>
              <select
                value={banRefundPolicyInput}
                onChange={(e) => setBanRefundPolicyInput(e.target.value as any)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-hidden"
              >
                <option value="auto">Auto-Refund (Instant customer refund on ban)</option>
                <option value="manual">Manual Review (Admin confirms before refund)</option>
              </select>
              <p className="text-[11px] text-slate-400">
                Determines wallet refund behavior when user reports a number banned.
              </p>
            </div>

            {/* Minimum Margin Floor (USD) */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                Minimum Profit Floor ($ USD)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={minMarginInput}
                onChange={(e) => setMinMarginInput(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-hidden"
                required
              />
              <p className="text-[11px] text-slate-400">
                Guaranteed minimum profit in USD per activation (e.g. $0.25).
              </p>
            </div>

            {/* Minimum Sell Price Floor (USD) */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                Floor Sell Price ($ USD)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={minSellPriceInput}
                onChange={(e) => setMinSellPriceInput(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-hidden"
                required
              />
              <p className="text-[11px] text-slate-400">
                No number will ever sell cheaper than this USD floor (e.g. $0.50).
              </p>
            </div>

            {/* Rounding Mode */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">Rounding Algorithm</label>
              <select
                value={roundingModeInput}
                onChange={(e) => setRoundingModeInput(e.target.value as any)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-hidden"
              >
                <option value="none">None (Exact float)</option>
                <option value="2_decimals">Standard 2 Decimals (e.g. 1.25)</option>
                <option value="nearest_1">Round Up to Integer (e.g. 2.00)</option>
                <option value="99_cents">.99 Psychological (e.g. 1.99)</option>
              </select>
              <p className="text-[11px] text-slate-400">Applied before currency presentation.</p>
            </div>

            {/* Catalog Cache & Background Sync Interval */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                Catalog Cache TTL (Seconds)
              </label>
              <input
                type="number"
                step="5"
                min="10"
                max="600"
                value={syncIntervalInput}
                onChange={(e) => setSyncIntervalInput(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-hidden"
                required
              />
              <p className="text-[11px] text-slate-400">
                Stale-while-revalidate background refresh period (30–60s recommended).
              </p>
            </div>

            {/* Low Balance Alert Threshold (USD) */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                5SIM Balance Warning Threshold ($ USD)
              </label>
              <input
                type="number"
                step="5"
                min="0"
                value={lowBalanceThresholdInput}
                onChange={(e) => setLowBalanceThresholdInput(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-hidden"
                required
              />
              <p className="text-[11px] text-slate-400">Triggers admin red banner when 5SIM balance drops below this.</p>
            </div>

            {/* Primary Display Currency */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">Default Admin Currency</label>
              <input
                type="text"
                value={displayCurrencyInput}
                onChange={(e) => setDisplayCurrencyInput(e.target.value.toUpperCase())}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-hidden"
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
      {/* TAB 3: CURRENCIES & EXCHANGE RATES */}
      {/* ========================================================================= */}
      {activeTab === 'currencies' && (
        <div className="space-y-6">
          {/* Header Card */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Globe className="w-4 h-4 text-sky-600" />
                Decoupled Multi-Currency Engine (USD Sovereign Base)
              </h3>
              <p className="text-xs text-slate-500 max-w-2xl">
                Base prices are denominated in USD. Below, configure exchange rates (1 USD = X). When customers change their preferred currency, all prices and balances recompute instantly with zero page reloads.
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setIsAddCurrencyOpen(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Currency</span>
              </button>

              <button
                type="button"
                onClick={loadCurrencies}
                disabled={loadingCurrencies}
                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
                title="Refresh Currencies"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingCurrencies ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Currencies Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Currency</th>
                    <th className="py-3 px-4">Symbol</th>
                    <th className="py-3 px-4">USD Exchange Rate (1 USD = ?)</th>
                    <th className="py-3 px-4">Example ($1.00 USD)</th>
                    <th className="py-3 px-4">Default</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                  {currencies.map((curr) => {
                    const isEditing = editingCurrencyCode === curr.code;
                    const activeRate = curr.rate_from_usd ?? curr.rate_from_5sim_base;
                    return (
                      <tr key={curr.code} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="w-7 h-7 rounded-lg bg-sky-100 text-sky-800 font-mono font-black text-xs flex items-center justify-center shrink-0">
                              {curr.symbol || curr.code.slice(0, 2)}
                            </span>
                            <div>
                              <div className="font-bold text-slate-900 font-mono flex items-center gap-1.5">
                                <span>{curr.code}</span>
                                {curr.is_default === 1 && (
                                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-0.5">
                                    <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-600" />
                                    Default
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 font-normal">{curr.name}</div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-4 font-mono font-bold text-slate-900 text-sm">
                          {curr.symbol}
                        </td>

                        <td className="py-3 px-4">
                          {isEditing ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] text-slate-400 font-mono">1 USD =</span>
                              <input
                                type="number"
                                step="0.0001"
                                min="0.000001"
                                value={editingCurrencyRate}
                                onChange={(e) => setEditingCurrencyRate(Number(e.target.value))}
                                className="w-28 px-2 py-1 bg-white border border-sky-400 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-hidden ring-2 ring-sky-500/20"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => handleUpdateCurrencyRate(curr.code)}
                                disabled={isSavingCurrency}
                                className="p-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition"
                                title="Save Rate"
                              >
                                <Save className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingCurrencyCode(null)}
                                className="p-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition"
                                title="Cancel"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-slate-500 font-mono text-xs">1 USD =</span>
                              <span className="font-mono font-black text-slate-900 text-xs">
                                {activeRate} {curr.code}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingCurrencyCode(curr.code);
                                  setEditingCurrencyRate(activeRate);
                                }}
                                className="p-1 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-md transition"
                                title="Edit Rate"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-4 font-mono font-semibold text-slate-800">
                          {curr.symbol} {(1.0 * activeRate).toFixed(2)}
                        </td>

                        <td className="py-3 px-4">
                          {curr.is_default === 1 ? (
                            <span className="text-xs font-bold text-amber-700 flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" /> Primary
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSetDefaultCurrency(curr.code)}
                              className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-800 transition"
                            >
                              Make Default
                            </button>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => handleToggleCurrencyActive(curr)}
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition ${
                              curr.is_active === 1
                                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            }`}
                          >
                            {curr.is_active === 1 ? 'Active' : 'Disabled'}
                          </button>
                        </td>

                        <td className="py-3 px-4 text-right">
                          {curr.is_default !== 1 && (
                            <button
                              type="button"
                              onClick={() => handleDeleteCurrency(curr.code)}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition"
                              title="Delete Currency"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Live Multi-Currency Conversion Playground */}
          <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-3xl p-6 shadow-md border border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-sky-400" />
                  <h4 className="text-sm font-black tracking-tight">USD Multi-Currency Live Conversion Playground</h4>
                </div>
                <p className="text-xs text-slate-300">
                  Simulate any USD base amount to preview real-time customer price rendering across all active currencies.
                </p>
              </div>

              <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-2xl border border-slate-700">
                <label className="text-xs font-bold text-slate-300">Test USD Amount ($):</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={currencyTestUsd}
                  onChange={(e) => setCurrencyTestUsd(Number(e.target.value))}
                  className="w-24 px-2 py-1 bg-slate-900 border border-slate-600 rounded-lg text-xs font-mono font-bold text-white text-center focus:outline-hidden focus:border-sky-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {currencies
                .filter((c) => c.is_active === 1)
                .map((curr) => {
                  const rate = curr.rate_from_usd ?? curr.rate_from_5sim_base;
                  const converted = (currencyTestUsd * rate).toFixed(2);
                  return (
                    <div
                      key={curr.code}
                      className="bg-white/5 border border-white/10 hover:border-sky-400/50 rounded-2xl p-3 space-y-1 transition backdrop-blur-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-black text-xs text-sky-300">{curr.code}</span>
                        <span className="text-[10px] text-slate-400">{curr.symbol}</span>
                      </div>
                      <div className="text-base font-black font-mono text-white tracking-tight">
                        {curr.symbol} {converted}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        ${currencyTestUsd} × {rate}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: LIVE 3-CURRENCY PREVIEW TOOL */}
      {/* ========================================================================= */}
      {activeTab === 'preview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Input Form */}
          <form onSubmit={handleRunPricePreview} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs space-y-4">
            <div>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Calculator className="w-4 h-4 text-sky-600" />
                Live Margin Resolution & 3-Currency Calculator
              </h3>
              <p className="text-xs text-slate-500">
                Input a wholesale 5SIM cost in USD and evaluate rule precedence, floor margins, rounding, and multi-currency rendering.
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">5SIM Wholesale Cost in USD ($)</label>
                <input
                  type="number"
                  step="0.01"
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
                  placeholder="e.g. england, usa, india"
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
                  placeholder="e.g. ee, vodafone, any"
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
              <span>{isPreviewing ? 'Resolving Margin...' : 'Evaluate Price & Preview Currencies'}</span>
            </button>
          </form>

          {/* Right: Calculated Price Result */}
          <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 text-white rounded-3xl p-6 shadow-md border border-slate-800 space-y-5 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="border-b border-white/10 pb-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-sky-400">Resolution Output</span>
                <h3 className="text-base font-black text-white mt-0.5">Price & Margin Breakdown</h3>
              </div>

              {previewResult ? (
                <div className="space-y-3 text-xs">
                  <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
                    <span className="text-slate-400">Winning Scope:</span>
                    <span className="px-2 py-0.5 rounded-full font-mono font-bold text-[10px] uppercase bg-sky-500/20 text-sky-300 border border-sky-400/30">
                      {previewResult.matchedScope}
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Applied Formula</span>
                    <span className="font-mono text-xs text-sky-200">{previewResult.formula}</span>
                  </div>

                  {/* 3 Currencies Preview Cards */}
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Live Customer Display Across Currencies
                    </span>
                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-center">
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">USD ($)</span>
                        <span className="font-mono font-black text-base text-emerald-400">
                          ${previewResult.sellPriceUsd !== undefined ? previewResult.sellPriceUsd.toFixed(2) : (previewResult.sellPrice || 0).toFixed(2)}
                        </span>
                      </div>

                      <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-center">
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">INR (₹)</span>
                        <span className="font-mono font-black text-base text-amber-300">
                          ₹{((previewResult.sellPriceUsd || previewResult.sellPrice || 0) * 86.50).toFixed(2)}
                        </span>
                      </div>

                      <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-center">
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">EUR (€)</span>
                        <span className="font-mono font-black text-base text-sky-300">
                          €{((previewResult.sellPriceUsd || previewResult.sellPrice || 0) * 0.95).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-emerald-300 uppercase block">Expected Net Margin ($ USD)</span>
                      <span className="font-mono font-black text-lg text-emerald-400">
                        +${(previewResult.profitUsd !== undefined ? previewResult.profitUsd : (previewResult.profit || 0)).toFixed(2)} USD
                      </span>
                    </div>
                    <span className="text-xs font-bold text-emerald-300 bg-emerald-500/20 px-2.5 py-1 rounded-xl">
                      {previewResult.costPrice > 0 ? `${(((previewResult.profit || 0) / previewResult.costPrice) * 100).toFixed(1)}% Markup` : '100%'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-slate-400">
                  Click "Evaluate Price & Preview Currencies" to resolve margin rules.
                </div>
              )}
            </div>

            <div className="text-[11px] text-slate-400 pt-2 border-t border-white/10">
              Customers never see wholesale provider cost or gross profit. All calculations locked at purchase time.
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: PROFIT ANALYTICS & AUDIT LEDGER */}
      {/* ========================================================================= */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          {profitReport?.summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-3xl bg-white border border-slate-200 shadow-2xs space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Customer Revenue</span>
                <div className="text-xl font-black font-mono text-slate-900">
                  {settings?.display_currency || 'USD'} {profitReport.summary.totalRevenue.toFixed(2)}
                </div>
              </div>

              <div className="p-4 rounded-3xl bg-white border border-slate-200 shadow-2xs space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">5SIM Telecom Cost</span>
                <div className="text-xl font-black font-mono text-rose-600">
                  {settings?.display_currency || 'USD'} {profitReport.summary.totalCost.toFixed(2)}
                </div>
              </div>

              <div className="p-4 rounded-3xl bg-emerald-50/70 border border-emerald-200 shadow-2xs space-y-1">
                <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">Net Profit Earned</span>
                <div className="text-xl font-black font-mono text-emerald-600">
                  +{settings?.display_currency || 'USD'} {profitReport.summary.netProfit.toFixed(2)}
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

          {/* Orders Audit Table with Manual Refund */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-black text-slate-900">Virtual Number Orders Ledger ({adminOrdersTotal})</h3>
                <p className="text-xs text-slate-500">Includes wholesale cost, retail price, user currency, and manual refund controls.</p>
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
                    <th className="py-2.5 px-3">Service</th>
                    <th className="py-2.5 px-3">Country</th>
                    <th className="py-2.5 px-3">Number</th>
                    <th className="py-2.5 px-3">Wholesale (USD)</th>
                    <th className="py-2.5 px-3">Sell Price</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                  {adminOrders.map((order) => {
                    const isRefunded = order.refunded;
                    return (
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
                          ${(order.provider_cost_usd || order.cost_price || 0).toFixed(2)}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-900 font-bold">
                          {order.user_currency || order.currency} {(order.final_price_user_currency || order.sell_price || 0).toFixed(2)}
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
                            {isRefunded && ' (Refunded)'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          {!isRefunded ? (
                            <button
                              type="button"
                              onClick={() => {
                                setRefundModalOrder(order);
                                setRefundReason(`Admin manual refund for order ${order.id}`);
                              }}
                              className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition"
                            >
                              Refund
                            </button>
                          ) : (
                            <span className="text-slate-400 text-[11px] font-mono">Settled</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: AUDIT LOG & UNDO ROLLBACK */}
      {/* ========================================================================= */}
      {activeTab === 'audit' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <History className="w-4 h-4 text-sky-600" />
                Administrative Margin Audit Trail & Instant Undo
              </h3>
              <p className="text-xs text-slate-500">
                Every margin adjustment, CSV import, and setting change is logged here. Click "Undo" to instantly revert changes.
              </p>
            </div>

            <button
              type="button"
              onClick={loadAuditLogs}
              disabled={loadingAuditLogs}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingAuditLogs ? 'animate-spin' : ''}`} />
              <span>Refresh Trail</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Admin</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Entity</th>
                  <th className="py-2.5 px-3">Change Summary</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Undo / Rollback</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                {auditLogs.map((log) => {
                  return (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="py-3 px-3 font-bold text-slate-900 font-mono text-[11px]">
                        {log.admin_user_id}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase font-mono ${
                            log.action.includes('CREATE')
                              ? 'bg-emerald-100 text-emerald-800'
                              : log.action.includes('DELETE')
                              ? 'bg-rose-100 text-rose-800'
                              : log.action.includes('UNDO')
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-sky-100 text-sky-800'
                          }`}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-600 capitalize">
                        {log.entity_type} {log.entity_id ? `(${log.entity_id.slice(0, 8)}...)` : ''}
                      </td>
                      <td className="py-3 px-3 max-w-xs truncate text-[11px] text-slate-600">
                        {log.after_state ? JSON.stringify(log.after_state) : log.before_state ? 'Deleted entry' : '---'}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            log.undone
                              ? 'bg-slate-100 text-slate-500 line-through'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {log.undone ? 'Undone' : 'Effective'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        {!log.undone && log.action !== 'UNDO' && (
                          <button
                            type="button"
                            onClick={() => handleUndoAudit(log.id)}
                            disabled={operatingAuditId === log.id}
                            className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold transition flex items-center gap-1 ml-auto"
                          >
                            <Undo2 className="w-3 h-3" />
                            <span>Undo</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 7: HIDDEN / DISABLED CATALOG ITEMS */}
      {/* ========================================================================= */}
      {activeTab === 'hidden' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs space-y-5">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <EyeOff className="w-4 h-4 text-rose-600" />
              Hidden / Disabled Catalog Items
            </h3>
            <p className="text-xs text-slate-500">
              Countries or services added here will be immediately hidden from the customer virtual number catalog.
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
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto">
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
                <label className="text-xs font-bold text-slate-700">Precedence Scope Level</label>
                <select
                  value={newScope}
                  onChange={(e) => setNewScope(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-hidden"
                >
                  <option value="global">6. Global Default (Base fallback)</option>
                  <option value="provider">5. Provider Level (5SIM Default)</option>
                  <option value="product">4. Service / Product Specific</option>
                  <option value="country">3. Country Specific</option>
                  <option value="country_product">2. Country + Product Specific</option>
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
                    placeholder="e.g. ee, vodafone, virtual59"
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
                    Fixed ($ USD)
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
                    Both (% + USD)
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
                    <label className="text-xs font-bold text-slate-700">Fixed Amount ($ USD)</label>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      value={newFixedValue}
                      onChange={(e) => setNewFixedValue(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:outline-hidden"
                      required
                    />
                  </div>
                )}
              </div>

              {/* Min and Max Price Floor & Ceiling */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Min Price Floor ($ USD)</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    value={newMinPrice !== undefined ? newMinPrice : ''}
                    onChange={(e) => setNewMinPrice(e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="Optional min"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:bg-white focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Max Price Cap ($ USD)</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    value={newMaxPrice !== undefined ? newMaxPrice : ''}
                    onChange={(e) => setNewMaxPrice(e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="Optional max"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:bg-white focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Custom Fixed Price Override */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Fixed Sell Price Override ($ USD)</label>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  value={newCustomOverride !== undefined ? newCustomOverride : ''}
                  onChange={(e) => setNewCustomOverride(e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="Optional flat price override (ignores cost & margin)"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:bg-white focus:outline-hidden"
                />
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Rule Description / Notes</label>
                <input
                  type="text"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="e.g. VIP pricing for high-demand UK WhatsApp numbers"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden"
                />
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

      {/* MODAL: BULK PERCENTAGE ADJUSTMENT */}
      {isBulkAdjustModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900">Adjust Percentage Markup</h3>
              <button
                type="button"
                onClick={() => setIsBulkAdjustModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ×
              </button>
            </div>
            <p className="text-xs text-slate-600">
              Apply a percentage increase or decrease across all {selectedRuleIds.size} selected rules.
            </p>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Percentage Adjustment (+% or -%)</label>
              <input
                type="number"
                step="1"
                value={bulkPercentDelta}
                onChange={(e) => setBulkPercentDelta(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-hidden"
              />
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsBulkAdjustModalOpen(false)}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkAdjustPercent}
                disabled={isProcessingBulk}
                className="flex-1 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold shadow-xs"
              >
                Apply Adjustment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CSV IMPORT */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-sky-600" />
                <h3 className="text-sm font-black text-slate-900">Import Margin Rules via CSV</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleImportCsv} className="space-y-3">
              <p className="text-xs text-slate-600">
                Paste CSV content with columns: <code className="bg-slate-100 p-0.5 rounded text-[11px]">scope,country,product,operator,type,percent_value,fixed_value,min_price,max_price,enabled</code>
              </p>

              <textarea
                rows={8}
                value={csvImportText}
                onChange={(e) => setCsvImportText(e.target.value)}
                placeholder="scope,country,product,operator,type,percent_value,fixed_value,min_price,max_price,enabled&#10;country_product,england,whatsapp,,percent,30,0,,,1"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono text-slate-900 focus:bg-white focus:outline-hidden"
                required
              />

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isImportingCsv}
                  className="flex-1 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold shadow-xs disabled:opacity-50"
                >
                  {isImportingCsv ? 'Importing...' : 'Parse & Import Rules'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADMIN MANUAL REFUND */}
      {refundModalOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900">Admin Manual Refund</h3>
              <button
                type="button"
                onClick={() => setRefundModalOrder(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ×
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Order ID:</span>
                <span className="font-mono font-bold text-slate-800">{refundModalOrder.id.slice(0, 12)}...</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Number:</span>
                <span className="font-mono font-bold text-slate-900">{refundModalOrder.phone || '---'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Refund Amount:</span>
                <span className="font-mono font-black text-rose-600">
                  {refundModalOrder.user_currency || refundModalOrder.currency} {(refundModalOrder.final_price_user_currency || refundModalOrder.sell_price).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Reason for Admin Refund</label>
              <input
                type="text"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden"
                required
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRefundModalOrder(null)}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteAdminRefund}
                disabled={isRefunding}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-xs disabled:opacity-50"
              >
                {isRefunding ? 'Refunding...' : 'Confirm Refund'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Currency Modal */}
      {isAddCurrencyOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-emerald-600" />
                  Add New Supported Currency
                </h3>
                <p className="text-xs text-slate-500">Configure a new currency with exchange multiplier from sovereign USD.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddCurrencyOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCurrency} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Currency Code</label>
                  <input
                    type="text"
                    value={newCurrency.code}
                    onChange={(e) => setNewCurrency({ ...newCurrency, code: e.target.value.toUpperCase() })}
                    placeholder="e.g. AUD, JPY, SGD"
                    maxLength={5}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-hidden"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Symbol</label>
                  <input
                    type="text"
                    value={newCurrency.symbol}
                    onChange={(e) => setNewCurrency({ ...newCurrency, symbol: e.target.value })}
                    placeholder="e.g. A$, ¥, S$"
                    maxLength={5}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-hidden"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Full Currency Name</label>
                <input
                  type="text"
                  value={newCurrency.name}
                  onChange={(e) => setNewCurrency({ ...newCurrency, name: e.target.value })}
                  placeholder="e.g. Australian Dollar, Japanese Yen"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">USD Exchange Rate (1 USD = ?)</label>
                <input
                  type="number"
                  step="0.0001"
                  min="0.000001"
                  value={newCurrency.rate_from_usd}
                  onChange={(e) => setNewCurrency({ ...newCurrency, rate_from_usd: Number(e.target.value), rate_from_5sim_base: Number(e.target.value) })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-hidden"
                  required
                />
                <p className="text-[11px] text-slate-400">
                  Multiplier relative to 1 USD. (e.g. 1 USD = 86.50 INR, 0.95 EUR, 1.55 AUD).
                </p>
              </div>

              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newCurrency.is_default}
                    onChange={(e) => setNewCurrency({ ...newCurrency, is_default: e.target.checked })}
                    className="rounded text-sky-600 focus:ring-sky-500"
                  />
                  <span>Set as Default Currency</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newCurrency.is_active}
                    onChange={(e) => setNewCurrency({ ...newCurrency, is_active: e.target.checked })}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Active for Customers</span>
                </label>
              </div>

              <div className="flex items-center gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddCurrencyOpen(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingCurrency}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-50"
                >
                  {isSavingCurrency ? 'Adding...' : 'Add Currency'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
