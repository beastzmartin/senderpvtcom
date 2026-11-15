import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import {
  VirtualNumberCountry,
  VirtualNumberItem,
  VirtualNumberRental,
  VirtualNumberOrder,
  VirtualNumberMessage,
  VirtualNumberCall,
  VirtualNumberAnalytics
} from '../../types';
import { PurchaseNumberModal } from './PurchaseNumberModal';
import { WalletTopUpModal } from '../marketplace/WalletTopUpModal';
import {
  Phone,
  Compass,
  Smartphone,
  History,
  RefreshCw,
  BarChart3,
  MessageSquare,
  PhoneCall,
  Settings,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
  Wallet,
  Plus,
  ShieldCheck,
  ChevronRight,
  ArrowRight,
  ExternalLink,
  Trash2,
  SlidersHorizontal,
  Mail,
  Check,
  Globe
} from 'lucide-react';

export type VirtualNumberTab =
  | 'explore'
  | 'my-numbers'
  | 'purchases'
  | 'renewals'
  | 'usage'
  | 'messages'
  | 'calls'
  | 'settings';

interface VirtualNumbersViewProps {
  initialTab?: VirtualNumberTab;
  onNavigateToWallet?: () => void;
}

export const VirtualNumbersView: React.FC<VirtualNumbersViewProps> = ({
  initialTab = 'explore',
  onNavigateToWallet
}) => {
  const [activeTab, setActiveTab] = useState<VirtualNumberTab>(initialTab);

  // Data states
  const [countries, setCountries] = useState<VirtualNumberCountry[]>([]);
  const [availableNumbers, setAvailableNumbers] = useState<VirtualNumberItem[]>([]);
  const [myRentals, setMyRentals] = useState<VirtualNumberRental[]>([]);
  const [orders, setOrders] = useState<VirtualNumberOrder[]>([]);
  const [messages, setMessages] = useState<VirtualNumberMessage[]>([]);
  const [calls, setCalls] = useState<VirtualNumberCall[]>([]);
  const [analytics, setAnalytics] = useState<VirtualNumberAnalytics | null>(null);

  // Filter & Search states
  const [selectedCountry, setSelectedCountry] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [filterWhatsappOnly, setFilterWhatsappOnly] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Modals
  const [selectedNumberForPurchase, setSelectedNumberForPurchase] = useState<VirtualNumberItem | null>(null);
  const [isTopUpOpen, setIsTopUpOpen] = useState<boolean>(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const [actionErrorMsg, setActionErrorMsg] = useState<string | null>(null);

  // Load initial data
  useEffect(() => {
    loadCountries();
    loadAnalytics();
    loadRentals();
  }, []);

  // When search/filter changes on Explore tab
  useEffect(() => {
    if (activeTab === 'explore') {
      searchInventory();
    } else if (activeTab === 'my-numbers' || activeTab === 'renewals') {
      loadRentals();
    } else if (activeTab === 'purchases') {
      loadOrders();
    } else if (activeTab === 'messages') {
      loadMessages();
    } else if (activeTab === 'calls') {
      loadCalls();
    }
  }, [activeTab, selectedCountry, selectedType, filterWhatsappOnly]);

  const loadCountries = async () => {
    try {
      const res = await api.virtualNumbers.getCountries();
      if (res && res.countries) setCountries(res.countries);
    } catch {}
  };

  const loadAnalytics = async () => {
    try {
      const res = await api.virtualNumbers.getAnalytics();
      if (res && res.analytics) setAnalytics(res.analytics);
    } catch {}
  };

  const searchInventory = async () => {
    setIsLoading(true);
    try {
      const res = await api.virtualNumbers.searchNumbers({
        country: selectedCountry !== 'all' ? selectedCountry : undefined,
        type: selectedType !== 'all' ? selectedType : undefined,
        whatsapp: filterWhatsappOnly,
        search: searchQuery || undefined,
        limit: 30
      });
      if (res && res.numbers) setAvailableNumbers(res.numbers);
    } catch (err: any) {
      setActionErrorMsg(err.message || 'Failed to search virtual numbers.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadRentals = async () => {
    try {
      const res = await api.virtualNumbers.getMyRentals();
      if (res && res.rentals) setMyRentals(res.rentals);
    } catch {}
  };

  const loadOrders = async () => {
    try {
      const res = await api.virtualNumbers.getOrderHistory();
      if (res && res.orders) setOrders(res.orders);
    } catch {}
  };

  const loadMessages = async () => {
    try {
      const res = await api.virtualNumbers.getMessages();
      if (res && res.messages) setMessages(res.messages);
    } catch {}
  };

  const loadCalls = async () => {
    try {
      const res = await api.virtualNumbers.getCallLogs();
      if (res && res.calls) setCalls(res.calls);
    } catch {}
  };

  const handleToggleAutoRenew = async (rentalId: string, currentVal: boolean) => {
    try {
      await api.virtualNumbers.toggleAutoRenew(rentalId, !currentVal);
      setMyRentals((prev) =>
        prev.map((r) => (r.id === rentalId ? { ...r, autoRenew: !currentVal } : r))
      );
      showNotification(`Auto-renewal ${!currentVal ? 'enabled' : 'disabled'} successfully.`);
    } catch (err: any) {
      setActionErrorMsg(err.message || 'Failed to update auto-renewal.');
    }
  };

  const handleRenewNumber = async (rentalId: string) => {
    try {
      const res = await api.virtualNumbers.renewRental(rentalId, 30);
      if (res && res.success) {
        showNotification(`Virtual number successfully renewed for 30 days! Charged ₹${res.charged}`);
        loadRentals();
        loadAnalytics();
      }
    } catch (err: any) {
      setActionErrorMsg(err.message || 'Renewal failed. Check wallet balance.');
    }
  };

  const handleReleaseNumber = async (rentalId: string, phone: string) => {
    if (!window.confirm(`Are you sure you want to release virtual number ${phone}? This number will be returned to the provider pool.`)) {
      return;
    }
    try {
      await api.virtualNumbers.releaseRental(rentalId);
      showNotification(`Virtual number ${phone} released successfully.`);
      loadRentals();
      loadAnalytics();
    } catch (err: any) {
      setActionErrorMsg(err.message || 'Failed to release number.');
    }
  };

  const showNotification = (msg: string) => {
    setActionSuccessMsg(msg);
    setTimeout(() => setActionSuccessMsg(null), 4000);
  };

  const walletBalance = analytics?.walletBalance || 0.0;

  return (
    <div className="space-y-6">
      {/* Top Banner / Marketplace Header */}
      <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <Compass className="w-3.5 h-3.5" />
              Virtual Numbers Marketplace
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Telecom-Grade Virtual Phone Numbers
            </h1>
            <p className="text-xs sm:text-sm text-emerald-100/80 leading-relaxed">
              Browse, purchase, and manage dedicated virtual numbers worldwide. Built-in SMS inbox, voice management, verified WhatsApp compatibility, and automated wallet renewals.
            </p>
          </div>

          {/* Central Wallet Ribbon */}
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 shrink-0 flex items-center justify-between md:flex-col md:items-end gap-3 min-w-[200px]">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/30 flex items-center justify-center text-emerald-300">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-emerald-200 uppercase tracking-wider block">
                  Platform Wallet
                </span>
                <span className="text-lg font-bold font-mono text-white">
                  ₹{walletBalance.toFixed(2)}
                </span>
              </div>
            </div>

            <button
              onClick={() => setIsTopUpOpen(true)}
              className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Balance</span>
            </button>
          </div>
        </div>

        {/* Global Notifications */}
        {actionSuccessMsg && (
          <div className="mt-4 p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-xs font-bold text-emerald-200 flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{actionSuccessMsg}</span>
          </div>
        )}
        {actionErrorMsg && (
          <div className="mt-4 p-3 bg-red-500/20 border border-red-500/40 rounded-xl text-xs font-bold text-red-200 flex items-center gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <span>{actionErrorMsg}</span>
          </div>
        )}
      </div>

      {/* Primary Navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 pb-1 overflow-x-auto scrollbar-none select-none">
        {[
          { id: 'explore' as VirtualNumberTab, label: 'Explore Numbers', icon: Compass, count: availableNumbers.length },
          { id: 'my-numbers' as VirtualNumberTab, label: 'My Numbers', icon: Smartphone, count: myRentals.filter((r) => r.status === 'active').length },
          { id: 'messages' as VirtualNumberTab, label: 'SMS Inbox', icon: MessageSquare, count: messages.filter((m) => m.is_read === 0).length },
          { id: 'calls' as VirtualNumberTab, label: 'Voice Calls', icon: PhoneCall },
          { id: 'purchases' as VirtualNumberTab, label: 'Purchase History', icon: History },
          { id: 'renewals' as VirtualNumberTab, label: 'Renewals', icon: RefreshCw, badge: myRentals.filter((r) => r.isExpiringSoon).length > 0 ? `${myRentals.filter((r) => r.isExpiringSoon).length} Due` : undefined },
          { id: 'usage' as VirtualNumberTab, label: 'Usage & Charges', icon: BarChart3 }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                isActive
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.badge && (
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-extrabold bg-amber-400 text-slate-950 uppercase">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: EXPLORE NUMBERS */}
      {activeTab === 'explore' && (
        <div className="space-y-6">
          {/* Country Selection Chips */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Select Country
              </span>
              <span className="text-xs text-slate-400 font-medium">
                {countries.length} Regions Available
              </span>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
              <button
                type="button"
                onClick={() => setSelectedCountry('all')}
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition shrink-0 flex items-center gap-1.5 ${
                  selectedCountry === 'all'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span>🌐 All Countries</span>
              </button>

              {countries.map((c) => (
                <button
                  key={c.iso_code}
                  type="button"
                  onClick={() => setSelectedCountry(c.iso_code)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border transition shrink-0 flex items-center gap-1.5 ${
                    selectedCountry === c.iso_code
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="text-sm">{c.flag_emoji}</span>
                  <span>{c.name}</span>
                  <span className="text-[10px] text-slate-400 font-mono">({c.dial_code})</span>
                  {c.available_count > 0 && (
                    <span className="px-1 py-0.2 rounded bg-slate-100 text-slate-600 text-[9px] font-extrabold">
                      {c.available_count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
            <div className="flex-1 min-w-[240px] relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchInventory()}
                placeholder="Search by number digits or country code (e.g. +1202, 555)..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Type filter */}
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
              >
                <option value="all">All Number Types</option>
                <option value="mobile">Mobile Numbers</option>
                <option value="toll_free">Toll-Free Numbers</option>
                <option value="geographic">Geographic Lines</option>
                <option value="dedicated">Dedicated Private</option>
              </select>

              {/* WhatsApp Compatibility Filter */}
              <label className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 transition select-none">
                <input
                  type="checkbox"
                  checked={filterWhatsappOnly}
                  onChange={(e) => setFilterWhatsappOnly(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span>WhatsApp Compatible</span>
              </label>

              <button
                onClick={searchInventory}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5"
              >
                <Filter className="w-3.5 h-3.5" />
                <span>Filter</span>
              </button>
            </div>
          </div>

          {/* Numbers Grid */}
          {isLoading ? (
            <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center text-slate-500 flex flex-col items-center justify-center">
              <RefreshCw className="w-8 h-8 animate-spin text-emerald-600 mb-3" />
              <span className="text-sm font-semibold">Scanning available virtual numbers pool...</span>
            </div>
          ) : availableNumbers.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Phone className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-slate-900 text-base">No Virtual Numbers Matching Criteria</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Try selecting "All Countries" or clearing the WhatsApp filter to view all current inventory.
              </p>
              <button
                onClick={() => {
                  setSelectedCountry('all');
                  setSelectedType('all');
                  setFilterWhatsappOnly(false);
                  setSearchQuery('');
                }}
                className="px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-xl"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {availableNumbers.map((num) => (
                <div
                  key={num.id}
                  className="bg-white border border-slate-200 hover:border-emerald-300 rounded-2xl p-5 shadow-2xs hover:shadow-md transition flex flex-col justify-between space-y-4 group"
                >
                  <div>
                    {/* Country & Type Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl select-none">{num.flagEmoji}</span>
                        <div>
                          <span className="font-bold text-xs text-slate-900 block">{num.countryName}</span>
                          <span className="text-[10px] text-slate-400 font-mono">Calling Code {num.dialCode}</span>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-slate-100 text-slate-700">
                        {num.numberType}
                      </span>
                    </div>

                    {/* Phone Number Display */}
                    <div className="mt-3.5 p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-emerald-600" />
                        <span className="text-base font-bold font-mono text-slate-900 tracking-tight">
                          {num.phoneNumber}
                        </span>
                      </div>
                      <span className="w-2 h-2 rounded-full bg-emerald-500" title="Available for immediate allocation" />
                    </div>

                    {/* Supported Capabilities */}
                    <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                      {num.capabilities.includes('sms') && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200 flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" /> SMS
                        </span>
                      )}
                      {num.capabilities.includes('voice') && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                          <PhoneCall className="w-3 h-3" /> Voice
                        </span>
                      )}
                      {num.whatsappCompatible && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-teal-50 text-teal-800 border border-teal-200 flex items-center gap-1">
                          ✓ WhatsApp Ready
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Pricing and Action */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold uppercase">Monthly Rental</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-lg font-bold font-mono text-slate-900">
                          ₹{num.pricing.monthlyPrice.toFixed(0)}
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium">/ mo</span>
                      </div>
                      <span className="text-[10px] text-slate-400 block">
                        +₹{num.pricing.activationFee.toFixed(0)} setup
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedNumberForPurchase(num)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow-sm group-hover:scale-102 flex items-center gap-1.5"
                    >
                      <span>Buy Number</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MY NUMBERS (Active Rentals) */}
      {activeTab === 'my-numbers' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Active Virtual Numbers</h2>
            <button
              onClick={() => setActiveTab('explore')}
              className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-1 hover:bg-emerald-100 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Purchase Another Number</span>
            </button>
          </div>

          {myRentals.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                <Smartphone className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-slate-900 text-base">You Don't Have Any Active Virtual Numbers</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Explore available country numbers and activate your first dedicated virtual line today.
              </p>
              <button
                onClick={() => setActiveTab('explore')}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition"
              >
                Browse Virtual Numbers
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {myRentals.map((r) => (
                <div
                  key={r.id}
                  className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{r.flagEmoji}</span>
                        <div>
                          <span className="font-bold text-xs text-slate-900 block">{r.countryName}</span>
                          <span className="text-[10px] text-slate-400 font-mono uppercase">{r.numberType}</span>
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                          r.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : r.status === 'renewal_due'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {r.status}
                      </span>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-emerald-600" />
                        <span className="font-bold font-mono text-base text-slate-900">
                          {r.phoneNumber}
                        </span>
                      </div>
                      <span className="text-[11px] font-bold text-slate-500 font-mono">
                        {r.daysRemaining} days left
                      </span>
                    </div>

                    {/* Expiry and Renewal Info */}
                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 bg-slate-50/60 p-2.5 rounded-xl border border-slate-100">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Expires On</span>
                        <span className="font-medium text-slate-700">{r.expiresAt.slice(0, 10)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Renewal Fee</span>
                        <span className="font-bold text-slate-900 font-mono">₹{r.renewalPrice.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions & Auto-Renew Toggle */}
                  <div className="pt-3 border-t border-slate-100 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 font-semibold">Automatic Renewal:</span>
                      <button
                        type="button"
                        onClick={() => handleToggleAutoRenew(r.id, r.autoRenew)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                          r.autoRenew
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {r.autoRenew ? '✓ Enabled' : 'Disabled'}
                      </button>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('messages');
                        }}
                        className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-sky-600" />
                        <span>SMS Messages</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRenewNumber(r.id)}
                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1 shadow-xs"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Renew Now</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleReleaseNumber(r.id, r.phoneNumber)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition"
                        title="Release virtual number"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SMS INBOX */}
      {activeTab === 'messages' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Virtual Number SMS Inbox</h2>
              <p className="text-xs text-slate-500">Incoming text messages and verification codes received on your active virtual numbers.</p>
            </div>
            <button
              onClick={loadMessages}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition"
              title="Refresh messages"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {messages.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Mail className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs text-slate-500">No incoming messages received yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200 hover:border-slate-300 transition space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-slate-900 font-mono">From: {m.sender}</span>
                      <span className="text-slate-400">→</span>
                      <span className="font-bold text-emerald-700 font-mono">{m.phone_number}</span>
                    </div>
                    <span className="text-[11px] text-slate-400">{m.received_at}</span>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-slate-100 text-xs font-mono text-slate-800 leading-relaxed select-all">
                    {m.message_content}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: VOICE CALLS */}
      {activeTab === 'calls' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Voice Call Records</h2>
              <p className="text-xs text-slate-500">Call records and duration metrics for your virtual lines.</p>
            </div>
            <button
              onClick={loadCalls}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {calls.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <PhoneCall className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs text-slate-500">No voice call records found.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {calls.map((c) => (
                <div key={c.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                      <PhoneCall className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-slate-900 font-mono">{c.caller_number}</span>
                      <span className="text-[10px] text-slate-400 block">{c.direction} • {c.duration_seconds}s</span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700">
                    {c.call_status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: PURCHASE HISTORY */}
      {activeTab === 'purchases' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">Purchase & Order History</h2>

          {orders.length === 0 ? (
            <div className="py-12 text-center space-y-2 text-slate-500 text-xs">
              <History className="w-8 h-8 text-slate-300 mx-auto" />
              <p>No past purchases recorded yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 uppercase text-[10px] font-bold">
                    <th className="py-3 px-2">Order ID</th>
                    <th className="py-3 px-2">Phone Number</th>
                    <th className="py-3 px-2">Duration</th>
                    <th className="py-3 px-2">Total Paid</th>
                    <th className="py-3 px-2">Status</th>
                    <th className="py-3 px-2">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-2 font-mono text-slate-500 text-[11px]">{o.id.slice(0, 14)}...</td>
                      <td className="py-3 px-2 font-bold font-mono text-slate-900">{o.phone_number}</td>
                      <td className="py-3 px-2 capitalize">{o.rental_duration} ({o.duration_days}d)</td>
                      <td className="py-3 px-2 font-bold font-mono text-emerald-700">₹{o.total_amount.toFixed(2)}</td>
                      <td className="py-3 px-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          o.status === 'allocated' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {o.status}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-slate-400">{o.created_at.slice(0, 16)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 6: USAGE & CHARGES */}
      {activeTab === 'usage' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400">Total Numbers Purchased</span>
            <div className="text-2xl font-bold font-mono text-slate-900">{analytics?.totalPurchased || 0}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400">Total Rental Expenditure</span>
            <div className="text-2xl font-bold font-mono text-emerald-700">₹{(analytics?.totalRentalExpenditure || 0).toFixed(2)}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400">Inbound SMS Messages</span>
            <div className="text-2xl font-bold font-mono text-sky-700">{analytics?.smsReceivedCount || 0}</div>
          </div>
        </div>
      )}

      {/* Purchase Confirmation Modal */}
      {selectedNumberForPurchase && (
        <PurchaseNumberModal
          numberItem={selectedNumberForPurchase}
          walletBalance={walletBalance}
          onClose={() => setSelectedNumberForPurchase(null)}
          onSuccess={(res) => {
            setSelectedNumberForPurchase(null);
            showNotification(res.message || 'Number successfully activated!');
            loadRentals();
            loadAnalytics();
            setActiveTab('my-numbers');
          }}
          onTopUpWallet={() => {
            setSelectedNumberForPurchase(null);
            setIsTopUpOpen(true);
          }}
        />
      )}

      {/* Central Wallet Top-Up Modal */}
      {isTopUpOpen && (
        <WalletTopUpModal
          isOpen={isTopUpOpen}
          currentBalance={walletBalance}
          onClose={() => setIsTopUpOpen(false)}
          onSuccess={() => {
            setIsTopUpOpen(false);
            loadAnalytics();
            showNotification('Wallet funds successfully topped up!');
          }}
        />
      )}
    </div>
  );
};
