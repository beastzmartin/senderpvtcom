import React, { useEffect, useState } from 'react';
import { api } from '../../../services/api';
import {
  GrizzlyOverview
} from '../../../types';
import {
  Radio,
  Server,
  Activity,
  Phone,
  PhoneCall,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Copy,
  Plus,
  Coins,
  Cpu,
  Inbox,
  FileText,
  Sliders,
  X,
  Search,
  ExternalLink,
  Lock,
  ArrowRight,
  Send,
  Ban,
  Volume2,
  Globe,
  ShoppingBag
} from 'lucide-react';
import { GrizzlyDataManagementView } from './GrizzlyDataManagementView';
import { GrizzlyCustomerAdminView } from './GrizzlyCustomerAdminView';

export const GrizzlyDashboardView: React.FC = () => {
  const [subTab, setSubTab] = useState<'overview' | 'inventory' | 'hardware' | 'activations' | 'sms' | 'voice' | 'blacklist' | 'data' | 'customer-api' | 'config' | 'logs'>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Data states
  const [overview, setOverview] = useState<GrizzlyOverview | null>(null);
  const [inventory, setInventory] = useState<any[]>([]);
  const [inventoryTotal, setInventoryTotal] = useState(0);
  const [hardwareModules, setHardwareModules] = useState<any[]>([]);
  const [activations, setActivations] = useState<any[]>([]);
  const [activationsTotal, setActivationsTotal] = useState(0);
  const [smsMessages, setSmsMessages] = useState<any[]>([]);
  const [voiceCalls, setVoiceCalls] = useState<any[]>([]);
  const [cancellations, setCancellations] = useState<any[]>([]);
  const [quarantine, setQuarantine] = useState<any[]>([]);
  const [prohibited, setProhibited] = useState<any[]>([]);
  const [apiLogs, setApiLogs] = useState<any[]>([]);
  const [apiLogsTotal, setApiLogsTotal] = useState(0);
  const [mappings, setMappings] = useState<{ countries: any[]; services: any[] }>({ countries: [], services: [] });

  // Filter states
  const [invStatusFilter, setInvStatusFilter] = useState('');
  const [actSearch, setActSearch] = useState('');
  const [actStatusFilter, setActStatusFilter] = useState('');

  // Modals & Action states
  const [isAddNumberOpen, setIsAddNumberOpen] = useState(false);
  const [isTriggerCallOpen, setIsTriggerCallOpen] = useState(false);
  const [triggerCallData, setTriggerCallData] = useState({ phone: '447472190082', phoneFrom: '447472190099' });
  const [isTriggerSmsOpen, setIsTriggerSmsOpen] = useState(false);
  const [triggerSmsData, setTriggerSmsData] = useState({ phone: '447472190082', phoneFrom: 'Telegram', text: 'Your verification code is: 84920' });

  const [newNumberData, setNewNumberData] = useState({
    phoneNumber: '',
    countryId: 12,
    operator: 'any',
    costPrice: 15.0,
    canGetAnotherSms: true,
    flashcallSupported: true,
    voiceSupported: false
  });

  const [isConfigEditing, setIsConfigEditing] = useState(false);
  const [configForm, setConfigForm] = useState({
    protocol_key: '',
    status: 'enabled' as 'enabled' | 'disabled' | 'maintenance',
    priority: 10,
    max_active_numbers: 250,
    min_payout: 0,
    max_payout: 500,
    partner_api_endpoint: '/api/virtual-numbers/partners/grizzlysms'
  });

  const [actionLoading, setActionLoading] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ovRes, invRes, hwRes, actRes, smsRes, voiceRes, cancRes, quarRes, prohRes, logsRes, mapRes, cfgRes] = await Promise.all([
        api.virtualNumbers.grizzly.getOverview(),
        api.virtualNumbers.grizzly.getInventory({ status: invStatusFilter || undefined, limit: 50 }),
        api.virtualNumbers.grizzly.getHardware(),
        api.virtualNumbers.grizzly.getActivations({ status: actStatusFilter || undefined, search: actSearch || undefined, limit: 50 }),
        api.virtualNumbers.grizzly.getSms(),
        api.virtualNumbers.grizzly.getVoiceCalls(),
        api.virtualNumbers.grizzly.getCancellations(),
        api.virtualNumbers.grizzly.getQuarantine(),
        api.virtualNumbers.grizzly.getProhibited(),
        api.virtualNumbers.grizzly.getLogs({ limit: 50 }),
        api.virtualNumbers.grizzly.getMappings(),
        api.virtualNumbers.grizzly.getConfig()
      ]);

      setOverview(ovRes.overview);
      setInventory(invRes.rows || []);
      setInventoryTotal(invRes.total || 0);
      setHardwareModules(hwRes.modules || []);
      setActivations(actRes.rows || []);
      setActivationsTotal(actRes.total || 0);
      setSmsMessages(smsRes.messages || []);
      setVoiceCalls(voiceRes.calls || []);
      setCancellations(cancRes.cancellations || []);
      setQuarantine(quarRes.quarantine || []);
      setProhibited(prohRes.prohibited || []);
      setApiLogs(logsRes.rows || []);
      setApiLogsTotal(logsRes.total || 0);
      setMappings({ countries: mapRes.countries || [], services: mapRes.services || [] });

      if (cfgRes?.config) {
        setConfigForm({
          protocol_key: '', // Keep blank unless updating
          status: cfgRes.config.status,
          priority: cfgRes.config.priority,
          max_active_numbers: cfgRes.config.max_active_numbers,
          min_payout: cfgRes.config.min_payout,
          max_payout: cfgRes.config.max_payout,
          partner_api_endpoint: cfgRes.config.partner_api_endpoint || '/api/virtual-numbers/partners/grizzlysms'
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load GrizzlySMS provider data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [invStatusFilter, actStatusFilter]);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast(`Copied ${label} to clipboard!`);
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const payload: any = {
        status: configForm.status,
        priority: configForm.priority,
        max_active_numbers: configForm.max_active_numbers,
        min_payout: configForm.min_payout,
        max_payout: configForm.max_payout,
        partner_api_endpoint: configForm.partner_api_endpoint
      };
      if (configForm.protocol_key.trim()) {
        payload.protocol_key = configForm.protocol_key.trim();
      }

      await api.virtualNumbers.grizzly.updateConfig(payload);
      showToast('GrizzlySMS provider settings updated successfully!');
      setIsConfigEditing(false);
      loadAll();
    } catch (err: any) {
      alert(err.message || 'Failed to update configuration');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNumberData.phoneNumber.trim()) {
      alert('Please enter a valid phone number (e.g. 19157891133)');
      return;
    }
    setActionLoading(true);
    try {
      await api.virtualNumbers.grizzly.addInventory(newNumberData);
      showToast(`Phone number ${newNumberData.phoneNumber} added to GrizzlySMS inventory!`);
      setIsAddNumberOpen(false);
      setNewNumberData({
        phoneNumber: '',
        countryId: 12,
        operator: 'any',
        costPrice: 15.0,
        canGetAnotherSms: true,
        flashcallSupported: true,
        voiceSupported: false
      });
      loadAll();
    } catch (err: any) {
      alert(err.message || 'Failed to add number to inventory');
    } finally {
      setActionLoading(false);
    }
  };

  const handleManualFinish = async (activationId: number) => {
    if (!window.confirm(`Mark activation #${activationId} as completed (Status 3)? This records the partner reward and releases hardware capacity.`)) {
      return;
    }
    setActionLoading(true);
    try {
      await api.virtualNumbers.grizzly.finishActivation(activationId, 3, 'Manual completion via Admin Dashboard');
      showToast(`Activation #${activationId} completed! Hardware slot released.`);
      loadAll();
    } catch (err: any) {
      alert(err.message || 'Failed to finish activation');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTriggerCall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!triggerCallData.phone.trim() || !triggerCallData.phoneFrom.trim()) {
      alert('Please fill in both phone and caller number');
      return;
    }
    setActionLoading(true);
    try {
      await api.virtualNumbers.grizzly.triggerCall(triggerCallData);
      showToast('Voice call (PUSH_CALL) queued for dispatch to GrizzlySMS!');
      setIsTriggerCallOpen(false);
      loadAll();
    } catch (err: any) {
      alert(err.message || 'Failed to trigger call');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTriggerSms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!triggerSmsData.phone.trim() || !triggerSmsData.text.trim()) {
      alert('Please fill in phone and SMS text');
      return;
    }
    setActionLoading(true);
    try {
      await api.virtualNumbers.grizzly.triggerSms(triggerSmsData);
      showToast('SMS (PUSH_SMS) queued for dispatch to GrizzlySMS!');
      setIsTriggerSmsOpen(false);
      loadAll();
    } catch (err: any) {
      alert(err.message || 'Failed to trigger SMS');
    } finally {
      setActionLoading(false);
    }
  };

  const partnerUrl = `${window.location.origin}/api/virtual-numbers/partners/grizzlysms`;

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-lg text-sm font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5" />
          {toast}
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl flex items-center gap-3 text-sm">
          <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
          <div className="flex-1 font-medium">{error}</div>
          <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Provider Header Banner */}
      <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 rounded-3xl p-6 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-amber-400 border border-white/15 shrink-0 shadow-inner">
            <Radio className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xl font-black tracking-tight">GrizzlySMS Partner Integration</h2>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                  overview?.config.status === 'enabled'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                    : overview?.config.status === 'maintenance'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-400/30'
                }`}
              >
                {overview?.config.status || 'ENABLED'}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-white/80 border border-white/15">
                Priority {overview?.config.priority || 10}
              </span>
            </div>
            <p className="text-xs text-white/70 mt-1 max-w-xl">
              High-throughput SMS supplier protocol. GrizzlySMS consumes platform inventory via <code className="text-amber-300">GET_SERVICES</code> & <code className="text-amber-300">GET_NUMBER</code>.
            </p>
          </div>
        </div>

        {/* Quick Endpoint Copy Card */}
        <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-3.5 flex flex-col gap-1.5 min-w-[280px]">
          <span className="text-[10px] font-bold text-white/60 uppercase tracking-wider">Registered Partner Endpoint</span>
          <div className="flex items-center justify-between gap-2 bg-black/30 rounded-xl px-2.5 py-1.5 font-mono text-xs text-emerald-300 truncate">
            <span className="truncate">{partnerUrl}</span>
            <button
              onClick={() => handleCopy(partnerUrl, 'Partner Endpoint URL')}
              className="text-white/70 hover:text-white p-1"
              title="Copy URL"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center justify-between text-[10px] text-white/50 pt-0.5">
            <span>Last Request: {overview?.config.last_successful_request_at ? new Date(overview.config.last_successful_request_at).toLocaleTimeString() : 'Awaiting traffic'}</span>
            <span className="text-emerald-400 font-semibold">&bull; Active Polling Ready</span>
          </div>
        </div>
      </div>

      {/* Top 4 KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Available Numbers</span>
            <Phone className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {overview?.capacity.inventory.available || 0}
          </div>
          <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
            <span className="text-blue-600 font-semibold">{overview?.capacity.inventory.allocated || 0} currently allocated</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Hardware SIM Capacity</span>
            <Cpu className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {overview?.capacity.modules.active || 0} <span className="text-sm font-normal text-slate-400">/ {overview?.capacity.modules.total || 0} slots</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {overview?.capacity.modules.occupied || 0} occupied &bull; {overview?.capacity.modules.failed || 0} failed
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Successful Activations</span>
            <CheckCircle2 className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {overview?.capacity.activations.successful || 0}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Rewards: <strong className="text-emerald-700 font-mono">${(overview?.accounting.confirmedRewards || 0).toFixed(2)}</strong>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>API Health & Throughput</span>
            <Activity className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {overview?.config.total_requests_count || 0} <span className="text-xs font-normal text-slate-400">calls</span>
          </div>
          <div className="text-xs text-slate-500 mt-1 flex items-center justify-between">
            <span>Error Rate: <strong>{overview?.config.error_rate_percentage || '0.0'}%</strong></span>
            <span>Failed: {overview?.failedAllocationsCount || 0}</span>
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setSubTab('overview')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
              subTab === 'overview'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Activity className="w-4 h-4" />
            Overview
          </button>

          <button
            onClick={() => setSubTab('inventory')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
              subTab === 'inventory'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Phone className="w-4 h-4" />
            Inventory ({inventoryTotal})
          </button>

          <button
            onClick={() => setSubTab('hardware')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
              subTab === 'hardware'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Cpu className="w-4 h-4" />
            Hardware & SIM Slots ({hardwareModules.length})
          </button>

          <button
            onClick={() => setSubTab('activations')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
              subTab === 'activations'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            Activations ({activationsTotal})
          </button>

          <button
            onClick={() => setSubTab('sms')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
              subTab === 'sms'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Inbox className="w-4 h-4" />
            SMS Forwarding ({smsMessages.length})
          </button>

          <button
            onClick={() => setSubTab('voice')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
              subTab === 'voice'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <PhoneCall className="w-4 h-4" />
            Voice Calls ({voiceCalls.length})
          </button>

          <button
            onClick={() => setSubTab('blacklist')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
              subTab === 'blacklist'
                ? 'bg-red-700 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Ban className="w-4 h-4" />
            Blacklist & Quarantine ({cancellations.filter((c: any) => c.is_permanently_excluded).length + quarantine.length + prohibited.length})
          </button>

          <button
            onClick={() => setSubTab('data')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
              subTab === 'data'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Globe className="w-4 h-4" />
            Data Management
          </button>

          <button
            onClick={() => setSubTab('customer-api')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
              subTab === 'customer-api'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            Customer getNumber API
          </button>

          <button
            onClick={() => setSubTab('config')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
              subTab === 'config'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            Provider Config
          </button>

          <button
            onClick={() => setSubTab('logs')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
              subTab === 'logs'
                ? 'bg-slate-700 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            API Request Logs ({apiLogsTotal})
          </button>
        </div>

        <div className="flex items-center gap-2">
          {subTab === 'inventory' && (
            <button
              onClick={() => setIsAddNumberOpen(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Add Phone Number
            </button>
          )}

          {subTab === 'voice' && (
            <button
              onClick={() => setIsTriggerCallOpen(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 flex items-center gap-1.5 shadow-sm"
            >
              <PhoneCall className="w-4 h-4" />
              Trigger Test Call
            </button>
          )}

          {subTab === 'sms' && (
            <button
              onClick={() => setIsTriggerSmsOpen(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-1.5 shadow-sm"
            >
              <Send className="w-4 h-4" />
              Trigger Test SMS
            </button>
          )}

          <button
            onClick={loadAll}
            disabled={loading}
            className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: OVERVIEW & ARCHITECTURAL SUMMARY */}
      {subTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Protocol Operations Status Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Radio className="w-4 h-4 text-purple-600" />
                GrizzlySMS Partner Operations Status
              </h3>

              <div className="space-y-3 text-xs">
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <strong className="text-slate-900 block font-mono">1. GET_SERVICES (Inbound)</strong>
                    <span className="text-slate-500 text-[11px]">Returns available quantity per country/operator/service</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    FULLY IMPLEMENTED
                  </span>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <strong className="text-slate-900 block font-mono">2. GET_NUMBER (Inbound)</strong>
                    <span className="text-slate-500 text-[11px]">Allocates active number, checks prefixes and capacity</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    FULLY IMPLEMENTED
                  </span>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <strong className="text-slate-900 block font-mono">3. PUSH_SMS (Outbound)</strong>
                    <span className="text-slate-500 text-[11px]">Forwards received SMS to GrizzlySMS platform</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                    ADAPTER READY (Pending Docs)
                  </span>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <strong className="text-slate-900 block font-mono">4. FINISH_ACTIVATION (Status 3)</strong>
                    <span className="text-slate-500 text-[11px]">Confirms registration, records rewards, releases slots</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                    ADAPTER READY (Pending Docs)
                  </span>
                </div>
              </div>
            </div>

            {/* Mappings & Live Coverage Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Server className="w-4 h-4 text-emerald-600" />
                Active Country & Service Mappings
              </h3>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 font-bold block mb-1">Mapped Countries</span>
                  <div className="flex flex-wrap gap-1.5">
                    {mappings.countries.slice(0, 8).map((c) => (
                      <span key={c.id} className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-semibold text-slate-700">
                        {c.flag_emoji} {c.country_name} ({c.grizzly_country_id})
                      </span>
                    ))}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 font-bold block mb-1">Supported Services</span>
                  <div className="flex flex-wrap gap-1.5">
                    {mappings.services.slice(0, 8).map((s) => (
                      <span key={s.id} className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono font-bold text-slate-700">
                        {s.service_code.toUpperCase()} ({s.name})
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-3.5 bg-purple-50 rounded-xl border border-purple-100 text-xs text-purple-900">
                <strong className="block font-bold mb-0.5">Capacity Shield & Oversell Prevention</strong>
                Hardware module slots act as strict supply gates. If hardware SIM slots are busy or failed, <code className="font-bold">GET_SERVICES</code> automatically excludes exhausted inventory to guarantee 100% fulfillment.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: INVENTORY MANAGEMENT */}
      {subTab === 'inventory' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3">
              <select
                value={invStatusFilter}
                onChange={(e) => setInvStatusFilter(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium text-slate-700 focus:outline-none"
              >
                <option value="">All Inventory Statuses</option>
                <option value="available">Available</option>
                <option value="allocated">Allocated</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>
            <div className="text-xs text-slate-500 font-medium">
              Showing {inventory.length} of {inventoryTotal} Grizzly numbers
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Phone Number</th>
                    <th className="px-4 py-3">Country</th>
                    <th className="px-4 py-3">Operator</th>
                    <th className="px-4 py-3">Supported Services</th>
                    <th className="px-4 py-3">Hardware Slot</th>
                    <th className="px-4 py-3">Total Allocations</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {inventory.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                        No Grizzly numbers found matching your filters.
                      </td>
                    </tr>
                  ) : (
                    inventory.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3 font-mono font-bold text-slate-900">
                          +{item.phone_number}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-semibold text-slate-800">
                            {item.flag_emoji} {item.country_name || item.country_id}
                          </span>
                        </td>
                        <td className="px-4 py-3 capitalize">{item.operator || 'any'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 flex-wrap">
                            {JSON.parse(item.supported_services || '[]').map((s: string) => (
                              <span key={s} className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-slate-100 text-slate-800">
                                {s}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-500 font-mono">
                          {item.hardware_name ? `${item.hardware_name} (#${item.slot_number})` : 'Virtual Pool'}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-700 font-semibold">
                          {item.total_allocations || 0}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              item.status === 'available'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-blue-50 text-blue-700 border border-blue-200'
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

      {/* SUB-TAB 3: HARDWARE MODULES & SIM CAPACITY */}
      {subTab === 'hardware' && (
        <div className="space-y-4">
          <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 text-xs text-purple-900 flex items-start gap-3">
            <Cpu className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
            <div>
              <strong className="font-bold text-purple-950">Hardware & SIM Module Capacity Architecture</strong>
              <p className="mt-0.5 text-purple-800">
                Each module represents an active physical GSM modem, SIM pool slot, or SIP channel. When an activation occurs, the slot is locked to prevent concurrency collisions.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {hardwareModules.map((mod) => (
              <div key={mod.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">
                      #{mod.slotNumber}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">{mod.name}</h4>
                      <p className="text-[10px] text-slate-400 font-mono">+{mod.phoneNumber || 'Unassigned'}</p>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      mod.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : mod.status === 'occupied'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}
                  >
                    {mod.status}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-600 border-t border-slate-100 pt-3">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Country Code:</span>
                    <strong className="text-slate-800">Country #{mod.countryId}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Operator:</span>
                    <span className="capitalize">{mod.operator || 'any'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Concurrent Channels:</span>
                    <span className="font-mono font-bold text-slate-800">{mod.maxConcurrentChannels || 1}</span>
                  </div>
                  {mod.activeActivationId && (
                    <div className="flex justify-between text-blue-700 font-semibold">
                      <span>Occupied By:</span>
                      <span className="font-mono">Act #{mod.activeActivationId}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-TAB 4: ACTIVATIONS & ALLOCATION HISTORY */}
      {subTab === 'activations' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[220px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search phone or activation ID..."
                  value={actSearch}
                  onChange={(e) => setActSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
                />
              </div>

              <select
                value={actStatusFilter}
                onChange={(e) => setActStatusFilter(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium text-slate-700 focus:outline-none"
              >
                <option value="">All Statuses</option>
                <option value="allocated">Allocated (Live)</option>
                <option value="sms_received">SMS Received</option>
                <option value="finished">Finished (Completed)</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="text-xs text-slate-500 font-medium">
              Total Activations: {activationsTotal}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Activation ID</th>
                    <th className="px-4 py-3">Phone Number</th>
                    <th className="px-4 py-3">Service</th>
                    <th className="px-4 py-3">Country</th>
                    <th className="px-4 py-3">Sum ($)</th>
                    <th className="px-4 py-3">Allocated Time</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activations.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                        No activations recorded yet.
                      </td>
                    </tr>
                  ) : (
                    activations.map((a) => (
                      <tr key={a.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3 font-mono font-bold text-slate-900">
                          #{a.activation_id}
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-slate-800">
                          +{a.phone_number}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-slate-100 text-slate-800">
                            {a.service}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-800">
                          {a.flag_emoji} {a.country_name || a.country_id}
                        </td>
                        <td className="px-4 py-3 font-mono text-emerald-700 font-bold">
                          ${Number(a.requested_sum || 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-slate-400">
                          {new Date(a.allocated_at).toLocaleTimeString()}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              a.status === 'finished'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : a.status === 'sms_received'
                                ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                : a.status === 'allocated'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {a.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {a.status !== 'finished' && (
                            <button
                              onClick={() => handleManualFinish(a.activation_id)}
                              disabled={actionLoading}
                              className="px-2 py-1 text-[10px] font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition"
                            >
                              Finish (Status 3)
                            </button>
                          )}
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

      {/* SUB-TAB 5: SMS FORWARDING QUEUE */}
      {subTab === 'sms' && (
        <div className="space-y-4">
          <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 text-xs text-indigo-900 flex items-start gap-3">
            <Inbox className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <strong className="font-bold text-indigo-950 text-sm">PUSH_SMS Outbound Dispatch Queue</strong>
                <button
                  onClick={() => setIsTriggerSmsOpen(true)}
                  className="px-3 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 shadow-sm flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  Trigger Test SMS
                </button>
              </div>
              <p className="mt-1 text-indigo-800">
                Incoming SMS on allocated numbers are dispatched to <code className="bg-indigo-100 px-1 py-0.5 rounded font-mono text-[11px]">https://api.grizzlysms.com/agent/api/sms</code> with stable integer <code className="bg-indigo-100 px-1 py-0.5 rounded font-mono text-[11px]">smsId</code>. Any failure automatically retries every 10 seconds.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-3">SMS ID</th>
                    <th className="px-4 py-3">Activation</th>
                    <th className="px-4 py-3">Recipient Phone</th>
                    <th className="px-4 py-3">Sender (phoneFrom)</th>
                    <th className="px-4 py-3">Message Text</th>
                    <th className="px-4 py-3">Delivery Status</th>
                    <th className="px-4 py-3">Retries</th>
                    <th className="px-4 py-3">Delivered / Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {smsMessages.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                        No SMS messages intercepted or queued yet.
                      </td>
                    </tr>
                  ) : (
                    smsMessages.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3 font-mono font-bold text-slate-900">
                          #{m.sms_id || m.id}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-600">
                          {m.activation_id ? `#${m.activation_id}` : 'Direct'}
                        </td>
                        <td className="px-4 py-3 font-mono font-semibold text-slate-800">
                          +{m.phone_number}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{m.sender}</td>
                        <td className="px-4 py-3 text-slate-800 font-mono text-[11px] max-w-xs truncate" title={m.message_content}>
                          {m.message_content}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              m.push_status === 'DELIVERED' || m.forwarding_status === 'FORWARDED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : m.push_status === 'FAILED'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {m.push_status || m.forwarding_status || 'PENDING'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-600">
                          {m.retry_count || 0}
                          {m.next_retry_at && m.push_status !== 'DELIVERED' && (
                            <span className="block text-[9px] text-amber-600">retry in 10s</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-[11px]">
                          {m.delivered_at
                            ? new Date(m.delivered_at).toLocaleTimeString()
                            : new Date(m.received_timestamp).toLocaleTimeString()}
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

      {/* SUB-TAB: VOICE CALLS (PUSH_CALL & PUSH_CALL_RECORD) */}
      {subTab === 'voice' && (
        <div className="space-y-4">
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-xs text-rose-900 flex items-start gap-3">
            <PhoneCall className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <strong className="font-bold text-rose-950 text-sm">Durable Voice & Flashcall Notification Queue (PUSH_CALL)</strong>
                <button
                  onClick={() => setIsTriggerCallOpen(true)}
                  className="px-3 py-1.5 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 shadow-sm flex items-center gap-1.5"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  Trigger Test Call
                </button>
              </div>
              <p className="mt-1 text-rose-800">
                Calls forwarded immediately to <code className="bg-rose-100 px-1 py-0.5 rounded font-mono text-[11px]">https://api.grizzlysms.com/agent/api/sms</code> with stable numeric integer <code className="bg-rose-100 px-1 py-0.5 rounded font-mono text-[11px]">callId</code> and international numeric phone. Never duplicates upon SUCCESS; retries every 10s across server restarts on failure.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Call ID</th>
                    <th className="px-4 py-3">Activation</th>
                    <th className="px-4 py-3">Target Phone (Ulong)</th>
                    <th className="px-4 py-3">Caller (phoneFrom)</th>
                    <th className="px-4 py-3">Delivery Status</th>
                    <th className="px-4 py-3">Retries</th>
                    <th className="px-4 py-3">Next Retry / Delivered</th>
                    <th className="px-4 py-3">Logged At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {voiceCalls.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                        No voice calls or flashcall notifications in queue.
                      </td>
                    </tr>
                  ) : (
                    voiceCalls.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3 font-mono font-bold text-slate-900">
                          #{c.call_id}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-600">
                          {c.activation_id ? `#${c.activation_id}` : 'Direct'}
                        </td>
                        <td className="px-4 py-3 font-mono font-semibold text-slate-800">
                          +{c.phone}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900 font-mono">
                          +{c.phone_from}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              c.delivery_status === 'DELIVERED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : c.delivery_status === 'FAILED'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {c.delivery_status}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-600">
                          {c.retry_count || 0}
                        </td>
                        <td className="px-4 py-3 text-slate-500 font-mono text-[11px]">
                          {c.delivery_status === 'DELIVERED' ? (
                            <span className="text-emerald-700 font-bold">
                              {c.delivered_at ? new Date(c.delivered_at).toLocaleTimeString() : 'Delivered'}
                            </span>
                          ) : c.next_retry_at ? (
                            <span className="text-amber-700">
                              Retry: {new Date(c.next_retry_at).toLocaleTimeString()}
                            </span>
                          ) : (
                            'Pending queue'
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-[11px]">
                          {new Date(c.created_at).toLocaleTimeString()}
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

      {/* SUB-TAB: BLACKLIST, CANCELLATIONS & QUARANTINE */}
      {subTab === 'blacklist' && (
        <div className="space-y-6">
          {/* Compliance Rule Banner */}
          <div className="bg-gradient-to-r from-red-950 via-slate-900 to-slate-900 rounded-2xl p-5 text-white border border-red-900/50 shadow-md">
            <h4 className="font-bold text-sm flex items-center gap-2 text-rose-300">
              <ShieldAlert className="w-5 h-5 text-rose-400" />
              GrizzlySMS Official Activation Status Compliance Rules
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3 text-xs">
              <div className="bg-white/10 rounded-xl p-3 border border-white/10">
                <span className="font-extrabold text-amber-300 block mb-1">Status 4 (Cancelled)</span>
                <p className="text-white/80 text-[11px]">
                  Cancellation count tracked atomically per phone & service. If cancelled <strong>&ge; 5 times</strong> for the same service, number is <strong>permanently excluded</strong> for that service (other services unaffected).
                </p>
              </div>
              <div className="bg-white/10 rounded-xl p-3 border border-white/10">
                <span className="font-extrabold text-rose-300 block mb-1">Status 5 (Returned)</span>
                <p className="text-white/80 text-[11px]">
                  Customer refund recorded in financial ledger. Number placed in <strong>quarantine</strong> for that service to prevent automatic reissuance.
                </p>
              </div>
              <div className="bg-white/10 rounded-xl p-3 border border-white/10">
                <span className="font-extrabold text-purple-300 block mb-1">Status 1 (Prohibited)</span>
                <p className="text-white/80 text-[11px]">
                  Issuance prohibited by provider. Marked as prohibited with full audit trail to prevent any inappropriate reallocation.
                </p>
              </div>
            </div>
          </div>

          {/* Section 1: Cancellations & Blacklisted Numbers */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Ban className="w-4 h-4 text-red-600" />
                Service Cancellations & Permanent Exclusion ({cancellations.length})
              </h4>
              <span className="text-xs text-slate-500 font-medium">
                {cancellations.filter((c: any) => c.is_permanently_excluded).length} permanently excluded
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Phone Number</th>
                    <th className="px-4 py-3">Service</th>
                    <th className="px-4 py-3">Cancellations</th>
                    <th className="px-4 py-3">Exclusion Status</th>
                    <th className="px-4 py-3">Last Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cancellations.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                        No cancellations recorded yet. All numbers at 0/5 cancellations.
                      </td>
                    </tr>
                  ) : (
                    cancellations.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3 font-mono font-bold text-slate-900">
                          +{c.phone_number}
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-indigo-700 uppercase">
                          {c.service || c.service_code}
                        </td>
                        <td className="px-4 py-3 font-mono">
                          <span className={`font-bold ${c.cancellation_count >= 5 ? 'text-red-600' : 'text-slate-800'}`}>
                            {c.cancellation_count} / 5
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {c.is_permanently_excluded ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-red-100 text-red-800 border border-red-200">
                              Permanently Excluded
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800">
                              Eligible ({5 - c.cancellation_count} left)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-[11px]">
                          {new Date(c.updated_at).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 2: Quarantine & Prohibited */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Quarantine Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50">
                <h4 className="font-bold text-xs text-rose-800 uppercase tracking-wider flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  Status 5 Quarantine ({quarantine.length})
                </h4>
              </div>
              <div className="overflow-x-auto max-h-72">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2.5">Phone</th>
                      <th className="px-3 py-2.5">Service</th>
                      <th className="px-3 py-2.5">Reason</th>
                      <th className="px-3 py-2.5">Quarantined</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {quarantine.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-slate-400 text-xs">
                          No numbers in quarantine.
                        </td>
                      </tr>
                    ) : (
                      quarantine.map((q) => (
                        <tr key={q.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-mono font-bold text-slate-900">+{q.phone_number}</td>
                          <td className="px-3 py-2 font-mono text-indigo-700 uppercase">{q.service || q.service_code}</td>
                          <td className="px-3 py-2 text-slate-600 text-[11px] truncate max-w-[120px]">{q.reason || 'Returned (Status 5)'}</td>
                          <td className="px-3 py-2 text-slate-400 text-[10px]">{new Date(q.quarantined_at).toLocaleTimeString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Prohibited Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50">
                <h4 className="font-bold text-xs text-purple-800 uppercase tracking-wider flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-purple-600" />
                  Status 1 Prohibited ({prohibited.length})
                </h4>
              </div>
              <div className="overflow-x-auto max-h-72">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2.5">Phone</th>
                      <th className="px-3 py-2.5">Service</th>
                      <th className="px-3 py-2.5">Reason</th>
                      <th className="px-3 py-2.5">Logged At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {prohibited.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-slate-400 text-xs">
                          No prohibited numbers recorded.
                        </td>
                      </tr>
                    ) : (
                      prohibited.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-mono font-bold text-slate-900">+{p.phone_number}</td>
                          <td className="px-3 py-2 font-mono text-purple-700 uppercase">{p.service || p.service_code}</td>
                          <td className="px-3 py-2 text-slate-600 text-[11px] truncate max-w-[120px]">{p.reason || 'Status 1 Prohibited'}</td>
                          <td className="px-3 py-2 text-slate-400 text-[10px]">{new Date(p.prohibited_at).toLocaleTimeString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB: DATA MANAGEMENT */}
      {subTab === 'data' && <GrizzlyDataManagementView />}

      {/* SUB-TAB: CUSTOMER GETNUMBER API */}
      {subTab === 'customer-api' && <GrizzlyCustomerAdminView />}

      {/* SUB-TAB 6: PROVIDER CONFIGURATION */}
      {subTab === 'config' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm max-w-2xl space-y-5">
          <div>
            <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
              <Sliders className="w-5 h-5 text-amber-600" />
              GrizzlySMS Provider Configuration
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Configure protocol authentication keys, operational status, priority, and capacity boundaries.
            </p>
          </div>

          <form onSubmit={handleSaveConfig} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Provider Status</label>
                <select
                  value={configForm.status}
                  onChange={(e: any) => setConfigForm({ ...configForm, status: e.target.value })}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                >
                  <option value="enabled">Enabled (Accepting Requests)</option>
                  <option value="disabled">Disabled (Returns NO_NUMBERS)</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Provider Priority</label>
                <input
                  type="number"
                  value={configForm.priority}
                  onChange={(e) => setConfigForm({ ...configForm, priority: parseInt(e.target.value) || 1 })}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Protocol Authentication Key
              </label>
              <div className="relative">
                <input
                  type="password"
                  placeholder="Enter new protocol key (leave blank to keep current)"
                  value={configForm.protocol_key}
                  onChange={(e) => setConfigForm({ ...configForm, protocol_key: e.target.value })}
                  className="w-full text-xs p-2.5 pl-9 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Authentication key checked via constant-time comparison on every incoming request.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Max Active Allocations</label>
                <input
                  type="number"
                  value={configForm.max_active_numbers}
                  onChange={(e) => setConfigForm({ ...configForm, max_active_numbers: parseInt(e.target.value) || 100 })}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Partner Inbound Path</label>
                <input
                  type="text"
                  value={configForm.partner_api_endpoint}
                  onChange={(e) => setConfigForm({ ...configForm, partner_api_endpoint: e.target.value })}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                type="submit"
                disabled={actionLoading}
                className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md shadow-amber-950/10"
              >
                {actionLoading ? 'Saving Settings...' : 'Save Configuration'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SUB-TAB 7: REAL-TIME API REQUEST LOGS */}
      {subTab === 'logs' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider">
              Real-time Grizzly Partner Requests
            </h4>
            <span className="text-xs text-slate-500 font-medium">
              Showing {apiLogs.length} of {apiLogsTotal} calls
            </span>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Client IP</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Latency</th>
                    <th className="px-4 py-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {apiLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                        No API calls logged yet.
                      </td>
                    </tr>
                  ) : (
                    apiLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">
                          {new Date(log.created_at).toLocaleTimeString()}
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-purple-700">
                          {log.action}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-600">{log.client_ip}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                              log.response_status === 'SUCCESS'
                                ? 'bg-emerald-100 text-emerald-800'
                                : log.response_status === 'NO_NUMBERS'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {log.response_status}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-700">
                          {log.response_time_ms} ms
                        </td>
                        <td className="px-4 py-3 text-slate-500 font-mono text-[10px] max-w-xs truncate">
                          {log.error_message || log.response_body}
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
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <Phone className="w-5 h-5 text-emerald-600" />
                Add Number to GrizzlySMS Pool
              </h3>
              <button
                onClick={() => setIsAddNumberOpen(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddNumber} className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number (E.164 without +)</label>
                <input
                  type="text"
                  required
                  placeholder="19157891133"
                  value={newNumberData.phoneNumber}
                  onChange={(e) => setNewNumberData({ ...newNumberData, phoneNumber: e.target.value })}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Country</label>
                  <select
                    value={newNumberData.countryId}
                    onChange={(e) => setNewNumberData({ ...newNumberData, countryId: parseInt(e.target.value, 10) })}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
                  >
                    {mappings.countries.map((c) => (
                      <option key={c.id} value={c.grizzly_country_id}>
                        {c.flag_emoji} {c.country_name} ({c.grizzly_country_id})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Operator</label>
                  <input
                    type="text"
                    value={newNumberData.operator}
                    onChange={(e) => setNewNumberData({ ...newNumberData, operator: e.target.value })}
                    placeholder="any"
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Cost Price ($)</label>
                <input
                  type="number"
                  step="0.1"
                  value={newNumberData.costPrice}
                  onChange={(e) => setNewNumberData({ ...newNumberData, costPrice: parseFloat(e.target.value) || 0 })}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono"
                />
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
                  {actionLoading ? 'Saving...' : 'Add to Pool'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TRIGGER TEST VOICE CALL (PUSH_CALL) */}
      {isTriggerCallOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <PhoneCall className="w-5 h-5 text-rose-600" />
                Trigger Test Voice Call (PUSH_CALL)
              </h3>
              <button
                onClick={() => setIsTriggerCallOpen(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleTriggerCall} className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Target Number (phone - E.164 Numeric)</label>
                <input
                  type="text"
                  required
                  placeholder="447472190082"
                  value={triggerCallData.phone}
                  onChange={(e) => setTriggerCallData({ ...triggerCallData, phone: e.target.value })}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-1">Full international number with country code without plus sign.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Caller Number (phoneFrom)</label>
                <input
                  type="text"
                  required
                  placeholder="447472190099"
                  value={triggerCallData.phoneFrom}
                  onChange={(e) => setTriggerCallData({ ...triggerCallData, phoneFrom: e.target.value })}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsTriggerCallOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 text-xs font-bold bg-rose-600 text-white rounded-xl hover:bg-rose-700 shadow-md shadow-rose-950/10 flex items-center gap-1.5"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  {actionLoading ? 'Dispatching...' : 'Dispatch PUSH_CALL'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TRIGGER TEST SMS (PUSH_SMS) */}
      {isTriggerSmsOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <Send className="w-5 h-5 text-indigo-600" />
                Trigger Test SMS (PUSH_SMS)
              </h3>
              <button
                onClick={() => setIsTriggerSmsOpen(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleTriggerSms} className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Target Number (phone - E.164 Numeric)</label>
                <input
                  type="text"
                  required
                  placeholder="447472190082"
                  value={triggerSmsData.phone}
                  onChange={(e) => setTriggerSmsData({ ...triggerSmsData, phone: e.target.value })}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Sender (phoneFrom)</label>
                <input
                  type="text"
                  required
                  placeholder="Telegram / WhatsApp / 447472190099"
                  value={triggerSmsData.phoneFrom}
                  onChange={(e) => setTriggerSmsData({ ...triggerSmsData, phoneFrom: e.target.value })}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Message Text (text)</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Your verification code is: 84920"
                  value={triggerSmsData.text}
                  onChange={(e) => setTriggerSmsData({ ...triggerSmsData, text: e.target.value })}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsTriggerSmsOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 text-xs font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 shadow-md shadow-indigo-950/10 flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  {actionLoading ? 'Dispatching...' : 'Dispatch PUSH_SMS'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

