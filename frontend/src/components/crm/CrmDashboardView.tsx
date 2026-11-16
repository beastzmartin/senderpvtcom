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
  MailCheck,
  Zap,
  TrendingUp
} from 'lucide-react';
import { crmApi, CrmList, CrmTag, CrmCustomFieldDefinition, CrmContact } from './crmApi';
import { ContactsTableView } from './ContactsTableView';
import { ListsSegmentsView } from './ListsSegmentsView';
import { DedupeMergeView } from './DedupeMergeView';
import { CustomFieldsView } from './CustomFieldsView';
import { SuppressionListView } from './SuppressionListView';
import { DeveloperPortalView } from './DeveloperPortalView';
import { FilterBuilderModal } from './FilterBuilderModal';
import { ContactDetailModal } from './ContactDetailModal';
import { ImportWizardModal } from './ImportWizardModal';
import { ExportModal } from './ExportModal';

interface CrmDashboardViewProps {
  onStartWhatsAppChat?: (phone: string) => void;
  onLaunchBulkWhatsApp?: (phones: string[]) => void;
}

export const CrmDashboardView: React.FC<CrmDashboardViewProps> = ({
  onStartWhatsAppChat,
  onLaunchBulkWhatsApp
}) => {
  const [activeTab, setActiveTab] = useState<'contacts' | 'lists' | 'dedupe' | 'fields' | 'suppression' | 'developer'>('contacts');

  // Global CRM state
  const [lists, setLists] = useState<CrmList[]>([]);
  const [tags, setTags] = useState<CrmTag[]>([]);
  const [customFields, setCustomFields] = useState<CrmCustomFieldDefinition[]>([]);
  const [activeFilter, setActiveFilter] = useState<any>(null);

  // Modals state
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  useEffect(() => {
    loadMetadata();
  }, []);

  const loadMetadata = async () => {
    try {
      const [resLists, resTags, resFields] = await Promise.all([
        crmApi.listLists(),
        crmApi.listTags(),
        crmApi.listCustomFields()
      ]);

      if (resLists.success) setLists(resLists.lists || []);
      if (resTags.success) setTags(resTags.tags || []);
      if (resFields.success) setCustomFields(resFields.fields || []);
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
    <div className="space-y-6">
      {/* Top Banner & Stats Overview */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 sm:p-8 rounded-3xl shadow-xl flex flex-wrap items-center justify-between gap-6 relative overflow-hidden">
        <div className="relative z-10 max-w-2xl space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            <Zap className="w-3.5 h-3.5" /> High-Scale PostgreSQL CRM (100M+ Partitioned)
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Enterprise Contacts CRM</h1>
          <p className="text-xs sm:text-sm text-slate-300">
            Ultra-fast cursor pagination, streaming CSV/Excel ingestion, duplicate conflict resolver, and developer REST API (/v1).
          </p>
        </div>

        {/* Quick Actions */}
        <div className="relative z-10 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg transition"
          >
            <FolderPlus className="w-4 h-4" />
            Import CSV / Excel
          </button>
          <button
            type="button"
            onClick={() => setIsExportModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl text-xs font-bold backdrop-blur-sm transition"
          >
            <Download className="w-4 h-4" />
            Export Stream
          </button>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="bg-white p-1.5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => setActiveTab('contacts')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'contacts'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Users className="w-4 h-4" />
          Contacts Directory
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('lists')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'lists'
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
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'dedupe'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <GitMerge className="w-4 h-4" />
          Dedupe & Merge
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('fields')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'fields'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Sliders className="w-4 h-4" />
          Custom Fields ({customFields.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('suppression')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'suppression'
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
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'developer'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Code2 className="w-4 h-4" />
          Developer API & Webhooks (/v1)
        </button>
      </div>

      {/* Main Tab Content */}
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

      {activeTab === 'lists' && (
        <ListsSegmentsView
          lists={lists}
          onReload={loadMetadata}
          onSelectList={(listId) => {
            setActiveTab('contacts');
          }}
        />
      )}

      {activeTab === 'dedupe' && <DedupeMergeView />}

      {activeTab === 'fields' && <CustomFieldsView customFields={customFields} onReload={loadMetadata} />}

      {activeTab === 'suppression' && <SuppressionListView />}

      {activeTab === 'developer' && <DeveloperPortalView />}

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
        onContactUpdated={() => {}}
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
    </div>
  );
};

