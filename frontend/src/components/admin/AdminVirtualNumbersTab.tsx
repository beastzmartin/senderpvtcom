import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import {
  VirtualNumberProviderRecord,
  VirtualNumberPricingRule
} from '../../types';
import { FiveSimAdminConsole } from './fivesim/FiveSimAdminConsole';
import {
  Phone,
  Radio,
  Coins,
  ShieldCheck,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Sliders,
  DollarSign,
  Activity,
  Layers,
  Settings,
  X
} from 'lucide-react';

export const AdminVirtualNumbersTab: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'inventory' | 'providers' | 'pricing' | 'rentals' | 'orders' | 'fivesim'>('inventory');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Data states
  const [overview, setOverview] = useState<any>(null);
  const [inventory, setInventory] = useState<any[]>([]);
  const [inventoryTotal, setInventoryTotal] = useState(0);
  const [providers, setProviders] = useState<VirtualNumberProviderRecord[]>([]);
  const [pricingRules, setPricingRules] = useState<VirtualNumberPricingRule[]>([]);
  const [rentals, setRentals] = useState<any[]>([]);
  const [rentalsTotal, setRentalsTotal] = useState(0);

  // Filters
  const [inventoryCountryFilter, setInventoryCountryFilter] = useState('');
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState('');
  const [rentalStatusFilter, setRentalStatusFilter] = useState('');
  const [rentalSearch, setRentalSearch] = useState('');

  // Modals
  const [isAddNumberOpen, setIsAddNumberOpen] = useState(false);
  const [newNumberData, setNewNumberData] = useState({
    provider_id: '',
    country_iso: 'US',
    phone_number: '',
    number_type: 'mobile',
    capabilities: 'sms,voice,whatsapp',
    cost_price: 1.0,
    rental_price_monthly: 3.5,
    rental_price_weekly: 1.25,
    rental_price_annual: 35.0,
    activation_fee: 0.5,
    status: 'available'
  });

  const [isAddProviderOpen, setIsAddProviderOpen] = useState(false);
  const [newProviderData, setNewProviderData] = useState({
    provider_key: '',
    name: '',
    adapter_class: '',
    priority: 10,
    base_url: '',
    api_key: '',
    api_secret: '',
    is_active: 1
  });

  const [isAddPricingOpen, setIsAddPricingOpen] = useState(false);
  const [newPricingData, setNewPricingData] = useState({
    rule_name: '',
    markup_type: 'percentage',
    markup_value: 20,
    fixed_activation_fee: 0.5,
    fixed_weekly_fee: 1.5,
    fixed_monthly_fee: 4.0,
    fixed_annual_fee: 40.0,
    minimum_wallet_balance: 5.0,
    is_active: 1
  });

  const [refundModalOrder, setRefundModalOrder] = useState<any | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ovRes, provRes, priceRes, invRes, rentRes] = await Promise.all([
        api.virtualNumbers.getAdminOverview(),
        api.virtualNumbers.getAdminProviders(),
        api.virtualNumbers.getAdminPricing(),
        api.virtualNumbers.getAdminInventory({
          country: inventoryCountryFilter || undefined,
          status: inventoryStatusFilter || undefined,
          limit: 100
        }),
        api.virtualNumbers.getAdminRentals({
          status: rentalStatusFilter || undefined,
          search: rentalSearch || undefined,
          limit: 100
        })
      ]);

      setOverview(ovRes.overview);
      setProviders(provRes.providers || []);
      setPricingRules(priceRes.rules || []);
      setInventory(invRes.rows || []);
      setInventoryTotal(invRes.total || 0);
      setRentals(rentRes.rows || []);
      setRentalsTotal(rentRes.total || 0);

      if (provRes.providers && provRes.providers.length > 0 && !newNumberData.provider_id) {
        setNewNumberData(prev => ({ ...prev, provider_id: provRes.providers[0].id }));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load Virtual Number admin data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [inventoryCountryFilter, inventoryStatusFilter, rentalStatusFilter]);

  const handleCreateNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNumberData.phone_number.trim()) {
      alert('Please enter a valid phone number with country code (e.g. +14155552671)');
      return;
    }
    setActionLoading(true);
    try {
      await api.virtualNumbers.addAdminInventory(newNumberData);
      showToast(`Number ${newNumberData.phone_number} successfully added to inventory!`);
      setIsAddNumberOpen(false);
      setNewNumberData({
        provider_id: providers[0]?.id || '',
        country_iso: 'US',
        phone_number: '',
        number_type: 'mobile',
        capabilities: 'sms,voice,whatsapp',
        cost_price: 1.0,
        rental_price_monthly: 3.5,
        rental_price_weekly: 1.25,
        rental_price_annual: 35.0,
        activation_fee: 0.5,
        status: 'available'
      });
      loadAll();
    } catch (err: any) {
      alert(err.message || 'Failed to add number');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProviderData.provider_key.trim() || !newProviderData.name.trim()) {
      alert('Provider Key and Name are required.');
      return;
    }
    setActionLoading(true);
    try {
      await api.virtualNumbers.saveAdminProvider(newProviderData);
      showToast(`Provider ${newProviderData.name} saved!`);
      setIsAddProviderOpen(false);
      loadAll();
    } catch (err: any) {
      alert(err.message || 'Failed to save provider');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreatePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPricingData.rule_name.trim()) {
      alert('Rule name is required.');
      return;
    }
    setActionLoading(true);
    try {
      await api.virtualNumbers.saveAdminPricing(newPricingData);
      showToast(`Pricing rule "${newPricingData.rule_name}" saved!`);
      setIsAddPricingOpen(false);
      loadAll();
    } catch (err: any) {
      alert(err.message || 'Failed to save pricing rule');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExecuteRefund = async () => {
    if (!refundModalOrder) return;
    if (!refundReason.trim()) {
      alert('Please state a reason for this audit log refund.');
      return;
    }
    setActionLoading(true);
    try {
      const res = await api.virtualNumbers.refundAdminOrder(refundModalOrder.id, refundReason);
      showToast(`Order refunded $${res.refundedAmount.toFixed(2)} to customer wallet!`);
      setRefundModalOrder(null);
      setRefundReason('');
      loadAll();
    } catch (err: any) {
      alert(err.message || 'Failed to process refund');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-lg text-sm font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-5 h-5" />
          {toast}
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl flex items-center gap-3 text-sm">
          <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
          <div className="flex-1 font-medium">{error}</div>
          <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Telephony KPI Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Inventory Numbers</span>
            <Phone className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {overview ? overview.totalInventory : inventoryTotal}
          </div>
          <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
            <span className="text-emerald-600 font-semibold">{overview?.availableInventory || 0} Available</span>
            <span>&bull;</span>
            <span className="text-blue-600 font-semibold">{overview?.rentedInventory || 0} Rented</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Active Customer Rentals</span>
            <Activity className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {overview?.activeRentals || rentalsTotal}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Across registered customer accounts
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Telephony Revenue</span>
            <DollarSign className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            ${overview?.totalRevenue ? Number(overview.totalRevenue).toFixed(2) : '0.00'}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Debited atomically from central wallet
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Telco Adapters</span>
            <Radio className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {overview?.totalProviders || providers.length}
          </div>
          <div className="text-xs text-purple-700 mt-1 font-medium">
            Multi-Provider Ready
          </div>
        </div>
      </div>

      {/* Sub navigation buttons & Actions toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveSubTab('inventory')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
              activeSubTab === 'inventory'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Phone className="w-4 h-4" />
            Number Inventory ({inventoryTotal})
          </button>

          <button
            onClick={() => setActiveSubTab('providers')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
              activeSubTab === 'providers'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Radio className="w-4 h-4" />
            Telco Providers ({providers.length})
          </button>

          <button
            onClick={() => setActiveSubTab('fivesim')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
              activeSubTab === 'fivesim'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-white text-sky-800 hover:bg-sky-50 border border-sky-200'
            }`}
          >
            <Radio className="w-4 h-4 text-sky-500" />
            5SIM Protocol
          </button>

          <button
            onClick={() => setActiveSubTab('pricing')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
              activeSubTab === 'pricing'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Coins className="w-4 h-4" />
            Pricing & Markups ({pricingRules.length})
          </button>

          <button
            onClick={() => setActiveSubTab('rentals')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
              activeSubTab === 'rentals'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            Customer Rentals ({rentalsTotal})
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeSubTab === 'inventory' && (
            <button
              onClick={() => setIsAddNumberOpen(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Add Virtual Number
            </button>
          )}

          {activeSubTab === 'providers' && (
            <button
              onClick={() => setIsAddProviderOpen(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-purple-600 text-white hover:bg-purple-700 flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Add Provider
            </button>
          )}

          {activeSubTab === 'pricing' && (
            <button
              onClick={() => setIsAddPricingOpen(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Create Pricing Rule
            </button>
          )}

          <button
            onClick={loadAll}
            disabled={loading}
            className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* SUB-TAB: INVENTORY */}
      {activeSubTab === 'inventory' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[200px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter by country (e.g. US, GB, IN)..."
                  value={inventoryCountryFilter}
                  onChange={(e) => setInventoryCountryFilter(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <select
                value={inventoryStatusFilter}
                onChange={(e) => setInventoryStatusFilter(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium text-slate-700 focus:outline-none"
              >
                <option value="">All Statuses</option>
                <option value="available">Available</option>
                <option value="reserved">Reserved</option>
                <option value="rented">Rented</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>

            <div className="text-xs text-slate-500 font-medium">
              Showing {inventory.length} of {inventoryTotal} inventory items
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Phone Number</th>
                    <th className="px-4 py-3">Country</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Capabilities</th>
                    <th className="px-4 py-3">Cost / Retail</th>
                    <th className="px-4 py-3">Provider</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {inventory.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                        No inventory numbers found matching your filters.
                      </td>
                    </tr>
                  ) : (
                    inventory.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3 font-mono font-bold text-slate-900">
                          {item.phone_number}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-800">
                          {item.country_iso}
                        </td>
                        <td className="px-4 py-3 capitalize">{item.number_type}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 flex-wrap">
                            {item.capabilities?.split(',').map((cap: string) => (
                              <span
                                key={cap}
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                                  cap === 'whatsapp'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : cap === 'sms'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-purple-100 text-purple-800'
                                }`}
                              >
                                {cap}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-slate-400 font-mono">${Number(item.cost_price || 0).toFixed(2)}</span>
                          {' '}/ {' '}
                          <strong className="text-emerald-700 font-mono">${Number(item.rental_price_monthly || 0).toFixed(2)}/mo</strong>
                        </td>
                        <td className="px-4 py-3 text-slate-500 font-medium">
                          {item.provider_name || item.provider_id}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              item.status === 'available'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : item.status === 'rented'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB: TELCO PROVIDERS */}
      {activeSubTab === 'providers' && (
        <div className="space-y-4">
          <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 text-xs text-purple-900 flex items-start gap-3">
            <Radio className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
            <div>
              <strong className="font-bold text-purple-950">Provider Abstraction Layer Active</strong>
              <p className="mt-0.5 text-purple-800">
                You can configure multiple telecommunications providers here. Priority determines fallback allocation order.
                Actual provider API keys and endpoints will be wired seamlessly into their respective adapter classes once documentation is supplied.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {providers.map((p) => (
              <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">
                      {p.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">{p.name}</h4>
                      <p className="text-[10px] text-slate-400 font-mono">{p.provider_key || p.slug}</p>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      (p.is_active === 1 || p.status === 'active')
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}
                  >
                    {(p.is_active === 1 || p.status === 'active') ? 'ACTIVE' : 'DISABLED'}
                  </span>
                </div>

                <div className="space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-3">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Adapter Class:</span>
                    <span className="font-mono text-slate-700 font-semibold">{p.adapter_class || (p.is_mock ? 'MockVirtualNumberProvider' : 'ProviderAdapter')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Priority:</span>
                    <span className="font-bold text-slate-900">{p.priority}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Base URL:</span>
                    <span className="font-mono text-[11px] truncate max-w-[150px]">{p.base_url || p.api_base_url || 'Default SDK'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Credentials:</span>
                    <span className="text-emerald-600 font-semibold flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" /> Stored Securely
                    </span>
                  </div>

                  {(p.slug === 'fivesim' || p.name.includes('5SIM')) && (
                    <button
                      onClick={() => setActiveSubTab('fivesim')}
                      className="w-full mt-2 py-1.5 px-3 bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition"
                    >
                      <Radio className="w-3.5 h-3.5 text-sky-600" />
                      Open 5SIM Telecom Console
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-TAB: 5SIM.NET TELECOM PROTOCOL (PARTS 0 - 3) */}
      {activeSubTab === 'fivesim' && (
        <FiveSimAdminConsole />
      )}

      {/* SUB-TAB: PRICING & MARKUP RULES */}
      {activeSubTab === 'pricing' && (
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-xs text-emerald-900 flex items-start gap-3">
            <Coins className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <strong className="font-bold text-emerald-950">Dynamic Pricing & Markup Engine</strong>
              <p className="mt-0.5 text-emerald-800">
                Configure markup models (cost-plus percentage or fixed administrative pricing), activation fees, and minimum wallet balances required before purchasing.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Rule Name</th>
                    <th className="px-4 py-3">Markup Model</th>
                    <th className="px-4 py-3">Activation Fee</th>
                    <th className="px-4 py-3">Weekly Fee</th>
                    <th className="px-4 py-3">Monthly Fee</th>
                    <th className="px-4 py-3">Min Wallet Bal</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pricingRules.map((rule) => (
                    <tr key={rule.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 font-bold text-slate-900">{rule.rule_name || rule.country_name || rule.pricing_model || 'Global Markup'}</td>
                      <td className="px-4 py-3 capitalize">
                        <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-800 font-medium">
                          {rule.markup_type || (rule.markup_percentage ? 'percentage' : 'fixed')} ({rule.markup_value ?? rule.markup_percentage ?? rule.markup_amount ?? 20}{(rule.markup_type === 'percentage' || rule.markup_percentage) ? '%' : '$'})
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-slate-800">
                        ${Number(rule.fixed_activation_fee ?? rule.activation_fee ?? 0.5).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700">
                        ${Number(rule.fixed_weekly_fee ?? 1.5).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 font-mono text-emerald-700 font-bold">
                        ${Number(rule.fixed_monthly_fee ?? rule.monthly_rental_price ?? 3.5).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 font-mono text-blue-700 font-semibold">
                        ${Number(rule.minimum_wallet_balance ?? 5.0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          ACTIVE
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB: CUSTOMER RENTALS & REFUNDS */}
      {activeSubTab === 'rentals' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[240px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search user, phone or order ID..."
                  value={rentalSearch}
                  onChange={(e) => setRentalSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <select
                value={rentalStatusFilter}
                onChange={(e) => setRentalStatusFilter(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium text-slate-700 focus:outline-none"
              >
                <option value="">All Rental Statuses</option>
                <option value="active">Active</option>
                <option value="renewal_due">Renewal Due</option>
                <option value="expired">Expired</option>
                <option value="released">Released</option>
              </select>
            </div>

            <div className="text-xs text-slate-500 font-medium">
              Total Customer Rentals: {rentalsTotal}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Phone Number</th>
                    <th className="px-4 py-3">Duration</th>
                    <th className="px-4 py-3">Charges</th>
                    <th className="px-4 py-3">Renewal Date</th>
                    <th className="px-4 py-3">Auto-Renew</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rentals.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                        No customer rentals recorded yet.
                      </td>
                    </tr>
                  ) : (
                    rentals.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3">
                          <strong className="text-slate-900 block">{r.user_name || 'Customer'}</strong>
                          <span className="text-[10px] text-slate-400 font-mono">@{r.user_username || r.user_id}</span>
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-slate-900">
                          {r.phone_number}
                        </td>
                        <td className="px-4 py-3 capitalize">{r.rental_duration}</td>
                        <td className="px-4 py-3 font-mono font-semibold text-emerald-700">
                          ${Number(r.total_charges || 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3">
                          {r.renewal_date ? new Date(r.renewal_date).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              r.auto_renew === 1 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {r.auto_renew === 1 ? 'ENABLED' : 'OFF'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              r.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : r.status === 'renewal_due'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setRefundModalOrder(r)}
                            className="px-2.5 py-1 text-[11px] font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg border border-rose-200 flex items-center gap-1 ml-auto"
                            title="Refund to customer wallet"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Refund
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD NUMBER TO INVENTORY */}
      {isAddNumberOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <Phone className="w-5 h-5 text-emerald-600" />
                Add Number to Inventory
              </h3>
              <button
                onClick={() => setIsAddNumberOpen(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateNumber} className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Country ISO</label>
                  <input
                    type="text"
                    required
                    maxLength={2}
                    placeholder="US"
                    value={newNumberData.country_iso}
                    onChange={(e) => setNewNumberData({ ...newNumberData, country_iso: e.target.value.toUpperCase() })}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl uppercase font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number (E.164)</label>
                  <input
                    type="text"
                    required
                    placeholder="+14155552671"
                    value={newNumberData.phone_number}
                    onChange={(e) => setNewNumberData({ ...newNumberData, phone_number: e.target.value })}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Number Type</label>
                  <select
                    value={newNumberData.number_type}
                    onChange={(e) => setNewNumberData({ ...newNumberData, number_type: e.target.value })}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="mobile">Mobile</option>
                    <option value="geographic">Geographic / Local</option>
                    <option value="toll_free">Toll-Free</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Capabilities (comma-separated)</label>
                  <input
                    type="text"
                    value={newNumberData.capabilities}
                    onChange={(e) => setNewNumberData({ ...newNumberData, capabilities: e.target.value })}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                    placeholder="sms,voice,whatsapp"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Cost Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newNumberData.cost_price}
                    onChange={(e) => setNewNumberData({ ...newNumberData, cost_price: parseFloat(e.target.value) || 0 })}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Monthly Retail ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newNumberData.rental_price_monthly}
                    onChange={(e) => setNewNumberData({ ...newNumberData, rental_price_monthly: parseFloat(e.target.value) || 0 })}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-emerald-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Activation Fee ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newNumberData.activation_fee}
                    onChange={(e) => setNewNumberData({ ...newNumberData, activation_fee: parseFloat(e.target.value) || 0 })}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddNumberOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 text-xs font-bold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 shadow-md shadow-emerald-950/10"
                >
                  {actionLoading ? 'Saving...' : 'Add to Inventory'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD TELCO PROVIDER */}
      {isAddProviderOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <Radio className="w-5 h-5 text-purple-600" />
                Add Telco Provider
              </h3>
              <button
                onClick={() => setIsAddProviderOpen(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProvider} className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Provider Key</label>
                  <input
                    type="text"
                    required
                    placeholder="twilio / bandwidth / custom"
                    value={newProviderData.provider_key}
                    onChange={(e) => setNewProviderData({ ...newProviderData, provider_key: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Display Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Twilio Telecom"
                    value={newProviderData.name}
                    onChange={(e) => setNewProviderData({ ...newProviderData, name: e.target.value })}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Adapter Class</label>
                  <input
                    type="text"
                    placeholder="TwilioProvider"
                    value={newProviderData.adapter_class}
                    onChange={(e) => setNewProviderData({ ...newProviderData, adapter_class: e.target.value })}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Priority (Higher = preferred)</label>
                  <input
                    type="number"
                    value={newProviderData.priority}
                    onChange={(e) => setNewProviderData({ ...newProviderData, priority: parseInt(e.target.value) || 0 })}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">API Base URL</label>
                <input
                  type="text"
                  placeholder="https://api.provider.com/v1"
                  value={newProviderData.base_url}
                  onChange={(e) => setNewProviderData({ ...newProviderData, base_url: e.target.value })}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">API Key / Account SID</label>
                  <input
                    type="password"
                    placeholder="Encrypted token"
                    value={newProviderData.api_key}
                    onChange={(e) => setNewProviderData({ ...newProviderData, api_key: e.target.value })}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">API Secret / Auth Token</label>
                  <input
                    type="password"
                    placeholder="Encrypted token"
                    value={newProviderData.api_secret}
                    onChange={(e) => setNewProviderData({ ...newProviderData, api_secret: e.target.value })}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddProviderOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 text-xs font-bold bg-purple-600 text-white rounded-xl hover:bg-purple-700 shadow-md shadow-purple-950/10"
                >
                  {actionLoading ? 'Saving...' : 'Register Provider'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE PRICING RULE */}
      {isAddPricingOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <Coins className="w-5 h-5 text-emerald-600" />
                Create Pricing & Markup Rule
              </h3>
              <button
                onClick={() => setIsAddPricingOpen(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePricing} className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Rule Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Standard 25% Markup Rule"
                  value={newPricingData.rule_name}
                  onChange={(e) => setNewPricingData({ ...newPricingData, rule_name: e.target.value })}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Markup Type</label>
                  <select
                    value={newPricingData.markup_type}
                    onChange={(e) => setNewPricingData({ ...newPricingData, markup_type: e.target.value })}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="percentage">Percentage Markup (%)</option>
                    <option value="fixed">Fixed Cost Markup ($)</option>
                    <option value="multiplier">Price Multiplier (x)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Markup Value</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newPricingData.markup_value}
                    onChange={(e) => setNewPricingData({ ...newPricingData, markup_value: parseFloat(e.target.value) || 0 })}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-emerald-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Activation Fee ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newPricingData.fixed_activation_fee}
                    onChange={(e) => setNewPricingData({ ...newPricingData, fixed_activation_fee: parseFloat(e.target.value) || 0 })}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Monthly Fee ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newPricingData.fixed_monthly_fee}
                    onChange={(e) => setNewPricingData({ ...newPricingData, fixed_monthly_fee: parseFloat(e.target.value) || 0 })}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Min Wallet Bal ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newPricingData.minimum_wallet_balance}
                    onChange={(e) => setNewPricingData({ ...newPricingData, minimum_wallet_balance: parseFloat(e.target.value) || 0 })}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-blue-700 font-bold"
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddPricingOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 text-xs font-bold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 shadow-md shadow-emerald-950/10"
                >
                  {actionLoading ? 'Saving...' : 'Save Pricing Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ORDER REFUND */}
      {refundModalOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-rose-600" />
                Refund Order to Customer Wallet
              </h3>
              <button
                onClick={() => setRefundModalOrder(null)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-3">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Phone Number:</span>
                  <strong className="font-mono text-slate-900">{refundModalOrder.phone_number}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Customer:</span>
                  <span className="font-semibold text-slate-800">{refundModalOrder.user_name || 'Customer'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Total Deducted:</span>
                  <strong className="text-rose-600 font-mono">${Number(refundModalOrder.total_charges || 0).toFixed(2)}</strong>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Refund Reason / Audit Note</label>
                <textarea
                  rows={3}
                  required
                  placeholder="State the technical or administrative reason for this refund..."
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>

            <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setRefundModalOrder(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteRefund}
                disabled={actionLoading}
                className="px-5 py-2 text-xs font-bold bg-rose-600 text-white rounded-xl hover:bg-rose-700 shadow-md shadow-rose-950/10 flex items-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" />
                {actionLoading ? 'Processing...' : 'Confirm Full Refund'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
