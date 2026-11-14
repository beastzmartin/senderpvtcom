import React, { useState } from 'react';
import {
  X,
  Plus,
  Edit2,
  Trash2,
  ShieldCheck,
  Layers,
  Save,
  AlertCircle,
  CheckCircle2,
  Sliders,
  DollarSign
} from 'lucide-react';
import { api } from '../../services/api';
import { MarketplaceModule } from '../../types';

interface AdminMarketplaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  extensions: Array<{ id: string; name: string }>;
  onRefresh: () => void;
}

export const AdminMarketplaceModal: React.FC<AdminMarketplaceModalProps> = ({
  isOpen,
  onClose,
  extensions,
  onRefresh
}) => {
  const [activeTab, setActiveTab] = useState<'create_module' | 'user_override'>('create_module');

  // Form state for creating dynamic module
  const [extensionId, setExtensionId] = useState(extensions[0]?.id || 'google-maps-extractor');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Lead Extraction');
  const [icon, setIcon] = useState('⚡');
  const [activationFee, setActivationFee] = useState<number>(0);
  const [usageChargingModel, setUsageChargingModel] = useState('per_record');
  const [usagePrice, setUsagePrice] = useState<number>(0.1);
  const [periodQuotaLimit, setPeriodQuotaLimit] = useState<number>(1000);

  // Form state for user entitlement override
  const [overrideUserId, setOverrideUserId] = useState('');
  const [overrideModuleId, setOverrideModuleId] = useState('');
  const [overrideQuota, setOverrideQuota] = useState<number>(5000);
  const [overridePrice, setOverridePrice] = useState<number>(0.05);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const handleCreateModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) {
      setMsg({ type: 'error', text: 'Module Name and Slug are required.' });
      return;
    }

    try {
      setLoading(true);
      setMsg(null);
      await api.marketplace.adminCreateModule({
        extension_id: extensionId,
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        description: description.trim(),
        category,
        icon,
        activation_fee: Number(activationFee) || 0,
        usage_charging_model: usageChargingModel,
        usage_price: Number(usagePrice) || 0,
        period_quota_limit: Number(periodQuotaLimit) || 1000,
        features: ['Dynamic Lead Sync', 'Wallet Auto-Deduction', 'Manifest V3 Injector']
      });

      setMsg({ type: 'success', text: `Module "${name}" created and published successfully!` });
      setName('');
      setSlug('');
      setDescription('');
      onRefresh();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to create module.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSetOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideUserId.trim() || !overrideModuleId.trim()) {
      setMsg({ type: 'error', text: 'User ID and Module ID are required for custom entitlement override.' });
      return;
    }

    try {
      setLoading(true);
      setMsg(null);
      await api.marketplace.adminSetOverride({
        userId: overrideUserId.trim(),
        moduleId: overrideModuleId.trim(),
        quotaOverride: Number(overrideQuota),
        priceOverride: Number(overridePrice)
      });

      setMsg({
        type: 'success',
        text: `Custom quota and pricing override granted to user ${overrideUserId}!`
      });
      setOverrideUserId('');
      setOverrideModuleId('');
      onRefresh();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to set override.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-100">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/30 flex items-center justify-center border border-indigo-400/30">
              <ShieldCheck className="w-6 h-6 text-indigo-300" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Admin Module & Entitlements Engine</h2>
              <p className="text-slate-300 text-xs">
                Dynamically register new extension modules and control per-user quota overrides.
              </p>
            </div>
          </div>

          {/* Sub tabs */}
          <div className="flex gap-2 mt-4 pt-3 border-t border-white/10 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('create_module')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'create_module' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Register New Dynamic Module</span>
            </button>
            <button
              onClick={() => setActiveTab('user_override')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'user_override' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Customer Entitlement Overrides</span>
            </button>
          </div>
        </div>

        {msg && (
          <div
            className={`px-6 py-3 text-xs font-semibold flex items-center gap-2 border-b ${
              msg.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-red-50 text-red-800 border-red-200'
            }`}
          >
            {msg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600" />
            )}
            <span>{msg.text}</span>
          </div>
        )}

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {activeTab === 'create_module' ? (
            <form onSubmit={handleCreateModule} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Assign To Parent Extension
                </label>
                <select
                  value={extensionId}
                  onChange={(e) => setExtensionId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {extensions.map((ext) => (
                    <option key={ext.id} value={ext.id}>
                      {ext.name} ({ext.id})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Module Name</label>
                  <input
                    type="text"
                    placeholder="e.g. LinkedIn Contact Finder"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (!slug) {
                        setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Slug (System Identifier)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. linkedin-contact-finder"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Explain what this module extracts or automates..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Activation Fee (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={activationFee}
                    onChange={(e) => setActivationFee(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Billing Model
                  </label>
                  <select
                    value={usageChargingModel}
                    onChange={(e) => setUsageChargingModel(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="per_record">Per Record</option>
                    <option value="per_scan">Per Scan</option>
                    <option value="per_request">Per Request</option>
                    <option value="free">Free</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Usage Price (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={usagePrice}
                    onChange={(e) => setUsagePrice(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Publish Module to Marketplace</span>
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSetOverride} className="space-y-4 text-xs">
              <div className="p-3 bg-indigo-50 rounded-xl text-indigo-950">
                Grant custom usage limits or discounted per-record pricing to high-volume enterprise
                clients.
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Target User ID</label>
                <input
                  type="text"
                  placeholder="e.g. user_173000..."
                  value={overrideUserId}
                  onChange={(e) => setOverrideUserId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Module ID</label>
                <input
                  type="text"
                  placeholder="e.g. gmaps-search or website-scanner"
                  value={overrideModuleId}
                  onChange={(e) => setOverrideModuleId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Monthly Quota Limit
                  </label>
                  <input
                    type="number"
                    value={overrideQuota}
                    onChange={(e) => setOverrideQuota(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Custom Unit Price (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={overridePrice}
                    onChange={(e) => setOverridePrice(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Sliders className="w-4 h-4" />
                    <span>Apply Custom Override</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
