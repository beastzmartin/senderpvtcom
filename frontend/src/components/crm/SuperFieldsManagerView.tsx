import React, { useState, useEffect, useMemo } from 'react';
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
  Info,
  Hash,
  DollarSign,
  Percent,
  Calendar,
  Clock,
  ListFilter,
  CheckSquare,
  Link,
  Mail,
  Phone,
  User,
  Tag,
  Paperclip,
  Star,
  ArrowRightLeft,
  Sparkles,
  Filter,
  AlertCircle,
  Play,
  Eye,
  Copy,
  RefreshCw,
  X,
  FileText,
  CheckCircle2,
  ChevronRight,
  HelpCircle
} from 'lucide-react';
import { crmApi } from './crmApi';
import {
  Button,
  Badge,
  Input,
  StatCard,
  Modal,
  Drawer,
  Skeleton,
  EmptyState
} from './ui/CrmDesignSystem';

// ============================================================================
// FIELD TYPE DEFINITIONS & CATEGORIES
// ============================================================================
export interface FieldTypeMeta {
  value: string;
  label: string;
  category: 'Text & Content' | 'Numbers & Finance' | 'Choices & Lists' | 'Dates & People' | 'Calculations & Links';
  desc: string;
  icon: React.ReactNode;
  samplePlaceholder: string;
  defaultVal: any;
}

export const SUPER_FIELD_TYPES: FieldTypeMeta[] = [
  // Text & Content
  {
    value: 'text',
    label: 'Single Line Text',
    category: 'Text & Content',
    desc: 'Short string input (e.g. Job Title, Company Name)',
    icon: <FileText className="w-4 h-4 text-blue-400" />,
    samplePlaceholder: 'Senior Product Manager',
    defaultVal: 'Acme Corp'
  },
  {
    value: 'long_text',
    label: 'Long Text / Notes',
    category: 'Text & Content',
    desc: 'Multi-line paragraph text for notes, briefs, or logs',
    icon: <FileText className="w-4 h-4 text-sky-400" />,
    samplePlaceholder: 'Discussed Q4 expansion and security review requirements...',
    defaultVal: 'Discussed Q4 roadmap and pricing discounts.'
  },
  {
    value: 'email',
    label: 'Email Address',
    category: 'Text & Content',
    desc: 'RFC-validated email address with one-click compose',
    icon: <Mail className="w-4 h-4 text-indigo-400" />,
    samplePlaceholder: 'contact@enterprise.com',
    defaultVal: 'alex.morgan@acme.io'
  },
  {
    value: 'phone',
    label: 'Phone Number',
    category: 'Text & Content',
    desc: 'E.164 phone with international format and WhatsApp sync',
    icon: <Phone className="w-4 h-4 text-emerald-400" />,
    samplePlaceholder: '+1 415 555 0199',
    defaultVal: '+1 (415) 555-0199'
  },
  {
    value: 'url',
    label: 'Web URL',
    category: 'Text & Content',
    desc: 'Clickable URL with protocol validation',
    icon: <Link className="w-4 h-4 text-cyan-400" />,
    samplePlaceholder: 'https://acme.org',
    defaultVal: 'https://linkedin.com/in/alexmorgan'
  },
  {
    value: 'file',
    label: 'File Attachment',
    category: 'Text & Content',
    desc: 'Secure cloud link to uploaded contract, PDF, or avatar',
    icon: <Paperclip className="w-4 h-4 text-slate-400" />,
    samplePlaceholder: 'MSA_Executed_v2.pdf',
    defaultVal: 'MSA_Executed_v2.pdf'
  },

  // Numbers & Finance
  {
    value: 'number',
    label: 'Numeric Value',
    category: 'Numbers & Finance',
    desc: 'Integer or high-precision decimal quantity',
    icon: <Hash className="w-4 h-4 text-amber-400" />,
    samplePlaceholder: '42',
    defaultVal: 1500
  },
  {
    value: 'currency',
    label: 'Currency ($ / ₹ / €)',
    category: 'Numbers & Finance',
    desc: 'Monetary figure stored with ISO currency specification',
    icon: <DollarSign className="w-4 h-4 text-emerald-400" />,
    samplePlaceholder: '45,000.00',
    defaultVal: '$45,000.00'
  },
  {
    value: 'percent',
    label: 'Percentage (%)',
    category: 'Numbers & Finance',
    desc: 'Ratio or discount percentage (0 to 100%)',
    icon: <Percent className="w-4 h-4 text-purple-400" />,
    samplePlaceholder: '18.5%',
    defaultVal: '20%'
  },
  {
    value: 'rating',
    label: 'Rating (1-5 Stars)',
    category: 'Numbers & Finance',
    desc: 'Star rating for lead scoring, priority, or customer satisfaction',
    icon: <Star className="w-4 h-4 text-amber-400" />,
    samplePlaceholder: '4/5',
    defaultVal: 4
  },
  {
    value: 'auto_number',
    label: 'Auto-Number Sequence',
    category: 'Numbers & Finance',
    desc: 'Monotonically increasing sequence ID (e.g. DEAL-0042)',
    icon: <Hash className="w-4 h-4 text-rose-400" />,
    samplePlaceholder: 'DEAL-0042',
    defaultVal: 'DEAL-0042'
  },

  // Choices & Lists
  {
    value: 'dropdown',
    label: 'Single-Select Dropdown',
    category: 'Choices & Lists',
    desc: 'Pick one option from a pre-configured list',
    icon: <ListFilter className="w-4 h-4 text-violet-400" />,
    samplePlaceholder: 'Select option...',
    defaultVal: 'Qualified Lead'
  },
  {
    value: 'multi_select',
    label: 'Multi-Select Tags',
    category: 'Choices & Lists',
    desc: 'Pick multiple tags or attributes simultaneously',
    icon: <Tag className="w-4 h-4 text-pink-400" />,
    samplePlaceholder: 'Select tags...',
    defaultVal: ['SaaS', 'High-Touch', 'West Coast']
  },
  {
    value: 'checkbox',
    label: 'Checkbox (Boolean)',
    category: 'Choices & Lists',
    desc: 'Binary true/false toggle for flags and opt-ins',
    icon: <CheckSquare className="w-4 h-4 text-emerald-400" />,
    samplePlaceholder: 'Checked / Unchecked',
    defaultVal: true
  },
  {
    value: 'tag',
    label: 'Tag Badge',
    category: 'Choices & Lists',
    desc: 'Color-coded micro badge tied to workspace tag taxonomy',
    icon: <Tag className="w-4 h-4 text-amber-400" />,
    samplePlaceholder: 'VIP Customer',
    defaultVal: 'Enterprise Tier'
  },

  // Dates & People
  {
    value: 'date',
    label: 'Calendar Date',
    category: 'Dates & People',
    desc: 'ISO 8601 calendar date without time component',
    icon: <Calendar className="w-4 h-4 text-blue-400" />,
    samplePlaceholder: '2026-12-31',
    defaultVal: '2026-11-20'
  },
  {
    value: 'datetime',
    label: 'Date & Time',
    category: 'Dates & People',
    desc: 'UTC timestamp with localized timezone display',
    icon: <Clock className="w-4 h-4 text-indigo-400" />,
    samplePlaceholder: '2026-12-31 14:30',
    defaultVal: '2026-11-20 18:30'
  },
  {
    value: 'user',
    label: 'User Assignee',
    category: 'Dates & People',
    desc: 'Team member assignee with avatar and permissions sync',
    icon: <User className="w-4 h-4 text-cyan-400" />,
    samplePlaceholder: 'Assign team member...',
    defaultVal: 'Sarah Jenkins (Account Exec)'
  },
  {
    value: 'stage',
    label: 'Board Stage Sync',
    category: 'Dates & People',
    desc: 'Bidirectionally synchronized with Kanban board column',
    icon: <ArrowRightLeft className="w-4 h-4 text-orange-400" />,
    samplePlaceholder: 'Negotiation',
    defaultVal: 'Proposal Sent'
  },

  // Calculations & Links
  {
    value: 'formula',
    label: 'Calculated Formula',
    category: 'Calculations & Links',
    desc: 'Real-time computed expression using math, fields, & dynamic tax',
    icon: <Calculator className="w-4 h-4 text-emerald-400" />,
    samplePlaceholder: '{deal_value} * (1 + {tax_rate})',
    defaultVal: '$11,800.00'
  },
  {
    value: 'lookup',
    label: 'Relationship Lookup',
    category: 'Calculations & Links',
    desc: 'Pulls a field from an associated Company or Account',
    icon: <ExternalLink className="w-4 h-4 text-indigo-400" />,
    samplePlaceholder: 'Company.AnnualRevenue',
    defaultVal: '$2.4M ARR'
  }
];

const REGEX_PRESETS = [
  { label: 'US Phone', regex: '^\\+?1?[0-9]{10}$', tip: 'Matches 10-digit US/Canada numbers' },
  { label: 'E.164 Phone', regex: '^\\+[1-9]\\d{1,14}$', tip: 'Standard international format with +' },
  { label: 'Digits Only', regex: '^[0-9]+$', tip: 'Strict integer numbers' },
  { label: 'Alphanumeric', regex: '^[a-zA-Z0-9_-]+$', tip: 'Codes, slugs, or SKU tags' },
  { label: 'PIN / Postal', regex: '^[0-9]{5,6}$', tip: '5 or 6 digit postal codes' }
];

const FORMULA_SUGGESTED_TOKENS = [
  { token: '{deal_value}', desc: 'Deal amount in dollars' },
  { token: '{tax_rate}', desc: 'Dynamic workspace tax rate (e.g. 0.18)' },
  { token: '{settings.tax_rate}', desc: 'Global organization tax setting' },
  { token: '{discount_percent}', desc: 'Discount ratio (0.0 to 1.0)' },
  { token: '{lead_score}', desc: 'AI confidence score' },
  { token: '{units}', desc: 'Quantity or license seats' }
];

export const SuperFieldsManagerView: React.FC = () => {
  const [fields, setFields] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingField, setEditingField] = useState<any | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedGroup, setSelectedGroup] = useState<string>('All');

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
  const [description, setDescription] = useState('');

  // Interactive Live Preview State
  const [previewValue, setPreviewValue] = useState<any>('');
  const [previewTouched, setPreviewTouched] = useState(false);

  // Live Formula Test Sandbox State
  const [testContext, setTestContext] = useState('{\n  "deal_value": 10000,\n  "discount_percent": 0.10,\n  "tax_rate": 0.18\n}');
  const [testResult, setTestResult] = useState<any>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [testingFormula, setTestingFormula] = useState(false);

  // Notification / Toast
  const [toastMessage, setToastMessage] = useState<{ text: string; variant: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    loadFields();
  }, []);

  const showToast = (text: string, variant: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ text, variant });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadFields = async () => {
    setLoading(true);
    try {
      const res = await crmApi.listSuperFields('contact');
      if (res && res.success && res.fields) {
        setFields(res.fields);
      }
    } catch (err: any) {
      console.error('Failed to load super fields:', err);
      showToast(err.message || 'Failed to load fields', 'error');
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
    setDescription('');
    setPreviewValue('');
    setPreviewTouched(false);
    setTestResult(null);
    setTestError(null);
    setIsDrawerOpen(true);
  };

  const handleOpenEdit = (field: any) => {
    setEditingField(field);
    setName(field.name);
    setSlug(field.slug);
    setFieldType(field.field_type);
    setGroupName(field.group_name || 'General');
    setIsRequired(Boolean(field.is_required));
    setIsPromoted(Boolean(field.is_promoted));
    setFormulaExpr(field.formula_expression || '');
    setOptionsStr((field.options || []).map((o: any) => o.label || o.value).join(', '));
    setRegex(field.validation_regex || '');
    setDescription(field.description || '');
    setPreviewValue('');
    setPreviewTouched(false);
    setTestResult(null);
    setTestError(null);
    setIsDrawerOpen(true);
  };

  const handleSaveField = async () => {
    if (!name.trim()) {
      showToast('Field Name is required', 'error');
      return;
    }
    const finalSlug = slug.trim() || name.toLowerCase().replace(/[^a-z0-9_]/g, '_');

    const options = optionsStr
      ? optionsStr.split(',').map((s) => ({ label: s.trim(), value: s.trim() })).filter(o => o.value)
      : [];

    const payload = {
      name: name.trim(),
      slug: finalSlug,
      entity_type: 'contact',
      field_type: fieldType,
      group_name: groupName.trim() || 'General',
      is_required: isRequired,
      is_promoted: isPromoted,
      formula_expression: fieldType === 'formula' ? formulaExpr.trim() : null,
      options,
      validation_regex: regex.trim() || null,
      description: description.trim() || null
    };

    try {
      if (editingField) {
        await crmApi.updateSuperField(editingField.id, payload);
        showToast(`Super Field "${payload.name}" updated successfully`);
      } else {
        await crmApi.createSuperField(payload);
        showToast(`Super Field "${payload.name}" created successfully`);
      }
      setIsDrawerOpen(false);
      loadFields();
    } catch (err: any) {
      showToast(`Error saving field: ${err.message}`, 'error');
    }
  };

  const handleDelete = async (field: any) => {
    if (!confirm(`Are you sure you want to delete Super Field "${field.name}"? Existing contact values will be preserved in raw history.`)) return;
    try {
      await crmApi.deleteSuperField(field.id);
      showToast(`Deleted field "${field.name}"`);
      loadFields();
    } catch (err: any) {
      showToast(`Delete failed: ${err.message}`, 'error');
    }
  };

  const handleTogglePromote = async (field: any) => {
    const nextState = !field.is_promoted;
    try {
      // Optimistic update
      setFields(prev => prev.map(f => f.id === field.id ? { ...f, is_promoted: nextState } : f));
      await crmApi.promoteSuperField(field.id, nextState);
      showToast(nextState ? `Indexed "${field.name}" for high-speed queries` : `Demoted "${field.name}" to standard JSONB storage`);
    } catch (err: any) {
      showToast(`Index update failed: ${err.message}`, 'error');
      loadFields();
    }
  };

  const handleInsertToken = (token: string) => {
    setFormulaExpr(prev => (prev ? `${prev} ${token}` : token));
  };

  const handleTestFormula = async () => {
    if (!formulaExpr.trim()) {
      setTestError('Please enter a formula expression first');
      return;
    }
    setTestingFormula(true);
    setTestError(null);
    setTestResult(null);
    try {
      let parsedCtx = {};
      try {
        parsedCtx = JSON.parse(testContext);
      } catch (parseErr: any) {
        throw new Error(`Invalid JSON in test context: ${parseErr.message}`);
      }
      const res = await crmApi.evaluateFormula(formulaExpr, parsedCtx);
      if (res && res.success !== false) {
        setTestResult(res.value);
      } else {
        setTestError(res?.error || 'Formula calculation failed');
      }
    } catch (e: any) {
      setTestError(e.message);
    } finally {
      setTestingFormula(false);
    }
  };

  // Group options available
  const availableGroups = useMemo(() => {
    const s = new Set<string>();
    fields.forEach(f => {
      if (f.group_name) s.add(f.group_name);
    });
    return ['All', ...Array.from(s)];
  }, [fields]);

  // Filtered fields list
  const filteredFields = useMemo(() => {
    return fields.filter(f => {
      const matchSearch =
        !searchQuery ||
        f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (f.field_type && f.field_type.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (f.group_name && f.group_name.toLowerCase().includes(searchQuery.toLowerCase()));

      const meta = SUPER_FIELD_TYPES.find(t => t.value === f.field_type);
      const matchCat = selectedCategory === 'All' || (meta && meta.category === selectedCategory);
      const matchGroup = selectedGroup === 'All' || f.group_name === selectedGroup;

      return matchSearch && matchCat && matchGroup;
    });
  }, [fields, searchQuery, selectedCategory, selectedGroup]);

  // KPI Calculations
  const totalCount = fields.length;
  const promotedCount = fields.filter(f => f.is_promoted).length;
  const formulaCount = fields.filter(f => f.field_type === 'formula').length;
  const uniqueGroupsCount = new Set(fields.map(f => f.group_name || 'General')).size;

  const currentTypeMeta = SUPER_FIELD_TYPES.find(t => t.value === fieldType) || SUPER_FIELD_TYPES[0];

  // Regex validation check for live preview
  const isPreviewValid = useMemo(() => {
    if (!previewValue) return !isRequired;
    if (regex) {
      try {
        const re = new RegExp(regex);
        return re.test(String(previewValue));
      } catch {
        return true;
      }
    }
    return true;
  }, [previewValue, regex, isRequired]);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl shadow-xl border flex items-center gap-2.5 text-xs font-bold animate-in fade-in slide-in-from-bottom-2 ${
            toastMessage.variant === 'success'
              ? 'bg-emerald-950/90 text-emerald-200 border-emerald-700/80 backdrop-blur-md'
              : toastMessage.variant === 'error'
              ? 'bg-rose-950/90 text-rose-200 border-rose-700/80 backdrop-blur-md'
              : 'bg-slate-900/90 text-slate-200 border-slate-700/80 backdrop-blur-md'
          }`}
        >
          {toastMessage.variant === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          {toastMessage.variant === 'error' && <AlertCircle className="w-4 h-4 text-rose-400" />}
          {toastMessage.variant === 'info' && <Info className="w-4 h-4 text-cyan-400" />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 rounded-3xl border border-indigo-900/40 shadow-xl flex flex-wrap items-center justify-between gap-4 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex items-center gap-4">
          <div className="p-3.5 bg-indigo-600/30 border border-indigo-500/40 rounded-2xl text-indigo-300 shadow-inner">
            <Sliders className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-black text-white tracking-tight">Super Fields Studio</h2>
              <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                20 Enterprise Types
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                100M+ Ready
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1 max-w-xl">
              Model flexible business entities with calculated formulas, dynamic tax rates, zero-lock fast indexed columns, and strict regex validation.
            </p>
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-3">
          <Button
            variant="primary"
            size="md"
            icon={<Plus className="w-4 h-4" />}
            onClick={handleOpenCreate}
            className="shadow-lg shadow-indigo-600/30"
          >
            Create Super Field
          </Button>
        </div>
      </div>

      {/* 4 KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Super Fields"
          value={totalCount}
          subtitle="Configured custom entity fields"
          icon={<Sliders className="w-5 h-5 text-indigo-400" />}
        />
        <StatCard
          label="Promoted Columns"
          value={promotedCount}
          subtitle="Indexed for sub-second 100M+ filters"
          icon={<Zap className="w-5 h-5 text-amber-400" />}
          trend={{ value: `${totalCount ? Math.round((promotedCount / totalCount) * 100) : 0}% indexed`, positive: true }}
        />
        <StatCard
          label="Formula & Math Fields"
          value={formulaCount}
          subtitle="Dynamic calculations with live tax"
          icon={<Calculator className="w-5 h-5 text-emerald-400" />}
        />
        <StatCard
          label="Field Taxonomy Groups"
          value={uniqueGroupsCount}
          subtitle="Categorized sections in contact view"
          icon={<Layers className="w-5 h-5 text-purple-400" />}
        />
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by field name, slug, group, or type..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 text-xs">
            {['All', 'Text & Content', 'Numbers & Finance', 'Choices & Lists', 'Dates & People', 'Calculations & Links'].map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition shrink-0 ${
                  selectedCategory === cat
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-800/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Group Filter */}
        {availableGroups.length > 2 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 font-medium">Group:</span>
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
            >
              {availableGroups.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Fields Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950/70 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-800">
                <th className="py-3.5 px-5">Field Name</th>
                <th className="py-3.5 px-4">Type</th>
                <th className="py-3.5 px-4">Database Key (Slug)</th>
                <th className="py-3.5 px-4">Group</th>
                <th className="py-3.5 px-4 text-center">Fast Promoted Index</th>
                <th className="py-3.5 px-4 text-center">Required</th>
                <th className="py-3.5 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="py-4 px-5"><div className="h-4 w-32 bg-slate-800 rounded" /></td>
                    <td className="py-4 px-4"><div className="h-4 w-20 bg-slate-800 rounded" /></td>
                    <td className="py-4 px-4"><div className="h-4 w-28 bg-slate-800 rounded" /></td>
                    <td className="py-4 px-4"><div className="h-4 w-16 bg-slate-800 rounded" /></td>
                    <td className="py-4 px-4 text-center"><div className="h-5 w-20 bg-slate-800 rounded-full mx-auto" /></td>
                    <td className="py-4 px-4 text-center"><div className="h-4 w-12 bg-slate-800 rounded mx-auto" /></td>
                    <td className="py-4 px-5 text-right"><div className="h-6 w-14 bg-slate-800 rounded ml-auto" /></td>
                  </tr>
                ))
              ) : filteredFields.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12">
                    <EmptyState
                      title={searchQuery ? 'No matching fields found' : 'No Super Fields defined yet'}
                      description={
                        searchQuery
                          ? 'Try adjusting your search query or category filters.'
                          : 'Create custom business attributes, formulas, or stage synchronizers to power your CRM.'
                      }
                      action={
                        searchQuery ? (
                          <Button variant="outline" size="sm" onClick={() => { setSearchQuery(''); setSelectedCategory('All'); setSelectedGroup('All'); }}>
                            Reset Filters
                          </Button>
                        ) : (
                          <Button variant="primary" size="sm" icon={<Plus className="w-4 h-4" />} onClick={handleOpenCreate}>
                            Create Super Field
                          </Button>
                        )
                      }
                    />
                  </td>
                </tr>
              ) : (
                filteredFields.map((f) => {
                  const meta = SUPER_FIELD_TYPES.find(t => t.value === f.field_type) || SUPER_FIELD_TYPES[0];
                  return (
                    <tr key={f.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-5 font-semibold text-slate-100 flex items-center gap-2.5">
                        <div className="p-1.5 rounded-lg bg-slate-800 text-slate-300">
                          {meta.icon}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-100">{f.name}</span>
                            {f.validation_regex && (
                              <span title={`Validated by regex: ${f.validation_regex}`} className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/60">
                                regex
                              </span>
                            )}
                          </div>
                          {f.description && (
                            <p className="text-[11px] text-slate-400 font-normal truncate max-w-xs">{f.description}</p>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge variant="indigo" size="xs" className="font-mono">
                          {f.field_type}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-400">{f.slug}</td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-medium">
                          {f.group_name || 'General'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleTogglePromote(f)}
                          title={f.is_promoted ? 'Click to demote to JSONB' : 'Click to promote to fast indexed B-Tree column'}
                          className={`px-3 py-1 rounded-full text-[10px] font-black transition inline-flex items-center gap-1.5 cursor-pointer ${
                            f.is_promoted
                              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/80 hover:bg-emerald-900/60'
                              : 'bg-slate-800/80 text-slate-400 border border-slate-700 hover:bg-slate-700 hover:text-slate-200'
                          }`}
                        >
                          <Zap className={`w-3 h-3 ${f.is_promoted ? 'text-emerald-400' : 'text-slate-500'}`} />
                          {f.is_promoted ? 'Indexed Column' : 'JSONB Attribute'}
                        </button>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {f.is_required ? (
                          <Badge variant="rose" size="xs">Required</Badge>
                        ) : (
                          <span className="text-slate-500 text-[11px]">Optional</span>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(f)}
                            className="p-1.5 text-slate-400 hover:text-indigo-300 rounded-lg hover:bg-slate-800 transition"
                            title="Edit Field"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(f)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition"
                            title="Delete Field"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Slide-Over Drawer */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={editingField ? `Edit "${editingField.name}"` : 'Create New Super Field'}
        subtitle="Configure field properties, validation rules, indexing, and live preview"
        width="2xl"
      >
        <div className="space-y-6">
          {/* Main Grid: Form Left, Live Preview Right */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Configuration (7 cols) */}
            <div className="lg:col-span-7 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Field Name <span className="text-rose-500">*</span>
                  </label>
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
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Database Key (Slug)
                  </label>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="e.g. budget_amount"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-indigo-300 font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Field Description / Helper Text
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional explanatory note displayed below the input"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* 20 Field Types Selector with Visual Category Groups */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Field Type (20 Supported)
                </label>
                <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto p-1 border border-slate-800 rounded-xl bg-slate-950">
                  {SUPER_FIELD_TYPES.map((t) => {
                    const isSelected = fieldType === t.value;
                    return (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => {
                          setFieldType(t.value);
                          setPreviewValue(t.defaultVal || '');
                        }}
                        className={`text-left p-2 rounded-lg border transition flex items-start gap-2 ${
                          isSelected
                            ? 'bg-indigo-950/80 border-indigo-500 text-indigo-200 shadow-sm'
                            : 'bg-slate-900/60 border-slate-800/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                        }`}
                      >
                        <div className="mt-0.5 shrink-0">{t.icon}</div>
                        <div className="min-w-0">
                          <div className="font-bold text-xs truncate">{t.label}</div>
                          <div className="text-[10px] text-slate-500 truncate">{t.category}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Dropdown / Multi-Select Options */}
              {(fieldType === 'dropdown' || fieldType === 'multi_select') && (
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Options (Comma-separated)
                  </label>
                  <input
                    type="text"
                    value={optionsStr}
                    onChange={(e) => setOptionsStr(e.target.value)}
                    placeholder="e.g. Lead, In Review, Negotiation, Closed Won, Lost"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[10px] text-slate-500">
                    Separate each selectable choice with a comma. They will appear in the dropdown menu.
                  </p>
                </div>
              )}

              {/* Formula Editor with Token Inserters & Dynamic Tax */}
              {fieldType === 'formula' && (
                <div className="p-4 bg-indigo-950/40 border border-indigo-800/80 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-300">
                      <Calculator className="w-4 h-4 text-emerald-400" />
                      <span>Formula Expression (Dynamic Math)</span>
                    </div>
                    <Badge variant="emerald" size="xs">Dynamic Tax Supported</Badge>
                  </div>

                  <input
                    type="text"
                    value={formulaExpr}
                    onChange={(e) => setFormulaExpr(e.target.value)}
                    placeholder="e.g. {deal_value} * (1 + {tax_rate})"
                    className="w-full bg-slate-950 border border-indigo-700/60 rounded-xl px-3 py-2.5 font-mono text-xs text-emerald-300 focus:outline-none focus:border-emerald-500 shadow-inner"
                  />

                  {/* Token Pills for 1-Click Insertion */}
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                      Click Token to Insert:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {FORMULA_SUGGESTED_TOKENS.map(({ token, desc }) => (
                        <button
                          key={token}
                          type="button"
                          onClick={() => handleInsertToken(token)}
                          title={desc}
                          className="px-2 py-1 rounded bg-indigo-900/60 hover:bg-indigo-800 text-indigo-200 border border-indigo-700/50 font-mono text-[10px] transition"
                        >
                          + {token}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sandbox Tester */}
                  <div className="pt-2 border-t border-indigo-900/50 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-slate-300">Sandbox Context (JSON)</span>
                      <Button
                        variant="secondary"
                        size="xs"
                        loading={testingFormula}
                        icon={<Play className="w-3 h-3 text-emerald-400" />}
                        onClick={handleTestFormula}
                      >
                        Run Test
                      </Button>
                    </div>
                    <textarea
                      rows={3}
                      value={testContext}
                      onChange={(e) => setTestContext(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 font-mono text-[11px] text-slate-300 focus:outline-none focus:border-indigo-500"
                    />

                    {testResult !== null && (
                      <div className="p-2.5 bg-emerald-950/70 border border-emerald-800 rounded-lg text-xs font-mono text-emerald-200 flex items-center justify-between">
                        <span>Calculated Result:</span>
                        <strong className="text-emerald-400 font-bold">{String(testResult)}</strong>
                      </div>
                    )}
                    {testError && (
                      <div className="p-2.5 bg-rose-950/70 border border-rose-800 rounded-lg text-xs font-mono text-rose-300">
                        {testError}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Group & Regex Validation */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Group / Section
                  </label>
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="General, Financials, Outreach"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Regex Pattern Validation
                  </label>
                  <input
                    type="text"
                    value={regex}
                    onChange={(e) => setRegex(e.target.value)}
                    placeholder="e.g. ^\+[0-9]{10,14}$"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-cyan-300 font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Quick Regex Presets */}
              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 font-medium">Quick Regex Presets:</span>
                <div className="flex flex-wrap gap-1.5">
                  {REGEX_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setRegex(p.regex)}
                      title={p.tip}
                      className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-medium border border-slate-700 transition"
                    >
                      {p.label}
                    </button>
                  ))}
                  {regex && (
                    <button
                      type="button"
                      onClick={() => setRegex('')}
                      className="px-2 py-0.5 bg-rose-950/60 hover:bg-rose-900 text-rose-300 rounded text-[10px] font-medium border border-rose-800 transition"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Checkboxes: Required & Promoted Index */}
              <div className="pt-3 border-t border-slate-800 space-y-3">
                <label className="flex items-start gap-3 p-3 bg-slate-950/60 border border-slate-800 rounded-xl cursor-pointer hover:bg-slate-900 transition">
                  <input
                    type="checkbox"
                    checked={isRequired}
                    onChange={(e) => setIsRequired(e.target.checked)}
                    className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-900 border-slate-700 w-4 h-4"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-200 block">Required Field</span>
                    <span className="text-[11px] text-slate-500">
                      Contacts cannot be created or updated without a valid value for this field.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 bg-emerald-950/20 border border-emerald-800/40 rounded-xl cursor-pointer hover:bg-emerald-950/40 transition">
                  <input
                    type="checkbox"
                    checked={isPromoted}
                    onChange={(e) => setIsPromoted(e.target.checked)}
                    className="mt-0.5 rounded text-emerald-500 focus:ring-emerald-500 bg-slate-900 border-emerald-700 w-4 h-4"
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-xs font-bold text-emerald-200">
                        Fast Promoted Column Index (100M+ Performance)
                      </span>
                    </div>
                    <span className="text-[11px] text-emerald-400/80">
                      Promotes this attribute from raw JSONB to a dedicated B-Tree indexed database column for instant sorting, filtering, and segmenting across millions of rows with zero downtime.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Right Column: Live Interactive Field Preview Card (5 cols) */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 sticky top-4 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                      Live Field Preview
                    </span>
                  </div>
                  <Badge variant="indigo" size="xs">
                    {currentTypeMeta.category}
                  </Badge>
                </div>

                {/* Form Input Appearance Preview */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Contact Detail View Preview
                  </span>
                  <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2 shadow-inner">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-200 flex items-center gap-1">
                        {name || 'Field Label'}
                        {isRequired && <span className="text-rose-500 font-bold">*</span>}
                      </label>
                      <span className="text-[10px] font-mono text-slate-500">{slug || 'field_slug'}</span>
                    </div>

                    {/* Preview based on type */}
                    {fieldType === 'long_text' ? (
                      <textarea
                        rows={2}
                        value={previewValue}
                        onChange={(e) => {
                          setPreviewValue(e.target.value);
                          setPreviewTouched(true);
                        }}
                        placeholder={currentTypeMeta.samplePlaceholder}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                      />
                    ) : fieldType === 'dropdown' ? (
                      <select
                        value={previewValue}
                        onChange={(e) => setPreviewValue(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="">{currentTypeMeta.samplePlaceholder}</option>
                        {(optionsStr ? optionsStr.split(',') : ['Option A', 'Option B', 'Option C']).map((opt, i) => (
                          <option key={i} value={opt.trim()}>{opt.trim()}</option>
                        ))}
                      </select>
                    ) : fieldType === 'checkbox' ? (
                      <label className="flex items-center gap-2 cursor-pointer pt-1">
                        <input
                          type="checkbox"
                          checked={Boolean(previewValue)}
                          onChange={(e) => setPreviewValue(e.target.checked)}
                          className="rounded text-indigo-600 focus:ring-indigo-500 bg-slate-950 border-slate-700 w-4 h-4"
                        />
                        <span className="text-xs text-slate-300">Enable / True</span>
                      </label>
                    ) : fieldType === 'rating' ? (
                      <div className="flex items-center gap-1 py-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`w-5 h-5 cursor-pointer transition ${
                              star <= (Number(previewValue) || 4)
                                ? 'text-amber-400 fill-amber-400'
                                : 'text-slate-700'
                            }`}
                            onClick={() => setPreviewValue(star)}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="relative">
                        <input
                          type="text"
                          value={previewValue}
                          onChange={(e) => {
                            setPreviewValue(e.target.value);
                            setPreviewTouched(true);
                          }}
                          placeholder={currentTypeMeta.samplePlaceholder}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                        />
                        {currentTypeMeta.icon && (
                          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 opacity-70">
                            {currentTypeMeta.icon}
                          </div>
                        )}
                      </div>
                    )}

                    {description && (
                      <p className="text-[11px] text-slate-500">{description}</p>
                    )}

                    {/* Regex error feedback preview */}
                    {regex && previewTouched && !isPreviewValid && (
                      <p className="text-[11px] text-rose-400 flex items-center gap-1 pt-1">
                        <AlertCircle className="w-3.5 h-3.5" /> Does not match validation pattern: {regex}
                      </p>
                    )}
                  </div>
                </div>

                {/* Table Cell Appearance Preview */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Contacts Table Column Preview
                  </span>
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-semibold">{name || 'Field'}</span>
                    <span className="font-mono text-slate-200 font-medium">
                      {String(previewValue || currentTypeMeta.defaultVal || '—')}
                    </span>
                  </div>
                </div>

                {/* Kanban Card Appearance Preview */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Kanban Card Pill Preview
                  </span>
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
                    <div className="text-xs font-bold text-slate-200">Alex Morgan — VP Marketing</div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-indigo-950/80 text-indigo-300 border border-indigo-800/80 font-mono text-[10px] font-bold flex items-center gap-1">
                        {currentTypeMeta.icon}
                        <span>{name || 'Custom Field'}:</span>
                        <strong className="text-white">{String(previewValue || currentTypeMeta.defaultVal)}</strong>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Drawer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <Button
              variant="outline"
              size="md"
              onClick={() => setIsDrawerOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={handleSaveField}
              icon={<Check className="w-4 h-4" />}
            >
              {editingField ? 'Save Field Changes' : 'Create Super Field'}
            </Button>
          </div>
        </div>
      </Drawer>
    </div>
  );
};
