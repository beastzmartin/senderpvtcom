import React, { useState, useEffect } from 'react';
import {
  CreditCard,
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
  Plus
} from 'lucide-react';
import { crmApi } from './crmApi';

export const CustomerBillingView: React.FC = () => {
  const [plans, setPlans] = useState<any[]>([]);
  const [addons, setAddons] = useState<any[]>([]);
  const [subscription, setSubscription] = useState<any | null>(null);
  const [usageCounters, setUsageCounters] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Upgrade form state
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<any | null>(null);
  const [subscribingPlanId, setSubscribingPlanId] = useState<string | null>(null);
  const [processingAddonId, setProcessingAddonId] = useState<string | null>(null);

  useEffect(() => {
    loadBillingData();
  }, []);

  const loadBillingData = async () => {
    setLoading(true);
    try {
      const [plansRes, addonsRes, subRes, invRes] = await Promise.all([
        crmApi.listBillingPlans(),
        crmApi.listBillingAddons(),
        crmApi.getActiveSubscription(),
        crmApi.listInvoices()
      ]);

      if (plansRes && plansRes.success) setPlans(plansRes.plans || []);
      if (addonsRes && addonsRes.success) setAddons(addonsRes.addons || []);
      if (subRes && subRes.success) {
        setSubscription(subRes.subscription || null);
        setUsageCounters(subRes.usage || []);
      }
      if (invRes && invRes.success) setInvoices(invRes.invoices || []);
    } catch (err) {
      console.error('Failed to load billing data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    try {
      const res = await crmApi.checkCoupon(couponCode.trim());
      if (res && res.success && res.coupon) {
        setAppliedCoupon(res.coupon);
        alert(`Coupon ${res.coupon.code} applied! ${res.coupon.discount_value}${res.coupon.discount_type === 'percent' ? '%' : '$'} discount.`);
      }
    } catch (err: any) {
      alert(`Invalid coupon: ${err.message}`);
      setAppliedCoupon(null);
    }
  };

  const handleSubscribe = async (plan: any) => {
    if (!confirm(`Subscribe to ${plan.name} for $${plan.price_usd}/mo? This will be deducted atomically from your Wallet balance.`)) {
      return;
    }

    setSubscribingPlanId(plan.id);
    try {
      const res = await crmApi.subscribeToPlan(plan.id, appliedCoupon?.code);
      if (res && res.success) {
        alert(res.message || 'Subscription updated successfully!');
        loadBillingData();
      }
    } catch (err: any) {
      alert(`Subscription failed: ${err.message}`);
    } finally {
      setSubscribingPlanId(null);
    }
  };

  const handlePurchaseAddon = async (addon: any) => {
    if (!confirm(`Purchase ${addon.name} for $${addon.price_usd}? This will be deducted from your Wallet balance.`)) {
      return;
    }

    setProcessingAddonId(addon.id);
    try {
      const res = await crmApi.purchaseAddon(addon.id);
      if (res && res.success) {
        alert(res.message || 'Add-on pack activated!');
        loadBillingData();
      }
    } catch (err: any) {
      alert(`Purchase failed: ${err.message}`);
    } finally {
      setProcessingAddonId(null);
    }
  };

  const openInvoiceReceipt = (invId: string) => {
    window.open(`/api/crm/billing/invoices/${invId}/receipt`, '_blank');
  };

  const getCounter = (type: string) => {
    return usageCounters.find((c) => c.resource_type === type) || { used_count: 0, quota_limit: 1000 };
  };

  return (
    <div className="space-y-6">
      {/* Wallet Settlement Notice Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-purple-900 rounded-3xl p-6 text-white shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-white/10 rounded-xl backdrop-blur-xs">
              <Wallet className="w-5 h-5 text-indigo-300" />
            </span>
            <h2 className="text-xl font-black tracking-tight">Sovereign Wallet-Only Billing</h2>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-black border border-emerald-500/30 uppercase">
              No External Gateways
            </span>
          </div>
          <p className="text-xs text-indigo-200 max-w-xl font-medium">
            All subscriptions, automatic renewals, and add-on capacity packs are settled directly from your PVTSender user wallet.
            Enjoy instant activation with zero card forms.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            // Trigger wallet topup modal event or direct navigate
            window.location.hash = '#wallet';
          }}
          className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white text-indigo-950 font-black text-xs hover:bg-indigo-50 shadow-md transition"
        >
          <Plus className="w-4 h-4" />
          Top Up Wallet
        </button>
      </div>

      {/* Active Subscription Status & Hard Quota Meters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Active Plan Card */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Current Plan</span>
              <span
                className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                  subscription?.status === 'active'
                    ? 'bg-emerald-100 text-emerald-800'
                    : subscription?.status === 'grace'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-rose-100 text-rose-800'
                }`}
              >
                {subscription?.status || 'Free Tier'}
              </span>
            </div>
            <h3 className="text-2xl font-black text-slate-900 mb-1">
              {subscription?.plan?.name || 'Starter (Free)'}
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Renews on: {subscription?.ends_at ? new Date(subscription.ends_at).toLocaleDateString() : 'Never (Free)'}
            </p>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500 font-semibold">Auto-Renewal:</span>
            <span className="font-bold text-indigo-600">
              {subscription?.auto_renew ? 'Enabled (Wallet)' : 'Manual'}
            </span>
          </div>
        </div>

        {/* Contacts Hard Quota Meter */}
        {(() => {
          const c = getCounter('contacts');
          const limit = c.quota_limit === -1 ? 'Unlimited' : c.quota_limit;
          const pct = c.quota_limit === -1 ? 0 : Math.min(100, Math.round((c.used_count / c.quota_limit) * 100));

          return (
            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Contacts Quota
                  </span>
                  <span className="text-xs font-mono font-bold text-slate-700">
                    {c.used_count.toLocaleString()} / {limit.toLocaleString()}
                  </span>
                </div>
                <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden mb-2">
                  <div
                    className={`h-full rounded-full transition-all ${
                      pct > 90 ? 'bg-rose-500' : pct > 75 ? 'bg-amber-500' : 'bg-indigo-600'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Hard limit enforced atomically. Never dropped.
              </p>
            </div>
          );
        })()}

        {/* Boards & Super Fields Quota */}
        {(() => {
          const b = getCounter('boards');
          const sf = getCounter('super_fields');

          return (
            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                  Pipeline & Schema Quota
                </span>
                <div className="space-y-2 text-xs font-semibold text-slate-700">
                  <div className="flex justify-between items-center">
                    <span>Kanban Boards:</span>
                    <span className="font-mono font-bold">
                      {b.used_count} / {b.quota_limit === -1 ? '∞' : b.quota_limit}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Super Fields:</span>
                    <span className="font-mono font-bold">
                      {sf.used_count} / {sf.quota_limit === -1 ? '∞' : sf.quota_limit}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await crmApi.reconcileUsageCounters();
                  loadBillingData();
                }}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 pt-2"
              >
                <RefreshCw className="w-3 h-3" /> Reconcile Accurate Counts
              </button>
            </div>
          );
        })()}
      </div>

      {/* Plan Catalog */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-black text-slate-900">Subscription Plans Catalog</h3>
            <p className="text-xs text-slate-500">Pick a tier to instantly upgrade your workspace limits</p>
          </div>

          {/* Coupon Input */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              placeholder="Promo / Coupon Code"
              className="text-xs font-mono font-bold border border-slate-300 rounded-xl px-3 py-2 uppercase w-44"
            />
            <button
              type="button"
              onClick={handleApplyCoupon}
              className="px-3.5 py-2 text-xs font-bold bg-slate-900 text-white rounded-xl hover:bg-slate-800"
            >
              Apply
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map((p) => {
            const isCurrent = subscription?.plan_id === p.id;
            return (
              <div
                key={p.id}
                className={`bg-white rounded-3xl p-5 border flex flex-col justify-between transition ${
                  isCurrent
                    ? 'border-indigo-600 ring-2 ring-indigo-600/20 shadow-md'
                    : 'border-slate-200/80 shadow-xs hover:border-slate-300'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-black text-base text-slate-900">{p.name}</h4>
                    {isCurrent && (
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                        Current
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-500 min-h-[32px]">{p.description}</p>

                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black text-slate-900">${p.price_usd}</span>
                    <span className="text-xs text-slate-400 font-bold">/ 30 days</span>
                  </div>

                  <div className="pt-3 border-t border-slate-100 space-y-2 text-xs text-slate-600 font-medium">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{p.quota_contacts.toLocaleString()} Contacts Quota</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{p.quota_boards} Kanban Boards</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{p.quota_super_fields} Super Fields</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{p.quota_team_seats} Team Seats</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{p.quota_automations_per_month.toLocaleString()} Automations</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isCurrent || subscribingPlanId === p.id}
                  onClick={() => handleSubscribe(p)}
                  className={`w-full mt-6 py-2.5 rounded-xl font-bold text-xs transition ${
                    isCurrent
                      ? 'bg-slate-100 text-slate-400 cursor-default'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs'
                  }`}
                >
                  {isCurrent
                    ? 'Active Plan'
                    : subscribingPlanId === p.id
                    ? 'Processing...'
                    : 'Subscribe with Wallet'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add-on Capacity Packs */}
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-black text-slate-900">Add-On Capacity Packs</h3>
          <p className="text-xs text-slate-500">
            Stack extra contacts or seats directly onto your current plan
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {addons.map((a) => (
            <div
              key={a.id}
              className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between"
            >
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md inline-block mb-2">
                  {a.resource_type}
                </span>
                <h4 className="font-bold text-sm text-slate-900">{a.name}</h4>
                <div className="text-xl font-black text-slate-900 mt-2">${a.price_usd}</div>
              </div>

              <button
                type="button"
                disabled={processingAddonId === a.id}
                onClick={() => handlePurchaseAddon(a)}
                className="w-full mt-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 text-xs font-bold transition"
              >
                {processingAddonId === a.id ? 'Purchasing...' : 'Buy with Wallet'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Sequential Invoices & Tax Receipts */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-200/60 flex items-center justify-between">
          <div>
            <h3 className="font-black text-sm text-slate-900">Tax Invoices & Receipts</h3>
            <p className="text-xs text-slate-500">Download official sequential GST/VAT tax invoices</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200/60">
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Plan / Item</th>
                <th className="py-3 px-4">Amount USD</th>
                <th className="py-3 px-4">Charged (Wallet)</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50/80 transition">
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                    {inv.invoice_number}
                  </td>
                  <td className="py-3.5 px-4 text-slate-500">
                    {new Date(inv.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-3.5 px-4 font-bold text-slate-800">{inv.plan_name}</td>
                  <td className="py-3.5 px-4 font-mono font-semibold">${inv.amount_usd.toFixed(2)}</td>
                  <td className="py-3.5 px-4 font-mono text-slate-600">
                    {inv.currency_charged} {inv.amount_charged.toFixed(2)}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase">
                      {inv.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => openInvoiceReceipt(inv.id)}
                      className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-bold"
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      View Receipt
                    </button>
                  </td>
                </tr>
              ))}

              {invoices.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 font-medium">
                    No billing transactions recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

