import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import {
  Database,
  Search,
  Filter,
  Trash2,
  RefreshCw,
  Download,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Eye,
  EyeOff,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  FileSpreadsheet,
  FileJson,
  Layers,
  User,
  Calendar,
  Lock,
  Unlock,
  Archive,
  BarChart3,
  Server,
  ArrowRight,
  ExternalLink,
  Tag,
  Check,
  X,
  ChevronRight,
  ChevronDown
} from 'lucide-react';

interface VaultRecord {
  id: string;
  module: string;
  source_type: string;
  user_id: string;
  user_email?: string;
  user_name?: string;
  product_id?: string;
  product_slug?: string;
  product_name?: string;
  job_id: string;
  status: 'completed' | 'failed' | 'partial' | 'aborted' | 'running';
  input_json: string;
  masked_input?: Record<string, any>;
  has_masked_secrets?: boolean;
  row_count: number;
  size_bytes: number;
  storage_uri?: string;
  checksum?: string;
  provider_run_id?: string;
  provider_dataset_id?: string;
  provider_cost_usd: number;
  charged_amount: number;
  currency: string;
  hidden_from_customer: number;
  legal_hold: number;
  legal_hold_reason?: string;
  legal_hold_by?: string;
  tags: string[];
  notes?: string;
  created_at: string;
  deleted_at?: string;
  purge_at?: string;
  files?: Array<{
    id: string;
    kind: string;
    file_name: string;
    storage_path: string;
    byte_size: number;
    content_type: string;
  }>;
}

interface RetentionPolicy {
  id: string;
  name: string;
  scope: 'global' | 'module' | 'product' | 'user_tier';
  target_id?: string;
  retention_days: number;
  trash_grace_days: number;
  auto_purge_enabled: number;
  enabled: number;
}

interface DeletionReceipt {
  id: string;
  request_id: string;
  admin_user_id: string;
  reason: string;
  scope: string;
  target_user_id?: string;
  jobs_deleted_count: number;
  rows_deleted_count: number;
  files_deleted_count: number;
  bytes_reclaimed: number;
  steps_completed_json: string;
  provider_purge_status: string;
  provider_purge_errors?: string;
  created_at: string;
}

interface AccessLog {
  id: string;
  admin_user_id: string;
  admin_username: string;
  record_id?: string;
  action: string;
  reason?: string;
  ip_address?: string;
  details_json?: string;
  created_at: string;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export const DataVaultTab: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'explorer' | 'trash' | 'policies' | 'receipts' | 'audit' | 'erasure'>('overview');

  // Overview stats
  const [stats, setStats] = useState<any | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Explorer & Records
  const [records, setRecords] = useState<VaultRecord[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalSizeBytes, setTotalSizeBytes] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [legalHoldFilter, setLegalHoldFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Selected Record Drawer State
  const [selectedRecord, setSelectedRecord] = useState<VaultRecord | null>(null);
  const [drawerTab, setDrawerTab] = useState<'overview' | 'input' | 'results' | 'files' | 'finance' | 'provider' | 'notes'>('overview');
  const [recordResults, setRecordResults] = useState<any[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [recordAccessLogs, setRecordAccessLogs] = useState<AccessLog[]>([]);

  // Secret Reveal Modal State
  const [revealModalKey, setRevealModalKey] = useState<string | null>(null);
  const [revealReason, setRevealReason] = useState('');
  const [revealedValue, setRevealedValue] = useState<string | null>(null);
  const [revealingSecret, setRevealingSecret] = useState(false);

  // Deletion Modals State
  const [showHardPurgeModal, setShowHardPurgeModal] = useState(false);
  const [purgeConfirmationText, setPurgeConfirmationText] = useState('');
  const [purgeReason, setPurgeReason] = useState('');
  const [purging, setPurging] = useState(false);

  // Legal Hold Modal State
  const [showLegalHoldModal, setShowLegalHoldModal] = useState(false);
  const [targetLegalHoldRecord, setTargetLegalHoldRecord] = useState<VaultRecord | null>(null);
  const [legalHoldReason, setLegalHoldReason] = useState('');
  const [updatingHold, setUpdatingHold] = useState(false);

  // Retention Policies State
  const [policies, setPolicies] = useState<RetentionPolicy[]>([]);
  const [loadingPolicies, setLoadingPolicies] = useState(false);
  const [previewData, setPreviewData] = useState<any | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Deletion Receipts State
  const [receipts, setReceipts] = useState<DeletionReceipt[]>([]);
  const [loadingReceipts, setLoadingReceipts] = useState(false);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AccessLog[]>([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);

  // Erasure & Privacy Settings State
  const [erasureUserId, setErasureUserId] = useState('');
  const [erasureReason, setErasureReason] = useState('');
  const [erasureConfirmText, setErasureConfirmText] = useState('');
  const [erasingUser, setErasingUser] = useState(false);
  const [vaultSettings, setVaultSettings] = useState<Record<string, string>>({});
  const [savingSettings, setSavingSettings] = useState(false);

  // Note edit state
  const [editingNotes, setEditingNotes] = useState('');
  const [editingTags, setEditingTags] = useState('');
  const [savingMetadata, setSavingMetadata] = useState(false);

  // Action status message
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setActionMessage({ type, text });
    setTimeout(() => setActionMessage(null), 4000);
  };

  // Fetch Overview Stats
  const fetchStats = async () => {
    setLoadingStats(true);
    try {
      const res = (await api.get<any>('/api/marketplace/admin/vault/stats')).data;
      setStats(res);
    } catch (err: any) {
      console.error('Failed to load stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  // Fetch Records
  const fetchRecords = async (inTrashMode: boolean = false) => {
    setLoadingRecords(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '25');
      if (inTrashMode) {
        params.set('inTrash', 'true');
      }
      if (searchQuery) params.set('search', searchQuery);
      if (moduleFilter !== 'all') params.set('module', moduleFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (legalHoldFilter === 'yes') params.set('legalHold', 'true');
      if (legalHoldFilter === 'no') params.set('legalHold', 'false');

      const res = (await api.get<any>(`/api/marketplace/admin/vault/records?${params.toString()}`)).data;
      setRecords(res.records || []);
      setTotalRecords(res.total || 0);
      setTotalSizeBytes(res.totalSizeBytes || 0);
      setSelectedIds([]);
    } catch (err: any) {
      console.error('Failed to load records:', err);
    } finally {
      setLoadingRecords(false);
    }
  };

  // Fetch Record Details & Results
  const openRecordDrawer = async (rec: VaultRecord) => {
    setSelectedRecord(rec);
    setDrawerTab('overview');
    setEditingNotes(rec.notes || '');
    setEditingTags((rec.tags || []).join(', '));
    setRecordResults([]);
    setRevealedValue(null);

    // Fetch full detail & access logs
    try {
      const res = (await api.get<any>(`/api/marketplace/admin/vault/records/${rec.id}?reason=Inspecting+record+drawer`)).data;
      if (res.record) setSelectedRecord(res.record);
      if (res.accessLogs) setRecordAccessLogs(res.accessLogs);
    } catch {}

    // Load results preview
    if (rec.module === 'marketplace' && rec.job_id) {
      setLoadingResults(true);
      try {
        const res = (await api.get<any>(`/api/marketplace/jobs/${rec.job_id}/results?limit=50`)).data;
        setRecordResults(res.items || []);
      } catch (err) {
        console.warn('Could not fetch results preview:', err);
      } finally {
        setLoadingResults(false);
      }
    }
  };

  // Fetch Policies
  const fetchPolicies = async () => {
    setLoadingPolicies(true);
    try {
      const res = (await api.get<any>('/api/marketplace/admin/vault/retention/policies')).data;
      setPolicies(res || []);
    } catch (err) {
      console.error('Failed to load policies:', err);
    } finally {
      setLoadingPolicies(false);
    }
  };

  // Fetch Deletion Receipts
  const fetchReceipts = async () => {
    setLoadingReceipts(true);
    try {
      const res = (await api.get<any>('/api/marketplace/admin/vault/receipts?limit=50')).data;
      setReceipts(res || []);
    } catch (err) {
      console.error('Failed to load receipts:', err);
    } finally {
      setLoadingReceipts(false);
    }
  };

  // Fetch Audit Logs
  const fetchAuditLogs = async () => {
    setLoadingAuditLogs(true);
    try {
      const res = (await api.get<any>('/api/marketplace/admin/vault/audit-logs?limit=100')).data;
      setAuditLogs(res.logs || []);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoadingAuditLogs(false);
    }
  };

  // Fetch Settings
  const fetchSettings = async () => {
    try {
      const res = (await api.get<any>('/api/marketplace/admin/vault/settings')).data;
      setVaultSettings(res || {});
    } catch {}
  };

  useEffect(() => {
    if (activeSubTab === 'overview') fetchStats();
    if (activeSubTab === 'explorer') fetchRecords(false);
    if (activeSubTab === 'trash') fetchRecords(true);
    if (activeSubTab === 'policies') fetchPolicies();
    if (activeSubTab === 'receipts') fetchReceipts();
    if (activeSubTab === 'audit') fetchAuditLogs();
    if (activeSubTab === 'erasure') fetchSettings();
  }, [activeSubTab, page, moduleFilter, statusFilter, legalHoldFilter]);

  // Handle Soft Delete (Move to Trash)
  const handleSoftDelete = async (ids: string[]) => {
    if (ids.length === 0) return;
    if (!confirm(`Are you sure you want to move ${ids.length} item(s) to Trash? Items can be restored before auto-purge.`)) return;

    try {
      const res = (await api.post<any>('/api/marketplace/admin/vault/records/trash', {
        recordIds: ids,
        reason: 'Admin bulk moved to trash'
      })).data;
      if (res.blockedCount > 0) {
        showToast(`Moved ${res.affectedCount} items to Trash. ${res.blockedCount} blocked by Legal Hold.`, 'error');
      } else {
        showToast(`Moved ${res.affectedCount} items to Trash.`);
      }
      fetchRecords(activeSubTab === 'trash');
      if (selectedRecord && ids.includes(selectedRecord.id)) setSelectedRecord(null);
    } catch (err: any) {
      showToast(err.message || 'Failed to move to trash', 'error');
    }
  };

  // Handle Restore From Trash
  const handleRestore = async (ids: string[]) => {
    if (ids.length === 0) return;
    try {
      const res = (await api.post<any>('/api/marketplace/admin/vault/records/restore', { recordIds: ids })).data;
      showToast(`Restored ${res.restoredCount} item(s) from Trash.`);
      fetchRecords(true);
      if (selectedRecord && ids.includes(selectedRecord.id)) setSelectedRecord(null);
    } catch (err: any) {
      showToast(err.message || 'Failed to restore', 'error');
    }
  };

  // Handle Hard Purge
  const handleHardPurgeSubmit = async () => {
    if (purgeConfirmationText !== 'DELETE') {
      alert('You must type "DELETE" exactly to confirm.');
      return;
    }
    if (!purgeReason.trim()) {
      alert('A valid audit reason is required.');
      return;
    }

    setPurging(true);
    try {
      const ids = selectedRecord ? [selectedRecord.id] : selectedIds;
      const res = (await api.post<any>('/api/marketplace/admin/vault/records/hard-purge', {
        recordIds: ids,
        reason: purgeReason,
        confirmationText: purgeConfirmationText
      })).data;

      showToast(`Irreversible Hard Purge completed! Reclaimed ${formatBytes(res.receipt.bytes_reclaimed)}.`);
      setShowHardPurgeModal(false);
      setPurgeConfirmationText('');
      setPurgeReason('');
      setSelectedRecord(null);
      setSelectedIds([]);
      fetchRecords(activeSubTab === 'trash');
    } catch (err: any) {
      alert(err.message || 'Hard purge failed');
    } finally {
      setPurging(false);
    }
  };

  // Handle Legal Hold Toggle
  const handleLegalHoldSubmit = async () => {
    if (!targetLegalHoldRecord) return;
    const newHold = targetLegalHoldRecord.legal_hold === 0;
    if (newHold && !legalHoldReason.trim()) {
      alert('A valid reason is required to place a record on Legal Hold.');
      return;
    }

    setUpdatingHold(true);
    try {
      const res = (await api.post<any>(`/api/marketplace/admin/vault/records/${targetLegalHoldRecord.id}/legal-hold`, {
        legalHold: newHold,
        reason: legalHoldReason || 'Released legal hold'
      })).data;
      showToast(`Legal Hold ${newHold ? 'applied' : 'released'}.`);
      setShowLegalHoldModal(false);
      setLegalHoldReason('');
      setTargetLegalHoldRecord(null);
      if (selectedRecord && selectedRecord.id === res.record.id) {
        setSelectedRecord(res.record);
      }
      fetchRecords(activeSubTab === 'trash');
    } catch (err: any) {
      alert(err.message || 'Failed to update Legal Hold');
    } finally {
      setUpdatingHold(false);
    }
  };

  // Handle Reveal Secret
  const handleRevealSecret = async () => {
    if (!selectedRecord || !revealModalKey) return;
    if (!revealReason.trim()) {
      alert('An audit reason is required to reveal credentials.');
      return;
    }

    setRevealingSecret(true);
    try {
      const res = (await api.post<any>(`/api/marketplace/admin/vault/records/${selectedRecord.id}/reveal-secret`, {
        fieldKey: revealModalKey,
        reason: revealReason
      })).data;
      setRevealedValue(res.cleartextValue);
      showToast('Credential revealed and recorded in access audit log.');
    } catch (err: any) {
      alert(err.message || 'Failed to reveal credential');
    } finally {
      setRevealingSecret(false);
    }
  };

  // Handle Save Metadata (notes & tags)
  const handleSaveMetadata = async () => {
    if (!selectedRecord) return;
    setSavingMetadata(true);
    try {
      const tagsArray = editingTags.split(',').map((t) => t.trim()).filter(Boolean);
      const res = (await api.post<any>(`/api/marketplace/admin/vault/records/${selectedRecord.id}/metadata`, {
        notes: editingNotes,
        tags: tagsArray
      })).data;
      setSelectedRecord(res.record);
      showToast('Metadata updated.');
    } catch (err: any) {
      showToast(err.message || 'Failed to update notes', 'error');
    } finally {
      setSavingMetadata(false);
    }
  };

  // Handle User Data Erasure (GDPR / Right to be Forgotten)
  const handleUserErasure = async () => {
    if (erasureConfirmText !== 'ERASE') {
      alert('You must type "ERASE" exactly to confirm.');
      return;
    }
    if (!erasureUserId.trim() || !erasureReason.trim()) {
      alert('Target User ID and audit reason are required.');
      return;
    }

    setErasingUser(true);
    try {
      const res = (await api.post<any>('/api/marketplace/admin/vault/erasure', {
        targetUserId: erasureUserId.trim(),
        reason: erasureReason.trim(),
        confirmationText: erasureConfirmText
      })).data;
      showToast(`User Data Erasure completed. Receipt #${res.receipt.id}`);
      setErasureUserId('');
      setErasureReason('');
      setErasureConfirmText('');
    } catch (err: any) {
      alert(err.message || 'User erasure failed');
    } finally {
      setErasingUser(false);
    }
  };

  // Trigger Backfill
  const handleBackfill = async () => {
    try {
      const res = (await api.post<any>('/api/marketplace/admin/vault/backfill', {})).data;
      showToast(`Backfill complete: ${res.backfilledMarketplace} marketplace jobs, ${res.backfilledLeadExtractor} lead extractor jobs added.`);
      fetchStats();
      if (activeSubTab === 'explorer') fetchRecords(false);
    } catch (err: any) {
      showToast(err.message || 'Backfill failed', 'error');
    }
  };

  // Trigger Retention Cycle
  const handleRunRetention = async () => {
    if (!confirm('Run automated retention cleaner now? Expired active jobs will be moved to trash, and expired trash will be hard purged.')) return;
    try {
      const res = (await api.post<any>('/api/marketplace/admin/vault/retention/run', {})).data;
      showToast(`Retention cycle completed: ${res.trashedCount} moved to trash, ${res.purgedCount} permanently purged.`);
      fetchStats();
    } catch (err: any) {
      showToast(err.message || 'Retention cleaner failed', 'error');
    }
  };

  // Save Settings
  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await api.post('/api/marketplace/admin/vault/settings', vaultSettings);
      showToast('Settings saved successfully.');
    } catch (err: any) {
      showToast(err.message || 'Failed to save settings', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {actionMessage && (
        <div className={`p-4 rounded-xl flex items-center justify-between text-sm font-medium ${
          actionMessage.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
        }`}>
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-sm border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Admin Data Vault</h2>
              <p className="text-xs text-slate-400">
                Centralized storage, search, multi-stage deletion, legal hold, and audit governance for all extraction results.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleBackfill}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition border border-slate-700"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Backfill Historical Jobs
          </button>
          <button
            onClick={handleRunRetention}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
          >
            <Clock className="w-3.5 h-3.5" />
            Run Retention Cleaner
          </button>
        </div>
      </div>

      {/* Sub Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3 overflow-x-auto">
        {[
          { key: 'overview', label: 'Overview', icon: BarChart3 },
          { key: 'explorer', label: 'Vault Explorer', icon: Database },
          { key: 'trash', label: 'Trash (Soft-Deleted)', icon: Trash2 },
          { key: 'policies', label: 'Retention Policies', icon: Clock },
          { key: 'receipts', label: 'Deletion Receipts', icon: FileCheckIcon },
          { key: 'audit', label: 'Access Audit Log', icon: Shield },
          { key: 'erasure', label: 'GDPR / Privacy Settings', icon: Lock }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => {
                setActiveSubTab(tab.key as any);
                setPage(1);
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition whitespace-nowrap ${
                isActive
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* SUB-VIEW 1: OVERVIEW & KPIS */}
      {/* ========================================================================= */}
      {activeSubTab === 'overview' && (
        <div className="space-y-6">
          {loadingStats ? (
            <div className="p-12 text-center text-slate-400">Loading vault storage statistics...</div>
          ) : stats ? (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-xs text-slate-500 font-medium">Total Vault Records</div>
                  <div className="text-2xl font-bold text-slate-900 mt-1">{stats.totalRecords.toLocaleString()}</div>
                  <div className="text-[11px] text-slate-400 mt-1">Active extraction runs</div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-xs text-slate-500 font-medium">Delivered Rows Stored</div>
                  <div className="text-2xl font-bold text-slate-900 mt-1">{stats.totalRows.toLocaleString()}</div>
                  <div className="text-[11px] text-slate-400 mt-1">Indexed in platform DB</div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-xs text-slate-500 font-medium">Total Storage Used</div>
                  <div className="text-2xl font-bold text-indigo-600 mt-1">{formatBytes(stats.totalSizeBytes)}</div>
                  <div className="text-[11px] text-slate-400 mt-1">Data + output files</div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-xs text-slate-500 font-medium">In Trash (Pending Purge)</div>
                  <div className="text-2xl font-bold text-amber-600 mt-1">{stats.inTrashCount.toLocaleString()}</div>
                  <div className="text-[11px] text-amber-700/80 mt-1">{formatBytes(stats.inTrashBytes)} reclaimable</div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-xs text-slate-500 font-medium">Under Legal Hold</div>
                  <div className="text-2xl font-bold text-purple-600 mt-1">{stats.legalHoldCount.toLocaleString()}</div>
                  <div className="text-[11px] text-purple-700/80 mt-1">Purge-protected</div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-xs text-slate-500 font-medium">Est. Monthly Storage Cost</div>
                  <div className="text-2xl font-bold text-emerald-600 mt-1">
                    ${(stats.totalSizeBytes / (1024 * 1024 * 1024) * 0.02).toFixed(2)}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">@ $0.02 / GB/mo</div>
                </div>
              </div>

              {/* Breakdowns */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Breakdown by Module */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-500" />
                    Storage by Module
                  </h3>
                  <div className="space-y-3">
                    {stats.breakdownByModule.map((m: any) => (
                      <div key={m.module} className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-700 capitalize">{m.module.replace('_', ' ')}</span>
                        <div className="text-right">
                          <span className="font-bold text-slate-900">{m.count} jobs</span>
                          <span className="text-slate-400 ml-2">({formatBytes(m.sizeBytes)})</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top Products */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                    <Database className="w-4 h-4 text-emerald-500" />
                    Top Products by Volume
                  </h3>
                  <div className="space-y-3">
                    {stats.topProducts.map((p: any) => (
                      <div key={p.product_slug} className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-700 truncate max-w-[160px]" title={p.product_name}>
                          {p.product_name || p.product_slug}
                        </span>
                        <div className="text-right">
                          <span className="font-bold text-slate-900">{p.count} runs</span>
                          <span className="text-slate-400 ml-2">({formatBytes(p.sizeBytes)})</span>
                        </div>
                      </div>
                    ))}
                    {stats.topProducts.length === 0 && (
                      <div className="text-xs text-slate-400 py-4 text-center">No product volume recorded yet.</div>
                    )}
                  </div>
                </div>

                {/* Top Users */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                    <User className="w-4 h-4 text-purple-500" />
                    Top Customers by Storage
                  </h3>
                  <div className="space-y-3">
                    {stats.topUsers.map((u: any) => (
                      <div key={u.user_id} className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-700 truncate max-w-[160px]" title={u.email}>
                          {u.email}
                        </span>
                        <div className="text-right">
                          <span className="font-bold text-slate-900">{formatBytes(u.sizeBytes)}</span>
                          <span className="text-slate-400 ml-2">({u.count} jobs)</span>
                        </div>
                      </div>
                    ))}
                    {stats.topUsers.length === 0 && (
                      <div className="text-xs text-slate-400 py-4 text-center">No customer storage recorded yet.</div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-VIEW 2 & 3: VAULT EXPLORER & TRASH */}
      {/* ========================================================================= */}
      {(activeSubTab === 'explorer' || activeSubTab === 'trash') && (
        <div className="space-y-4">
          {/* Filters & Bulk Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchRecords(activeSubTab === 'trash')}
                  placeholder="Search job ID, product, user email, notes..."
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <select
                value={moduleFilter}
                onChange={(e) => setModuleFilter(e.target.value)}
                className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="all">All Modules</option>
                <option value="marketplace">Marketplace Extractions</option>
                <option value="lead_extractor">Lead Extractor</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="all">All Statuses</option>
                <option value="completed">Completed</option>
                <option value="partial">Partial</option>
                <option value="failed">Failed</option>
                <option value="aborted">Aborted</option>
              </select>

              {activeSubTab === 'explorer' && (
                <select
                  value={legalHoldFilter}
                  onChange={(e) => setLegalHoldFilter(e.target.value)}
                  className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  <option value="all">All Holds</option>
                  <option value="yes">Under Legal Hold Only</option>
                  <option value="no">Normal Only</option>
                </select>
              )}

              <button
                onClick={() => fetchRecords(activeSubTab === 'trash')}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Filter
              </button>
            </div>

            {/* Bulk Actions */}
            {selectedIds.length > 0 && (
              <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                <span className="text-xs font-bold text-slate-700">{selectedIds.length} selected:</span>
                {activeSubTab === 'explorer' ? (
                  <button
                    onClick={() => handleSoftDelete(selectedIds)}
                    className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg text-xs font-semibold flex items-center gap-1 border border-amber-200 transition"
                  >
                    <Trash2 className="w-3 h-3" />
                    Move to Trash
                  </button>
                ) : (
                  <button
                    onClick={() => handleRestore(selectedIds)}
                    className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-semibold flex items-center gap-1 border border-emerald-200 transition"
                  >
                    <Check className="w-3 h-3" />
                    Restore
                  </button>
                )}
                <button
                  onClick={() => setShowHardPurgeModal(true)}
                  className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition shadow-sm"
                >
                  <ShieldAlert className="w-3 h-3" />
                  Hard Purge
                </button>
              </div>
            )}
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase font-semibold text-[10px] tracking-wider">
                  <tr>
                    <th className="p-3 w-8">
                      <input
                        type="checkbox"
                        checked={records.length > 0 && selectedIds.length === records.length}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds(records.map((r) => r.id));
                          else setSelectedIds([]);
                        }}
                        className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                      />
                    </th>
                    <th className="p-3">Job & Product</th>
                    <th className="p-3">Customer</th>
                    <th className="p-3">Module</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Rows & Size</th>
                    <th className="p-3">Charge & Margin</th>
                    <th className="p-3">Legal Hold</th>
                    {activeSubTab === 'trash' && <th className="p-3">Purge Countdown</th>}
                    <th className="p-3">Created</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingRecords ? (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-slate-400">Loading records...</td>
                    </tr>
                  ) : records.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-slate-400">No records found matching criteria.</td>
                    </tr>
                  ) : (
                    records.map((rec) => {
                      const isSelected = selectedIds.includes(rec.id);
                      return (
                        <tr
                          key={rec.id}
                          className={`hover:bg-slate-50 transition cursor-pointer ${isSelected ? 'bg-indigo-50/40' : ''}`}
                          onClick={(e) => {
                            // Don't trigger drawer if clicking checkbox
                            if ((e.target as HTMLElement).tagName === 'INPUT') return;
                            openRecordDrawer(rec);
                          }}
                        >
                          <td className="p-3" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) setSelectedIds([...selectedIds, rec.id]);
                                else setSelectedIds(selectedIds.filter((id) => id !== rec.id));
                              }}
                              className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                            />
                          </td>

                          <td className="p-3">
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              {rec.product_name || rec.product_slug || 'Custom Extraction'}
                              {rec.files && rec.files.length > 0 && (
                                <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] rounded font-semibold">
                                  {rec.files.length} files
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono">{rec.job_id}</div>
                          </td>

                          <td className="p-3">
                            <div className="font-semibold text-slate-800">{rec.user_email || 'Customer'}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{rec.user_id.slice(0, 12)}...</div>
                          </td>

                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 capitalize">
                              {rec.module.replace('_', ' ')}
                            </span>
                          </td>

                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              rec.status === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                              rec.status === 'partial' ? 'bg-amber-50 text-amber-700' :
                              'bg-red-50 text-red-700'
                            }`}>
                              {rec.status}
                            </span>
                          </td>

                          <td className="p-3">
                            <div className="font-bold text-slate-900">{rec.row_count.toLocaleString()} rows</div>
                            <div className="text-[11px] text-slate-400">{formatBytes(rec.size_bytes)}</div>
                          </td>

                          <td className="p-3">
                            <div className="font-semibold text-slate-900">{rec.currency} {rec.charged_amount.toFixed(2)}</div>
                            <div className="text-[10px] text-slate-400">
                              Vendor: ${rec.provider_cost_usd.toFixed(3)}
                            </div>
                          </td>

                          <td className="p-3" onClick={(e) => e.stopPropagation()}>
                            {rec.legal_hold === 1 ? (
                              <button
                                onClick={() => {
                                  setTargetLegalHoldRecord(rec);
                                  setShowLegalHoldModal(true);
                                }}
                                className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-[10px] font-bold flex items-center gap-1 border border-purple-200"
                              >
                                <Lock className="w-2.5 h-2.5" />
                                Active Hold
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setTargetLegalHoldRecord(rec);
                                  setShowLegalHoldModal(true);
                                }}
                                className="text-slate-400 hover:text-slate-600 text-[11px] flex items-center gap-1"
                              >
                                <Unlock className="w-2.5 h-2.5" />
                                Add Hold
                              </button>
                            )}
                          </td>

                          {activeSubTab === 'trash' && (
                            <td className="p-3">
                              <span className="font-semibold text-amber-700">
                                {rec.purge_at ? `${Math.max(0, Math.ceil((new Date(rec.purge_at).getTime() - Date.now()) / (1000 * 86400)))} days left` : 'Pending'}
                              </span>
                            </td>
                          )}

                          <td className="p-3 text-slate-500 whitespace-nowrap">
                            {new Date(rec.created_at).toLocaleDateString()}
                          </td>

                          <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5">
                              {activeSubTab === 'explorer' ? (
                                <button
                                  onClick={() => handleSoftDelete([rec.id])}
                                  title="Move to Trash"
                                  className="p-1.5 hover:bg-amber-50 text-slate-400 hover:text-amber-600 rounded-lg transition"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleRestore([rec.id])}
                                  title="Restore to Active"
                                  className="p-1.5 hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 rounded-lg transition"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                onClick={() => openRecordDrawer(rec)}
                                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition"
                              >
                                View
                                <ChevronRight className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <div>
                Showing {records.length} of {totalRecords} total records ({formatBytes(totalSizeBytes)})
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="px-3 py-1 bg-white border border-slate-200 rounded-lg disabled:opacity-50 text-slate-700 font-semibold"
                >
                  Previous
                </button>
                <span className="font-bold text-slate-900">{page}</span>
                <button
                  disabled={records.length < 25}
                  onClick={() => setPage(page + 1)}
                  className="px-3 py-1 bg-white border border-slate-200 rounded-lg disabled:opacity-50 text-slate-700 font-semibold"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-VIEW 4: RETENTION POLICIES */}
      {/* ========================================================================= */}
      {activeSubTab === 'policies' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Retention & Purge Policies</h3>
              <p className="text-xs text-slate-500">
                Configure lifecycle rules: active storage retention time before moving to trash, and trash grace duration before hard purge.
              </p>
            </div>
            <button
              onClick={async () => {
                const res = (await api.get<any>('/api/marketplace/admin/vault/retention/preview')).data;
                setPreviewData(res);
                setShowPreviewModal(true);
              }}
              className="px-3.5 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm"
            >
              <Eye className="w-3.5 h-3.5" />
              Preview Purge Impact
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {policies.map((p) => (
              <div key={p.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-slate-900 text-sm">{p.name}</div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${p.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {p.enabled ? 'Active' : 'Disabled'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="text-slate-500 block">Scope:</span>
                    <span className="font-semibold text-slate-900 capitalize">{p.scope}</span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="text-slate-500 block">Active Retention:</span>
                    <span className="font-semibold text-slate-900">{p.retention_days} days</span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="text-slate-500 block">Trash Grace Period:</span>
                    <span className="font-semibold text-slate-900">{p.trash_grace_days} days</span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="text-slate-500 block">Auto-Purge:</span>
                    <span className="font-semibold text-slate-900">{p.auto_purge_enabled ? 'Enabled' : 'Manual only'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-VIEW 5: DELETION RECEIPTS */}
      {activeSubTab === 'receipts' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900">Signed Deletion Receipts</h3>
            <p className="text-xs text-slate-500">
              Immutable cryptographically recorded deletion certificates showing who authorized destruction and bytes reclaimed.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase font-semibold text-[10px]">
                <tr>
                  <th className="p-3">Receipt ID</th>
                  <th className="p-3">Reason</th>
                  <th className="p-3">Scope</th>
                  <th className="p-3">Jobs / Rows Purged</th>
                  <th className="p-3">Bytes Reclaimed</th>
                  <th className="p-3">Provider Purge</th>
                  <th className="p-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {receipts.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono font-bold text-slate-900">{r.id}</td>
                    <td className="p-3 font-medium text-slate-700">{r.reason}</td>
                    <td className="p-3 text-slate-500">{r.scope}</td>
                    <td className="p-3 font-semibold text-slate-900">{r.jobs_deleted_count} jobs ({r.rows_deleted_count} rows)</td>
                    <td className="p-3 font-bold text-emerald-600">{formatBytes(r.bytes_reclaimed)}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                        {r.provider_purge_status}
                      </span>
                    </td>
                    <td className="p-3 text-slate-400">{new Date(r.created_at).toLocaleString()}</td>
                  </tr>
                ))}
                {receipts.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">No deletion receipts recorded yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-VIEW 6: ACCESS AUDIT LOG */}
      {activeSubTab === 'audit' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Vault Access & Operator Audit Log</h3>
              <p className="text-xs text-slate-500">
                Immutable chronological ledger of every record view, credential reveal, export, and deletion.
              </p>
            </div>
            <button
              onClick={fetchAuditLogs}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase font-semibold text-[10px]">
                <tr>
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">Admin User</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Record ID</th>
                  <th className="p-3">Reason</th>
                  <th className="p-3">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="p-3 text-slate-400 whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td>
                    <td className="p-3 font-bold text-slate-900">{log.admin_username}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        log.action.includes('purge') ? 'bg-red-50 text-red-700' :
                        log.action.includes('reveal') ? 'bg-purple-50 text-purple-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-[11px] text-slate-500">{log.record_id || 'Global'}</td>
                    <td className="p-3 text-slate-700 max-w-xs truncate" title={log.reason}>{log.reason || '—'}</td>
                    <td className="p-3 text-slate-400 font-mono text-[11px]">{log.ip_address || '127.0.0.1'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-VIEW 7: ERASURE & PRIVACY SETTINGS */}
      {activeSubTab === 'erasure' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* GDPR / DPDP User Data Erasure ("Right to be Forgotten") */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-red-600" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">GDPR / DPDP User Data Erasure</h3>
                <p className="text-xs text-slate-500">
                  Execute "Right to be Forgotten": purges all extraction inputs, datasets, and files for a customer while keeping financial ledger transactions intact.
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Target Customer User ID</label>
                <input
                  type="text"
                  value={erasureUserId}
                  onChange={(e) => setErasureUserId(e.target.value)}
                  placeholder="e.g. usr_12345 or UUID"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Compliance / Audit Reason</label>
                <textarea
                  value={erasureReason}
                  onChange={(e) => setErasureReason(e.target.value)}
                  placeholder="e.g. Formal GDPR erasure request received via support ticket #4812"
                  rows={2}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-xs text-red-800 space-y-2">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  Irreversible Erasure Confirmation
                </div>
                <p>Type <span className="font-mono font-bold">ERASE</span> below to confirm permanent destruction of user extraction data.</p>
                <input
                  type="text"
                  value={erasureConfirmText}
                  onChange={(e) => setErasureConfirmText(e.target.value)}
                  placeholder="Type ERASE"
                  className="w-full px-3 py-1.5 text-xs bg-white border border-red-300 rounded-lg text-red-900 font-mono"
                />
              </div>

              <button
                disabled={erasingUser || erasureConfirmText !== 'ERASE' || !erasureUserId.trim()}
                onClick={handleUserErasure}
                className="w-full py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-sm"
              >
                {erasingUser ? 'Executing Erasure...' : 'Execute Permanent User Erasure'}
              </button>
            </div>
          </div>

          {/* Privacy & Customer Deletion Configuration */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-indigo-600" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">Privacy & Deletion Settings</h3>
                <p className="text-xs text-slate-500">Configure customer delete policy and disclosure terms.</p>
              </div>
            </div>

            <div className="space-y-4 pt-2">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Customer Deletion Behavior
                </label>
                <select
                  value={vaultSettings.customer_delete_behavior || 'hide_only'}
                  onChange={(e) => setVaultSettings({ ...vaultSettings, customer_delete_behavior: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  <option value="hide_only">Hide only from Customer (Retain safely in Data Vault for Admin & Support)</option>
                  <option value="hard_everywhere">Hard Delete everywhere immediately upon customer request</option>
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  "Hide only" ensures you can resolve disputes, chargebacks, and provide support even if a user deletes a job in their view.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Default Retention (Days)</label>
                  <input
                    type="number"
                    value={vaultSettings.vault_default_retention_days || '90'}
                    onChange={(e) => setVaultSettings({ ...vaultSettings, vault_default_retention_days: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Trash Grace Period (Days)</label>
                  <input
                    type="number"
                    value={vaultSettings.vault_trash_grace_days || '30'}
                    onChange={(e) => setVaultSettings({ ...vaultSettings, vault_trash_grace_days: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Customer Privacy Policy Text</label>
                <textarea
                  value={vaultSettings.privacy_policy_text || ''}
                  onChange={(e) => setVaultSettings({ ...vaultSettings, privacy_policy_text: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl"
                />
              </div>

              <button
                disabled={savingSettings}
                onClick={handleSaveSettings}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-sm"
              >
                {savingSettings ? 'Saving Settings...' : 'Save Privacy & Vault Settings'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* RECORD DETAIL DRAWER */}
      {/* ========================================================================= */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col border-l border-slate-200">
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">
                    {selectedRecord.product_name || selectedRecord.product_slug}
                  </h3>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    selectedRecord.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {selectedRecord.status}
                  </span>
                  {selectedRecord.legal_hold === 1 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5" />
                      Legal Hold
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-400 font-mono mt-0.5">{selectedRecord.job_id}</div>
              </div>

              <button
                onClick={() => setSelectedRecord(null)}
                className="p-2 hover:bg-slate-200 text-slate-400 hover:text-slate-600 rounded-xl transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Sub-tabs */}
            <div className="flex items-center gap-1 px-5 border-b border-slate-200 bg-white overflow-x-auto">
              {[
                { key: 'overview', label: 'Context' },
                { key: 'input', label: 'Input & Credentials' },
                { key: 'results', label: `Results (${selectedRecord.row_count})` },
                { key: 'files', label: `Files (${selectedRecord.files?.length || 0})` },
                { key: 'finance', label: 'Financial Trace' },
                { key: 'provider', label: 'Provider Telemetry' },
                { key: 'notes', label: 'Notes & Tags' }
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setDrawerTab(tab.key as any)}
                  className={`px-3 py-2.5 text-xs font-semibold border-b-2 transition whitespace-nowrap ${
                    drawerTab === tab.key
                      ? 'border-slate-900 text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Context Tab */}
              {drawerTab === 'overview' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-slate-400 block">Customer Account</span>
                      <span className="font-bold text-slate-900 block mt-0.5">{selectedRecord.user_email || 'Customer'}</span>
                      <span className="text-[11px] text-slate-400 font-mono">{selectedRecord.user_id}</span>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-slate-400 block">Delivered Rows / Size</span>
                      <span className="font-bold text-slate-900 block mt-0.5">{selectedRecord.row_count} rows</span>
                      <span className="text-[11px] text-slate-500">{formatBytes(selectedRecord.size_bytes)}</span>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-slate-400 block">Checksum SHA-256</span>
                      <span className="font-mono text-[11px] text-slate-700 block truncate mt-0.5" title={selectedRecord.checksum}>
                        {selectedRecord.checksum || 'Computed on write'}
                      </span>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-slate-400 block">Storage URI</span>
                      <span className="font-mono text-[11px] text-slate-700 block truncate mt-0.5" title={selectedRecord.storage_uri}>
                        {selectedRecord.storage_uri || 'sqlite://marketplace_job_results'}
                      </span>
                    </div>
                  </div>

                  {/* Actions in drawer */}
                  <div className="pt-4 border-t border-slate-100 flex items-center gap-2">
                    <button
                      onClick={() => {
                        setTargetLegalHoldRecord(selectedRecord);
                        setShowLegalHoldModal(true);
                      }}
                      className="px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      {selectedRecord.legal_hold === 1 ? 'Release Legal Hold' : 'Place on Legal Hold'}
                    </button>

                    <button
                      onClick={() => handleSoftDelete([selectedRecord.id])}
                      className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Move to Trash
                    </button>

                    <button
                      onClick={() => setShowHardPurgeModal(true)}
                      className="px-3.5 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                      Hard Purge
                    </button>
                  </div>
                </div>
              )}

              {/* Input & Credentials Tab */}
              {drawerTab === 'input' && (
                <div className="space-y-4">
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
                    <Shield className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      Sensitive parameters (passwords, tokens, cookies, api keys) are masked by default. Revealing credentials generates an immutable entry in the Vault Access Log.
                    </div>
                  </div>

                  <div className="bg-slate-900 text-slate-100 p-4 rounded-xl text-xs font-mono space-y-2 overflow-x-auto">
                    {Object.entries(selectedRecord.masked_input || {}).map(([key, val]) => {
                      if (key.startsWith('_')) return null;
                      const isMasked = val === '••••••••';
                      return (
                        <div key={key} className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                          <span className="text-indigo-400 font-semibold">{key}:</span>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-200">
                              {revealModalKey === key && revealedValue ? revealedValue : String(val)}
                            </span>
                            {isMasked && (
                              <button
                                onClick={() => {
                                  setRevealModalKey(key);
                                  setRevealReason('');
                                  setRevealedValue(null);
                                }}
                                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded text-[10px] font-bold transition flex items-center gap-1"
                              >
                                <Eye className="w-2.5 h-2.5" />
                                Reveal
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Results Preview Tab */}
              {drawerTab === 'results' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">Previewing first 50 rows:</span>
                    <a
                      href={`/api/marketplace/jobs/${selectedRecord.job_id}/export?format=csv`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition"
                    >
                      <Download className="w-3 h-3" />
                      Export CSV
                    </a>
                  </div>

                  {loadingResults ? (
                    <div className="p-8 text-center text-slate-400 text-xs">Loading dataset rows...</div>
                  ) : recordResults.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 text-xs">No result rows available.</div>
                  ) : (
                    <div className="border border-slate-200 rounded-xl overflow-x-auto max-h-96">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                          <tr>
                            {Object.keys(recordResults[0] || {}).slice(0, 6).map((k) => (
                              <th key={k} className="p-2 whitespace-nowrap">{k}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {recordResults.map((r, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              {Object.values(r).slice(0, 6).map((val: any, j) => (
                                <td key={j} className="p-2 max-w-[140px] truncate font-mono text-slate-700">
                                  {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Files Tab */}
              {drawerTab === 'files' && (
                <div className="space-y-3">
                  {selectedRecord.files && selectedRecord.files.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {selectedRecord.files.map((f) => (
                        <div key={f.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                          <div className="truncate mr-2">
                            <span className="text-xs font-bold text-slate-900 block truncate">{f.file_name}</span>
                            <span className="text-[10px] text-slate-400">{formatBytes(f.byte_size)} • {f.content_type}</span>
                          </div>
                          <a
                            href={`/api/marketplace/files/${f.id}/download`}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-slate-600 transition"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-slate-400 text-xs">No binary output files for this extraction.</div>
                  )}
                </div>
              )}

              {/* Financial Trace Tab */}
              {drawerTab === 'finance' && (
                <div className="space-y-3 text-xs">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Amount Charged to Customer:</span>
                      <span className="font-bold text-slate-900">{selectedRecord.currency} {selectedRecord.charged_amount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Upstream Provider Cost (USD):</span>
                      <span className="font-bold text-slate-700">${selectedRecord.provider_cost_usd.toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-200 pt-2">
                      <span className="text-slate-500">Estimated Realized Margin:</span>
                      <span className="font-bold text-emerald-600">
                        {selectedRecord.charged_amount > 0 ? `${Math.max(25, Math.round(((selectedRecord.charged_amount - selectedRecord.provider_cost_usd * 85) / selectedRecord.charged_amount) * 100))}%` : '0%'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Provider Metadata Tab (ADMIN ONLY) */}
              {drawerTab === 'provider' && (
                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-900 flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <strong>Strict White-Label Purity:</strong> Upstream provider IDs and vendor endpoints are visible ONLY in this Administrator Data Vault. Customers never see provider names or references.
                    </div>
                  </div>

                  <div className="bg-slate-900 text-slate-100 p-4 rounded-xl font-mono space-y-2">
                    <div className="flex justify-between border-b border-slate-800 pb-1.5">
                      <span className="text-indigo-400">Provider Source Type:</span>
                      <span>{selectedRecord.source_type}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-800 pb-1.5">
                      <span className="text-indigo-400">Provider Run ID:</span>
                      <span>{selectedRecord.provider_run_id || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-800 pb-1.5">
                      <span className="text-indigo-400">Provider Dataset ID:</span>
                      <span>{selectedRecord.provider_dataset_id || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-indigo-400">Execution Timings:</span>
                      <span>Created {new Date(selectedRecord.created_at).toLocaleTimeString()}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Notes & Tags Tab */}
              {drawerTab === 'notes' && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Admin Tags (comma-separated)</label>
                    <input
                      type="text"
                      value={editingTags}
                      onChange={(e) => setEditingTags(e.target.value)}
                      placeholder="e.g. disputed, high_value, reviewed"
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Admin Notes</label>
                    <textarea
                      value={editingNotes}
                      onChange={(e) => setEditingNotes(e.target.value)}
                      placeholder="Add compliance notes, customer support notes, or investigation context..."
                      rows={4}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>

                  <button
                    disabled={savingMetadata}
                    onClick={handleSaveMetadata}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition"
                  >
                    {savingMetadata ? 'Saving...' : 'Save Notes & Tags'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: SECRET REVEAL */}
      {revealModalKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-amber-600">
              <ShieldAlert className="w-5 h-5" />
              <h3 className="font-bold text-slate-900">Reveal Encrypted Credential</h3>
            </div>
            <p className="text-xs text-slate-500">
              You are requesting to reveal the credential for field <span className="font-mono font-bold text-slate-900">{revealModalKey}</span>. Please provide an audit reason. This access is permanently logged.
            </p>

            <textarea
              value={revealReason}
              onChange={(e) => setRevealReason(e.target.value)}
              placeholder="e.g. Customer support verification for ticket #9021"
              rows={3}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
            />

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setRevealModalKey(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                disabled={revealingSecret || !revealReason.trim()}
                onClick={handleRevealSecret}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-sm"
              >
                {revealingSecret ? 'Decrypting...' : 'Confirm & Reveal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: HARD PURGE */}
      {showHardPurgeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-red-600">
              <ShieldAlert className="w-5 h-5" />
              <h3 className="font-bold text-slate-900">Irreversible Hard Purge</h3>
            </div>
            <p className="text-xs text-slate-600">
              Hard Purge permanently deletes datasets, rows, files, and upstream provider runs. An immutable deletion receipt will be generated.
            </p>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Audit Reason</label>
              <input
                type="text"
                value={purgeReason}
                onChange={(e) => setPurgeReason(e.target.value)}
                placeholder="e.g. Scheduled GDPR data destruction"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-xs text-red-800 space-y-1.5">
              <p>Type <span className="font-mono font-bold">DELETE</span> to confirm permanent destruction:</p>
              <input
                type="text"
                value={purgeConfirmationText}
                onChange={(e) => setPurgeConfirmationText(e.target.value)}
                placeholder="Type DELETE"
                className="w-full px-3 py-1.5 text-xs bg-white border border-red-300 rounded-lg text-red-900 font-mono"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowHardPurgeModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                disabled={purging || purgeConfirmationText !== 'DELETE' || !purgeReason.trim()}
                onClick={handleHardPurgeSubmit}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-sm"
              >
                {purging ? 'Purging...' : 'Execute Hard Purge'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: LEGAL HOLD */}
      {showLegalHoldModal && targetLegalHoldRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-purple-600">
              <Lock className="w-5 h-5" />
              <h3 className="font-bold text-slate-900">
                {targetLegalHoldRecord.legal_hold === 1 ? 'Release Legal Hold' : 'Place on Legal Hold'}
              </h3>
            </div>
            <p className="text-xs text-slate-500">
              Records under Legal Hold are blocked from both automated retention cleaner purges and manual admin deletions.
            </p>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Written Justification Reason</label>
              <textarea
                value={legalHoldReason}
                onChange={(e) => setLegalHoldReason(e.target.value)}
                placeholder="e.g. Investigation regarding suspicious payment, or regulatory audit hold"
                rows={3}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setShowLegalHoldModal(false);
                  setTargetLegalHoldRecord(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                disabled={updatingHold || (targetLegalHoldRecord.legal_hold === 0 && !legalHoldReason.trim())}
                onClick={handleLegalHoldSubmit}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-sm"
              >
                {updatingHold ? 'Updating...' : targetLegalHoldRecord.legal_hold === 1 ? 'Release Hold' : 'Apply Legal Hold'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: PREVIEW RETENTION PURGE */}
      {showPreviewModal && previewData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="font-bold text-slate-900 text-sm">Retention Purge Dry-Run Impact</h3>
            <div className="space-y-2 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex justify-between">
                <span className="text-slate-600">Active records eligible for Trash:</span>
                <span className="font-bold text-slate-900">{previewData.eligibleForTrashCount}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex justify-between">
                <span className="text-slate-600">Trash records eligible for Hard Purge:</span>
                <span className="font-bold text-red-600">{previewData.eligibleForPurgeCount}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex justify-between">
                <span className="text-slate-600">Estimated Bytes to Reclaim:</span>
                <span className="font-bold text-emerald-600">{formatBytes(previewData.estimatedBytesToReclaim)}</span>
              </div>
              <div className="p-3 bg-purple-50 rounded-xl border border-purple-100 flex justify-between text-purple-900">
                <span>Protected by Legal Hold:</span>
                <span className="font-bold">{previewData.protectedByLegalHoldCount}</span>
              </div>
            </div>
            <button
              onClick={() => setShowPreviewModal(false)}
              className="w-full py-2 bg-slate-900 text-white rounded-xl text-xs font-bold"
            >
              Close Preview
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper icon component
function FileCheckIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="m9 15 2 2 4-4" />
    </svg>
  );
}
