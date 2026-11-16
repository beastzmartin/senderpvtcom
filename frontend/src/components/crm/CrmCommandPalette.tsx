import React, { useState, useEffect } from 'react';
import {
  Search,
  Users,
  Kanban,
  BarChart3,
  FolderPlus,
  Download,
  Command,
  ArrowRight,
  X
} from 'lucide-react';
import { crmApi, CrmContact } from './crmApi';

interface CrmCommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab: (tab: 'contacts' | 'pipeline' | 'analytics' | 'lists' | 'developer') => void;
  onSelectContact: (contactId: string) => void;
  onOpenImport: () => void;
  onOpenExport: () => void;
}

export const CrmCommandPalette: React.FC<CrmCommandPaletteProps> = ({
  isOpen,
  onClose,
  onNavigateTab,
  onSelectContact,
  onOpenImport,
  onOpenExport
}) => {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CrmContact[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setSearchResults([]);
      return;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await crmApi.fetchContacts({ search: query.trim(), limit: 5 });
        if (res.success && Array.isArray(res.contacts)) {
          setSearchResults(res.contacts);
        }
      } catch (err) {
        console.error('Command palette search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-slate-100 gap-3">
          <Search className="w-5 h-5 text-slate-400" />
          <input
            type="text"
            autoFocus
            placeholder="Type a command or search contacts by name, email, company..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full text-sm text-slate-900 placeholder-slate-400 bg-transparent focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results Body */}
        <div className="max-h-96 overflow-y-auto p-2 space-y-3">
          {/* Contact Search Results */}
          {searchResults.length > 0 && (
            <div>
              <p className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Matching Contacts</p>
              <div className="space-y-1">
                {searchResults.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      onSelectContact(c.id);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left hover:bg-indigo-50/80 transition group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">
                        {(c.first_name?.[0] || 'C').toUpperCase()}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900 group-hover:text-indigo-900">
                          {c.first_name} {c.last_name}
                        </p>
                        <p className="text-[10px] text-slate-500">{c.email || c.phone || 'No email'}</p>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 transition" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick Navigation Commands */}
          <div>
            <p className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Quick Views</p>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => {
                  onNavigateTab('contacts');
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left hover:bg-slate-100 text-xs font-semibold text-slate-800 transition"
              >
                <Users className="w-4 h-4 text-indigo-600" />
                <span>Jump to Contacts Directory</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onNavigateTab('pipeline');
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left hover:bg-slate-100 text-xs font-semibold text-slate-800 transition"
              >
                <Kanban className="w-4 h-4 text-indigo-600" />
                <span>Jump to Sales Pipeline Kanban</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onNavigateTab('analytics');
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left hover:bg-slate-100 text-xs font-semibold text-slate-800 transition"
              >
                <BarChart3 className="w-4 h-4 text-indigo-600" />
                <span>Jump to Funnels & Analytics</span>
              </button>
            </div>
          </div>

          {/* Actions */}
          <div>
            <p className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Actions</p>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => {
                  onOpenImport();
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left hover:bg-slate-100 text-xs font-semibold text-slate-800 transition"
              >
                <FolderPlus className="w-4 h-4 text-emerald-600" />
                <span>Import Contacts CSV / Excel</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onOpenExport();
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left hover:bg-slate-100 text-xs font-semibold text-slate-800 transition"
              >
                <Download className="w-4 h-4 text-purple-600" />
                <span>Export Contacts Stream</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="bg-slate-50 px-4 py-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-medium">
          <span>Press <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-bold">Esc</kbd> to exit</span>
          <span className="flex items-center gap-1"><Command className="w-3 h-3" />+K Command Palette</span>
        </div>
      </div>
    </div>
  );
};

