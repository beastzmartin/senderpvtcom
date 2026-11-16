import React, { useState } from 'react';
import { X, Check, Sliders, Palette, Move, Plus, Trash2, Layout, Layers } from 'lucide-react';

interface CardActionButton {
  id: string;
  type: string;
  label: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
}

interface CardLayoutConfig {
  visible_fields: string[];
  field_order: string[];
  card_size: 'compact' | 'standard' | 'expanded';
  card_color_field?: string;
  card_accent_color?: string;
  action_buttons: CardActionButton[];
  show_avatar: boolean;
  show_tags: boolean;
  show_score: boolean;
  show_owner: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  boardName: string;
  layout: CardLayoutConfig;
  availableFields: Array<{ slug: string; name: string; field_type: string }>;
  onSave: (layout: CardLayoutConfig) => Promise<void>;
}

export const CardLayoutDesignerModal: React.FC<Props> = ({
  isOpen,
  onClose,
  boardName,
  layout,
  availableFields,
  onSave
}) => {
  const [currentLayout, setCurrentLayout] = useState<CardLayoutConfig>({
    visible_fields: layout?.visible_fields || ['email', 'phone', 'lead_score'],
    field_order: layout?.field_order || ['email', 'phone', 'lead_score'],
    card_size: layout?.card_size || 'standard',
    action_buttons: layout?.action_buttons || [
      { id: 'btn_chat', type: 'open_chat', label: 'Chat', color: '#25D366', size: 'sm' },
      { id: 'btn_move', type: 'move_chat', label: 'Move', color: '#4f46e5', size: 'sm' },
      { id: 'btn_task', type: 'create_task', label: 'Task', color: '#64748b', size: 'sm' }
    ],
    show_avatar: layout?.show_avatar ?? true,
    show_tags: layout?.show_tags ?? true,
    show_score: layout?.show_score ?? true,
    show_owner: layout?.show_owner ?? true,
    card_accent_color: layout?.card_accent_color || '#4f46e5'
  });

  const [saving, setSaving] = useState(false);
  const [newBtnType, setNewBtnType] = useState('call');
  const [newBtnLabel, setNewBtnLabel] = useState('Call');
  const [newBtnColor, setNewBtnColor] = useState('#0284c7');

  if (!isOpen) return null;

  const toggleField = (slug: string) => {
    setCurrentLayout((prev) => {
      const exists = prev.visible_fields.includes(slug);
      const nextVisible = exists
        ? prev.visible_fields.filter((f) => f !== slug)
        : [...prev.visible_fields, slug];
      return { ...prev, visible_fields: nextVisible };
    });
  };

  const addActionButton = () => {
    const btn: CardActionButton = {
      id: `btn_${Date.now()}`,
      type: newBtnType,
      label: newBtnLabel,
      color: newBtnColor,
      size: 'sm'
    };
    setCurrentLayout((prev) => ({
      ...prev,
      action_buttons: [...prev.action_buttons, btn]
    }));
  };

  const removeActionButton = (id: string) => {
    setCurrentLayout((prev) => ({
      ...prev,
      action_buttons: prev.action_buttons.filter((b) => b.id !== id)
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(currentLayout);
      onClose();
    } catch (e: any) {
      alert(`Failed to save layout: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600 rounded-2xl">
              <Layout className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight">Card Layout Designer</h2>
              <p className="text-xs text-slate-400">Configure visual appearance for cards on "{boardName}"</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
          {/* Card Sizing */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
              Card Density & Size
            </label>
            <div className="grid grid-cols-3 gap-3">
              {(['compact', 'standard', 'expanded'] as const).map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setCurrentLayout((p) => ({ ...p, card_size: size }))}
                  className={`p-3 rounded-2xl border text-center font-bold capitalize transition ${
                    currentLayout.card_size === size
                      ? 'border-indigo-600 bg-indigo-50/80 text-indigo-700 shadow-xs'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Badges Toggle */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
              Card Badges & Elements
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-2xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={currentLayout.show_avatar}
                  onChange={(e) => setCurrentLayout((p) => ({ ...p, show_avatar: e.target.checked }))}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <span className="font-semibold text-slate-700">Show Contact Avatar</span>
              </label>

              <label className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-2xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={currentLayout.show_tags}
                  onChange={(e) => setCurrentLayout((p) => ({ ...p, show_tags: e.target.checked }))}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <span className="font-semibold text-slate-700">Show Contact Tags</span>
              </label>

              <label className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-2xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={currentLayout.show_score}
                  onChange={(e) => setCurrentLayout((p) => ({ ...p, show_score: e.target.checked }))}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <span className="font-semibold text-slate-700">Show Lead Score</span>
              </label>

              <label className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-2xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={currentLayout.show_owner}
                  onChange={(e) => setCurrentLayout((p) => ({ ...p, show_owner: e.target.checked }))}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <span className="font-semibold text-slate-700">Show Card Owner</span>
              </label>
            </div>
          </div>

          {/* Visible Super Fields */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
              Select Visible Super Fields
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-3 bg-slate-50 rounded-2xl border border-slate-200">
              {availableFields.map((f) => {
                const isSelected = currentLayout.visible_fields.includes(f.slug);
                return (
                  <button
                    key={f.slug}
                    type="button"
                    onClick={() => toggleField(f.slug)}
                    className={`flex items-center justify-between p-2.5 rounded-xl text-left border text-xs font-semibold transition ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span className="truncate">{f.name}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 shrink-0 ml-1" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action Buttons Builder */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
              Card Quick Action Buttons
            </label>
            <div className="space-y-2 mb-3">
              {currentLayout.action_buttons.map((btn) => (
                <div
                  key={btn.id}
                  className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-2xl"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: btn.color || '#4f46e5' }}
                    />
                    <span className="font-bold text-slate-800 text-xs">{btn.label}</span>
                    <span className="text-[10px] text-slate-400 bg-white px-2 py-0.5 rounded-md border border-slate-200 uppercase font-mono">
                      {btn.type}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeActionButton(btn.id)}
                    className="text-slate-400 hover:text-rose-600 p-1 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add Action Button Form */}
            <div className="flex flex-wrap items-center gap-2 p-3 bg-slate-100 rounded-2xl border border-slate-200/60">
              <select
                value={newBtnType}
                onChange={(e) => {
                  setNewBtnType(e.target.value);
                  const labels: Record<string, string> = {
                    open_chat: 'Chat',
                    move_chat: 'Move',
                    call: 'Call',
                    send_template: 'Template',
                    add_note: 'Note',
                    create_task: 'Task',
                    run_automation: 'Automate',
                    webhook: 'Webhook'
                  };
                  setNewBtnLabel(labels[e.target.value] || 'Action');
                }}
                className="text-xs bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 font-medium"
              >
                <option value="open_chat">Open Chat</option>
                <option value="move_chat">Move Chat (Picker)</option>
                <option value="call">Call Phone</option>
                <option value="send_template">Send Template</option>
                <option value="add_note">Add Note</option>
                <option value="create_task">Create Task</option>
                <option value="run_automation">Run Automation</option>
                <option value="webhook">Custom Webhook</option>
              </select>

              <input
                type="text"
                value={newBtnLabel}
                onChange={(e) => setNewBtnLabel(e.target.value)}
                placeholder="Button Label"
                className="text-xs bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 font-medium w-28"
              />

              <input
                type="color"
                value={newBtnColor}
                onChange={(e) => setNewBtnColor(e.target.value)}
                className="w-8 h-8 rounded-xl border border-slate-300 cursor-pointer bg-white"
              />

              <button
                type="button"
                onClick={addActionButton}
                className="flex items-center gap-1 text-xs bg-indigo-600 text-white font-bold px-3 py-1.5 rounded-xl hover:bg-indigo-700 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Button
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 shadow-sm transition disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
            {saving ? 'Saving...' : 'Apply Layout'}
          </button>
        </div>
      </div>
    </div>
  );
};

