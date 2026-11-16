import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Plus,
  Trash2,
  Edit2,
  Check,
  Zap,
  Shield,
  Layers,
  Search,
  Calculator,
  ExternalLink,
  Info
} from 'lucide-react';
import { crmApi } from './crmApi';

const FIELD_TYPES = [
  { value: 'text', label: 'Single Line Text', desc: 'Short string input' },
  { value: 'long_text', label: 'Long Text / Notes', desc: 'Multiline paragraph' },
  { value: 'number', label: 'Numeric', desc: 'Integer or decimal values' },
  { value: 'currency', label: 'Currency ($ / ₹)', desc: 'Monetary values with currency code' },
  { value: 'percent', label: 'Percentage (%)', desc: 'Ratio or discount percentage' },
  { value: 'date', label: 'Date', desc: 'Calendar date (YYYY-MM-DD)' },
  { value: 'datetime', label: 'Date & Time', desc: 'Timestamp with time' },
  { value: 'dropdown', label: 'Single Select Dropdown', desc: 'One choice from predefined options' },
  { value: 'multi_select', label: 'Multi-Select', desc: 'Multiple tag-style choices' },
  { value: 'checkbox', label: 'Checkbox (Boolean)', desc: 'True or False toggle' },
  { value: 'url', label: 'Web URL', desc: 'Clickable website link' },
  { value: 'email', label: 'Email Address', desc: 'Validated email format' },
  { value: 'phone', label: 'Phone Number', desc: 'E.164 formatted number' },
  { value: 'user', label: 'User Assignee', desc: 'Assigned team member' },
  { value: 'tag', label: 'Tag Badge', desc: 'Custom metadata tag' },
  { value: 'file', label: 'File Attachment', desc: 'Uploaded document or image' },
  { value: 'rating', label: 'Rating (1-5 Stars)', desc: 'Quality or priority rating' },
  { value: 'formula', label: 'Calculated Formula', desc: 'e.g. {deal_value} * 0.18' },
  { value: 'lookup', label: 'Relationship Lookup', desc: 'Pull field from company or contact' },
  { value: 'auto_number', label: 'Auto-Number', desc: 'Sequential ID e.g. INV-0042' },
  { value: 'stage', label: 'Board Stage Sync', desc: 'Linked to Kanban columns' }
];

export const SuperFieldsManagerView: React.FC = () => {
  const [fields, setFields] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingField, setEditingField] = useState<any | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [fieldType, setFieldType] = useState('text');
  const [groupName, setGroupName] = useState('General');
  const [isRequired, setIsRequired] = useState(false);
  const [isPromoted, setIsPromoted] = useState(false);
  const [formulaExpr, setFormulaExpr] = useState('');
  const [optionsStr, setOptionsStr] = useState('');
  const [regex, setRegex] = useState('');

  // Live Formula Test
  const [testContext, setTestContext] = useState('{"deal_value": 10000}');
  const [testResult, setTestResult] = useState<any>(null);

  useEffect(() => {
    loadFields();
  }, []);

  const loadFields = async () => {
    setLoading(true);
    try {
      const res = await crmApi.listSuperFields('contact');
      if (res && res.success && res.fields) {
        setFields(res.fields);
      }
    } catch (err) {
      console.error('Failed to load super fields:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingField(null);
    setName('');
    setSlug('');
    setFieldType('text');
    setGroupName('General');
    setIsRequired(false);
    setIsPromoted(false);
    setFormulaExpr('');
    setOptionsStr('');
    setRegex('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (field: any) => {
    setEditingField(field);
    setName(field.name);
    setSlug(field.slug);
    setFieldType(field.field_type);
    setGroupName(field.group_name || 'General');
    setIsRequired(field.is_required);
    setIsPromoted(field.is_promoted);
    setFormulaExpr(field.formula_expression || '');
    setOptionsStr((field.options || []).map((o: any) => o.label || o.value).join(', '));
    setRegex(field.validation_regex || '');
    setIsModalOpen(true);
  };

  const handleSaveField = async () => {
    if (!name.trim()) return;
    const finalSlug = slug.trim() || name.toLowerCase().replace(/[^a-z0-9_]/g, '_');

    const options = optionsStr
      ? optionsStr.split(',').map((s) => ({ label: s.trim(), value: s.trim() }))
      : [];

    const payload = {
      name,
      slug: finalSlug,
      entity_type: 'contact',
      field_type: fieldType,
      group_name: groupName,
      is_required: isRequired,
      is_promoted: isPromoted,
      formula_expression: fieldType === 'formula' ? formulaExpr : null,
      options,
      validation_regex: regex || null
    };

    try {
      if (editingField) {
        await crmApi.updateSuperField(editingField.id, payload);
      } else {
        await crmApi.createSuperField(payload);
      }
      setIsModalOpen(false);
      loadFields();
    } catch (err: any) {
      alert(`Error saving field: ${err.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this Super Field?')) return;
    try {
      await crmApi.deleteSuperField(id);
      loadFields();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleTogglePromote = async (field: any) => {
    try {
      await crmApi.promoteSuperField(field.id, !field.is_promoted);
      loadFields();
    } catch (err: any) {
      alert(`Error updating index: ${err.message}`);
    }
  };

  const handleTestFormula = async () => {
    try {
      const parsedCtx = JSON.parse(testContext);
      const res = await crmApi.evaluateFormula(formulaExpr, parsedCtx);
      setTestResult(res.value);
    } catch (e: any) {
      setTestResult(`Error: ${e.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-500 rounded-2xl text-white shadow-xs">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-slate-900 tracking-tight">Super Fields Studio</h2>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-50 text-amber-700">
                20 Enterprise Types
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Formulas, Stage Sync, Zero-Lock Hot Table Promotion & Custom Validations
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition"
        >
          <Plus className="w-4 h-4" />
          Create Super Field
        </button>
      </div>

      {/* Fields List */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200/60">
                <th className="py-3 px-4">Field Name</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Slug / Key</th>
                <th className="py-3 px-4">Group</th>
                <th className="py-3 px-4 text-center">Fast Promoted Index</th>
                <th className="py-3 px-4 text-center">Required</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fields.map((f) => (
                <tr key={f.id} className="hover:bg-slate-50/80 transition">
                  <td className="py-3.5 px-4 font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500" />
                    {f.name}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-mono font-bold text-[11px]">
                      {f.field_type}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-500">{f.slug}</td>
                  <td className="py-3.5 px-4 text-slate-600 font-medium">{f.group_name || 'General'}</td>
                  <td className="py-3.5 px-4 text-center">
                    <button
                      type="button"
                      onClick={() => handleTogglePromote(f)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-black transition ${
                        f.is_promoted
                          ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {f.is_promoted ? '✓ Indexed' : 'JSONB Only'}
                    </button>
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    {f.is_required ? (
                      <span className="text-rose-600 font-bold">Yes</span>
                    ) : (
                      <span className="text-slate-400">Optional</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(f)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 transition"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(f.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {fields.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 font-medium">
                    No custom Super Fields defined yet. Click "Create Super Field" to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 border border-slate-200 shadow-2xl space-y-5 my-8">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-600 rounded-2xl text-white">
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  {editingField ? 'Edit Super Field' : 'Create New Super Field'}
                </h3>
                <p className="text-xs text-slate-500">
                  Configure field properties, validation rules, and indexing
                </p>
              </div>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Field Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (!editingField) {
                        setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
                      }
                    }}
                    placeholder="e.g. Budget Amount"
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Field Slug</label>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="e.g. budget_amount"
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 font-mono font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Field Type (20 Supported)</label>
                <select
                  value={fieldType}
                  onChange={(e) => setFieldType(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 font-bold bg-white"
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label} — {t.desc}
                    </option>
                  ))}
                </select>
              </div>

              {fieldType === 'formula' && (
                <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-2xl space-y-3">
                  <div className="flex items-center gap-1.5 font-bold text-indigo-900">
                    <Calculator className="w-4 h-4" />
                    <span>Formula Expression</span>
                  </div>
                  <input
                    type="text"
                    value={formulaExpr}
                    onChange={(e) => setFormulaExpr(e.target.value)}
                    placeholder="e.g. {deal_value} * 0.18"
                    className="w-full border border-indigo-300 rounded-xl px-3 py-2 font-mono font-medium text-xs bg-white"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={testContext}
                      onChange={(e) => setTestContext(e.target.value)}
                      placeholder='{"deal_value": 10000}'
                      className="flex-1 border border-indigo-200 rounded-xl px-2.5 py-1 text-xs font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleTestFormula}
                      className="px-3 py-1 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700"
                    >
                      Test
                    </button>
                  </div>
                  {testResult !== null && (
                    <p className="text-xs font-bold text-indigo-900">Result: {String(testResult)}</p>
                  )}
                </div>
              )}

              {(fieldType === 'dropdown' || fieldType === 'multi_select') && (
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Options (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={optionsStr}
                    onChange={(e) => setOptionsStr(e.target.value)}
                    placeholder="e.g. Lead, In Discussion, Closed, Cold"
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 font-medium"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Group / Section</label>
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="General, Financials, Outreach"
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Regex Pattern Validation</label>
                  <input
                    type="text"
                    value={regex}
                    onChange={(e) => setRegex(e.target.value)}
                    placeholder="e.g. ^[0-9]{10}$"
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 font-mono font-medium"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isRequired}
                    onChange={(e) => setIsRequired(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                  />
                  <span className="font-bold text-slate-700">Required Field</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPromoted}
                    onChange={(e) => setIsPromoted(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                  />
                  <span className="font-bold text-slate-700">
                    Fast Promoted Index (Optimized for 100M+ queries)
                  </span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveField}
                className="px-5 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 shadow-sm"
              >
                {editingField ? 'Save Changes' : 'Create Super Field'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

