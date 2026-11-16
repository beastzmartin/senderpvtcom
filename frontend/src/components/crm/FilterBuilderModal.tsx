import React, { useState } from 'react';
import { X, Plus, Trash2, Filter, Layers } from 'lucide-react';
import { CrmCustomFieldDefinition } from './crmApi';

interface FilterCondition {
  field: string;
  operator: 'eq' | 'neq' | 'contains' | 'starts_with' | 'gt' | 'gte' | 'lt' | 'lte' | 'is_null' | 'is_not_null';
  value?: any;
}

interface FilterGroup {
  conjunction: 'AND' | 'OR';
  conditions: FilterCondition[];
}

interface FilterBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  customFields: CrmCustomFieldDefinition[];
  initialFilter?: FilterGroup;
  onApply: (filter: FilterGroup) => void;
}

const STANDARD_FIELDS = [
  { label: 'First Name', value: 'first_name', type: 'string' },
  { label: 'Last Name', value: 'last_name', type: 'string' },
  { label: 'Email', value: 'email', type: 'string' },
  { label: 'Phone', value: 'phone', type: 'string' },
  { label: 'Company Name', value: 'company_name', type: 'string' },
  { label: 'Title / Designation', value: 'title', type: 'string' },
  { label: 'Country', value: 'country', type: 'string' },
  { label: 'City', value: 'city', type: 'string' },
  { label: 'Source', value: 'source', type: 'string' },
  { label: 'Status', value: 'status', type: 'select', options: ['lead', 'prospect', 'customer', 'churned', 'unqualified'] },
  { label: 'Email Verification', value: 'email_status', type: 'select', options: ['valid', 'invalid', 'risky', 'unknown'] },
  { label: 'Lead Score', value: 'lead_score', type: 'number' },
  { label: 'Created Date', value: 'created_at', type: 'date' }
];

export const FilterBuilderModal: React.FC<FilterBuilderModalProps> = ({
  isOpen,
  onClose,
  customFields,
  initialFilter,
  onApply
}) => {
  const [conjunction, setConjunction] = useState<'AND' | 'OR'>(initialFilter?.conjunction || 'AND');
  const [conditions, setConditions] = useState<FilterCondition[]>(
    initialFilter?.conditions && initialFilter.conditions.length > 0
      ? initialFilter.conditions
      : [{ field: 'status', operator: 'eq', value: 'lead' }]
  );

  if (!isOpen) return null;

  const allFields = [
    ...STANDARD_FIELDS,
    ...customFields.map((cf) => ({
      label: `[Custom] ${cf.field_label}`,
      value: `custom.${cf.field_name}`,
      type: cf.data_type,
      options: cf.options
    }))
  ];

  const handleAddCondition = () => {
    setConditions([...conditions, { field: 'email', operator: 'contains', value: '' }]);
  };

  const handleRemoveCondition = (index: number) => {
    setConditions(conditions.filter((_, idx) => idx !== index));
  };

  const handleUpdateCondition = (index: number, updates: Partial<FilterCondition>) => {
    const updated = [...conditions];
    updated[index] = { ...updated[index], ...updates };
    setConditions(updated);
  };

  const handleSave = () => {
    onApply({
      conjunction,
      conditions: conditions.filter((c) => c.field && c.operator)
    });
    onClose();
  };

  const handleReset = () => {
    setConditions([]);
    onApply({ conjunction: 'AND', conditions: [] });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
              <Filter className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Advanced Filter Builder</h3>
              <p className="text-xs text-slate-500">Query 100M+ contacts with sub-50ms indexed predicates</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Conjunction toggle */}
          <div className="flex items-center gap-3 bg-slate-100 p-1.5 rounded-xl w-fit">
            <span className="text-xs font-semibold text-slate-600 px-2 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              Match contacts where:
            </span>
            <button
              type="button"
              onClick={() => setConjunction('AND')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                conjunction === 'AND'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ALL conditions match (AND)
            </button>
            <button
              type="button"
              onClick={() => setConjunction('OR')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                conjunction === 'OR'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ANY condition matches (OR)
            </button>
          </div>

          {/* Condition rows */}
          <div className="space-y-3 pt-2">
            {conditions.map((cond, idx) => {
              const selectedFieldDef = allFields.find((f) => f.value === cond.field);
              const isNullOp = cond.operator === 'is_null' || cond.operator === 'is_not_null';

              return (
                <div
                  key={idx}
                  className="flex flex-wrap items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200/80 hover:border-slate-300 transition"
                >
                  <span className="text-xs font-bold text-slate-400 w-6">#{idx + 1}</span>

                  {/* Field selector */}
                  <select
                    value={cond.field}
                    onChange={(e) => handleUpdateCondition(idx, { field: e.target.value })}
                    className="text-xs font-medium bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    {allFields.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>

                  {/* Operator selector */}
                  <select
                    value={cond.operator}
                    onChange={(e) => handleUpdateCondition(idx, { operator: e.target.value as any })}
                    className="text-xs font-medium bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="eq">is equal to</option>
                    <option value="neq">is not equal to</option>
                    <option value="contains">contains</option>
                    <option value="starts_with">starts with</option>
                    <option value="gt">greater than (&gt;)</option>
                    <option value="gte">greater or equal (&gt;=)</option>
                    <option value="lt">less than (&lt;)</option>
                    <option value="lte">less or equal (&lt;=)</option>
                    <option value="is_null">is empty / null</option>
                    <option value="is_not_null">is not empty</option>
                  </select>

                  {/* Value Input */}
                  {!isNullOp && (
                    selectedFieldDef?.type === 'select' && selectedFieldDef.options ? (
                      <select
                        value={cond.value || ''}
                        onChange={(e) => handleUpdateCondition(idx, { value: e.target.value })}
                        className="text-xs font-medium bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 flex-1 min-w-[140px] focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      >
                        <option value="">Select option...</option>
                        {selectedFieldDef.options.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : selectedFieldDef?.type === 'number' ? (
                      <input
                        type="number"
                        value={cond.value ?? ''}
                        onChange={(e) => handleUpdateCondition(idx, { value: Number(e.target.value) })}
                        placeholder="Value..."
                        className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 flex-1 min-w-[120px] focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    ) : selectedFieldDef?.type === 'date' ? (
                      <input
                        type="date"
                        value={cond.value || ''}
                        onChange={(e) => handleUpdateCondition(idx, { value: e.target.value })}
                        className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 flex-1 min-w-[140px] focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    ) : (
                      <input
                        type="text"
                        value={cond.value || ''}
                        onChange={(e) => handleUpdateCondition(idx, { value: e.target.value })}
                        placeholder="Value..."
                        className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 flex-1 min-w-[140px] focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    )
                  )}

                  {/* Remove Condition */}
                  <button
                    type="button"
                    onClick={() => handleRemoveCondition(idx)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                    title="Remove condition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}

            {conditions.length === 0 && (
              <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
                No active filter conditions. All workspace contacts will be displayed.
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleAddCondition}
            className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Filter Condition
          </button>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <button
            type="button"
            onClick={handleReset}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition"
          >
            Clear All Filters
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md transition"
            >
              Apply Filter
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

