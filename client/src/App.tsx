import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { WhatsAppProvider } from './context/WhatsAppContext';
import { Sidebar, AppTab } from './components/common/Sidebar';
import { QrModal } from './components/connection/QrModal';
import { DeviceManagerModal } from './components/devices/DeviceManagerModal';
import { DashboardView } from './components/dashboard/DashboardView';
import { ConversationsView } from './components/conversations/ConversationsView';
import { DedicatedSenderView } from './components/sender/DedicatedSenderView';
import { BulkLidSenderView } from './components/sender/BulkLidSenderView';
import { GroupExtractorView } from './components/extractor/GroupExtractorView';
import { ContactsView } from './components/contacts/ContactsView';
import { TemplatesView } from './components/templates/TemplatesView';
import { SchedulerView } from './components/scheduler/SchedulerView';
import { SubscriptionView } from './components/subscription/SubscriptionView';
import { LoginView } from './components/auth/LoginView';
import { Contact } from './types';
import { MappedContact } from './components/common/CsvUploaderModal';
import { RefreshCw } from 'lucide-react';

const MainLayout: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col md:flex-row font-sans">
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

        {activeTab === 'contacts' && (
          <ContactsView onStartChatWithContact={handleStartChatWithContact} />
        )}

        {activeTab === 'subscription' && (
          <SubscriptionView />
        )}
      </main>

      {/* Universal WhatsApp QR Code Modal & Multi-Device Manager */}
      <QrModal />
      <DeviceManagerModal />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <WhatsAppProvider>
        <MainLayout />
      </WhatsAppProvider>
    </AuthProvider>
  );
};

export default App;

