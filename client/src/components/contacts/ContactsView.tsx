import React, { useEffect, useState, useCallback } from 'react';
import { Contact } from '../../types';
import { api } from '../../services/api';
import { ContactFormModal } from './ContactFormModal';
import { CsvImportModal } from './CsvImportModal';
import {
  Users,
  Search,
  Plus,
  FileSpreadsheet,
  Phone,
  Hash,
  MessageSquare,
  Edit2,
  Trash2,
  Copy,
  Check,
  RefreshCw
} from 'lucide-react';

interface ContactsViewProps {
  onStartChatWithContact: (contact: Contact) => void;
}

export const ContactsView: React.FC<ContactsViewProps> = ({ onStartChatWithContact }) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  // Modals state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [contactToEdit, setContactToEdit] = useState<Contact | null>(null);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.contacts.list(searchTerm);
      setContacts(res.data);
    } catch (err) {
      console.error('[Contacts] Failed to fetch contacts:', err);
    } finally {
      setLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchContacts();
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchContacts]);

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete contact "${name}"?`)) {
      return;
    }

    try {
      await api.contacts.delete(id);
      fetchContacts();
    } catch (err: any) {
      alert(err.message || 'Failed to delete contact.');
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Contacts Directory</h2>
          <p className="text-xs text-slate-500">
            Manage recipient phone numbers, WhatsApp LIDs, and import contact lists
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsCsvModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition border border-slate-200 shadow-xs"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            Import CSV
          </button>

          <button
            type="button"
            onClick={() => {
              setContactToEdit(null);
              setIsFormOpen(true);
            }}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
          >
            <Plus className="w-4 h-4" />
            Add Contact
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search contacts by name, phone or LID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 shadow-xs"
          />
        </div>

        <span className="text-xs text-slate-500 font-medium whitespace-nowrap">
          {contacts.length} {contacts.length === 1 ? 'contact' : 'contacts'}
        </span>
      </div>

      {/* Contacts Grid */}
      {loading ? (
        <div className="py-16 flex flex-col items-center justify-center text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin mb-2 text-emerald-600" />
          <span className="text-xs">Loading contacts...</span>
        </div>
      ) : contacts.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl py-16 flex flex-col items-center justify-center text-center p-6 shadow-xs">
          <Users className="w-12 h-12 text-slate-400 mb-3 stroke-1" />
          <h4 className="text-sm font-semibold text-slate-800 mb-1">No contacts found</h4>
          <p className="text-xs text-slate-500 max-w-sm mb-4">
            {searchTerm
              ? `No contacts matched "${searchTerm}". Try a different query.`
              : 'Add your first WhatsApp contact or import a CSV file to get started.'}
          </p>
          <button
            type="button"
            onClick={() => {
              setContactToEdit(null);
              setIsFormOpen(true);
            }}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition shadow-xs"
          >
            Create First Contact
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className="bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-5 shadow-xs transition flex flex-col justify-between"
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white font-bold text-sm shadow-xs">
                      {contact.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 tracking-tight">{contact.name}</h4>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {contact.phone_number && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            PHONE
                          </span>
                        )}
                        {contact.lid && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                            LID
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setContactToEdit(contact);
                        setIsFormOpen(true);
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                      title="Edit contact"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(contact.id, contact.name)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                      title="Delete contact"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Identifiers */}
                <div className="space-y-2 text-xs py-2 border-t border-slate-100">
                  {contact.phone_number && (
                    <div className="flex items-center justify-between bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 shadow-xs">
                      <div className="flex items-center gap-2 truncate">
                        <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="font-mono text-slate-800 font-semibold truncate">{contact.phone_number}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(contact.phone_number!, `phone_${contact.id}`)}
                        className="text-slate-400 hover:text-slate-700 p-1"
                        title="Copy phone"
                      >
                        {copiedId === `phone_${contact.id}` ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  )}

                  {contact.lid && (
                    <div className="flex items-center justify-between bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 shadow-xs">
                      <div className="flex items-center gap-2 truncate">
                        <Hash className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                        <span className="font-mono text-[11px] text-sky-700 truncate">{contact.lid}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(contact.lid!, `lid_${contact.id}`)}
                        className="text-slate-400 hover:text-slate-700 p-1"
                        title="Copy LID"
                      >
                        {copiedId === `lid_${contact.id}` ? (
                          <Check className="w-3.5 h-3.5 text-sky-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  )}

                  {contact.notes && (
                    <p className="text-[11px] text-slate-500 italic pt-1 line-clamp-2">
                      &quot;{contact.notes}&quot;
                    </p>
                  )}
                </div>
              </div>

              {/* Chat action button */}
              <div className="pt-3 border-t border-slate-100 mt-3">
                <button
                  type="button"
                  onClick={() => onStartChatWithContact(contact)}
                  className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-emerald-600 text-slate-700 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Chat with Contact
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      <ContactFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setContactToEdit(null);
        }}
        contactToEdit={contactToEdit}
        onSaved={fetchContacts}
      />

      {/* CSV Import Modal */}
      <CsvImportModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        onImportComplete={fetchContacts}
      />
    </div>
  );
};

