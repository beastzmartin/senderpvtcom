import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { SubscriptionPlan, UserSubscriptionDetails, LicenseKeyRecord, ResellerInfo, ResellerStats } from '../../types';
import {
  Key,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Smartphone,
  Send,
  Clock,
  Users,
  Copy,
  Plus,
  RefreshCw,
  Trash2,
  Ban,
  MessageCircle,
  Layers,
  Infinity as InfinityIcon,
  Check,
  ArrowRight,
  Search,
  Filter,
  CreditCard,
  ChevronDown,
  Coins,
  UserPlus,
  Award,
  Sliders
} from 'lucide-react';

export const SubscriptionView: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const { devices } = useWhatsApp();

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [subscription, setSubscription] = useState<UserSubscriptionDetails | null>(null);

  // License redemption
  const [licenseCode, setLicenseCode] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);

  // Admin tabs & state
  const [adminTab, setAdminTab] = useState<'keys' | 'customers' | 'resellers'>('keys');
  const [customers, setCustomers] = useState<any[]>([]);
  const [licenseKeys, setLicenseKeys] = useState<LicenseKeyRecord[]>([]);
  const [resellers, setResellers] = useState<ResellerInfo[]>([]);
  const [loadingAdminData, setLoadingAdminData] = useState(false);
  const [keyFilter, setKeyFilter] = useState<'all' | 'available' | 'used' | 'revoked'>('all');
  const [keySearch, setKeySearch] = useState('');

  // Admin Reseller Management modals
  const [showAddResellerModal, setShowAddResellerModal] = useState(false);
  const [selectedResellerUser, setSelectedResellerUser] = useState('');
  const [newResellerQuota, setNewResellerQuota] = useState('25');
  const [showAddCreditsModal, setShowAddCreditsModal] = useState(false);
  const [selectedResellerForCredits, setSelectedResellerForCredits] = useState<ResellerInfo | null>(null);
  const [additionalCredits, setAdditionalCredits] = useState('10');

  // Admin Customer Limits Editor
  const [showEditCustomerModal, setShowEditCustomerModal] = useState(false);
  const [editCustomer, setEditCustomer] = useState<any | null>(null);
  const [editCustomerPlan, setEditCustomerPlan] = useState('starter');
  const [editCustomerStatus, setEditCustomerStatus] = useState('active');
  const [editCustomerDailyBroadcast, setEditCustomerDailyBroadcast] = useState('100');
  const [editCustomerDailyExtraction, setEditCustomerDailyExtraction] = useState('500');
  const [editCustomerMaxDevices, setEditCustomerMaxDevices] = useState('1');
  const [editCustomerDurationDays, setEditCustomerDurationDays] = useState('');
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);

  // Admin Plan Limits Editor
  const [showEditPlanModal, setShowEditPlanModal] = useState(false);
  const [editPlan, setEditPlan] = useState<SubscriptionPlan | null>(null);
  const [editPlanName, setEditPlanName] = useState('');
  const [editPlanTagline, setEditPlanTagline] = useState('');
  const [editPlanDailyBroadcast, setEditPlanDailyBroadcast] = useState('100');
  const [editPlanDailyExtraction, setEditPlanDailyExtraction] = useState('500');
  const [editPlanMaxDevices, setEditPlanMaxDevices] = useState('1');
  const [editPlanPriceMonthly, setEditPlanPriceMonthly] = useState('999');
  const [editPlanPriceYearly, setEditPlanPriceYearly] = useState('9990');
  const [editPlanTrialDays, setEditPlanTrialDays] = useState('3');
  const [isSavingPlan, setIsSavingPlan] = useState(false);

  // Reseller state
  const [resellerStats, setResellerStats] = useState<ResellerStats | null>(null);
  const [resellerKeys, setResellerKeys] = useState<LicenseKeyRecord[]>([]);
  const [loadingResellerData, setLoadingResellerData] = useState(false);
  const [showResellerGenModal, setShowResellerGenModal] = useState(false);
  const [resellerKeyFilter, setResellerKeyFilter] = useState<'all' | 'available' | 'used' | 'revoked'>('all');
  const [resellerKeySearch, setResellerKeySearch] = useState('');

  // Key generator modal state
  const [genPlan, setGenPlan] = useState<'starter' | 'pro' | 'enterprise'>('pro');
  const [genDuration, setGenDuration] = useState('30');
  const [genCount, setGenCount] = useState('1');
  const [genNote, setGenNote] = useState('');
  const [genCustomDevices, setGenCustomDevices] = useState('');
  const [genCustomDaily, setGenCustomDaily] = useState('');
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [showGenModal, setShowGenModal] = useState(false);

  // Notifications
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const isAdmin = user?.role === 'admin';
  const isReseller = user?.role === 'reseller';

  // Load plans & subscription
  const loadData = async () => {
    try {
      const [plansRes, subRes] = await Promise.all([
        api.subscriptions.getPlans(),
        api.subscriptions.getMyPlan()
      ]);
      setPlans(plansRes.plans);
      setSubscription(subRes.subscription);
    } catch (err: any) {
      console.error('[License System] Error loading plans:', err);
    }
  };

  // Load admin data
  const loadAdminData = async () => {
    if (!isAdmin) return;
    setLoadingAdminData(true);
    try {
      const [custRes, keysRes, resRes] = await Promise.all([
        api.subscriptions.adminListCustomers(),
        api.subscriptions.adminListKeys(),
        api.subscriptions.adminListResellers()
      ]);
      setCustomers(custRes.customers);
      setLicenseKeys(keysRes.keys);
      setResellers(resRes.resellers);
    } catch (err: any) {
      console.error('[License System] Error loading admin data:', err);
    } finally {
      setLoadingAdminData(false);
    }
  };

  // Load reseller data
  const loadResellerData = async () => {
    if (!isReseller) return;
    setLoadingResellerData(true);
    try {
      const [statsRes, keysRes] = await Promise.all([
        api.subscriptions.resellerGetStats(),
        api.subscriptions.resellerListKeys()
      ]);
      setResellerStats(statsRes.stats);
      setResellerKeys(keysRes.keys);
    } catch (err: any) {
      console.error('[License System] Error loading reseller data:', err);
    } finally {
      setLoadingResellerData(false);
    }
  };

  useEffect(() => {
    loadData();
    if (isAdmin) {
      loadAdminData();
    }
    if (isReseller) {
      loadResellerData();
    }
  }, [isAdmin, isReseller]);

  // Handle license key redemption
  const handleRedeemKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseCode.trim()) return;

    setIsRedeeming(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const res = await api.subscriptions.redeemCode(licenseCode.trim());
      setSubscription(res.subscription);
      await refreshUser();
      setLicenseCode('');
      setStatusMessage(res.message);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to activate license key.');
    } finally {
      setIsRedeeming(false);
    }
  };

  // Admin: Generate new key(s)
  const handleGenerateKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGeneratingKey(true);
    setStatusMessage(null);
    setErrorMessage(null);

    const count = Math.max(1, parseInt(genCount, 10) || 1);
    const durationDays = parseInt(genDuration, 10);
    const maxDevices = genCustomDevices ? parseInt(genCustomDevices, 10) : undefined;
    const dailyLimit = genCustomDaily ? parseInt(genCustomDaily, 10) : undefined;

    try {
      if (count > 1) {
        const res = await api.subscriptions.adminBulkGenerateKeys(
          genPlan,
          durationDays,
          count,
          {
            note: genNote.trim() || undefined,
            maxDevices,
            dailyLimit
          }
        );
        setStatusMessage(res.message);
      } else {
        const res = await api.subscriptions.adminGenerateKey(
          genPlan,
          durationDays,
          {
            note: genNote.trim() || undefined,
            maxDevices,
            dailyLimit
          }
        );
        setStatusMessage(`Generated license key: ${res.key.code}`);
      }

      setGenNote('');
      setGenCustomDevices('');
      setGenCustomDaily('');
      setShowGenModal(false);
      loadAdminData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to generate license key.');
    } finally {
      setIsGeneratingKey(false);
    }
  };

  // Admin: Revoke key
  const handleRevokeKey = async (keyId: string) => {
    if (!window.confirm('Are you sure you want to revoke this license key? If currently in use, the user\'s access will be deactivated immediately.')) {
      return;
    }
    try {
      const res = await api.subscriptions.adminRevokeKey(keyId);
      setStatusMessage(res.message);
      loadAdminData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to revoke key.');
    }
  };

  // Admin: Delete key
  const handleDeleteKey = async (keyId: string) => {
    if (!window.confirm('Delete this unused license key permanently?')) return;
    try {
      const res = await api.subscriptions.adminDeleteKey(keyId);
      setStatusMessage(res.message);
      loadAdminData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete key.');
    }
  };

  // Admin: Quick extend or modify customer
  const handleQuickExtendCustomer = async (targetUserId: string, daysToAdd: number, planTier?: string) => {
    try {
      const targetUser = customers.find((c) => c.id === targetUserId);
      const tier = planTier || targetUser?.plan_tier || 'pro';
      const res = await api.subscriptions.adminUpdateCustomer({
        targetUserId,
        planTier: tier,
        subscriptionStatus: 'active',
        durationDays: daysToAdd
      });
      setStatusMessage(`Updated customer license: ${res.subscription.planName} (+${daysToAdd <= 0 || daysToAdd >= 9999 ? 'Lifetime' : daysToAdd + ' days'})`);
      loadAdminData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to extend customer license.');
    }
  };

  // Admin: Open Edit Customer Limits Modal
  const handleOpenEditCustomer = (c: any) => {
    setEditCustomer(c);
    setEditCustomerPlan(c.plan_tier || 'starter');
    setEditCustomerStatus(c.subscription_status || 'active');
    setEditCustomerDailyBroadcast(String(c.daily_message_limit || 100));
    setEditCustomerDailyExtraction(String(c.daily_extraction_limit || 500));
    setEditCustomerMaxDevices(String(c.max_devices || 1));
    setEditCustomerDurationDays('');
    setShowEditCustomerModal(true);
  };

  // Admin: Save Customer Limits & Plan
  const handleSaveCustomerLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCustomer) return;
    setIsSavingCustomer(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const res = await api.subscriptions.adminUpdateCustomer({
        targetUserId: editCustomer.id,
        planTier: editCustomerPlan,
        subscriptionStatus: editCustomerStatus,
        dailyLimit: parseInt(editCustomerDailyBroadcast, 10) || 100,
        extractionLimit: parseInt(editCustomerDailyExtraction, 10) || 500,
        maxDevices: parseInt(editCustomerMaxDevices, 10) || 1,
        durationDays: editCustomerDurationDays ? parseInt(editCustomerDurationDays, 10) : undefined
      });

      setStatusMessage(`Updated customer @${editCustomer.username}: ${res.subscription.planName} (${res.subscription.dailyMessageLimit} msgs/day, ${res.subscription.dailyExtractionLimit} extractions/day)`);
      setShowEditCustomerModal(false);
      setEditCustomer(null);
      loadAdminData();
      if (editCustomer.id === user?.id) {
        refreshUser();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update customer limits.');
    } finally {
      setIsSavingCustomer(false);
    }
  };

  // Admin: Open Edit Plan Limits Modal
  const handleOpenEditPlan = (plan: SubscriptionPlan) => {
    setEditPlan(plan);
    setEditPlanName(plan.name);
    setEditPlanTagline(plan.tagline || '');
    setEditPlanDailyBroadcast(String(plan.daily_message_limit));
    setEditPlanDailyExtraction(String(plan.daily_extraction_limit || 500));
    setEditPlanMaxDevices(String(plan.max_devices));
    setEditPlanPriceMonthly(String(plan.price_monthly));
    setEditPlanPriceYearly(String(plan.price_yearly));
    setEditPlanTrialDays(String(plan.trial_days || 3));
    setShowEditPlanModal(true);
  };

  // Admin: Save Plan Limits
  const handleSavePlanLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editPlan) return;
    setIsSavingPlan(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const res = await api.subscriptions.adminUpdatePlan(editPlan.id, {
        name: editPlanName,
        tagline: editPlanTagline,
        dailyMessageLimit: parseInt(editPlanDailyBroadcast, 10) || 100,
        dailyExtractionLimit: parseInt(editPlanDailyExtraction, 10) || 500,
        maxDevices: parseInt(editPlanMaxDevices, 10) || 1,
        priceMonthly: parseInt(editPlanPriceMonthly, 10) || 0,
        priceYearly: parseInt(editPlanPriceYearly, 10) || 0,
        trialDays: editPlan.id === 'trial' ? parseInt(editPlanTrialDays, 10) || 3 : undefined
      });

      setStatusMessage(`Updated plan "${res.plan.name}" limits: ${res.plan.daily_message_limit} msgs/day, ${res.plan.daily_extraction_limit} extractions/day`);
      setShowEditPlanModal(false);
      setEditPlan(null);
      loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update plan limits.');
    } finally {
      setIsSavingPlan(false);
    }
  };

  // Reseller: Generate key(s)
  const handleResellerGenerateKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGeneratingKey(true);
    setStatusMessage(null);
    setErrorMessage(null);

    const count = Math.max(1, parseInt(genCount, 10) || 1);
    const durationDays = parseInt(genDuration, 10);

    try {
      if (count > 1) {
        const res = await api.subscriptions.resellerBulkGenerateKeys(genPlan, durationDays, count, {
          note: genNote.trim() || undefined
        });
        setStatusMessage(res.message);
      } else {
        const res = await api.subscriptions.resellerGenerateKey(genPlan, durationDays, {
          note: genNote.trim() || undefined
        });
        setStatusMessage(`Generated reseller license key: ${res.key.code}`);
      }

      setGenNote('');
      setShowResellerGenModal(false);
      loadResellerData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to generate reseller key.');
    } finally {
      setIsGeneratingKey(false);
    }
  };

  // Reseller: Revoke key
  const handleResellerRevokeKey = async (keyId: string) => {
    if (!window.confirm('Are you sure you want to revoke this license key? The user who activated it will lose access immediately.')) {
      return;
    }
    try {
      const res = await api.subscriptions.resellerRevokeKey(keyId);
      setStatusMessage(res.message);
      loadResellerData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to revoke key.');
    }
  };

  // Admin: Promote user to reseller
  const handlePromoteToReseller = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedResellerUser || !newResellerQuota) return;
    try {
      const res = await api.subscriptions.adminSetResellerQuota(
        selectedResellerUser,
        parseInt(newResellerQuota, 10) || 10
      );
      setStatusMessage(res.message);
      setShowAddResellerModal(false);
      setSelectedResellerUser('');
      setNewResellerQuota('25');
      loadAdminData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to promote user to reseller.');
    }
  };

  // Admin: Add credits to reseller
  const handleAddCreditsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedResellerForCredits || !additionalCredits) return;
    try {
      const res = await api.subscriptions.adminAddResellerCredits(
        selectedResellerForCredits.id,
        parseInt(additionalCredits, 10) || 10
      );
      setStatusMessage(res.message);
      setShowAddCreditsModal(false);
      setSelectedResellerForCredits(null);
      setAdditionalCredits('10');
      loadAdminData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to add credits.');
    }
  };

  // Admin: Demote reseller
  const handleDemoteReseller = async (reseller: ResellerInfo) => {
    if (!window.confirm(`Are you sure you want to remove reseller privileges from @${reseller.username}?`)) return;
    try {
      const res = await api.subscriptions.adminDemoteReseller(reseller.id);
      setStatusMessage(res.message);
      loadAdminData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to demote reseller.');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(text);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  // Helper to copy pre-formatted WhatsApp message with the license key
  const copyWhatsAppDeliveryMessage = (key: LicenseKeyRecord) => {
    const isLifetime = key.duration_days <= 0 || key.duration_days >= 9999;
    const durationText = isLifetime ? 'Lifetime Permanent Access' : `${key.duration_days} Days`;
    const planName = key.plan_tier.toUpperCase();
    const noteText = key.note ? `\n• Order Ref: ${key.note}` : '';

    const text = `🔑 *WHATSAPP SENDER - OFFICIAL LICENSE KEY*\n\nHello! Here is your activated software license key:\n\n• *License Code:* \`${key.code}\`\n• *Edition:* ${planName} Edition\n• *Validity:* ${durationText}${noteText}\n\n*How to Activate:*\n1. Log into your Private WhatsApp Sender portal\n2. Open "License System" from the left menu\n3. Paste the code above and click "Activate Key"\n\nEnjoy sending! Need help? Contact us anytime.`;

    copyToClipboard(text);
  };

  const connectedCount = devices.filter((d) => d.status === 'connected').length;

  // Filter license keys
  const filteredKeys = licenseKeys.filter((k) => {
    if (keyFilter !== 'all' && k.status !== keyFilter) return false;
    if (keySearch.trim()) {
      const term = keySearch.trim().toLowerCase();
      const codeMatch = k.code.toLowerCase().includes(term);
      const noteMatch = (k.note || '').toLowerCase().includes(term);
      const userMatch = (k.used_by_username || '').toLowerCase().includes(term);
      if (!codeMatch && !noteMatch && !userMatch) return false;
    }
    return true;
  });

  // Filter reseller keys
  const filteredResellerKeys = resellerKeys.filter((k) => {
    if (resellerKeyFilter !== 'all' && k.status !== resellerKeyFilter) return false;
    if (resellerKeySearch.trim()) {
      const term = resellerKeySearch.trim().toLowerCase();
      const codeMatch = k.code.toLowerCase().includes(term);
      const noteMatch = (k.note || '').toLowerCase().includes(term);
      const userMatch = (k.used_by_username || '').toLowerCase().includes(term);
      if (!codeMatch && !noteMatch && !userMatch) return false;
    }
    return true;
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12 font-sans">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200 shrink-0 shadow-xs">
              <Key className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">Software License System</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-100 text-amber-800 tracking-wider">
                  V2.0
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage your software activation, WhatsApp multi-device slots, and dispatch capacity.
              </p>
            </div>
          </div>
        </div>

        {subscription && (
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <span className="px-3.5 py-1.5 rounded-2xl text-xs font-bold uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200 flex items-center gap-1.5 shadow-xs">
              <Sparkles className="w-3.5 h-3.5 text-purple-600" />
              {subscription.planName}
            </span>
            <span
              className={`px-3 py-1.5 rounded-2xl text-xs font-bold uppercase tracking-wider border shadow-xs ${
                subscription.status === 'active'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}
            >
              {subscription.status === 'active' ? 'License Active' : 'License Expired'}
            </span>
          </div>
        )}
      </div>

      {/* Notifications */}
      {statusMessage && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{statusMessage}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-emerald-700 hover:text-emerald-900 font-bold ml-2">
            Dismiss
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-semibold">{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-700 hover:text-rose-900 font-bold ml-2">
            Dismiss
          </button>
        </div>
      )}

      {/* Active License Dashboard Cards */}
      {subscription && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Active License Overview */}
          <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
            <div>
              <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                <span className="font-bold uppercase tracking-wider text-[11px] text-slate-400">Current License</span>
                <ShieldCheck className="w-4 h-4 text-amber-500" />
              </div>
              <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">{subscription.planName}</h3>
              
              {subscription.activeLicenseCode ? (
                <div className="mt-2 flex items-center gap-1.5">
                  <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded-xl border border-slate-200">
                    {subscription.activeLicenseCode}
                  </span>
                  <button
                    onClick={() => copyToClipboard(subscription.activeLicenseCode!)}
                    title="Copy Active License Key"
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  {copiedKey === subscription.activeLicenseCode && (
                    <span className="text-[10px] text-emerald-600 font-bold">Copied!</span>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500 mt-1 font-medium">Standard Account Activation</p>
              )}
            </div>

            <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Validity Remaining:</span>
              <span className="font-extrabold text-purple-700 flex items-center gap-1">
                {subscription.isLifetime ? (
                  <>
                    <InfinityIcon className="w-3.5 h-3.5" />
                    Lifetime Permanent
                  </>
                ) : (
                  `${subscription.daysRemaining} days left`
                )}
              </span>
            </div>
          </div>

          {/* Card 2: Connected WhatsApp Devices */}
          <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                <span className="font-bold uppercase tracking-wider text-[11px] text-slate-400">WhatsApp Multi-Device Slots</span>
                <Smartphone className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-slate-900">{connectedCount}</span>
                <span className="text-xs text-slate-500 font-semibold">
                  / {subscription.maxDevices} Devices Authorized
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-100 h-2.5 rounded-full mt-3 overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (connectedCount / Math.max(1, subscription.maxDevices)) * 100)}%`
                  }}
                />
              </div>
            </div>

            <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>Slots Available:</span>
              <span className="font-bold text-slate-800">
                {Math.max(0, subscription.maxDevices - connectedCount)} free slot(s)
              </span>
            </div>
          </div>

          {/* Card 3: Daily Message Dispatch Limit */}
          <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                <span className="font-bold uppercase tracking-wider text-[11px] text-slate-400">Daily Message Dispatch Quota</span>
                <Send className="w-4 h-4 text-purple-600" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-slate-900">
                  {subscription.messagesSentToday.toLocaleString()}
                </span>
                <span className="text-xs text-slate-500 font-semibold">
                  / {subscription.dailyMessageLimit.toLocaleString()} msgs / day
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-100 h-2.5 rounded-full mt-3 overflow-hidden">
                <div
                  className="bg-purple-600 h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(
                      100,
                      (subscription.messagesSentToday / Math.max(1, subscription.dailyMessageLimit)) * 100
                    )}%`
                  }}
                />
              </div>
            </div>

            <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>Remaining Today:</span>
              <span className="font-bold text-slate-800">
                {subscription.remainingMessagesToday.toLocaleString()} msgs
              </span>
            </div>
          </div>

          {/* Card 4: Daily Group Extraction Limit */}
          <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                <span className="font-bold uppercase tracking-wider text-[11px] text-slate-400">Daily Group Extractions</span>
                <Layers className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-slate-900">
                  {subscription.extractionsToday ? subscription.extractionsToday.toLocaleString() : '0'}
                </span>
                <span className="text-xs text-slate-500 font-semibold">
                  / {subscription.dailyExtractionLimit >= 999999 ? 'Unlimited' : `${subscription.dailyExtractionLimit.toLocaleString()} contacts`}
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-100 h-2.5 rounded-full mt-3 overflow-hidden">
                <div
                  className="bg-indigo-600 h-full rounded-full transition-all"
                  style={{
                    width: `${
                      subscription.dailyExtractionLimit >= 999999
                        ? 10
                        : Math.min(
                            100,
                            ((subscription.extractionsToday || 0) / Math.max(1, subscription.dailyExtractionLimit)) * 100
                          )
                    }%`
                  }}
                />
              </div>
            </div>

            <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>Remaining Today:</span>
              <span className="font-bold text-slate-800">
                {subscription.dailyExtractionLimit >= 999999 ? 'Unlimited' : `${(subscription.remainingExtractionsToday || 0).toLocaleString()} contacts`}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Redeem License Key Box */}
      <div className="bg-white border-2 border-amber-200/80 rounded-3xl p-6 sm:p-7 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200 shrink-0 shadow-xs">
              <Key className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-900 tracking-tight">Activate or Extend License Key</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-xl">
                Purchased a software license key from an authorized admin or reseller? Enter your key code below to activate your edition, unlock multi-device slots, and extend your validity immediately.
              </p>
            </div>
          </div>

          <form onSubmit={handleRedeemKey} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full lg:w-auto shrink-0">
            <input
              type="text"
              placeholder="e.g. PVT-PRO-30D-XXXX-XXXX"
              value={licenseCode}
              onChange={(e) => setLicenseCode(e.target.value.toUpperCase())}
              className="px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-mono font-bold text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 uppercase min-w-[260px] sm:min-w-[300px]"
            />
            <button
              type="submit"
              disabled={isRedeeming || !licenseCode.trim()}
              className="px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold text-xs transition flex items-center justify-center gap-2 shadow-sm shadow-amber-500/20 cursor-pointer"
            >
              {isRedeeming ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Activating...
                </>
              ) : (
                <>
                  <Key className="w-4 h-4" />
                  Activate Key
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* ============================================================== */}
      {/* RESELLER PARTNER COMMAND CENTER (For Authorized Resellers)    */}
      {/* ============================================================== */}
      {isReseller && (
        <div className="bg-white border-2 border-purple-200 rounded-3xl p-6 sm:p-7 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center border border-purple-200 shrink-0">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-purple-100 text-purple-800 tracking-wider">
                      PARTNER PORTAL
                    </span>
                    <h3 className="text-lg font-bold text-slate-900 tracking-tight">Reseller License Command Center</h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Generate and deliver software licenses to your buyers within your authorized quota set by administration.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setShowResellerGenModal(true)}
                disabled={(resellerStats?.remainingQuota || 0) <= 0}
                className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Generate License Key
              </button>
              <button
                type="button"
                onClick={loadResellerData}
                disabled={loadingResellerData}
                className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                title="Refresh Reseller Data"
              >
                <RefreshCw className={`w-4 h-4 ${loadingResellerData ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Reseller Quota Gauges */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Quota</span>
              <div className="text-2xl font-extrabold text-slate-900 mt-1">
                {resellerStats?.totalQuota || 0}
              </div>
              <span className="text-[10px] text-slate-500 font-medium">Assigned by admin</span>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Keys Created</span>
              <div className="text-2xl font-extrabold text-purple-700 mt-1">
                {resellerStats?.keysCreated || 0}
              </div>
              <span className="text-[10px] text-slate-500 font-medium">Generated so far</span>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Available Credits</span>
              <div className={`text-2xl font-extrabold mt-1 ${
                (resellerStats?.remainingQuota || 0) <= 0 ? 'text-rose-600' : 'text-emerald-600'
              }`}>
                {resellerStats?.remainingQuota || 0}
              </div>
              <span className="text-[10px] text-slate-500 font-medium">Keys left to mint</span>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Activations</span>
              <div className="text-2xl font-extrabold text-slate-900 mt-1">
                {resellerStats?.keysUsed || 0}
              </div>
              <span className="text-[10px] text-slate-500 font-medium">Redeemed by buyers</span>
            </div>
          </div>

          {/* Reseller Keys Table */}
          <div className="space-y-3 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-2xl text-xs font-semibold">
                {(['all', 'available', 'used', 'revoked'] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setResellerKeyFilter(filter)}
                    className={`px-3 py-1.5 rounded-xl capitalize transition ${
                      resellerKeyFilter === filter ? 'bg-white text-slate-900 font-bold shadow-xs' : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>

              <input
                type="text"
                placeholder="Search your generated keys..."
                value={resellerKeySearch}
                onChange={(e) => setResellerKeySearch(e.target.value)}
                className="px-3.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-purple-500/20 w-64"
              />
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-400 font-bold">
                  <tr>
                    <th className="py-3 px-4">License Key Code</th>
                    <th className="py-3 px-4">Edition</th>
                    <th className="py-3 px-4">Validity</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Order Note</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredResellerKeys.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        {resellerKeys.length === 0
                          ? 'You haven\'t created any license keys yet. Click "Generate License Key" above.'
                          : 'No keys match your search criteria.'}
                      </td>
                    </tr>
                  ) : (
                    filteredResellerKeys.map((key) => {
                      const isLifetime = key.duration_days <= 0 || key.duration_days >= 9999;
                      return (
                        <tr key={key.id} className="hover:bg-slate-50/50 transition">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                {key.code}
                              </span>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(key.code)}
                                title="Copy Key"
                                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-purple-50 text-purple-700 border border-purple-200">
                              {key.plan_tier}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-700">
                            {isLifetime ? 'Lifetime' : `${key.duration_days} Days`}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                key.status === 'available'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : key.status === 'used'
                                  ? 'bg-slate-100 text-slate-600 border border-slate-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              {key.status}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            {key.used_by_username ? (
                              <span className="font-bold text-slate-900">@{key.used_by_username}</span>
                            ) : (
                              <span className="text-slate-400 italic">Not redeemed yet</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-500 max-w-[160px] truncate">
                            {key.note || '—'}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => copyWhatsAppDeliveryMessage(key)}
                                title="Copy WhatsApp message template for buyer"
                                className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-bold flex items-center gap-1 transition border border-emerald-200"
                              >
                                <MessageCircle className="w-3 h-3 text-emerald-600" />
                                Send on WA
                              </button>
                              {key.status !== 'revoked' && (
                                <button
                                  type="button"
                                  onClick={() => handleResellerRevokeKey(key.id)}
                                  title="Revoke Key"
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                                >
                                  <Ban className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* License Editions Catalog */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900 tracking-tight">Available Software License Editions</h3>
            <p className="text-xs text-slate-500">
              Pick the right license capacity for your marketing team and outreach volume.
            </p>
          </div>
        </div>

        {/* Pricing & Editions Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {plans.map((plan) => {
            const isCurrent = subscription?.planTier === plan.id;
            const isTrialPlan = plan.id === 'trial';

            return (
              <div
                key={plan.id}
                className={`bg-white rounded-3xl p-6 flex flex-col justify-between transition-all relative overflow-hidden ${
                  plan.is_popular
                    ? 'border-2 border-purple-600 shadow-lg shadow-purple-600/5 ring-4 ring-purple-600/5'
                    : isTrialPlan
                    ? 'border-2 border-amber-300 shadow-xs'
                    : 'border border-slate-200 shadow-xs hover:border-slate-300'
                }`}
              >
                {/* Popular / Trial Pill */}
                {plan.is_popular && (
                  <div className="absolute top-0 right-0 bg-purple-600 text-white text-[10px] font-extrabold uppercase px-3.5 py-1 rounded-bl-xl tracking-wider">
                    RECOMMENDED
                  </div>
                )}
                {isTrialPlan && (
                  <div className="absolute top-0 right-0 bg-amber-500 text-white text-[10px] font-extrabold uppercase px-3.5 py-1 rounded-bl-xl tracking-wider">
                    FREE TRIAL
                  </div>
                )}

                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-base font-bold text-slate-900">{plan.name}</h4>
                    {isCurrent && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        ACTIVE NOW
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 min-h-[36px]">{plan.tagline}</p>

                  {/* Core Capacity Highlights */}
                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 space-y-2 text-xs text-slate-700 my-5">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 font-medium text-slate-600">
                        <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                        Multi-Device Slots:
                      </span>
                      <span className="font-extrabold text-slate-900">{plan.max_devices} WhatsApp Account(s)</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 font-medium text-slate-600">
                        <Send className="w-3.5 h-3.5 text-purple-600" />
                        Daily Dispatch Quota:
                      </span>
                      <span className="font-extrabold text-slate-900">{plan.daily_message_limit.toLocaleString()} msgs / day</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 font-medium text-slate-600">
                        <Layers className="w-3.5 h-3.5 text-indigo-600" />
                        Extraction Quota:
                      </span>
                      <span className="font-extrabold text-slate-900">
                        {plan.daily_extraction_limit >= 999999 ? 'Unlimited' : `${(plan.daily_extraction_limit || 500).toLocaleString()} / day`}
                      </span>
                    </div>
                    {isTrialPlan && (
                      <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-amber-700">
                        <span className="flex items-center gap-1.5 font-medium">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          Default Trial Period:
                        </span>
                        <span className="font-extrabold">{plan.trial_days || 3} Days</span>
                      </div>
                    )}
                  </div>

                  {/* Feature Checklist */}
                  <ul className="space-y-2.5 text-xs text-slate-600 mb-6">
                    {plan.features.map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Purchase / Contact Admin CTA & Admin Configure */}
                <div className="pt-2 space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      const msg = `Hello! I would like to buy a license key for Private WhatsApp Sender (${plan.name} - ${plan.max_devices} Devices, ${plan.daily_message_limit} msgs/day). Please share payment details.`;
                      copyToClipboard(msg);
                      alert('Inquiry text copied to clipboard! You can now send it to the software administrator on WhatsApp.');
                    }}
                    className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-xs cursor-pointer ${
                      isCurrent
                        ? 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        : plan.is_popular
                        ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-600/20'
                        : isTrialPlan
                        ? 'bg-amber-500 hover:bg-amber-600 text-white'
                        : 'bg-slate-900 hover:bg-slate-800 text-white'
                    }`}
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    {isCurrent ? 'Copy Renew Request' : isTrialPlan ? 'Trial Included on Signup' : `Request ${plan.name}`}
                  </button>

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleOpenEditPlan(plan)}
                      className="w-full py-2 px-3 rounded-xl text-[11px] font-bold transition flex items-center justify-center gap-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 hover:border-slate-300 cursor-pointer"
                      title="Adjust global default limits, devices, and quotas for this edition"
                    >
                      <Sliders className="w-3 h-3 text-purple-600" />
                      Configure Limits (Admin)
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ============================================================== */}
      {/* ADMIN LICENSE CONTROL CENTER (Only visible to admin)           */}
      {/* ============================================================== */}
      {isAdmin && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-purple-100 text-purple-800 tracking-wider">
                  MASTER ADMIN CONTROL
                </span>
                <h3 className="text-lg font-bold text-slate-900">License Management Portal</h3>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Generate new license keys to sell, track activations, manage customer validity, and revoke access.
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setShowGenModal(true)}
                className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Generate License Key(s)
              </button>
              <button
                type="button"
                onClick={loadAdminData}
                disabled={loadingAdminData}
                className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                title="Refresh Admin Data"
              >
                <RefreshCw className={`w-4 h-4 ${loadingAdminData ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Admin Tabs */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setAdminTab('keys')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                adminTab === 'keys'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              <Key className="w-3.5 h-3.5" />
              Generated License Keys ({licenseKeys.length})
            </button>
            <button
              type="button"
              onClick={() => setAdminTab('customers')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                adminTab === 'customers'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Customer Accounts ({customers.length})
            </button>
            <button
              type="button"
              onClick={() => setAdminTab('resellers')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                adminTab === 'resellers'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              <Award className="w-3.5 h-3.5" />
              Reseller Partners ({resellers.length})
            </button>
          </div>

          {/* Tab 1: License Keys Table */}
          {adminTab === 'keys' && (
            <div className="space-y-4">
              {/* Filter bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-2xl text-xs font-semibold">
                  {(['all', 'available', 'used', 'revoked'] as const).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setKeyFilter(filter)}
                      className={`px-3 py-1.5 rounded-xl capitalize transition ${
                        keyFilter === filter ? 'bg-white text-slate-900 font-bold shadow-xs' : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search by key code, user, or note..."
                    value={keySearch}
                    onChange={(e) => setKeySearch(e.target.value)}
                    className="pl-8 pr-4 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-purple-500/20 w-64"
                  />
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-400 font-bold">
                    <tr>
                      <th className="py-3 px-4">License Key Code</th>
                      <th className="py-3 px-4">Edition</th>
                      <th className="py-3 px-4">Validity</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Redeemed By</th>
                      <th className="py-3 px-4">Note / Order</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredKeys.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400">
                          No license keys match your filter.
                        </td>
                      </tr>
                    ) : (
                      filteredKeys.map((key) => {
                        const isLifetime = key.duration_days <= 0 || key.duration_days >= 9999;
                        return (
                          <tr key={key.id} className="hover:bg-slate-50/50 transition">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                  {key.code}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(key.code)}
                                  title="Copy Key"
                                  className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                                {copiedKey === key.code && (
                                  <span className="text-[10px] text-emerald-600 font-bold">Copied!</span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-purple-50 text-purple-700 border border-purple-200">
                                {key.plan_tier}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-semibold text-slate-700">
                              {isLifetime ? 'Lifetime' : `${key.duration_days} Days`}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  key.status === 'available'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : key.status === 'used'
                                    ? 'bg-slate-100 text-slate-600 border border-slate-200'
                                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                                }`}
                              >
                                {key.status || (key.is_used ? 'used' : 'available')}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              {key.used_by_username ? (
                                <div>
                                  <span className="font-bold text-slate-800">@{key.used_by_username}</span>
                                  {key.used_at && (
                                    <span className="block text-[10px] text-slate-400">
                                      on {new Date(key.used_at).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400 italic">Not redeemed</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-slate-500 max-w-[150px] truncate" title={key.note || ''}>
                              {key.note || '-'}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => copyWhatsAppDeliveryMessage(key)}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-bold transition flex items-center gap-1 border border-emerald-200"
                                  title="Copy ready-to-send WhatsApp message for buyer"
                                >
                                  <MessageCircle className="w-3 h-3" />
                                  Send on WA
                                </button>
                                {key.status !== 'revoked' && (
                                  <button
                                    type="button"
                                    onClick={() => handleRevokeKey(key.id)}
                                    className="p-1 rounded text-rose-600 hover:bg-rose-50 transition"
                                    title="Revoke License Key"
                                  >
                                    <Ban className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {key.status !== 'used' && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteKey(key.id)}
                                    className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                                    title="Delete Key"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 2: Customer Accounts Table */}
          {adminTab === 'customers' && (
            <div className="overflow-x-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-400 font-bold">
                  <tr>
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Active Plan</th>
                    <th className="py-3 px-4">Daily Broadcast</th>
                    <th className="py-3 px-4">Daily Extraction</th>
                    <th className="py-3 px-4">WhatsApp Slots</th>
                    <th className="py-3 px-4">Validity Remaining</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions & Limits</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customers.map((c) => {
                    const isLifetime = c.role === 'admin' || !c.subscription_expires_at;
                    let daysLeft: number | null = null;
                    if (c.subscription_expires_at) {
                      daysLeft = Math.max(0, Math.ceil((new Date(c.subscription_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
                    }

                    return (
                      <tr key={c.id} className="hover:bg-slate-50/50 transition">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{c.name || c.username}</div>
                          <div className="text-[11px] text-slate-400">@{c.username}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                            c.plan_tier === 'trial'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-purple-50 text-purple-700 border border-purple-200'
                          }`}>
                            {c.plan_tier}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-800">
                          {c.daily_message_limit ? `${c.daily_message_limit.toLocaleString()} /d` : '—'}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-800">
                          {c.daily_extraction_limit >= 999999 ? 'Unlimited' : (c.daily_extraction_limit ? `${c.daily_extraction_limit.toLocaleString()} /d` : '—')}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-700">
                          {c.connected_devices || 0} / {c.max_devices} slots
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-700">
                          {isLifetime ? (
                            <span className="text-purple-700 font-bold flex items-center gap-1">
                              <InfinityIcon className="w-3.5 h-3.5" /> Lifetime
                            </span>
                          ) : (
                            `${daysLeft} days`
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              c.subscription_status === 'active'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : c.subscription_status === 'trialing'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {c.subscription_status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEditCustomer(c)}
                              className="px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 text-[11px] font-bold transition flex items-center gap-1 border border-purple-200 cursor-pointer"
                              title="Edit user plan, daily broadcast quota, extraction limit, and devices"
                            >
                              <Sliders className="w-3 h-3 text-purple-600" />
                              Edit Limits
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickExtendCustomer(c.id, 30)}
                              className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition"
                            >
                              +30d
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickExtendCustomer(c.id, 9999)}
                              className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition"
                            >
                              Lifetime
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab 3: Reseller Partners Management */}
          {adminTab === 'resellers' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-slate-500">
                    Authorize distributors & partners to generate license keys up to a pre-allocated quota.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddResellerModal(true)}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  + Promote / Add Reseller
                </button>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-400 font-bold">
                    <tr>
                      <th className="py-3 px-4">Reseller Partner</th>
                      <th className="py-3 px-4">Total Quota</th>
                      <th className="py-3 px-4">Keys Minted</th>
                      <th className="py-3 px-4">Available Credits</th>
                      <th className="py-3 px-4">Customer Activations</th>
                      <th className="py-3 px-4">Authorized Since</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {resellers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400">
                          No reseller partners registered yet. Click "+ Promote / Add Reseller" to authorize an existing user.
                        </td>
                      </tr>
                    ) : (
                      resellers.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50/50 transition">
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900">{r.name || r.username}</div>
                            <div className="text-[11px] text-slate-400">@{r.username} {r.email ? `• ${r.email}` : ''}</div>
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-800">
                            {r.reseller_license_quota} Keys
                          </td>
                          <td className="py-3 px-4 font-bold text-purple-700">
                            {r.keys_created_count}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-extrabold ${
                              r.remaining_quota <= 0 ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}>
                              {r.remaining_quota} Available
                            </span>
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-700">
                            {r.keys_used_count} Redeemed
                          </td>
                          <td className="py-3 px-4 text-slate-500 text-[11px]">
                            {new Date(r.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedResellerForCredits(r);
                                  setShowAddCreditsModal(true);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 text-[11px] font-bold transition flex items-center gap-1 border border-purple-200"
                                title="Add license quota credits"
                              >
                                <Coins className="w-3 h-3" />
                                + Add Credits
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDemoteReseller(r)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                                title="Demote to normal user"
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: GENERATE LICENSE KEY(S)                                 */}
      {/* ============================================================== */}
      {showGenModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-lg w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-200">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-900">Generate Software License Keys</h4>
                  <p className="text-xs text-slate-500">Create new keys for customers or resellers.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGenModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGenerateKeys} className="space-y-4">
              {/* Plan Tier Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">License Edition</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['starter', 'pro', 'enterprise'] as const).map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => setGenPlan(tier)}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold uppercase transition ${
                        genPlan === tier
                          ? 'bg-purple-600 border-purple-600 text-white shadow-xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {tier}
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration Selection */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Validity Duration</label>
                  <select
                    value={genDuration}
                    onChange={(e) => setGenDuration(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-purple-500/20"
                  >
                    <option value="7">7 Days (Weekly Trial)</option>
                    <option value="15">15 Days (Half-Month)</option>
                    <option value="30">30 Days (1 Month)</option>
                    <option value="90">90 Days (Quarterly)</option>
                    <option value="180">180 Days (Half-Year)</option>
                    <option value="365">365 Days (1 Year)</option>
                    <option value="9999">Lifetime Permanent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Quantity to Generate</label>
                  <select
                    value={genCount}
                    onChange={(e) => setGenCount(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-purple-500/20"
                  >
                    <option value="1">1 Key (Single)</option>
                    <option value="5">5 Keys (Batch)</option>
                    <option value="10">10 Keys (Pack)</option>
                    <option value="20">20 Keys (Bulk Pack)</option>
                  </select>
                </div>
              </div>

              {/* Optional Custom Overrides */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">
                    Custom Devices (Optional)
                  </label>
                  <input
                    type="number"
                    placeholder="Plan default"
                    value={genCustomDevices}
                    onChange={(e) => setGenCustomDevices(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-purple-500/20"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">
                    Custom Daily Quota (Optional)
                  </label>
                  <input
                    type="number"
                    placeholder="Plan default"
                    value={genCustomDaily}
                    onChange={(e) => setGenCustomDaily(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-purple-500/20"
                  />
                </div>
              </div>

              {/* Buyer Note / Label */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Customer Name / Buyer Note</label>
                <input
                  type="text"
                  placeholder="e.g. Sold to Rahul (UPI ₹1,499 via WhatsApp)"
                  value={genNote}
                  onChange={(e) => setGenNote(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-purple-500/20"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowGenModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isGeneratingKey}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer"
                >
                  {isGeneratingKey ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Key className="w-3.5 h-3.5" />
                      Generate {genCount} Key(s)
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ============================================================== */}
      {/* MODAL: RESELLER GENERATE LICENSE KEY(S)                        */}
      {/* ============================================================== */}
      {showResellerGenModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-lg w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-200">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-900">Mint Buyer License Key</h4>
                  <p className="text-xs text-slate-500">Remaining Quota: <span className="font-bold text-purple-700">{resellerStats?.remainingQuota || 0} Credits</span></p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowResellerGenModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleResellerGenerateKeys} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">License Edition</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['starter', 'pro', 'enterprise'] as const).map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => setGenPlan(tier)}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold uppercase transition ${
                        genPlan === tier
                          ? 'bg-purple-600 border-purple-600 text-white shadow-xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {tier}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Validity Duration</label>
                  <select
                    value={genDuration}
                    onChange={(e) => setGenDuration(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-purple-500/20"
                  >
                    <option value="7">7 Days (Weekly Trial)</option>
                    <option value="15">15 Days (Half-Month)</option>
                    <option value="30">30 Days (1 Month)</option>
                    <option value="90">90 Days (Quarterly)</option>
                    <option value="180">180 Days (Half-Year)</option>
                    <option value="365">365 Days (1 Year)</option>
                    <option value="9999">Lifetime Permanent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Quantity to Mint</label>
                  <select
                    value={genCount}
                    onChange={(e) => setGenCount(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-purple-500/20"
                  >
                    <option value="1">1 Key (Single)</option>
                    {(resellerStats?.remainingQuota || 0) >= 5 && <option value="5">5 Keys (Batch)</option>}
                    {(resellerStats?.remainingQuota || 0) >= 10 && <option value="10">10 Keys (Pack)</option>}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Customer Name / Buyer Note</label>
                <input
                  type="text"
                  placeholder="e.g. Sold to Akash via WhatsApp (Cash/UPI)"
                  value={genNote}
                  onChange={(e) => setGenNote(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-purple-500/20"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowResellerGenModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isGeneratingKey || (resellerStats?.remainingQuota || 0) < parseInt(genCount, 10)}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer"
                >
                  {isGeneratingKey ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Minting...
                    </>
                  ) : (
                    <>
                      <Key className="w-3.5 h-3.5" />
                      Mint {genCount} Key(s)
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: ADMIN PROMOTE / ADD RESELLER                            */}
      {/* ============================================================== */}
      {showAddResellerModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-md w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-200">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-900">Authorize Reseller Partner</h4>
                  <p className="text-xs text-slate-500">Promote a user and assign license generation quota.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddResellerModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handlePromoteToReseller} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Select User Account</label>
                <select
                  value={selectedResellerUser}
                  onChange={(e) => setSelectedResellerUser(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-purple-500/20"
                >
                  <option value="">-- Choose User --</option>
                  {customers
                    .filter((c) => c.role !== 'admin' && c.role !== 'reseller')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name ? `${c.name} (@${c.username})` : `@${c.username}`}
                      </option>
                    ))}
                </select>
                {customers.filter((c) => c.role !== 'admin' && c.role !== 'reseller').length === 0 && (
                  <p className="text-[11px] text-amber-600 mt-1">
                    No eligible user accounts found. All users are already admins or resellers.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Authorized License Key Quota</label>
                <div className="flex items-center gap-2 mb-2">
                  {['10', '25', '50', '100'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setNewResellerQuota(preset)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold border transition ${
                        newResellerQuota === preset
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {preset} Keys
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={newResellerQuota}
                  onChange={(e) => setNewResellerQuota(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-purple-500/20"
                  placeholder="Custom quota number..."
                  required
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  The reseller will be permitted to mint up to this number of customer license keys.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddResellerModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedResellerUser}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer"
                >
                  <Award className="w-3.5 h-3.5" />
                  Authorize Reseller
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: ADMIN ADD CREDITS TO RESELLER                          */}
      {/* ============================================================== */}
      {showAddCreditsModal && selectedResellerForCredits && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-md w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-900">Add Reseller Credits</h4>
                  <p className="text-xs text-slate-500">Partner: <span className="font-bold text-slate-800">@{selectedResellerForCredits.username}</span></p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddCreditsModal(false);
                  setSelectedResellerForCredits(null);
                }}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddCreditsSubmit} className="space-y-4">
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 space-y-1.5 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Current Quota:</span>
                  <span className="font-bold text-slate-900">{selectedResellerForCredits.reseller_license_quota} keys</span>
                </div>
                <div className="flex justify-between">
                  <span>Keys Already Minted:</span>
                  <span className="font-bold text-purple-700">{selectedResellerForCredits.keys_created_count} keys</span>
                </div>
                <div className="flex justify-between">
                  <span>Current Remaining:</span>
                  <span className="font-bold text-emerald-600">{selectedResellerForCredits.remaining_quota} keys</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Additional License Credits to Add</label>
                <div className="flex items-center gap-2 mb-2">
                  {['5', '10', '25', '50', '100'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAdditionalCredits(preset)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold border transition ${
                        additionalCredits === preset
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      +{preset}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={additionalCredits}
                  onChange={(e) => setAdditionalCredits(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-purple-500/20"
                  required
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  New total quota will be: <strong className="text-slate-800">{(selectedResellerForCredits.reseller_license_quota || 0) + (parseInt(additionalCredits, 10) || 0)} keys</strong>.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddCreditsModal(false);
                    setSelectedResellerForCredits(null);
                  }}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer"
                >
                  <Coins className="w-3.5 h-3.5" />
                  Grant +{additionalCredits} Credits
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: ADMIN EDIT CUSTOMER PLAN & LIMITS                       */}
      {/* ============================================================== */}
      {showEditCustomerModal && editCustomer && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-lg w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-200">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-900">Edit Customer Limits & Quotas</h4>
                  <p className="text-xs text-slate-500">
                    User: <span className="font-bold text-slate-800">@{editCustomer.username}</span>
                    {editCustomer.name ? ` (${editCustomer.name})` : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowEditCustomerModal(false);
                  setEditCustomer(null);
                }}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCustomerLimits} className="space-y-4">
              {/* Plan Tier Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Assigned Plan Tier</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['trial', 'starter', 'pro', 'enterprise'] as const).map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => setEditCustomerPlan(tier)}
                      className={`py-2 px-2.5 rounded-xl border text-[11px] font-bold uppercase transition ${
                        editCustomerPlan === tier
                          ? tier === 'trial'
                            ? 'bg-amber-500 border-amber-500 text-white shadow-xs'
                            : 'bg-purple-600 border-purple-600 text-white shadow-xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {tier}
                    </button>
                  ))}
                </div>
              </div>

              {/* Subscription Status */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Account Status</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['trialing', 'active', 'expired', 'canceled'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setEditCustomerStatus(st)}
                      className={`py-1.5 px-2 rounded-xl border text-[11px] font-bold capitalize transition ${
                        editCustomerStatus === st
                          ? st === 'active'
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : st === 'trialing'
                            ? 'bg-amber-500 border-amber-500 text-white'
                            : 'bg-rose-600 border-rose-600 text-white'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Daily Broadcast Limit */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5 text-purple-600" />
                    Daily Message Broadcast Limit
                  </label>
                  <span className="text-[11px] text-slate-500">msgs / day</span>
                </div>
                <div className="flex items-center gap-1.5 mb-2">
                  {['25', '100', '500', '1000', '5000'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setEditCustomerDailyBroadcast(preset)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                        editCustomerDailyBroadcast === preset
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min="0"
                  max="1000000"
                  value={editCustomerDailyBroadcast}
                  onChange={(e) => setEditCustomerDailyBroadcast(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-purple-500/20"
                  required
                />
              </div>

              {/* Daily Extraction Limit */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-indigo-600" />
                    Daily Group Contact Extraction Limit
                  </label>
                  <span className="text-[11px] text-slate-500">contacts / day</span>
                </div>
                <div className="flex items-center gap-1.5 mb-2">
                  {['50', '200', '1000', '5000', '999999'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setEditCustomerDailyExtraction(preset)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                        editCustomerDailyExtraction === preset
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {preset === '999999' ? 'Unlimited' : preset}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min="0"
                  max="1000000"
                  value={editCustomerDailyExtraction}
                  onChange={(e) => setEditCustomerDailyExtraction(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-purple-500/20"
                  required
                />
              </div>

              {/* Max Devices */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                    WhatsApp Multi-Device Slots
                  </label>
                  <span className="text-[11px] text-slate-500">devices</span>
                </div>
                <div className="flex items-center gap-1.5 mb-2">
                  {['1', '2', '3', '5', '10'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setEditCustomerMaxDevices(preset)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                        editCustomerMaxDevices === preset
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={editCustomerMaxDevices}
                  onChange={(e) => setEditCustomerMaxDevices(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-purple-500/20"
                  required
                />
              </div>

              {/* Adjust Validity Duration */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Adjust Validity / Expiry</label>
                <select
                  value={editCustomerDurationDays}
                  onChange={(e) => setEditCustomerDurationDays(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-purple-500/20"
                >
                  <option value="">Keep Current Expiration Date</option>
                  <option value="3">Set to 3 Days (Standard Trial)</option>
                  <option value="7">Set to 7 Days (Extended Trial)</option>
                  <option value="30">Extend / Set to 30 Days (1 Month)</option>
                  <option value="90">Extend / Set to 90 Days (3 Months)</option>
                  <option value="365">Extend / Set to 365 Days (1 Year)</option>
                  <option value="9999">Set Lifetime Permanent Access</option>
                  <option value="0">Expire Immediately (0 Days)</option>
                </select>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Select an option to update or extend the user's validity period.
                </span>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditCustomerModal(false);
                    setEditCustomer(null);
                  }}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingCustomer}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer"
                >
                  {isSavingCustomer ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Saving Changes...
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Save User Limits
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: ADMIN CONFIGURE PLAN TIER DEFAULTS                      */}
      {/* ============================================================== */}
      {showEditPlanModal && editPlan && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-lg w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-200">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-900">Configure Plan Tier Limits</h4>
                  <p className="text-xs text-slate-500">
                    Global defaults for <span className="font-bold text-purple-700 uppercase">{editPlan.name}</span> Edition
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowEditPlanModal(false);
                  setEditPlan(null);
                }}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePlanLimits} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Plan Display Name</label>
                <input
                  type="text"
                  value={editPlanName}
                  onChange={(e) => setEditPlanName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-purple-500/20"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Tagline / Description</label>
                <input
                  type="text"
                  value={editPlanTagline}
                  onChange={(e) => setEditPlanTagline(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-purple-500/20"
                  required
                />
              </div>

              {/* Daily Broadcast Limit */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5 text-purple-600" />
                    Default Daily Message Broadcast Limit
                  </label>
                  <span className="text-[11px] text-slate-500">msgs / day</span>
                </div>
                <div className="flex items-center gap-1.5 mb-2">
                  {['25', '100', '500', '1000', '5000'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setEditPlanDailyBroadcast(preset)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                        editPlanDailyBroadcast === preset
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min="0"
                  value={editPlanDailyBroadcast}
                  onChange={(e) => setEditPlanDailyBroadcast(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-purple-500/20"
                  required
                />
              </div>

              {/* Daily Extraction Limit */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-indigo-600" />
                    Default Daily Contact Extraction Limit
                  </label>
                  <span className="text-[11px] text-slate-500">contacts / day</span>
                </div>
                <div className="flex items-center gap-1.5 mb-2">
                  {['50', '200', '1000', '5000', '999999'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setEditPlanDailyExtraction(preset)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                        editPlanDailyExtraction === preset
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {preset === '999999' ? 'Unlimited' : preset}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min="0"
                  value={editPlanDailyExtraction}
                  onChange={(e) => setEditPlanDailyExtraction(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-purple-500/20"
                  required
                />
              </div>

              {/* Max Devices */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                    Authorized WhatsApp Device Slots
                  </label>
                  <span className="text-[11px] text-slate-500">devices</span>
                </div>
                <div className="flex items-center gap-1.5 mb-2">
                  {['1', '2', '3', '5', '10'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setEditPlanMaxDevices(preset)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                        editPlanMaxDevices === preset
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={editPlanMaxDevices}
                  onChange={(e) => setEditPlanMaxDevices(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-purple-500/20"
                  required
                />
              </div>

              {/* If Trial Plan: Default Trial Duration */}
              {editPlan.id === 'trial' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      Default Trial Account Duration
                    </label>
                    <span className="text-[11px] text-amber-700">days</span>
                  </div>
                  <div className="flex items-center gap-1.5 mb-2">
                    {['1', '2', '3', '7', '14'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setEditPlanTrialDays(preset)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                          editPlanTrialDays === preset
                            ? 'bg-amber-500 text-white border-amber-500'
                            : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                        }`}
                      >
                        {preset} Days
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="90"
                    value={editPlanTrialDays}
                    onChange={(e) => setEditPlanTrialDays(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-amber-50/50 border border-amber-200 text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20"
                    required
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    All newly registered users will automatically receive this many free trial days.
                  </span>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditPlanModal(false);
                    setEditPlan(null);
                  }}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingPlan}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer"
                >
                  {isSavingPlan ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Saving Plan Limits...
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Save Plan Limits
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
