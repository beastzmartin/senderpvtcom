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
  Percent
} from 'lucide-react';
import { crmApi } from './crmApi';

export const AdminBillingCenter: React.FC = () => {
  const [plans, setPlans] = useState<any[]>([]);
  const [settings, setSettings] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditPlanModalOpen, setIsEditPlanModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<any | null>(null);

  // Settings form
  const [taxPercent, setTaxPercent] = useState('18.0');
  const [companyGstin, setCompanyGstin] = useState('07AAAAA0000A1Z5');
  const [companyName, setCompanyName] = useState('PVTSender Enterprise');
  const [invoiceFooter, setInvoiceFooter] = useState('Thank you for choosing PVTSender Enterprise!');
  const [graceDays, setGraceDays] = useState('3');
  const [overflowPolicy, setOverflowPolicy] = useState('partial_accept');

  // Plan Edit Form
  const [planName, setPlanName] = useState('');
  const [planSlug, setPlanSlug] = useState('');
  const [planPrice, setPlanPrice] = useState('29.0');
  const [planContacts, setPlanContacts] = useState('10000');
  const [planBoards, setPlanBoards] = useState('10');
  const [planSuperFields, setPlanSuperFields] = useState('50');

  useEffect(() => {
    loadAdminData();
  }, []);

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const [plansRes, settingsRes] = await Promise.all([
        crmApi.listBillingPlans(),
        crmApi.getBillingSettings()
      ]);

      if (plansRes && plansRes.success) setPlans(plansRes.plans || []);
      if (settingsRes && settingsRes.success && settingsRes.settings) {
        const s = settingsRes.settings;
        setSettings(s);
        setTaxPercent(String(s.gst_vat_rate_percent || 18.0));
        setCompanyGstin(s.company_gstin || '07AAAAA0000A1Z5');
        setCompanyName(s.company_legal_name || 'PVTSender Enterprise');
        setInvoiceFooter(s.invoice_footer || 'Thank you for choosing PVTSender Enterprise!');
        setGraceDays(String(s.grace_period_days || 3));
        setOverflowPolicy(s.quota_overflow_policy || 'partial_accept');
      }
    } catch (err) {
      console.error('Failed to load admin billing data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      const res = await crmApi.updateBillingSettings({
        gst_vat_rate_percent: parseFloat(taxPercent) || 18.0,
        company_gstin: companyGstin,
        company_legal_name: companyName,
        invoice_footer: invoiceFooter,
        grace_period_days: parseInt(graceDays, 10) || 3,
        quota_overflow_policy: overflowPolicy
      });
      if (res && res.success) {
        alert('Billing configuration saved successfully!');
        loadAdminData();
      }
    } catch (err: any) {
      alert(`Error saving settings: ${err.message}`);
    }
  };

  const handleOpenPlanModal = (p?: any) => {
    if (p) {
      setEditingPlan(p);
      setPlanName(p.name);
      setPlanSlug(p.slug);
      setPlanPrice(String(p.price_usd));
      setPlanContacts(String(p.quota_contacts));
      setPlanBoards(String(p.quota_boards));
      setPlanSuperFields(String(p.quota_super_fields));
    } else {
      setEditingPlan(null);
      setPlanName('');
      setPlanSlug('');
      setPlanPrice('49.0');
      setPlanContacts('25000');
      setPlanBoards('15');
      setPlanSuperFields('75');
    }
    setIsEditPlanModalOpen(true);
  };

  const handleSavePlan = async () => {
    if (!planName.trim()) return;
    try {
      await crmApi.saveBillingPlan({
        id: editingPlan?.id,
        name: planName,
        slug: planSlug.trim() || planName.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        price_usd: parseFloat(planPrice) || 0.0,
        quota_contacts: parseInt(planContacts, 10) || 1000,
        quota_boards: parseInt(planBoards, 10) || 5,
        quota_super_fields: parseInt(planSuperFields, 10) || 25,
        duration_days: 30,
        is_active: true,
        is_visible: true
      });
      setIsEditPlanModalOpen(false);
      loadAdminData();
    } catch (err: any) {
      alert(`Error saving plan: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-purple-600 rounded-2xl text-white shadow-xs">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-slate-900 tracking-tight">Admin Billing Control Center</h2>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-purple-50 text-purple-700">
                Sovereign Wallet & Hard Limits
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Configure global plan pricing, sequential GST invoicing, tax rates & overflow policies
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => handleOpenPlanModal()}
          className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition"
        >
          <Plus className="w-4 h-4" />
          Add Billing Plan
        </button>
      </div>

      {/* Plans Catalog Management */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-200/60 flex items-center justify-between">
          <h3 className="font-black text-sm text-slate-900">Configured Billing Plans</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200/60">
                <th className="py-3 px-4">Plan Name</th>
                <th className="py-3 px-4">Slug</th>
                <th className="py-3 px-4">Price (USD)</th>
                <th className="py-3 px-4">Contacts Limit</th>
                <th className="py-3 px-4">Boards Limit</th>
                <th className="py-3 px-4">Super Fields Limit</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {plans.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/80 transition">
                  <td className="py-3.5 px-4 font-bold text-slate-900">{p.name}</td>
                  <td className="py-3.5 px-4 font-mono text-slate-500">{p.slug}</td>
                  <td className="py-3.5 px-4 font-bold text-slate-800">${p.price_usd} / mo</td>
                  <td className="py-3.5 px-4 font-mono font-semibold">{p.quota_contacts.toLocaleString()}</td>
                  <td className="py-3.5 px-4 font-mono font-semibold">{p.quota_boards}</td>
                  <td className="py-3.5 px-4 font-mono font-semibold">{p.quota_super_fields}</td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => handleOpenPlanModal(p)}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Global Billing Configuration Settings */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-6">
        <div>
          <h3 className="font-black text-sm text-slate-900 mb-1">Global Tax & Invoicing Settings</h3>
          <p className="text-xs text-slate-500">
            These values appear on all downloadable/printable sequential invoice receipts
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 uppercase mb-1">GST / VAT Rate (%)</label>
            <input
              type="text"
              value={taxPercent}
              onChange={(e) => setTaxPercent(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 font-medium"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 uppercase mb-1">Company GSTIN / Tax ID</label>
            <input
              type="text"
              value={companyGstin}
              onChange={(e) => setCompanyGstin(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 font-mono font-medium"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 uppercase mb-1">Company Legal Entity Name</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 font-medium"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 uppercase mb-1">Grace Period Days</label>
            <input
              type="text"
              value={graceDays}
              onChange={(e) => setGraceDays(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 font-medium"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block font-bold text-slate-700 uppercase mb-1">Invoice Receipt Footer Note</label>
            <input
              type="text"
              value={invoiceFooter}
              onChange={(e) => setInvoiceFooter(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 font-medium"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block font-bold text-slate-700 uppercase mb-1">Bulk Import Overflow Policy</label>
            <select
              value={overflowPolicy}
              onChange={(e) => setOverflowPolicy(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 font-bold bg-white"
            >
              <option value="partial_accept">Partial Accept (Import up to quota, discard rest)</option>
              <option value="reject_batch">Reject Entire Batch if Over Quota</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={handleSaveSettings}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-indigo-600 text-white font-bold text-xs rounded-xl hover:bg-indigo-700 shadow-xs"
          >
            <Check className="w-4 h-4" />
            Save Configuration
          </button>
        </div>
      </div>

      {/* Plan Modal */}
      {isEditPlanModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 border border-slate-200 shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-slate-900">
              {editingPlan ? 'Edit Billing Plan' : 'Create Billing Plan'}
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Plan Name</label>
                <input
                  type="text"
                  value={planName}
                  onChange={(e) => {
                    setPlanName(e.target.value);
                    if (!editingPlan) setPlanSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
                  }}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Plan Slug</label>
                <input
                  type="text"
                  value={planSlug}
                  onChange={(e) => setPlanSlug(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 font-mono font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Price USD</label>
                  <input
                    type="text"
                    value={planPrice}
                    onChange={(e) => setPlanPrice(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Contacts Quota</label>
                  <input
                    type="text"
                    value={planContacts}
                    onChange={(e) => setPlanContacts(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Boards Limit</label>
                  <input
                    type="text"
                    value={planBoards}
                    onChange={(e) => setPlanBoards(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Super Fields Limit</label>
                  <input
                    type="text"
                    value={planSuperFields}
                    onChange={(e) => setPlanSuperFields(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 font-medium"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsEditPlanModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePlan}
                className="px-5 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700"
              >
                Save Plan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

