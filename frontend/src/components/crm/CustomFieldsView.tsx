import React, { useState } from 'react';
import { Sliders, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { crmApi, CrmCustomFieldDefinition } from './crmApi';

interface CustomFieldsViewProps {
  customFields: CrmCustomFieldDefinition[];
  onReload: () => void;
}

export const CustomFieldsView: React.FC<CustomFieldsViewProps> = ({ customFields, onReload }) => {
  const [fieldName, setFieldName] = useState('');
  const [fieldLabel, setFieldLabel] = useState('');
  const [dataType, setDataType] = useState<'text' | 'number' | 'date' | 'boolean' | 'dropdown' | 'multi_select'>('text');
  const [optionsStr, setOptionsStr] = useState('');
  const [isRequired, setIsRequired] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fieldName.trim() || !fieldLabel.trim()) return;

    setIsCreating(true);
    try {
      const options =
        dataType === 'dropdown' || dataType === 'multi_select'
          ? optionsStr.split(',').map((s) => s.trim()).filter(Boolean)
          : undefined;

      const res = await crmApi.createCustomField({
        field_name: fieldName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        field_label: fieldLabel.trim(),
        data_type: dataType,
        options,
        is_required: isRequired
      });

      if (res.success) {
        setFieldName('');
        setFieldLabel('');
        setOptionsStr('');
        setIsRequired(false);
        onReload();
      }
    } catch (err: any) {
      alert(`Failed to create custom field: ${err.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this custom field definition? Contact data in this field will remain in JSONB.')) return;
    try {
      const res = await crmApi.deleteCustomField(id);
      if (res.success) onReload();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Create Form */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Sliders className="w-4 h-4 text-indigo-600" />
          Add Custom Field Definition
        </h3>
        <p className="text-xs text-slate-500">
          Fields are stored inside JSONB and indexed with PostgreSQL GIN index for lightning-fast queries.
        </p>

        <form onSubmit={handleCreate} className="space-y-4 text-xs">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Field Label (Display)</label>
            <input
              type="text"
              required
              value={fieldLabel}
              onChange={(e) => {
                setFieldLabel(e.target.value);
                if (!fieldName) {
                  setFieldName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
                }
              }}
              placeholder="e.g. Annual Revenue, LinkedIn URL"
              className="w-full p-2.5 border border-slate-300 rounded-xl"
            />
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Field Key (API / JSON Identifier)</label>
            <input
              type="text"
              required
              value={fieldName}
              onChange={(e) => setFieldName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
              placeholder="e.g. annual_revenue"
              className="w-full p-2.5 border border-slate-300 rounded-xl font-mono text-[11px]"
            />
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Data Type</label>
            <select
              value={dataType}
              onChange={(e) => setDataType(e.target.value as any)}
              className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-medium"
            >
              <option value="text">Text (String)</option>
              <option value="number">Number (Integer / Decimal)</option>
              <option value="date">Date</option>
              <option value="boolean">Boolean (True / False)</option>
              <option value="dropdown">Dropdown Select</option>
              <option value="multi_select">Multi-Select Array</option>
            </select>
          </div>

          {(dataType === 'dropdown' || dataType === 'multi_select') && (
            <div>
              <label className="font-bold text-slate-700 block mb-1">Options (comma-separated)</label>
              <input
                type="text"
                value={optionsStr}
                onChange={(e) => setOptionsStr(e.target.value)}
                placeholder="Tier 1, Tier 2, Enterprise"
                className="w-full p-2.5 border border-slate-300 rounded-xl"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="req"
              checked={isRequired}
              onChange={(e) => setIsRequired(e.target.checked)}
              className="rounded text-indigo-600"
            />
            <label htmlFor="req" className="font-semibold text-slate-700">
              Required field
            </label>
          </div>

          <button
            type="submit"
            disabled={isCreating}
            className="w-full py-2.5 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition disabled:opacity-50"
          >
            {isCreating ? 'Saving...' : 'Add Custom Field'}
          </button>
        </form>
      </div>

      {/* Field List */}
      <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <span className="text-xs font-bold text-slate-700">Active Custom Field Definitions</span>
          <span className="text-xs text-slate-400 font-semibold">{customFields.length} configured</span>
        </div>

        <div className="divide-y divide-slate-100">
          {customFields.map((cf) => (
            <div key={cf.id} className="p-4 flex items-center justify-between text-xs hover:bg-slate-50">
              <div>
                <div className="font-bold text-slate-900">{cf.field_label}</div>
                <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                  key: <code>{cf.field_name}</code> • type: <span className="text-indigo-600 uppercase font-semibold">{cf.data_type}</span>
                  {cf.options && ` • [${cf.options.join(', ')}]`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(cf.id)}
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}

          {customFields.length === 0 && (
            <div className="p-8 text-center text-xs text-slate-400">
              No custom fields configured yet. Create one on the left to capture custom attributes.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

