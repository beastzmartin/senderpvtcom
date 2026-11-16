import React, { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Download,
  Trash2,
  Tag,
  FolderPlus,
  MessageCircle,
  Eye,
  CheckSquare,
  Square,
  RefreshCw,
  Plus,
  ArrowUpDown,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Columns
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
  lists,
  tags,
  customFields,
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
  }, [selectedListId, selectedTagId, sortBy, sortOrder, activeFilter]);

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
        filter_definition: activeFilter
      });

      if (res.success) {
        setContacts(res.contacts);
        setNextCursor(res.next_cursor);
        setPrevCursor(res.prev_cursor);
        setHasMore(res.has_more);
        setTotalApprox(res.total_approx || 0);
      }
    } catch (err: any) {
      console.error('Failed to load contacts:', err);
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

  const handleToggleSelectAllOnPage = () => {
    if (selectedIds.length === contacts.length) {
      setSelectedIds([]);
      setIsAllMatchingSelected(false);
    } else {
      setSelectedIds(contacts.map((c) => c.id));
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
        alert(`Successfully deleted ${res.deleted_count} contacts.`);
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
        alert(`Added ${res.added_count} contacts to list.`);
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
          <span title="Valid email">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 inline" />
          </span>
        );
      case 'invalid':
        return (
          <span title="Invalid email">
            <XCircle className="w-3.5 h-3.5 text-rose-500 inline" />
          </span>
        );
      case 'risky':
        return (
          <span title="Risky email">
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

  return (
    <div className="space-y-4">
      {/* Search and Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-wrap items-center justify-between gap-3">
        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search 100M+ contacts by name, email, phone..."
            className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </form>

        {/* Filter Builder & Saved Lists / Tags */}
        <div className="flex flex-wrap items-center gap-2">
          {/* List Selector */}
          <select
            value={selectedListId}
            onChange={(e) => {
              setSelectedListId(e.target.value);
              setCursorHistory([]);
            }}
            className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700"
          >
            <option value="">All Contacts ({totalApprox.toLocaleString()} approx)</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.cached_count})
              </option>
            ))}
          </select>

          {/* Filter Builder Button */}
          <button
            type="button"
            onClick={onOpenFilterBuilder}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition border ${
              activeFilter && activeFilter.conditions?.length > 0
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
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
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-200 p-2 z-20 space-y-1 text-xs">
                {Object.keys(visibleColumns).map((col) => (
                  <label key={col} className="flex items-center gap-2 p-1.5 hover:bg-slate-50 rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns[col]}
                      onChange={(e) => setVisibleColumns({ ...visibleColumns, [col]: e.target.checked })}
                      className="rounded text-indigo-600"
                    />
                    <span className="capitalize font-medium text-slate-700">{col.replace('_', ' ')}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Import / Export Action Buttons */}
          <button
            type="button"
            onClick={onOpenImportWizard}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition"
          >
            <FolderPlus className="w-3.5 h-3.5" /> Import CSV/Excel
          </button>

          <button
            type="button"
            onClick={onOpenExportModal}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition"
          >
            <Download className="w-3.5 h-3.5" /> Export Stream
          </button>

          <button
            type="button"
            onClick={() => loadContacts()}
            className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 border border-slate-200 transition"
            title="Refresh Contacts"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Bulk Actions Floating Toolbar */}
      {selectedIds.length > 0 && (
        <div className="bg-slate-900 text-white p-3 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-3 text-xs animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3">
            <span className="font-bold bg-indigo-600 px-2.5 py-0.5 rounded-lg">
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
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-semibold transition"
            >
              <FolderPlus className="w-3.5 h-3.5" /> Add to List
            </button>
            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={isBulkActing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold transition"
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
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
              <tr>
                <th className="py-3 px-4 w-10">
                  <button
                    type="button"
                    onClick={handleToggleSelectAllOnPage}
                    className="text-slate-400 hover:text-indigo-600"
                  >
                    {selectedIds.length === contacts.length && contacts.length > 0 ? (
                      <CheckSquare className="w-4 h-4 text-indigo-600" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                {visibleColumns.name && <th className="py-3 px-4">Contact Name</th>}
                {visibleColumns.email && <th className="py-3 px-4">Email</th>}
                {visibleColumns.phone && <th className="py-3 px-4">Phone (E.164)</th>}
                {visibleColumns.company && <th className="py-3 px-4">Company</th>}
                {visibleColumns.title && <th className="py-3 px-4">Title</th>}
                {visibleColumns.status && <th className="py-3 px-4">Lifecycle</th>}
                {visibleColumns.lead_score && <th className="py-3 px-4">Score</th>}
                {visibleColumns.created_at && <th className="py-3 px-4">Added</th>}
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {contacts.map((c) => {
                const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed';
                const isSelected = selectedIds.includes(c.id);

                return (
                  <tr
                    key={c.id}
                    className={`hover:bg-slate-50/70 transition cursor-pointer ${
                      isSelected ? 'bg-indigo-50/40' : ''
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
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-[10px]">
                            {fullName[0]}
                          </span>
                          <span>{fullName}</span>
                        </div>
                      </td>
                    )}

                    {visibleColumns.email && (
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 text-slate-700">
                          {renderEmailStatus(c.email_status)}
                          <span>{c.email || '—'}</span>
                        </div>
                      </td>
                    )}

                    {visibleColumns.phone && (
                      <td className="py-3 px-4 font-mono font-medium text-slate-700">
                        {c.phone || '—'}
                      </td>
                    )}

                    {visibleColumns.company && (
                      <td className="py-3 px-4 text-slate-700 font-medium">
                        {c.company_name || '—'}
                      </td>
                    )}

                    {visibleColumns.title && (
                      <td className="py-3 px-4 text-slate-500">
                        {c.title || '—'}
                      </td>
                    )}

                    {visibleColumns.status && (
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700">
                          {c.status}
                        </span>
                      </td>
                    )}

                    {visibleColumns.lead_score && (
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <div className="w-12 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-indigo-600 h-1.5 rounded-full"
                              style={{ width: `${Math.min(100, c.lead_score)}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-bold text-slate-600">{c.lead_score}</span>
                        </div>
                      </td>
                    )}

                    {visibleColumns.created_at && (
                      <td className="py-3 px-4 text-slate-400">
                        {new Date(c.created_at).toLocaleDateString()}
                      </td>
                    )}

                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {c.phone && (
                          <button
                            type="button"
                            onClick={() => onLaunchWhatsApp(c.phone || '')}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                            title="Open in WhatsApp Sender"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onSelectContact(c.id)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition"
                          title="View Contact Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {contacts.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-slate-400">
                    No contacts found matching your current filter. Click "Import CSV/Excel" to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Keyset Cursor Pagination Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="text-slate-500 font-medium">
            Approx Total Contacts: <strong className="text-slate-900">{totalApprox.toLocaleString()}</strong>
            <span className="ml-2 text-slate-400">(Indexed Partition Keyset Pagination)</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrevPage}
              disabled={cursorHistory.length === 0 || isLoading}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-40"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Previous
            </button>

            <button
              type="button"
              onClick={handleNextPage}
              disabled={!hasMore || !nextCursor || isLoading}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-40"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
