import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api';
import { useWhatsApp } from '../../context/WhatsAppContext';
import {
  NumberCountry,
  NumberProduct,
  NumberOperatorRate,
  NumberOrder,
  UserWallet,
  CurrencyRecord
} from '../../types';
import {
  Phone,
  Radio,
  Search,
  Sparkles,
  Zap,
  Clock,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RotateCcw,
  CheckCheck,
  ShieldCheck,
  Wallet,
  Coins,
  Plus,
  RefreshCw,
  ExternalLink,
  Ban,
  Smartphone,
  ChevronRight,
  Layers,
  Star,
  Info,
  DollarSign,
  ArrowRight,
  Globe,
  ChevronDown,
  X,
  Filter
} from 'lucide-react';
import {
  getServiceMetadata,
  resolveCountryIso,
  getCountryFlag,
  formatDialCode,
  resolveCountryDisplayName,
  POPULAR_SERVICES_LIST,
  POPULAR_COUNTRIES_LIST,
  SERVICE_CATEGORIES
} from './virtualNumberAssets';

interface VirtualNumbersViewProps {
  onNavigateToWallet?: () => void;
}

export const VirtualNumbersView: React.FC<VirtualNumbersViewProps> = ({ onNavigateToWallet }) => {
  const { socket } = useWhatsApp();

  // Wallet & User state
  const [wallet, setWallet] = useState<UserWallet | null>(null);
  const [loadingWallet, setLoadingWallet] = useState(true);

  // Catalog selectors
  const [countries, setCountries] = useState<NumberCountry[]>([]);
  const [products, setProducts] = useState<NumberProduct[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string>('england');
  const [selectedProduct, setSelectedProduct] = useState<string>('whatsapp');
  const [selectedOperator, setSelectedOperator] = useState<string>('any');

  // Search & Filter & Modals
  const [countrySearch, setCountrySearch] = useState<string>('');
  const [productSearch, setProductSearch] = useState<string>('');
  const [isServiceModalOpen, setIsServiceModalOpen] = useState<boolean>(false);
  const [isCountryModalOpen, setIsCountryModalOpen] = useState<boolean>(false);
  const [serviceCategoryFilter, setServiceCategoryFilter] = useState<string>('all');
  const [countryRegionFilter, setCountryRegionFilter] = useState<string>('all');

  // Rates & Stock state
  const [operatorRates, setOperatorRates] = useState<NumberOperatorRate[]>([]);
  const [bestOperator, setBestOperator] = useState<NumberOperatorRate | null>(null);
  const [currency, setCurrency] = useState<string>('INR');
  const [currencies, setCurrencies] = useState<CurrencyRecord[]>([]);
  const [isCurrencySwitching, setIsCurrencySwitching] = useState<boolean>(false);
  const [isCurrencyDropdownOpen, setIsCurrencyDropdownOpen] = useState<boolean>(false);
  const [loadingRates, setLoadingRates] = useState<boolean>(false);

  // Orders
  const [activeOrders, setActiveOrders] = useState<NumberOrder[]>([]);
  const [orderHistory, setOrderHistory] = useState<NumberOrder[]>([]);
  const [historyTotal, setHistoryTotal] = useState<number>(0);
  const [historyPage, setHistoryPage] = useState<number>(0);
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>('all');
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  // Modal & Actions
  const [isConfirmBuyOpen, setIsConfirmBuyOpen] = useState<boolean>(false);
  const [isPurchasing, setIsPurchasing] = useState<boolean>(false);
  const [operatingOrderId, setOperatingOrderId] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Ticker for smooth live countdown display
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    showToast(`Copied ${label} to clipboard!`, 'success');
    setTimeout(() => setCopiedText(null), 2500);
  };

  // Synthesized Web Audio alert chime when OTP code arrives
  const playSmsChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.55);
    } catch {}
  };

  // Initial load
  useEffect(() => {
    loadWallet();
    loadCurrencies();
    loadCountries();
    loadProducts();
    loadUserOrders();
  }, []);

  // When selected country or product changes, reload prices
  useEffect(() => {
    if (selectedCountry && selectedProduct) {
      loadPrices(selectedCountry, selectedProduct, currency);
    }
  }, [selectedCountry, selectedProduct]);

  // Socket.IO real-time event listeners
  useEffect(() => {
    if (!socket) return;

    const handleOrderCreated = (data: any) => {
      loadUserOrders();
      loadWallet();
    };

    const handleSmsReceived = (data: any) => {
      playSmsChime();
      showToast(`📩 Verification OTP [${data.code}] received for ${data.phone || 'number'}!`, 'success');
      loadUserOrders();
    };

    const handleOrderUpdated = () => {
      loadUserOrders();
      loadWallet();
    };

    socket.on('number:order_created', handleOrderCreated);
    socket.on('number:sms_received', handleSmsReceived);
    socket.on('number:order_updated', handleOrderUpdated);

    return () => {
      socket.off('number:order_created', handleOrderCreated);
      socket.off('number:sms_received', handleSmsReceived);
      socket.off('number:order_updated', handleOrderUpdated);
    };
  }, [socket]);

  // --- Data Fetching ---
  const loadCurrencies = async () => {
    try {
      const res = await api.currency.list();
      if (res.success && res.currencies) {
        setCurrencies(res.currencies);
      }
    } catch (err) {
      console.warn('Failed to load active currencies list:', err);
    }
  };

  const loadWallet = async () => {
    try {
      setLoadingWallet(true);
      const w = await api.wallet.get();
      if (w) {
        setWallet(w);
        if (w.currency) {
          setCurrency(w.currency);
        }
      }
    } catch (err: any) {
      console.warn('Failed to load wallet:', err);
    } finally {
      setLoadingWallet(false);
    }
  };

  const handleSwitchCurrency = async (newCode: string) => {
    if (newCode === currency || isCurrencySwitching) return;
    setIsCurrencySwitching(true);
    try {
      const res = await api.currency.switch(newCode);
      if (res.success) {
        showToast(`Switched currency to ${res.newCurrency}! Converted balance: ${res.newCurrency} ${res.newBalance.toFixed(2)}`, 'success');
        setCurrency(res.newCurrency);
        await loadWallet();
        if (selectedCountry && selectedProduct) {
          await loadPrices(selectedCountry, selectedProduct, res.newCurrency);
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to switch currency', 'error');
    } finally {
      setIsCurrencySwitching(false);
      setIsCurrencyDropdownOpen(false);
    }
  };

  const loadCountries = async () => {
    try {
      const res = await api.numbers.getCountries();
      if (res.success && res.countries) {
        setCountries(res.countries);
      }
    } catch (err: any) {
      showToast(`Failed to load countries: ${err.message}`, 'error');
    }
  };

  const loadProducts = async () => {
    try {
      const res = await api.numbers.getProducts();
      if (res.success && res.products) {
        setProducts(res.products);
      }
    } catch (err: any) {
      showToast(`Failed to load services: ${err.message}`, 'error');
    }
  };

  const loadPrices = async (c: string, p: string, currOverride?: string) => {
    try {
      setLoadingRates(true);
      const targetCurr = currOverride || currency;
      const res = await api.numbers.getPrices(c, p, targetCurr);
      if (res.success) {
        setOperatorRates(res.operators || []);
        setBestOperator(res.bestOperator);
        setCurrency(res.currency || targetCurr || 'INR');
        setSelectedOperator('any');
      }
    } catch (err: any) {
      setOperatorRates([]);
      setBestOperator(null);
    } finally {
      setLoadingRates(false);
    }
  };

  const loadUserOrders = async () => {
    try {
      setLoadingHistory(true);
      const res = await api.numbers.getUserOrders({
        limit: 50,
        offset: historyPage * 50,
        status: historyStatusFilter === 'all' ? undefined : historyStatusFilter
      });
      if (res.success) {
        const all = res.orders || [];
        setOrderHistory(all);
        setHistoryTotal(res.total || 0);

        // Separate active orders (PENDING or RECEIVED)
        const active = all.filter((o) => o.status === 'PENDING' || o.status === 'RECEIVED' || o.status === 'PENDING_PURCHASE');
        setActiveOrders(active);
      }
    } catch (err: any) {
      console.warn('Failed to load orders:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // --- Purchase Execution ---
  const handleExecuteBuy = async () => {
    if (!selectedCountry || !selectedProduct) return;
    setIsPurchasing(true);
    try {
      const res = await api.numbers.buyNumber({
        country: selectedCountry,
        product: selectedProduct,
        operator: selectedOperator
      });

      if (res.success) {
        showToast(res.message || 'Number purchased successfully!', 'success');
        setIsConfirmBuyOpen(false);
        await Promise.all([loadWallet(), loadUserOrders()]);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to complete number purchase.', 'error');
    } finally {
      setIsPurchasing(false);
    }
  };

  // --- Order Lifecycle Actions ---
  const handleCancelOrder = async (orderId: string) => {
    if (!confirm('Are you sure you want to cancel this virtual number? Your wallet balance will be refunded immediately.')) return;
    setOperatingOrderId(orderId);
    try {
      const res = await api.numbers.cancelOrder(orderId);
      if (res.success) {
        showToast(res.message, 'success');
        await Promise.all([loadWallet(), loadUserOrders()]);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to cancel order.', 'error');
    } finally {
      setOperatingOrderId(null);
    }
  };

  const handleFinishOrder = async (orderId: string) => {
    setOperatingOrderId(orderId);
    try {
      const res = await api.numbers.finishOrder(orderId);
      if (res.success) {
        showToast(res.message, 'success');
        await loadUserOrders();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to finish order.', 'error');
    } finally {
      setOperatingOrderId(null);
    }
  };

  const handleBanOrder = async (orderId: string) => {
    if (!confirm('Report this number as already registered or blocked? You will receive a full wallet refund.')) return;
    setOperatingOrderId(orderId);
    try {
      const res = await api.numbers.banOrder(orderId);
      if (res.success) {
        showToast(res.message, 'success');
        await Promise.all([loadWallet(), loadUserOrders()]);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to report number.', 'error');
    } finally {
      setOperatingOrderId(null);
    }
  };

  // Helper for countdown progress & auto-cancel indicator
  const calculateCountdown = (order: NumberOrder) => {
    if (order.status === 'FINISHED' || order.status === 'CANCELED' || order.status === 'BANNED' || order.status === 'TIMEOUT') {
      return { text: order.status, percent: 0, isExpired: true };
    }

    const expiryTimestamp = order.expires_at ? new Date(order.expires_at).getTime() : new Date(order.created_at).getTime() + 15 * 60 * 1000;
    const remainingMs = expiryTimestamp - Date.now();

    if (remainingMs <= 0) {
      return { text: 'Expired', percent: 0, isExpired: true };
    }

    const totalMs = 15 * 60 * 1000;
    const percent = Math.max(0, Math.min(100, (remainingMs / totalMs) * 100));
    const totalSeconds = Math.floor(remainingMs / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const text = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

    return { text, percent, isExpired: false, totalSeconds };
  };

  // Currently active price determination
  const selectedOperatorObj = selectedOperator === 'any'
    ? bestOperator
    : operatorRates.find((o) => o.operator === selectedOperator);
  const currentSellPrice = selectedOperatorObj?.sell_price || 0;
  const isBalanceSufficient = (wallet?.balance || 0) >= currentSellPrice && currentSellPrice > 0;

  // Active selection metadata
  const activeCurrencyRecord = currencies.find((c) => c.code.toUpperCase() === (currency || '').toUpperCase());
  const activeCurrencySymbol = activeCurrencyRecord?.symbol || (currency === 'INR' ? '₹' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : currency);
  const activeServiceMeta = getServiceMetadata(selectedProduct);
  const activeCountryObj = countries.find((c) => c.slug === selectedCountry);
  const activeCountryIso = resolveCountryIso(selectedCountry, activeCountryObj?.iso);
  const activeCountryFlag = getCountryFlag(activeCountryIso);
  const activeCountryName = resolveCountryDisplayName(selectedCountry, activeCountryObj?.name);
  const activeCountryDialCode = formatDialCode(activeCountryObj?.prefix);

  // Filter products by search and category
  const filteredProducts = products.filter((p) => {
    const meta = getServiceMetadata(p.slug, p.name);
    if (serviceCategoryFilter !== 'all') {
      if (serviceCategoryFilter === 'popular') {
        if (!POPULAR_SERVICES_LIST.includes(p.slug)) return false;
      } else if (meta.category !== serviceCategoryFilter) {
        return false;
      }
    }
    if (productSearch) {
      const q = productSearch.toLowerCase().trim();
      return (
        meta.displayName.toLowerCase().includes(q) ||
        meta.slug.toLowerCase().includes(q) ||
        (p.name && p.name.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Filter countries by search and region
  const filteredCountries = countries.filter((c) => {
    const iso = resolveCountryIso(c.slug, c.iso);
    const name = resolveCountryDisplayName(c.slug, c.name);
    const dial = formatDialCode(c.prefix);

    if (countryRegionFilter === 'popular') {
      const isPop = POPULAR_COUNTRIES_LIST.some((pop) => pop.slug === c.slug);
      if (!isPop) return false;
    }

    if (countrySearch) {
      const q = countrySearch.toLowerCase().trim();
      const dialDigits = q.replace(/[^\d]/g, '');
      return (
        name.toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q) ||
        iso.includes(q) ||
        (dial && dial.includes(q)) ||
        (dialDigits && c.prefix.includes(dialDigits))
      );
    }
    return true;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Notification */}
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

      {/* Header Strip: Wallet Balance & Telecom Status */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-950 text-white rounded-3xl p-6 shadow-md border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              5SIM Telecom Mesh Active
            </span>
            <span className="text-xs text-slate-400 font-mono">150+ Countries • Instant OTP Delivery</span>
          </div>

          <h1 className="text-xl font-black tracking-tight flex items-center gap-2.5">
            <Radio className="w-6 h-6 text-sky-400" />
            Virtual Number Acquisition Hub
          </h1>

          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            Acquire temporary virtual lines for SMS activations. Live operator rates, 15-minute verification countdowns, and automatic 100% wallet refunds if no SMS code arrives.
          </p>
        </div>

        {/* User Currency Selector & Wallet Balance Widget */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Currency Switcher Dropdown */}
          <div className="relative">
            <button
              type="button"
              disabled={isCurrencySwitching}
              onClick={() => setIsCurrencyDropdownOpen(!isCurrencyDropdownOpen)}
              className="px-3 py-2.5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 text-white flex items-center gap-2 text-xs font-bold transition shadow-xs"
              title="Click to switch your currency"
            >
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-mono text-amber-300 font-black">{activeCurrencySymbol}</span>
              <span>{currency}</span>
              <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isCurrencyDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Currency Dropdown Menu */}
            {isCurrencyDropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-slate-900 border border-slate-800 rounded-2xl p-2 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100 max-h-64 overflow-y-auto scrollbar-thin">
                <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 mb-1">
                  Choose Currency
                </div>
                {currencies.map((c) => {
                  const isCurrent = c.code === currency;
                  return (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => handleSwitchCurrency(c.code)}
                      className={`w-full px-3 py-2 rounded-xl text-xs font-bold text-left transition flex items-center justify-between ${
                        isCurrent
                          ? 'bg-sky-600 text-white'
                          : 'text-slate-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-5 text-center font-mono font-bold text-amber-300">{c.symbol}</span>
                        <div>
                          <div className="text-xs font-bold">{c.code}</div>
                          <div className="text-[10px] text-slate-400 font-normal">{c.name}</div>
                        </div>
                      </div>
                      {isCurrent && <Check className="w-3.5 h-3.5 shrink-0 stroke-[3]" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* User Wallet Balance Widget */}
          <div className="px-4 py-2 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3.5">
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Your Balance</div>
              <div className="text-base font-black font-mono text-emerald-400">
                {wallet ? `${activeCurrencySymbol} ${wallet.balance.toFixed(2)}` : 'Loading...'}
              </div>
            </div>
            {onNavigateToWallet && (
              <button
                type="button"
                onClick={onNavigateToWallet}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Funds</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              loadWallet();
              if (selectedCountry && selectedProduct) loadPrices(selectedCountry, selectedProduct);
              loadUserOrders();
            }}
            className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition border border-white/10"
            title="Refresh balance and rates"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: INTERACTIVE NUMBER SELECTOR & BUY CARD */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Service & Country Selectors (2 Cols) */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs space-y-5">
          <div>
            <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-600" />
              1. Choose Service & Country
            </h2>
            <p className="text-xs text-slate-500">
              Select the service you want to verify and the jurisdiction of the mobile line.
            </p>
          </div>

          {/* Visual Showcase Hub: Service & Country */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1. Target Service Visual Card */}
            <div className="bg-gradient-to-br from-slate-50 to-indigo-50/30 border border-slate-200/90 rounded-2xl p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-sky-700 bg-sky-100/80 px-2 py-0.5 rounded-full border border-sky-200/60 flex items-center gap-1">
                  <span>🎯</span>
                  <span>Target Service</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setProductSearch('');
                    setIsServiceModalOpen(true);
                  }}
                  className="text-xs font-bold text-sky-700 hover:text-sky-900 flex items-center gap-1 hover:underline transition"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Browse All ({products.length})</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Selected Service Hero */}
              <div
                onClick={() => {
                  setProductSearch('');
                  setIsServiceModalOpen(true);
                }}
                className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3 cursor-pointer hover:border-sky-300 hover:shadow-xs transition group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${activeServiceMeta.gradient} text-white flex items-center justify-center text-lg font-black shadow-xs shrink-0 group-hover:scale-105 transition`}>
                    {activeServiceMeta.iconChar}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="text-sm font-black text-slate-900 truncate">
                        {activeServiceMeta.displayName}
                      </h3>
                      {activeServiceMeta.badge && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 shrink-0">
                          {activeServiceMeta.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 font-mono truncate">
                      slug: {activeServiceMeta.slug}
                    </p>
                  </div>
                </div>

                <span className="px-2.5 py-1 bg-slate-100 group-hover:bg-sky-50 text-slate-600 group-hover:text-sky-700 text-xs font-bold rounded-lg border border-slate-200 shrink-0 flex items-center gap-1 transition">
                  <span>Change</span>
                  <ChevronRight className="w-3 h-3" />
                </span>
              </div>

              {/* Quick Popular Services Row */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Quick Select
                </span>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                  {POPULAR_SERVICES_LIST.map((slug) => {
                    const meta = getServiceMetadata(slug);
                    const isSelected = selectedProduct === slug;
                    return (
                      <button
                        key={slug}
                        type="button"
                        onClick={() => setSelectedProduct(slug)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition shrink-0 flex items-center gap-1.5 border ${
                          isSelected
                            ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                            : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        <span className={`w-4 h-4 rounded bg-gradient-to-br ${meta.gradient} text-white flex items-center justify-center text-[9px] font-bold`}>
                          {meta.iconChar}
                        </span>
                        <span className="truncate max-w-[80px]">{meta.displayName.split(' ')[0]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 2. Target Country Visual Card */}
            <div className="bg-gradient-to-br from-slate-50 to-emerald-50/30 border border-slate-200/90 rounded-2xl p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-full border border-emerald-200/60 flex items-center gap-1">
                  <span>🌍</span>
                  <span>Jurisdiction / Country</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setCountrySearch('');
                    setIsCountryModalOpen(true);
                  }}
                  className="text-xs font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 hover:underline transition"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Browse All ({countries.length})</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Selected Country Hero */}
              <div
                onClick={() => {
                  setCountrySearch('');
                  setIsCountryModalOpen(true);
                }}
                className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3 cursor-pointer hover:border-emerald-300 hover:shadow-xs transition group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-2xl shadow-xs shrink-0 group-hover:scale-105 transition">
                    {activeCountryFlag}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="text-sm font-black text-slate-900 truncate">
                        {activeCountryName}
                      </h3>
                      {activeCountryDialCode && (
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 border border-slate-200 shrink-0">
                          {activeCountryDialCode}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 font-mono truncate">
                      slug: {selectedCountry}
                    </p>
                  </div>
                </div>

                <span className="px-2.5 py-1 bg-slate-100 group-hover:bg-emerald-50 text-slate-600 group-hover:text-emerald-800 text-xs font-bold rounded-lg border border-slate-200 shrink-0 flex items-center gap-1 transition">
                  <span>Change</span>
                  <ChevronRight className="w-3 h-3" />
                </span>
              </div>

              {/* Quick Popular Countries Row */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Quick Select
                </span>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                  {POPULAR_COUNTRIES_LIST.map((c) => {
                    const isSelected = selectedCountry === c.slug;
                    return (
                      <button
                        key={c.slug}
                        type="button"
                        onClick={() => setSelectedCountry(c.slug)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition shrink-0 flex items-center gap-1 border ${
                          isSelected
                            ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                            : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        <span>{c.flag}</span>
                        <span>{c.name.split(' ')[0]}</span>
                        <span className="text-[9px] opacity-70 font-mono">{c.code}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Operator Selection Grid */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 block">
                2. Select Operator / Network ({operatorRates.length} available)
              </label>
              {loadingRates && (
                <span className="text-[11px] font-bold text-sky-600 flex items-center gap-1">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Updating rates...
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto scrollbar-thin pr-1">
              {/* Option: Any (Cheapest & Best Auto-Select) */}
              <button
                type="button"
                onClick={() => setSelectedOperator('any')}
                className={`p-3 rounded-2xl border text-left transition relative flex flex-col justify-between ${
                  selectedOperator === 'any'
                    ? 'bg-sky-50/70 border-sky-500 ring-2 ring-sky-500/20'
                    : 'bg-slate-50/60 hover:bg-slate-100 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-black text-xs text-slate-900 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    Any (Auto-Best)
                  </span>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-100 text-emerald-800">
                    Recommended
                  </span>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-[11px] text-slate-500">Highest rate</span>
                  <span className="text-xs font-mono font-black text-sky-700">
                    {activeCurrencySymbol} {bestOperator?.sell_price.toFixed(2) || '---'}
                  </span>
                </div>
              </button>

              {/* Individual Operators */}
              {operatorRates.map((op) => (
                <button
                  key={op.operator}
                  type="button"
                  disabled={!op.is_available}
                  onClick={() => setSelectedOperator(op.operator)}
                  className={`p-3 rounded-2xl border text-left transition relative flex flex-col justify-between ${
                    selectedOperator === op.operator
                      ? 'bg-sky-50/70 border-sky-500 ring-2 ring-sky-500/20'
                      : !op.is_available
                      ? 'bg-slate-100/60 border-slate-200 opacity-60 cursor-not-allowed'
                      : 'bg-slate-50/60 hover:bg-slate-100 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-900 truncate">{op.operator}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                        op.is_available ? 'bg-slate-200 text-slate-700' : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {op.is_available ? `${op.count} pcs` : 'Out of stock'}
                    </span>
                  </div>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-[10px] text-slate-400 font-semibold">{op.rate}% success</span>
                    <span className="text-xs font-mono font-black text-slate-900">
                      {activeCurrencySymbol} {op.sell_price.toFixed(2)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Checkout Summary & Buy Button */}
        <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 text-white rounded-3xl p-6 shadow-md border border-slate-800 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="border-b border-white/10 pb-3">
              <span className="text-[10px] font-black uppercase tracking-wider text-sky-400">Order Summary</span>
              <h3 className="text-base font-black text-white mt-0.5">Virtual Line Checkout</h3>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-white/5">
                <span className="text-slate-400 font-medium">Platform:</span>
                <span className="font-bold text-white capitalize">{selectedProduct}</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-white/5">
                <span className="text-slate-400 font-medium">Country:</span>
                <span className="font-bold text-white capitalize">{selectedCountry}</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-white/5">
                <span className="text-slate-400 font-medium">Selected Carrier:</span>
                <span className="font-mono font-bold text-sky-300 capitalize">{selectedOperator}</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-white/5">
                <span className="text-slate-400 font-medium">OTP Duration:</span>
                <span className="font-bold text-slate-200">15 Minutes (1 OTP)</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-white/5">
                <span className="text-slate-400 font-medium">Refund Policy:</span>
                <span className="font-bold text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  100% Auto-Refund if no SMS
                </span>
              </div>
            </div>

            {/* Price Highlight */}
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Price</span>
                <div className="text-xl font-black font-mono text-emerald-400">
                  {activeCurrencySymbol} {currentSellPrice.toFixed(2)}
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Your Balance</span>
                <div className={`text-xs font-mono font-bold ${isBalanceSufficient ? 'text-slate-200' : 'text-rose-400'}`}>
                  {wallet ? `${activeCurrencySymbol} ${wallet.balance.toFixed(2)}` : '---'}
                </div>
              </div>
            </div>
          </div>

          {/* Buy Button */}
          <div className="space-y-2 pt-2">
            {isBalanceSufficient ? (
              <button
                type="button"
                onClick={() => setIsConfirmBuyOpen(true)}
                disabled={isPurchasing || currentSellPrice <= 0}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-2xl text-xs font-black transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 cursor-pointer"
              >
                <Zap className="w-4 h-4 fill-white" />
                <span>Buy Number — {currency === 'INR' ? '₹' : currency} {currentSellPrice.toFixed(2)}</span>
              </button>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled
                  className="w-full py-3 bg-slate-800 text-slate-400 rounded-2xl text-xs font-bold cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <AlertCircle className="w-4 h-4" />
                  <span>Insufficient Balance</span>
                </button>
                {onNavigateToWallet && (
                  <button
                    type="button"
                    onClick={onNavigateToWallet}
                    className="w-full py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Funds to Wallet</span>
                  </button>
                )}
              </div>
            )}
            <p className="text-[10px] text-slate-400 text-center leading-relaxed">
              Deducted from internal wallet. SMS waiting starts immediately after purchase.
            </p>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2: LIVE ACTIVE ORDERS MONITOR */}
      {/* ========================================================================= */}
      {activeOrders.length > 0 && (
        <div className="bg-white border-2 border-sky-300 rounded-3xl p-6 shadow-md space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                <h3 className="text-base font-black text-slate-900">
                  Live Virtual Number Monitor ({activeOrders.length} active)
                </h3>
              </div>
              <p className="text-xs text-slate-500">
                Listening for incoming SMS verification codes in real time. Full audio chimes on receipt.
              </p>
            </div>

            <button
              type="button"
              onClick={loadUserOrders}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Orders</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeOrders.map((order) => {
              const countdown = calculateCountdown(order);
              const isReceived = order.status === 'RECEIVED' || !!order.otp_code;

              return (
                <div
                  key={order.id}
                  className={`p-5 rounded-3xl border transition space-y-4 ${
                    isReceived
                      ? 'bg-emerald-50/50 border-emerald-300 shadow-sm'
                      : 'bg-slate-50/70 border-slate-200'
                  }`}
                >
                  {/* Top Bar: Service, Country, Status Badge */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-xl text-xs font-black uppercase tracking-wider bg-slate-900 text-white">
                        {order.product}
                      </span>
                      <span className="text-xs font-bold text-slate-600 capitalize">
                        {order.country} • {order.operator}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          isReceived
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1'
                        }`}
                      >
                        {!isReceived && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />}
                        {order.status}
                      </span>
                    </div>
                  </div>

                  {/* Phone Number Display */}
                  <div className="p-3.5 rounded-2xl bg-white border border-slate-200 flex items-center justify-between">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Virtual Number</span>
                      <div className="text-lg font-black font-mono text-slate-900 tracking-tight">
                        {order.phone || 'Provisioning virtual line...'}
                      </div>
                    </div>
                    {order.phone && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(order.phone!, 'Phone Number')}
                        className="px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-xl text-xs font-bold transition flex items-center gap-1 border border-sky-200"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </button>
                    )}
                  </div>

                  {/* Countdown Timer Bar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-medium flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        Time Remaining:
                      </span>
                      <span className="font-mono font-bold text-slate-800">{countdown.text}</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-sky-600 transition-all duration-1000"
                        style={{ width: `${countdown.percent}%` }}
                      />
                    </div>
                  </div>

                  {/* OTP Code Box */}
                  <div className="p-4 rounded-2xl border text-center space-y-2">
                    {order.otp_code ? (
                      <div className="space-y-2">
                        <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">
                          SMS Verification Code Received
                        </span>
                        <div className="text-3xl font-black font-mono text-emerald-600 tracking-widest bg-emerald-100/60 py-2 rounded-xl border border-emerald-300">
                          {order.otp_code}
                        </div>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(order.otp_code!, 'OTP Code')}
                          className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy OTP Code</span>
                        </button>
                      </div>
                    ) : (
                      <div className="py-3 flex flex-col items-center justify-center space-y-2 text-slate-400">
                        <RefreshCw className="w-5 h-5 animate-spin text-sky-500" />
                        <span className="text-xs font-bold text-slate-600">Waiting for incoming SMS...</span>
                        <span className="text-[11px] text-slate-400">Send the verification code to {order.phone || 'this number'}</span>
                      </div>
                    )}

                    {/* Raw SMS Text Preview */}
                    {order.sms_text && (
                      <div className="pt-2 text-left text-[11px] font-mono text-slate-600 bg-slate-100/80 p-2.5 rounded-xl border border-slate-200 break-words">
                        {order.sms_text}
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 pt-1">
                    {isReceived ? (
                      <button
                        type="button"
                        onClick={() => handleFinishOrder(order.id)}
                        disabled={operatingOrderId === order.id}
                        className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 shadow-xs"
                      >
                        <CheckCheck className="w-4 h-4" />
                        <span>Finish & Close Order</span>
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleCancelOrder(order.id)}
                          disabled={operatingOrderId === order.id}
                          className="flex-1 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Cancel & Full Refund</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleBanOrder(order.id)}
                          disabled={operatingOrderId === order.id}
                          className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1"
                          title="Report number as already registered or banned on target service"
                        >
                          <Ban className="w-3.5 h-3.5 text-slate-500" />
                          <span>Report Banned</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 3: PURCHASE & SMS HISTORY TABLE */}
      {/* ========================================================================= */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-sky-600" />
              Number Purchase & Verification History ({historyTotal})
            </h3>
            <p className="text-xs text-slate-500">
              Audit trail of all acquired numbers, OTP codes, and transaction statuses.
            </p>
          </div>

          {/* Status Filter Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {['all', 'FINISHED', 'RECEIVED', 'PENDING', 'CANCELED', 'TIMEOUT', 'BANNED'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => {
                  setHistoryStatusFilter(st);
                  loadUserOrders();
                }}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition ${
                  historyStatusFilter === st
                    ? 'bg-sky-600 text-white shadow-2xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
              >
                {st === 'all' ? 'All Orders' : st}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {loadingHistory && orderHistory.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">Loading order history...</div>
        ) : orderHistory.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <Smartphone className="w-8 h-8 text-slate-300 mx-auto" />
            <div className="text-xs font-bold text-slate-600">No virtual numbers found</div>
            <p className="text-[11px] text-slate-400">Acquire your first virtual line using the selector above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Platform</th>
                  <th className="py-2.5 px-3">Country</th>
                  <th className="py-2.5 px-3">Virtual Number</th>
                  <th className="py-2.5 px-3">Price Paid</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Received OTP</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                {orderHistory.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">
                      {new Date(order.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="py-3 px-3 font-bold text-slate-900 uppercase">{order.product}</td>
                    <td className="py-3 px-3 capitalize">{order.country}</td>
                    <td className="py-3 px-3 font-mono font-bold text-slate-900">
                      {order.phone || '---'}
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-slate-900">
                      {order.currency === 'INR' ? '₹' : order.currency} {order.sell_price.toFixed(2)}
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
                            : order.status === 'CANCELED' || order.status === 'TIMEOUT'
                            ? 'bg-slate-100 text-slate-600'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {order.status}
                        {order.refunded && ' (Refunded)'}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {order.otp_code ? (
                        <div className="flex items-center gap-1.5">
                          <code className="px-2 py-0.5 bg-emerald-100 text-emerald-900 font-mono font-black text-xs rounded border border-emerald-300">
                            {order.otp_code}
                          </code>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(order.otp_code!, 'OTP Code')}
                            className="text-slate-400 hover:text-slate-700 p-0.5"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px]">---</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {order.status === 'PENDING' && !order.otp_code && (
                        <button
                          type="button"
                          onClick={() => handleCancelOrder(order.id)}
                          className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-[10px] font-bold transition border border-rose-200"
                        >
                          Cancel
                        </button>
                      )}
                      {order.status === 'RECEIVED' && (
                        <button
                          type="button"
                          onClick={() => handleFinishOrder(order.id)}
                          className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-bold transition border border-emerald-200"
                        >
                          Finish
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL: CONFIRM NUMBER PURCHASE */}
      {/* ========================================================================= */}
      {isConfirmBuyOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-black text-slate-900">Confirm Number Purchase</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsConfirmBuyOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ×
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Service:</span>
                <span className="font-bold text-slate-900 uppercase">{selectedProduct}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Country:</span>
                <span className="font-bold text-slate-900 capitalize">{selectedCountry}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Carrier:</span>
                <span className="font-mono font-bold text-sky-700">{selectedOperator}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <span className="text-slate-700 font-bold">Amount to Deduct:</span>
                <span className="text-base font-black font-mono text-emerald-600">
                  {activeCurrencySymbol} {currentSellPrice.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 text-[11px] text-emerald-900 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <strong>100% Guaranteed Refund:</strong> If no SMS verification code arrives within 15 minutes (or if you cancel), this amount will be immediately refunded back to your wallet.
              </span>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmBuyOpen(false)}
                disabled={isPurchasing}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteBuy}
                disabled={isPurchasing}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/30"
              >
                {isPurchasing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Activating...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5 fill-white" />
                    <span>Confirm & Pay</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: VISUAL SERVICE SELECTOR (1,346 SERVICES) */}
      {/* ========================================================================= */}
      {isServiceModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[88vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-sky-600" />
                    <span>Choose Target Service</span>
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-sky-100 text-sky-800 border border-sky-200">
                    {filteredProducts.length} Services
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select the application or website you wish to verify via SMS.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsServiceModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Input & Category Filters */}
            <div className="p-4 bg-slate-50/70 border-b border-slate-100 space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  autoFocus
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search service name, e.g. WhatsApp, OpenAI, Telegram, Steam, Bank..."
                  className="w-full pl-10 pr-9 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-sky-500/30"
                />
                {productSearch && (
                  <button
                    type="button"
                    onClick={() => setProductSearch('')}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Category Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                {SERVICE_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setServiceCategoryFilter(cat.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 border ${
                      serviceCategoryFilter === cat.id
                        ? 'bg-sky-600 text-white border-sky-600 shadow-2xs'
                        : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Grid of Visual Service Cards */}
            <div className="p-5 overflow-y-auto flex-1 max-h-[55vh] scrollbar-thin">
              {filteredProducts.length === 0 ? (
                <div className="py-16 text-center space-y-2">
                  <div className="text-3xl">🔍</div>
                  <p className="text-sm font-bold text-slate-700">No services found matching "{productSearch}"</p>
                  <p className="text-xs text-slate-400">Try a different keyword or switch to "All Services"</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {filteredProducts.map((p) => {
                    const meta = getServiceMetadata(p.slug, p.name);
                    const isSelected = selectedProduct === p.slug;
                    return (
                      <button
                        key={p.slug}
                        type="button"
                        onClick={() => {
                          setSelectedProduct(p.slug);
                          setIsServiceModalOpen(false);
                        }}
                        className={`p-3 rounded-2xl border text-left transition flex items-center gap-3 relative group ${
                          isSelected
                            ? 'bg-sky-50 border-sky-500 ring-2 ring-sky-500/20 shadow-xs'
                            : 'bg-white hover:bg-slate-50 hover:border-slate-300 border-slate-200'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${meta.gradient} text-white flex items-center justify-center text-sm font-bold shrink-0 shadow-2xs group-hover:scale-105 transition`}>
                          {meta.iconChar}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-slate-900 truncate">{meta.displayName}</h4>
                          <p className="text-[10px] text-slate-400 font-mono truncate">{meta.slug}</p>
                        </div>
                        {isSelected && (
                          <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Showing {filteredProducts.length} of {products.length} services</span>
              <button
                type="button"
                onClick={() => setIsServiceModalOpen(false)}
                className="px-4 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: VISUAL COUNTRY SELECTOR (153 COUNTRIES) */}
      {/* ========================================================================= */}
      {isCountryModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[88vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-emerald-600" />
                    <span>Choose Country / Jurisdiction</span>
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                    {filteredCountries.length} Jurisdictions
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select the mobile carrier region to acquire numbers from.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCountryModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Input & Quick Regions */}
            <div className="p-4 bg-slate-50/70 border-b border-slate-100 space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  autoFocus
                  value={countrySearch}
                  onChange={(e) => setCountrySearch(e.target.value)}
                  placeholder="Search country name, dial code, or slug (e.g. United Kingdom, +44, India, 91, US)..."
                  className="w-full pl-10 pr-9 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/30"
                />
                {countrySearch && (
                  <button
                    type="button"
                    onClick={() => setCountrySearch('')}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Region Filter Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                {[
                  { id: 'all', label: 'All Jurisdictions (153)' },
                  { id: 'popular', label: '⭐ Top Popular' }
                ].map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setCountryRegionFilter(r.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 border ${
                      countryRegionFilter === r.id
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                        : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Grid of Visual Country Cards */}
            <div className="p-5 overflow-y-auto flex-1 max-h-[55vh] scrollbar-thin">
              {filteredCountries.length === 0 ? (
                <div className="py-16 text-center space-y-2">
                  <div className="text-3xl">🌍</div>
                  <p className="text-sm font-bold text-slate-700">No countries found matching "{countrySearch}"</p>
                  <p className="text-xs text-slate-400">Try searching by dial code (e.g. +44) or country name</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {filteredCountries.map((c) => {
                    const iso = resolveCountryIso(c.slug, c.iso);
                    const flag = getCountryFlag(iso);
                    const name = resolveCountryDisplayName(c.slug, c.name);
                    const dial = formatDialCode(c.prefix);
                    const isSelected = selectedCountry === c.slug;

                    return (
                      <button
                        key={c.slug}
                        type="button"
                        onClick={() => {
                          setSelectedCountry(c.slug);
                          setIsCountryModalOpen(false);
                        }}
                        className={`p-3 rounded-2xl border text-left transition flex items-center gap-3 relative group ${
                          isSelected
                            ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
                            : 'bg-white hover:bg-slate-50 hover:border-slate-300 border-slate-200'
                        }`}
                      >
                        <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-xl shrink-0 group-hover:scale-110 transition shadow-2xs">
                          {flag}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-slate-900 truncate">{name}</h4>
                          <p className="text-[10px] text-slate-500 font-mono font-semibold">{dial || c.slug}</p>
                        </div>
                        {isSelected && (
                          <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Showing {filteredCountries.length} of {countries.length} jurisdictions</span>
              <button
                type="button"
                onClick={() => setIsCountryModalOpen(false)}
                className="px-4 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
