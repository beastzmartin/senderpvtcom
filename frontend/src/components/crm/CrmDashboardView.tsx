import React, { useState, useEffect } from 'react';
import {
  Users,
  Database,
  Layers,
  GitMerge,
  Sliders,
  ShieldAlert,
  Code2,
  FolderPlus,
  Download,
  Zap,
  TrendingUp,
  Server,
  ShieldCheck,
  CheckCircle2,
  Kanban,
  BarChart3,
  Command,
  CreditCard,
  Wallet,
  Tag
} from 'lucide-react';
import { crmApi, CrmList, CrmTag, CrmCustomFieldDefinition } from './crmApi';
import { ContactsTableView } from './ContactsTableView';
import { ListsSegmentsView } from './ListsSegmentsView';
import { DedupeMergeView } from './DedupeMergeView';
import { CustomFieldsView } from './CustomFieldsView';
import { SuppressionListView } from './SuppressionListView';
import { DeveloperPortalView } from './DeveloperPortalView';
import { PipelineKanbanView } from './PipelineKanbanView';
import { AnalyticsDashboardView } from './AnalyticsDashboardView';
import { CrmBoardKanbanView } from './CrmBoardKanbanView';
import { SuperFieldsManagerView } from './SuperFieldsManagerView';
import { CustomerBillingView } from './CustomerBillingView';
import { TagsManagerView } from './TagsManagerView';
import { AdminBillingCenter } from './AdminBillingCenter';
import { CrmCommandPalette } from './CrmCommandPalette';
import { FilterBuilderModal } from './FilterBuilderModal';
import { ContactDetailModal } from './ContactDetailModal';
import { ImportWizardModal } from './ImportWizardModal';
import { ExportModal } from './ExportModal';
import { CrmErrorBoundary } from './CrmErrorBoundary';

interface CrmDashboardViewProps {
  onStartWhatsAppChat?: (phone: string) => void;
  onLaunchBulkWhatsApp?: (phones: string[]) => void;
}

export const CrmDashboardView: React.FC<CrmDashboardViewProps> = ({
  onStartWhatsAppChat,
  onLaunchBulkWhatsApp
}) => {
  const [activeTab, setActiveTab] = useState<
    'contacts' | 'boards' | 'pipeline' | 'analytics' | 'lists' | 'dedupe' | 'fields' | 'super_fields' | 'tags_mgmt' | 'billing' | 'admin_billing' | 'suppression' | 'developer'
  >('contacts');

  // Global CRM state
  const [lists, setLists] = useState<CrmList[]>([]);
  const [tags, setTags] = useState<CrmTag[]>([]);
  const [customFields, setCustomFields] = useState<CrmCustomFieldDefinition[]>([]);
  const [activeFilter, setActiveFilter] = useState<any>(null);
  const [totalContactsCount, setTotalContactsCount] = useState<number>(0);
  const [engineInfo, setEngineInfo] = useState<{ is_postgres: boolean; engine: string }>({
    is_postgres: false,
    engine: 'SQLite 3 (Local High-Performance WAL)'
  });

  // Modals state
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  useEffect(() => {
    loadMetadata();

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const loadMetadata = async () => {
    try {
      const [resLists, resTags, resFields, resStatus, resContacts] = await Promise.all([
        crmApi.listLists().catch(() => ({ success: false, lists: [] })),
        crmApi.listTags().catch(() => ({ success: false, tags: [] })),
        crmApi.listCustomFields().catch(() => ({ success: false, fields: [] })),
        crmApi.getStatus().catch(() => ({ success: false, is_postgres: false, engine: 'SQLite 3 Local WAL' })),
        crmApi.fetchContacts({ limit: 1 }).catch(() => ({ success: false, contacts: [], total_approx: 0 }))
      ]);

      if (resLists && resLists.success && Array.isArray(resLists.lists)) {
        setLists(resLists.lists);
      }
      if (resTags && resTags.success && Array.isArray(resTags.tags)) {
        setTags(resTags.tags);
      }
      if (resFields && resFields.success && Array.isArray(resFields.fields)) {
        setCustomFields(resFields.fields);
      }
      if (resStatus && resStatus.success) {
        setEngineInfo({
          is_postgres: Boolean(resStatus.is_postgres),
          engine: resStatus.engine || 'SQLite 3 (Local High-Performance Engine)'
        });
      }
      if (resContacts && typeof resContacts.total_approx === 'number') {
        setTotalContactsCount(resContacts.total_approx);
      }
    } catch (err) {
      console.error('Failed to load CRM metadata:', err);
    }
  };

  const handleLaunchWhatsApp = (phone: string) => {
    if (onStartWhatsAppChat) {
      onStartWhatsAppChat(phone);
    } else {
      window.open(`https://wa.me/${phone.replace(/[^0-9]/g, '')}`, '_blank');
    }
  };

  return (
    <CrmErrorBoundary fallbackTitle="Enterprise CRM View Error" onReset={loadMetadata}>
      <div className="space-y-6">
        {/* Top Hero Banner */}
        <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white p-6 sm:p-8 rounded-3xl shadow-xl border border-slate-800/80 relative overflow-hidden">
          {/* Subtle background glow */}
          <div className="absolute top-0 right-0 -mt-12 -mr-12 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
            <div className="max-w-2xl space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <Server className="w-3.5 h-3.5" />
                <span>{engineInfo.engine}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                Enterprise Contacts CRM
              </h1>
              <p className="text-xs sm:text-sm text-slate-300">
                High-scale architecture with keyset indexed pagination, streaming CSV/Excel pipelines, duplicate conflict resolution, and developer REST API (/v1).
              </p>
            </div>

            {/* Quick Actions */}
            <div className="relative z-10 flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setIsCommandPaletteOpen(true)}
                className="flex items-center gap-2 px-3.5 py-2.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-2xl text-xs font-bold backdrop-blur-sm transition"
                title="Command Palette (Cmd+K)"
              >
                <Command className="w-3.5 h-3.5 text-indigo-300" />
                <span>Cmd+K</span>
              </button>
              <button
                type="button"
                onClick={() => setIsImportModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-bold shadow-lg transition"
              >
                <FolderPlus className="w-4 h-4" />
                Import CSV / Excel
              </button>
              <button
                type="button"
                onClick={() => setIsExportModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-2xl text-xs font-bold backdrop-blur-sm transition"
              >
                <Download className="w-4 h-4" />
                Export Stream
              </button>
            </div>
          </div>
        </div>

        {/* 4 Metric / KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Database Contacts</p>
              <h3 className="text-2xl font-black text-slate-900">
                {totalContactsCount.toLocaleString()}
              </h3>
              <p className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Indexed & Keyset Optimized
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-inner">
              <Users className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Lists & Segments</p>
              <h3 className="text-2xl font-black text-slate-900">{lists.length}</h3>
              <p className="text-[10px] text-indigo-600 font-semibold flex items-center gap-1">
                <Layers className="w-3 h-3" /> Dynamic & Static Audiences
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shadow-inner">
              <Layers className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Custom Schema Fields</p>
              <h3 className="text-2xl font-black text-slate-900">{customFields.length}</h3>
              <p className="text-[10px] text-slate-500 font-semibold flex items-center gap-1">
                <Sliders className="w-3 h-3" /> JSONB Custom Attributes
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shadow-inner">
              <Sliders className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Database Engine</p>
              <h3 className="text-base font-bold text-slate-900 truncate max-w-[150px]">
                {engineInfo.is_postgres ? 'PostgreSQL' : 'SQLite WAL'}
              </h3>
              <p className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Zero-Loss Storage
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-inner">
              <Database className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Sub-Navigation Tabs */}
        <div className="bg-white p-1.5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('contacts')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${activeTab === 'contacts'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
          >
            <Users className="w-4 h-4" />
            Contacts Directory
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('boards')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${activeTab === 'boards'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
          >
            <Kanban className="w-4 h-4" />
            Boards (Kanban)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('super_fields')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${activeTab === 'super_fields'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
          >
            <Sliders className="w-4 h-4" />
            Super Fields (20 Types)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('billing')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${activeTab === 'billing'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
          >
            <Wallet className="w-4 h-4" />
            Plans & Wallet Billing
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('tags_mgmt')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${activeTab === 'tags_mgmt'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
          >
            <Tag className="w-4 h-4" />
            Tags & Rules
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pipeline')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${activeTab === 'pipeline'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
          >
            <Kanban className="w-4 h-4" />
            Deals Pipeline
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${activeTab === 'analytics'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
          >
            <BarChart3 className="w-4 h-4" />
            Funnels & Analytics
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('lists')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${activeTab === 'lists'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
          >
            <Layers className="w-4 h-4" />
            Lists & Segments ({lists.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('dedupe')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${activeTab === 'dedupe'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
          >
            <GitMerge className="w-4 h-4" />
            Dedupe & Merge
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('admin_billing')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${activeTab === 'admin_billing'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
          >
            <CreditCard className="w-4 h-4" />
            Admin Billing
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('suppression')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${activeTab === 'suppression'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
          >
            <ShieldAlert className="w-4 h-4" />
            Suppression List
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('developer')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${activeTab === 'developer'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
          >
            <Code2 className="w-4 h-4" />
            Developer API & Webhooks (/v1)
          </button>
        </div>

        {/* Tab Content Section (Safely Wrapped in Error Boundary) */}
        <CrmErrorBoundary fallbackTitle={`Error in ${activeTab.toUpperCase()} View`} onReset={loadMetadata}>
          {activeTab === 'contacts' && (
            <ContactsTableView
              lists={lists}
              tags={tags}
              customFields={customFields}
              onOpenFilterBuilder={() => setIsFilterModalOpen(true)}
              onOpenImportWizard={() => setIsImportModalOpen(true)}
              onOpenExportModal={() => setIsExportModalOpen(true)}
              onSelectContact={(id) => setSelectedContactId(id)}
              onLaunchWhatsApp={handleLaunchWhatsApp}
              activeFilter={activeFilter}
            />
          )}

          {activeTab === 'boards' && (
            <CrmBoardKanbanView
              onStartWhatsAppChat={handleLaunchWhatsApp}
              onSelectContact={(id) => setSelectedContactId(id)}
            />
          )}

          {activeTab === 'super_fields' && <SuperFieldsManagerView />}

          {activeTab === 'billing' && <CustomerBillingView />}

          {activeTab === 'tags_mgmt' && <TagsManagerView />}

          {activeTab === 'admin_billing' && <AdminBillingCenter />}

          {activeTab === 'pipeline' && (
            <PipelineKanbanView
              onSelectContact={(id) => setSelectedContactId(id)}
              onLaunchWhatsApp={handleLaunchWhatsApp}
            />
          )}

          {activeTab === 'analytics' && <AnalyticsDashboardView />}

          {activeTab === 'lists' && (
            <ListsSegmentsView
              lists={lists}
              onReload={loadMetadata}
              onSelectList={(_listId) => {
                setActiveTab('contacts');
              }}
            />
          )}

          {activeTab === 'dedupe' && <DedupeMergeView />}

          {activeTab === 'fields' && <CustomFieldsView customFields={customFields} onReload={loadMetadata} />}

          {activeTab === 'suppression' && <SuppressionListView />}

          {activeTab === 'developer' && <DeveloperPortalView />}
        </CrmErrorBoundary>

        {/* Modals & Drawers */}
        <FilterBuilderModal
          isOpen={isFilterModalOpen}
          onClose={() => setIsFilterModalOpen(false)}
          customFields={customFields}
          initialFilter={activeFilter}
          onApply={(filter) => setActiveFilter(filter)}
        />

        <ContactDetailModal
          contactId={selectedContactId}
          isOpen={Boolean(selectedContactId)}
          onClose={() => setSelectedContactId(null)}
          customFields={customFields}
          onContactUpdated={() => {
            loadMetadata();
          }}
          onLaunchWhatsApp={handleLaunchWhatsApp}
        />

        <ImportWizardModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          lists={lists}
          onImportCompleted={() => {
            loadMetadata();
          }}
        />

        <ExportModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          activeFilter={activeFilter}
        />

        <CrmCommandPalette
          isOpen={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
          onNavigateTab={(tab) => setActiveTab(tab as any)}
          onSelectContact={(id) => setSelectedContactId(id)}
          onOpenImport={() => setIsImportModalOpen(true)}
          onOpenExport={() => setIsExportModalOpen(true)}
        />
      </div>
    </CrmErrorBoundary>
  );
};
