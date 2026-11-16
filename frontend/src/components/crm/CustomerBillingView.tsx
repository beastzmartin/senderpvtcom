import React, { useState, useEffect } from 'react';
import {
  Wallet,
  Zap,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  Receipt,
  ShieldCheck,
  Tag,
  Clock,
  Layers,
  Sparkles,
  ExternalLink,
  RefreshCw,
  Plus,
  HelpCircle,
  FileText,
  Download,
  Search,
  Check,
  AlertCircle
} from 'lucide-react';
import { crmApi } from './crmApi';
import {
  Button,
  Badge,
  Input,
  StatCard,
  ProgressRing,
  Drawer,
  Modal,
  Skeleton,
  EmptyState
} from './ui/CrmDesignSystem';

export const CustomerBillingView: React.FC = () => {
  const [plans, setPlans] = useState<any[]>([]);
  const [addons, setAddons] = useState<any[]>([]);
  const [subscription, setSubscription] = useState<any | null>(null);
  const [usageCounters, setUsageCounters] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [wallet, setWallet] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  // Billing Cycle Toggle: monthly vs annual (20% off)
  const [isAnnual, setIsAnnual] = useState(false);

  // Checkout Drawer State
  const [checkoutPlan, setCheckoutPlan] = useState<any | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [couponValidating, setCouponValidating] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<any | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [autoRenew, setAutoRenew] = useState(true);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState<any | null>(null);

  // Addon Purchase Modal State
  const [selectedAddon, setSelectedAddon] = useState<any | null>(null);
  const [isPurchasingAddon, setIsPurchasingAddon] = useState(false);

  // Invoice Filters & Tab
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [activeHistoryTab, setActiveHistoryTab] = useState<'invoices' | 'ledger'>('invoices');
  const [ledgerTxs, setLedgerTxs] = useState<any[]>([]);

  useEffect(() => {
    loadBillingData();
  }, []);

  const loadBillingData = async () => {
    setLoading(true);
    try {
      const [plansRes, addonsRes, subRes, invRes, walletRes, txRes] = await Promise.all([
        crmApi.listBillingPlans(),
        crmApi.listBillingAddons(),
        crmApi.getActiveSubscription(),
        crmApi.listInvoices(),
        crmApi.getWallet().catch(() => null),
        crmApi.getWalletTransactions(30).catch(() => null)
      ]);

      if (plansRes && plansRes.success) setPlans(plansRes.plans || []);
      if (addonsRes && addonsRes.success) setAddons(addonsRes.addons || []);
      if (subRes && subRes.success) {
        setSubscription(subRes.subscription || null);
        setUsageCounters(subRes.usage || []);
      }
      if (invRes && invRes.success) setInvoices(invRes.invoices || []);
      if (walletRes && (walletRes.success || walletRes.wallet)) {
        setWallet(walletRes.wallet || walletRes);
      }
      if (txRes && (txRes.success || txRes.transactions)) {
        setLedgerTxs(txRes.transactions || []);
      }
    } catch (err) {
      console.error('Failed to load billing data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Helper to open checkout drawer
  const handleOpenCheckout = (plan: any) => {
    setCheckoutPlan(plan);
    setAppliedCoupon(null);
    setCouponCode('');
    setCouponError(null);
    setCheckoutSuccess(null);
  };

  // Live Coupon Validation
  const handleValidateCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponValidating(true);
    setCouponError(null);
    try {
      const res = await crmApi.checkCoupon(couponCode.trim());
      if (res && res.success && res.coupon) {
        setAppliedCoupon(res.coupon);
      } else {
        setCouponError('Coupon is invalid or expired.');
        setAppliedCoupon(null);
      }
    } catch (err: any) {
      setCouponError(err.message || 'Invalid coupon code');
      setAppliedCoupon(null);
    } finally {
      setCouponValidating(false);
    }
  };

  // Execute Subscription Purchase via Wallet
  const handleConfirmPurchase = async () => {
    if (!checkoutPlan) return;
    setIsSubscribing(true);
    try {
      const res = await crmApi.subscribeToPlan(
        checkoutPlan.id,
        appliedCoupon?.code,
        autoRenew
      );

      if (res && res.success) {
        setCheckoutSuccess(res);
        loadBillingData();
      }
    } catch (err: any) {
      if (err.code === 'INSUFFICIENT_WALLET_BALANCE' || err.status === 402) {
        alert(
          `Insufficient Wallet Balance!\n\n${err.message || 'Please top up your wallet to continue.'}`
        );
      } else if (err.code === 'PRICE_CHANGED' || err.status === 409) {
        alert(`Price updated: ${err.message}. Please review and try again.`);
      } else {
        alert(`Subscription failed: ${err.message}`);
      }
    } finally {
      setIsSubscribing(false);
    }
  };

  // Purchase Addon Pack
  const handleConfirmAddon = async () => {
    if (!selectedAddon) return;
    setIsPurchasingAddon(true);
    try {
      const res = await crmApi.purchaseAddon(selectedAddon.id);
      if (res && res.success) {
        alert(`Successfully purchased ${selectedAddon.name} via Wallet!`);
        setSelectedAddon(null);
        loadBillingData();
      }
    } catch (err: any) {
      alert(`Add-on purchase failed: ${err.message}`);
    } finally {
      setIsPurchasingAddon(false);
    }
  };

  // CSV Export for Invoices
  const exportInvoicesCsv = () => {
    if (invoices.length === 0) return;
    const headers = ['Invoice Number', 'Plan', 'Date', 'Amount USD', 'Charged Amount', 'Currency', 'Status', 'Tax GSTIN'];
    const rows = invoices.map((inv) => [
      inv.invoice_number,
      inv.plan_name,
      new Date(inv.created_at).toISOString().split('T')[0],
      inv.amount_usd,
      inv.amount_charged,
      inv.currency_charged,
      inv.status,
      inv.gstin
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `crm_invoices_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Calculated Pricing in Checkout Drawer
  const calculateCheckoutBreakdown = () => {
    if (!checkoutPlan) return null;
    let grossUsd = checkoutPlan.price_usd || 0;
    let discountUsd = 0;

    if (appliedCoupon) {
      if (appliedCoupon.discount_type === 'percent') {
        discountUsd = (grossUsd * appliedCoupon.discount_value) / 100;
      } else {
        discountUsd = Math.min(grossUsd, appliedCoupon.discount_value);
      }
    }

    const netTaxableUsd = Math.max(0, grossUsd - discountUsd);
    const taxRatePercent = 18.0;
    const taxAmountUsd = Number(((netTaxableUsd * taxRatePercent) / 100).toFixed(2));
    const totalAmountUsd = Number((netTaxableUsd + taxAmountUsd).toFixed(2));

    const userCurrency = wallet?.currency || 'USD';
    const rate = userCurrency === 'INR' ? 87.5 : 1.0;
    const totalInUserCurrency = Number((totalAmountUsd * rate).toFixed(2));

    const userBalance = Number(wallet?.balance || 0);
    const hasEnoughFunds = userBalance >= totalInUserCurrency;
    const shortfall = Math.max(0, Number((totalInUserCurrency - userBalance).toFixed(2)));
    const balanceAfter = Math.max(0, Number((userBalance - totalInUserCurrency).toFixed(2)));

    return {
      grossUsd,
      discountUsd,
      netTaxableUsd,
      taxRatePercent,
      taxAmountUsd,
      totalAmountUsd,
      userCurrency,
      totalInUserCurrency,
      userBalance,
      hasEnoughFunds,
      shortfall,
      balanceAfter
    };
  };

  const checkoutData = calculateCheckoutBreakdown();

  // Find Quotas
  const contactsQuota = usageCounters.find((c) => c.resource_type === 'contacts') || { used_count: 0, quota_limit: 1000 };
  const boardsQuota = usageCounters.find((c) => c.resource_type === 'boards') || { used_count: 0, quota_limit: 5 };
  const fieldsQuota = usageCounters.find((c) => c.resource_type === 'super_fields') || { used_count: 0, quota_limit: 20 };
  const tagsQuota = usageCounters.find((c) => c.resource_type === 'tags') || { used_count: 0, quota_limit: 50 };

  const activePlan = subscription?.plan || plans.find((p) => p.slug === 'free') || plans[0];
  const walletCurrency = wallet?.currency || 'INR';
  const sym = walletCurrency === 'INR' ? '₹' : walletCurrency === 'USD' ? '$' : walletCurrency + ' ';

  // Check if upcoming renewal is at risk
  const isExpiringSoon = subscription && subscription.ends_at && new Date(subscription.ends_at).getTime() - Date.now() < 7 * 24 * 3600 * 1000;
  const isLowBalanceWarning = isExpiringSoon && activePlan && activePlan.price_usd > 0 && (wallet?.balance || 0) < (activePlan.price_usd * (walletCurrency === 'INR' ? 87.5 : 1.0));

  if (loading) {
    return (
      <div className="p-8 space-y-6 max-w-7xl mx-auto">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto animate-in fade-in duration-200">
      {/* ========================================================================= */}
      {/* 1. TOP HEADER & WALLET NOTICE */}
      {/* ========================================================================= */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-slate-100 tracking-tight">Billing & Entitlements</h1>
            <Badge variant="indigo" size="sm" dot>
              Wallet-Only Settlement
            </Badge>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            All plans, add-ons, and renewals are settled atomically from your internal wallet balance with hard quota enforcement.
          </p>
        </div>

        {/* Global Wallet Summary Pill */}
        <div className="flex items-center gap-3 bg-slate-900/90 border border-slate-800 rounded-xl px-4 py-2.5 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-emerald-950/60 border border-emerald-800/50 flex items-center justify-center text-emerald-400">
            <Wallet className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Available Wallet</div>
            <div className="text-sm font-bold text-slate-100 font-mono tabular-nums">
              {sym}{Number(wallet?.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <a
            href="/wallet"
            className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300 hover:underline"
          >
            Add funds <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Low Balance Warning Banner */}
      {isLowBalanceWarning && (
        <div className="flex items-center justify-between p-4 rounded-xl bg-amber-950/30 border border-amber-800/50 text-amber-300 text-xs">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>
              <strong>Renewal Warning:</strong> Your subscription renews soon, but your wallet balance is below the required renewal amount. Please add funds to avoid service interruption.
            </span>
          </div>
          <a
            href="/wallet"
            className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-all text-xs"
          >
            Top Up Wallet
          </a>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. CURRENT PLAN HERO & LIVE QUOTA METERS */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Plan Card */}
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950/30 border border-slate-800 rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Current Plan</span>
              <Badge variant={subscription?.status === 'active' ? 'emerald' : 'amber'} size="sm" dot>
                {subscription?.status === 'active' ? 'Active' : subscription?.status || 'Active (Free)'}
              </Badge>
            </div>

            <div>
              <h2 className="text-3xl font-black text-slate-100 tracking-tight">{activePlan?.name || 'Starter Plan'}</h2>
              <p className="text-xs text-slate-400 mt-1">{activePlan?.description || 'Essential CRM features with zero credit card required'}</p>
            </div>

            <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>Expires: {subscription?.ends_at ? new Date(subscription.ends_at).toLocaleDateString() : 'Never (Free tier)'}</span>
              </div>
              {subscription?.auto_renew && (
                <span className="text-emerald-400 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Auto-Renew Enabled
                </span>
              )}
            </div>
          </div>

          <div className="mt-6 flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              icon={<RefreshCw className="w-3.5 h-3.5" />}
              onClick={loadBillingData}
            >
              Sync Quotas
            </Button>
          </div>
        </div>

        {/* Live Hard Quota Meters (2 cols) */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ProgressRing
            used={contactsQuota.used_count}
            limit={contactsQuota.quota_limit}
            label="Total Contacts Quota"
          />
          <ProgressRing
            used={boardsQuota.used_count}
            limit={boardsQuota.quota_limit}
            label="Kanban Boards Quota"
          />
          <ProgressRing
            used={fieldsQuota.used_count}
            limit={fieldsQuota.quota_limit}
            label="Super Fields Quota"
          />
          <ProgressRing
            used={tagsQuota.used_count}
            limit={tagsQuota.quota_limit}
            label="Tags & Rules Quota"
          />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. PLAN UPGRADE CATALOG */}
      {/* ========================================================================= */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-100 tracking-tight">Available Subscription Tiers</h2>
            <p className="text-xs text-slate-400 mt-0.5">Upgrade or switch plans instantly. Prorated credits from active plans are automatically deducted.</p>
          </div>

          {/* Tenure Toggle */}
          <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-xl border border-slate-800 shrink-0">
            <button
              onClick={() => setIsAnnual(false)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                !isAnnual ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Monthly Billing
            </button>
            <button
              onClick={() => setIsAnnual(true)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                isAnnual ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Annual Billing
              <span className="px-1.5 py-0.2 text-[10px] rounded bg-emerald-500 text-slate-950 font-bold">SAVE 20%</span>
            </button>
          </div>
        </div>

        {/* Plan Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map((plan) => {
            const isCurrent = activePlan?.id === plan.id;
            const isPopular = plan.slug === 'growth' || plan.slug === 'scale';
            const price = isAnnual ? Number((plan.price_usd * 0.8).toFixed(2)) : plan.price_usd;

            return (
              <div
                key={plan.id}
                className={`bg-slate-900 rounded-2xl border transition-all duration-200 relative flex flex-col justify-between p-6 ${
                  isCurrent
                    ? 'border-emerald-600/70 shadow-lg shadow-emerald-950/20 ring-1 ring-emerald-500/50'
                    : isPopular
                    ? 'border-indigo-600/70 shadow-lg shadow-indigo-950/20 hover:border-indigo-500'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Popular / Current Ribbon */}
                {isCurrent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-emerald-600 text-white font-bold text-[10px] uppercase tracking-wider shadow">
                    Current Plan
                  </div>
                )}
                {!isCurrent && isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-indigo-600 text-white font-bold text-[10px] uppercase tracking-wider shadow">
                    Recommended
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-100">{plan.name}</h3>
                    <p className="text-xs text-slate-400 mt-1 min-h-[32px]">{plan.description}</p>
                  </div>

                  {/* Price Block */}
                  <div className="pt-2">
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-black text-slate-100 font-mono tracking-tight">
                        ${price.toFixed(2)}
                      </span>
                      <span className="text-xs text-slate-400">/ month</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Approx. {sym}{(price * (walletCurrency === 'INR' ? 87.5 : 1)).toFixed(2)} {walletCurrency}
                    </div>
                  </div>

                  {/* Limits Checklist */}
                  <div className="pt-4 border-t border-slate-800 space-y-2.5 text-xs text-slate-300">
                    <div className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span>
                        <strong>{plan.quota_contacts === -1 ? 'Unlimited' : plan.quota_contacts.toLocaleString()}</strong> Contacts
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span>
                        <strong>{plan.quota_boards === -1 ? 'Unlimited' : plan.quota_boards}</strong> Kanban Boards
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span>
                        <strong>{plan.quota_super_fields === -1 ? 'Unlimited' : plan.quota_super_fields}</strong> Super Fields
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span>
                        <strong>{plan.quota_tags === -1 ? 'Unlimited' : plan.quota_tags}</strong> Workspace Tags
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-4 border-t border-slate-800/80">
                  <Button
                    variant={isCurrent ? 'secondary' : isPopular ? 'primary' : 'outline'}
                    size="sm"
                    className="w-full"
                    disabled={isCurrent}
                    onClick={() => handleOpenCheckout(plan)}
                  >
                    {isCurrent ? 'Current Plan' : 'Select & Upgrade'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. RESOURCE ADD-ONS STORE */}
      {/* ========================================================================= */}
      <div className="space-y-4 pt-4 border-t border-slate-800">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-100">Add-on Resource Booster Packs</h2>
            <p className="text-xs text-slate-400">Need extra capacity without changing your plan? Expand your workspace immediately with one-time packs.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {addons.map((addon) => (
            <div
              key={addon.id}
              className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between hover:border-slate-700 transition-all"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-200">{addon.name}</span>
                  <Badge variant="indigo" size="xs">
                    +{addon.quantity.toLocaleString()} {addon.resource_type}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  <strong className="text-slate-100 font-mono">${addon.price_usd} USD</strong>
                  {' · '}
                  Approx. {sym}{(addon.price_usd * (walletCurrency === 'INR' ? 87.5 : 1)).toFixed(2)}
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                icon={<Plus className="w-3.5 h-3.5" />}
                onClick={() => setSelectedAddon(addon)}
              >
                Add Pack
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. INVOICES & WALLET LEDGER TABLE */}
      {/* ========================================================================= */}
      <div className="space-y-4 pt-4 border-t border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-100">Billing History & Tax Invoices</h2>
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs">
              <button
                onClick={() => setActiveHistoryTab('invoices')}
                className={`px-3 py-1 rounded-md font-semibold transition-all ${
                  activeHistoryTab === 'invoices' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Invoices ({invoices.length})
              </button>
              <button
                onClick={() => setActiveHistoryTab('ledger')}
                className={`px-3 py-1 rounded-md font-semibold transition-all ${
                  activeHistoryTab === 'ledger' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Wallet Ledger ({ledgerTxs.length})
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-48 sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search invoice or plan..."
                value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              icon={<Download className="w-3.5 h-3.5" />}
              onClick={exportInvoicesCsv}
            >
              Export CSV
            </Button>
          </div>
        </div>

        {/* Tab 1: Invoices */}
        {activeHistoryTab === 'invoices' && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="px-4 py-3">Invoice Number</th>
                    <th className="px-4 py-3">Plan / Item</th>
                    <th className="px-4 py-3">Issue Date</th>
                    <th className="px-4 py-3 text-right">USD Base</th>
                    <th className="px-4 py-3 text-right">Wallet Amount</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {invoices
                    .filter((inv) => inv.invoice_number.toLowerCase().includes(invoiceSearch.toLowerCase()) || inv.plan_name.toLowerCase().includes(invoiceSearch.toLowerCase()))
                    .map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-slate-200">{inv.invoice_number}</td>
                        <td className="px-4 py-3 font-medium text-slate-100">{inv.plan_name}</td>
                        <td className="px-4 py-3 text-slate-400">{new Date(inv.created_at).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">${inv.amount_usd.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-200">
                          {inv.currency_charged} {inv.amount_charged.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant="emerald" size="xs">
                            {inv.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <a
                            href={`/api/crm/billing/invoices/${inv.id}/receipt`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300 hover:underline"
                          >
                            <Receipt className="w-3.5 h-3.5" />
                            Receipt
                          </a>
                        </td>
                      </tr>
                    ))}
                  {invoices.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                        No invoices generated yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: Wallet Ledger */}
        {activeHistoryTab === 'ledger' && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="px-4 py-3">Transaction ID</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-right">Balance After</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {ledgerTxs.map((tx) => {
                    const isCredit = ['wallet_topup', 'promotional_credit', 'usage_refund', 'admin_adjustment'].includes(tx.transaction_type);
                    return (
                      <tr key={tx.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3 font-mono text-slate-400 truncate max-w-[140px]">{tx.id}</td>
                        <td className="px-4 py-3 font-medium text-slate-200">{tx.description}</td>
                        <td className="px-4 py-3 text-slate-400">{new Date(tx.created_at).toLocaleDateString()}</td>
                        <td
                          className={`px-4 py-3 text-right font-mono tabular-nums font-bold ${
                            isCredit ? 'text-emerald-400' : 'text-slate-200'
                          }`}
                        >
                          {isCredit ? '+' : '-'}{tx.currency} {tx.amount.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-400">
                          {tx.currency} {Number(tx.new_balance || 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={tx.status === 'completed' ? 'emerald' : 'slate'} size="xs">
                            {tx.status}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                  {ledgerTxs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        No ledger transactions recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 6. CHECKOUT SLIDE-OVER DRAWER (WALLET-ONLY SETTLEMENT) */}
      {/* ========================================================================= */}
      <Drawer
        isOpen={Boolean(checkoutPlan)}
        onClose={() => setCheckoutPlan(null)}
        title={checkoutSuccess ? 'Subscription Confirmed' : `Subscribe to ${checkoutPlan?.name}`}
        subtitle="Sovereign wallet-only checkout with instant atomic settlement"
        width="lg"
      >
        {checkoutSuccess ? (
          <div className="space-y-6 text-center py-8">
            <div className="w-16 h-16 rounded-full bg-emerald-950/60 border border-emerald-800/50 text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-100">Welcome to {checkoutPlan?.name}!</h3>
              <p className="text-xs text-slate-400 mt-1">
                Your wallet was debited and your account quotas were raised immediately.
              </p>
            </div>

            <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl text-left text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Invoice Ref:</span>
                <span className="font-mono text-slate-200 font-bold">{checkoutSuccess.invoice?.invoice_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Amount Charged:</span>
                <span className="font-mono text-emerald-400 font-bold">
                  {checkoutSuccess.invoice?.currency_charged} {checkoutSuccess.invoice?.amount_charged.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Plan Duration:</span>
                <span className="text-slate-200">{checkoutPlan?.duration_days} Days</span>
              </div>
            </div>

            <div className="flex gap-3">
              <a
                href={`/api/crm/billing/invoices/${checkoutSuccess.invoice?.id}/receipt`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
              >
                <Receipt className="w-4 h-4" /> View Tax Receipt
              </a>
              <Button
                variant="primary"
                size="sm"
                className="flex-1"
                onClick={() => setCheckoutPlan(null)}
              >
                Done
              </Button>
            </div>
          </div>
        ) : (
          checkoutData && (
            <div className="space-y-6">
              {/* Plan Summary Card */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">{checkoutPlan.name} Plan</span>
                  <Badge variant="indigo" size="xs">
                    {checkoutPlan.duration_days} Days
                  </Badge>
                </div>
                <div className="text-2xl font-black text-slate-100 font-mono">
                  ${checkoutData.grossUsd.toFixed(2)} USD
                </div>
                <p className="text-xs text-slate-400">{checkoutPlan.description}</p>
              </div>

              {/* Coupon Code Input */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">Promotional Coupon</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter code (e.g. PROMO20)"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    className="flex-1 uppercase font-mono"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    loading={couponValidating}
                    onClick={handleValidateCoupon}
                  >
                    Apply
                  </Button>
                </div>
                {appliedCoupon && (
                  <p className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Coupon applied! {appliedCoupon.discount_value}{appliedCoupon.discount_type === 'percent' ? '%' : '$'} discount
                  </p>
                )}
                {couponError && <p className="text-xs text-rose-400 font-medium">{couponError}</p>}
              </div>

              {/* Auto Renew Toggle */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950/40 border border-slate-800">
                <div>
                  <div className="text-xs font-bold text-slate-200">Auto-Renew via Wallet</div>
                  <div className="text-[11px] text-slate-400">Automatically renews plan on expiry if wallet has sufficient balance.</div>
                </div>
                <input
                  type="checkbox"
                  checked={autoRenew}
                  onChange={(e) => setAutoRenew(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-900 border-slate-700"
                />
              </div>

              {/* Itemized Price Breakdown */}
              <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2.5 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Gross Price:</span>
                  <span className="font-mono text-slate-200">${checkoutData.grossUsd.toFixed(2)}</span>
                </div>

                {checkoutData.discountUsd > 0 && (
                  <div className="flex justify-between text-emerald-400 font-semibold">
                    <span>Discount / Credits:</span>
                    <span className="font-mono">-${checkoutData.discountUsd.toFixed(2)}</span>
                  </div>
                )}

                <div className="flex justify-between text-slate-400 pt-2 border-t border-slate-800/80">
                  <span>Net Taxable Amount:</span>
                  <span className="font-mono text-slate-200">${checkoutData.netTaxableUsd.toFixed(2)}</span>
                </div>

                <div className="flex justify-between text-slate-400">
                  <span>GST / VAT ({checkoutData.taxRatePercent}%):</span>
                  <span className="font-mono text-slate-200">${checkoutData.taxAmountUsd.toFixed(2)}</span>
                </div>

                <div className="flex justify-between text-slate-100 font-bold text-sm pt-2 border-t border-slate-800">
                  <span>Total Due:</span>
                  <div className="text-right">
                    <span className="font-mono text-indigo-400">${checkoutData.totalAmountUsd.toFixed(2)} USD</span>
                    <div className="text-[11px] text-slate-400 font-normal">
                      {sym}{checkoutData.totalInUserCurrency.toFixed(2)} {checkoutData.userCurrency}
                    </div>
                  </div>
                </div>
              </div>

              {/* Wallet Balance Verification & Shortfall Card */}
              <div
                className={`p-4 rounded-xl border text-xs space-y-2 ${
                  checkoutData.hasEnoughFunds
                    ? 'bg-slate-950/60 border-slate-800'
                    : 'bg-rose-950/30 border-rose-800/50 text-rose-300'
                }`}
              >
                <div className="flex justify-between font-medium">
                  <span className="text-slate-400">Current Wallet Balance:</span>
                  <span className="font-mono text-slate-200 font-bold">
                    {sym}{checkoutData.userBalance.toFixed(2)} {checkoutData.userCurrency}
                  </span>
                </div>

                {checkoutData.hasEnoughFunds ? (
                  <div className="flex justify-between font-medium text-emerald-400">
                    <span>Balance After Purchase:</span>
                    <span className="font-mono font-bold">
                      {sym}{checkoutData.balanceAfter.toFixed(2)} {checkoutData.userCurrency}
                    </span>
                  </div>
                ) : (
                  <div className="pt-2 border-t border-rose-900/50 space-y-2">
                    <div className="flex items-center gap-1.5 font-bold text-rose-300">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>Insufficient wallet balance (Need {sym}{checkoutData.shortfall.toFixed(2)} more)</span>
                    </div>
                    <p className="text-[11px] text-rose-400/80">
                      CRM billing accepts payments exclusively from your wallet. Please top up your wallet to activate this plan.
                    </p>
                    <a
                      href="/wallet"
                      className="block w-full text-center py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold transition-all text-xs"
                    >
                      Add funds to Wallet
                    </a>
                  </div>
                )}
              </div>

              {/* Confirm Purchase Button */}
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                loading={isSubscribing}
                disabled={!checkoutData.hasEnoughFunds}
                onClick={handleConfirmPurchase}
              >
                Confirm & Pay from Wallet
              </Button>
            </div>
          )
        )}
      </Drawer>

      {/* ========================================================================= */}
      {/* 7. ADDON PACK PURCHASE MODAL */}
      {/* ========================================================================= */}
      <Modal
        isOpen={Boolean(selectedAddon)}
        onClose={() => setSelectedAddon(null)}
        title="Purchase Resource Booster Pack"
        maxWidth="md"
      >
        {selectedAddon && (
          <div className="space-y-4">
            <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
              <div className="text-sm font-bold text-slate-100">{selectedAddon.name}</div>
              <div className="text-xs text-slate-400">
                Adds <strong>+{selectedAddon.quantity.toLocaleString()}</strong> to your workspace {selectedAddon.resource_type} capacity.
              </div>
              <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-xs">
                <span className="text-slate-400">Cost:</span>
                <span className="font-mono text-emerald-400 font-bold">${selectedAddon.price_usd} USD</span>
              </div>
            </div>

            <p className="text-xs text-slate-400">
              The fee will be debited immediately from your wallet balance and your limit will increase automatically.
            </p>

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="ghost" size="sm" onClick={() => setSelectedAddon(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={isPurchasingAddon}
                onClick={handleConfirmAddon}
              >
                Confirm Purchase
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
