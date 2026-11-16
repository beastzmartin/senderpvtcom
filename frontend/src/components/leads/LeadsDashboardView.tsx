import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import { LeadRecord, LeadStatus, LeadFilterOptions, LeadAnalyticsStats, ExtractionJobRecord } from '../../types';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { useAuth } from '../../context/AuthContext';
import { LeadDetailModal } from './LeadDetailModal';
import { ExtensionPairingModal } from './ExtensionPairingModal';
import {
  Users,
  Search,
  Filter,
  Download,
  Trash2,
  RefreshCw,
  Phone,
  Mail,
  Globe,
  MapPin,
  Star,
  ExternalLink,
  MessageSquare,
  Sparkles,
  CheckSquare,
  Square,
  ChevronLeft,
  ChevronRight,
  Chrome,
  CheckCircle2,
  Send,
  Building2,
  Layers,
  ArrowUpDown
} from 'lucide-react';

interface LeadsDashboardViewProps {
  onStartWhatsAppChat?: (phone: string, businessName: string) => void;
  onLaunchBulkWhatsApp?: (phones: string[]) => void;
  onNavigateToHub?: () => void;
}

export const LeadsDashboardView: React.FC<LeadsDashboardViewProps> = ({
  onStartWhatsAppChat,
  onLaunchBulkWhatsApp,
  onNavigateToHub
}) => {
  const { socket } = useWhatsApp();
  const { user } = useAuth();
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [jobs, setJobs] = useState<ExtractionJobRecord[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>('all');
  const [showAllUsers, setShowAllUsers] = useState<boolean>(false);
  const [liveMonitor, setLiveMonitor] = useState<boolean>(true);
  const [stats, setStats] = useState<LeadAnalyticsStats | null>(null);
  const [totalLeads, setTotalLeads] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());

  // Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<LeadStatus | 'all'>('all');
  const [selectedSource, setSelectedSource] = useState<string>('');
  const [filterHasPhone, setFilterHasPhone] = useState<boolean>(false);
  const [filterHasEmail, setFilterHasEmail] = useState<boolean>(false);
  const [filterHasWebsite, setFilterHasWebsite] = useState<boolean>(false);

  // Modals
  const [inspectingLeadId, setInspectingLeadId] = useState<string | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);
  const [isPairingModalOpen, setIsPairingModalOpen] = useState<boolean>(false);

  // Toast notification for incoming real-time leads
  const [incomingAlert, setIncomingAlert] = useState<string | null>(null);

  // Load available extraction jobs
  useEffect(() => {
    api.extractionJobs.list(50).then((jList) => setJobs(jList || [])).catch(() => {});
  }, []);

  const fetchLeads = useCallback(async (page: number = currentPage, silent: boolean = false) => {
    try {
      if (!silent) setIsLoading(true);
      const filters: LeadFilterOptions = {
        search: searchQuery.trim() || undefined,
        status: selectedStatus,
        source: selectedSource || undefined,
        jobId: selectedJobId !== 'all' ? selectedJobId : undefined,
        allUsers: showAllUsers || undefined,
        hasPhone: filterHasPhone || undefined,
        hasEmail: filterHasEmail || undefined,
        hasWebsite: filterHasWebsite || undefined,
        page,
        limit: 50,
        sortBy: 'created_at',
        sortOrder: 'desc'
      };

      const [leadsRes, statsRes] = await Promise.all([
        api.leads.list(filters),
        api.leads.getStats()
      ]);

      setLeads(leadsRes.leads);
      setTotalLeads(leadsRes.total);
      setCurrentPage(leadsRes.page);
      setTotalPages(leadsRes.totalPages || 1);
      setStats(statsRes);
    } catch (err: any) {
      console.error('Error fetching leads:', err);
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [searchQuery, selectedStatus, selectedSource, selectedJobId, showAllUsers, filterHasPhone, filterHasEmail, filterHasWebsite, currentPage]);

  useEffect(() => {
    fetchLeads(1);
  }, [selectedStatus, selectedSource, selectedJobId, showAllUsers, filterHasPhone, filterHasEmail, filterHasWebsite]);

  // Real-time WebSocket Listeners for Instant Lead Appearance
  useEffect(() => {
    if (!socket) return;

    const handleLeadCreated = (newLead: LeadRecord) => {
      if (!newLead) return;
      setLeads((prev) => {
        if (prev.some((l) => l.id === newLead.id)) return prev;
        return [newLead, ...prev];
      });
      setTotalLeads((prev) => prev + 1);
      setIncomingAlert(`⚡ New lead extracted: ${newLead.business_name}`);
      setTimeout(() => setIncomingAlert(null), 3500);
    };

    const handleBatchSynced = (data: any) => {
      setIncomingAlert(`✓ ${data.count || 'New'} leads synced from extraction!`);
      setTimeout(() => setIncomingAlert(null), 3500);
      fetchLeads(1, true);
    };

    const handleLeadUpdated = (updated: LeadRecord) => {
      setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    };

    const handleLeadDeleted = (data: { id: string }) => {
      setLeads((prev) => prev.filter((l) => l.id !== data.id));
      setTotalLeads((prev) => Math.max(0, prev - 1));
    };

    socket.on('lead:created', handleLeadCreated);
    socket.on('lead:batch_synced', handleBatchSynced);
    socket.on('lead:updated', handleLeadUpdated);
    socket.on('lead:deleted', handleLeadDeleted);

    return () => {
      socket.off('lead:created', handleLeadCreated);
      socket.off('lead:batch_synced', handleBatchSynced);
      socket.off('lead:updated', handleLeadUpdated);
      socket.off('lead:deleted', handleLeadDeleted);
    };
  }, [socket, fetchLeads]);

  // Periodic live background check when liveMonitor is enabled
  useEffect(() => {
    if (!liveMonitor) return;
    const interval = setInterval(() => {
      fetchLeads(currentPage, true);
    }, 4000);
    return () => clearInterval(interval);
  }, [liveMonitor, currentPage, fetchLeads]);

  // Handle Search Debounce
  useEffect(() => {
    const handler = setTimeout(() => {
      fetchLeads(1);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Selection handlers
  const handleToggleSelectAll = () => {
    if (selectedLeadIds.size === leads.length && leads.length > 0) {
      setSelectedLeadIds(new Set());
    } else {
      setSelectedLeadIds(new Set(leads.map((l) => l.id)));
    }
  };

  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedLeadIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedLeadIds(next);
  };

  // Bulk Actions
  const handleBulkDelete = async () => {
    if (selectedLeadIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedLeadIds.size} selected leads permanently?`)) return;

    try {
      await api.leads.bulkDelete(Array.from(selectedLeadIds));
      setSelectedLeadIds(new Set());
      fetchLeads();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleBulkStatus = async (status: LeadStatus) => {
    if (selectedLeadIds.size === 0) return;
    try {
      await api.leads.bulkUpdateStatus(Array.from(selectedLeadIds), status);
      setSelectedLeadIds(new Set());
      fetchLeads();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleBulkExportCsv = () => {
    const ids = Array.from(selectedLeadIds);
    const query = ids.length > 0 ? `?ids=${ids.join(',')}` : '';
    window.open(`/api/leads/export/csv${query}`, '_blank');
  };

  const handleDispatchBulkWhatsApp = () => {
    const selectedPhones = leads
      .filter((l) => selectedLeadIds.has(l.id) && l.phone)
      .map((l) => l.phone!);

    if (selectedPhones.length === 0) {
      alert('None of the selected leads have valid phone numbers.');
      return;
    }

    if (onLaunchBulkWhatsApp) {
      onLaunchBulkWhatsApp(selectedPhones);
    }
  };

  const handleOpenLeadDetails = (id: string) => {
    setInspectingLeadId(id);
    setIsDetailModalOpen(true);
  };

  const statusTabs: Array<{ id: LeadStatus | 'all'; label: string; count?: number }> = [
    { id: 'all', label: 'All Leads', count: stats?.totalLeads },
    { id: 'new', label: 'New', count: stats?.byStatus['new'] },
    { id: 'contacted', label: 'Contacted', count: stats?.byStatus['contacted'] },
    { id: 'qualified', label: 'Qualified', count: stats?.byStatus['qualified'] },
    { id: 'interested', label: 'Interested', count: stats?.byStatus['interested'] },
    { id: 'converted', label: 'Converted', count: stats?.byStatus['converted'] },
    { id: 'not_interested', label: 'Not Interested', count: stats?.byStatus['not_interested'] },
    { id: 'archived', label: 'Archived', count: stats?.byStatus['archived'] }
  ];

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Real-time Notification Banner */}
      {incomingAlert && (
        <div className="bg-emerald-500 text-white px-4 py-2.5 rounded-xl shadow-md text-xs font-semibold flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-200" />
            <span>{incomingAlert}</span>
          </div>
          <button onClick={() => setIncomingAlert(null)} className="text-white hover:text-emerald-200 text-sm">
            ✕
          </button>
        </div>
      )}

      {/* Header and Quick Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Lead Intelligence CRM
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
              PROSPECTOR
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage, filter, enrich, and convert extracted business leads across all channels.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsPairingModalOpen(true)}
            className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
          >
            <Chrome className="w-4 h-4 text-emerald-600" />
            Connect Extension
          </button>

          {onNavigateToHub && (
            <button
              onClick={onNavigateToHub}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
            >
              <Layers className="w-4 h-4 text-emerald-400" />
              Extraction Hub
            </button>
          )}

          <button
            onClick={() => fetchLeads(currentPage)}
            className="p-2 border border-slate-200 hover:bg-slate-100 rounded-xl text-slate-600 transition"
            title="Refresh Leads"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Total Leads</span>
            <span className="text-lg font-black text-slate-900">{stats?.totalLeads ?? totalLeads}</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Extracted Today</span>
            <span className="text-lg font-black text-slate-900">{stats?.leadsToday ?? 0}</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold shrink-0">
            <Phone className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">WhatsApp Ready</span>
            <span className="text-lg font-black text-slate-900">{stats?.withPhone ?? 0}</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold shrink-0">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">With Verified Email</span>
            <span className="text-lg font-black text-slate-900">{stats?.withEmail ?? 0}</span>
          </div>
        </div>
      </div>

      {/* Status Pipeline Navigation */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none border-b border-slate-200">
        {statusTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSelectedStatus(tab.id)}
            className={`px-3 py-2 text-xs font-bold rounded-t-xl transition whitespace-nowrap flex items-center gap-1.5 border-b-2 ${
              selectedStatus === tab.id
                ? 'border-emerald-600 text-emerald-700 bg-white shadow-sm'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/60'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                  selectedStatus === tab.id
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search & Advanced Filters Bar */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-3.5 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by company name, category, city, phone, or email..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:bg-white transition"
            />
          </div>

          {/* Quick Filter Buttons & Export */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Extraction Job selector */}
            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:border-emerald-500 max-w-[190px] truncate"
              title="Filter by Extraction Job"
            >
              <option value="all">All Extraction Jobs</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.keyword ? `${j.keyword}${j.location ? ` in ${j.location}` : ''}` : `Job #${j.id.slice(0, 8)}`} ({j.collected_count || 0})
                </option>
              ))}
            </select>

            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:border-emerald-500"
            >
              <option value="">All Sources</option>
              <option value="google_maps">Google Maps</option>
              <option value="website_extractor">Website Extractor</option>
              <option value="business_directory">Business Directory</option>
              <option value="company_contact">Company Contact</option>
            </select>

            {/* Live Stream Monitor */}
            <button
              onClick={() => setLiveMonitor(!liveMonitor)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 border ${
                liveMonitor
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                  : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
              }`}
              title={liveMonitor ? 'Live Stream Active (Auto-updating leads)' : 'Live Stream Paused'}
            >
              <span className={`w-2 h-2 rounded-full ${liveMonitor ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              Live Stream
            </button>

            {user?.role === 'admin' && (
              <button
                onClick={() => setShowAllUsers(!showAllUsers)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1 border ${
                  showAllUsers
                    ? 'bg-amber-50 text-amber-800 border-amber-300 font-bold'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
                title="Admin View: Show leads across all users"
              >
                <Users className="w-3.5 h-3.5" /> All Users
              </button>
            )}

            <button
              onClick={() => setFilterHasPhone(!filterHasPhone)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1 border ${
                filterHasPhone
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Phone className="w-3.5 h-3.5" /> Has Phone
            </button>

            <button
              onClick={() => setFilterHasEmail(!filterHasEmail)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1 border ${
                filterHasEmail
                  ? 'bg-blue-50 text-blue-700 border-blue-300'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Mail className="w-3.5 h-3.5" /> Has Email
            </button>

            <button
              onClick={handleBulkExportCsv}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          </div>
        </div>

        {/* Bulk Action Bar (Visible when leads are selected) */}
        {selectedLeadIds.size > 0 && (
          <div className="p-2.5 bg-slate-900 text-white rounded-xl flex flex-wrap items-center justify-between gap-3 animate-fade-in">
            <div className="flex items-center gap-2 text-xs font-bold pl-2">
              <CheckSquare className="w-4 h-4 text-emerald-400" />
              <span>{selectedLeadIds.size} leads selected</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Send to Bulk WhatsApp */}
              {onLaunchBulkWhatsApp && (
                <button
                  onClick={handleDispatchBulkWhatsApp}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                >
                  <Send className="w-3.5 h-3.5" /> Send to Bulk WhatsApp
                </button>
              )}

              {/* Status Changer */}
              <select
                onChange={(e) => {
                  if (e.target.value) handleBulkStatus(e.target.value as LeadStatus);
                }}
                defaultValue=""
                className="px-2.5 py-1.5 bg-slate-800 border border-slate-700 text-white rounded-lg text-xs font-semibold outline-none"
              >
                <option value="" disabled>Change Status...</option>
                <option value="new">Mark as New</option>
                <option value="contacted">Mark as Contacted</option>
                <option value="qualified">Mark as Qualified</option>
                <option value="interested">Mark as Interested</option>
                <option value="converted">Mark as Converted</option>
                <option value="archived">Archive</option>
              </select>

              <button
                onClick={handleBulkExportCsv}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" /> Export Selected
              </button>

              <button
                onClick={handleBulkDelete}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>

              <button
                onClick={() => setSelectedLeadIds(new Set())}
                className="px-2 py-1 text-slate-400 hover:text-white text-xs"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>

      {/* LEADS TABLE */}
      <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-7 h-7 animate-spin text-emerald-600" />
            <span className="text-xs font-bold">Loading leads database...</span>
          </div>
        ) : leads.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <Building2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-800">No leads found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              No business records match your current filter criteria. Use the Chrome Extension to extract leads directly from Google Maps or company websites.
            </p>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setIsPairingModalOpen(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition shadow-sm"
              >
                Connect Chrome Extension
              </button>
              {onNavigateToHub && (
                <button
                  onClick={onNavigateToHub}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs transition"
                >
                  Open Extraction Hub
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider select-none">
                <tr>
                  <th className="py-3.5 px-4 w-10">
                    <button onClick={handleToggleSelectAll} className="text-slate-400 hover:text-slate-700">
                      {selectedLeadIds.size === leads.length && leads.length > 0 ? (
                        <CheckSquare className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-3.5 px-4">Business & Category</th>
                  <th className="py-3.5 px-4">Contact Channels</th>
                  <th className="py-3.5 px-4">Location</th>
                  <th className="py-3.5 px-4">Rating</th>
                  <th className="py-3.5 px-4">Source</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leads.map((lead) => {
                  const isChecked = selectedLeadIds.has(lead.id);

                  return (
                    <tr
                      key={lead.id}
                      className={`hover:bg-slate-50/80 transition cursor-pointer ${
                        isChecked ? 'bg-emerald-50/30' : ''
                      }`}
                      onClick={() => handleOpenLeadDetails(lead.id)}
                    >
                      {/* Checkbox */}
                      <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleToggleSelect(lead.id)}
                          className="text-slate-400 hover:text-slate-700"
                        >
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {/* Business & Category */}
                      <td className="py-3.5 px-4 max-w-[200px]">
                        <div className="font-bold text-slate-900 truncate flex items-center gap-1.5">
                          {lead.business_name}
                          {lead.is_verified && (
                            <span title="Verified Contact" className="text-emerald-600 shrink-0">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400 truncate block">
                          {lead.category || 'Local Business'}
                        </span>
                      </td>

                      {/* Contact Channels */}
                      <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                        <div className="space-y-1">
                          {lead.phone ? (
                            <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                              <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                              <span>{lead.phone}</span>
                              {onStartWhatsAppChat && (
                                <button
                                  onClick={() => onStartWhatsAppChat(lead.phone!, lead.business_name)}
                                  className="text-emerald-600 hover:text-emerald-700 p-0.5 rounded transition"
                                  title="Chat on WhatsApp"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-300 italic text-[11px]">No phone</span>
                          )}

                          {lead.email ? (
                            <div className="flex items-center gap-1.5 text-slate-600 text-[11px]">
                              <Mail className="w-3 h-3 text-blue-500 shrink-0" />
                              <span className="truncate max-w-[150px]">{lead.email}</span>
                            </div>
                          ) : null}

                          {lead.website ? (
                            <div className="flex items-center gap-1.5 text-slate-600 text-[11px]">
                              <Globe className="w-3 h-3 text-indigo-500 shrink-0" />
                              <a
                                href={lead.website}
                                target="_blank"
                                rel="noreferrer"
                                className="truncate max-w-[150px] hover:underline hover:text-indigo-600"
                              >
                                {lead.website.replace(/^https?:\/\//i, '').replace(/^www\./i, '')}
                              </a>
                            </div>
                          ) : null}
                        </div>
                      </td>

                      {/* Location */}
                      <td className="py-3.5 px-4 max-w-[150px]">
                        <div className="flex items-start gap-1 text-slate-700">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                          <span className="truncate">{lead.city || lead.address || 'Unknown'}</span>
                        </div>
                      </td>

                      {/* Rating */}
                      <td className="py-3.5 px-4">
                        {lead.rating ? (
                          <div className="flex items-center gap-1 font-bold text-slate-800">
                            <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                            <span>{lead.rating}</span>
                            <span className="text-[10px] text-slate-400 font-normal">
                              ({lead.reviews_count || 0})
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-300 italic text-[11px]">N/A</span>
                        )}
                      </td>

                      {/* Source */}
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200">
                          {lead.source.replace(/_/g, ' ')}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                            lead.status === 'new'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : lead.status === 'contacted'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : lead.status === 'qualified'
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : lead.status === 'interested'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : lead.status === 'converted'
                              ? 'bg-teal-50 text-teal-800 border border-teal-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {lead.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleOpenLeadDetails(lead.id)}
                          className="px-2.5 py-1 text-slate-600 hover:text-slate-900 font-semibold rounded-lg hover:bg-slate-100 transition"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalLeads > 0 && (
          <div className="p-3.5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>
              Showing {leads.length} of {totalLeads} total leads
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage <= 1}
                onClick={() => fetchLeads(currentPage - 1)}
                className="p-1.5 border border-slate-200 rounded-lg hover:bg-white disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-bold text-slate-800">
                {currentPage} / {totalPages}
              </span>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => fetchLeads(currentPage + 1)}
                className="p-1.5 border border-slate-200 rounded-lg hover:bg-white disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* LEAD DETAIL MODAL */}
      <LeadDetailModal
        leadId={inspectingLeadId}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        onLeadUpdated={(updated) => {
          setLeads(leads.map((l) => (l.id === updated.id ? updated : l)));
        }}
        onLeadDeleted={(id) => {
          setLeads(leads.filter((l) => l.id !== id));
          setTotalLeads((prev) => Math.max(0, prev - 1));
        }}
        onStartWhatsAppChat={onStartWhatsAppChat}
      />

      {/* EXTENSION PAIRING MODAL */}
      <ExtensionPairingModal
        isOpen={isPairingModalOpen}
        onClose={() => setIsPairingModalOpen(false)}
      />
    </div>
  );
};

