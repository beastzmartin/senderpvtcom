import React, { useEffect, useState } from 'react';
import { api, getAuthToken } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
  AdminOverviewStats,
  VaultLogItem,
  VaultRecordDetail,
  AdminSessionItem,
  AdminStorageStats,
  UserDataSummary,
  LiveCampaignItem
} from '../../types';
import {
  ShieldCheck,
  Users,
  Database,
  Download,
  Eye,
  LogIn,
  Key,
  Trash2,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  Edit3,
  Server,
  HardDrive,
  Cpu,
  Smartphone,
  MessageSquare,
  FileSpreadsheet,
  FileJson,
  AlertTriangle,
  Lock,
  Unlock,
  X,
  Power,
  PowerOff,
  RotateCw,
  Flame,
  Activity,
  FolderX,
  Eraser,
  StopCircle
} from 'lucide-react';

interface AdminControlCenterProps {
  onImpersonated?: () => void;
}

type AdminSubTab = 'users' | 'sessions' | 'storage' | 'vault' | 'live' | 'capacity';

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${seconds % 60}s`;
}

export const AdminControlCenter: React.FC<AdminControlCenterProps> = ({ onImpersonated }) => {
  const { impersonateUser, user: currentUser } = useAuth();
  const [subTab, setSubTab] = useState<AdminSubTab>('users');

  // Data states
  const [overview, setOverview] = useState<AdminOverviewStats | null>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [vaultLogs, setVaultLogs] = useState<VaultLogItem[]>([]);
  const [sessions, setSessions] = useState<AdminSessionItem[]>([]);
  const [storageStats, setStorageStats] = useState<AdminStorageStats | null>(null);
  const [liveCampaigns, setLiveCampaigns] = useState<LiveCampaignItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Filters
  const [userSearch, setUserSearch] = useState('');
  const [sessionSearch, setSessionSearch] = useState('');
  const [vaultSearch, setVaultSearch] = useState('');
  const [vaultUserFilter, setVaultUserFilter] = useState<string>('');

  // Modals
  const [previewRecord, setPreviewRecord] = useState<VaultRecordDetail | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [editingCustomer, setEditingCustomer] = useState<any | null>(null);
  const [editPlanTier, setEditPlanTier] = useState('pro');
  const [editStatus, setEditStatus] = useState('active');
  const [editDurationDays, setEditDurationDays] = useState('30');
  const [editMaxDevices, setEditMaxDevices] = useState('3');
  const [editDailyLimit, setEditDailyLimit] = useState('1000');
  const [editExtractionLimit, setEditExtractionLimit] = useState('5000');

  const [resetPwdCustomer, setResetPwdCustomer] = useState<any | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');

  // User Data Eraser Modal
  const [dataManagerUser, setDataManagerUser] = useState<any | null>(null);
  const [userDataSummary, setUserDataSummary] = useState<UserDataSummary | null>(null);
  const [userDataLoading, setUserDataLoading] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const loadAllData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ovRes, custRes, vaultRes, sessRes, storRes, liveRes] = await Promise.all([
        api.admin.getOverview(),
        api.subscriptions.adminListCustomers(),
        api.admin.listVault(vaultUserFilter || undefined),
        api.admin.listSessions(),
        api.admin.getStorageStats(),
        api.admin.listLiveCampaigns()
      ]);
      setOverview(ovRes.stats);
      setCustomers(custRes.customers || []);
      setVaultLogs(vaultRes.logs || []);
      setSessions(sessRes.sessions || []);
      setStorageStats(storRes.storage);
      setLiveCampaigns(liveRes.campaigns || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load admin control data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [vaultUserFilter]);

  // Impersonation
  const handleImpersonate = async (targetUser: any) => {
    if (targetUser.id === currentUser?.id) {
      showToast('You are already logged into this admin account.');
      return;
    }
    try {
      await impersonateUser(targetUser.id);
      if (onImpersonated) onImpersonated();
    } catch (err: any) {
      setError(err.message || 'Failed to log in as user.');
    }
  };

  // Customer Plan Edit
  const handleOpenEditCustomer = (c: any) => {
    setEditingCustomer(c);
    setEditPlanTier(c.plan_tier || 'starter');
    setEditStatus(c.subscription_status || 'active');
    setEditDurationDays('30');
    setEditMaxDevices(String(c.max_devices || 1));
    setEditDailyLimit(String(c.daily_message_limit || 100));
    setEditExtractionLimit(String(c.daily_extraction_limit || 500));
  };

  const handleSaveCustomerEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;
    try {
      await api.subscriptions.adminUpdateCustomer({
        targetUserId: editingCustomer.id,
        planTier: editPlanTier,
        subscriptionStatus: editStatus,
        durationDays: parseInt(editDurationDays, 10),
        maxDevices: parseInt(editMaxDevices, 10),
        dailyLimit: parseInt(editDailyLimit, 10),
        extractionLimit: parseInt(editExtractionLimit, 10)
      });
      setEditingCustomer(null);
      showToast(`Updated plan & limits for @${editingCustomer.username}`);
      loadAllData();
    } catch (err: any) {
      setError(err.message || 'Failed to update customer.');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPwdCustomer || !newPasswordInput) return;
    try {
      await api.admin.resetPassword(resetPwdCustomer.id, newPasswordInput);
      setResetPwdCustomer(null);
      setNewPasswordInput('');
      showToast(`Password reset for @${resetPwdCustomer.username}`);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password.');
    }
  };

  const handleToggleStatus = async (c: any) => {
    const nextActive = c.is_active === 0;
    try {
      await api.admin.toggleUserStatus(c.id, nextActive);
      showToast(`User @${c.username} ${nextActive ? 'activated' : 'disabled'}.`);
      loadAllData();
    } catch (err: any) {
      setError(err.message || 'Failed to toggle user status.');
    }
  };

  const handleDeleteUser = async (c: any) => {
    if (!window.confirm(`Permanently delete user "${c.name}" (@${c.username}) and ALL their data?`)) return;
    try {
      await api.admin.deleteUser(c.id);
      showToast(`Deleted user @${c.username}.`);
      loadAllData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete user.');
    }
  };

  // User Data & Message History Manager
  const handleOpenUserDataManager = async (c: any) => {
    setDataManagerUser(c);
    setUserDataLoading(true);
    setUserDataSummary(null);
    try {
      const res = await api.admin.getUserDataSummary(c.id);
      setUserDataSummary(res.summary);
    } catch (err: any) {
      setError(err.message || 'Failed to load user data summary.');
    } finally {
      setUserDataLoading(false);
    }
  };

  const handleUserDataAction = async (
    actionType: 'messages' | 'contacts' | 'campaigns' | 'terminate_devices' | 'factory_reset'
  ) => {
    if (!dataManagerUser) return;
    const labels: Record<string, string> = {
      messages: `Delete ALL message history & conversations for @${dataManagerUser.username}?`,
      contacts: `Delete ALL saved contacts for @${dataManagerUser.username}?`,
      campaigns: `Delete ALL bulk/joiner/scheduled campaigns for @${dataManagerUser.username}?`,
      terminate_devices: `Terminate & wipe ALL WhatsApp devices/session keys for @${dataManagerUser.username}?`,
      factory_reset: `FACTORY RESET @${dataManagerUser.username}? This wipes devices, messages, contacts, and campaigns!`
    };

    if (!window.confirm(labels[actionType])) return;

    setActionLoading(true);
    try {
      let res: any;
      if (actionType === 'messages') res = await api.admin.deleteUserMessages(dataManagerUser.id);
      if (actionType === 'contacts') res = await api.admin.deleteUserContacts(dataManagerUser.id);
      if (actionType === 'campaigns') res = await api.admin.deleteUserCampaigns(dataManagerUser.id);
      if (actionType === 'terminate_devices') res = await api.admin.terminateUserDevices(dataManagerUser.id);
      if (actionType === 'factory_reset') res = await api.admin.factoryResetUser(dataManagerUser.id);

      showToast(res?.message || 'Action completed.');
      const sumRes = await api.admin.getUserDataSummary(dataManagerUser.id);
      setUserDataSummary(sumRes.summary);
      loadAllData();
    } catch (err: any) {
      setError(err.message || 'Action failed.');
    } finally {
      setActionLoading(false);
    }
  };

  // Session Controller & Device Terminator
  const handleSessionAction = async (
    sessionId: string,
    action: 'disconnect' | 'reconnect' | 'terminate'
  ) => {
    if (
      action === 'terminate' &&
      !window.confirm(`TERMINATE device [${sessionId}]? This logs out WhatsApp and wipes session keys from disk permanently!`)
    ) {
      return;
    }

    setActionLoading(true);
    try {
      let res: any;
      if (action === 'disconnect') res = await api.admin.disconnectSession(sessionId);
      if (action === 'reconnect') res = await api.admin.reconnectSession(sessionId);
      if (action === 'terminate') res = await api.admin.terminateSession(sessionId);

      showToast(res?.message || 'Session action executed.');
      loadAllData();
    } catch (err: any) {
      setError(err.message || `Failed to ${action} device.`);
    } finally {
      setActionLoading(false);
    }
  };

  // Storage & Data Manager Actions
  const handleVacuumDb = async () => {
    setActionLoading(true);
    try {
      const res = await api.admin.vacuumDatabase();
      showToast(res.message);
      loadAllData();
    } catch (err: any) {
      setError(err.message || 'Failed to vacuum database.');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePurgeMessages = async (opts: { olderThanDays?: number; onlyFailed?: boolean }) => {
    const desc = opts.onlyFailed
      ? 'all FAILED messages'
      : opts.olderThanDays === 0
      ? 'ALL messages across the entire website'
      : `messages older than ${opts.olderThanDays} days`;
    if (!window.confirm(`Are you sure you want to purge ${desc}?`)) return;

    setActionLoading(true);
    try {
      const res = await api.admin.purgeOldMessages(opts);
      showToast(res.message);
      loadAllData();
    } catch (err: any) {
      setError(err.message || 'Failed to purge messages.');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePurgeOrphanSessions = async () => {
    setActionLoading(true);
    try {
      const res = await api.admin.purgeOrphanSessions();
      showToast(`${res.message} Freed ${formatBytes(res.freedBytes)}.`);
      loadAllData();
    } catch (err: any) {
      setError(err.message || 'Failed to purge orphan sessions.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownloadDbBackup = async () => {
    try {
      const token = getAuthToken();
      const response = await fetch(api.admin.downloadDbBackupUrl(), {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!response.ok) throw new Error('Failed to download DB backup');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `whatsapp_db_backup_${new Date().toISOString().slice(0, 10)}.db`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Full SQLite database backup downloaded!');
    } catch (err: any) {
      setError(err.message || 'Failed to download database backup.');
    }
  };

  // Live Campaigns Monitor
  const handleStopLiveCampaign = async (type: 'bulk' | 'joiner', id: string) => {
    try {
      const res = await api.admin.stopLiveCampaign(type, id);
      showToast(res.message);
      loadAllData();
    } catch (err: any) {
      setError(err.message || 'Failed to stop campaign.');
    }
  };

  // Vault Actions
  const handlePreviewVault = async (id: string) => {
    setPreviewLoading(true);
    try {
      const res = await api.admin.getVaultRecord(id);
      setPreviewRecord(res.record);
    } catch (err: any) {
      setError(err.message || 'Failed to load vault record.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownloadVaultCsv = async (log: VaultLogItem) => {
    try {
      const token = getAuthToken();
      const url = api.admin.downloadVaultCsvUrl(log.id);
      const response = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!response.ok) throw new Error('Failed to download CSV');
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      const safeName = (log.group_name || 'leads').replace(/[^a-z0-9]/gi, '_');
      a.download = `vault_${log.username || 'user'}_${safeName}.csv`;
      a.click();
      URL.revokeObjectURL(downloadUrl);
      showToast('Downloaded CSV from Admin Vault.');
    } catch (err: any) {
      setError(err.message || 'Failed to download CSV.');
    }
  };

  const handleDownloadVaultJson = async (log: VaultLogItem) => {
    try {
      const res = await api.admin.getVaultRecord(log.id);
      const blob = new Blob([JSON.stringify(res.record.contacts || [], null, 2)], {
        type: 'application/json'
      });
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      const safeName = (log.group_name || 'leads').replace(/[^a-z0-9]/gi, '_');
      a.download = `vault_${log.username || 'user'}_${safeName}.json`;
      a.click();
      URL.revokeObjectURL(downloadUrl);
      showToast('Downloaded JSON from Admin Vault.');
    } catch (err: any) {
      setError(err.message || 'Failed to download JSON.');
    }
  };

  const handleDeleteVaultItem = async (id: string) => {
    try {
      await api.admin.deleteVaultRecord(id);
      setVaultLogs((prev) => prev.filter((item) => item.id !== id));
      showToast('Vault record deleted.');
    } catch (err: any) {
      setError(err.message || 'Failed to delete vault item.');
    }
  };

  const handleClearVault = async () => {
    if (!window.confirm('Clear ALL intercepted lead records from the Admin Vault?')) return;
    try {
      await api.admin.clearVault();
      setVaultLogs([]);
      showToast('Admin Vault cleared.');
      loadAllData();
    } catch (err: any) {
      setError(err.message || 'Failed to clear vault.');
    }
  };

  const filteredCustomers = customers.filter((c) => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      c.username?.toLowerCase().includes(q) ||
      c.name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q)
    );
  });

  const filteredSessions = sessions.filter((s) => {
    const q = sessionSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      s.session_id?.toLowerCase().includes(q) ||
      s.username?.toLowerCase().includes(q) ||
      s.user_name?.toLowerCase().includes(q) ||
      s.alias?.toLowerCase().includes(q) ||
      s.phone_number?.toLowerCase().includes(q)
    );
  });

  const filteredVault = vaultLogs.filter((v) => {
    const q = vaultSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      v.group_name?.toLowerCase().includes(q) ||
      v.username?.toLowerCase().includes(q) ||
      v.user_name?.toLowerCase().includes(q) ||
      v.source_action?.toLowerCase().includes(q)
    );
  });

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'download_csv':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">Downloaded CSV</span>;
      case 'download_json':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800">Downloaded JSON</span>;
      case 'copied_numbers':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">Copied Numbers</span>;
      case 'export_contacts':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800">Saved Contacts</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">Extracted Group</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 rounded-2xl text-white shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/20 rounded-xl border border-emerald-400/30">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Super Admin Control Center</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Impersonation, Session & Device Terminator, Storage Manager, User History Eraser & Lead Vault
            </p>
          </div>
        </div>
        <button
          onClick={loadAllData}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold transition border border-white/10 self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh All Telemetry
        </button>
      </div>

      {toast && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 shadow-sm">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Overview Stats Cards */}
      {overview && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">
              <span>Registered Users</span>
              <Users className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{overview.totalUsers}</div>
            <div className="text-xs text-slate-500 mt-1">
              {overview.activeUsers} Active &bull; {overview.paidUsers} Paid &bull; {overview.trialUsers} Trial
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">
              <span>Live WhatsApp Devices</span>
              <Smartphone className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900">
              {overview.connectedDevices} <span className="text-sm font-normal text-slate-400">/ {sessions.length} total</span>
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {storageStats ? formatBytes(storageStats.sessionsStorage.totalBytes) : '...'} session keys on disk
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">
              <span>Database & Messages</span>
              <MessageSquare className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{overview.totalMessages.toLocaleString()}</div>
            <div className="text-xs text-slate-500 mt-1">
              DB Size: <strong>{storageStats ? formatBytes(storageStats.database.totalDbBytes) : '...'}</strong>
            </div>
          </div>

          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-5 rounded-2xl border border-emerald-200 shadow-sm">
            <div className="flex items-center justify-between text-emerald-800 text-xs font-semibold uppercase tracking-wider mb-2">
              <span>Secret Vault Leads</span>
              <Database className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-bold text-emerald-950">
              {overview.vault.totalContactsCaptured.toLocaleString()}
            </div>
            <div className="text-xs text-emerald-700 mt-1">
              {overview.vault.totalPhonesCaptured.toLocaleString()} Real Phones &bull; {overview.vault.totalExtractions} Captures
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setSubTab('users')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
            subTab === 'users'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Users className="w-4 h-4" />
          Users & Data Eraser ({customers.length})
        </button>

        <button
          onClick={() => setSubTab('sessions')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
            subTab === 'sessions'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Smartphone className="w-4 h-4" />
          Session & Device Terminator ({sessions.length})
        </button>

        <button
          onClick={() => setSubTab('storage')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
            subTab === 'storage'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <HardDrive className="w-4 h-4" />
          Storage & Data Manager
        </button>

        <button
          onClick={() => setSubTab('vault')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
            subTab === 'vault'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Database className="w-4 h-4" />
          Extracted Leads Vault ({vaultLogs.length})
        </button>

        <button
          onClick={() => setSubTab('live')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
            subTab === 'live'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Activity className="w-4 h-4" />
          Live Campaigns ({liveCampaigns.length})
        </button>

        <button
          onClick={() => setSubTab('capacity')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
            subTab === 'capacity'
              ? 'bg-slate-700 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Server className="w-4 h-4" />
          Server Capacity Guide
        </button>
      </div>

      {/* TAB 1: USERS, IMPERSONATION & PARTICULAR USER DATA ERASER */}
      {subTab === 'users' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">All Users & Account Control</h2>
              <p className="text-xs text-slate-500">
                Impersonate accounts, wipe a particular user's message history, terminate their devices, or edit limits.
              </p>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search username, email, name..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider border-b border-slate-200">
                  <th className="py-3 px-4 font-semibold">User</th>
                  <th className="py-3 px-4 font-semibold">Plan & Limits</th>
                  <th className="py-3 px-4 font-semibold">Activity Stats</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Admin Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredCustomers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0">
                          {(c.name || c.username || 'U')[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                            {c.name}
                            {c.role === 'admin' && (
                              <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 text-[10px] font-bold">ADMIN</span>
                            )}
                            {c.role === 'reseller' && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-bold">RESELLER</span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500">
                            @{c.username} {c.email ? `• ${c.email}` : ''}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 text-xs font-bold uppercase">
                          {c.plan_tier}
                        </span>
                        <span className="text-xs text-slate-500">
                          ({c.max_devices} dev / {c.daily_message_limit} msg)
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Expires: {c.subscription_expires_at ? new Date(c.subscription_expires_at).toLocaleDateString() : 'Lifetime / Never'}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="text-xs text-slate-700 space-y-0.5">
                        <div>Devices: <strong>{c.connected_devices || 0}</strong></div>
                        <div>Messages: <strong>{c.total_messages_sent || 0}</strong></div>
                        <div className="text-emerald-700 font-medium">
                          Vault Leads: <strong>{c.total_extracted_contacts || 0}</strong>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      {c.is_active === 0 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                          <XCircle className="w-3.5 h-3.5" /> Disabled
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Active
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {c.id !== currentUser?.id && (
                          <button
                            onClick={() => handleImpersonate(c)}
                            title="Login directly into this user's account"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition shadow-sm"
                          >
                            <LogIn className="w-3.5 h-3.5" />
                            Login
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenUserDataManager(c)}
                          title="Delete User Message History, Wipe Data or Terminate Devices"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold transition"
                        >
                          <Eraser className="w-3.5 h-3.5" />
                          Data & History
                        </button>
                        <button
                          onClick={() => handleOpenEditCustomer(c)}
                          title="Edit Plan & Limits"
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setResetPwdCustomer(c);
                            setNewPasswordInput('');
                          }}
                          title="Reset Password"
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition"
                        >
                          <Key className="w-4 h-4" />
                        </button>
                        {c.id !== currentUser?.id && (
                          <>
                            <button
                              onClick={() => handleToggleStatus(c)}
                              title={c.is_active === 0 ? 'Activate Account' : 'Disable Account'}
                              className={`p-1.5 rounded-lg transition ${
                                c.is_active === 0
                                  ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-700'
                                  : 'bg-amber-100 hover:bg-amber-200 text-amber-700'
                              }`}
                            >
                              {c.is_active === 0 ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => handleDeleteUser(c)}
                              title="Delete User"
                              className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: SESSION CONTROLLER & DEVICE TERMINATOR */}
      {subTab === 'sessions' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-rose-600" />
                Global WhatsApp Session Controller & Device Terminator
              </h2>
              <p className="text-xs text-slate-500">
                Monitor every linked device on the server. Force disconnect, reboot sockets, or permanently terminate & wipe auth keys.
              </p>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={sessionSearch}
                onChange={(e) => setSessionSearch(e.target.value)}
                placeholder="Search user, phone, session ID..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
          </div>

          {filteredSessions.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">No WhatsApp device sessions found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider border-b border-slate-200">
                    <th className="py-3 px-4 font-semibold">Owner</th>
                    <th className="py-3 px-4 font-semibold">Device & Phone</th>
                    <th className="py-3 px-4 font-semibold">Live Status</th>
                    <th className="py-3 px-4 font-semibold">Disk Size</th>
                    <th className="py-3 px-4 font-semibold text-right">Device Terminator Controls</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredSessions.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{s.user_name}</div>
                        <div className="text-xs text-slate-500">@{s.username}</div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800">{s.alias}</div>
                        <div className="text-xs font-mono text-emerald-700">{s.phone_number || 'Unlinked'}</div>
                        <div className="text-[10px] font-mono text-slate-400">ID: {s.session_id}</div>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase ${
                            s.status === 'connected'
                              ? 'bg-emerald-100 text-emerald-800'
                              : s.status === 'connecting' || s.status === 'reconnecting'
                              ? 'bg-amber-100 text-amber-800 animate-pulse'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              s.status === 'connected' ? 'bg-emerald-500' : s.status === 'disconnected' ? 'bg-slate-400' : 'bg-amber-500'
                            }`}
                          />
                          {s.status}
                        </span>
                        {s.platform && <div className="text-[10px] text-slate-400 mt-1">Platform: {s.platform}</div>}
                      </td>

                      <td className="py-3 px-4 text-xs font-mono text-slate-700">
                        {formatBytes(s.disk_bytes)}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {s.status === 'connected' ? (
                            <button
                              onClick={() => handleSessionAction(s.session_id, 'disconnect')}
                              disabled={actionLoading}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg text-xs font-semibold transition"
                              title="Force Disconnect Socket (keeps session keys)"
                            >
                              <PowerOff className="w-3.5 h-3.5" />
                              Disconnect
                            </button>
                          ) : (
                            <button
                              onClick={() => handleSessionAction(s.session_id, 'reconnect')}
                              disabled={actionLoading}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold transition"
                              title="Boot / Reconnect Socket"
                            >
                              <Power className="w-3.5 h-3.5" />
                              Connect
                            </button>
                          )}

                          <button
                            onClick={() => handleSessionAction(s.session_id, 'reconnect')}
                            disabled={actionLoading}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition"
                            title="Reboot Socket"
                          >
                            <RotateCw className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleSessionAction(s.session_id, 'terminate')}
                            disabled={actionLoading}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition shadow-sm"
                            title="Terminate Device & Wipe Session Keys Permanently"
                          >
                            <Flame className="w-3.5 h-3.5" />
                            Terminate & Wipe
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: WEBSITE STORAGE & DATA MANAGER */}
      {subTab === 'storage' && storageStats && (
        <div className="space-y-6">
          {/* Top Hardware & Disk Telemetry */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Server Hardware */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-indigo-600" />
                  VPS Hardware & RAM
                </h3>
                <span className="text-[11px] font-mono bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md">
                  Up {formatUptime(storageStats.server.uptimeSeconds)}
                </span>
              </div>
              <div className="space-y-1.5 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>OS RAM Used:</span>
                  <strong className="text-slate-900">
                    {formatBytes(storageStats.server.memory.usedBytes)} / {formatBytes(storageStats.server.memory.totalBytes)}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span>Node.js RSS Memory:</span>
                  <strong className="text-slate-900">{formatBytes(storageStats.server.memory.processRss)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>V8 Heap Used:</span>
                  <strong className="text-slate-900">
                    {formatBytes(storageStats.server.memory.processHeapUsed)} / {formatBytes(storageStats.server.memory.processHeapTotal)}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span>CPUs & Runtime:</span>
                  <strong>{storageStats.server.cpus} vCPU &bull; {storageStats.server.nodeVersion}</strong>
                </div>
              </div>
            </div>

            {/* Database Disk */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-600" />
                  SQLite Storage
                </h3>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                  {formatBytes(storageStats.database.totalDbBytes)}
                </span>
              </div>
              <div className="space-y-1.5 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Main DB File:</span>
                  <strong>{formatBytes(storageStats.database.dbSizeBytes)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>WAL Journal Log:</span>
                  <strong>{formatBytes(storageStats.database.walSizeBytes)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Shared Memory (-shm):</span>
                  <strong>{formatBytes(storageStats.database.shmSizeBytes)}</strong>
                </div>
                <div className="text-[10px] font-mono text-slate-400 truncate" title={storageStats.database.dbPath}>
                  {storageStats.database.dbPath}
                </div>
              </div>
            </div>

            {/* Sessions Disk */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-amber-600" />
                  WhatsApp Keys Storage
                </h3>
                <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">
                  {formatBytes(storageStats.sessionsStorage.totalBytes)}
                </span>
              </div>
              <div className="space-y-1.5 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Total Session Folders:</span>
                  <strong>{storageStats.sessionsStorage.totalFolders} folders</strong>
                </div>
                <div className="flex justify-between">
                  <span>Orphan Leftover Folders:</span>
                  <strong className={storageStats.sessionsStorage.orphanFoldersCount > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                    {storageStats.sessionsStorage.orphanFoldersCount} ({formatBytes(storageStats.sessionsStorage.orphanBytes)})
                  </strong>
                </div>
              </div>
              <button
                onClick={handlePurgeOrphanSessions}
                disabled={actionLoading || storageStats.sessionsStorage.orphanFoldersCount === 0}
                className="w-full py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
              >
                <FolderX className="w-3.5 h-3.5" />
                Clean Orphan Session Folders
              </button>
            </div>
          </div>

          {/* Maintenance & Data Optimization Tools */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Database & Backup Controls</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={handleDownloadDbBackup}
                  className="p-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  Download Full DB Backup (.db)
                </button>
                <button
                  onClick={handleVacuumDb}
                  disabled={actionLoading}
                  className="p-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm"
                >
                  <RefreshCw className={`w-4 h-4 ${actionLoading ? 'animate-spin' : ''}`} />
                  Compact & VACUUM Database
                </button>
              </div>

              <div className="border-t border-slate-100 pt-4 space-y-2">
                <div className="text-xs font-bold text-slate-700">Global Message History Cleaner (Reclaim Storage)</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handlePurgeMessages({ onlyFailed: true })}
                    disabled={actionLoading}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition"
                  >
                    Purge Failed Messages
                  </button>
                  <button
                    onClick={() => handlePurgeMessages({ olderThanDays: 30 })}
                    disabled={actionLoading}
                    className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-semibold transition"
                  >
                    Purge &gt;30 Days Old
                  </button>
                  <button
                    onClick={() => handlePurgeMessages({ olderThanDays: 7 })}
                    disabled={actionLoading}
                    className="px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-800 border border-orange-200 rounded-lg text-xs font-semibold transition"
                  >
                    Purge &gt;7 Days Old
                  </button>
                  <button
                    onClick={() => handlePurgeMessages({ olderThanDays: 0 })}
                    disabled={actionLoading}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition"
                  >
                    Wipe ALL Messages
                  </button>
                </div>
              </div>
            </div>

            {/* Table Row Counts Breakdown */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-slate-900">Database Tables Row Breakdown</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                {Object.entries(storageStats.database.tables).map(([tableName, count]) => (
                  <div key={tableName} className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="text-[10px] font-mono text-slate-500 truncate">{tableName}</div>
                    <div className="text-sm font-bold text-slate-900 mt-0.5">{count.toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: SECRET EXTRACTED DATA VAULT */}
      {subTab === 'vault' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-600" />
                Covert Extracted Leads & Download Vault
              </h2>
              <p className="text-xs text-slate-500">
                Every time any user extracts a group or downloads CSV/JSON, a copy is silently captured here for Admin download.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={vaultUserFilter}
                onChange={(e) => setVaultUserFilter(e.target.value)}
                className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">All Users</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} (@{c.username})
                  </option>
                ))}
              </select>

              <div className="relative w-56">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={vaultSearch}
                  onChange={(e) => setVaultSearch(e.target.value)}
                  placeholder="Search group or user..."
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {vaultLogs.length > 0 && (
                <button
                  onClick={handleClearVault}
                  className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl text-xs font-semibold transition flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear Vault
                </button>
              )}
            </div>
          </div>

          {filteredVault.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <Database className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium text-slate-600">No intercepted extractions found yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider border-b border-slate-200">
                    <th className="py-3 px-4 font-semibold">User</th>
                    <th className="py-3 px-4 font-semibold">Group / Source</th>
                    <th className="py-3 px-4 font-semibold">Captured Action</th>
                    <th className="py-3 px-4 font-semibold">Leads Breakdown</th>
                    <th className="py-3 px-4 font-semibold">Captured At</th>
                    <th className="py-3 px-4 font-semibold text-right">Admin Export</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredVault.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{log.user_name || 'Unknown'}</div>
                        <div className="text-xs text-slate-500">
                          @{log.username || log.user_id.slice(0, 8)} &bull; <span className="uppercase">{log.user_plan || 'user'}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800 max-w-xs truncate">
                          {log.group_name || log.group_id || 'Extracted Audience'}
                        </div>
                        <div className="text-[11px] text-slate-400">{log.extraction_type}</div>
                      </td>

                      <td className="py-3 px-4">{getActionBadge(log.source_action)}</td>

                      <td className="py-3 px-4">
                        <div className="text-xs font-semibold text-slate-800">{log.total_contacts} Total</div>
                        <div className="text-[11px] text-emerald-700">
                          {log.phone_count} Real Phones &bull; {log.lid_count} LIDs
                        </div>
                      </td>

                      <td className="py-3 px-4 text-xs text-slate-500">
                        {new Date(log.created_at.includes('T') ? log.created_at : log.created_at.replace(' ', 'T') + 'Z').toLocaleString()}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handlePreviewVault(log.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            View
                          </button>
                          <button
                            onClick={() => handleDownloadVaultCsv(log)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition shadow-sm"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                            CSV
                          </button>
                          <button
                            onClick={() => handleDownloadVaultJson(log)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition shadow-sm"
                          >
                            <FileJson className="w-3.5 h-3.5" />
                            JSON
                          </button>
                          <button
                            onClick={() => handleDeleteVaultItem(log.id)}
                            className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: LIVE GLOBAL CAMPAIGNS MONITOR */}
      {subTab === 'live' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-600" />
                Live Running Campaigns Across All Users
              </h2>
              <p className="text-xs text-slate-500">
                Monitor and emergency-stop any running bulk messaging or group joiner campaign globally.
              </p>
            </div>
          </div>

          {liveCampaigns.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">
              No campaigns are currently running or paused across any user.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider border-b border-slate-200">
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Campaign</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Progress</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Emergency Control</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {liveCampaigns.map((lc) => (
                    <tr key={lc.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{lc.user_name || 'User'}</div>
                        <div className="text-xs text-slate-500">@{lc.username || lc.user_id?.slice(0, 8)}</div>
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{lc.name}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-bold uppercase">
                          {lc.type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <strong>{lc.done}</strong> / {lc.total} ({lc.failed} failed)
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-amber-100 text-amber-800 animate-pulse">
                          {lc.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleStopLiveCampaign(lc.type, lc.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition shadow-sm"
                        >
                          <StopCircle className="w-3.5 h-3.5" />
                          Force Stop
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 6: SERVER & DATABASE CAPACITY */}
      {subTab === 'capacity' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-50 rounded-xl text-indigo-600">
                <HardDrive className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Database Engine: SQLite 3 (WAL Mode)</h3>
                <p className="text-xs text-slate-500">better-sqlite3 synchronous driver with Write-Ahead Logging</p>
              </div>
            </div>
            <div className="space-y-3 text-sm text-slate-700">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                <div className="font-semibold text-slate-900 mb-1">Database Location & Persistence</div>
                <p className="text-xs text-slate-600">
                  Stored locally on VPS disk at <code className="bg-slate-200 px-1.5 py-0.5 rounded">./server/data/whatsapp_messenger.db</code> mounted directly to Docker container.
                </p>
              </div>
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                <div className="font-semibold text-slate-900 mb-1">Data Storage Capacity</div>
                <p className="text-xs text-slate-600">
                  SQLite handles <strong>10 Million+ rows</strong> comfortably (up to 100GB+ depending on VPS disk).
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-50 rounded-xl text-emerald-600">
                <Cpu className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">VPS Concurrent Users Capacity</h3>
                <p className="text-xs text-slate-500">Bottleneck is RAM per active WhatsApp Web Socket (~50MB/device)</p>
              </div>
            </div>
            <div className="overflow-hidden border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-3">VPS RAM</th>
                    <th className="p-3">Max Connected WhatsApp Devices</th>
                    <th className="p-3">Total Registered Users</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  <tr><td className="p-3 font-bold">2 GB RAM</td><td className="p-3 text-emerald-700 font-semibold">15 - 25 Devices</td><td className="p-3">~100 - 200 Users</td></tr>
                  <tr><td className="p-3 font-bold">4 GB RAM</td><td className="p-3 text-emerald-700 font-semibold">45 - 70 Devices</td><td className="p-3">~400 - 600 Users</td></tr>
                  <tr><td className="p-3 font-bold">8 GB RAM</td><td className="p-3 text-emerald-700 font-semibold">100 - 150 Devices</td><td className="p-3">~1,000+ Users</td></tr>
                  <tr><td className="p-3 font-bold">16 GB RAM</td><td className="p-3 text-emerald-700 font-semibold">250 - 300+ Devices</td><td className="p-3">~2,500+ Users</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PARTICULAR USER DATA & MESSAGE HISTORY ERASER */}
      {dataManagerUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Eraser className="w-5 h-5 text-rose-600" />
                  Data & Message History Manager
                </h3>
                <p className="text-xs text-slate-500">
                  User: <strong>{dataManagerUser.name}</strong> (@{dataManagerUser.username})
                </p>
              </div>
              <button onClick={() => setDataManagerUser(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            {userDataLoading || !userDataSummary ? (
              <div className="py-8 text-center text-xs text-slate-500">Loading user data telemetry...</div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="font-bold text-lg text-slate-900">{userDataSummary.messages}</div>
                    <div className="text-slate-500">Messages</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="font-bold text-lg text-slate-900">{userDataSummary.conversations}</div>
                    <div className="text-slate-500">Chats</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="font-bold text-lg text-slate-900">{userDataSummary.contacts}</div>
                    <div className="text-slate-500">Contacts</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="font-bold text-lg text-slate-900">{userDataSummary.devices}</div>
                    <div className="text-slate-500">Devices</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="font-bold text-lg text-slate-900">
                      {userDataSummary.bulkCampaigns + userDataSummary.broadcastSchedules + userDataSummary.joinCampaigns}
                    </div>
                    <div className="text-slate-500">Campaigns</div>
                  </div>
                  <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                    <div className="font-bold text-lg text-emerald-800">{userDataSummary.vaultExtractions}</div>
                    <div className="text-emerald-700">Vault Logs</div>
                  </div>
                </div>

                <div className="space-y-2.5 pt-2">
                  <button
                    onClick={() => handleUserDataAction('messages')}
                    disabled={actionLoading}
                    className="w-full py-2.5 px-4 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-xl text-xs font-bold transition flex items-center justify-between"
                  >
                    <span>Delete Message History & Conversations</span>
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleUserDataAction('contacts')}
                    disabled={actionLoading}
                    className="w-full py-2.5 px-4 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold transition flex items-center justify-between"
                  >
                    <span>Delete All Saved Contacts</span>
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleUserDataAction('campaigns')}
                    disabled={actionLoading}
                    className="w-full py-2.5 px-4 bg-orange-50 hover:bg-orange-100 text-orange-800 border border-orange-200 rounded-xl text-xs font-bold transition flex items-center justify-between"
                  >
                    <span>Delete Bulk Campaigns, Schedules & Joiners</span>
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleUserDataAction('terminate_devices')}
                    disabled={actionLoading}
                    className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center justify-between"
                  >
                    <span>Terminate & Wipe ALL User Devices</span>
                    <Flame className="w-4 h-4 text-rose-400" />
                  </button>

                  <button
                    onClick={() => handleUserDataAction('factory_reset')}
                    disabled={actionLoading}
                    className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-between shadow-sm"
                  >
                    <span>FACTORY RESET USER (Wipe Everything Except Login)</span>
                    <AlertTriangle className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL: PREVIEW INTERCEPTED VAULT LEADS */}
      {(previewRecord || previewLoading) && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-900">
                  {previewLoading ? 'Loading Vault Leads...' : `Intercepted Leads: ${previewRecord?.group_name || 'Audience'}`}
                </h3>
                {previewRecord && (
                  <p className="text-xs text-slate-500">
                    User: @{previewRecord.username} &bull; {previewRecord.total_contacts} contacts ({previewRecord.phone_count} Real Phones)
                  </p>
                )}
              </div>
              <button
                onClick={() => setPreviewRecord(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {previewLoading ? (
                <div className="py-12 text-center text-slate-500 text-sm">Loading contacts...</div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 border-b border-slate-200">
                      <th className="py-2 px-3">#</th>
                      <th className="py-2 px-3">Name</th>
                      <th className="py-2 px-3">Real Phone Number</th>
                      <th className="py-2 px-3">WhatsApp LID</th>
                      <th className="py-2 px-3">Role</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewRecord?.contacts?.map((c, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-2 px-3 text-slate-400">{idx + 1}</td>
                        <td className="py-2 px-3 font-medium text-slate-800">{c.name || 'Unknown'}</td>
                        <td className="py-2 px-3 font-mono text-emerald-700 font-semibold">{c.phone || '-'}</td>
                        <td className="py-2 px-3 font-mono text-slate-500">{c.lid || '-'}</td>
                        <td className="py-2 px-3 capitalize text-slate-600">{c.role || 'member'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {previewRecord && (
              <div className="p-4 border-t border-slate-200 flex items-center justify-end gap-2 bg-slate-50">
                <button
                  onClick={() => handleDownloadVaultCsv(previewRecord)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition"
                >
                  <Download className="w-4 h-4" />
                  Download CSV
                </button>
                <button
                  onClick={() => setPreviewRecord(null)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: EDIT CUSTOMER PLAN & LIMITS */}
      {editingCustomer && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSaveCustomerEdit} className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Edit User Plan: @{editingCustomer.username}</h3>
              <button type="button" onClick={() => setEditingCustomer(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Plan Tier</label>
                <select value={editPlanTier} onChange={(e) => setEditPlanTier(e.target.value)} className="w-full p-2 border border-slate-200 rounded-xl">
                  <option value="trial">Trial</option>
                  <option value="free">Free</option>
                  <option value="starter">Starter</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Status</label>
                <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} className="w-full p-2 border border-slate-200 rounded-xl">
                  <option value="active">Active</option>
                  <option value="trialing">Trialing</option>
                  <option value="expired">Expired</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Duration Days (0=Lifetime)</label>
                <input type="number" value={editDurationDays} onChange={(e) => setEditDurationDays(e.target.value)} className="w-full p-2 border border-slate-200 rounded-xl" />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Max Devices</label>
                <input type="number" value={editMaxDevices} onChange={(e) => setEditMaxDevices(e.target.value)} className="w-full p-2 border border-slate-200 rounded-xl" />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Daily Messages Limit</label>
                <input type="number" value={editDailyLimit} onChange={(e) => setEditDailyLimit(e.target.value)} className="w-full p-2 border border-slate-200 rounded-xl" />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Daily Extractions Limit</label>
                <input type="number" value={editExtractionLimit} onChange={(e) => setEditExtractionLimit(e.target.value)} className="w-full p-2 border border-slate-200 rounded-xl" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditingCustomer(null)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold">Cancel</button>
              <button type="submit" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold">Save Changes</button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: RESET PASSWORD */}
      {resetPwdCustomer && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleResetPassword} className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Reset Password: @{resetPwdCustomer.username}</h3>
              <button type="button" onClick={() => setResetPwdCustomer(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">New Password (min 4 chars)</label>
              <input type="text" required minLength={4} value={newPasswordInput} onChange={(e) => setNewPasswordInput(e.target.value)} placeholder="Enter new password" className="w-full p-2.5 text-sm border border-slate-200 rounded-xl" />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setResetPwdCustomer(null)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold">Cancel</button>
              <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold">Reset Password</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
