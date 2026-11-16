import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Sliders,
  DollarSign,
  Plus,
  Edit2,
  Check,
  RefreshCw,
  FileText,
  Clock,
  Layers,
  Percent,
  Gift,
  AlertCircle,
  Eye,
  TrendingUp,
  Users,
  Copy,
  Receipt
} from 'lucide-react';
import { crmApi } from './crmApi';
import {
  Button,
  Badge,
  Input,
  StatCard,
  Modal,
  Drawer,
  Skeleton
} from './ui/CrmDesignSystem';

export const AdminBillingCenter: React.FC = () => {
  const [plans, setPlans] = useState<any[]>([]);
  const [settings, setSettings] = useState<any | null>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Active Tab
  const [activeTab, setActiveTab] = useState<'plans' | 'settings' | 'grants' | 'invoices'>('plans');

  // Plan Edit Form & Modal
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<any | null>(null);
  const [planName, setPlanName] = useState('');
  const [planSlug, setPlanSlug] = useState('');
  const [planDescription, setPlanDescription] = useState('');
  const [planPrice, setPlanPrice] = useState('29.0');
  const [planContacts, setPlanContacts] = useState('10000');
  const [planBoards, setPlanBoards] = useState('10');
  const [planSuperFields, setPlanSuperFields] = useState('50');
  const [planTags, setPlanTags] = useState('100');
  const [planDuration, setPlanDuration] = useState('30');
  const [isSavingPlan, setIsSavingPlan] = useState(false);

  // Complimentary Grant Modal
  const [isGrantModalOpen, setIsGrantModalOpen] = useState(false);
  const [grantWorkspaceId, setGrantWorkspaceId] = useState('');
  const [grantPlanId, setGrantPlanId] = useState('');
  const [grantDuration, setGrantDuration] = useState('30');
  const [grantReason, setGrantReason] = useState('');
  const [isGranting, setIsGranting] = useState(false);

  // Settings form
  const [taxPercent, setTaxPercent] = useState('18.0');
  const [companyGstin, setCompanyGstin] = useState('07AAAAA0000A1Z5');
  const [companyName, setCompanyName] = useState('PVTSender Enterprise CRM');
  const [invoiceFooter, setInvoiceFooter] = useState('Thank you for choosing PVTSender Enterprise CRM!');
  const [graceDays, setGraceDays] = useState('3');
  const [minReserve, setMinReserve] = useState('0.0');
  const [autoPause, setAutoPause] = useState(true);
  const [retrySchedule, setRetrySchedule] = useState('1, 3, 5');
  const [overflowPolicy, setOverflowPolicy] = useState('partial_accept');
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  useEffect(() => {
    loadAdminData();
  }, []);

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const [plansRes, settingsRes, invRes] = await Promise.all([
        crmApi.listBillingPlans(),
        crmApi.getBillingSettings(),
        crmApi.listInvoices()
      ]);

      if (plansRes && plansRes.success) setPlans(plansRes.plans || []);
      if (invRes && invRes.success) setInvoices(invRes.invoices || []);
      if (settingsRes && settingsRes.success && settingsRes.settings) {
        const s = settingsRes.settings;
        setSettings(s);
        setTaxPercent(String(s.gst_vat_rate_percent ?? 18.0));
        setCompanyGstin(s.company_gstin || '07AAAAA0000A1Z5');
        setCompanyName(s.company_legal_name || 'PVTSender Enterprise CRM');
        setInvoiceFooter(s.invoice_footer || 'Thank you for choosing PVTSender Enterprise CRM!');
        setGraceDays(String(s.grace_period_days ?? 3));
        setMinReserve(String(s.minimum_wallet_reserve_usd ?? 0.0));
        setAutoPause(s.auto_pause_on_expiry !== false);
        setRetrySchedule(
          Array.isArray(s.renewal_retry_schedule_days)
            ? s.renewal_retry_schedule_days.join(', ')
            : '1, 3, 5'
        );
        setOverflowPolicy(s.quota_overflow_policy || 'partial_accept');
      }
    } catch (err) {
      console.error('Failed to load admin billing data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPlanModal = (plan?: any) => {
    if (plan) {
      setEditingPlan(plan);
      setPlanName(plan.name);
      setPlanSlug(plan.slug);
      setPlanDescription(plan.description || '');
      setPlanPrice(String(plan.price_usd));
      setPlanContacts(String(plan.quota_contacts));
      setPlanBoards(String(plan.quota_boards));
      setPlanSuperFields(String(plan.quota_super_fields));
      setPlanTags(String(plan.quota_tags));
      setPlanDuration(String(plan.duration_days));
    } else {
      setEditingPlan(null);
      setPlanName('');
      setPlanSlug('');
      setPlanDescription('');
      setPlanPrice('49.0');
      setPlanContacts('25000');
      setPlanBoards('20');
      setPlanSuperFields('100');
      setPlanTags('200');
      setPlanDuration('30');
    }
    setIsPlanModalOpen(true);
  };

  const handleSavePlan = async () => {
    if (!planName.trim()) return;
    setIsSavingPlan(true);
    try {
      const payload = {
        name: planName.trim(),
        slug: planSlug.trim() || planName.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        description: planDescription.trim(),
        price_usd: parseFloat(planPrice) || 0,
        quota_contacts: parseInt(planContacts, 10) || 1000,
        quota_boards: parseInt(planBoards, 10) || 1,
        quota_super_fields: parseInt(planSuperFields, 10) || 10,
        quota_tags: parseInt(planTags, 10) || 20,
        duration_days: parseInt(planDuration, 10) || 30,
        is_active: true
      };

      await crmApi.saveBillingPlan({
        ...(editingPlan ? { id: editingPlan.id } : {}),
        ...payload
      });
      setIsPlanModalOpen(false);
      loadAdminData();
    } catch (err: any) {
      alert(`Error saving plan: ${err.message}`);
    } finally {
      setIsSavingPlan(false);
    }
  };

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    try {
      const scheduleArray = retrySchedule
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));

      await crmApi.updateBillingSettings({
        gst_vat_rate_percent: parseFloat(taxPercent) || 18.0,
        company_gstin: companyGstin.trim(),
        company_legal_name: companyName.trim(),
        invoice_footer: invoiceFooter.trim(),
        grace_period_days: parseInt(graceDays, 10) || 3,
        minimum_wallet_reserve_usd: parseFloat(minReserve) || 0.0,
        auto_pause_on_expiry: autoPause,
        renewal_retry_schedule_days: scheduleArray,
        quota_overflow_policy: overflowPolicy
      });
      alert('Billing & Tax Settings saved successfully.');
      loadAdminData();
    } catch (err: any) {
      alert(`Error saving settings: ${err.message}`);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleExecuteGrant = async () => {
    if (!grantWorkspaceId.trim() || !grantPlanId || !grantReason.trim()) {
      alert('Workspace ID, Target Plan, and Mandatory Audit Reason are required.');
      return;
    }
    setIsGranting(true);
    try {
      const res = await crmApi.grantComplimentaryPlan({
        workspace_id: grantWorkspaceId.trim(),
        plan_id: grantPlanId,
        duration_days: parseInt(grantDuration, 10) || 30,
        reason: grantReason.trim()
      });
      alert(`Complimentary Plan granted! $0 Audited Invoice #${res.invoice?.invoice_number || 'Generated'} created.`);
      setIsGrantModalOpen(false);
      setGrantWorkspaceId('');
      setGrantReason('');
      loadAdminData();
    } catch (err: any) {
      alert(`Failed to grant complimentary plan: ${err.message}`);
    } finally {
      setIsGranting(false);
    }
  };

  // KPI Calculations
  const totalRevenueUsd = invoices
    .filter((inv) => inv.status === 'paid')
    .reduce((acc, curr) => acc + (curr.total_paid_usd || 0), 0);

  if (loading) {
    return (
      <div className="p-8 space-y-6 max-w-7xl mx-auto">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Admin Billing Management</h1>
            <Badge variant="rose" size="sm" dot>
              Admin Authorized
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Configure subscription tiers, wallet minimum reserves, tax rates, and issue complimentary grants.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            icon={<Gift className="w-3.5 h-3.5 text-indigo-600" />}
            onClick={() => {
              if (plans.length > 0) setGrantPlanId(plans[0].id);
              setIsGrantModalOpen(true);
            }}
          >
            Complimentary Grant
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => handleOpenPlanModal()}
          >
            Create Plan Tier
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Revenue"
          value={`$${totalRevenueUsd.toFixed(2)}`}
          subtitle="All-time settled wallet charges"
          icon={<DollarSign className="w-4 h-4 text-emerald-600" />}
          trend={{ value: 'Wallet Settled', positive: true }}
        />
        <StatCard
          label="Active Invoices"
          value={invoices.length}
          subtitle="Tax invoices issued"
          icon={<Receipt className="w-4 h-4 text-indigo-600" />}
        />
        <StatCard
          label="Catalog Tiers"
          value={plans.length}
          subtitle="Configured subscription plans"
          icon={<Layers className="w-4 h-4 text-cyan-600" />}
        />
        <StatCard
          label="GST/VAT Rate"
          value={`${settings?.gst_vat_rate_percent || 18}%`}
          subtitle={`GSTIN: ${settings?.company_gstin || 'Configured'}`}
          icon={<Percent className="w-4 h-4 text-purple-600" />}
        />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-6 text-sm">
        <button
          onClick={() => setActiveTab('plans')}
          className={`pb-3 font-semibold transition-all relative ${
            activeTab === 'plans' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          Subscription Catalog ({plans.length})
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`pb-3 font-semibold transition-all relative ${
            activeTab === 'settings' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          Billing & Tax Policies
        </button>
      </div>

      {/* TAB 1: Subscription Catalog */}
      {activeTab === 'plans' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((p) => (
              <div
                key={p.id}
                className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col justify-between hover:border-slate-300 hover:shadow-md transition-all shadow-xs"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-lg">{p.name}</span>
                    <Badge variant={p.is_active ? 'emerald' : 'slate'} size="xs">
                      {p.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500">{p.description || 'No description provided'}</p>

                  <div className="pt-2">
                    <div className="text-2xl font-black text-slate-900 font-mono">
                      ${p.price_usd.toFixed(2)} USD
                    </div>
                    <div className="text-[11px] text-slate-500">Duration: {p.duration_days} days · Slug: {p.slug}</div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-700">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Contacts Quota:</span>
                      <strong className="font-mono text-slate-900">
                        {p.quota_contacts === -1 ? 'Unlimited' : p.quota_contacts.toLocaleString()}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Boards Quota:</span>
                      <strong className="font-mono text-slate-900">{p.quota_boards}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Super Fields:</span>
                      <strong className="font-mono text-slate-900">{p.quota_super_fields}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Tags & Rules:</span>
                      <strong className="font-mono text-slate-900">{p.quota_tags}</strong>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    icon={<Edit2 className="w-3.5 h-3.5" />}
                    onClick={() => handleOpenPlanModal(p)}
                  >
                    Edit Tier
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: Billing & Tax Policies */}
      {activeTab === 'settings' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-3xl space-y-6 shadow-xs">
          <div>
            <h3 className="text-base font-bold text-slate-900">Tax & Invoicing Settings</h3>
            <p className="text-xs text-slate-500 mt-0.5">These parameters are used to calculate invoices and receipts server-side.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="GST / VAT Rate (%)"
              type="number"
              step="0.1"
              value={taxPercent}
              onChange={(e) => setTaxPercent(e.target.value)}
              hint="Dynamically referenced in Super Field formulas & invoices"
            />
            <Input
              label="Company GSTIN / Tax ID"
              value={companyGstin}
              onChange={(e) => setCompanyGstin(e.target.value)}
            />
            <Input
              label="Company Legal Name"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
            <Input
              label="Grace Period (Days)"
              type="number"
              value={graceDays}
              onChange={(e) => setGraceDays(e.target.value)}
              hint="Grace time before expired plans transition to read-only"
            />
            <Input
              label="Minimum Wallet Reserve ($ USD)"
              type="number"
              step="1"
              value={minReserve}
              onChange={(e) => setMinReserve(e.target.value)}
              hint="Minimum balance that must remain in user wallet after debit"
            />
            <Input
              label="Renewal Retry Schedule (Days)"
              value={retrySchedule}
              onChange={(e) => setRetrySchedule(e.target.value)}
              hint="Comma separated retry intervals (e.g. 1, 3, 5)"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">Invoice Footer Note</label>
            <textarea
              rows={2}
              value={invoiceFooter}
              onChange={(e) => setInvoiceFooter(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg p-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div>
              <div className="text-xs font-bold text-slate-900">Auto-Pause Features on Expiry</div>
              <div className="text-[11px] text-slate-500">Put workspace in read-only mode if renewal fails instead of deleting data.</div>
            </div>
            <input
              type="checkbox"
              checked={autoPause}
              onChange={(e) => setAutoPause(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
            />
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-200">
            <Button
              variant="primary"
              size="md"
              loading={isSavingSettings}
              icon={<Check className="w-4 h-4" />}
              onClick={handleSaveSettings}
            >
              Save Policy Changes
            </Button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: Create / Edit Plan Tier */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isPlanModalOpen}
        onClose={() => setIsPlanModalOpen(false)}
        title={editingPlan ? `Edit Tier: ${editingPlan.name}` : 'Create New Subscription Plan'}
        maxWidth="lg"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <Input
              label="Plan Display Name"
              placeholder="e.g. Enterprise 100M"
              value={planName}
              onChange={(e) => {
                setPlanName(e.target.value);
                if (!editingPlan) {
                  setPlanSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
                }
              }}
            />

            <Input
              label="Database Slug"
              placeholder="e.g. enterprise_100m"
              value={planSlug}
              onChange={(e) => setPlanSlug(e.target.value)}
            />

            <Input
              label="Description"
              placeholder="e.g. For large outbound marketing teams"
              value={planDescription}
              onChange={(e) => setPlanDescription(e.target.value)}
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Price ($ USD)"
                type="number"
                step="0.01"
                value={planPrice}
                onChange={(e) => setPlanPrice(e.target.value)}
              />
              <Input
                label="Duration (Days)"
                type="number"
                value={planDuration}
                onChange={(e) => setPlanDuration(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Contacts Quota (-1 for unlimited)"
                type="number"
                value={planContacts}
                onChange={(e) => setPlanContacts(e.target.value)}
              />
              <Input
                label="Boards Quota"
                type="number"
                value={planBoards}
                onChange={(e) => setPlanBoards(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Super Fields Quota"
                type="number"
                value={planSuperFields}
                onChange={(e) => setPlanSuperFields(e.target.value)}
              />
              <Input
                label="Tags Quota"
                type="number"
                value={planTags}
                onChange={(e) => setPlanTags(e.target.value)}
              />
            </div>
          </div>

          {/* Live Customer Preview Card */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <Eye className="w-3.5 h-3.5 text-indigo-600" /> Live Customer Preview
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 shadow-xs relative">
              <div className="space-y-3">
                <span className="text-base font-bold text-slate-900">{planName || 'Plan Name'}</span>
                <div className="text-2xl font-black text-slate-900 font-mono">
                  ${parseFloat(planPrice || '0').toFixed(2)} <span className="text-xs text-slate-500 font-normal">/ mo</span>
                </div>
                <div className="pt-3 border-t border-slate-200 space-y-1.5 text-xs text-slate-700">
                  <div>✓ <strong>{planContacts === '-1' ? 'Unlimited' : parseInt(planContacts || '0', 10).toLocaleString()}</strong> Contacts</div>
                  <div>✓ <strong>{planBoards}</strong> Kanban Boards</div>
                  <div>✓ <strong>{planSuperFields}</strong> Super Fields</div>
                  <div>✓ <strong>{planTags}</strong> Workspace Tags</div>
                </div>
              </div>
              <div className="mt-6 pt-3 border-t border-slate-200">
                <div className="w-full py-2 text-center rounded-lg bg-indigo-600 text-white font-bold text-xs shadow-xs">
                  Upgrade Now
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-6 mt-6 border-t border-slate-200">
          <Button variant="ghost" size="sm" onClick={() => setIsPlanModalOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" loading={isSavingPlan} onClick={handleSavePlan}>
            Save Tier
          </Button>
        </div>
      </Modal>

      {/* MODAL: Complimentary Grant */}
      <Modal
        isOpen={isGrantModalOpen}
        onClose={() => setIsGrantModalOpen(false)}
        title="Issue Complimentary Plan Grant"
        maxWidth="md"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600">
            Complimentary grants bypass payment gates legally by generating an official <strong>$0 audited tax invoice</strong> logged with your Admin ID and mandatory business reason.
          </p>

          <Input
            label="Target Workspace ID"
            placeholder="e.g. 6564a7c5-1fa6-4460-b06e-3c30551c6617"
            value={grantWorkspaceId}
            onChange={(e) => setGrantWorkspaceId(e.target.value)}
          />

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">Target Plan Tier</label>
            <select
              value={grantPlanId}
              onChange={(e) => setGrantPlanId(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            >
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (${p.price_usd}/mo)
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Grant Duration (Days)"
            type="number"
            value={grantDuration}
            onChange={(e) => setGrantDuration(e.target.value)}
          />

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">Mandatory Audit Reason</label>
            <textarea
              rows={3}
              placeholder="e.g. Strategic investor partnership agreement approved by executive team"
              value={grantReason}
              onChange={(e) => setGrantReason(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
            <Button variant="ghost" size="sm" onClick={() => setIsGrantModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={isGranting}
              disabled={!grantReason.trim()}
              onClick={handleExecuteGrant}
            >
              Issue $0 Grant
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
