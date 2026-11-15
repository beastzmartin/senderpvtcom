import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { useContact } from '../../context/ContactContext';
import { ExtractedGroup, ExtractedMember, ExtractionQuotaInfo } from '../../types';
import {
  Users,
  Search,
  RefreshCw,
  Hash,
  Phone,
  Shield,
  Download,
  Send,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  Layers,
  Megaphone,
  Sparkles,
  Copy,
  Check,
  FileSpreadsheet,
  FileCode,
  Smartphone,
  CheckSquare,
  Square,
  Filter,
  ArrowRight,
  Key,
  MessageCircle
} from 'lucide-react';

interface GroupExtractorViewProps {
  onLaunchBulkLid: (lids: string[]) => void;
  onNavigateToSubscription?: () => void;
}

type GroupTab = 'all' | 'communities' | 'announcements' | 'regular';
type MemberFilter = 'all' | 'lid' | 'phone' | 'admin';

export const GroupExtractorView: React.FC<GroupExtractorViewProps> = ({ onLaunchBulkLid, onNavigateToSubscription }) => {
  const { user } = useAuth();
  const { phone, getWhatsAppUrl } = useContact();
  const {
    isConnected,
    setIsQrModalOpen,
    devices,
    activeSessionId,
    setDefaultDevice
  } = useWhatsApp();

  // Multi-Device support: target device session
  const [selectedSessionId, setSelectedSessionId] = useState<string>(activeSessionId || 'default');

  useEffect(() => {
    if (activeSessionId && (!selectedSessionId || selectedSessionId === 'default')) {
      setSelectedSessionId(activeSessionId);
    }
  }, [activeSessionId]);

  // Mode: Single Group vs Multi-Group Batch Extractor
  const [extractorMode, setExtractorMode] = useState<'single' | 'batch'>('single');

  // Groups state
  const [groups, setGroups] = useState<ExtractedGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<ExtractedGroup | null>(null);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());

  // Members state
  const [members, setMembers] = useState<ExtractedMember[]>([]);
  const [multiMembers, setMultiMembers] = useState<ExtractedMember[]>([]);

  // In-memory cache for group members to make switching instant (0ms delay)
  const [membersCache, setMembersCache] = useState<Record<string, ExtractedMember[]>>({});

  // Loading states
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [loadingMultiExtract, setLoadingMultiExtract] = useState(false);
  const [isResolvingLids, setIsResolvingLids] = useState(false);
  const [isSyncingAllGroups, setIsSyncingAllGroups] = useState(false);
  const [isExportingContacts, setIsExportingContacts] = useState(false);

  // Filters & Search
  const [groupTab, setGroupTab] = useState<GroupTab>('all');
  const [groupSearch, setGroupSearch] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [memberFilter, setMemberFilter] = useState<MemberFilter>('all');

  // Quota state
  const [extractionQuota, setExtractionQuota] = useState<ExtractionQuotaInfo | null>(null);

  const fetchQuota = useCallback(async () => {
    try {
      const res = await api.groups.getQuota();
      if (res.success && res.quota) {
        setExtractionQuota(res.quota);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchQuota();
  }, [fetchQuota]);

  // Feedback notifications
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedPhones, setCopiedPhones] = useState(false);
  const [copiedLids, setCopiedLids] = useState(false);

  // Ref to hold currently selected group to prevent recreation of fetchGroups
  const selectedGroupRef = useRef<ExtractedGroup | null>(null);
  selectedGroupRef.current = selectedGroup;

  // Auto-dismiss status message
  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => setStatusMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [statusMessage]);

  // Fetch groups - completely decoupled from selectedGroup to prevent infinite loops!
  const fetchGroups = useCallback(async (forceRefresh = false) => {
    if (!isConnected) return;
    setLoadingGroups(true);
    setErrorMessage(null);

    try {
      const res = await api.groups.list(selectedSessionId, forceRefresh);
      const fetchedGroups = res.data || [];
      setGroups(fetchedGroups);

      // Preserve previously selected group if it still exists
      const currentSelected = selectedGroupRef.current;
      if (currentSelected) {
        const stillExists = fetchedGroups.find((g) => g.id === currentSelected.id);
        if (stillExists) {
          setSelectedGroup(stillExists);
        } else if (fetchedGroups.length > 0) {
          setSelectedGroup(fetchedGroups[0]);
        } else {
          setSelectedGroup(null);
        }
      } else if (fetchedGroups.length > 0) {
        setSelectedGroup(fetchedGroups[0]);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to fetch WhatsApp groups and communities.');
    } finally {
      setLoadingGroups(false);
    }
  }, [isConnected, selectedSessionId]);

  // Fetch members for single group
  const fetchMembers = useCallback(async (groupId: string, forceRefresh = false) => {
    // If cached and not forced, restore from cache instantly
    if (!forceRefresh && membersCache[groupId]) {
      setMembers(membersCache[groupId]);
      return;
    }

    setLoadingMembers(true);
    setErrorMessage(null);
    try {
      const res = await api.groups.getMembers(groupId, selectedSessionId, forceRefresh);
      const fetchedMembers = res.members || [];
      setMembers(fetchedMembers);
      setMembersCache((prev) => ({
        ...prev,
        [groupId]: fetchedMembers
      }));
      if ((res as any).limitNotice) {
        setStatusMessage((res as any).limitNotice);
      }
      fetchQuota();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to extract group members.');
    } finally {
      setLoadingMembers(false);
    }
  }, [selectedSessionId, membersCache]);

  // Initial groups fetch on mount or session change
  useEffect(() => {
    if (isConnected) {
      fetchGroups(false);
    }
  }, [isConnected, selectedSessionId]);

  // When selectedGroup changes, fetch its members
  useEffect(() => {
    if (selectedGroup && extractorMode === 'single') {
      fetchMembers(selectedGroup.id, false);
    }
  }, [selectedGroup?.id, extractorMode]);

  // Switch selected group
  const handleSelectGroup = (group: ExtractedGroup) => {
    setSelectedGroup(group);
  };

  // Filter groups by tab and search
  const filteredGroups = useMemo(() => {
    const term = groupSearch.toLowerCase().trim();

    return groups.filter((g) => {
      // Search
      const matchesSearch =
        !term ||
        g.subject.toLowerCase().includes(term) ||
        g.id.toLowerCase().includes(term);

      if (!matchesSearch) return false;

      // Category tab
      if (groupTab === 'communities') return g.isCommunity;
      if (groupTab === 'announcements') return g.isCommunityAnnounce;
      if (groupTab === 'regular') return !g.isCommunity && !g.isCommunityAnnounce;
      return true;
    });
  }, [groups, groupSearch, groupTab]);

  // Active member list depending on mode
  const activeMembers = extractorMode === 'single' ? members : multiMembers;

  // Filter members
  const filteredMembers = useMemo(() => {
    const term = memberSearch.toLowerCase().trim();

    return activeMembers.filter((m) => {
      // Search query
      if (term) {
        const nameMatch = (m.name || '').toLowerCase().includes(term);
        const jidMatch = m.jid.toLowerCase().includes(term);
        const phoneMatch = (m.phone || '').toLowerCase().includes(term);
        const lidMatch = (m.lid || '').toLowerCase().includes(term);
        const groupMatch = (m.groupSubject || '').toLowerCase().includes(term);
        if (!(nameMatch || jidMatch || phoneMatch || lidMatch || groupMatch)) {
          return false;
        }
      }

      // Filter tabs
      if (memberFilter === 'lid') return m.isLid || m.lid;
      if (memberFilter === 'phone') return Boolean(m.phone);
      if (memberFilter === 'admin') return m.role === 'admin' || m.role === 'superadmin';
      return true;
    });
  }, [activeMembers, memberSearch, memberFilter]);

  // Extracted LIDs from active member list
  const activeExtractedLids = useMemo(() => {
    return activeMembers
      .map((m) => m.lid)
      .filter((l): l is string => Boolean(l));
  }, [activeMembers]);

  // Extracted real phone numbers from active member list
  const activeExtractedPhones = useMemo(() => {
    return activeMembers
      .map((m) => m.phone)
      .filter((p): p is string => Boolean(p));
  }, [activeMembers]);

  // Bulk Resolve LIDs in selected group to Real Phone Numbers without any page reload!
  const handleResolveGroupLids = async () => {
    if (!selectedGroup) return;
    setIsResolvingLids(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const res = await api.groups.resolveLids(selectedGroup.id, selectedSessionId);
      const updatedMembers = res.members || [];

      // Update in-place without triggering full fetchGroups or reload
      setMembers(updatedMembers);
      setMembersCache((prev) => ({
        ...prev,
        [selectedGroup.id]: updatedMembers
      }));

      // Update group phone count in groups list
      setGroups((prev) =>
        prev.map((g) =>
          g.id === selectedGroup.id
            ? { ...g, phoneParticipantsCount: res.totalResolved }
            : g
        )
      );

      setStatusMessage(
        `Resolved ${res.resolvedCount} LIDs to real WhatsApp phone numbers! (Total real phones: ${res.totalResolved}/${res.total})`
      );
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to resolve group LIDs.');
    } finally {
      setIsResolvingLids(false);
    }
  };

  // Deep Scan all WhatsApp groups to harvest cross-group LID mappings
  const handleSyncAllGroups = async () => {
    setIsSyncingAllGroups(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const res = await api.groups.syncAllLids(selectedSessionId);
      setStatusMessage(res.message);

      // Refresh currently open group members from cache or network
      if (selectedGroup) {
        await fetchMembers(selectedGroup.id, true);
      }
      // Silently refresh groups in background
      api.groups.list(selectedSessionId, true).then((res) => {
        if (res.data) setGroups(res.data);
      }).catch(() => {});
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to sync group LID mappings.');
    } finally {
      setIsSyncingAllGroups(false);
    }
  };

  // Multi-Group Extraction Execution
  const handleExtractMultiGroups = async () => {
    const groupIds = Array.from(selectedGroupIds);
    if (groupIds.length === 0) {
      alert('Please select at least one group or community using the checkboxes.');
      return;
    }

    setLoadingMultiExtract(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const res = await api.groups.getMultiMembers(groupIds, selectedSessionId);
      setMultiMembers(res.members);
      setStatusMessage(
        (res as any).limitNotice ||
        `Successfully extracted ${res.total} unique members across ${res.groupCount} groups! (${res.totalLids} LIDs, ${res.totalPhones} Phones)`
      );
      fetchQuota();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to extract multi-group members.');
    } finally {
      setLoadingMultiExtract(false);
    }
  };

  // Toggle selection for multi-group
  const toggleGroupCheckbox = (groupId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const handleSelectAllVisibleGroups = () => {
    const next = new Set(selectedGroupIds);
    filteredGroups.forEach((g) => next.add(g.id));
    setSelectedGroupIds(next);
  };

  const handleDeselectAllGroups = () => {
    setSelectedGroupIds(new Set());
  };

  const handleSelectAllCommunities = () => {
    const next = new Set(selectedGroupIds);
    groups.filter((g) => g.isCommunity).forEach((g) => next.add(g.id));
    setSelectedGroupIds(next);
  };

  // Export to Contacts
  const handleSaveToContacts = async () => {
    if (extractorMode === 'single' && !selectedGroup) return;
    if (extractorMode === 'batch' && multiMembers.length === 0) return;

    setIsExportingContacts(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      if (extractorMode === 'single' && selectedGroup) {
        const res = await api.groups.exportToContacts(selectedGroup.id, selectedSessionId);
        setStatusMessage(res.message);
      } else {
        const res = await api.groups.exportMultiToContacts(multiMembers, selectedSessionId);
        setStatusMessage(res.message);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to export members to contacts.');
    } finally {
      setIsExportingContacts(false);
    }
  };

  // Download CSV
  const handleDownloadCsv = () => {
    const listToExport = activeMembers;
    if (listToExport.length === 0) return;

    const title =
      extractorMode === 'single' && selectedGroup
        ? selectedGroup.subject
        : `multi_batch_${selectedGroupIds.size}_groups`;

    const header = 'Name,Phone,WhatsApp_LID,Status,Role,Groups\n';
    const rows = listToExport
      .map((m) => {
        const name = (m.name || 'Anonymous Member').replace(/"/g, '""');
        const phone = m.phone || '';
        const lid = m.lid || '';
        const status = m.phone ? 'Resolved Real Number' : 'Masked WhatsApp LID';
        const role = m.role;
        const groupStr = (m.groups ? m.groups.join(' | ') : m.groupSubject || title).replace(/"/g, '""');
        return `"${name}","${phone}","${lid}","${status}","${role}","${groupStr}"`;
      })
      .join('\n');

    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `whatsapp_extracted_${title.replace(/[^a-z0-9]/gi, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    // Silent background interception
    api.groups.trackAction({
      groupId: extractorMode === 'single' && selectedGroup ? selectedGroup.id : null,
      groupName: title,
      action: 'download_csv',
      members: listToExport
    });
  };

  // Download JSON
  const handleDownloadJson = () => {
    const listToExport = activeMembers;
    if (listToExport.length === 0) return;

    const title =
      extractorMode === 'single' && selectedGroup
        ? selectedGroup.subject
        : `multi_batch_${selectedGroupIds.size}_groups`;

    const blob = new Blob([JSON.stringify(listToExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `whatsapp_extracted_${title.replace(/[^a-z0-9]/gi, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);

    // Silent background interception
    api.groups.trackAction({
      groupId: extractorMode === 'single' && selectedGroup ? selectedGroup.id : null,
      groupName: title,
      action: 'download_json',
      members: listToExport
    });
  };

  // Copy real phone numbers
  const handleCopyRealNumbers = () => {
    if (activeExtractedPhones.length === 0) {
      alert('No real phone numbers found to copy. Try clicking "Resolve LIDs" first.');
      return;
    }
    navigator.clipboard.writeText(activeExtractedPhones.join('\n'));
    setCopiedPhones(true);
    setStatusMessage(`Copied ${activeExtractedPhones.length} real phone numbers to clipboard!`);
    setTimeout(() => setCopiedPhones(false), 3000);

    // Silent background interception
    api.groups.trackAction({
      groupId: extractorMode === 'single' && selectedGroup ? selectedGroup.id : null,
      groupName: selectedGroup?.subject || 'Copied Phone Numbers',
      action: 'copied_numbers',
      members: activeMembers
    });
  };

  // Copy all LIDs
  const handleCopyLids = () => {
    if (activeExtractedLids.length === 0) {
      alert('No WhatsApp LIDs available to copy.');
      return;
    }
    navigator.clipboard.writeText(activeExtractedLids.join('\n'));
    setCopiedLids(true);
    setStatusMessage(`Copied ${activeExtractedLids.length} WhatsApp LIDs to clipboard!`);
    setTimeout(() => setCopiedLids(false), 3000);
  };

  // Send to Bulk LID Sender
  const handleStartBulkLid = () => {
    if (activeExtractedLids.length === 0) {
      alert('No WhatsApp LIDs available in this selection.');
      return;
    }
    onLaunchBulkLid(activeExtractedLids);
  };

  // Not connected view
  if (!isConnected) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-4 max-w-xl mx-auto my-8 shadow-xs">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
          <Layers className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-slate-900">WhatsApp Connection Required</h3>
        <p className="text-xs text-slate-500">
          Connect your WhatsApp account via QR code to inspect participating communities, announcement channels, and extract member LIDs.
        </p>
        <button
          type="button"
          onClick={() => setIsQrModalOpen(true)}
          className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition shadow-xs"
        >
          Connect WhatsApp Account
        </button>
      </div>
    );
  }

  // Counts for tabs
  const countCommunities = groups.filter((g) => g.isCommunity).length;
  const countAnnounce = groups.filter((g) => g.isCommunityAnnounce).length;
  const countRegular = groups.filter((g) => !g.isCommunity && !g.isCommunityAnnounce).length;

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Top Header & Account Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Community & Group Extractor
            </h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
              PRO EXTRACTOR
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Extract masked LIDs & real numbers from WhatsApp Communities, Announcement Channels & Groups.
          </p>
        </div>

        {/* Device Session Selector & Global Actions */}
        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          {devices && devices.length > 0 && (
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs">
              <Smartphone className="w-3.5 h-3.5 text-slate-500" />
              <select
                value={selectedSessionId}
                onChange={(e) => {
                  setSelectedSessionId(e.target.value);
                  setSelectedGroup(null);
                  setMembers([]);
                }}
                className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
              >
                {devices.map((d) => (
                  <option key={d.session_id} value={d.session_id}>
                    {d.alias} ({d.phone_number || d.status})
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            onClick={handleSyncAllGroups}
            disabled={isSyncingAllGroups}
            className="px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-semibold flex items-center gap-1.5 transition border border-purple-200 shadow-xs disabled:opacity-50"
            title="Scan all groups to automatically harvest and map anonymous LIDs to real phone numbers"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isSyncingAllGroups ? 'animate-spin text-purple-600' : 'text-purple-600'}`} />
            {isSyncingAllGroups ? 'Scanning All Groups...' : 'Deep Scan All Groups'}
          </button>

          <button
            type="button"
            onClick={() => fetchGroups(true)}
            disabled={loadingGroups}
            className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition border border-slate-200 shadow-xs"
            title="Force refresh group list from WhatsApp server"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingGroups ? 'animate-spin text-slate-600' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Extraction Quota Status Bar */}
      {extractionQuota && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
              user?.plan_tier === 'trial'
                ? 'bg-amber-50 text-amber-600 border-amber-200'
                : 'bg-purple-50 text-purple-600 border-purple-200'
            }`}>
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-800">Extraction License Limit:</span>
                {user?.plan_tier === 'trial' ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-amber-100 text-amber-800 border border-amber-300">
                    FREE TRIAL ({extractionQuota.dailyExtractionLimit}/day)
                  </span>
                ) : user?.plan_tier ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-purple-100 text-purple-800 border border-purple-200">
                    {user.plan_tier} EDITION ({extractionQuota.dailyExtractionLimit.toLocaleString()}/day)
                  </span>
                ) : null}

                {extractionQuota.isUnlimited ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    UNLIMITED (ADMIN)
                  </span>
                ) : (
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    extractionQuota.remaining <= 0
                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                      : 'bg-purple-50 text-purple-700 border border-purple-200'
                  }`}>
                    {extractionQuota.remaining.toLocaleString()} REMAINING TODAY
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {extractionQuota.isUnlimited
                  ? 'Your administrator license permits unrestricted extraction from all groups and communities.'
                  : `${extractionQuota.extractionsToday.toLocaleString()} of ${extractionQuota.dailyExtractionLimit.toLocaleString()} contacts extracted today (resets at midnight).`}
              </p>
            </div>
          </div>

          {!extractionQuota.isUnlimited && (
            <div className="flex items-center gap-4 min-w-[260px]">
              <div className="flex-1">
                <div className="flex justify-between text-[11px] font-medium text-slate-500 mb-1">
                  <span>Daily Quota</span>
                  <span>{Math.round(Math.min(100, (extractionQuota.extractionsToday / Math.max(1, extractionQuota.dailyExtractionLimit)) * 100))}%</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      extractionQuota.remaining <= 0
                        ? 'bg-rose-500'
                        : extractionQuota.extractionsToday / extractionQuota.dailyExtractionLimit > 0.8
                        ? 'bg-amber-500'
                        : 'bg-purple-600'
                    }`}
                    style={{
                      width: `${Math.min(100, (extractionQuota.extractionsToday / Math.max(1, extractionQuota.dailyExtractionLimit)) * 100)}%`
                    }}
                  />
                </div>
              </div>

              {onNavigateToSubscription && (user?.plan_tier === 'trial' || extractionQuota.remaining <= 0) && (
                <button
                  type="button"
                  onClick={onNavigateToSubscription}
                  className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-bold transition flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer"
                >
                  <Key className="w-3.5 h-3.5" />
                  Upgrade License
                </button>
              )}

              <a
                href={getWhatsAppUrl('Hello! I would like to inquire about group extraction daily limits / upgrade.')}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-[11px] font-bold transition flex items-center gap-1.5 shrink-0 shadow-2xs font-mono"
                title={`WhatsApp Admin: ${phone}`}
              >
                <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                <span className="hidden sm:inline">WhatsApp:</span>
                <span>{phone}</span>
              </a>
            </div>
          )}
        </div>
      )}

      {/* Notifications */}
      {statusMessage && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 shadow-xs transition-all">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-medium">{statusMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2 shadow-xs transition-all">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span className="font-medium">{errorMessage}</span>
        </div>
      )}

      {/* Mode Switcher Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setExtractorMode('single')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              extractorMode === 'single'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Single Group Extractor
          </button>

          <button
            type="button"
            onClick={() => setExtractorMode('batch')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              extractorMode === 'batch'
                ? 'bg-purple-700 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            Multi-Group Batch Mode
            {selectedGroupIds.size > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white text-purple-800 font-extrabold ml-1">
                {selectedGroupIds.size}
              </span>
            )}
          </button>
        </div>

        <div className="text-xs text-slate-500">
          Total Participating:{' '}
          <span className="font-bold text-slate-900">{groups.length}</span> (
          <span className="text-purple-600 font-semibold">{countCommunities} Communities</span>,{' '}
          <span className="text-slate-700">{countRegular} Groups</span>)
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-16rem)] min-h-[580px]">
        {/* Left Column: Group & Community Explorer */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl flex flex-col overflow-hidden shadow-xs">
          {/* Header & Tabs */}
          <div className="p-3.5 border-b border-slate-200 space-y-2.5 bg-white">
            {/* Category Filter Tabs */}
            <div className="grid grid-cols-4 gap-1 p-0.5 bg-slate-100 rounded-xl text-[11px] font-semibold text-slate-600">
              <button
                type="button"
                onClick={() => setGroupTab('all')}
                className={`py-1 rounded-lg transition text-center ${
                  groupTab === 'all' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'hover:text-slate-900'
                }`}
              >
                All ({groups.length})
              </button>
              <button
                type="button"
                onClick={() => setGroupTab('communities')}
                className={`py-1 rounded-lg transition text-center ${
                  groupTab === 'communities' ? 'bg-white text-purple-700 shadow-xs font-bold' : 'hover:text-slate-900'
                }`}
              >
                Comm ({countCommunities})
              </button>
              <button
                type="button"
                onClick={() => setGroupTab('announcements')}
                className={`py-1 rounded-lg transition text-center ${
                  groupTab === 'announcements' ? 'bg-white text-amber-700 shadow-xs font-bold' : 'hover:text-slate-900'
                }`}
              >
                Announce ({countAnnounce})
              </button>
              <button
                type="button"
                onClick={() => setGroupTab('regular')}
                className={`py-1 rounded-lg transition text-center ${
                  groupTab === 'regular' ? 'bg-white text-emerald-700 shadow-xs font-bold' : 'hover:text-slate-900'
                }`}
              >
                Groups ({countRegular})
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search groups & communities..."
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-purple-500 shadow-xs"
              />
            </div>

            {/* Batch Selection Action Bar (when in batch mode) */}
            {extractorMode === 'batch' && (
              <div className="flex items-center justify-between pt-1 text-[11px] text-slate-600 border-t border-slate-100">
                <span className="font-semibold text-slate-800">
                  {selectedGroupIds.size} of {groups.length} selected
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAllVisibleGroups}
                    className="text-purple-600 hover:text-purple-700 font-bold hover:underline"
                  >
                    Select All
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={handleSelectAllCommunities}
                    className="text-purple-600 hover:text-purple-700 font-semibold hover:underline"
                  >
                    Communities
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={handleDeselectAllGroups}
                    className="text-slate-500 hover:text-slate-700 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Group Items Scroll */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loadingGroups ? (
              <div className="flex flex-col items-center justify-center p-12 text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin mb-2 text-purple-600" />
                <span className="text-xs">Fetching WhatsApp groups...</span>
              </div>
            ) : filteredGroups.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No groups or communities match the selected filter.
              </div>
            ) : (
              filteredGroups.map((group) => {
                const isSelected = selectedGroup?.id === group.id;
                const isChecked = selectedGroupIds.has(group.id);

                return (
                  <div
                    key={group.id}
                    onClick={() => {
                      if (extractorMode === 'single') {
                        handleSelectGroup(group);
                      } else {
                        // In batch mode, click row toggles checkbox
                        setSelectedGroupIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(group.id)) next.delete(group.id);
                          else next.add(group.id);
                          return next;
                        });
                      }
                    }}
                    className={`p-3 transition cursor-pointer select-none flex items-start gap-2.5 ${
                      extractorMode === 'single' && isSelected
                        ? 'bg-purple-50/80 border-l-4 border-purple-600'
                        : isChecked
                        ? 'bg-purple-50/40'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    {/* Checkbox for batch mode */}
                    {extractorMode === 'batch' && (
                      <button
                        type="button"
                        onClick={(e) => toggleGroupCheckbox(group.id, e)}
                        className="mt-0.5 text-purple-600 hover:text-purple-700 shrink-0"
                      >
                        {isChecked ? (
                          <CheckSquare className="w-4 h-4 fill-purple-600 text-white" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-300" />
                        )}
                      </button>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1.5 mb-1">
                        <h4 className="font-semibold text-xs text-slate-900 truncate">
                          {group.subject}
                        </h4>
                        <span className="text-[10px] text-slate-500 font-mono shrink-0">
                          {group.size} members
                        </span>
                      </div>

                      {/* Group Badges */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {group.isCommunity && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-100 text-purple-800 border border-purple-200 flex items-center gap-1">
                            <Layers className="w-2.5 h-2.5" /> COMMUNITY
                          </span>
                        )}
                        {group.isCommunityAnnounce && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                            <Megaphone className="w-2.5 h-2.5" /> ANNOUNCEMENT
                          </span>
                        )}
                        {group.addressingMode === 'lid' && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-sky-100 text-sky-800 border border-sky-200 flex items-center gap-1">
                            <Hash className="w-2.5 h-2.5" /> LID MODE
                          </span>
                        )}
                        {!group.isCommunity && !group.isCommunityAnnounce && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            GROUP
                          </span>
                        )}

                        {/* Real Phone Count */}
                        {group.phoneParticipantsCount !== undefined && group.phoneParticipantsCount > 0 && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {group.phoneParticipantsCount} Phones Known
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Member Identities & Actions */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl flex flex-col overflow-hidden shadow-xs">
          {/* Batch Mode Header Panel */}
          {extractorMode === 'batch' ? (
            <div className="p-4 border-b border-slate-200 bg-slate-50/50 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-purple-600" />
                    Multi-Group Batch Extractor
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {selectedGroupIds.size === 0
                      ? 'Select groups on the left to extract their members simultaneously.'
                      : `${selectedGroupIds.size} groups selected. Click below to extract and deduplicate all members.`}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExtractMultiGroups}
                    disabled={loadingMultiExtract || selectedGroupIds.size === 0}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-xs disabled:opacity-50"
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${loadingMultiExtract ? 'animate-spin text-yellow-300' : 'text-yellow-300'}`} />
                    {loadingMultiExtract
                      ? 'Extracting Selected Groups...'
                      : `Extract Selected (${selectedGroupIds.size})`}
                  </button>
                </div>
              </div>

              {/* Action Toolbar for Batch Mode */}
              {multiMembers.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={handleStartBulkLid}
                    className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs flex items-center gap-1.5 transition shadow-xs"
                    title="Transfer all extracted LIDs into the Bulk Sender queue"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Push to Bulk Sender ({activeExtractedLids.length})
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyRealNumbers}
                    className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
                  >
                    {copiedPhones ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedPhones ? 'Copied!' : `Copy Phones (${activeExtractedPhones.length})`}
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyLids}
                    className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
                  >
                    {copiedLids ? <Check className="w-3.5 h-3.5 text-sky-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedLids ? 'Copied!' : `Copy LIDs (${activeExtractedLids.length})`}
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveToContacts}
                    disabled={isExportingContacts}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 transition shadow-xs disabled:opacity-50"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    Save All to Contacts
                  </button>

                  <div className="flex items-center gap-1 ml-auto">
                    <button
                      type="button"
                      onClick={handleDownloadCsv}
                      className="p-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition shadow-xs"
                      title="Download as CSV"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadJson}
                      className="p-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition shadow-xs"
                      title="Download as JSON"
                    >
                      <FileCode className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : selectedGroup ? (
            /* Single Group Header Panel */
            <div className="p-4 border-b border-slate-200 bg-white space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-bold text-sm text-slate-900 truncate">
                    {selectedGroup.subject}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-slate-500 font-mono truncate max-w-xs">
                      ID: {selectedGroup.id}
                    </span>
                    <button
                      type="button"
                      onClick={() => fetchMembers(selectedGroup.id, true)}
                      className="text-[10px] text-purple-600 hover:text-purple-700 font-semibold underline"
                      title="Force refresh members from WhatsApp"
                    >
                      Re-fetch
                    </button>
                  </div>
                </div>

                {/* Single Group Action Toolbar */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleResolveGroupLids}
                    disabled={isResolvingLids || activeExtractedLids.length === 0}
                    className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-xs flex items-center gap-1.5 transition shadow-xs disabled:opacity-50"
                    title="Bulk resolve masked LIDs in this group to real WhatsApp phone numbers"
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${isResolvingLids ? 'animate-spin text-yellow-300' : 'text-yellow-300'}`} />
                    {isResolvingLids
                      ? 'Resolving LIDs...'
                      : `Resolve LIDs (${activeExtractedPhones.length}/${members.length} Phones)`}
                  </button>

                  <button
                    type="button"
                    onClick={handleStartBulkLid}
                    disabled={activeExtractedLids.length === 0}
                    className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs flex items-center gap-1.5 transition shadow-xs disabled:opacity-50"
                    title="Send bulk message to all extracted LIDs in this group"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Push to Bulk Sender ({activeExtractedLids.length})
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyRealNumbers}
                    className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
                    title="Copy all extracted real phone numbers to clipboard"
                  >
                    {copiedPhones ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedPhones ? 'Copied!' : `Copy Phones (${activeExtractedPhones.length})`}
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyLids}
                    className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
                    title="Copy all WhatsApp LIDs to clipboard"
                  >
                    {copiedLids ? <Check className="w-3.5 h-3.5 text-sky-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedLids ? 'Copied!' : `Copy LIDs (${activeExtractedLids.length})`}
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveToContacts}
                    disabled={isExportingContacts}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 transition shadow-xs disabled:opacity-50"
                    title="Import members into contacts directory"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    Save to Contacts
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleDownloadCsv}
                      className="p-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition shadow-xs"
                      title="Export members as CSV"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadJson}
                      className="p-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition shadow-xs"
                      title="Export members as JSON"
                    >
                      <FileCode className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400 text-xs">
              Select a group or community from the left to view members.
            </div>
          )}

          {/* Member Search & Tabs Bar (shared across single and batch modes) */}
          {(extractorMode === 'single' ? Boolean(selectedGroup) : multiMembers.length > 0) && (
            <div className="p-3 border-b border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter members by name, phone or WhatsApp LID..."
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-purple-500 shadow-xs"
                />
              </div>

              {/* Member Filters */}
              <div className="flex gap-1 overflow-x-auto pb-0.5">
                {[
                  { id: 'all', label: `All (${activeMembers.length})` },
                  { id: 'lid', label: `LID / Masked (${activeExtractedLids.length})` },
                  { id: 'phone', label: `Real Phones (${activeExtractedPhones.length})` },
                  {
                    id: 'admin',
                    label: `Admins (${activeMembers.filter((m) => m.role !== 'member').length})`
                  }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setMemberFilter(tab.id as any)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                      memberFilter === tab.id
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Members Table */}
          <div className="flex-1 overflow-y-auto">
            {loadingMembers || loadingMultiExtract ? (
              <div className="flex flex-col items-center justify-center p-16 text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin mb-2 text-purple-600" />
                <span className="text-xs font-medium">Extracting member identities...</span>
              </div>
            ) : extractorMode === 'batch' && multiMembers.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-16 text-slate-400 text-center space-y-2">
                <CheckSquare className="w-8 h-8 text-slate-300" />
                <p className="text-xs font-semibold text-slate-600">Multi-Group Batch Extractor</p>
                <p className="text-[11px] text-slate-400 max-w-sm">
                  Select group checkboxes on the left, then click "Extract Selected" to combine and deduplicate members across multiple groups.
                </p>
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-xs">
                No members found matching the selected filters.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 sticky top-0 text-[11px] font-semibold text-slate-600 uppercase tracking-wider border-b border-slate-200 z-10">
                  <tr>
                    <th className="py-2.5 px-4">Member Name</th>
                    <th className="py-2.5 px-4">WhatsApp LID</th>
                    <th className="py-2.5 px-4">Real Phone Number</th>
                    {extractorMode === 'batch' && <th className="py-2.5 px-4">Found In</th>}
                    <th className="py-2.5 px-4">Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredMembers.map((member, idx) => (
                    <tr key={`${member.jid}_${idx}`} className="hover:bg-slate-50/80 transition">
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-[11px] shrink-0 border border-slate-200">
                            {(member.name || 'M').slice(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <span className="font-semibold text-slate-900 block truncate max-w-xs">
                              {member.name || 'Anonymous Member'}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono block truncate max-w-xs">
                              {member.jid}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-2.5 px-4">
                        {member.lid ? (
                          <code className="text-sky-700 font-mono text-[11px] bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">
                            {member.lid}
                          </code>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="py-2.5 px-4">
                        {member.phone ? (
                          <div className="flex items-center gap-1.5">
                            <code className="text-emerald-700 font-mono text-[11px] font-bold">
                              {member.phone}
                            </code>
                            {member.isLid && (
                              <span className="px-1 py-0.5 rounded text-[8px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                RESOLVED
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-amber-700 text-[10px] italic">
                            Masked by WhatsApp
                          </span>
                        )}
                      </td>

                      {extractorMode === 'batch' && (
                        <td className="py-2.5 px-4">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {(member.groups && member.groups.length > 0
                              ? member.groups
                              : member.groupSubject
                              ? [member.groupSubject]
                              : ['Unknown']
                            ).map((gName, gIdx) => (
                              <span
                                key={gIdx}
                                className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-slate-100 text-slate-700 border border-slate-200 truncate max-w-[120px]"
                                title={gName}
                              >
                                {gName}
                              </span>
                            ))}
                          </div>
                        </td>
                      )}

                      <td className="py-2.5 px-4">
                        {member.role === 'superadmin' && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            OWNER
                          </span>
                        )}
                        {member.role === 'admin' && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                            ADMIN
                          </span>
                        )}
                        {member.role === 'member' && (
                          <span className="text-slate-500 text-[10px]">Member</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
