import React, { useState, useEffect } from 'react';
import { api } from '../../../services/api';
import {
  Globe,
  Layers,
  Wifi,
  Grid,
  RefreshCw,
  Download,
  Upload,
  Search,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Database,
  FileText,
  Sliders,
  Check,
  ChevronRight,
  ShieldCheck,
  Clock
} from 'lucide-react';

export const GrizzlyDataManagementView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'countries' | 'services' | 'operators' | 'matrix' | 'sync'>('countries');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Countries State
  const [countries, setCountries] = useState<any[]>([]);
  const [countriesTotal, setCountriesTotal] = useState(0);
  const [countrySearch, setCountrySearch] = useState('');
  const [countryActiveFilter, setCountryActiveFilter] = useState(false);
  const [editingCountry, setEditingCountry] = useState<any | null>(null);

  // Services State
  const [services, setServices] = useState<any[]>([]);
  const [servicesTotal, setServicesTotal] = useState(0);
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceCategoryFilter, setServiceCategoryFilter] = useState('');
  const [isAddServiceModalOpen, setIsAddServiceModalOpen] = useState(false);
  const [newServiceForm, setNewServiceForm] = useState({
    provider_service_code: '',
    service_name: '',
    display_name: '',
    category: 'general',
    icon: ''
  });

  // Operators State
  const [operators, setOperators] = useState<any[]>([]);
  const [isAddOperatorModalOpen, setIsAddOperatorModalOpen] = useState(false);
  const [newOperatorForm, setNewOperatorForm] = useState({
    code: '',
    name: '',
    countryId: ''
  });

  // Country-Service Availability Matrix
  const [countryServices, setCountryServices] = useState<any[]>([]);
  const [matrixTotal, setMatrixTotal] = useState(0);
  const [matrixCountryId, setMatrixCountryId] = useState<string>('');
  const [matrixServiceCode, setMatrixServiceCode] = useState<string>('');
  const [matrixAvailableOnly, setMatrixAvailableOnly] = useState(false);
  const [syncingInventory, setSyncingInventory] = useState(false);

  // Data Synchronization & Imports
  const [importHistory, setImportHistory] = useState<any[]>([]);
  const [importJsonText, setImportJsonText] = useState('');
  const [importType, setImportType] = useState<'countries' | 'services'>('countries');
  const [importing, setImporting] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Loaders
  const loadCountries = async () => {
    try {
      setLoading(true);
      const res = await api.virtualNumbers.grizzly.data.getCountries({
        search: countrySearch || undefined,
        activeOnly: countryActiveFilter || undefined,
        limit: 150
      });
      if (res.success) {
        setCountries(res.rows || []);
        setCountriesTotal(res.total || 0);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load countries', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadServices = async () => {
    try {
      setLoading(true);
      const res = await api.virtualNumbers.grizzly.data.getServices({
        search: serviceSearch || undefined,
        category: serviceCategoryFilter || undefined
      });
      if (res.success) {
        setServices(res.rows || []);
        setServicesTotal(res.total || 0);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load services', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadOperators = async () => {
    try {
      setLoading(true);
      const res = await api.virtualNumbers.grizzly.data.getOperators();
      if (res.success) {
        setOperators(res.operators || []);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load operators', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadMatrix = async () => {
    try {
      setLoading(true);
      const res = await api.virtualNumbers.grizzly.data.getCountryServices({
        countryId: matrixCountryId ? parseInt(matrixCountryId, 10) : undefined,
        serviceCode: matrixServiceCode || undefined,
        availableOnly: matrixAvailableOnly || undefined,
        limit: 100
      });
      if (res.success) {
        setCountryServices(res.rows || []);
        setMatrixTotal(res.total || 0);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load availability matrix', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadImports = async () => {
    try {
      setLoading(true);
      const res = await api.virtualNumbers.grizzly.data.getImports();
      if (res.success) {
        setImportHistory(res.imports || []);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load import history', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'countries') loadCountries();
    if (activeTab === 'services') loadServices();
    if (activeTab === 'operators') loadOperators();
    if (activeTab === 'matrix') loadMatrix();
    if (activeTab === 'sync') loadImports();
  }, [activeTab]);

  // Country actions
  const handleToggleCountry = async (id: number, currentActive: boolean, currentSupported: boolean) => {
    try {
      const res = await api.virtualNumbers.grizzly.data.toggleCountry(id, {
        isActive: !currentActive,
        isSupported: currentSupported
      });
      if (res.success) {
        showToast(`Country #${id} status updated`);
        loadCountries();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to toggle country', 'error');
    }
  };

  const handleUpdateCountry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCountry) return;
    try {
      const res = await api.virtualNumbers.grizzly.data.updateCountry(editingCountry.provider_country_id, {
        country_name: editingCountry.country_name,
        country_code_iso2: editingCountry.country_code_iso2,
        country_code_iso3: editingCountry.country_code_iso3,
        flag: editingCountry.flag,
        is_active: editingCountry.is_active === 1 || editingCountry.is_active === true,
        is_supported: editingCountry.is_supported === 1 || editingCountry.is_supported === true
      });
      if (res.success) {
        showToast(`Country #${editingCountry.provider_country_id} saved successfully`);
        setEditingCountry(null);
        loadCountries();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to update country', 'error');
    }
  };

  const handleDeleteCountry = async (id: number, name: string) => {
    if (!confirm(`Are you sure you want to delete country "${name}" (ID ${id})? This will be rejected if historical activations exist.`)) return;
    try {
      const res = await api.virtualNumbers.grizzly.data.deleteCountry(id);
      if (res.success) {
        showToast(res.message || 'Country deleted');
        loadCountries();
      }
    } catch (err: any) {
      showToast(err.message || 'Cannot delete country (safe deletion triggered)', 'error');
    }
  };

  // Service actions
  const handleToggleService = async (code: string, currentActive: boolean, currentSupported: boolean) => {
    try {
      const res = await api.virtualNumbers.grizzly.data.toggleService(code, {
        isActive: !currentActive,
        isSupported: currentSupported
      });
      if (res.success) {
        showToast(`Service "${code}" status updated`);
        loadServices();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to toggle service', 'error');
    }
  };

  const handleAddOrUpdateService = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.virtualNumbers.grizzly.data.addOrUpdateService({
        provider_service_code: newServiceForm.provider_service_code.trim().toLowerCase(),
        service_name: newServiceForm.service_name.trim(),
        display_name: newServiceForm.display_name.trim() || newServiceForm.service_name.trim(),
        category: newServiceForm.category.trim() || 'general',
        icon: newServiceForm.icon.trim() || '💬',
        is_active: true,
        is_supported: true
      });
      if (res.success) {
        showToast(`Service "${newServiceForm.provider_service_code}" created/updated`);
        setIsAddServiceModalOpen(false);
        setNewServiceForm({
          provider_service_code: '',
          service_name: '',
          display_name: '',
          category: 'general',
          icon: ''
        });
        loadServices();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to save service', 'error');
    }
  };

  const handleDeleteService = async (code: string, name: string) => {
    if (!confirm(`Are you sure you want to delete service "${name}" (${code})? Safe deletion will check for historical activations.`)) return;
    try {
      const res = await api.virtualNumbers.grizzly.data.deleteService(code);
      if (res.success) {
        showToast(res.message || 'Service deleted');
        loadServices();
      }
    } catch (err: any) {
      showToast(err.message || 'Cannot delete service (safe deletion triggered)', 'error');
    }
  };

  // Operator actions
  const handleAddOperator = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.virtualNumbers.grizzly.data.addOperator({
        code: newOperatorForm.code.trim().toLowerCase(),
        name: newOperatorForm.name.trim(),
        countryId: newOperatorForm.countryId ? parseInt(newOperatorForm.countryId, 10) : undefined
      });
      if (res.success) {
        showToast(`Operator "${newOperatorForm.code}" added successfully`);
        setIsAddOperatorModalOpen(false);
        setNewOperatorForm({ code: '', name: '', countryId: '' });
        loadOperators();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to add operator', 'error');
    }
  };

  // Inventory Sync Trigger
  const handleTriggerSync = async () => {
    try {
      setSyncingInventory(true);
      const res = await api.virtualNumbers.grizzly.data.syncInventory();
      if (res.success) {
        showToast(`Synchronized ${res.availableCombinations} active inventory combinations (${res.totalAvailableQuantity} numbers total)`);
        loadMatrix();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to trigger inventory sync', 'error');
    } finally {
      setSyncingInventory(false);
    }
  };

  // Export JSON
  const handleExportData = async () => {
    try {
      const data = await api.virtualNumbers.grizzly.data.exportMapping();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `grizzlysms_mappings_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Export file downloaded successfully');
    } catch (err: any) {
      showToast(err.message || 'Failed to export data', 'error');
    }
  };

  // Import JSON / CSV
  const handleExecuteImport = async () => {
    if (!importJsonText.trim()) {
      showToast('Please provide JSON or CSV data in the input box', 'error');
      return;
    }
    try {
      setImporting(true);
      let parsed: any[] = [];
      const text = importJsonText.trim();
      if (text.startsWith('[') || text.startsWith('{')) {
        const json = JSON.parse(text);
        parsed = Array.isArray(json) ? json : [json];
      } else {
        // Parse basic CSV (header in line 1)
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length > 1) {
          const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
            const row: any = {};
            headers.forEach((h, idx) => {
              row[h] = cols[idx];
            });
            parsed.push(row);
          }
        }
      }

      if (parsed.length === 0) {
        showToast('No valid records found in data payload', 'error');
        return;
      }

      if (importType === 'countries') {
        const res = await api.virtualNumbers.grizzly.data.importCountries(parsed, 'manual_admin_input');
        if (res.success) {
          showToast(`Countries import completed: ${res.inserted} inserted, ${res.updated} updated`);
          setImportJsonText('');
          loadImports();
        }
      } else {
        const res = await api.virtualNumbers.grizzly.data.importServices(parsed, 'manual_admin_input');
        if (res.success) {
          showToast(`Services import completed: ${res.inserted} inserted, ${res.updated} updated`);
          setImportJsonText('');
          loadImports();
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Import failed. Check formatting.', 'error');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 text-white text-sm font-semibold transition-all ${
            toast.type === 'error' ? 'bg-rose-600' : 'bg-emerald-600'
          }`}
        >
          {toast.type === 'error' ? <AlertCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
          {toast.message}
        </div>
      )}

      {/* Header & Protocol Disclaimer */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              OFFICIAL GRIZZLYSMS DATA REPOSITORY
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              STRICT NUMERICAL ID MAPPING
            </span>
          </div>
          <h2 className="text-xl font-black tracking-tight">Official Countries, Services & Operators Management</h2>
          <p className="text-slate-400 text-xs mt-1 max-w-2xl leading-relaxed">
            Maintains published GrizzlySMS provider country IDs (e.g. India = 22, USA = 187, USA Virtual = 12, South Korea = 10350), short service codes (tg, wa, go), and fallback operator architecture without dialing code confusion.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-center shrink-0">
          <button
            onClick={handleExportData}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold border border-slate-700 flex items-center gap-1.5 transition"
          >
            <Download className="w-4 h-4 text-indigo-400" />
            Export Mappings
          </button>
          <button
            onClick={handleTriggerSync}
            disabled={syncingInventory}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition disabled:opacity-50 shadow-md shadow-indigo-600/20"
          >
            <RefreshCw className={`w-4 h-4 ${syncingInventory ? 'animate-spin' : ''}`} />
            Sync Inventory
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveTab('countries')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
            activeTab === 'countries'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Globe className="w-4 h-4 text-indigo-400" />
          Country Database ({countriesTotal})
        </button>

        <button
          onClick={() => setActiveTab('services')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
            activeTab === 'services'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          Service Codes ({servicesTotal})
        </button>

        <button
          onClick={() => setActiveTab('operators')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
            activeTab === 'operators'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Wifi className="w-4 h-4" />
          Operators ({operators.length})
        </button>

        <button
          onClick={() => setActiveTab('matrix')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
            activeTab === 'matrix'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Grid className="w-4 h-4" />
          Availability Matrix ({matrixTotal})
        </button>

        <button
          onClick={() => setActiveTab('sync')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
            activeTab === 'sync'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Database className="w-4 h-4" />
          Import & Sync Logs ({importHistory.length})
        </button>
      </div>

      {/* TAB 1: COUNTRY MANAGEMENT */}
      {activeTab === 'countries' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-80">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by country name, ISO, or ID..."
                  value={countrySearch}
                  onChange={(e) => setCountrySearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadCountries()}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50"
                />
              </div>
              <button
                onClick={loadCountries}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
              >
                Search
              </button>
            </div>

            <div className="flex items-center gap-4 self-end md:self-center">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={countryActiveFilter}
                  onChange={(e) => {
                    setCountryActiveFilter(e.target.checked);
                    setTimeout(loadCountries, 50);
                  }}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                Active Only
              </label>
              <button
                onClick={loadCountries}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
                title="Refresh table"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                  <tr>
                    <th className="py-3 px-4">Provider ID</th>
                    <th className="py-3 px-4">Country</th>
                    <th className="py-3 px-4">ISO Code</th>
                    <th className="py-3 px-4">Dial Code</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Supported</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {countries.map((c) => (
                    <tr key={c.provider_country_id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-4 font-mono font-bold text-indigo-600">
                        #{c.provider_country_id}
                        {c.provider_country_id >= 10000 && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] bg-purple-100 text-purple-700 font-sans">
                            Special ID
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800 flex items-center gap-2">
                        <span className="text-lg">{c.flag || '🌐'}</span>
                        <span>{c.country_name}</span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500">
                        {c.country_code_iso2 || '—'} / {c.country_code_iso3 || '—'}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-400">
                        {c.dial_code ? `+${c.dial_code}` : '—'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleToggleCountry(c.provider_country_id, c.is_active === 1, c.is_supported === 1)}
                          className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase transition ${
                            c.is_active === 1
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          {c.is_active === 1 ? 'Active' : 'Disabled'}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            c.is_supported === 1 ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-400'
                          }`}
                        >
                          {c.is_supported === 1 ? <Check className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {c.is_supported === 1 ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setEditingCountry(c)}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition"
                            title="Edit Country"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteCountry(c.provider_country_id, c.country_name)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                            title="Safe Delete Country"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {countries.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 font-semibold">
                        No official countries found matching query.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SERVICE MANAGEMENT */}
      {activeTab === 'services' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-80">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search service name or short code..."
                  value={serviceSearch}
                  onChange={(e) => setServiceSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadServices()}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50"
                />
              </div>
              <button
                onClick={loadServices}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
              >
                Filter
              </button>
            </div>

            <div className="flex items-center gap-3 self-end md:self-center">
              <button
                onClick={() => setIsAddServiceModalOpen(true)}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Add Service Code
              </button>
              <button
                onClick={loadServices}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
                title="Refresh services"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {services.map((s) => (
              <div
                key={s.provider_service_code}
                className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-start justify-between gap-3 hover:border-indigo-300 transition"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-xl shrink-0">
                    {s.icon || '💬'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">{s.service_name}</span>
                      <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-mono font-bold text-xs uppercase border border-indigo-100">
                        {s.provider_service_code}
                      </span>
                    </div>
                    <p className="text-slate-400 text-xs mt-0.5 capitalize">{s.category || 'General'}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          s.is_active === 1 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {s.is_active === 1 ? 'Active' : 'Disabled'}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          s.is_supported === 1 ? 'bg-blue-100 text-blue-800' : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {s.is_supported === 1 ? 'Supported' : 'Unsupported'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <button
                    onClick={() => handleToggleService(s.provider_service_code, s.is_active === 1, s.is_supported === 1)}
                    className="text-xs font-semibold text-slate-500 hover:text-indigo-600 transition"
                  >
                    Toggle
                  </button>
                  <button
                    onClick={() => handleDeleteService(s.provider_service_code, s.service_name)}
                    className="p-1 text-slate-300 hover:text-rose-600 transition"
                    title="Delete service"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: OPERATOR MANAGEMENT */}
      {activeTab === 'operators' && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-900 flex items-start gap-3 text-xs leading-relaxed">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-950">GrizzlySMS Operator Notice</p>
              <p className="mt-0.5 text-amber-800">
                GrizzlySMS operator selection is currently under platform development by GrizzlySMS. All inbound and outbound requests strictly default to operator code <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono font-bold">"any"</code>. This section is structured to support carrier-level allocation seamlessly once provider expands operator telemetry.
              </p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-sm">Configured Operators & Fallbacks</h3>
            <button
              onClick={() => setIsAddOperatorModalOpen(true)}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Add Operator
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                <tr>
                  <th className="py-3 px-4">Operator Code</th>
                  <th className="py-3 px-4">Operator Name</th>
                  <th className="py-3 px-4">Scope</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {operators.map((op) => (
                  <tr key={op.id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-4 font-mono font-bold text-indigo-600">
                      {op.operator_code || op.provider_operator_code}
                      {(op.operator_code === 'any' || op.provider_operator_code === 'any') && (
                        <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-sans">
                          DEFAULT PROTOCOL FALLBACK
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-800">{op.operator_name}</td>
                    <td className="py-3 px-4 text-slate-500">
                      {op.country_id ? `Country #${op.country_id}` : 'Global (All Countries)'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        Active
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: COUNTRY-SERVICE AVAILABILITY MATRIX */}
      {activeTab === 'matrix' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <input
                type="number"
                placeholder="Country ID (e.g. 22)"
                value={matrixCountryId}
                onChange={(e) => setMatrixCountryId(e.target.value)}
                className="w-36 px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50"
              />
              <input
                type="text"
                placeholder="Service (e.g. tg, wa)"
                value={matrixServiceCode}
                onChange={(e) => setMatrixServiceCode(e.target.value)}
                className="w-36 px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50"
              />
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={matrixAvailableOnly}
                  onChange={(e) => setMatrixAvailableOnly(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                Available Quantity &gt; 0
              </label>
              <button
                onClick={loadMatrix}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition"
              >
                Filter Matrix
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleTriggerSync}
                disabled={syncingInventory}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${syncingInventory ? 'animate-spin' : ''}`} />
                Sync Live Numbers
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                  <tr>
                    <th className="py-3 px-4">Country</th>
                    <th className="py-3 px-4">Service</th>
                    <th className="py-3 px-4">Operator</th>
                    <th className="py-3 px-4 text-center">Available Quantity</th>
                    <th className="py-3 px-4 text-center">Live Availability</th>
                    <th className="py-3 px-4 text-right">Last Sync</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {countryServices.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4 font-semibold text-slate-800">
                        {row.country_name || `Country #${row.provider_country_id}`}
                        <span className="ml-1.5 text-slate-400 font-mono text-[11px]">
                          (#{row.provider_country_id})
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-mono font-bold text-xs uppercase border border-indigo-100">
                          {row.provider_service_code}
                        </span>
                        <span className="ml-2 font-medium text-slate-700">{row.service_name}</span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500">{row.operator_code || 'any'}</td>
                      <td className="py-3 px-4 text-center font-bold font-mono">
                        <span
                          className={`px-2 py-0.5 rounded-full ${
                            row.available_quantity > 0
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {row.available_quantity} numbers
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            row.is_available === 1 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'
                          }`}
                        >
                          {row.is_available === 1 ? 'AVAILABLE' : 'OUT OF STOCK'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-slate-400 font-mono text-[11px]">
                        {row.last_inventory_sync ? new Date(row.last_inventory_sync).toLocaleString() : 'Never'}
                      </td>
                    </tr>
                  ))}
                  {countryServices.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 font-semibold">
                        No availability records found. Click "Sync Live Numbers" to synchronize with live inventory.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: DATA SYNCHRONIZATION & IMPORTS */}
      {activeTab === 'sync' && (
        <div className="space-y-6">
          {/* Import Panel */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Direct Data Ingestion & Upsert</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Import official country lists or service codes in JSON array format or CSV text.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setImportType('countries')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    importType === 'countries'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Import Countries
                </button>
                <button
                  type="button"
                  onClick={() => setImportType('services')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    importType === 'services'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Import Services
                </button>
              </div>
            </div>

            <textarea
              rows={8}
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
              placeholder={
                importType === 'countries'
                  ? `[\n  {\n    "id": 22,\n    "name": "India",\n    "iso2": "IN",\n    "iso3": "IND",\n    "dial": 91,\n    "flag": "🇮🇳"\n  }\n]`
                  : `[\n  {\n    "code": "tg",\n    "name": "Telegram",\n    "category": "messenger",\n    "icon": "✈️"\n  }\n]`
              }
              className="w-full p-3 font-mono text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50"
            />

            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                Supports auto-upsert: existing IDs/codes will be updated without corrupting historical references.
              </span>
              <button
                onClick={handleExecuteImport}
                disabled={importing}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-2 shadow-md shadow-indigo-600/20 disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                {importing ? 'Processing Import...' : `Import ${importType === 'countries' ? 'Countries' : 'Services'}`}
              </button>
            </div>
          </div>

          {/* Audit Log / History */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                Audit Log of Data Synchronizations
              </h4>
              <button
                onClick={loadImports}
                className="p-1 text-slate-400 hover:text-slate-600 rounded transition"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Entity Type</th>
                  <th className="py-3 px-4">Source / File</th>
                  <th className="py-3 px-4 text-center">Inserted</th>
                  <th className="py-3 px-4 text-center">Updated</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {importHistory.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-4 font-mono text-slate-500">
                      {new Date(item.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 font-bold capitalize text-slate-800">{item.entity_type}</td>
                    <td className="py-3 px-4 font-mono text-slate-600">{item.file_name || 'Admin Payload'}</td>
                    <td className="py-3 px-4 text-center text-emerald-600 font-bold font-mono">
                      +{item.records_inserted}
                    </td>
                    <td className="py-3 px-4 text-center text-blue-600 font-bold font-mono">
                      ~{item.records_updated}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        {item.status || 'COMPLETED'}
                      </span>
                    </td>
                  </tr>
                ))}
                {importHistory.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 font-semibold">
                      No import audit records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: EDIT COUNTRY */}
      {editingCountry && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <span>Edit Official Country #{editingCountry.provider_country_id}</span>
              </h3>
              <button
                onClick={() => setEditingCountry(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateCountry} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Country Name</label>
                <input
                  type="text"
                  required
                  value={editingCountry.country_name}
                  onChange={(e) => setEditingCountry({ ...editingCountry, country_name: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">ISO-2</label>
                  <input
                    type="text"
                    maxLength={2}
                    value={editingCountry.country_code_iso2 || ''}
                    onChange={(e) => setEditingCountry({ ...editingCountry, country_code_iso2: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">ISO-3</label>
                  <input
                    type="text"
                    maxLength={3}
                    value={editingCountry.country_code_iso3 || ''}
                    onChange={(e) => setEditingCountry({ ...editingCountry, country_code_iso3: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Flag Emoji</label>
                  <input
                    type="text"
                    value={editingCountry.flag || ''}
                    onChange={(e) => setEditingCountry({ ...editingCountry, flag: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl text-center text-lg"
                  />
                </div>
              </div>

              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingCountry.is_active === 1 || editingCountry.is_active === true}
                    onChange={(e) => setEditingCountry({ ...editingCountry, is_active: e.target.checked })}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  Is Active in System
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingCountry.is_supported === 1 || editingCountry.is_supported === true}
                    onChange={(e) => setEditingCountry({ ...editingCountry, is_supported: e.target.checked })}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  Is Supported by Provider
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingCountry(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD SERVICE */}
      {isAddServiceModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">Add New GrizzlySMS Service</h3>
              <button
                onClick={() => setIsAddServiceModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddOrUpdateService} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Provider Short Code <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. tg, wa, vi, ds"
                  value={newServiceForm.provider_service_code}
                  onChange={(e) => setNewServiceForm({ ...newServiceForm, provider_service_code: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl font-mono lowercase focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Service Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Telegram"
                  value={newServiceForm.service_name}
                  onChange={(e) => setNewServiceForm({ ...newServiceForm, service_name: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Category</label>
                  <select
                    value={newServiceForm.category}
                    onChange={(e) => setNewServiceForm({ ...newServiceForm, category: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white"
                  >
                    <option value="messenger">Messenger</option>
                    <option value="social">Social</option>
                    <option value="marketplace">Marketplace</option>
                    <option value="streaming">Streaming</option>
                    <option value="general">General</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Icon / Emoji</label>
                  <input
                    type="text"
                    placeholder="💬"
                    value={newServiceForm.icon}
                    onChange={(e) => setNewServiceForm({ ...newServiceForm, icon: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl text-center text-lg"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddServiceModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
                >
                  Save Service
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD OPERATOR */}
      {isAddOperatorModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">Add Operator Mapping</h3>
              <button
                onClick={() => setIsAddOperatorModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddOperator} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Operator Code <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. any, vodafone, airtel, verizon"
                  value={newOperatorForm.code}
                  onChange={(e) => setNewOperatorForm({ ...newOperatorForm, code: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl font-mono lowercase focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Operator Display Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Any Operator / Vodafone"
                  value={newOperatorForm.name}
                  onChange={(e) => setNewOperatorForm({ ...newOperatorForm, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Country ID (Optional, leave empty for Global)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 22 for India"
                  value={newOperatorForm.countryId}
                  onChange={(e) => setNewOperatorForm({ ...newOperatorForm, countryId: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddOperatorModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
                >
                  Add Operator
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
