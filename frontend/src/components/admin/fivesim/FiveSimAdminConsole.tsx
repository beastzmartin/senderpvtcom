import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../../services/api';
import { useWhatsApp } from '../../../context/WhatsAppContext';
import {
  FiveSimProfile,
  FiveSimOrderItem,
  FiveSimPaymentItem,
  FiveSimMaxPriceItem,
  FiveSimConfig,
  BestOperatorRecommendation,
  FiveSimHostingSmsItem
} from '../../../types';
import {
  Radio,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Key,
  Globe,
  Sliders,
  DollarSign,
  Plus,
  Trash2,
  Search,
  ExternalLink,
  Lock,
  Eye,
  EyeOff,
  Zap,
  Info,
  Clock,
  ArrowUpRight,
  Sparkles,
  Copy,
  Check,
  Star,
  Phone,
  Ban,
  MessageSquare,
  Smartphone,
  ChevronRight,
  Layers,
  Inbox,
  Send,
  HelpCircle,
  CheckCheck
} from 'lucide-react';

export const FiveSimAdminConsole: React.FC = () => {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<
    'rates' | 'live-orders' | 'profile' | 'max-prices' | 'orders' | 'payments' | 'settings'
  >('rates');

  const { socket } = useWhatsApp();

  const [loading, setLoading] = useState<boolean>(true);
  const [testingConnection, setTestingConnection] = useState<boolean>(false);
  const [syncingAll, setSyncingAll] = useState<boolean>(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info' | 'warning'; message: string } | null>(null);

  // 5SIM Data
  const [config, setConfig] = useState<FiveSimConfig | null>(null);
  const [profile, setProfile] = useState<FiveSimProfile | null>(null);
  const [maxPrices, setMaxPrices] = useState<FiveSimMaxPriceItem[]>([]);
  const [orders, setOrders] = useState<FiveSimOrderItem[]>([]);
  const [ordersTotal, setOrdersTotal] = useState<number>(0);
  const [payments, setPayments] = useState<FiveSimPaymentItem[]>([]);
  const [paymentsTotal, setPaymentsTotal] = useState<number>(0);

  // Active Orders (Part 6)
  const [activeOrders, setActiveOrders] = useState<FiveSimOrderItem[]>([]);
  const [loadingActiveOrders, setLoadingActiveOrders] = useState<boolean>(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [operatingOrderId, setOperatingOrderId] = useState<number | null>(null);

  // Rates & Catalog (Part 4)
  const [countriesMap, setCountriesMap] = useState<Record<string, any>>({});
  const [selectedCountry, setSelectedCountry] = useState<string>('england');
  const [selectedProduct, setSelectedProduct] = useState<string>('whatsapp');
  const [customProductInput, setCustomProductInput] = useState<string>('');
  const [operatorRates, setOperatorRates] = useState<BestOperatorRecommendation[]>([]);
  const [bestOperator, setBestOperator] = useState<BestOperatorRecommendation | null>(null);
  const [loadingRates, setLoadingRates] = useState<boolean>(false);
  const [countrySearch, setCountrySearch] = useState<string>('');

  // Purchase Modal (Part 5)
  const [isBuyModalOpen, setIsBuyModalOpen] = useState<boolean>(false);
  const [buyType, setBuyType] = useState<'activation' | 'hosting' | 'reuse'>('activation');
  const [buyCountry, setBuyCountry] = useState<string>('england');
  const [buyProduct, setBuyProduct] = useState<string>('whatsapp');
  const [buyOperator, setBuyOperator] = useState<string>('any');
  const [buyMaxPrice, setBuyMaxPrice] = useState<string>('');
  const [buyVoice, setBuyVoice] = useState<boolean>(false);
  const [buyForwardingNumber, setBuyForwardingNumber] = useState<string>('');
  const [reusePhoneInput, setReusePhoneInput] = useState<string>('');
  const [isBuying, setIsBuying] = useState<boolean>(false);

  // Hosting Inbox Modal
  const [inboxModalOrder, setInboxModalOrder] = useState<FiveSimOrderItem | null>(null);
  const [inboxMessages, setInboxMessages] = useState<FiveSimHostingSmsItem[]>([]);
  const [loadingInbox, setLoadingInbox] = useState<boolean>(false);

  // Settings form
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [baseUrlInput, setBaseUrlInput] = useState<string>('https://5sim.net/v1');
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [isSavingSettings, setIsSavingSettings] = useState<boolean>(false);

  // Max Price modal/form
  const [isAddPriceOpen, setIsAddPriceOpen] = useState<boolean>(false);
  const [newProductName, setNewProductName] = useState<string>('');
  const [newPriceValue, setNewPriceValue] = useState<number>(20);
  const [isSubmittingPrice, setIsSubmittingPrice] = useState<boolean>(false);

  // Orders filters
  const [orderCategory, setOrderCategory] = useState<'activation' | 'hosting'>('activation');
  const [orderSource, setOrderSource] = useState<'cached' | 'live'>('cached');
  const [orderSearch, setOrderSearch] = useState<string>('');

  // Payments filters
  const [paymentSource, setPaymentSource] = useState<'cached' | 'live'>('cached');

  // Popular presets
  const popularCountries = [
    { slug: 'england', name: 'UK / England', flag: '🇬🇧' },
    { slug: 'usa', name: 'USA', flag: '🇺🇸' },
    { slug: 'russia', name: 'Russia', flag: '🇷🇺' },
    { slug: 'indonesia', name: 'Indonesia', flag: '🇮🇩' },
    { slug: 'brazil', name: 'Brazil', flag: '🇧🇷' },
    { slug: 'india', name: 'India', flag: '🇮🇳' },
    { slug: 'netherlands', name: 'Netherlands', flag: '🇳🇱' },
    { slug: 'germany', name: 'Germany', flag: '🇩🇪' },
    { slug: 'vietnam', name: 'Vietnam', flag: '🇻🇳' },
    { slug: 'poland', name: 'Poland', flag: '🇵🇱' }
  ];

  const popularServices = [
    { slug: 'whatsapp', name: 'WhatsApp', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    { slug: 'telegram', name: 'Telegram', color: 'bg-sky-50 text-sky-700 border-sky-200' },
    { slug: 'google', name: 'Google / Gmail', color: 'bg-amber-50 text-amber-700 border-amber-200' },
    { slug: 'openai', name: 'OpenAI / ChatGPT', color: 'bg-teal-50 text-teal-700 border-teal-200' },
    { slug: 'instagram', name: 'Instagram', color: 'bg-pink-50 text-pink-700 border-pink-200' },
    { slug: 'facebook', name: 'Facebook', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    { slug: 'tiktok', name: 'TikTok', color: 'bg-rose-50 text-rose-700 border-rose-200' },
    { slug: 'twitter', name: 'Twitter / X', color: 'bg-slate-100 text-slate-800 border-slate-300' },
    { slug: 'microsoft', name: 'Microsoft', color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
    { slug: 'tinder', name: 'Tinder', color: 'bg-orange-50 text-orange-700 border-orange-200' }
  ];

  const showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    showToast(`Copied ${label} to clipboard!`, 'success');
    setTimeout(() => setCopiedText(null), 2500);
  };

  // Timer ticker for dynamic countdown updates
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Socket.IO real-time event subscriptions
  useEffect(() => {
    if (!socket) return;

    const handleOrderCreated = (data: any) => {
      const order = data?.order || data;
      showToast(`⚡ New order #${order.id} created for ${order.phone || 'virtual line'} (${order.product})`, 'success');
      loadActiveOrders();
      loadProfile();
    };

    const handleSmsReceived = (data: any) => {
      const code = data?.sms?.code || data?.code || 'OTP';
      const phone = data?.phone || 'Virtual Number';
      showToast(`📩 OTP Code [${code}] arrived for ${phone}!`, 'success');
      loadActiveOrders();
      loadProfile();
    };

    const handleOrderUpdated = () => {
      loadActiveOrders();
    };

    const handleOrderFinished = (data: any) => {
      showToast(`✅ Order #${data?.orderId || ''} finished! +0.5 rating points awarded.`, 'success');
      loadActiveOrders();
      loadProfile();
    };

    const handleOrderCanceled = (data: any) => {
      showToast(`⚠️ Order #${data?.orderId || ''} canceled. Balance refunded.`, 'info');
      loadActiveOrders();
      loadProfile();
    };

    const handleOrderBanned = (data: any) => {
      showToast(`🚫 Order #${data?.orderId || ''} banned/reported.`, 'warning');
      loadActiveOrders();
      loadProfile();
    };

    socket.on('fivesim:order_created', handleOrderCreated);
    socket.on('fivesim:sms_received', handleSmsReceived);
    socket.on('fivesim:order_updated', handleOrderUpdated);
    socket.on('fivesim:order_finished', handleOrderFinished);
    socket.on('fivesim:order_canceled', handleOrderCanceled);
    socket.on('fivesim:order_banned', handleOrderBanned);

    return () => {
      socket.off('fivesim:order_created', handleOrderCreated);
      socket.off('fivesim:sms_received', handleSmsReceived);
      socket.off('fivesim:order_updated', handleOrderUpdated);
      socket.off('fivesim:order_finished', handleOrderFinished);
      socket.off('fivesim:order_canceled', handleOrderCanceled);
      socket.off('fivesim:order_banned', handleOrderBanned);
    };
  }, [socket]);

  // Initial load
  useEffect(() => {
    loadInitialData();
  }, []);

  // When selected country or product changes, reload rates
  useEffect(() => {
    if (activeTab === 'rates') {
      loadRates(selectedCountry, selectedProduct);
    }
  }, [selectedCountry, selectedProduct, activeTab]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const cfgRes = await api.fiveSim.getConfig();
      if (cfgRes?.config) {
        setConfig(cfgRes.config);
        setApiKeyInput(cfgRes.config.apiKey || '');
        setBaseUrlInput(cfgRes.config.baseUrl || 'https://5sim.net/v1');
      }

      await Promise.all([
        loadProfile(),
        loadCountries(),
        loadActiveOrders(),
        loadRates(selectedCountry, selectedProduct),
        loadMaxPrices('cached')
      ]);
    } catch (err: any) {
      showToast(err.message || 'Failed to initialize 5SIM telecom console.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadProfile = async () => {
    try {
      const res = await api.fiveSim.getProfile();
      if (res?.profile) {
        setProfile(res.profile);
      }
    } catch {}
  };

  const loadCountries = async () => {
    try {
      const res = await api.fiveSim.getGuestCountries();
      if (res?.countries) {
        setCountriesMap(res.countries);
      }
    } catch {}
  };

  const loadActiveOrders = async () => {
    setLoadingActiveOrders(true);
    try {
      const res = await api.fiveSim.getOrders({
        status: 'active',
        source: 'cached',
        limit: 50
      });
      if (res?.orders) {
        setActiveOrders(res.orders);
      }
    } catch {
    } finally {
      setLoadingActiveOrders(false);
    }
  };

  const loadRates = async (country: string, product: string) => {
    setLoadingRates(true);
    try {
      const res = await api.fiveSim.getBestOperator(country, product);
      if (res?.success) {
        setOperatorRates(res.operators || []);
        setBestOperator(res.recommended || null);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch live operator rates.', 'error');
    } finally {
      setLoadingRates(false);
    }
  };

  const loadMaxPrices = async (source: 'live' | 'cached' = 'cached') => {
    try {
      const res = await api.fiveSim.getMaxPrices(source);
      if (res?.maxPrices) {
        setMaxPrices(res.maxPrices);
      }
    } catch {}
  };

  const loadOrders = async (
    source: 'live' | 'cached' = orderSource,
    category: 'activation' | 'hosting' = orderCategory
  ) => {
    try {
      const res = await api.fiveSim.getOrders({
        category,
        source,
        search: orderSearch || undefined,
        limit: 50
      });
      if (res?.orders) {
        setOrders(res.orders);
        setOrdersTotal(res.total || res.orders.length);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch orders.', 'error');
    }
  };

  const loadPayments = async (source: 'live' | 'cached' = paymentSource) => {
    try {
      const res = await api.fiveSim.getPayments({ source, limit: 50 });
      if (res?.payments) {
        setPayments(res.payments);
        setPaymentsTotal(res.total || res.payments.length);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch payments.', 'error');
    }
  };

  // --- Purchase Actions (Part 5) ---
  const handleOpenBuyModal = (operatorName?: string, countryName?: string, productName?: string) => {
    setBuyCountry(countryName || selectedCountry);
    setBuyProduct(productName || selectedProduct);
    setBuyOperator(operatorName || 'any');
    setBuyMaxPrice('');
    setBuyVoice(false);
    setBuyForwardingNumber('');
    setIsBuyModalOpen(true);
  };

  const handleExecutePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsBuying(true);
    try {
      if (buyType === 'activation') {
        const res = await api.fiveSim.buyActivation({
          country: buyCountry,
          operator: buyOperator,
          product: buyProduct,
          voice: buyVoice ? 1 : 0,
          forwarding: !!buyForwardingNumber,
          number: buyForwardingNumber || undefined,
          maxPrice: buyMaxPrice ? parseFloat(buyMaxPrice) : undefined
        });

        if (res.success && res.order) {
          showToast(`Successfully bought ${res.order.phone} (${res.order.product})!`, 'success');
          setIsBuyModalOpen(false);
          await loadActiveOrders();
          await loadProfile();
          setActiveTab('live-orders');
        }
      } else if (buyType === 'hosting') {
        const res = await api.fiveSim.buyHosting({
          country: buyCountry,
          operator: buyOperator,
          product: buyProduct
        });

        if (res.success && res.order) {
          showToast(`Successfully rented hosting number ${res.order.phone}!`, 'success');
          setIsBuyModalOpen(false);
          await loadActiveOrders();
          await loadProfile();
          setActiveTab('live-orders');
        }
      } else if (buyType === 'reuse') {
        if (!reusePhoneInput.trim()) {
          showToast('Please enter a previous phone number to reuse.', 'error');
          return;
        }
        const res = await api.fiveSim.reuseNumber({
          product: buyProduct,
          number: reusePhoneInput.trim()
        });

        if (res.success && res.order) {
          showToast(`Re-bought number ${res.order.phone} for ${res.order.product}!`, 'success');
          setIsBuyModalOpen(false);
          await loadActiveOrders();
          await loadProfile();
          setActiveTab('live-orders');
        }
      }
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('NO_FREE_PHONES') || msg.toLowerCase().includes('no free phones')) {
        showToast('⚠️ No free phone numbers currently available for this operator/country. Try another operator.', 'error');
      } else {
        showToast(msg || 'Purchase failed.', 'error');
      }
    } finally {
      setIsBuying(false);
    }
  };

  // --- Order Management Actions (Part 6) ---
  const handleCheckOrder = async (orderId: number) => {
    setOperatingOrderId(orderId);
    try {
      const res = await api.fiveSim.checkOrder(orderId);
      if (res.success) {
        showToast(`Order #${orderId} refreshed. Status: ${res.order.status}`, 'info');
        await loadActiveOrders();
      }
    } catch (err: any) {
      showToast(err.message || 'Check failed', 'error');
    } finally {
      setOperatingOrderId(null);
    }
  };

  const handleFinishOrder = async (orderId: number) => {
    setOperatingOrderId(orderId);
    try {
      const res = await api.fiveSim.finishOrder(orderId);
      if (res.success) {
        showToast(`🎉 Order #${orderId} marked finished! +0.5 rating points awarded.`, 'success');
        await loadActiveOrders();
        await loadProfile();
      }
    } catch (err: any) {
      showToast(err.message || 'Finish order failed', 'error');
    } finally {
      setOperatingOrderId(null);
    }
  };

  const handleCancelOrder = async (orderId: number) => {
    if (!confirm(`Cancel order #${orderId}? Your balance will be refunded.`)) return;
    setOperatingOrderId(orderId);
    try {
      const res = await api.fiveSim.cancelOrder(orderId);
      if (res.success) {
        showToast(`Order #${orderId} canceled and refunded.`, 'info');
        await loadActiveOrders();
        await loadProfile();
      }
    } catch (err: any) {
      showToast(err.message || 'Cancel order failed', 'error');
    } finally {
      setOperatingOrderId(null);
    }
  };

  const handleBanOrder = async (orderId: number) => {
    if (!confirm(`Report & ban order #${orderId}? Only use if the number was already registered/banned on the service.`)) return;
    setOperatingOrderId(orderId);
    try {
      const res = await api.fiveSim.banOrder(orderId);
      if (res.success) {
        showToast(`Order #${orderId} banned and reported.`, 'warning');
        await loadActiveOrders();
        await loadProfile();
      }
    } catch (err: any) {
      showToast(err.message || 'Ban order failed', 'error');
    } finally {
      setOperatingOrderId(null);
    }
  };

  const handleOpenHostingInbox = async (order: FiveSimOrderItem) => {
    setInboxModalOrder(order);
    setLoadingInbox(true);
    try {
      const res = await api.fiveSim.getHostingInbox(order.id);
      if (res.success) {
        setInboxMessages(res.messages || []);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch hosting inbox', 'error');
    } finally {
      setLoadingInbox(false);
    }
  };

  // --- Settings & Tests ---
  const handleTestConnection = async () => {
    setTestingConnection(true);
    try {
      const res = await api.fiveSim.testConnection(apiKeyInput || undefined);
      if (res.success && res.profile) {
        setProfile(res.profile);
        showToast(res.message, 'success');
      } else {
        showToast(res.message, 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Connection test failed', 'error');
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      const res = await api.fiveSim.updateConfig({
        apiKey: apiKeyInput,
        baseUrl: baseUrlInput,
        isEnabled: true
      });
      if (res.success) {
        setConfig(res.config);
        showToast('5SIM API settings saved successfully!', 'success');
        handleTestConnection();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to save settings.', 'error');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleSyncAll = async () => {
    setSyncingAll(true);
    try {
      const res = await api.fiveSim.syncAll();
      if (res.success) {
        showToast(`Full Sync Complete: Balance: ${res.summary.balance} RUB, Rating: ${res.summary.rating}/96`, 'success');
        await loadInitialData();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to sync with 5SIM.', 'error');
    } finally {
      setSyncingAll(false);
    }
  };

  const handleSetMaxPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProductName.trim() || newPriceValue <= 0) return;
    setIsSubmittingPrice(true);
    try {
      const res = await api.fiveSim.setMaxPrice({
        product: newProductName.trim().toLowerCase(),
        price: Number(newPriceValue)
      });
      if (res.success) {
        showToast(`Max price limit set for ${newProductName}!`, 'success');
        setIsAddPriceOpen(false);
        setNewProductName('');
        setNewPriceValue(20);
        await loadMaxPrices('cached');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to set price limit.', 'error');
    } finally {
      setIsSubmittingPrice(false);
    }
  };

  const handleDeleteMaxPrice = async (product: string) => {
    if (!confirm(`Are you sure you want to remove the price limit for "${product}"?`)) return;
    try {
      const res = await api.fiveSim.deleteMaxPrice(product);
      if (res.success) {
        showToast(`Price limit for ${product} removed.`, 'success');
        await loadMaxPrices('cached');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to delete price limit.', 'error');
    }
  };

  // Helper for countdown calculations
  const calculateRemainingTime = (order: FiveSimOrderItem) => {
    if (order.status === 'FINISHED' || order.status === 'CANCELED' || order.status === 'BANNED') {
      return { text: order.status, percent: 0, isExpired: true };
    }

    let expiryTimestamp: number;
    if (order.expires) {
      expiryTimestamp = new Date(order.expires).getTime();
    } else {
      const created = new Date(order.created_at).getTime();
      expiryTimestamp = created + 15 * 60 * 1000;
    }

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

  return (
    <div className="space-y-6">
      {/* Toast notification */}
      {toast && (
        <div
          className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-between shadow-md transition ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : toast.type === 'error'
              ? 'bg-rose-50 border-rose-300 text-rose-900'
              : toast.type === 'warning'
              ? 'bg-amber-50 border-amber-300 text-amber-900'
              : 'bg-sky-50 border-sky-300 text-sky-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : toast.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-rose-600" />
            ) : toast.type === 'warning' ? (
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            ) : (
              <Info className="w-4 h-4 text-sky-600" />
            )}
            <span>{toast.message}</span>
          </div>
          <button onClick={() => setToast(null)} className="text-slate-400 hover:text-slate-600">
            ×
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-sky-950 via-indigo-950 to-slate-950 text-white rounded-3xl p-6 shadow-md flex flex-wrap items-center justify-between gap-4 border border-sky-900/40">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-sky-500/25 text-sky-200 border border-sky-400/30 flex items-center gap-1">
              <Zap className="w-3 h-3 text-sky-400" />
              Official 5SIM.NET Integration (Parts 0 - 6)
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live Gateway Active
            </span>
          </div>

          <h1 className="text-xl font-black tracking-tight flex items-center gap-2.5">
            <Radio className="w-6 h-6 text-sky-400" />
            5SIM Virtual Telecom Engine
          </h1>

          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            Live operator rate matrices, stock counts, automated best-carrier selection, instant purchase flows, 15-minute OTP countdowns, and real-time dashboard notifications.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Quick Balance & Rating Pill */}
          <div className="px-3.5 py-2 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3">
            <div>
              <div className="text-[9px] font-bold text-slate-400 uppercase">Balance</div>
              <div className="text-sm font-mono font-black text-sky-300">
                {(profile?.balance || config?.balance || 0).toFixed(2)} RUB
              </div>
            </div>
            <div className="h-6 w-px bg-white/10" />
            <div>
              <div className="text-[9px] font-bold text-slate-400 uppercase">Rating</div>
              <div className="text-sm font-mono font-black text-emerald-300">
                {profile?.rating || config?.rating || 96} / 96
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleOpenBuyModal()}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-emerald-600/30"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>⚡ Instant Buy Number</span>
          </button>

          <button
            type="button"
            onClick={handleSyncAll}
            disabled={syncingAll}
            className="px-3.5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-white/10 disabled:opacity-50"
            title="Sync all profile and ledger telemetry"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingAll ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Sub Navigation Bar */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('rates')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
            activeTab === 'rates'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Live Catalog & Rates (Part 4)</span>
        </button>

        <button
          onClick={() => setActiveTab('live-orders')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
            activeTab === 'live-orders'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Smartphone className="w-4 h-4" />
          <span>Active SMS Monitor (Part 6)</span>
          {activeOrders.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-emerald-500 text-white">
              {activeOrders.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('orders')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
            activeTab === 'orders'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Orders History ({ordersTotal})</span>
        </button>

        <button
          onClick={() => setActiveTab('profile')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
            activeTab === 'profile'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Profile & Rating</span>
        </button>

        <button
          onClick={() => setActiveTab('max-prices')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
            activeTab === 'max-prices'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Price Limits ({maxPrices.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('payments')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
            activeTab === 'payments'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          <span>Payments ({paymentsTotal})</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
            activeTab === 'settings'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Key className="w-4 h-4" />
          <span>API Credentials</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: LIVE CATALOG & OPERATOR RATES MATRIX (PART 4) */}
      {/* ========================================================================= */}
      {activeTab === 'rates' && (
        <div className="space-y-6">
          {/* Filter Bar: Country & Product Selectors */}
          <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-2xs space-y-4">
            <div>
              <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-sky-600" />
                Live Operator Rate & Stock Matrix (Part 4)
              </h2>
              <p className="text-xs text-slate-500">
                Query guest catalog rates, live stock counts, and success delivery percentages across 150+ telecom networks without authentication overhead.
              </p>
            </div>

            {/* Country Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">Select Country / Jurisdiction</label>
              {/* Quick Popular Country Pills */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {popularCountries.map((c) => (
                  <button
                    key={c.slug}
                    type="button"
                    onClick={() => setSelectedCountry(c.slug)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border ${
                      selectedCountry === c.slug
                        ? 'bg-sky-600 text-white border-sky-600 shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    <span>{c.flag}</span>
                    <span>{c.name}</span>
                  </button>
                ))}
              </div>

              {/* Full Country Dropdown */}
              <div className="pt-1 flex items-center gap-2">
                <div className="relative flex-1 max-w-sm">
                  <select
                    value={selectedCountry}
                    onChange={(e) => setSelectedCountry(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500/20"
                  >
                    {Object.keys(countriesMap).length > 0 ? (
                      Object.entries(countriesMap).map(([slug, data]) => (
                        <option key={slug} value={slug}>
                          {data?.text_en || slug} ({Object.keys(data?.prefix || {})[0] || slug})
                        </option>
                      ))
                    ) : (
                      popularCountries.map((c) => (
                        <option key={c.slug} value={c.slug}>
                          {c.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => loadRates(selectedCountry, selectedProduct)}
                  disabled={loadingRates}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingRates ? 'animate-spin' : ''}`} />
                  <span>Refresh Rates</span>
                </button>
              </div>
            </div>

            {/* Service / Product Selector */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <label className="text-xs font-bold text-slate-700 block">Select Application / Service</label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {popularServices.map((s) => (
                  <button
                    key={s.slug}
                    type="button"
                    onClick={() => {
                      setSelectedProduct(s.slug);
                      setCustomProductInput('');
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                      selectedProduct === s.slug && !customProductInput
                        ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                        : `${s.color} hover:opacity-85`
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>

              {/* Custom product search */}
              <div className="flex items-center gap-2 pt-1 max-w-sm">
                <input
                  type="text"
                  placeholder="Or enter any custom product (e.g. uber, netflix)..."
                  value={customProductInput}
                  onChange={(e) => {
                    setCustomProductInput(e.target.value);
                    if (e.target.value.trim()) {
                      setSelectedProduct(e.target.value.trim().toLowerCase());
                    }
                  }}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500/20"
                />
              </div>
            </div>
          </div>

          {/* Best Operator Recommendation Highlight (Part 4 Algorithm) */}
          {bestOperator && (
            <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white rounded-3xl p-5 shadow-sm border border-emerald-500/30 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center gap-1">
                    <Star className="w-3 h-3 text-emerald-400 fill-emerald-400" />
                    Recommended Telecom Carrier
                  </span>
                  <span className="text-xs text-emerald-200 capitalize font-bold">
                    for {selectedProduct} in {selectedCountry}
                  </span>
                </div>
                <div className="text-lg font-black tracking-tight flex items-center gap-3">
                  <span className="font-mono text-emerald-300 uppercase">{bestOperator.operator}</span>
                  <span className="text-slate-400">•</span>
                  <span className="font-mono text-white">{bestOperator.cost} RUB</span>
                  <span className="text-slate-400">•</span>
                  <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-500/30 text-emerald-200 font-mono">
                    {bestOperator.count.toLocaleString()} Numbers In Stock
                  </span>
                  {bestOperator.rate !== undefined && (
                    <span className="text-xs px-2 py-0.5 rounded-md bg-sky-500/30 text-sky-200 font-mono">
                      {bestOperator.rate}% Delivery Rate
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-emerald-100/70">
                  Calculated by 5SIM delivery success matrix. Highest historical SMS reception speed with optimal price.
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleOpenBuyModal(bestOperator.operator, selectedCountry, selectedProduct)}
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-black transition flex items-center gap-2 shadow-md shadow-emerald-500/20"
              >
                <Zap className="w-4 h-4 fill-slate-950" />
                <span>Instant Buy with {bestOperator.operator}</span>
              </button>
            </div>
          )}

          {/* Rates Matrix Table */}
          <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-2xs">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-900 capitalize">
                  Available Operators for {selectedProduct} ({selectedCountry})
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 text-slate-600">
                  {operatorRates.length} carriers found
                </span>
              </div>
            </div>

            {loadingRates ? (
              <div className="p-12 text-center space-y-3">
                <RefreshCw className="w-8 h-8 text-sky-600 animate-spin mx-auto" />
                <p className="text-xs text-slate-500 font-medium">Fetching live 5SIM rate matrix...</p>
              </div>
            ) : operatorRates.length === 0 ? (
              <div className="p-12 text-center space-y-2 text-slate-500 text-xs">
                <Layers className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="font-bold text-slate-700">No operators found for {selectedProduct} in {selectedCountry}.</p>
                <p>Try switching country or selecting another service.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-bold uppercase text-[10px]">
                      <th className="py-3 px-4">Carrier / Operator</th>
                      <th className="py-3 px-4">Stock Availability</th>
                      <th className="py-3 px-4">SMS Delivery Rate</th>
                      <th className="py-3 px-4">Cost (RUB)</th>
                      <th className="py-3 px-4">Recommendation</th>
                      <th className="py-3 px-4 text-right">Quick Purchase</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {operatorRates.map((op) => (
                      <tr
                        key={op.operator}
                        className={`hover:bg-slate-50/70 transition ${op.recommended ? 'bg-emerald-50/30' : ''}`}
                      >
                        <td className="py-3 px-4 font-mono font-bold text-slate-900 uppercase flex items-center gap-2">
                          <Radio className="w-3.5 h-3.5 text-slate-400" />
                          <span>{op.operator}</span>
                        </td>

                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                              op.count > 100
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : op.count > 0
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-slate-100 text-slate-400'
                            }`}
                          >
                            {op.count.toLocaleString()} available
                          </span>
                        </td>

                        <td className="py-3 px-4 font-mono">
                          {op.rate !== undefined ? (
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                op.rate >= 20
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : op.rate >= 5
                                  ? 'bg-sky-100 text-sky-800'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {op.rate}% success
                            </span>
                          ) : (
                            <span className="text-slate-400 font-mono text-[11px]">N/A</span>
                          )}
                        </td>

                        <td className="py-3 px-4 font-mono font-bold text-slate-900 text-sm">
                          {op.cost.toFixed(2)} RUB
                        </td>

                        <td className="py-3 px-4">
                          {op.recommended ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-300 flex items-center gap-1 w-fit">
                              <Star className="w-3 h-3 fill-emerald-600 text-emerald-600" />
                              Best Operator
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">Standard</span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleOpenBuyModal(op.operator, selectedCountry, selectedProduct)}
                            disabled={op.count === 0}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 ml-auto ${
                              op.count > 0
                                ? 'bg-sky-600 hover:bg-sky-700 text-white shadow-2xs'
                                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            }`}
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Buy Number</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: ACTIVE SMS & ORDER MONITOR (PART 6) */}
      {/* ========================================================================= */}
      {activeTab === 'live-orders' && (
        <div className="space-y-6">
          {/* Top Monitoring Header */}
          <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-2xs flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                  Real-time SMS Inbound Dispatch
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 text-slate-700">
                  Auto-Polling 3.5s
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Incoming OTP messages automatically appear here via Socket.IO push. Finish orders immediately after receiving codes to earn <strong>+0.5 rating points</strong>.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadActiveOrders}
                disabled={loadingActiveOrders}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingActiveOrders ? 'animate-spin' : ''}`} />
                <span>Refresh Monitor</span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenBuyModal()}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Buy Another Line</span>
              </button>
            </div>
          </div>

          {/* Active Orders List */}
          {activeOrders.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center space-y-3 shadow-2xs">
              <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center mx-auto">
                <Smartphone className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-slate-900 text-sm">No Active Virtual Numbers Waiting for SMS</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                When you buy an activation number or rental line, it will appear here with a 15-minute countdown and live incoming SMS radar.
              </p>
              <button
                type="button"
                onClick={() => handleOpenBuyModal()}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl transition shadow-sm inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Purchase an Activation Number</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeOrders.map((order) => {
                const remaining = calculateRemainingTime(order);
                const hasSms = Array.isArray(order.sms) && order.sms.length > 0;
                const latestSms = hasSms ? order.sms![order.sms!.length - 1] : null;
                const isOperating = operatingOrderId === order.id;

                return (
                  <div
                    key={order.id}
                    className={`bg-white border rounded-3xl p-5 shadow-sm space-y-4 transition ${
                      hasSms
                        ? 'border-emerald-300 ring-2 ring-emerald-500/10'
                        : 'border-slate-200 hover:border-sky-300'
                    }`}
                  >
                    {/* Header info */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] font-bold text-slate-400">
                            #{order.id}
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                            {order.country || 'Global'}
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-sky-50 text-sky-700 border border-sky-100">
                            {order.product}
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono text-slate-500 uppercase">
                            {order.operator || 'Any'}
                          </span>
                        </div>

                        {/* Phone Number with 1-click copy */}
                        <div className="flex items-center gap-2 pt-1.5">
                          <span className="text-xl font-black font-mono tracking-tight text-slate-900">
                            {order.phone}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(order.phone, 'phone number')}
                            className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition"
                            title="Copy Phone Number"
                          >
                            {copiedText === 'phone number' ? (
                              <Check className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Status & Expiry Badge */}
                      <div className="text-right space-y-1">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase inline-flex items-center gap-1 ${
                            hasSms
                              ? 'bg-emerald-100 text-emerald-800'
                              : order.status === 'PENDING'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {!hasSms && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />}
                          {hasSms ? 'SMS Received!' : order.status}
                        </span>

                        <div className="text-xs font-mono font-bold text-slate-500 flex items-center justify-end gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{remaining.text}</span>
                        </div>
                      </div>
                    </div>

                    {/* Expiry Progress Bar */}
                    <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-1000 ${
                          remaining.percent > 40
                            ? 'bg-emerald-500'
                            : remaining.percent > 15
                            ? 'bg-amber-500'
                            : 'bg-rose-500'
                        }`}
                        style={{ width: `${remaining.percent}%` }}
                      />
                    </div>

                    {/* SMS Payload Display Card */}
                    {hasSms ? (
                      <div className="bg-gradient-to-br from-emerald-500/10 via-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-emerald-900 font-bold text-xs">
                            <CheckCheck className="w-4 h-4 text-emerald-600" />
                            <span>Verification Code Ready</span>
                          </div>
                          <span className="text-[10px] font-mono text-emerald-700">
                            {latestSms?.sender || 'SMS Gate'}
                          </span>
                        </div>

                        {/* Huge Code Display */}
                        <div className="flex items-center justify-between bg-white border border-emerald-200 rounded-xl p-3 shadow-2xs">
                          <div className="font-mono text-2xl font-black text-emerald-700 tracking-wider">
                            {latestSms?.code || 'Received'}
                          </div>

                          {latestSms?.code && (
                            <button
                              type="button"
                              onClick={() => copyToClipboard(latestSms.code, 'OTP code')}
                              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition flex items-center gap-1.5 shadow-2xs"
                            >
                              {copiedText === 'OTP code' ? (
                                <>
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Copy Code</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>

                        {/* Full SMS Message text */}
                        {latestSms?.text && (
                          <div className="text-[11px] text-slate-600 bg-white/70 p-2.5 rounded-lg border border-emerald-100 leading-relaxed font-mono">
                            {latestSms.text}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-center space-y-1.5">
                        <div className="flex items-center justify-center gap-2 text-slate-600 text-xs font-bold">
                          <RefreshCw className="w-3.5 h-3.5 text-sky-600 animate-spin" />
                          <span>Waiting for SMS delivery...</span>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          Automated background watcher is polling 5SIM every 3.5s. Enter this phone number in your app now.
                        </p>
                      </div>
                    )}

                    {/* Action Buttons Bar */}
                    <div className="pt-1 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {/* Check SMS button */}
                        <button
                          type="button"
                          onClick={() => handleCheckOrder(order.id)}
                          disabled={isOperating}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-xl transition flex items-center gap-1"
                          title="Manual force poll"
                        >
                          <RefreshCw className={`w-3 h-3 ${isOperating ? 'animate-spin' : ''}`} />
                          <span>Check</span>
                        </button>

                        {/* Ban button */}
                        <button
                          type="button"
                          onClick={() => handleBanOrder(order.id)}
                          disabled={isOperating}
                          className="px-2.5 py-1.5 text-rose-600 hover:bg-rose-50 text-[11px] font-bold rounded-xl transition flex items-center gap-1"
                          title="Ban/Report number if already registered"
                        >
                          <Ban className="w-3 h-3" />
                          <span>Ban</span>
                        </button>

                        {/* Hosting inbox if applicable */}
                        {order.forwarding || (order as any).category === 'hosting' ? (
                          <button
                            type="button"
                            onClick={() => handleOpenHostingInbox(order)}
                            className="px-2.5 py-1.5 bg-sky-50 text-sky-700 text-[11px] font-bold rounded-xl transition flex items-center gap-1"
                          >
                            <Inbox className="w-3 h-3" />
                            <span>Inbox</span>
                          </button>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Cancel order (refunds balance, avoids -0.15 timeout) */}
                        {!hasSms && (
                          <button
                            type="button"
                            onClick={() => handleCancelOrder(order.id)}
                            disabled={isOperating}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-700 text-xs font-bold rounded-xl transition flex items-center gap-1"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Cancel</span>
                          </button>
                        )}

                        {/* Finish order (+0.5 rating boost) */}
                        <button
                          type="button"
                          onClick={() => handleFinishOrder(order.id)}
                          disabled={isOperating}
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-2xs"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Finish (+0.5 Rating)</span>
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

      {/* ========================================================================= */}
      {/* TAB 3: ORDERS HISTORY (PART 2.2) */}
      {/* ========================================================================= */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-slate-200 shadow-2xs">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setOrderCategory('activation');
                  loadOrders(orderSource, 'activation');
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  orderCategory === 'activation'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Activation Numbers
              </button>

              <button
                type="button"
                onClick={() => {
                  setOrderCategory('hosting');
                  loadOrders(orderSource, 'hosting');
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  orderCategory === 'hosting'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Hosting (Rentals)
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setOrderSource('live');
                  loadOrders('live', orderCategory);
                }}
                className="px-3 py-1.5 bg-sky-50 text-sky-700 border border-sky-200 rounded-xl text-xs font-bold flex items-center gap-1 hover:bg-sky-100"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Fetch Live from 5SIM</span>
              </button>
            </div>
          </div>

          {/* Orders Table */}
          <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-2xs">
            {orders.length === 0 ? (
              <div className="p-12 text-center space-y-2 text-slate-500 text-xs">
                <Clock className="w-8 h-8 text-slate-300 mx-auto" />
                <p>No orders recorded for category "{orderCategory}".</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-bold uppercase text-[10px]">
                      <th className="py-3 px-4">Order ID</th>
                      <th className="py-3 px-4">Phone Number</th>
                      <th className="py-3 px-4">Service</th>
                      <th className="py-3 px-4">Operator</th>
                      <th className="py-3 px-4">Price</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">SMS Received</th>
                      <th className="py-3 px-4">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {orders.map((o) => (
                      <tr key={o.id} className="hover:bg-slate-50/60">
                        <td className="py-3 px-4 font-mono text-slate-500 font-bold">#{o.id}</td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">{o.phone}</td>
                        <td className="py-3 px-4 capitalize font-semibold text-slate-700">{o.product}</td>
                        <td className="py-3 px-4 text-slate-500 uppercase">{o.operator || 'Any'}</td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">{o.price} RUB</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                              o.status === 'FINISHED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : o.status === 'RECEIVED'
                                ? 'bg-sky-100 text-sky-800'
                                : o.status === 'PENDING'
                                ? 'bg-amber-100 text-amber-800'
                                : o.status === 'CANCELED'
                                ? 'bg-slate-100 text-slate-600'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {o.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono">
                          {o.sms && o.sms.length > 0 ? (
                            <span className="text-emerald-700 font-bold">
                              {o.sms[0].code || 'Received'} ({o.sms.length})
                            </span>
                          ) : (
                            <span className="text-slate-400">None</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-400">{o.created_at?.slice(0, 16)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: PROFILE & RATING (PARTS 1 & 2.1) */}
      {/* ========================================================================= */}
      {activeTab === 'profile' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Balance */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-2xs space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                5SIM Account Balance
              </span>
              <div className="text-2xl font-black font-mono text-slate-900 flex items-baseline gap-1">
                <span>{(profile?.balance || config?.balance || 0).toFixed(2)}</span>
                <span className="text-xs font-bold text-slate-500">RUB</span>
              </div>
              <div className="text-[11px] text-slate-400 font-medium">
                Frozen: {(profile?.frozen_balance || config?.frozenBalance || 0).toFixed(2)} RUB
              </div>
            </div>

            {/* Rating */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Account Rating
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {(profile?.rating || config?.rating || 96) >= 90 ? 'Healthy Tier' : 'Action Needed'}
                </span>
              </div>
              <div className="text-2xl font-black font-mono text-emerald-600 flex items-baseline gap-1">
                <span>{profile?.rating || config?.rating || 96}</span>
                <span className="text-xs text-slate-400 font-medium">/ 96 max</span>
              </div>
              {/* Rating bar */}
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (((profile?.rating || config?.rating || 96) / 96) * 100))}%` }}
                />
              </div>
            </div>

            {/* Vendor & Identity */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-2xs space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Account Identity
              </span>
              <div className="text-sm font-bold text-slate-900 truncate">
                {profile?.email || config?.email || 'Authenticated User'}
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                Vendor: {profile?.vendor || config?.vendor || 'Standard'}
              </div>
            </div>

            {/* Default Region */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-2xs space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Default Configuration
              </span>
              <div className="text-sm font-bold text-slate-900 capitalize">
                {profile?.default_country?.name || config?.defaultCountry?.name || 'Any Country'}
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                Prefix: {profile?.default_country?.prefix || config?.defaultCountry?.prefix || 'Global'}
              </div>
            </div>
          </div>

          {/* Rating Mechanics Guide (Part 1.4) */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 text-slate-900">
              <Info className="w-5 h-5 text-sky-600" />
              <h2 className="text-sm font-black uppercase tracking-wider">
                5SIM Official Rating & Request Rules (Part 1.3 & 1.4)
              </h2>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Your 5SIM rating directly dictates your account capacity and order speed. If rating drops to 0, ordering is suspended for 24 hours. Follow these automated rules to maintain a score of 96:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3.5 bg-emerald-50/70 border border-emerald-100 rounded-2xl space-y-1">
                <span className="text-xs font-bold text-emerald-900 block">Account Replenishment</span>
                <span className="text-lg font-black font-mono text-emerald-700">+8.0 points</span>
                <p className="text-[11px] text-emerald-800">Depositing funds automatically boosts your rating score.</p>
              </div>

              <div className="p-3.5 bg-sky-50/70 border border-sky-100 rounded-2xl space-y-1">
                <span className="text-xs font-bold text-sky-900 block">Quick SMS Completion</span>
                <span className="text-lg font-black font-mono text-sky-700">+0.5 points</span>
                <p className="text-[11px] text-sky-800">
                  Marking order "finished" immediately after receiving verification code awards rating boost.
                </p>
              </div>

              <div className="p-3.5 bg-rose-50/70 border border-rose-100 rounded-2xl space-y-1">
                <span className="text-xs font-bold text-rose-900 block">Order Timeout Penalty</span>
                <span className="text-lg font-black font-mono text-rose-700">-0.15 points</span>
                <p className="text-[11px] text-rose-800">
                  Never let orders expire without action! Cancel unused numbers (-0.1 is better than timeout -0.15).
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-600 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>Safe Polling Safeguard:</strong> Built-in rate limiter ensures all backend requests remain comfortably below the <strong>100 req/sec limit</strong>, preventing the 10-minute ban penalty.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: PRICE LIMITS (PART 3) */}
      {/* ========================================================================= */}
      {activeTab === 'max-prices' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-slate-200 shadow-2xs">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Maximum Price Ceilings (Part 3)</h2>
              <p className="text-xs text-slate-500">
                Fix maximum purchase prices for services when using the "any" operator to avoid purchasing overpriced numbers.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => loadMaxPrices('live')}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Fetch Live from 5SIM</span>
              </button>

              <button
                type="button"
                onClick={() => setIsAddPriceOpen(true)}
                className="px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Price Limit</span>
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-2xs">
            {maxPrices.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <Sliders className="w-10 h-10 text-slate-300 mx-auto" />
                <h3 className="font-bold text-slate-900 text-sm">No Price Limits Configured</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Click "Add Price Limit" to set a maximum price for products like WhatsApp, Telegram, or Facebook.
                </p>
                <button
                  type="button"
                  onClick={() => setIsAddPriceOpen(true)}
                  className="px-3.5 py-1.5 bg-sky-50 text-sky-700 border border-sky-200 text-xs font-bold rounded-xl"
                >
                  Set First Limit
                </button>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-bold uppercase text-[10px]">
                    <th className="py-3 px-4">Product Name</th>
                    <th className="py-3 px-4">Max Price (RUB)</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {maxPrices.map((item) => (
                    <tr key={item.product} className="hover:bg-slate-50/60">
                      <td className="py-3 px-4 font-bold text-slate-900 capitalize">{item.product}</td>
                      <td className="py-3 px-4 font-mono font-bold text-sky-700">{item.price.toFixed(2)} RUB</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Active Ceiling
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteMaxPrice(item.product)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          title="Remove limit"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: PAYMENTS (PART 2.3) */}
      {/* ========================================================================= */}
      {activeTab === 'payments' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-3xl border border-slate-200 shadow-2xs">
            <div>
              <h2 className="text-sm font-bold text-slate-900">5SIM Payments & Replenishment History</h2>
              <p className="text-xs text-slate-500">Official ledger of balance charges and deposits made to 5SIM.net.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setPaymentSource('live');
                loadPayments('live');
              }}
              className="px-3.5 py-2 bg-sky-50 text-sky-700 border border-sky-200 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-sky-100"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Fetch Live from 5SIM</span>
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-2xs">
            {payments.length === 0 ? (
              <div className="p-12 text-center space-y-2 text-slate-500 text-xs">
                <DollarSign className="w-8 h-8 text-slate-300 mx-auto" />
                <p>No payment history records found.</p>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-bold uppercase text-[10px]">
                    <th className="py-3 px-4">Payment ID</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Provider</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Balance After</th>
                    <th className="py-3 px-4">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map((p) => (
                    <tr key={p.ID} className="hover:bg-slate-50/60">
                      <td className="py-3 px-4 font-mono font-bold text-slate-700">#{p.ID}</td>
                      <td className="py-3 px-4 capitalize font-semibold">{p.TypeName}</td>
                      <td className="py-3 px-4 uppercase text-slate-500">{p.ProviderName || 'System'}</td>
                      <td className="py-3 px-4 font-mono font-bold text-emerald-700">+{p.Amount} RUB</td>
                      <td className="py-3 px-4 font-mono text-slate-900">{p.Balance} RUB</td>
                      <td className="py-3 px-4 text-slate-400">{p.CreatedAt?.slice(0, 16)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 7: CREDENTIALS SETTINGS (PART 1.2) */}
      {/* ========================================================================= */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs space-y-5">
          <div>
            <h2 className="text-sm font-bold text-slate-900">5SIM API Authentication Credentials (Part 1.2)</h2>
            <p className="text-xs text-slate-500">
              Configure your 5SIM token from 5sim.net settings. All requests use Bearer authentication and standard JSON headers.
            </p>
          </div>

          <div className="space-y-4 max-w-2xl">
            {/* API Base URL */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Official API Base URL</label>
              <input
                type="text"
                value={baseUrlInput}
                onChange={(e) => setBaseUrlInput(e.target.value)}
                placeholder="https://5sim.net/v1"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
              />
            </div>

            {/* API Key */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">5SIM API Token (Bearer)</label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="Paste your 5SIM API token here..."
                  className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                Found under 5sim.net → Profile / Account Settings → API Key. Never expose this key publicly.
              </p>
            </div>

            <div className="pt-2 flex items-center gap-3">
              <button
                type="submit"
                disabled={isSavingSettings}
                className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition shadow-sm disabled:opacity-50"
              >
                {isSavingSettings ? 'Saving...' : 'Save Settings'}
              </button>

              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testingConnection}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${testingConnection ? 'animate-spin' : ''}`} />
                <span>Test Current Credentials</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: INSTANT BUY NUMBER MODAL (PART 5) */}
      {/* ========================================================================= */}
      {isBuyModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-sky-600" />
                <h3 className="text-base font-black text-slate-900">
                  Instant Virtual Number Purchase (Part 5)
                </h3>
              </div>
              <button onClick={() => setIsBuyModalOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold text-lg">
                ×
              </button>
            </div>

            {/* Buy Mode Selector */}
            <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-2xl">
              <button
                type="button"
                onClick={() => setBuyType('activation')}
                className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition ${
                  buyType === 'activation' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                }`}
              >
                Activation (OTP)
              </button>
              <button
                type="button"
                onClick={() => setBuyType('hosting')}
                className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition ${
                  buyType === 'hosting' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                }`}
              >
                Hosting (Rental)
              </button>
              <button
                type="button"
                onClick={() => setBuyType('reuse')}
                className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition ${
                  buyType === 'reuse' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                }`}
              >
                Reuse (Re-Buy)
              </button>
            </div>

            <form onSubmit={handleExecutePurchase} className="space-y-4">
              {buyType === 'reuse' ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Previous Phone Number to Re-buy</label>
                    <input
                      type="text"
                      value={reusePhoneInput}
                      onChange={(e) => setReusePhoneInput(e.target.value)}
                      placeholder="+447812345678"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500/20"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Target Product / Service</label>
                    <input
                      type="text"
                      value={buyProduct}
                      onChange={(e) => setBuyProduct(e.target.value.toLowerCase())}
                      placeholder="whatsapp"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500/20"
                      required
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Country */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Country / Region</label>
                    <select
                      value={buyCountry}
                      onChange={(e) => setBuyCountry(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500/20"
                    >
                      {Object.keys(countriesMap).length > 0 ? (
                        Object.entries(countriesMap).map(([slug, data]) => (
                          <option key={slug} value={slug}>
                            {data?.text_en || slug}
                          </option>
                        ))
                      ) : (
                        popularCountries.map((c) => (
                          <option key={c.slug} value={c.slug}>
                            {c.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  {/* Product */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Service / Application</label>
                    <input
                      type="text"
                      value={buyProduct}
                      onChange={(e) => setBuyProduct(e.target.value.toLowerCase())}
                      placeholder="e.g. whatsapp, telegram, google"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500/20"
                      required
                    />
                  </div>

                  {/* Operator */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700">Telecom Carrier / Operator</label>
                      <span className="text-[10px] text-slate-400">Leave "any" for auto-selection</span>
                    </div>
                    <input
                      type="text"
                      value={buyOperator}
                      onChange={(e) => setBuyOperator(e.target.value.toLowerCase())}
                      placeholder="any"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500/20"
                    />
                  </div>

                  {buyType === 'activation' && (
                    <>
                      {/* Optional Max Price Limit */}
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-700">
                          Max Price Limit (Optional, RUB)
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          value={buyMaxPrice}
                          onChange={(e) => setBuyMaxPrice(e.target.value)}
                          placeholder="e.g. 25.0 (leave blank for standard)"
                          className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500/20"
                        />
                      </div>

                      {/* Voice Code Checkbox */}
                      <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer pt-1">
                        <input
                          type="checkbox"
                          checked={buyVoice}
                          onChange={(e) => setBuyVoice(e.target.checked)}
                          className="rounded text-sky-600 focus:ring-sky-500 w-4 h-4"
                        />
                        <span>Enable Voice-call OTP verification support</span>
                      </label>
                    </>
                  )}
                </div>
              )}

              {/* Balance Check Notice */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between text-xs">
                <span className="text-slate-600">5SIM Balance:</span>
                <span className="font-mono font-bold text-slate-900">
                  {(profile?.balance || config?.balance || 0).toFixed(2)} RUB
                </span>
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsBuyModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isBuying}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Zap className={`w-3.5 h-3.5 ${isBuying ? 'animate-spin' : ''}`} />
                  <span>{isBuying ? 'Allocating Number...' : 'Confirm & Buy Number'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: ADD PRICE LIMIT MODAL (PART 3) */}
      {/* ========================================================================= */}
      {isAddPriceOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-sky-600" />
                Configure Service Max Price (Part 3)
              </h3>
              <button onClick={() => setIsAddPriceOpen(false)} className="text-slate-400 hover:text-slate-600">
                ×
              </button>
            </div>

            <form onSubmit={handleSetMaxPrice} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Product / Service Name</label>
                <input
                  type="text"
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  placeholder="e.g. whatsapp, telegram, facebook, google"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500/20"
                  required
                />
                {/* Popular presets */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  {['whatsapp', 'telegram', 'facebook', 'google', 'openai'].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setNewProductName(p)}
                      className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-sky-50 hover:text-sky-700 text-[10px] font-bold text-slate-600 transition"
                    >
                      +{p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Max Purchase Price (RUB)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={newPriceValue}
                  onChange={(e) => setNewPriceValue(parseFloat(e.target.value) || 0)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500/20"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddPriceOpen(false)}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPrice}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl transition shadow-sm disabled:opacity-50"
                >
                  {isSubmittingPrice ? 'Setting Limit...' : 'Save Price Limit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: HOSTING SMS INBOX MODAL */}
      {/* ========================================================================= */}
      {inboxModalOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Inbox className="w-5 h-5 text-sky-600" />
                <h3 className="text-sm font-black text-slate-900">
                  SMS Inbox for {inboxModalOrder.phone}
                </h3>
              </div>
              <button onClick={() => setInboxModalOrder(null)} className="text-slate-400 hover:text-slate-600 font-bold">
                ×
              </button>
            </div>

            {loadingInbox ? (
              <div className="p-8 text-center space-y-2">
                <RefreshCw className="w-6 h-6 text-sky-600 animate-spin mx-auto" />
                <p className="text-xs text-slate-500">Loading inbox messages...</p>
              </div>
            ) : inboxMessages.length === 0 ? (
              <div className="p-8 text-center space-y-1 text-slate-500 text-xs">
                <Inbox className="w-8 h-8 text-slate-300 mx-auto" />
                <p>No messages received on this line yet.</p>
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto space-y-2">
                {inboxMessages.map((msg) => (
                  <div key={msg.ID} className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                      <span className="font-bold text-slate-700">{msg.sender}</span>
                      <span>{msg.date || msg.created_at}</span>
                    </div>
                    {msg.code && (
                      <div className="font-mono font-bold text-emerald-700 text-base">
                        Code: {msg.code}
                      </div>
                    )}
                    <p className="text-xs text-slate-800 font-mono">{msg.text}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setInboxModalOrder(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
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
