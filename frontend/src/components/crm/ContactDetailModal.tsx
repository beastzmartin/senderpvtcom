import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Building,
  Mail,
  Phone,
  MapPin,
  Calendar,
  MessageCircle,
  Tag,
  Clock,
  Plus,
  Save,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  XCircle,
  Trash2,
  FileText,
  Sparkles,
  Zap,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { CrmContact, CrmActivity, CrmCustomFieldDefinition, crmApi } from './crmApi';

interface ContactDetailModalProps {
  contactId: string | null;
  isOpen: boolean;
  onClose: () => void;
  customFields: CrmCustomFieldDefinition[];
  onContactUpdated: (contact: CrmContact) => void;
  onLaunchWhatsApp?: (phone: string) => void;
}

export const ContactDetailModal: React.FC<ContactDetailModalProps> = ({
  contactId,
  isOpen,
  onClose,
  customFields,
  onContactUpdated,
  onLaunchWhatsApp
}) => {
  const [contact, setContact] = useState<CrmContact | null>(null);
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState<Partial<CrmContact>>({});
  const [newNote, setNewNote] = useState('');
  const [noteType, setNoteType] = useState<'note' | 'call' | 'meeting' | 'whatsapp'>('note');
  const [isAddingNote, setIsAddingNote] = useState(false);

  // CRM V2 Phase 4 & Phase 6 Additions
  const [aiBrief, setAiBrief] = useState<any>(null);
  const [isGeneratingBrief, setIsGeneratingBrief] = useState(false);
  const [smartDraft, setSmartDraft] = useState<string | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [collisions, setCollisions] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen && contactId) {
      loadContactDetails(contactId);

      // Presence collision heartbeat
      crmApi.presenceHeartbeat('contact', contactId).catch(() => {});
      crmApi.getPresenceCollisions('contact', contactId).then(res => {
        if (res?.success && Array.isArray(res.collisions)) {
          setCollisions(res.collisions.filter((c: any) => c.is_collision));
        }
      }).catch(() => {});

      const interval = setInterval(() => {
        crmApi.presenceHeartbeat('contact', contactId).catch(() => {});
        crmApi.getPresenceCollisions('contact', contactId).then(res => {
          if (res?.success && Array.isArray(res.collisions)) {
            setCollisions(res.collisions.filter((c: any) => c.is_collision));
          }
        }).catch(() => {});
      }, 15000);

      return () => {
        clearInterval(interval);
        crmApi.presenceLeave('contact', contactId).catch(() => {});
      };
    } else {
      setContact(null);
      setActivities([]);
      setIsEditing(false);
      setAiBrief(null);
      setSmartDraft(null);
      setCollisions([]);
    }
  }, [isOpen, contactId]);

  const loadContactDetails = async (id: string) => {
    setIsLoading(true);
    try {
      const res = await crmApi.getContact(id);
      if (res.success && res.contact) {
        setContact(res.contact);
        setActivities(res.activities || []);
        setEditFormData({
          first_name: res.contact.first_name || '',
          last_name: res.contact.last_name || '',
          email: res.contact.email || '',
          phone: res.contact.phone || '',
          company_name: res.contact.company_name || '',
          title: res.contact.title || '',
          city: res.contact.city || '',
          country: res.contact.country || '',
          status: res.contact.status || 'lead',
          lead_score: res.contact.lead_score || 0,
          custom_fields: { ...(res.contact.custom_fields || {}) }
        });
      }
    } catch (err) {
      console.error('Failed to load contact details:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !contactId) return null;

  const handleSaveContact = async () => {
    if (!contact) return;
    setIsSaving(true);
    try {
      const res = await crmApi.updateContact(contact.id, editFormData);
      if (res.success && res.contact) {
        setContact(res.contact);
        onContactUpdated(res.contact);
        setIsEditing(false);
      }
    } catch (err: any) {
      alert(`Error updating contact: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact || !newNote.trim()) return;

    setIsAddingNote(true);
    try {
      const res = await crmApi.logActivity(contact.id, {
        type: noteType,
        title: noteType === 'note' ? 'Internal Note' : `${noteType.toUpperCase()} Log`,
        details: { text: newNote.trim() }
      });
      if (res.success && res.activity) {
        setActivities([res.activity, ...activities]);
        setNewNote('');
      }
    } catch (err: any) {
      alert(`Failed to add activity: ${err.message}`);
    } finally {
      setIsAddingNote(false);
    }
  };

  const handleGenerateAiBrief = async () => {
    if (!contact) return;
    setIsGeneratingBrief(true);
    try {
      const res = await crmApi.generateContactBrief(contact.id);
      if (res.success && res.brief) {
        setAiBrief(res.brief);
      }
    } catch (err: any) {
      alert(`AI Brief error: ${err.message}`);
    } finally {
      setIsGeneratingBrief(false);
    }
  };

  const handleSmartCompose = async () => {
    if (!contact) return;
    setIsComposing(true);
    try {
      const res = await crmApi.smartCompose(contact.id, 'whatsapp', 'friendly');
      if (res.success && res.composition) {
        setSmartDraft(res.composition.message);
      }
    } catch (err: any) {
      alert(`AI Compose error: ${err.message}`);
    } finally {
      setIsComposing(false);
    }
  };

  const renderEmailStatusBadge = (status?: string) => {
    switch (status) {
      case 'valid':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" /> Valid Email
          </span>
        );
      case 'invalid':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3 h-3" /> Invalid Email
          </span>
        );
      case 'risky':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertTriangle className="w-3 h-3" /> Risky Email
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200">
            <HelpCircle className="w-3 h-3" /> Unverified
          </span>
        );
    }
  };

  const fullName = [contact?.first_name, contact?.last_name].filter(Boolean).join(' ') || 'Unnamed Contact';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/30 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white h-full w-full max-w-2xl shadow-2xl flex flex-col border-l border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold text-base shadow-sm">
              {contact?.first_name ? contact.first_name[0].toUpperCase() : <User className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">{fullName}</h2>
                {renderEmailStatusBadge(contact?.email_status)}
              </div>
              <p className="text-xs text-slate-500">
                {contact?.title || 'No Title'} {contact?.company_name ? `@ ${contact.company_name}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isEditing ? (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="px-3 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition"
              >
                Edit Contact
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSaveContact}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            )}
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 p-2 rounded-lg hover:bg-slate-100 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50">
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
              Loading contact record...
            </div>
          ) : contact ? (
            <>
              {/* Quick Action Bar */}
              <div className="flex flex-wrap items-center gap-2 p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
                {contact.phone && (
                  <button
                    onClick={() => onLaunchWhatsApp && onLaunchWhatsApp(contact.phone || '')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    Open in WhatsApp Sender
                  </button>
                )}
                {contact.email && (
                  <a
                    href={`mailto:${contact.email}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    Email
                  </a>
                )}
                <div className="ml-auto text-xs font-semibold text-slate-500">
                  Lead Score: <span className="text-indigo-600 font-bold">{contact.lead_score}</span> / 100
                </div>
              </div>

              {/* Real-time Collision Presence Alert */}
              {collisions.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>
                    Active Collision Warning: {collisions.length} other team member(s) currently viewing or editing this record.
                  </span>
                </div>
              )}

              {/* AI Executive Brief & Next Best Action */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      AI Executive Brief &amp; NBA
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSmartCompose}
                      disabled={isComposing}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition flex items-center gap-1.5"
                    >
                      {isComposing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <MessageCircle className="w-3 h-3" />}
                      Smart Compose
                    </button>
                    <button
                      type="button"
                      onClick={handleGenerateAiBrief}
                      disabled={isGeneratingBrief}
                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                    >
                      {isGeneratingBrief ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      {aiBrief ? 'Regenerate Brief' : 'Generate AI Brief'}
                    </button>
                  </div>
                </div>

                {aiBrief ? (
                  <div className="space-y-2 text-xs">
                    <p className="text-slate-700 leading-relaxed font-medium">{aiBrief.summary}</p>
                    {aiBrief.highlights?.length > 0 && (
                      <ul className="list-disc list-inside text-slate-600 space-y-0.5">
                        {aiBrief.highlights.map((h: string, i: number) => (
                          <li key={i}>{h}</li>
                        ))}
                      </ul>
                    )}
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Sentiment: {aiBrief.sentiment}
                      </span>
                      <span className="text-[11px] font-bold text-amber-600 flex items-center gap-1">
                        <Zap className="w-3.5 h-3.5 text-amber-500" />
                        Next Best Action: {aiBrief.next_best_action}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    Click Generate AI Brief to synthesize contact activity history, deals, and engagement into an instant executive summary and Next Best Action.
                  </p>
                )}

                {smartDraft && (
                  <div className="mt-3 p-3 bg-indigo-50 border border-indigo-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-indigo-700 font-bold">
                      <span>Tailored WhatsApp Draft:</span>
                      {contact.phone && onLaunchWhatsApp && (
                        <button
                          type="button"
                          onClick={() => onLaunchWhatsApp(contact.phone || '')}
                          className="text-emerald-600 hover:underline flex items-center gap-1"
                        >
                          Send via WhatsApp <Zap className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-slate-700 whitespace-pre-wrap">{smartDraft}</p>
                  </div>
                )}
              </div>

              {/* Contact Profile Grid */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Core Attributes</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-slate-500 text-xs uppercase tracking-wide font-semibold">First Name</label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editFormData.first_name || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, first_name: e.target.value })}
                        className="w-full mt-1 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      />
                    ) : (
                      <p className="text-sm font-medium text-slate-900 mt-0.5">{contact.first_name || '—'}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-slate-500 text-xs uppercase tracking-wide font-semibold">Last Name</label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editFormData.last_name || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, last_name: e.target.value })}
                        className="w-full mt-1 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      />
                    ) : (
                      <p className="text-sm font-medium text-slate-900 mt-0.5">{contact.last_name || '—'}</p>
                    )}
                  </div>

                  <div>
                    <label className="text-slate-500 text-xs uppercase tracking-wide font-semibold">Email Address</label>
                    {isEditing ? (
                      <input
                        type="email"
                        value={editFormData.email || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                        className="w-full mt-1 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      />
                    ) : (
                      <p className="text-sm font-medium text-slate-900 mt-0.5">{contact.email || '—'}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-slate-500 text-xs uppercase tracking-wide font-semibold">Phone (E.164)</label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editFormData.phone || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                        className="w-full mt-1 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      />
                    ) : (
                      <p className="text-sm font-medium text-slate-900 mt-0.5">{contact.phone || '—'}</p>
                    )}
                  </div>

                  <div>
                    <label className="text-slate-500 text-xs uppercase tracking-wide font-semibold">Company</label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editFormData.company_name || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, company_name: e.target.value })}
                        className="w-full mt-1 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      />
                    ) : (
                      <p className="text-sm font-medium text-slate-900 mt-0.5">{contact.company_name || '—'}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-slate-500 text-xs uppercase tracking-wide font-semibold">Designation / Title</label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editFormData.title || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                        className="w-full mt-1 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      />
                    ) : (
                      <p className="text-sm font-medium text-slate-900 mt-0.5">{contact.title || '—'}</p>
                    )}
                  </div>

                  <div>
                    <label className="text-slate-500 text-xs uppercase tracking-wide font-semibold">Lifecycle Status</label>
                    {isEditing ? (
                      <select
                        value={editFormData.status || 'lead'}
                        onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value as any })}
                        className="w-full mt-1 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      >
                        <option value="lead">Lead</option>
                        <option value="prospect">Prospect</option>
                        <option value="customer">Customer</option>
                        <option value="churned">Churned</option>
                        <option value="unqualified">Unqualified</option>
                      </select>
                    ) : (
                      <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {contact.status}
                      </span>
                    )}
                  </div>
                  <div>
                    <label className="text-slate-500 text-xs uppercase tracking-wide font-semibold">Location</label>
                    <p className="text-sm font-medium text-slate-900 mt-0.5">
                      {[contact.city, contact.country].filter(Boolean).join(', ') || '—'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Custom Fields Section */}
              {customFields.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Custom Attributes</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {customFields.map((cf) => {
                      const val = (contact.custom_fields || {})[cf.field_name];
                      return (
                        <div key={cf.id}>
                          <label className="text-slate-500 text-xs uppercase tracking-wide font-semibold">{cf.field_label}</label>
                          {isEditing ? (
                            <input
                              type="text"
                              value={editFormData.custom_fields?.[cf.field_name] ?? ''}
                              onChange={(e) =>
                                setEditFormData({
                                  ...editFormData,
                                  custom_fields: {
                                    ...(editFormData.custom_fields || {}),
                                    [cf.field_name]: e.target.value
                                  }
                                })
                              }
                              className="w-full mt-1 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                            />
                          ) : (
                            <p className="text-sm font-medium text-slate-900 mt-0.5">{String(val ?? '—')}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Activity Timeline */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Activity &amp; Notes Timeline
                  </h3>
                  <span className="text-xs text-slate-400">{activities.length} interactions logged</span>
                </div>

                {/* Add Note Input Form */}
                <form onSubmit={handleAddActivity} className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="flex items-center gap-2">
                    <select
                      value={noteType}
                      onChange={(e) => setNoteType(e.target.value as any)}
                      className="text-xs font-semibold bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    >
                      <option value="note">Internal Note</option>
                      <option value="call">Call Log</option>
                      <option value="meeting">Meeting</option>
                      <option value="whatsapp">WhatsApp Interaction</option>
                    </select>
                  </div>
                  <textarea
                    rows={2}
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Type interaction notes, call outcome, or follow-up details..."
                    className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isAddingNote || !newNote.trim()}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition disabled:opacity-50"
                    >
                      {isAddingNote ? 'Logging...' : 'Post Activity'}
                    </button>
                  </div>
                </form>

                {/* Timeline Items */}
                <div className="space-y-3">
                  {activities.map((act) => (
                    <div
                      key={act.id}
                      className="p-3 bg-white rounded-xl border border-slate-200 hover:border-slate-300 shadow-sm transition space-y-1"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-800 capitalize flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-indigo-500" />
                          {act.title}
                        </span>
                        <span className="text-slate-400">{new Date(act.created_at).toLocaleString()}</span>
                      </div>
                      <p className="text-xs text-slate-600 whitespace-pre-wrap">
                        {act.details?.text || JSON.stringify(act.details)}
                      </p>
                    </div>
                  ))}

                  {activities.length === 0 && (
                    <div className="text-center py-6 text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl bg-slate-50">
                      No interactions recorded for this contact yet.
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-20 text-slate-400 text-sm">Contact not found.</div>
          )}
        </div>
      </div>
    </div>
  );
};
