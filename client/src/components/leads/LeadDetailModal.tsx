import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { LeadRecord, LeadStatus, LeadNoteItem } from '../../types';
import {
  X,
  Building2,
  Phone,
  Mail,
  Globe,
  MapPin,
  Star,
  ExternalLink,
  Tag,
  Plus,
  MessageSquare,
  Sparkles,
  Trash2,
  Save,
  Check,
  Send,
  Linkedin,
  Facebook,
  Instagram,
  Twitter,
  Youtube,
  Github
} from 'lucide-react';

interface LeadDetailModalProps {
  leadId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onLeadUpdated?: (lead: LeadRecord) => void;
  onLeadDeleted?: (leadId: string) => void;
  onStartWhatsAppChat?: (phone: string, businessName: string) => void;
}

export const LeadDetailModal: React.FC<LeadDetailModalProps> = ({
  leadId,
  isOpen,
  onClose,
  onLeadUpdated,
  onLeadDeleted,
  onStartWhatsAppChat
}) => {
  const [lead, setLead] = useState<LeadRecord | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isEnriching, setIsEnriching] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<LeadNoteItem[]>([]);
  const [newNoteContent, setNewNoteContent] = useState<string>('');
  const [availableTags, setAvailableTags] = useState<Array<{ id: string; name: string; color: string }>>([]);
  const [isAddingTag, setIsAddingTag] = useState<boolean>(false);
  const [newTagName, setNewTagName] = useState<string>('');

  // Form edit state
  const [formData, setFormData] = useState<Partial<LeadRecord>>({});

  useEffect(() => {
    if (isOpen && leadId) {
      loadLeadDetails(leadId);
    }
  }, [isOpen, leadId]);

  const loadLeadDetails = async (id: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const [fetchedLead, fetchedNotes, fetchedTags] = await Promise.all([
        api.leads.getById(id),
        api.leads.listNotes(id),
        api.leads.listTags()
      ]);

      setLead(fetchedLead);
      setFormData(fetchedLead);
      setNotes(fetchedNotes);
      setAvailableTags(fetchedTags);
    } catch (err: any) {
      setError(err.message || 'Failed to load lead details.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!lead) return;
    try {
      setIsSaving(true);
      const updated = await api.leads.update(lead.id, formData);
      setLead(updated);
      setFormData(updated);
      onLeadUpdated?.(updated);
    } catch (err: any) {
      setError(err.message || 'Failed to save changes.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEnrich = async () => {
    if (!lead) return;
    try {
      setIsEnriching(true);
      const enriched = await api.leads.enrich(lead.id);
      setLead(enriched);
      setFormData(enriched);
      onLeadUpdated?.(enriched);
    } catch (err: any) {
      setError(err.message || 'Enrichment failed.');
    } finally {
      setIsEnriching(false);
    }
  };

  const handleDelete = async () => {
    if (!lead || !window.confirm(`Are you sure you want to delete "${lead.business_name}"?`)) return;
    try {
      await api.leads.delete(lead.id);
      onLeadDeleted?.(lead.id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to delete lead.');
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lead || !newNoteContent.trim()) return;
    try {
      const created = await api.leads.addNote(lead.id, newNoteContent.trim());
      setNotes([created, ...notes]);
      setNewNoteContent('');
    } catch (err: any) {
      setError(err.message || 'Failed to add note.');
    }
  };

  const handleAssignTag = async (tagId: string) => {
    if (!lead) return;
    try {
      await api.leads.tagLead(lead.id, tagId);
      loadLeadDetails(lead.id);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    if (!lead) return;
    try {
      await api.leads.untagLead(lead.id, tagId);
      loadLeadDetails(lead.id);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      const tag = await api.leads.createTag(newTagName.trim(), '#10b981');
      setAvailableTags([...availableTags, tag]);
      if (lead) await handleAssignTag(tag.id);
      setNewTagName('');
      setIsAddingTag(false);
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (!isOpen) return null;

  const statusOptions: Array<{ value: LeadStatus; label: string; color: string }> = [
    { value: 'new', label: 'New Lead', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    { value: 'contacted', label: 'Contacted', color: 'bg-amber-50 text-amber-700 border-amber-200' },
    { value: 'qualified', label: 'Qualified', color: 'bg-purple-50 text-purple-700 border-purple-200' },
    { value: 'interested', label: 'Interested', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    { value: 'converted', label: 'Converted', color: 'bg-teal-50 text-teal-800 border-teal-200' },
    { value: 'not_interested', label: 'Not Interested', color: 'bg-slate-100 text-slate-600 border-slate-200' },
    { value: 'archived', label: 'Archived', color: 'bg-rose-50 text-rose-700 border-rose-200' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-emerald-500 flex items-center justify-center text-white shadow-md shadow-emerald-950/10 shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 truncate">
                {isLoading ? 'Loading Lead...' : lead?.business_name || 'Lead Details'}
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-slate-500">{lead?.category || 'Business Lead'}</span>
                <span className="text-slate-300">•</span>
                <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  Source: {lead?.source.replace(/_/g, ' ') || 'Google Maps'}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="py-16 text-center text-slate-400 text-xs font-semibold">Loading lead details...</div>
          ) : lead ? (
            <>
              {/* Top Quick Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-50 border border-slate-100 rounded-xl">
                {/* Pipeline Status Selector */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Status:</span>
                  <select
                    value={formData.status || 'new'}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as LeadStatus })}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-800 shadow-sm outline-none focus:border-emerald-500"
                  >
                    {statusOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  {/* WhatsApp Quick Chat */}
                  {lead.phone && (
                    <button
                      onClick={() => onStartWhatsAppChat?.(lead.phone!, lead.business_name)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5 shadow-sm shadow-emerald-950/10"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      Chat on WhatsApp
                    </button>
                  )}

                  {/* Enrich Lead */}
                  <button
                    onClick={handleEnrich}
                    disabled={isEnriching}
                    className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold transition flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    {isEnriching ? 'Enriching...' : 'Enrich Lead'}
                  </button>
                </div>
              </div>

              {/* Form Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1 block">Business Name</label>
                  <input
                    type="text"
                    value={formData.business_name || ''}
                    onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1 block">Category / Subtitle</label>
                  <input
                    type="text"
                    value={formData.category || ''}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-emerald-600" /> Phone Number
                  </label>
                  <input
                    type="text"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+1 555-0199"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-blue-600" /> Business Email
                  </label>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="contact@company.com"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-indigo-600" /> Website URL
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="url"
                      value={formData.website || ''}
                      onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                      placeholder="https://company.com"
                      className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-emerald-500"
                    />
                    {formData.website && (
                      <a
                        href={formData.website}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl flex items-center justify-center transition"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Star className="w-3.5 h-3.5 text-amber-500" /> Rating & Reviews
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="5"
                      value={formData.rating !== null && formData.rating !== undefined ? formData.rating : ''}
                      onChange={(e) => setFormData({ ...formData, rating: parseFloat(e.target.value) || null })}
                      placeholder="Rating (4.8)"
                      className="w-1/2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-emerald-500"
                    />
                    <input
                      type="number"
                      min="0"
                      value={formData.reviews_count || ''}
                      onChange={(e) => setFormData({ ...formData, reviews_count: parseInt(e.target.value, 10) || 0 })}
                      placeholder="Reviews (120)"
                      className="w-1/2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-rose-600" /> Business Address
                  </label>
                  <input
                    type="text"
                    value={formData.address || ''}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Full physical street address..."
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Tags Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-slate-500" /> Assigned Tags
                  </label>
                  {!isAddingTag && (
                    <button
                      onClick={() => setIsAddingTag(true)}
                      className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Tag
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {(lead.tags || []).length === 0 && !isAddingTag && (
                    <span className="text-xs text-slate-400">No tags assigned.</span>
                  )}
                  {(lead.tags || []).map((t) => (
                    <span
                      key={t.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200"
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }}></span>
                      {t.name}
                      <button
                        onClick={() => handleRemoveTag(t.id)}
                        className="text-slate-400 hover:text-slate-700 ml-0.5"
                      >
                        ×
                      </button>
                    </span>
                  ))}

                  {isAddingTag && (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        placeholder="Tag name..."
                        className="px-2 py-1 text-xs border border-slate-200 rounded-lg outline-none focus:border-emerald-500"
                      />
                      <button
                        onClick={handleCreateTag}
                        className="px-2 py-1 bg-emerald-600 text-white rounded-lg text-xs font-semibold"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setIsAddingTag(false)}
                        className="px-2 py-1 text-xs text-slate-500 hover:text-slate-800"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes Stream */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                  Prospecting Notes & Activity Log
                </label>

                <form onSubmit={handleAddNote} className="flex gap-2">
                  <input
                    type="text"
                    value={newNoteContent}
                    onChange={(e) => setNewNoteContent(e.target.value)}
                    placeholder="Add an internal note or outreach memo..."
                    className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="submit"
                    disabled={!newNoteContent.trim()}
                    className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" /> Add
                  </button>
                </form>

                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {notes.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No notes recorded for this lead yet.</p>
                  ) : (
                    notes.map((n) => (
                      <div key={n.id} className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs">
                        <p className="text-slate-800 font-medium">{n.content}</p>
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          {new Date(n.created_at).toLocaleString()}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 flex items-center justify-between bg-slate-50/70">
          <button
            onClick={handleDelete}
            className="px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-semibold transition flex items-center gap-1.5"
          >
            <Trash2 className="w-4 h-4" />
            Delete Lead
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shadow-sm shadow-emerald-950/10"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

