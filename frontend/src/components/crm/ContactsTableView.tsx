import React, { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Download,
  Trash2,
  FolderPlus,
  MessageCircle,
  Eye,
  CheckSquare,
  Square,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Columns,
  X,
  Users
} from 'lucide-react';
import { crmApi, CrmContact, CrmList, CrmTag, CrmCustomFieldDefinition } from './crmApi';

interface ContactsTableViewProps {
  lists: CrmList[];
  tags: CrmTag[];
  customFields: CrmCustomFieldDefinition[];
  onOpenFilterBuilder: () => void;
  onOpenImportWizard: () => void;
  onOpenExportModal: () => void;
  onSelectContact: (contactId: string) => void;
  onLaunchWhatsApp: (phone: string) => void;
  activeFilter?: any;
}

export const ContactsTableView: React.FC<ContactsTableViewProps> = ({
  lists = [],
  tags = [],
  customFields = [],
  onOpenFilterBuilder,
  onOpenImportWizard,
  onOpenExportModal,
  onSelectContact,
  onLaunchWhatsApp,
  activeFilter
}) => {
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [selectedTagId, setSelectedTagId] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Keyset cursor pagination state
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [prevCursor, setPrevCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalApprox, setTotalApprox] = useState<number>(0);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);

  // Selection & Bulk actions
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isAllMatchingSelected, setIsAllMatchingSelected] = useState(false);
  const [isBulkActing, setIsBulkActing] = useState(false);

  // Column visibility chooser
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    name: true,
    email: true,
    phone: true,
    company: true,
    title: true,
    status: true,
    lead_score: true,
    created_at: true
  });
  const [isColumnChooserOpen, setIsColumnChooserOpen] = useState(false);

  useEffect(() => {
    loadContacts();
  }, [selectedListId, selectedTagId, selectedStatus, sortBy, sortOrder, activeFilter]);

  const loadContacts = async (cursor?: string, direction?: 'next' | 'prev') => {
    setIsLoading(true);
    try {
      const res = await crmApi.fetchContacts({
        limit: 25,
        cursor,
        direction,
        sort_by: sortBy,
        sort_order: sortOrder,
        search: searchTerm.trim() || undefined,
        list_id: selectedListId || undefined,
        tag_id: selectedTagId || undefined,
        status: selectedStatus || undefined,
        filter_definition: activeFilter
      });

      if (res && res.success) {
        setContacts(Array.isArray(res.contacts) ? res.contacts : []);
        setNextCursor(res.next_cursor || null);
        setPrevCursor(res.prev_cursor || null);
        setHasMore(Boolean(res.has_more));
        setTotalApprox(typeof res.total_approx === 'number' ? res.total_approx : 0);
      } else {
        setContacts([]);
      }
    } catch (err: any) {
      console.error('Failed to load contacts:', err);
      setContacts([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNextPage = () => {
    if (nextCursor) {
      setCursorHistory([...cursorHistory, nextCursor]);
      loadContacts(nextCursor, 'next');
    }
  };

  const handlePrevPage = () => {
    if (cursorHistory.length > 0) {
      const updated = [...cursorHistory];
      updated.pop();
      const prev = updated[updated.length - 1];
      setCursorHistory(updated);
      loadContacts(prev, 'prev');
    } else {
      loadContacts(undefined);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCursorHistory([]);
    loadContacts();
  };

  const handleClearSearch = () => {
    setSearchTerm('');
    setCursorHistory([]);
    loadContacts();
  };

  const handleToggleSelectAllOnPage = () => {
    const list = Array.isArray(contacts) ? contacts : [];
    if (selectedIds.length === list.length && list.length > 0) {
      setSelectedIds([]);
      setIsAllMatchingSelected(false);
    } else {
      setSelectedIds(list.map((c) => c.id));
    }
  };

  const handleToggleSelectRow = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((x) => x !== id));
      setIsAllMatchingSelected(false);
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.length} selected contacts?`)) return;
    setIsBulkActing(true);
    try {
      const res = await crmApi.bulkDelete(selectedIds);
      if (res.success) {
        setSelectedIds([]);
        loadContacts();
      }
    } catch (err: any) {
      alert(`Bulk delete failed: ${err.message}`);
    } finally {
      setIsBulkActing(false);
    }
  };

  const handleBulkAddToList = async () => {
    const listId = prompt('Enter List ID to assign selected contacts to:');
    if (!listId) return;

    setIsBulkActing(true);
    try {
      const res = await crmApi.addContactsToList(listId.trim(), selectedIds);
      if (res.success) {
        alert('Contacts added to list.');
        setSelectedIds([]);
      }
    } catch (err: any) {
      alert(`Bulk add failed: ${err.message}`);
    } finally {
      setIsBulkActing(false);
    }
  };

  const renderEmailStatus = (status?: string) => {
    switch (status) {
      case 'valid':
        return (
          <span title="Valid & Verified Email">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 inline" />
          </span>
        );
      case 'invalid':
        return (
          <span title="Invalid Email">
            <XCircle className="w-3.5 h-3.5 text-rose-500 inline" />
          </span>
        );
      case 'risky':
        return (
          <span title="Risky / Disposable">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 inline" />
          </span>
        );
      default:
        return (
          <span title="Unverified">
            <HelpCircle className="w-3.5 h-3.5 text-slate-300 inline" />
          </span>
        );
    }
  };

  const renderLifecycleBadge = (status?: string) => {
    switch (status) {
      case 'customer':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 border border-emerald-200">
            Customer
          </span>
        );
      case 'prospect':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 border border-indigo-200">
            Prospect
          </span>
        );
      case 'lead':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 border border-amber-200">
            Lead
          </span>
        );
      case 'churned':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-700 border border-rose-200">
            Churned
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700">
            {status || 'Unknown'}
          </span>
        );
    }
  };

  const statuses = [
    { id: '', label: 'All Lifecycle' },
    { id: 'lead', label: 'Leads' },
    { id: 'prospect', label: 'Prospects' },
    { id: 'customer', label: 'Customers' },
    { id: 'churned', label: 'Churned' }
  ];

  const contactList = Array.isArray(contacts) ? contacts : [];

  return (
    <div className="space-y-4">
      {/* Lifecycle Quick Filter Tabs & Search Bar */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search Input */}
          <form onSubmit={handleSearchSubmit} className="relative flex-1 min-w-[260px] max-w-lg">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search contacts by name, email, phone, or company..."
              className="w-full pl-9 pr-9 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </form>

          {/* Controls: List Selector, Filter Builder, Columns, Refresh */}
          <div className="flex flex-wrap items-center gap-2">
            {/* List Selector */}
            <select
              value={selectedListId}
              onChange={(e) => {
                setSelectedListId(e.target.value);
                setCursorHistory([]);
              }}
              className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="">All Lists ({totalApprox.toLocaleString()} contacts)</option>
              {Array.isArray(lists) &&
                lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.cached_count || 0})
                  </option>
                ))}
            </select>

            {/* Filter Builder Button */}
            <button
              type="button"
              onClick={onOpenFilterBuilder}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition border ${
                activeFilter && activeFilter.conditions?.length > 0
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-300 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              Filters {activeFilter?.conditions?.length ? `(${activeFilter.conditions.length})` : ''}
            </button>

            {/* Column Chooser Button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsColumnChooserOpen(!isColumnChooserOpen)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 transition"
              >
                <Columns className="w-3.5 h-3.5" />
                Columns
              </button>

              {isColumnChooserOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-2xl border border-slate-200 p-2.5 z-30 space-y-1 text-xs">
                  <div className="text-[10px] uppercase font-bold text-slate-400 px-2 py-1">Visible Columns</div>
                  {Object.keys(visibleColumns).map((col) => (
                    <label
                      key={col}
                      className="flex items-center gap-2 p-1.5 hover:bg-slate-50 rounded-xl cursor-pointer select-none"
                    >
                      <input
                        type="checkbox"
                        checked={visibleColumns[col]}
                        onChange={(e) => setVisibleColumns({ ...visibleColumns, [col]: e.target.checked })}
                        className="rounded text-indigo-600 focus:ring-0"
                      />
                      <span className="capitalize font-medium text-slate-700">{col.replace('_', ' ')}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={() => loadContacts()}
              className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 border border-slate-200 transition"
              title="Refresh Contacts"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* Quick Lifecycle Filter Pills */}
        <div className="flex items-center gap-1.5 pt-1 overflow-x-auto pb-0.5">
          {statuses.map((s) => {
            const isSelected = selectedStatus === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setSelectedStatus(s.id);
                  setCursorHistory([]);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bulk Actions Floating Toolbar */}
      {selectedIds.length > 0 && (
        <div className="bg-slate-900 text-white p-3.5 rounded-2xl shadow-2xl flex flex-wrap items-center justify-between gap-3 text-xs animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3">
            <span className="font-bold bg-indigo-600 px-3 py-1 rounded-xl">
              {selectedIds.length} Selected
            </span>
            <span className="text-slate-400">
              {isAllMatchingSelected ? 'All matching contacts selected' : 'Selected on current page'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleBulkAddToList}
              disabled={isBulkActing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-semibold transition"
            >
              <FolderPlus className="w-3.5 h-3.5" /> Add to List
            </button>
            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={isBulkActing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-semibold transition"
            >
              <Trash2 className="w-3.5 h-3.5" /> Bulk Delete
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="px-2.5 py-1.5 text-slate-400 hover:text-white font-semibold transition"
            >
              Deselect
            </button>
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto min-h-[420px]">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/80 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
              <tr>
                <th className="py-3.5 px-4 w-10">
                  <button
                    type="button"
                    onClick={handleToggleSelectAllOnPage}
                    className="text-slate-400 hover:text-indigo-600"
                  >
                    {selectedIds.length === contactList.length && contactList.length > 0 ? (
                      <CheckSquare className="w-4 h-4 text-indigo-600" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                {visibleColumns.name && <th className="py-3.5 px-4">Contact</th>}
                {visibleColumns.email && <th className="py-3.5 px-4">Email</th>}
                {visibleColumns.phone && <th className="py-3.5 px-4">Phone (WhatsApp)</th>}
                {visibleColumns.company && <th className="py-3.5 px-4">Company</th>}
                {visibleColumns.title && <th className="py-3.5 px-4">Job Title</th>}
                {visibleColumns.status && <th className="py-3.5 px-4">Lifecycle</th>}
                {visibleColumns.lead_score && <th className="py-3.5 px-4">Lead Score</th>}
                {visibleColumns.created_at && <th className="py-3.5 px-4">Added</th>}
                <th className="py-3.5 px-4 text-right">Quick Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <>
                  {[...Array(6)].map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="py-4 px-4"><div className="w-4 h-4 bg-slate-200 rounded" /></td>
                      <td className="py-4 px-4"><div className="w-32 h-4 bg-slate-200 rounded-md" /></td>
                      <td className="py-4 px-4"><div className="w-28 h-4 bg-slate-200 rounded-md" /></td>
                      <td className="py-4 px-4"><div className="w-24 h-4 bg-slate-200 rounded-md" /></td>
                      <td className="py-4 px-4"><div className="w-20 h-4 bg-slate-200 rounded-md" /></td>
                      <td className="py-4 px-4"><div className="w-20 h-4 bg-slate-200 rounded-md" /></td>
                      <td className="py-4 px-4"><div className="w-16 h-4 bg-slate-200 rounded-full" /></td>
                      <td className="py-4 px-4"><div className="w-16 h-4 bg-slate-200 rounded-md" /></td>
                      <td className="py-4 px-4"><div className="w-20 h-4 bg-slate-200 rounded-md" /></td>
                      <td className="py-4 px-4 text-right"><div className="w-12 h-4 bg-slate-200 rounded-md ml-auto" /></td>
                    </tr>
                  ))}
                </>
              )}

              {!isLoading &&
                contactList.map((c) => {
                  const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.phone || c.email || 'Unnamed';
                  const initial = (fullName.trim()[0] || '?').toUpperCase();
                  const isSelected = selectedIds.includes(c.id);
                  const formattedDate =
                    c.created_at && !isNaN(new Date(c.created_at).getTime())
                      ? new Date(c.created_at).toLocaleDateString()
                      : '—';
                  const leadScore = typeof c.lead_score === 'number' ? Math.max(0, Math.min(100, c.lead_score)) : 0;

                  return (
                    <tr
                      key={c.id}
                      className={`hover:bg-slate-50/80 transition cursor-pointer group ${
                        isSelected ? 'bg-indigo-50/50' : ''
                      }`}
                      onClick={() => onSelectContact(c.id)}
                    >
                      <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleToggleSelectRow(c.id)}
                          className="text-slate-400 hover:text-indigo-600"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-indigo-600" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {visibleColumns.name && (
                        <td className="py-3 px-4 font-bold text-slate-900">
                          <div className="flex items-center gap-2.5">
                            <span className="w-7 h-7 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 text-white flex items-center justify-center font-bold text-[10px] shadow-sm">
                              {initial}
                            </span>
                            <div className="truncate max-w-[180px]">
                              <p className="truncate font-semibold text-slate-900 group-hover:text-indigo-600 transition">
                                {fullName}
                              </p>
                              {c.company_name && (
                                <p className="text-[10px] text-slate-400 font-normal truncate">
                                  {c.company_name}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                      )}

                      {visibleColumns.email && (
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 text-slate-700">
                            {renderEmailStatus(c.email_status)}
                            <span className="truncate max-w-[200px]">{c.email || '—'}</span>
                          </div>
                        </td>
                      )}

                      {visibleColumns.phone && (
                        <td className="py-3 px-4 font-mono font-medium text-slate-700">
                          <div className="flex items-center gap-1.5">
                            {c.phone ? (
                              <>
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                <span>{c.phone}</span>
                              </>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </div>
                        </td>
                      )}

                      {visibleColumns.company && (
                        <td className="py-3 px-4 text-slate-700 font-medium truncate max-w-[140px]">
                          {c.company_name || '—'}
                        </td>
                      )}

                      {visibleColumns.title && (
                        <td className="py-3 px-4 text-slate-500 truncate max-w-[140px]">
                          {c.title || '—'}
                        </td>
                      )}

                      {visibleColumns.status && (
                        <td className="py-3 px-4">
                          {renderLifecycleBadge(c.status)}
                        </td>
                      )}

                      {visibleColumns.lead_score && (
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-12 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-1.5 rounded-full ${
                                  leadScore >= 70
                                    ? 'bg-emerald-500'
                                    : leadScore >= 40
                                    ? 'bg-indigo-500'
                                    : 'bg-slate-400'
                                }`}
                                style={{ width: `${leadScore}%` }}
                              />
                            </div>
                            <span className="text-[11px] font-bold text-slate-600">{leadScore}</span>
                          </div>
                        </td>
                      )}

                      {visibleColumns.created_at && (
                        <td className="py-3 px-4 text-slate-400">
                          {formattedDate}
                        </td>
                      )}

                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {c.phone && (
                            <button
                              type="button"
                              onClick={() => onLaunchWhatsApp(c.phone || '')}
                              className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-xl transition shadow-xs"
                              title="Start WhatsApp Chat"
                            >
                              <MessageCircle className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onSelectContact(c.id)}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-xl transition"
                            title="View Contact Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

              {!isLoading && contactList.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-16 text-center">
                    <div className="max-w-sm mx-auto space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto shadow-inner">
                        <Users className="w-6 h-6" />
                      </div>
                      <h4 className="text-sm font-bold text-slate-900">No Contacts Found</h4>
                      <p className="text-xs text-slate-500">
                        {searchTerm || selectedStatus || selectedListId
                          ? 'No contacts match your current active filters.'
                          : 'Your CRM database is ready. Import contacts from CSV or Excel to begin.'}
                      </p>
                      <div className="pt-2 flex items-center justify-center gap-2">
                        {searchTerm || selectedStatus || selectedListId ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSearchTerm('');
                              setSelectedStatus('');
                              setSelectedListId('');
                              loadContacts();
                            }}
                            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                          >
                            Clear Filters
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={onOpenImportWizard}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition"
                          >
                            <FolderPlus className="w-3.5 h-3.5" />
                            Import Contacts
                          </button>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Keyset Cursor Pagination Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/60 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="text-slate-500 font-medium">
            Approximate Database Contacts:{' '}
            <strong className="text-slate-900 font-bold">{totalApprox.toLocaleString()}</strong>
            <span className="ml-2 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-bold">
              Keyset Indexed Pagination
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrevPage}
              disabled={cursorHistory.length === 0 || isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-40 shadow-xs"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Previous
            </button>

            <button
              type="button"
              onClick={handleNextPage}
              disabled={!hasMore || !nextCursor || isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-40 shadow-xs"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
