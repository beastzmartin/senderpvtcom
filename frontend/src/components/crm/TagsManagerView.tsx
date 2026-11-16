import React, { useState, useEffect } from 'react';
import {
  Tag as TagIcon,
  Plus,
  Trash2,
  GitMerge,
  Sliders,
  Check,
  Zap,
  FolderPlus,
  Layers,
  Sparkles,
  AlertCircle,
  Search,
  Users
} from 'lucide-react';
import { crmApi } from './crmApi';
import {
  Button,
  Badge,
  Input,
  Modal,
  Skeleton,
  EmptyState
} from './ui/CrmDesignSystem';

const PRESET_COLORS = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#6366f1', // Indigo
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#64748b'  // Slate
];

export const TagsManagerView: React.FC = () => {
  const [tags, setTags] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tagSearch, setTagSearch] = useState('');

  // New Tag Form
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#6366f1');
  const [isCreatingTag, setIsCreatingTag] = useState(false);

  // Merge Tags Modal
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [sourceTagId, setSourceTagId] = useState('');
  const [targetTagId, setTargetTagId] = useState('');
  const [isMerging, setIsMerging] = useState(false);

  // Auto Tag Rule Modal
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [ruleName, setRuleName] = useState('');
  const [ruleTrigger, setRuleTrigger] = useState('score_threshold');
  const [conditionVal, setConditionVal] = useState('80');
  const [targetRuleTag, setTargetRuleTag] = useState('VIP Hot');
  const [isSavingRule, setIsSavingRule] = useState(false);

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
    setIsCreatingTag(true);
    try {
      await crmApi.createTag(newTagName.trim(), newTagColor);
      setNewTagName('');
      loadData();
    } catch (err: any) {
      alert(`Error creating tag: ${err.message}`);
    } finally {
      setIsCreatingTag(false);
    }
  };

  const handleDeleteTag = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete tag "${name}"? Contacts will be un-tagged safely.`)) return;
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

    setIsMerging(true);
    try {
      const res = await crmApi.mergeTags(sourceTagId, targetTagId);
      alert(`Successfully merged tags! ${res.affected_contacts || 0} contacts updated.`);
      setIsMergeModalOpen(false);
      setSourceTagId('');
      setTargetTagId('');
      loadData();
    } catch (err: any) {
      alert(`Merge failed: ${err.message}`);
    } finally {
      setIsMerging(false);
    }
  };

  const handleSaveRule = async () => {
    if (!ruleName.trim()) return;
    setIsSavingRule(true);
    try {
      await crmApi.saveAutoTagRule({
        name: ruleName.trim(),
        trigger: ruleTrigger,
        condition_value: { threshold: parseInt(conditionVal, 10) || 80 },
        tag_name: targetRuleTag.trim(),
        is_active: true
      });
      setIsRuleModalOpen(false);
      setRuleName('');
      loadData();
    } catch (err: any) {
      alert(`Error saving rule: ${err.message}`);
    } finally {
      setIsSavingRule(false);
    }
  };

  const filteredTags = tags.filter((t) => t.name.toLowerCase().includes(tagSearch.toLowerCase()));
  const selectedSourceTag = tags.find((t) => t.id === sourceTagId);

  if (loading) {
    return (
      <div className="p-8 space-y-6 max-w-7xl mx-auto">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl col-span-2" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Tag Directory & Automation</h1>
            <Badge variant="indigo" size="sm" dot>
              {tags.length} Workspace Tags
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Organize contacts by source, lifecycle, or campaign. Combine duplicates with 1-click merge.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={<GitMerge className="w-3.5 h-3.5 text-indigo-600" />}
            onClick={() => {
              if (tags.length >= 2) {
                setSourceTagId(tags[0].id);
                setTargetTagId(tags[1].id);
              }
              setIsMergeModalOpen(true);
            }}
          >
            1-Click Merge Tags
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<Zap className="w-3.5 h-3.5" />}
            onClick={() => setIsRuleModalOpen(true)}
          >
            New Auto-Tag Rule
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Create Tag Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 h-fit shadow-sm">
          <div>
            <h3 className="text-base font-bold text-slate-900">Create Workspace Tag</h3>
            <p className="text-xs text-slate-500 mt-0.5">Assign tags manually or trigger them via automation.</p>
          </div>

          <div className="space-y-4">
            <Input
              label="Tag Label"
              placeholder="e.g. Qualified Lead, Enterprise"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
            />

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700">Badge Color Accent</label>
              <div className="flex items-center gap-2 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewTagColor(c)}
                    className={`w-6 h-6 rounded-full transition-transform flex items-center justify-center ${
                      newTagColor === c ? 'scale-110 ring-2 ring-indigo-600 ring-offset-2 ring-offset-white' : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                  >
                    {newTagColor === c && <Check className="w-3.5 h-3.5 text-white" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Live Tag Chip Preview */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Live Preview</span>
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold text-white shadow-sm"
                style={{ backgroundColor: newTagColor }}
              >
                <TagIcon className="w-3 h-3" />
                {newTagName.trim() || 'Sample Tag'}
              </span>
            </div>

            <Button
              variant="primary"
              size="md"
              className="w-full"
              loading={isCreatingTag}
              disabled={!newTagName.trim()}
              onClick={handleCreateTag}
            >
              Add Tag to Directory
            </Button>
          </div>
        </div>

        {/* Tags Directory & Auto-Tagging Rules (2 Cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Tag Directory Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">All Tags Directory</h3>
                <p className="text-xs text-slate-500">Total active tags with contact usage counts.</p>
              </div>
              <div className="relative w-48 sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter tags..."
                  value={tagSearch}
                  onChange={(e) => setTagSearch(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {filteredTags.map((t) => (
                <div
                  key={t.id}
                  className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between hover:border-slate-300 hover:bg-white transition-all shadow-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-3 h-3 rounded-full shrink-0 shadow-sm"
                      style={{ backgroundColor: t.color || '#6366f1' }}
                    />
                    <div>
                      <span className="font-bold text-xs text-slate-900">{t.name}</span>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1 font-mono">
                        <Users className="w-3 h-3 text-slate-400" />
                        {t.usage_count ?? 0} contacts
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteTag(t.id, t.name)}
                    className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              {filteredTags.length === 0 && (
                <div className="col-span-2 py-8 text-center text-slate-400 text-xs">
                  {tagSearch ? 'No matching tags found.' : 'No tags created yet.'}
                </div>
              )}
            </div>
          </div>

          {/* Auto-Tagging Rules Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Automated Tagging Rules</h3>
                <p className="text-xs text-slate-500">Apply tags automatically when contact conditions are met.</p>
              </div>
            </div>

            <div className="space-y-3 pt-1">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between hover:bg-white transition"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span className="font-bold text-xs text-slate-900">{rule.name}</span>
                      <Badge variant="amber" size="xs">
                        {rule.trigger}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      When lead score exceeds threshold → Assign tag <strong>"{rule.tag_name}"</strong>
                    </p>
                  </div>

                  <Badge variant={rule.is_active ? 'emerald' : 'slate'} size="xs" dot>
                    {rule.is_active ? 'Active' : 'Disabled'}
                  </Badge>
                </div>
              ))}

              {rules.length === 0 && (
                <div className="py-6 text-center text-slate-400 text-xs">
                  No auto-tagging rules configured.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. 1-CLICK MERGE TAGS MODAL */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isMergeModalOpen}
        onClose={() => setIsMergeModalOpen(false)}
        title="1-Click Tag Consolidation & Merge"
        maxWidth="md"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600">
            Combine <strong>Source Tag</strong> into <strong>Target Tag</strong>. All contacts with the source tag will automatically be reassigned, and the source tag will be deleted safely.
          </p>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Source Tag (Will be merged and deleted)</label>
              <select
                value={sourceTagId}
                onChange={(e) => setSourceTagId(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              >
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.usage_count ?? 0} contacts)
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Target Tag (Will absorb contacts and remain)</label>
              <select
                value={targetTagId}
                onChange={(e) => setTargetTagId(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              >
                {tags
                  .filter((t) => t.id !== sourceTagId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.usage_count ?? 0} contacts)
                    </option>
                  ))}
              </select>
            </div>

            {selectedSourceTag && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                <span>
                  <strong>{selectedSourceTag.usage_count ?? 0} contacts</strong> will be moved to the target tag.
                </span>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
            <Button variant="ghost" size="sm" onClick={() => setIsMergeModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={isMerging}
              icon={<GitMerge className="w-3.5 h-3.5" />}
              onClick={handleMergeTags}
            >
              Merge & Consolidate
            </Button>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* 4. AUTO-TAG RULE MODAL */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isRuleModalOpen}
        onClose={() => setIsRuleModalOpen(false)}
        title="Create Auto-Tagging Rule"
        maxWidth="md"
      >
        <div className="space-y-4">
          <Input
            label="Rule Name"
            placeholder="e.g. High Score VIP"
            value={ruleName}
            onChange={(e) => setRuleName(e.target.value)}
          />

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">Trigger Event</label>
            <select
              value={ruleTrigger}
              onChange={(e) => setRuleTrigger(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            >
              <option value="score_threshold">When Lead Score Exceeds Threshold</option>
              <option value="new_contact">On Every Newly Created Contact</option>
              <option value="email_verified">When Contact Email is Verified</option>
            </select>
          </div>

          {ruleTrigger === 'score_threshold' && (
            <Input
              label="Minimum Score Threshold"
              type="number"
              value={conditionVal}
              onChange={(e) => setConditionVal(e.target.value)}
            />
          )}

          <Input
            label="Tag Label to Assign"
            placeholder="e.g. VIP Hot"
            value={targetRuleTag}
            onChange={(e) => setTargetRuleTag(e.target.value)}
          />

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
            <Button variant="ghost" size="sm" onClick={() => setIsRuleModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={isSavingRule}
              disabled={!ruleName.trim()}
              onClick={handleSaveRule}
            >
              Save Rule
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
