import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { WhatsAppProvider } from './context/WhatsAppContext';
import { ContactProvider } from './context/ContactContext';
import { Sidebar, AppTab } from './components/common/Sidebar';
import { QrModal } from './components/connection/QrModal';
import { DeviceManagerModal } from './components/devices/DeviceManagerModal';
import { DashboardView } from './components/dashboard/DashboardView';
import { ConversationsView } from './components/conversations/ConversationsView';
import { DedicatedSenderView } from './components/sender/DedicatedSenderView';
import { BulkLidSenderView } from './components/sender/BulkLidSenderView';
import { GroupExtractorView } from './components/extractor/GroupExtractorView';
import { GroupJoinerView } from './components/joiner/GroupJoinerView';
import { ContactsView } from './components/contacts/ContactsView';
import { TemplatesView } from './components/templates/TemplatesView';
import { SchedulerView } from './components/scheduler/SchedulerView';
import { SubscriptionView } from './components/subscription/SubscriptionView';
import { AdminControlCenter } from './components/admin/AdminControlCenter';
import { LoginView } from './components/auth/LoginView';
import { Contact } from './types';
import { MappedContact } from './components/common/CsvUploaderModal';
import { RefreshCw, ShieldAlert, LogOut } from 'lucide-react';

const MainLayout: React.FC<{ activeTab: AppTab; setActiveTab: (tab: AppTab) => void }> = ({
  activeTab,
  setActiveTab
}) => {
  const { isAuthenticated, isLoading, isImpersonating, user, stopImpersonation } = useAuth();
  const [targetConversationId, setTargetConversationId] = useState<string | null>(null);
  const [bulkLidsQueue, setBulkLidsQueue] = useState<string[]>([]);
  const [schedulerAudience, setSchedulerAudience] = useState<MappedContact[]>([]);
  const [selectedTemplateText, setSelectedTemplateText] = useState<string>('');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-600">
        <RefreshCw className="w-8 h-8 animate-spin text-emerald-600 mb-3" />
        <span className="text-sm font-semibold">Initializing WhatsApp Dashboard...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginView />;
  }

  const handleNavigateToConversation = (conversationId: string) => {
    setTargetConversationId(conversationId);
    setActiveTab('conversations');
  };

  const handleStartChatWithContact = (contact: Contact) => {
    setActiveTab('sender');
  };

  const handleLaunchBulkLid = (lids: string[]) => {
    setBulkLidsQueue(lids);
    setActiveTab('bulk');
  };

  const handleUseTemplateInSender = (tplText: string) => {
    setSelectedTemplateText(tplText);
    setActiveTab('bulk');
  };

  const handleUseTemplateInScheduler = (_tplId: string, tplText: string) => {
    setSelectedTemplateText(tplText);
    setActiveTab('scheduler');
  };

  const handleScheduleFromBulk = (audience: MappedContact[]) => {
    setSchedulerAudience(audience);
    setActiveTab('scheduler');
  };

  const handleStopImpersonation = () => {
    stopImpersonation();
    setActiveTab('admin');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {isImpersonating && (
        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 text-slate-950 px-4 py-2 text-xs font-semibold flex flex-wrap items-center justify-between gap-2 shadow-md sticky top-0 z-50">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 bg-slate-900 text-amber-400 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-extrabold">
              <ShieldAlert className="w-3 h-3" />
              ADMIN IMPERSONATION
            </span>
            <span>
              Viewing & managing account as: <strong className="underline">{user?.name} (@{user?.username})</strong>
            </span>
          </div>
          <button
            onClick={handleStopImpersonation}
            className="bg-slate-900 hover:bg-slate-800 text-white px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow"
          >
            <LogOut className="w-3.5 h-3.5" />
            Exit to Admin Panel
          </button>
        </div>
      )}

      <div className="flex-1 flex flex-col md:flex-row">
        {/* Side Navigation (Desktop Fixed Sidebar + Mobile Drawer) */}
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

        {/* Main Content Area */}
        <main className="flex-1 min-w-0 max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8">
        {activeTab === 'dashboard' && (
          <DashboardView onNavigateToConversation={handleNavigateToConversation} />
        )}

        {activeTab === 'conversations' && (
          <ConversationsView
            initialConversationId={targetConversationId}
            onNavigateToSender={() => setActiveTab('sender')}
          />
        )}

        {activeTab === 'sender' && (
          <DedicatedSenderView onNavigateToConversation={handleNavigateToConversation} />
        )}

        {activeTab === 'bulk' && (
          <BulkLidSenderView
            initialLids={bulkLidsQueue}
            initialTemplate={selectedTemplateText}
            onNavigateToConversation={handleNavigateToConversation}
            onScheduleAudience={handleScheduleFromBulk}
            onNavigateToSubscription={() => setActiveTab('subscription')}
          />
        )}

        {activeTab === 'scheduler' && (
          <SchedulerView
            initialAudience={schedulerAudience}
            initialTemplateText={selectedTemplateText}
            onNavigateToSender={() => setActiveTab('bulk')}
          />
        )}

        {activeTab === 'templates' && (
          <TemplatesView
            onUseInBulkSender={handleUseTemplateInSender}
            onUseInScheduler={handleUseTemplateInScheduler}
          />
        )}

        {activeTab === 'extractor' && (
          <GroupExtractorView
            onLaunchBulkLid={handleLaunchBulkLid}
            onNavigateToSubscription={() => setActiveTab('subscription')}
          />
        )}

        {activeTab === 'joiner' && (
          <GroupJoinerView
            onNavigateToExtractor={() => setActiveTab('extractor')}
          />
        )}

        {activeTab === 'contacts' && (
          <ContactsView onStartChatWithContact={handleStartChatWithContact} />
        )}

        {activeTab === 'subscription' && (
          <SubscriptionView />
        )}

        {activeTab === 'admin' && user?.role === 'admin' && (
          <AdminControlCenter onImpersonated={() => setActiveTab('dashboard')} />
        )}
      </main>
      </div>

      {/* Universal WhatsApp QR Code Modal & Multi-Device Manager */}
      <QrModal />
      <DeviceManagerModal />
    </div>
  );
};

const AuthenticatedProviders: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');

  return (
    <ContactProvider key={`contacts_${user?.id || 'guest'}`}>
      <WhatsAppProvider key={`wa_${user?.id || 'guest'}`}>
        <MainLayout activeTab={activeTab} setActiveTab={setActiveTab} />
      </WhatsAppProvider>
    </ContactProvider>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <AuthenticatedProviders />
    </AuthProvider>
  );
};

export default App;

