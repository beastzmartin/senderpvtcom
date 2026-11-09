import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { MessageTemplate } from '../../types';
import {
  FileText,
  Plus,
  Search,
  Sparkles,
  Edit2,
  Trash2,
  Copy,
  Check,
  Send,
  Calendar,
  Eye,
  RefreshCw,
  Folder,
  Tag
} from 'lucide-react';

interface TemplatesViewProps {
  onUseInBulkSender?: (templateText: string) => void;
  onUseInScheduler?: (templateId: string, templateText: string) => void;
}

export const TemplatesView: React.FC<TemplatesViewProps> = ({
  onUseInBulkSender,
  onUseInScheduler
}) => {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Modal / Form state for Create & Edit
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState<string>('');
  const [formCategory, setFormCategory] = useState<string>('General');
  const [formContent, setFormContent] = useState<string>('');
  const [spintaxPreview, setSpintaxPreview] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const categories = ['All', 'Announcements', 'Marketing', 'Onboarding', 'Follow-up', 'Reminders', 'General'];

  useEffect(() => {
    loadTemplates();
  }, [categoryFilter, search]);

  const loadTemplates = async () => {
    setIsLoading(true);
    try {
      const res = await api.templates.list(categoryFilter, search);
      setTemplates(res.data || []);
    } catch (err: any) {
      console.error('Failed to load templates:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingId(null);
    setFormName('');
    setFormCategory('General');
    setFormContent('{Hello|Hi|Greetings} {name}! We have an exciting update regarding your account ({lid}). Reference #{random}.');
    setSpintaxPreview('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (tpl: MessageTemplate) => {
    setEditingId(tpl.id);
    setFormName(tpl.name);
    setFormCategory(tpl.category || 'General');
    setFormContent(tpl.content);
    setSpintaxPreview('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formContent.trim()) {
      setFormError('Template name and message content are required.');
      return;
    }

    setIsSaving(true);
    setFormError(null);

    try {
      if (editingId) {
        await api.templates.update(editingId, {
          name: formName.trim(),
          category: formCategory.trim(),
          content: formContent.trim()
        });
      } else {
        await api.templates.create({
          name: formName.trim(),
          category: formCategory.trim(),
          content: formContent.trim()
        });
      }
      setIsModalOpen(false);
      await loadTemplates();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save template');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTemplate = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete template "${name}"?`)) return;
    try {
      await api.templates.delete(id);
      await loadTemplates();
    } catch (err: any) {
      alert(err.message || 'Failed to delete template');
    }
  };

  // Preview Spintax
  const previewContent = (text: string) => {
    let spun = text;
    const spintaxRegex = /\{([^{}|]+\|[^{}]+)\}/g;
    let iterations = 0;
    while (spintaxRegex.test(spun) && iterations < 10) {
      spun = spun.replace(spintaxRegex, (_match, choices) => {
        const parts = choices.split('|');
        return parts[Math.floor(Math.random() * parts.length)];
      });
      iterations++;
    }
    return spun
      .replace(/\{lid\}/gi, '7757465940199@lid')
      .replace(/\{name\}/gi, 'Rahul Sharma')
      .replace(/\{phone\}/gi, '+919876543210')
      .replace(/\{random\}/gi, '9482')
      .replace(/\{time\}/gi, new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
      .replace(/\{date\}/gi, new Date().toLocaleDateString());
  };

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Message Template Library</h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
              Spintax + Dynamic Variables
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Create reusable messages with anti-ban Spintax syntax and dynamic placeholders for instant campaign dispatch.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center gap-2 transition shadow-xs self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Create New Template
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        {/* Categories */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat.toLowerCase())}
              className={`px-3 py-1.5 rounded-xl font-medium transition ${
                categoryFilter === cat.toLowerCase()
                  ? 'bg-purple-600 text-white font-semibold shadow-xs'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-purple-500 shadow-xs"
          />
        </div>
      </div>

      {/* Templates Grid */}
      {isLoading ? (
        <div className="py-16 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
          <RefreshCw className="w-6 h-6 animate-spin text-purple-600" />
          <span className="text-xs">Loading templates...</span>
        </div>
      ) : templates.length === 0 ? (
        <div className="py-16 text-center text-slate-500 bg-white border border-slate-200 rounded-2xl p-8 space-y-3 shadow-xs">
          <FileText className="w-10 h-10 text-slate-400 mx-auto" />
          <p className="text-xs">No message templates found matching your criteria.</p>
          <button
            type="button"
            onClick={openCreateModal}
            className="px-3.5 py-1.5 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 text-xs font-semibold border border-purple-200 transition"
          >
            Create Your First Template
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className="bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-5 space-y-3.5 transition flex flex-col justify-between shadow-xs"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm">{tpl.name}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                      {tpl.category}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEditModal(tpl)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                      title="Edit"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTemplate(tpl.id, tpl.name)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-mono leading-relaxed whitespace-pre-wrap">
                  {tpl.content}
                </div>

                {/* Detected variables */}
                {tpl.variables && tpl.variables.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 text-[10px]">
                    <span className="text-slate-500 font-medium">Variables:</span>
                    {tpl.variables.map((v) => (
                      <span
                        key={v}
                        className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 font-mono"
                      >
                        {`{${v}}`}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyText(tpl.id, tpl.content)}
                  className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 transition"
                >
                  {copiedId === tpl.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedId === tpl.id ? 'Copied' : 'Copy'}
                </button>

                <div className="flex items-center gap-2">
                  {onUseInScheduler && (
                    <button
                      type="button"
                      onClick={() => onUseInScheduler(tpl.id, tpl.content)}
                      className="px-2.5 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-semibold flex items-center gap-1 transition border border-purple-200"
                    >
                      <Calendar className="w-3 h-3 text-purple-600" />
                      Schedule
                    </button>
                  )}

                  {onUseInBulkSender && (
                    <button
                      type="button"
                      onClick={() => onUseInBulkSender(tpl.content)}
                      className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
                    >
                      <Send className="w-3 h-3" />
                      Use in Sender
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Template Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-600" />
                {editingId ? 'Edit Message Template' : 'Create New Message Template'}
              </h4>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-xs px-2"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveTemplate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-800 block mb-1">
                    Template Name
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. VIP Member Notice"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-purple-500 shadow-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-800 block mb-1">
                    Category
                  </label>
                  <input
                    type="text"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    placeholder="e.g. Announcements, Marketing..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-purple-500 shadow-xs"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-800">
                    Message Body (Spintax & Variables Supported)
                  </label>
                  <span className="text-[10px] text-slate-500">{formContent.length} chars</span>
                </div>

                <textarea
                  rows={5}
                  required
                  value={formContent}
                  onChange={(e) => {
                    setFormContent(e.target.value);
                    setSpintaxPreview('');
                  }}
                  placeholder="Type message with {Hello|Hi} and {lid}, {name}, {random}..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 font-mono resize-none focus:outline-none focus:bg-white focus:border-purple-500 shadow-xs"
                />

                {/* Variable insertion buttons */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[11px]">
                  <span className="text-slate-500">Add Tag:</span>
                  {['{lid}', '{name}', '{phone}', '{random}', '{date}', '{time}'].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setFormContent((prev) => `${prev} ${tag}`)}
                      className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-purple-700 border border-slate-200 font-mono text-[10px] transition"
                    >
                      {tag}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setFormContent((prev) => `${prev} {Hello|Hi|Greetings}`)}
                    className="px-2 py-0.5 rounded bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-mono text-[10px] transition"
                  >
                    + Spintax Sample
                  </button>
                </div>
              </div>

              {/* Spintax live preview button */}
              <div className="flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => setSpintaxPreview(previewContent(formContent))}
                  className="text-xs text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Test Live Spintax Variation
                </button>
              </div>

              {spintaxPreview && (
                <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-xs">
                  <span className="text-[10px] uppercase font-bold text-purple-700 block mb-0.5">
                    Live Variation Preview:
                  </span>
                  <p className="text-purple-950 italic">{spintaxPreview}</p>
                </div>
              )}

              {formError && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                  {formError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition"
                >
                  {isSaving ? 'Saving...' : editingId ? 'Update Template' : 'Save Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

