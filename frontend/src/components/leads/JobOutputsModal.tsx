import React, { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../../services/api';
import { ExtractionJobRecord, LeadRecord } from '../../types';
import {
  X,
  Download,
  Search,
  Building2,
  Phone,
  Mail,
  Globe,
  MapPin,
  Star,
  CheckCircle2,
  ExternalLink,
  MessageSquare,
  Copy,
  Check,
  RefreshCw,
  FileSpreadsheet,
  ChevronRight,
  Database,
  Sliders,
  Layers,
  Sparkles
} from 'lucide-react';

interface JobOutputsModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: ExtractionJobRecord | null;
  onStartWhatsAppChat?: (phone: string, businessName: string) => void;
  onNavigateToLeads?: () => void;
}

export const JobOutputsModal: React.FC<JobOutputsModalProps> = ({
  isOpen,
  onClose,
  job,
  onStartWhatsAppChat,
  onNavigateToLeads
}) => {
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filterHasPhone, setFilterHasPhone] = useState<boolean>(false);
  const [filterHasEmail, setFilterHasEmail] = useState<boolean>(false);
  const [filterHasWebsite, setFilterHasWebsite] = useState<boolean>(false);
  const [isLiveStreaming, setIsLiveStreaming] = useState<boolean>(true);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const pollTimerRef = useRef<any>(null);

  const fetchJobLeads = async (silent: boolean = false) => {
    if (!job) return;
    try {
      if (!silent) setIsLoading(true);
      const res = await api.extractionJobs.getLeads(job.id);
      if (res && Array.isArray(res.leads)) {
        setLeads(res.leads);
      }
    } catch (err: any) {
      console.error('Failed to load job outputs:', err);
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && job) {
      fetchJobLeads(false);
    } else {
      setLeads([]);
    }
  }, [isOpen, job?.id]);

  // Live Auto-Refresh polling while extraction is running
  useEffect(() => {
    if (!isOpen || !job) return;

    const isRunning = job.status === 'running' || isLiveStreaming;
    if (isRunning) {
      pollTimerRef.current = setInterval(() => {
        fetchJobLeads(true);
      }, 2500);
    }

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [isOpen, job?.id, job?.status, isLiveStreaming]);

  // Filtered leads
  const filteredLeads = useMemo(() => {
    let result = [...leads];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (l) =>
          (l.business_name || '').toLowerCase().includes(q) ||
          (l.phone || '').toLowerCase().includes(q) ||
          (l.email || '').toLowerCase().includes(q) ||
          (l.city || '').toLowerCase().includes(q) ||
          (l.address || '').toLowerCase().includes(q) ||
          (l.category || '').toLowerCase().includes(q)
      );
    }
    if (filterHasPhone) {
      result = result.filter((l) => l.phone && l.phone.trim().length > 5);
    }
    if (filterHasEmail) {
      result = result.filter((l) => l.email && l.email.trim().length > 5);
    }
    if (filterHasWebsite) {
      result = result.filter((l) => l.website && l.website.trim().length > 4);
    }
    return result;
  }, [leads, searchQuery, filterHasPhone, filterHasEmail, filterHasWebsite]);

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleExportCsv = () => {
    if (filteredLeads.length === 0) {
      alert('No leads to export.');
      return;
    }
    const headers = [
      'Business Name',
      'Category',
      'Phone',
      'Email',
      'Website',
      'Address',
      'City',
      'State',
      'Postal Code',
      'Rating',
      'Reviews Count',
      'Operating Status',
      'Listing URL',
      'Place ID',
      'Source'
    ];

    const escapeCsv = (val: any) => {
      const str = String(val ?? '').replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = filteredLeads.map((l) => [
      escapeCsv(l.business_name || ''),
      escapeCsv(l.category || ''),
      escapeCsv(l.phone || ''),
      escapeCsv(l.email || ''),
      escapeCsv(l.website || ''),
      escapeCsv(l.address || ''),
      escapeCsv(l.city || ''),
      escapeCsv(l.state || ''),
      escapeCsv(l.postal_code || ''),
      l.rating || '',
      l.reviews_count || 0,
      escapeCsv(l.operating_status || 'Operational'),
      escapeCsv(l.listing_url || ''),
      escapeCsv(l.place_id || ''),
      escapeCsv(l.source || 'google_maps')
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cleanKw = (job?.keyword || 'extracted_leads').replace(/[^a-zA-Z0-9]/g, '_');
    a.download = `leads_${cleanKw}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isOpen || !job) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-6xl w-full max-h-[92vh] flex flex-col overflow-hidden text-slate-900 dark:text-white">
        {/* Header Bar */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/60 dark:bg-slate-900/60">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 uppercase tracking-wide">
                {job.source.replace(/_/g, ' ')}
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold capitalize flex items-center gap-1 ${
                  job.status === 'completed'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : job.status === 'running'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200 animate-pulse'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {job.status === 'running' && <RefreshCw className="w-3 h-3 animate-spin" />}
                {job.status}
              </span>
              {isLiveStreaming && job.status === 'running' && (
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  Live Sync Active
                </span>
              )}
            </div>
            <h2 className="text-lg font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <span>{job.keyword || 'Lead Extraction'}</span>
              {job.location && (
                <span className="text-slate-500 font-normal text-sm">in {job.location}</span>
              )}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchJobLeads(false)}
              className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-300 transition"
              title="Refresh Outputs"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Stats KPI Strip */}
        <div className="px-5 py-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
            <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Total Extracted</div>
            <div className="text-lg font-black text-emerald-600 dark:text-emerald-400">
              {leads.length} <span className="text-xs text-slate-400 font-normal">/ {job.requested_count} target</span>
            </div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
            <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">With Phone Number</div>
            <div className="text-lg font-black text-blue-600 dark:text-blue-400">
              {leads.filter((l) => l.phone).length}
            </div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
            <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">With Email Address</div>
            <div className="text-lg font-black text-purple-600 dark:text-purple-400">
              {leads.filter((l) => l.email).length}
            </div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
            <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">With Website URL</div>
            <div className="text-lg font-black text-amber-600 dark:text-amber-400">
              {leads.filter((l) => l.website).length}
            </div>
          </div>
        </div>

        {/* Toolbar & Filter Bar */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white dark:bg-slate-900">
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search business name, phone, email, city..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-emerald-500"
              />
            </div>

            <button
              onClick={() => setFilterHasPhone(!filterHasPhone)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                filterHasPhone
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              <Phone className="w-3 h-3" />
              <span>Has Phone</span>
            </button>

            <button
              onClick={() => setFilterHasEmail(!filterHasEmail)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                filterHasEmail
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              <Mail className="w-3 h-3" />
              <span>Has Email</span>
            </button>

            <button
              onClick={() => setFilterHasWebsite(!filterHasWebsite)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                filterHasWebsite
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              <Globe className="w-3 h-3" />
              <span>Has Website</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>

            {onNavigateToLeads && (
              <button
                onClick={() => {
                  onClose();
                  onNavigateToLeads();
                }}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
              >
                <Database className="w-3.5 h-3.5 text-blue-500" />
                <span>Open in CRM</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Data Grid Table */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-7 h-7 animate-spin text-emerald-600" />
              <span className="text-xs font-bold">Loading extracted outputs...</span>
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="p-16 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center mx-auto">
                <Building2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800 dark:text-white">
                {leads.length === 0 ? 'No leads collected yet' : 'No matching results'}
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {leads.length === 0
                  ? job.status === 'running'
                    ? 'Extraction is active. New leads will stream into this table in real-time as Google Maps discovers them.'
                    : 'This job finished without returning new records or is waiting to start.'
                  : 'Try clearing your search query or removing filters to view all extracted leads.'}
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider sticky top-0 z-10 select-none">
                <tr>
                  <th className="py-3 px-4 w-12 text-center text-slate-400">#</th>
                  <th className="py-3 px-4">Business & Category</th>
                  <th className="py-3 px-4">Phone Number</th>
                  <th className="py-3 px-4">Email Address</th>
                  <th className="py-3 px-4">Website</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">Rating</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredLeads.map((lead, idx) => (
                  <tr
                    key={lead.id || idx}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition"
                  >
                    <td className="py-3 px-4 text-center font-mono text-[10px] text-slate-400">
                      {idx + 1}
                    </td>

                    {/* Business Name */}
                    <td className="py-3 px-4 max-w-[220px]">
                      <div className="font-bold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                        {lead.business_name}
                        {lead.is_verified && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400 truncate block">
                        {lead.category || 'Local Business'}
                      </span>
                    </td>

                    {/* Phone */}
                    <td className="py-3 px-4">
                      {lead.phone ? (
                        <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
                          <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span>{lead.phone}</span>
                          <button
                            onClick={() => handleCopyText(lead.phone!, `phone_${idx}`)}
                            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-slate-600"
                            title="Copy Phone"
                          >
                            {copiedId === `phone_${idx}` ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600 italic text-[11px]">
                          No phone
                        </span>
                      )}
                    </td>

                    {/* Email */}
                    <td className="py-3 px-4">
                      {lead.email ? (
                        <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                          <Mail className="w-3 h-3 text-purple-500 shrink-0" />
                          <span className="truncate max-w-[150px]">{lead.email}</span>
                          <button
                            onClick={() => handleCopyText(lead.email!, `email_${idx}`)}
                            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-slate-600"
                            title="Copy Email"
                          >
                            {copiedId === `email_${idx}` ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600 italic text-[11px]">
                          No email
                        </span>
                      )}
                    </td>

                    {/* Website */}
                    <td className="py-3 px-4">
                      {lead.website ? (
                        <div className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                          <Globe className="w-3 h-3 text-blue-500 shrink-0" />
                          <a
                            href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate max-w-[140px] text-blue-600 hover:underline flex items-center gap-1"
                          >
                            <span>{lead.website.replace(/^https?:\/\//i, '').replace(/^www\./i, '')}</span>
                            <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                          </a>
                        </div>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600 italic text-[11px]">
                          No website
                        </span>
                      )}
                    </td>

                    {/* Location */}
                    <td className="py-3 px-4 max-w-[160px]">
                      <div className="flex items-start gap-1 text-slate-700 dark:text-slate-300">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <span className="truncate">{lead.city || lead.address || 'Unknown'}</span>
                      </div>
                    </td>

                    {/* Rating */}
                    <td className="py-3 px-4">
                      {lead.rating ? (
                        <div className="flex items-center gap-1 font-bold text-slate-800 dark:text-slate-200">
                          <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                          <span>{lead.rating}</span>
                          <span className="text-[10px] text-slate-400 font-normal">
                            ({lead.reviews_count || 0})
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600 italic text-[11px]">-</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {lead.phone && onStartWhatsAppChat && (
                          <button
                            onClick={() => onStartWhatsAppChat(lead.phone!, lead.business_name)}
                            className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 rounded-lg text-xs font-bold transition flex items-center gap-1"
                            title="Chat on WhatsApp"
                          >
                            <MessageSquare className="w-3 h-3 text-emerald-600" />
                            <span>WhatsApp</span>
                          </button>
                        )}
                        {lead.listing_url && (
                          <a
                            href={lead.listing_url}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-slate-600 transition"
                            title="Open Google Maps Listing"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer Summary */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            Showing <span className="font-bold text-slate-800 dark:text-white">{filteredLeads.length}</span> of{' '}
            <span className="font-bold text-slate-800 dark:text-white">{leads.length}</span> extracted leads.
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition"
            >
              Close
            </button>
            <button
              onClick={handleExportCsv}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition shadow-xs flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" />
              <span>Download CSV File</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

