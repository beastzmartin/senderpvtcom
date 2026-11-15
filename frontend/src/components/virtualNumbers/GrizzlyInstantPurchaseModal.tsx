import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import {
  Zap,
  Globe,
  Phone,
  Copy,
  Check,
  RefreshCw,
  Clock,
  AlertCircle,
  CheckCircle2,
  X,
  Wallet,
  ShieldCheck,
  ArrowRight,
  HelpCircle,
  Trash2
} from 'lucide-react';

interface GrizzlyInstantPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletBalance: number;
  onOpenTopUp?: () => void;
  onPurchaseSuccess?: () => void;
}

export const GrizzlyInstantPurchaseModal: React.FC<GrizzlyInstantPurchaseModalProps> = ({
  isOpen,
  onClose,
  walletBalance,
  onOpenTopUp,
  onPurchaseSuccess
}) => {
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [checkingSms, setCheckingSms] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Options from backend
  const [countries, setCountries] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);

  // Selection states
  const [selectedCountryId, setSelectedCountryId] = useState<string>('any');
  const [selectedServiceCode, setSelectedServiceCode] = useState<string>('tg');
  const [selectedLang, setSelectedLang] = useState<string>('eng');
  const [countrySearch, setCountrySearch] = useState<string>('');

  // Active Activation state (after purchase)
  const [activeActivation, setActiveActivation] = useState<{
    activationId: string;
    phoneNumber: string;
    serviceCode: string;
    serviceName: string;
    countryName: string;
    sellingPrice: number;
    status: string;
    expiresAt?: string;
    smsCode?: string;
    smsText?: string;
    verificationType?: number;
    smsHistory?: any[];
    canGetAnotherSms?: boolean;
  } | null>(null);

  // Provider comparison state
  const [comparison, setComparison] = useState<{
    overallPrice: number;
    overallQuantity: number;
    isStale: boolean;
    providers: any[];
  } | null>(null);

  const [timeLeft, setTimeLeft] = useState<number>(20 * 60); // 20 minutes in seconds

  // Load countries, services, and dynamic pricing
  const loadOptions = async () => {
    try {
      setLoadingOptions(true);
      setError(null);
      const res = await api.virtualNumbers.grizzlyCustomer.getOptions();
      if (res.success) {
        setCountries(res.countries || []);
        setServices(res.services || []);
        if (res.services && res.services.length > 0) {
          setSelectedServiceCode(res.services[0].provider_service_code);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load services and country catalog.');
    } finally {
      setLoadingOptions(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadOptions();
      setError(null);
    } else {
      setActiveActivation(null);
    }
  }, [isOpen]);

  // Selected Service and Price details
  const selectedService = services.find((s) => s.provider_service_code === selectedServiceCode) || services[0];
  const displayedPrice = selectedService?.sellingPrice || 23.75;

  // Load provider comparison when service / country changes
  useEffect(() => {
    if (!isOpen || !selectedServiceCode) return;
    api.virtualNumbers.grizzlyCustomer.getProviderComparison({
      country: selectedCountryId === 'any' ? undefined : selectedCountryId,
      service: selectedServiceCode
    }).then((res) => {
      if (res.success && res.comparison) {
        setComparison(res.comparison);
      }
    }).catch(() => {});
  }, [isOpen, selectedCountryId, selectedServiceCode]);

  // Countdown timer for active activation
  useEffect(() => {
    if (!activeActivation) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [activeActivation]);

  // Auto-polling for SMS verification code using V2 endpoint
  useEffect(() => {
    if (!activeActivation || timeLeft <= 0) return;

    const pollInterval = setInterval(async () => {
      try {
        const res = await api.virtualNumbers.grizzlyCustomer.checkSmsV2(activeActivation.activationId);
        if (res.success && res.hasSms && res.code) {
          setActiveActivation((prev) => (prev ? {
            ...prev,
            smsCode: res.code,
            smsText: res.text,
            verificationType: res.verificationType,
            smsHistory: res.smsHistory,
            canGetAnotherSms: res.canGetAnotherSms,
            status: 'COMPLETED'
          } : null));
        }
      } catch {}
    }, 3500);

    return () => clearInterval(pollInterval);
  }, [activeActivation?.activationId, timeLeft]);

  // Buy Number Action
  const handleBuyNumber = async () => {
    if (walletBalance < displayedPrice) {
      setError(`Insufficient wallet balance. You have ₹${walletBalance.toFixed(2)}, required ₹${displayedPrice.toFixed(2)}.`);
      return;
    }

    try {
      setPurchasing(true);
      setError(null);

      const idempotencyKey = `pur_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      const res = await api.virtualNumbers.grizzlyCustomer.purchaseNumber({
        service: selectedServiceCode,
        country: selectedCountryId === 'any' ? undefined : selectedCountryId,
        idempotencyKey
      });

      if (res.success && res.activationId && res.phoneNumber) {
        setActiveActivation({
          activationId: res.activationId,
          phoneNumber: res.phoneNumber,
          serviceCode: res.serviceCode || selectedServiceCode,
          serviceName: res.serviceName || selectedService?.display_name || 'Service',
          countryName: res.countryName || 'Selected Region',
          sellingPrice: res.sellingPrice || displayedPrice,
          status: res.status || 'NUMBER_ASSIGNED',
          expiresAt: res.expiresAt,
          smsHistory: [],
          canGetAnotherSms: true
        });
        setTimeLeft(20 * 60);
        if (onPurchaseSuccess) onPurchaseSuccess();
      } else {
        throw new Error(res.message || 'Number purchase was declined by provider.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to purchase number. Your wallet was NOT charged.');
    } finally {
      setPurchasing(false);
    }
  };

  // Manual Check SMS button using V2
  const handleManualCheckSms = async () => {
    if (!activeActivation) return;
    try {
      setCheckingSms(true);
      const res = await api.virtualNumbers.grizzlyCustomer.checkSmsV2(activeActivation.activationId);
      if (res.success && res.hasSms && res.code) {
        setActiveActivation({
          ...activeActivation,
          smsCode: res.code,
          smsText: res.text,
          verificationType: res.verificationType,
          smsHistory: res.smsHistory,
          canGetAnotherSms: res.canGetAnotherSms,
          status: 'COMPLETED'
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to check SMS status.');
    } finally {
      setCheckingSms(false);
    }
  };

  // Cancel & Refund
  const handleCancelActivation = async () => {
    if (!activeActivation) return;
    if (!confirm('Are you sure you want to cancel this number? Your wallet balance will be refunded immediately.')) {
      return;
    }
    try {
      setCancelling(true);
      const res = await api.virtualNumbers.grizzlyCustomer.cancelActivation(activeActivation.activationId);
      if (res.success) {
        alert(res.message || 'Activation cancelled and wallet refunded.');
        setActiveActivation(null);
        onClose();
        if (onPurchaseSuccess) onPurchaseSuccess();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to cancel activation.');
    } finally {
      setCancelling(false);
    }
  };

  const copyToClipboard = (text: string, isCode = false) => {
    navigator.clipboard.writeText(text);
    if (isCode) {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } else {
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 2000);
    }
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200 relative overflow-hidden">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-5 top-5 p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {!activeActivation ? (
          /* STEP 1: PURCHASE SELECTION */
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Instant Virtual Number</h3>
                <p className="text-xs text-slate-500">
                  Instant SMS verification powered by GrizzlySMS API.
                </p>
              </div>
            </div>

            {error && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold rounded-2xl flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {loadingOptions ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin text-purple-600" />
                <span className="text-xs font-medium">Fetching real-time country & service availability...</span>
              </div>
            ) : (
              <div className="space-y-4">
                {/* 1. Country Selection */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-slate-400" />
                      Select Country
                    </label>
                    <select
                      value={selectedLang}
                      onChange={(e) => setSelectedLang(e.target.value)}
                      className="text-[10px] font-bold text-slate-600 bg-slate-100 rounded-lg px-2 py-0.5 border-none cursor-pointer"
                    >
                      <option value="eng">English</option>
                      <option value="rus">Русский</option>
                      <option value="chn">中文</option>
                      <option value="tur">Türkçe</option>
                      <option value="spa">Español</option>
                      <option value="hin">हिन्दी</option>
                      <option value="ara">العربية</option>
                      <option value="fra">Français</option>
                    </select>
                  </div>

                  <input
                    type="text"
                    placeholder="Search country..."
                    value={countrySearch}
                    onChange={(e) => setCountrySearch(e.target.value)}
                    className="w-full text-xs px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg mb-2 focus:ring-2 focus:ring-purple-500"
                  />

                  <select
                    value={selectedCountryId}
                    onChange={(e) => setSelectedCountryId(e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500"
                  >
                    {countries
                      .filter((c) => {
                        if (!countrySearch) return true;
                        const q = countrySearch.toLowerCase();
                        return (
                          (c.country_name || '').toLowerCase().includes(q) ||
                          (c.eng || '').toLowerCase().includes(q) ||
                          (c.rus || '').toLowerCase().includes(q) ||
                          String(c.provider_country_id).includes(q)
                        );
                      })
                      .map((c) => {
                        const localizedName = c[selectedLang] || c.eng || c.country_name;
                        return (
                          <option key={String(c.provider_country_id)} value={String(c.provider_country_id)}>
                            {c.flag || '🌐'} {localizedName} {c.dial_code ? `(+${c.dial_code})` : ''}
                          </option>
                        );
                      })}
                  </select>
                </div>

                {/* 2. Service Selection Grid */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    Select Target Service / App
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1 bg-slate-50 border border-slate-200 rounded-2xl">
                    {services.map((s) => (
                      <button
                        type="button"
                        key={s.provider_service_code}
                        onClick={() => setSelectedServiceCode(s.provider_service_code)}
                        className={`p-2.5 rounded-xl text-left border transition flex items-center gap-2 ${
                          selectedServiceCode === s.provider_service_code
                            ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-purple-300'
                        }`}
                      >
                        <span className="text-lg">{s.icon || '💬'}</span>
                        <div className="truncate">
                          <p className="font-bold text-xs leading-tight truncate">{s.display_name}</p>
                          <p
                            className={`text-[10px] uppercase font-mono ${
                              selectedServiceCode === s.provider_service_code ? 'text-purple-200' : 'text-slate-400'
                            }`}
                          >
                            ₹{Number(s.sellingPrice || 23.75).toFixed(2)}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Live Provider Stock & Routes Info */}
                {comparison && comparison.overallQuantity > 0 && (
                  <div className="flex items-center justify-between text-[11px] text-slate-600 bg-purple-50/60 px-3.5 py-2 rounded-xl border border-purple-100">
                    <span className="flex items-center gap-1.5 font-medium">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Live Stock: <strong className="text-slate-800">{comparison.overallQuantity}</strong> numbers</span>
                    </span>
                    {comparison.providers.length > 0 && (
                      <span className="text-purple-700 font-semibold text-[10px] bg-purple-100/60 px-2 py-0.5 rounded-md">
                        {comparison.providers.length} provider route{comparison.providers.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                )}

                {/* 4. Pricing & Wallet Summary */}
                <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-100 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-purple-900 uppercase tracking-wider block">
                      Total Selling Price
                    </span>
                    <span className="text-xl font-black text-purple-700 font-mono">
                      ₹{Number(displayedPrice).toFixed(2)}
                    </span>
                    <span className="text-[10px] text-purple-600 block mt-0.5">
                      Includes 20 min SMS window + auto-refund if no code
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                      Wallet Balance
                    </span>
                    <span
                      className={`text-sm font-bold font-mono ${
                        walletBalance >= displayedPrice ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      ₹{walletBalance.toFixed(2)}
                    </span>
                    {walletBalance < displayedPrice && onOpenTopUp && (
                      <button
                        type="button"
                        onClick={onOpenTopUp}
                        className="text-[11px] font-bold text-indigo-600 hover:underline block mt-0.5"
                      >
                        + Top Up Wallet
                      </button>
                    )}
                  </div>
                </div>

                {/* Purchase Button */}
                <button
                  type="button"
                  onClick={handleBuyNumber}
                  disabled={purchasing || walletBalance < displayedPrice}
                  className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-purple-600/20 disabled:opacity-50"
                >
                  <Phone className="w-4 h-4" />
                  {purchasing
                    ? 'Reserving & Allocating Number...'
                    : `Buy Number (₹${Number(displayedPrice).toFixed(2)})`}
                </button>
              </div>
            )}
          </div>
        ) : (
          /* STEP 2: NUMBER ASSIGNED & LIVE SMS INBOX */
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Virtual Number Allocated</h3>
                  <p className="text-[11px] text-slate-400">
                    {activeActivation.serviceName} • {activeActivation.countryName}
                  </p>
                </div>
              </div>

              <div className="px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span>{formatTimer(timeLeft)}</span>
              </div>
            </div>

            {/* Assigned Phone Number Display */}
            <div className="bg-slate-900 text-white rounded-2xl p-5 text-center relative overflow-hidden shadow-xl">
              <span className="text-[10px] font-bold uppercase tracking-widest text-purple-400 block mb-1">
                Your Assigned Phone Number
              </span>
              <div className="text-2xl font-black font-mono tracking-wider text-emerald-400">
                {activeActivation.phoneNumber}
              </div>
              <div className="flex items-center justify-center gap-2 mt-3">
                <button
                  onClick={() => copyToClipboard(activeActivation.phoneNumber)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5"
                >
                  {copiedPhone ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedPhone ? 'Copied Number!' : 'Copy Phone Number'}
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-2 font-mono">
                Activation ID: #{activeActivation.activationId}
              </p>
            </div>

            {/* SMS Code Inbox Box */}
            <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-purple-600" />
                  SMS Verification Code
                </span>
                <button
                  onClick={handleManualCheckSms}
                  disabled={checkingSms || Boolean(activeActivation.smsCode)}
                  className="text-xs font-bold text-purple-600 hover:text-purple-700 flex items-center gap-1 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${checkingSms ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              {activeActivation.smsCode ? (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center space-y-2">
                  <span className="text-[11px] font-bold text-emerald-700 uppercase">Received Code</span>
                  <div className="text-3xl font-black font-mono text-emerald-600 tracking-widest">
                    {activeActivation.smsCode}
                  </div>
                  <button
                    onClick={() => copyToClipboard(activeActivation.smsCode || '', true)}
                    className="px-3.5 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-xl transition inline-flex items-center gap-1.5 shadow-sm"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedCode ? 'Copied Code!' : 'Copy Code'}
                  </button>
                </div>
              ) : (
                <div className="py-6 text-center space-y-2">
                  <div className="flex justify-center">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-600"></span>
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-slate-600">Waiting for incoming SMS from {activeActivation.serviceName}...</p>
                  <p className="text-[11px] text-slate-400">
                    Paste the phone number into the app now. The verification code will appear here automatically.
                  </p>
                </div>
              )}
              {activeActivation.smsHistory && activeActivation.smsHistory.length > 0 && (
                <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                    <span>SMS Message History ({activeActivation.smsHistory.length})</span>
                    {activeActivation.canGetAnotherSms && (
                      <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        ✓ Additional SMS Allowed
                      </span>
                    )}
                  </div>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {activeActivation.smsHistory.map((item, idx) => (
                      <div key={idx} className="bg-white p-2.5 rounded-xl border border-slate-200 text-left text-xs space-y-1 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                            Code: {item.code}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {item.receivedAt ? new Date(item.receivedAt).toLocaleTimeString() : ''}
                          </span>
                        </div>
                        {item.text && item.text !== item.code && (
                          <p className="text-[11px] text-slate-600 font-mono break-all">{item.text}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Actions: Done or Cancel/Refund */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              {!activeActivation.smsCode ? (
                <button
                  type="button"
                  onClick={handleCancelActivation}
                  disabled={cancelling}
                  className="text-xs font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {cancelling ? 'Cancelling...' : 'Cancel & Refund Wallet'}
                </button>
              ) : (
                <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                  <ShieldCheck className="w-4 h-4" />
                  Verification Completed
                </span>
              )}

              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

