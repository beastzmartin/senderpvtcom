import React, { useState, useEffect } from 'react';
import {
  Tag,
  Plus,
  Trash2,
  GitMerge,
  Sliders,
  Check,
  Zap,
  FolderPlus,
  Layers,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { crmApi } from './crmApi';

export const TagsManagerView: React.FC = () => {
  const [tags, setTags] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // New Tag
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6');

  // Merge Tags Modal
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [sourceTagId, setSourceTagId] = useState('');
  const [targetTagId, setTargetTagId] = useState('');

  // Auto Tag Rule Form
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [ruleName, setRuleName] = useState('');
  const [ruleTrigger, setRuleTrigger] = useState('score_threshold');
  const [conditionVal, setConditionVal] = useState('80');
  const [targetRuleTag, setTargetRuleTag] = useState('Hot');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tagsRes, groupsRes, rulesRes] = await Promise.all([
        crmApi.listTagsWithCounts(),
        crmApi.listTagGroups(),
        crmApi.listAutoTagRules()
      ]);

      if (tagsRes && tagsRes.success) setTags(tagsRes.tags || []);
      if (groupsRes && groupsRes.success) setGroups(groupsRes.groups || []);
      if (rulesRes && rulesRes.success) setRules(rulesRes.rules || []);
    } catch (err) {
      console.error('Failed to load tags data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      await crmApi.createTag(newTagName.trim(), newTagColor);
      setNewTagName('');
      loadData();
    } catch (err: any) {
      alert(`Error creating tag: ${err.message}`);
    }
  };

  const handleDeleteTag = async (id: string) => {
    if (!confirm('Are you sure you want to delete this tag? Contacts with this tag will retain other tags.')) return;
    try {
      await crmApi.deleteTag(id);
      loadData();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleMergeTags = async () => {
    if (!sourceTagId || !targetTagId || sourceTagId === targetTagId) {
      alert('Please select two distinct tags to merge.');
      return;
    }

    try {
      const res = await crmApi.mergeTags(sourceTagId, targetTagId);
      alert(`Successfully merged tags! ${res.affected_contacts || 0} contacts updated.`);
      setIsMergeModalOpen(false);
      setSourceTagId('');
      setTargetTagId('');
      loadData();
    } catch (err: any) {
      alert(`Merge failed: ${err.message}`);
    }
  };

  const handleCreateRule = async () => {
    if (!ruleName.trim() || !targetRuleTag.trim()) return;
    try {
      await crmApi.saveAutoTagRule({
        name: ruleName,
        trigger: ruleTrigger,
        condition_value: { value: conditionVal },
        tag_name: targetRuleTag,
        is_active: true
      });
      setIsRuleModalOpen(false);
      setRuleName('');
      loadData();
    } catch (err: any) {
      alert(`Failed to save auto-tag rule: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-xs">
            <Tag className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-slate-900 tracking-tight">Tags & Auto-Rules</h2>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700">
                Normalized + Fast Array
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Manage workspace tags, 1-click merge tag consolidation, and auto-tagging triggers
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsMergeModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
          >
            <GitMerge className="w-4 h-4 text-slate-500" />
            Merge Tags
          </button>

          <button
            type="button"
            onClick={() => setIsRuleModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition"
          >
            <Zap className="w-4 h-4" />
            New Auto-Tag Rule
          </button>
        </div>
      </div>

      {/* Add Quick Tag Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={newTagName}
          onChange={(e) => setNewTagName(e.target.value)}
          placeholder="New Tag Name..."
          className="text-xs border border-slate-300 rounded-xl px-3 py-2 font-medium w-64"
        />
        <input
          type="color"
          value={newTagColor}
          onChange={(e) => setNewTagColor(e.target.value)}
          className="w-8 h-8 rounded-xl border border-slate-300 cursor-pointer bg-white"
        />
        <button
          type="button"
          onClick={handleCreateTag}
          className="px-4 py-2 text-xs font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Tag
        </button>
      </div>

      {/* Tags Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {tags.map((t) => (
          <div
            key={t.id}
            className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between group hover:border-indigo-300 transition"
          >
            <div className="flex items-center gap-2.5 truncate">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color || '#3b82f6' }} />
              <div className="truncate">
                <h4 className="text-xs font-bold text-slate-800 truncate">{t.name}</h4>
                <span className="text-[10px] text-slate-400 font-semibold">
                  {t.usage_count || 0} contacts
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleDeleteTag(t.id)}
              className="p-1.5 text-slate-300 hover:text-rose-600 rounded-lg hover:bg-slate-50 opacity-0 group-hover:opacity-100 transition"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Auto Tagging Rules Section */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-200/60 flex items-center justify-between">
          <div>
            <h3 className="font-black text-sm text-slate-900">Active Auto-Tagging Rules</h3>
            <p className="text-xs text-slate-500">Automatically assigns tags when contact criteria match</p>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {rules.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-xs text-slate-900">{r.name}</h4>
                  <p className="text-[11px] text-slate-500">
                    When <span className="font-mono text-slate-700">{r.trigger}</span> matches, add tag{' '}
                    <span className="font-bold text-indigo-700">"{r.tag_name}"</span>
                  </p>
                </div>
              </div>

              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800">
                Active
              </span>
            </div>
          ))}

          {rules.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-6">
              No auto-tag rules configured. Click "New Auto-Tag Rule" to automate tagging based on lead scores.
            </p>
          )}
        </div>
      </div>

      {/* Merge Tags Modal */}
      {isMergeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 border border-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-600 rounded-2xl text-white">
                <GitMerge className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">Consolidate & Merge Tags</h3>
                <p className="text-xs text-slate-500">
                  Merge Source Tag into Target Tag and re-index all affected contacts
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Source Tag (Will be deleted)</label>
                <select
                  value={sourceTagId}
                  onChange={(e) => setSourceTagId(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 font-bold bg-white"
                >
                  <option value="">Select source tag...</option>
                  {tags.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.usage_count || 0} contacts)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Target Tag (Will be retained)</label>
                <select
                  value={targetTagId}
                  onChange={(e) => setTargetTagId(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 font-bold bg-white"
                >
                  <option value="">Select destination tag...</option>
                  {tags.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsMergeModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleMergeTags}
                className="px-5 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700"
              >
                Merge Tags
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto Tag Rule Modal */}
      {isRuleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 border border-slate-200 shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-slate-900">Create Auto-Tagging Rule</h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Rule Name</label>
                <input
                  type="text"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="e.g. Hot Leads Auto-Tag"
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Trigger Condition</label>
                <select
                  value={ruleTrigger}
                  onChange={(e) => setRuleTrigger(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 font-bold bg-white"
                >
                  <option value="score_threshold">Lead Score Greater Than</option>
                  <option value="inactivity_days">Inactivity Days Greater Than</option>
                  <option value="extractor_import">On Extractor Import</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Condition Value</label>
                <input
                  type="text"
                  value={conditionVal}
                  onChange={(e) => setConditionVal(e.target.value)}
                  placeholder="80"
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Tag to Apply</label>
                <input
                  type="text"
                  value={targetRuleTag}
                  onChange={(e) => setTargetRuleTag(e.target.value)}
                  placeholder="Hot"
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 font-medium"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsRuleModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateRule}
                className="px-5 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700"
              >
                Save Rule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

