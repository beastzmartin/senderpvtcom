import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useWhatsApp } from '../../context/WhatsAppContext';
import {
  BulkCampaign,
  BulkCampaignRecipient,
  BulkCampaignSettings,
  DailyQuotaStats,
  CampaignProgressEvent,
  MessageTemplate
} from '../../types';
import { CsvUploaderModal, MappedContact } from '../common/CsvUploaderModal';
import {
  Send,
  Hash,
  ShieldAlert,
  ShieldCheck,
  Shield,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Download,
  Users,
  Copy,
  Check,
  Sparkles,
  Search,
  Database,
  Sliders,
  Play,
  Pause,
  Square,
  RotateCcw,
  Zap,
  Flame,
  FileText,
  FileSpreadsheet,
  Trash2,
  Eye,
  ListFilter,
  ChevronDown,
  ChevronUp,
  Info,
  Calendar,
  Smartphone,
  Layers,
  Key
} from 'lucide-react';

interface BulkLidSenderViewProps {
  initialLids?: string[];
  initialTemplate?: string;
  onNavigateToConversation?: (conversationId: string) => void;
  onScheduleAudience?: (contacts: MappedContact[]) => void;
  onNavigateToSubscription?: () => void;
}

interface LidResolutionItem {
  lid: string;
  phone: string | null;
  jid: string | null;
  name: string | null;
  status: 'resolved' | 'unresolved';
  source?: string;
}

// Spintax test helper on client side
function previewSpintax(text: string): string {
  let spun = text;
  const spintaxRegex = /\{([^{}|]+\|[^{}]+)\}/g;
  let iterations = 0;
  while (spintaxRegex.test(spun) && iterations < 10) {
    spun = spun.replace(spintaxRegex, (_match, choices) => {
      const parts = choices.split('|');
      return parts[Math.floor(Math.random() * parts.length)];
    });
    iterations++;
  }
  return spun
    .replace(/\{lid\}/gi, '7757465940199@lid')
    .replace(/\{name\}/gi, 'Rahul')
    .replace(/\{phone\}/gi, '+919876543210')
    .replace(/\{index\}/gi, '1')
    .replace(/\{total\}/gi, '50')
    .replace(/\{random\}/gi, '7482')
    .replace(/\{time\}/gi, new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    .replace(/\{date\}/gi, new Date().toLocaleDateString());
}

export const BulkLidSenderView: React.FC<BulkLidSenderViewProps> = ({
  initialLids,
  initialTemplate,
  onNavigateToConversation,
  onScheduleAudience,
  onNavigateToSubscription
}) => {
  const { user } = useAuth();
  const { isConnected, setIsQrModalOpen, socket, devices, activeSessionId, setIsDeviceManagerOpen } = useWhatsApp();

  // Multi-Device settings
  const [deviceMode, setDeviceMode] = useState<'round_robin' | 'single'>('round_robin');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(activeSessionId);

  // Navigation tab
  const [activeTab, setActiveTab] = useState<'send' | 'campaigns' | 'convert'>('send');

  // Input states
  const [campaignName, setCampaignName] = useState<string>('');
  const [rawLidsText, setRawLidsText] = useState<string>('');
  const [message, setMessage] = useState<string>(
    initialTemplate ||
    '{Hello|Hi|Hey} {there|friend}! This is an important update for your WhatsApp LID: {lid}. Reference #{random}.'
  );
  const [spintaxPreview, setSpintaxPreview] = useState<string>('');

  // Templates list from backend
  const [templatesList, setTemplatesList] = useState<MessageTemplate[]>([]);

  // CSV Uploader State & custom variable tags
  const [isCsvModalOpen, setIsCsvModalOpen] = useState<boolean>(false);
  const [csvCustomVariables, setCsvCustomVariables] = useState<string[]>([]);
  const [csvMappedContacts, setCsvMappedContacts] = useState<MappedContact[]>([]);

  // Safety Preset & Settings
  const [safetyPreset, setSafetyPreset] = useState<'ultra-safe' | 'balanced' | 'turbo' | 'custom'>('balanced');
  const [showAdvancedSettings, setShowAdvancedSettings] = useState<boolean>(false);
  const [settings, setSettings] = useState<BulkCampaignSettings>({
    minDelaySeconds: 8,
    maxDelaySeconds: 16,
    batchSize: 20,
    batchPauseSeconds: 60,
    simulateTyping: true,
    skipAlreadySentToday: true,
    antiDuplicateScope: 'all_time',
    dailyLimit: 100
  });

  // Batch dispatch to rest of users (e.g. 10, 20, 30 users)
  const [batchToSendCount, setBatchToSendCount] = useState<number>(20);

  // Anti-Repeat / Duplicate check states
  const [antiDuplicateScope, setAntiDuplicateScope] = useState<'all_time' | 'last_7_days' | 'today' | 'none'>('all_time');
  const [duplicateScanResult, setDuplicateScanResult] = useState<import('../../types').DuplicateCheckResult | null>(null);
  const [isScanningDuplicates, setIsScanningDuplicates] = useState<boolean>(false);

  // Daily Quota State
  const [dailyQuota, setDailyQuota] = useState<DailyQuotaStats>({
    sentTodayLid: 0,
    sentTodayTotal: 0,
    dailyLimit: 100,
    remainingLid: 100,
    dateStr: new Date().toISOString().split('T')[0],
    isLimitReached: false
  });
  const [isEditingLimit, setIsEditingLimit] = useState<boolean>(false);
  const [tempDailyLimit, setTempDailyLimit] = useState<number>(100);

  // Active Campaign & Live progress state
  const [activeCampaign, setActiveCampaign] = useState<BulkCampaign | null>(null);
  const [recipientsList, setRecipientsList] = useState<BulkCampaignRecipient[]>([]);
  const [progressState, setProgressState] = useState<CampaignProgressEvent | null>(null);
  const [isLoadingCampaign, setIsLoadingCampaign] = useState<boolean>(false);
  const [campaignFilter, setCampaignFilter] = useState<string>('all');
  const [recipientSearch, setRecipientSearch] = useState<string>('');
  const [selectedRecipientMsg, setSelectedRecipientMsg] = useState<{ lid: string; msg: string } | null>(null);

  // All Campaigns List (for history tab)
  const [campaignsHistory, setCampaignsHistory] = useState<BulkCampaign[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  // Notifications
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [isActionPending, setIsActionPending] = useState<boolean>(false);

  // Resolution Engine States (Tab 3)
  const [isResolving, setIsResolving] = useState<boolean>(false);
  const [isDeepScanning, setIsDeepScanning] = useState<boolean>(false);
  const [resolutionResults, setResolutionResults] = useState<LidResolutionItem[]>([]);
  const [resolutionFilter, setResolutionFilter] = useState<'all' | 'resolved' | 'unresolved'>('all');
  const [resolutionSearch, setResolutionSearch] = useState<string>('');
  const [copiedPhones, setCopiedPhones] = useState<boolean>(false);
  const [saveContactsMsg, setSaveContactsMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pre-fill initial LIDs if passed from Extractor or Contacts
  useEffect(() => {
    if (initialLids && initialLids.length > 0) {
      setRawLidsText(initialLids.join('\n'));
      setCampaignName(`Group Extracted Batch (${initialLids.length} LIDs)`);
    }
  }, [initialLids]);

  useEffect(() => {
    if (initialTemplate) {
      setMessage(initialTemplate);
    }
  }, [initialTemplate]);

  // Parse and validate LIDs
  const parsedLids = rawLidsText
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.endsWith('@lid') ? s : /^\d+$/.test(s) ? `${s}@lid` : s));

  const validLids = Array.from(new Set(parsedLids.filter((s) => s.endsWith('@lid'))));
  const invalidLids = parsedLids.filter((s) => !s.endsWith('@lid'));

  // Load initial daily quota and check active campaign on mount
  useEffect(() => {
    loadDailyQuota();
    loadLatestCampaign();
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const res = await api.templates.list();
      setTemplatesList(res.data || []);
    } catch {
      // ignore
    }
  };

  const loadDailyQuota = async () => {
    try {
      const res = await api.messages.getDailyQuota();
      if (res && res.data) {
        setDailyQuota(res.data);
        setTempDailyLimit(res.data.dailyLimit);
        setSettings((prev) => ({ ...prev, dailyLimit: res.data.dailyLimit }));
      }
    } catch {
      // Non-fatal
    }
  };

  const loadLatestCampaign = async () => {
    setIsLoadingCampaign(true);
    try {
      const res = await api.messages.listCampaigns(1);
      if (res.data && res.data.length > 0) {
        const latest = res.data[0];
        if (latest.status === 'running' || latest.status === 'paused' || latest.status === 'draft') {
          await loadCampaignDetails(latest.id);
        }
      }
    } catch {
      // Non-fatal
    } finally {
      setIsLoadingCampaign(false);
    }
  };

  const loadCampaignDetails = async (campaignId: string) => {
    try {
      const res = await api.messages.getCampaignDetails(campaignId);
      if (res.data) {
        setActiveCampaign(res.data.campaign);
        setRecipientsList(res.data.recipients);
      }
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to load campaign details');
    }
  };

  const loadCampaignHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const res = await api.messages.listCampaigns(40);
      setCampaignsHistory(res.data || []);
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to load campaigns history');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Preset switch handler
  const handleSelectPreset = (preset: 'ultra-safe' | 'balanced' | 'turbo' | 'custom') => {
    setSafetyPreset(preset);
    if (preset === 'ultra-safe') {
      setSettings((prev) => ({
        ...prev,
        minDelaySeconds: 14,
        maxDelaySeconds: 26,
        batchSize: 10,
        batchPauseSeconds: 120,
        simulateTyping: true,
        skipAlreadySentToday: true
      }));
    } else if (preset === 'balanced') {
      setSettings((prev) => ({
        ...prev,
        minDelaySeconds: 8,
        maxDelaySeconds: 16,
        batchSize: 20,
        batchPauseSeconds: 60,
        simulateTyping: true,
        skipAlreadySentToday: true
      }));
    } else if (preset === 'turbo') {
      setSettings((prev) => ({
        ...prev,
        minDelaySeconds: 4,
        maxDelaySeconds: 8,
        batchSize: 40,
        batchPauseSeconds: 20,
        simulateTyping: true,
        skipAlreadySentToday: false
      }));
    }
  };

  // Socket.IO event listeners for live feedback & campaign progress
  useEffect(() => {
    if (!socket) return;

    const handleProgress = (prog: CampaignProgressEvent) => {
      setProgressState(prog);
      if (activeCampaign && prog.campaignId === activeCampaign.id) {
        setActiveCampaign((prev) => (prev ? { ...prev, status: prog.status as any, sent_count: prog.sent, failed_count: prog.failed, skipped_count: prog.skipped } : null));
      }
    };

    const handleRecipientUpdated = (data: { campaignId: string; recipient: BulkCampaignRecipient }) => {
      setRecipientsList((prev) => {
        const idx = prev.findIndex((r) => r.id === data.recipient.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = data.recipient;
          return next;
        }
        return [data.recipient, ...prev];
      });
    };

    const handleStatusChanged = (data: { campaignId: string; status: string; reason?: string }) => {
      if (data.reason) {
        if (data.status === 'paused') {
          setErrorBanner(`Campaign Paused: ${data.reason}`);
        } else {
          setSuccessBanner(`Campaign update: ${data.reason}`);
        }
      }
      setActiveCampaign((prev) => (prev && prev.id === data.campaignId ? { ...prev, status: data.status as any } : prev));
      if (activeCampaign && activeCampaign.id === data.campaignId) {
        loadCampaignDetails(data.campaignId);
      }
    };

    const handleQuotaUpdated = (quota: DailyQuotaStats) => {
      setDailyQuota(quota);
    };

    const handleBatchCompleted = (data: { campaignId: string; sentInBatch: number; remaining: number; reason?: string }) => {
      setSuccessBanner(
        `🎉 Batch complete! Successfully sent to ${data.sentInBatch} recipients. ${data.remaining} remaining users are paused and ready for your next batch whenever you want!`
      );
      if (activeCampaign && activeCampaign.id === data.campaignId) {
        loadCampaignDetails(data.campaignId);
      }
    };

    socket.on('campaign:progress', handleProgress);
    socket.on('campaign:recipient_updated', handleRecipientUpdated);
    socket.on('campaign:status_changed', handleStatusChanged);
    socket.on('campaign:quota_updated', handleQuotaUpdated);
    socket.on('campaign:batch_completed', handleBatchCompleted);

    return () => {
      socket.off('campaign:progress', handleProgress);
      socket.off('campaign:recipient_updated', handleRecipientUpdated);
      socket.off('campaign:status_changed', handleStatusChanged);
      socket.off('campaign:quota_updated', handleQuotaUpdated);
      socket.off('campaign:batch_completed', handleBatchCompleted);
    };
  }, [socket, activeCampaign]);

  // Handle Save Daily Safe Limit
  const handleSaveDailyLimit = async () => {
    try {
      const res = await api.messages.updateDailyQuota(tempDailyLimit);
      setDailyQuota(res.data);
      setSettings((prev) => ({ ...prev, dailyLimit: res.data.dailyLimit }));
      setIsEditingLimit(false);
      setSuccessBanner(`Daily safe limit updated to ${tempDailyLimit} messages.`);
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to update daily limit');
    }
  };

  // Launch New Campaign
  const handleCreateAndStartCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);
    setSuccessBanner(null);

    if (!isConnected) {
      setErrorBanner('WhatsApp is not connected. Connect via QR code to start sending.');
      setIsQrModalOpen(true);
      return;
    }

    if (validLids.length === 0) {
      setErrorBanner('Please enter at least one valid WhatsApp LID (e.g. 7757465940199@lid).');
      return;
    }

    if (!message.trim()) {
      setErrorBanner('Message template cannot be empty.');
      return;
    }

    if (dailyQuota.isLimitReached) {
      setErrorBanner(
        `Today's safe limit of ${dailyQuota.dailyLimit} messages has already been reached. Please adjust the limit or wait until tomorrow to prevent ban.`
      );
      return;
    }

    setIsActionPending(true);

    try {
      const res = await api.messages.createCampaign({
        name: campaignName.trim() || undefined,
        lids: validLids,
        templateMessage: message.trim(),
        settings: {
          ...settings,
          antiDuplicateScope,
          deviceMode,
          senderDeviceId: deviceMode === 'single' ? selectedDeviceId : undefined
        },
        autoStart: true
      });

      setSuccessBanner(`Campaign started! Anti-ban engine is actively monitoring safe rate limits.`);
      await loadCampaignDetails(res.data.id);
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to start campaign');
    } finally {
      setIsActionPending(false);
    }
  };

  // Pause Active Campaign
  const handlePauseCampaign = async () => {
    if (!activeCampaign) return;
    setIsActionPending(true);
    try {
      const res = await api.messages.pauseCampaign(activeCampaign.id);
      setActiveCampaign(res.data);
      setSuccessBanner('Campaign paused gracefully. You can resume anytime without losing progress.');
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to pause campaign');
    } finally {
      setIsActionPending(false);
    }
  };

  // Resume Active Campaign (Optionally with a custom batch limit like 10, 20, 30)
  const handleResumeCampaign = async (batchLimit?: number) => {
    if (!activeCampaign) return;
    if (!isConnected) {
      setErrorBanner('WhatsApp is not connected. Reconnect before resuming.');
      setIsQrModalOpen(true);
      return;
    }
    setIsActionPending(true);
    try {
      const res = await api.messages.startCampaign(activeCampaign.id, batchLimit);
      setActiveCampaign(res.data);
      setSuccessBanner(
        batchLimit
          ? `Dispatched batch for next ${batchLimit} users! The anti-ban engine will send them and pause automatically.`
          : 'Campaign resumed! Continuing to send remaining recipients.'
      );
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to resume campaign');
    } finally {
      setIsActionPending(false);
    }
  };

  // Scan LIDs for duplicates and prior WhatsApp message deliveries (Anti-Repeat)
  const handleScanDuplicates = async () => {
    setErrorBanner(null);
    setSuccessBanner(null);

    if (validLids.length === 0) {
      setErrorBanner('Please enter at least one valid WhatsApp LID to scan.');
      return;
    }

    setIsScanningDuplicates(true);
    try {
      const res = await api.messages.checkDuplicates(validLids, antiDuplicateScope);
      setDuplicateScanResult(res.data);
      if (res.data.alreadySentCount > 0 || res.data.duplicateInListCount > 0) {
        setSuccessBanner(
          `Anti-Repeat Scan Complete: Found ${res.data.duplicateInListCount} duplicate LID(s) and ${res.data.alreadySentCount} recipient(s) who already received messages previously (${antiDuplicateScope}).`
        );
      } else {
        setSuccessBanner(
          `Anti-Repeat Verification Passed: All ${res.data.cleanEligibleCount} LIDs are 100% fresh and have never received messages!`
        );
      }
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to scan duplicates');
    } finally {
      setIsScanningDuplicates(false);
    }
  };

  const handleExcludeAlreadyContacted = () => {
    if (!duplicateScanResult || duplicateScanResult.cleanEligibleLids.length === 0) return;
    setRawLidsText(duplicateScanResult.cleanEligibleLids.join('\n'));
    setSuccessBanner(
      `Filtered list! Excluded ${duplicateScanResult.alreadySentCount} already messaged recipients. Only ${duplicateScanResult.cleanEligibleLids.length} fresh LIDs remain.`
    );
    setDuplicateScanResult(null);
  };

  // Stop/Abort Campaign
  const handleStopCampaign = async () => {
    if (!activeCampaign) return;
    if (!window.confirm('Are you sure you want to stop this campaign? You can start a new campaign later.')) {
      return;
    }
    setIsActionPending(true);
    try {
      const res = await api.messages.stopCampaign(activeCampaign.id);
      setActiveCampaign(res.data);
      setSuccessBanner('Campaign stopped.');
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to stop campaign');
    } finally {
      setIsActionPending(false);
    }
  };

  // Retry All Failed Recipients in Campaign
  const handleRetryFailed = async () => {
    if (!activeCampaign) return;
    setIsActionPending(true);
    try {
      const res = await api.messages.retryFailed(activeCampaign.id);
      setActiveCampaign(res.data);
      await loadCampaignDetails(activeCampaign.id);
      setSuccessBanner('Retrying failed recipients with safe delays...');
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to retry failed recipients');
    } finally {
      setIsActionPending(false);
    }
  };

  // Retry a Single Recipient
  const handleRetrySingle = async (recipientId: string) => {
    if (!activeCampaign) return;
    try {
      await api.messages.retryRecipient(activeCampaign.id, recipientId);
      setSuccessBanner('Message re-dispatched to recipient!');
      await loadCampaignDetails(activeCampaign.id);
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to retry message');
    }
  };

  // Load LIDs from Saved Contacts
  const handleLoadLidContacts = async () => {
    try {
      const res = await api.contacts.list();
      const lidList = res.data.map((c) => c.lid).filter((l): l is string => Boolean(l));
      if (lidList.length === 0) {
        alert('No saved contacts have WhatsApp LIDs yet.');
        return;
      }
      setRawLidsText(lidList.join('\n'));
      setSuccessBanner(`Loaded ${lidList.length} LIDs from saved contacts.`);
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to load contacts');
    }
  };

  // File Upload (.csv or .txt)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setRawLidsText((prev) => (prev ? `${prev}\n${content}` : content));
        setSuccessBanner(`Imported ${file.name} successfully.`);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Deduplicate LIDs
  const handleDeduplicate = () => {
    const unique = Array.from(new Set(validLids));
    setRawLidsText(unique.join('\n'));
    setSuccessBanner(`Cleaned list: ${unique.length} unique WhatsApp LIDs.`);
  };

  // Export Delivery Report CSV
  const handleDownloadDeliveryReport = () => {
    if (recipientsList.length === 0) return;
    const header = 'lid,phone_number,name,status,sent_at,error_message,provider_message_id,sent_message\n';
    const rows = recipientsList
      .map(
        (r) =>
          `"${r.lid}","${r.phone_number || ''}","${(r.name || '').replace(/"/g, '""')}","${r.status}","${r.sent_at || ''}","${(r.error_message || '').replace(/"/g, '""')}","${r.provider_message_id || ''}","${(r.sent_message || '').replace(/"/g, '""')}"`
      )
      .join('\n');

    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bulk_lid_delivery_report_${activeCampaign?.id || Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export Unsent or Failed LIDs to clipboard/txt
  const handleCopyUnsentLids = () => {
    const unsent = recipientsList
      .filter((r) => r.status === 'failed' || r.status === 'pending' || r.status === 'skipped')
      .map((r) => r.lid);

    if (unsent.length === 0) {
      alert('All recipients were sent successfully! No unsent LIDs.');
      return;
    }

    navigator.clipboard.writeText(unsent.join('\n'));
    setSuccessBanner(`Copied ${unsent.length} pending/failed LIDs to clipboard.`);
  };

  // Filter recipients table
  const filteredRecipients = recipientsList.filter((item) => {
    if (campaignFilter !== 'all' && item.status !== campaignFilter) {
      return false;
    }
    if (recipientSearch.trim()) {
      const q = recipientSearch.toLowerCase();
      const matchLid = item.lid.toLowerCase().includes(q);
      const matchPhone = (item.phone_number || '').toLowerCase().includes(q);
      const matchName = (item.name || '').toLowerCase().includes(q);
      if (!matchLid && !matchPhone && !matchName) return false;
    }
    return true;
  });

  // Calculate campaign metrics
  const totalInCamp = activeCampaign?.total_recipients || recipientsList.length || 0;
  const sentInCamp = activeCampaign?.sent_count || recipientsList.filter((r) => r.status === 'sent').length || 0;
  const failedInCamp = activeCampaign?.failed_count || recipientsList.filter((r) => r.status === 'failed').length || 0;
  const skippedInCamp = activeCampaign?.skipped_count || recipientsList.filter((r) => r.status === 'skipped').length || 0;
  const pendingInCamp = Math.max(0, totalInCamp - (sentInCamp + failedInCamp + skippedInCamp));
  const progressPercent = totalInCamp > 0 ? Math.round(((sentInCamp + failedInCamp + skippedInCamp) / totalInCamp) * 100) : 0;

  // -------------------------------------------------------------
  // TAB 3: RESOLUTION ENGINE METHODS (PRESERVED & ENHANCED)
  // -------------------------------------------------------------
  const handleBulkResolve = async (triggerDeepScan = false) => {
    setErrorBanner(null);
    setSuccessBanner(null);
    setSaveContactsMsg(null);

    if (validLids.length === 0) {
      setErrorBanner('Please provide at least one valid WhatsApp LID in the text box.');
      return;
    }

    setIsResolving(true);

    try {
      if (triggerDeepScan && isConnected) {
        setIsDeepScanning(true);
        try {
          await api.contacts.syncGroupLids();
        } catch {
          // ignore
        } finally {
          setIsDeepScanning(false);
        }
      }

      const res = await api.contacts.resolveLids(validLids);
      setResolutionResults(res.results);

      const resolved = res.results.filter((r) => r.status === 'resolved').length;
      setSuccessBanner(
        `Resolved ${resolved} of ${res.total} LIDs to real WhatsApp phone numbers! (${res.unresolved} masked by WhatsApp privacy)`
      );
      setActiveTab('convert');
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to resolve WhatsApp LIDs.');
    } finally {
      setIsResolving(false);
      setIsDeepScanning(false);
    }
  };

  const handleCopyResolvedPhones = () => {
    const phones = resolutionResults
      .filter((r) => r.status === 'resolved' && r.phone)
      .map((r) => r.phone!);

    if (phones.length === 0) {
      alert('No resolved phone numbers available to copy.');
      return;
    }

    navigator.clipboard.writeText(phones.join('\n'));
    setCopiedPhones(true);
    setTimeout(() => setCopiedPhones(false), 3000);
  };

  const handleDownloadResolutionCsv = () => {
    if (resolutionResults.length === 0) return;
    const header = 'lid,real_phone_number,whatsapp_name,status,source\n';
    const rows = resolutionResults
      .map(
        (r) =>
          `"${r.lid}","${r.phone || ''}","${(r.name || '').replace(/"/g, '""')}","${r.status}","${r.source || ''}"`
      )
      .join('\n');

    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resolved_lids_to_phones_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveResolvedToContacts = async () => {
    const resolvedItems = resolutionResults.filter((r) => r.status === 'resolved' && r.phone);
    if (resolvedItems.length === 0) {
      alert('No resolved real numbers to save.');
      return;
    }

    let saved = 0;
    for (const item of resolvedItems) {
      try {
        await api.contacts.create({
          name: item.name || `Contact ${item.phone}`,
          phone_number: item.phone,
          lid: item.lid,
          notes: `Bulk resolved via ${item.source || 'WhatsApp Messenger'}`
        });
        saved++;
      } catch {
        // Skip duplicate
      }
    }

    setSaveContactsMsg(`Saved ${saved} resolved contacts to your address book!`);
  };

  const filteredResolutionResults = resolutionResults.filter((item) => {
    const term = resolutionSearch.toLowerCase().trim();
    if (term) {
      const matchLid = item.lid.toLowerCase().includes(term);
      const matchPhone = (item.phone || '').toLowerCase().includes(term);
      const matchName = (item.name || '').toLowerCase().includes(term);
      if (!matchLid && !matchPhone && !matchName) return false;
    }

    if (resolutionFilter === 'resolved') return item.status === 'resolved';
    if (resolutionFilter === 'unresolved') return item.status === 'unresolved';
    return true;
  });

  const resolvedCount = resolutionResults.filter((r) => r.status === 'resolved').length;
  const unresolvedCount = resolutionResults.filter((r) => r.status === 'unresolved').length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Super Advanced Bulk LID Sender</h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              Anti-Ban System Active
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Safe multi-device LID dispatcher with daily rate limits, humanized delay jitter, spintax rotation, and persistent resume capability.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setIsCsvModalOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            CSV Uploader & Mapper
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".txt,.csv"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition border border-slate-200 shadow-xs"
          >
            <FileText className="w-3.5 h-3.5 text-sky-600" />
            Raw TXT
          </button>
          <button
            type="button"
            onClick={handleLoadLidContacts}
            className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition border border-slate-200 shadow-xs"
          >
            <Users className="w-3.5 h-3.5 text-purple-600" />
            Load Contacts
          </button>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex border-b border-slate-200 space-x-2">
        <button
          type="button"
          onClick={() => setActiveTab('send')}
          className={`pb-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition ${
            activeTab === 'send'
              ? 'border-sky-600 text-sky-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Send className="w-4 h-4" />
          Bulk LID Sender & Live Campaign
          {activeCampaign && activeCampaign.status === 'running' && (
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('campaigns');
            loadCampaignHistory();
          }}
          className={`pb-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition ${
            activeTab === 'campaigns'
              ? 'border-sky-600 text-sky-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <RotateCcw className="w-4 h-4" />
          Campaign History & Resume
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('convert')}
          className={`pb-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition ${
            activeTab === 'convert'
              ? 'border-purple-600 text-purple-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-500" />
          LID to Real Phone Converter
          {resolutionResults.length > 0 && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200">
              {resolvedCount}/{resolutionResults.length}
            </span>
          )}
        </button>
      </div>

      {/* BAN-PROTECTION & DAILY BROADCAST QUOTA WIDGET (Always Visible for Sender & History) */}
      {activeTab !== 'convert' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Left Quota Info */}
            <div className="flex items-start sm:items-center gap-3">
              <div
                className={`p-3 rounded-xl border shrink-0 ${
                  dailyQuota.isLimitReached
                    ? 'bg-rose-50 border-rose-200 text-rose-600'
                    : dailyQuota.sentTodayLid > dailyQuota.dailyLimit * 0.8
                    ? 'bg-amber-50 border-amber-200 text-amber-600'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-600'
                }`}
              >
                <Shield className="w-5 h-5" />
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-slate-900 tracking-wide">
                    Daily Broadcast Quota:
                  </span>
                  {dailyQuota.isTrial || user?.plan_tier === 'trial' ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-amber-100 text-amber-800 border border-amber-300">
                      FREE TRIAL ({dailyQuota.dailyLimit} msgs/day)
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-purple-100 text-purple-800 border border-purple-200">
                      {dailyQuota.planName || user?.plan_tier?.toUpperCase() || 'LICENSE'} ({dailyQuota.dailyLimit.toLocaleString()} msgs/day)
                    </span>
                  )}

                  {dailyQuota.isLimitReached ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                      Daily Limit Reached
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                      Protected & Healthy
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {dailyQuota.isTrial || user?.plan_tier === 'trial'
                    ? `Trial Account • ${dailyQuota.sentTodayLid} of ${dailyQuota.dailyLimit} messages sent today. Upgrade license anytime for higher sending limits.`
                    : `Active License • ${dailyQuota.sentTodayLid.toLocaleString()} of ${dailyQuota.dailyLimit.toLocaleString()} messages dispatched today (resets at midnight).`}
                </p>
              </div>
            </div>

            {/* Right Quota Bar & Controls */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="text-right">
                <div className="text-xs text-slate-600 font-medium">
                  Sent Today:{' '}
                  <span className="font-mono font-bold text-slate-900">
                    {dailyQuota.sentTodayLid}
                  </span>{' '}
                  /{' '}
                  <span className="font-mono text-sky-600 font-bold">
                    {dailyQuota.dailyLimit}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500">
                  Remaining:{' '}
                  <span
                    className={`font-mono font-bold ${
                      dailyQuota.remainingLid > 0 ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {dailyQuota.remainingLid} messages
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-24 sm:w-32 bg-slate-100 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    dailyQuota.isLimitReached
                      ? 'bg-rose-500'
                      : dailyQuota.sentTodayLid > dailyQuota.dailyLimit * 0.8
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{
                    width: `${Math.min(100, (dailyQuota.sentTodayLid / Math.max(1, dailyQuota.dailyLimit)) * 100)}%`
                  }}
                />
              </div>

              {/* Action Button: Upgrade or Admin Edit */}
              {onNavigateToSubscription && (
                <button
                  type="button"
                  onClick={onNavigateToSubscription}
                  className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                  title="View and configure license limits in the License System"
                >
                  <Key className="w-3.5 h-3.5" />
                  {user?.role === 'admin' ? 'Change Limits (Admin)' : 'Upgrade License'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Notification Banners */}
      {errorBanner && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-2 shadow-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="text-rose-600 hover:text-rose-900 text-xs px-2"
          >
            ✕
          </button>
        </div>
      )}

      {successBanner && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between gap-2 shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessBanner(null)}
            className="text-emerald-600 hover:text-emerald-900 text-xs px-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 1: BULK LID SENDER & LIVE CAMPAIGN DASHBOARD          */}
      {/* ======================================================== */}
      {activeTab === 'send' && (
        <div className="space-y-6">
          {/* Active Campaign Status & Controls Banner (If a campaign exists) */}
          {activeCampaign && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase font-bold text-slate-500 tracking-wider">
                      Active Campaign
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        activeCampaign.status === 'running'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 animate-pulse'
                          : activeCampaign.status === 'paused'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : activeCampaign.status === 'completed'
                          ? 'bg-sky-100 text-sky-800 border border-sky-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {activeCampaign.status}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 mt-0.5">{activeCampaign.name}</h3>
                </div>

                {/* Control Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  {activeCampaign.status === 'running' && (
                    <button
                      type="button"
                      disabled={isActionPending}
                      onClick={handlePauseCampaign}
                      className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
                    >
                      <Pause className="w-3.5 h-3.5" />
                      Pause Campaign
                    </button>
                  )}

                  {(activeCampaign.status === 'paused' || activeCampaign.status === 'draft') && (
                    <button
                      type="button"
                      disabled={isActionPending || dailyQuota.isLimitReached}
                      onClick={() => handleResumeCampaign()}
                      className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      Resume Campaign (From #{sentInCamp + 1})
                    </button>
                  )}

                  {failedInCamp > 0 && activeCampaign.status !== 'running' && (
                    <button
                      type="button"
                      disabled={isActionPending}
                      onClick={handleRetryFailed}
                      className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Retry Failed ({failedInCamp})
                    </button>
                  )}

                  {activeCampaign.status === 'running' && (
                    <button
                      type="button"
                      disabled={isActionPending}
                      onClick={handleStopCampaign}
                      className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition border border-slate-200 shadow-xs"
                    >
                      <Square className="w-3 h-3 text-rose-600 fill-current" />
                      Stop
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setActiveCampaign(null);
                      setRecipientsList([]);
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 text-xs font-semibold transition border border-slate-200 shadow-xs"
                    title="Dismiss dashboard view"
                  >
                    New Campaign
                  </button>
                </div>
              </div>

              {/* Real-time Phase / Countdown banner */}
              {progressState && activeCampaign.status === 'running' && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    {progressState.phase === 'typing' && (
                      <>
                        <span className="w-2.5 h-2.5 rounded-full bg-sky-500 animate-ping" />
                        <span className="text-sky-700 font-medium">
                          Simulating human typing presence for{' '}
                          <code className="text-slate-900 font-mono font-semibold">{progressState.currentLid}</code>...
                        </span>
                      </>
                    )}
                    {progressState.phase === 'sending' && (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 text-emerald-600 animate-spin" />
                        <span className="text-emerald-700 font-medium">
                          Sending message to{' '}
                          <code className="text-slate-900 font-mono font-semibold">{progressState.currentLid}</code>...
                        </span>
                      </>
                    )}
                    {progressState.phase === 'delay' && (
                      <>
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        <span className="text-slate-700">
                          Humanized delay before next message:{' '}
                          <span className="text-amber-700 font-mono font-bold">
                            {progressState.phaseCountdownSeconds ?? 8}s
                          </span>
                        </span>
                      </>
                    )}
                    {progressState.phase === 'cooldown' && (
                      <>
                        <Shield className="w-3.5 h-3.5 text-purple-600" />
                        <span className="text-purple-700 font-semibold">
                          Batch pause cooldown (anti-ban protection):{' '}
                          <span className="font-mono text-yellow-700">
                            {progressState.phaseCountdownSeconds ?? 60}s remaining
                          </span>
                        </span>
                      </>
                    )}
                  </div>

                  <span className="text-[11px] text-slate-500 font-mono">
                    Progress: {progressPercent}% ({sentInCamp}/{totalInCamp})
                  </span>
                </div>
              )}

              {/* Progress bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-600">
                    Campaign Progress: {sentInCamp + failedInCamp + skippedInCamp} / {totalInCamp} dispatched
                  </span>
                  <span className="text-sky-600 font-mono font-bold">{progressPercent}%</span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                  <div
                    className="h-full bg-gradient-to-r from-sky-500 via-indigo-500 to-emerald-500 transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* KPI Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <span className="text-slate-500 text-[10px] uppercase font-bold block">Total</span>
                  <span className="font-bold text-slate-900 text-base font-mono">{totalInCamp}</span>
                </div>
                <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-200">
                  <span className="text-emerald-700 text-[10px] uppercase font-bold block">Sent</span>
                  <span className="font-bold text-emerald-700 text-base font-mono">{sentInCamp}</span>
                </div>
                <div className="bg-rose-50 p-2.5 rounded-xl border border-rose-200">
                  <span className="text-rose-700 text-[10px] uppercase font-bold block">Failed</span>
                  <span className="font-bold text-rose-700 text-base font-mono">{failedInCamp}</span>
                </div>
                <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                  <span className="text-amber-700 text-[10px] uppercase font-bold block">Skipped (Anti-Repeat)</span>
                  <span className="font-bold text-amber-700 text-base font-mono">{skippedInCamp}</span>
                </div>
                <div className="bg-sky-50 p-2.5 rounded-xl border border-sky-200">
                  <span className="text-sky-700 text-[10px] uppercase font-bold block">Rest / Remaining</span>
                  <span className="font-bold text-sky-700 text-base font-mono">{pendingInCamp}</span>
                </div>
              </div>

              {/* Batch Dispatch & Send to Rest Controls */}
              {pendingInCamp > 0 ? (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                          <Zap className="w-4 h-4 text-amber-500" />
                          Send to Rest Users (Batch Dispatcher)
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200">
                          {pendingInCamp} Rest Users Ready
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Choose how many of the {pendingInCamp} rest users to send right now (e.g. 10, 20, 30).
                        The engine will dispatch them safely with human delays, update live, and pause automatically.
                        You can come back anytime and send the rest!
                      </p>
                    </div>
                  </div>

                  {/* Batch Limit Choice Chips & Custom Input */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-xs font-semibold text-slate-700">Choose Batch:</span>
                    {[10, 20, 30, 50].map((num) => (
                      <button
                        key={num}
                        type="button"
                        disabled={activeCampaign.status === 'running'}
                        onClick={() => setBatchToSendCount(num)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                          batchToSendCount === num
                            ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {num} Users
                      </button>
                    ))}

                    <button
                      type="button"
                      disabled={activeCampaign.status === 'running'}
                      onClick={() => setBatchToSendCount(pendingInCamp)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                        batchToSendCount === pendingInCamp
                          ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                          : 'bg-white text-purple-700 border-purple-200 hover:bg-purple-50'
                      }`}
                    >
                      All Remaining ({pendingInCamp})
                    </button>

                    <div className="flex items-center gap-1.5 sm:ml-auto">
                      <span className="text-xs text-slate-600">Custom count:</span>
                      <input
                        type="number"
                        min="1"
                        max={pendingInCamp}
                        value={batchToSendCount}
                        disabled={activeCampaign.status === 'running'}
                        onChange={(e) => setBatchToSendCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        className="w-16 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 font-mono text-center focus:outline-none focus:border-sky-500 shadow-xs"
                      />
                      <span className="text-xs text-slate-500">users</span>
                    </div>
                  </div>

                  {/* Dispatch Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200">
                    {activeCampaign.status !== 'running' ? (
                      <>
                        <button
                          type="button"
                          disabled={isActionPending || dailyQuota.isLimitReached}
                          onClick={() => handleResumeCampaign(batchToSendCount)}
                          className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-2 transition shadow-xs"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          Send Next {Math.min(batchToSendCount, pendingInCamp)} Users Now
                        </button>

                        {pendingInCamp > batchToSendCount && (
                          <button
                            type="button"
                            disabled={isActionPending || dailyQuota.isLimitReached}
                            onClick={() => handleResumeCampaign()}
                            className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
                          >
                            <Zap className="w-3.5 h-3.5 text-amber-500" />
                            Send All Remaining ({pendingInCamp})
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={isActionPending}
                        onClick={handlePauseCampaign}
                        className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center gap-2 transition shadow-xs"
                      >
                        <Pause className="w-3.5 h-3.5" />
                        Pause Dispatch Gracefully
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-emerald-800 font-semibold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    All recipients in this campaign have been processed!
                  </div>
                  {failedInCamp > 0 && (
                    <button
                      type="button"
                      disabled={isActionPending}
                      onClick={handleRetryFailed}
                      className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold flex items-center gap-1 transition shadow-xs"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Retry {failedInCamp} Failed Recipients
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* New Campaign Creation Form (Shown if no active campaign or starting a new one) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
            <form onSubmit={handleCreateAndStartCampaign} className="space-y-6">
              {/* Campaign Title & Import */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-800 block mb-1.5">
                    Campaign Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    placeholder="e.g. Community Announcement Batch #1"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-sky-500 shadow-xs"
                  />
                </div>

                {/* Safety Presets Selector */}
                <div>
                  <label className="text-xs font-semibold text-slate-800 block mb-1.5 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-emerald-600" />
                    Anti-Ban Safety Preset
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleSelectPreset('ultra-safe')}
                      className={`py-2 px-2 rounded-xl text-[11px] font-bold border transition flex flex-col items-center gap-0.5 ${
                        safetyPreset === 'ultra-safe'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300 shadow-xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <span className="flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-emerald-600" />
                        Ultra-Safe
                      </span>
                      <span className="text-[9px] font-normal text-slate-500">14-26s delay</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectPreset('balanced')}
                      className={`py-2 px-2 rounded-xl text-[11px] font-bold border transition flex flex-col items-center gap-0.5 ${
                        safetyPreset === 'balanced'
                          ? 'bg-sky-50 text-sky-800 border-sky-300 shadow-xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <span className="flex items-center gap-1">
                        <Zap className="w-3 h-3 text-sky-600" />
                        Balanced
                      </span>
                      <span className="text-[9px] font-normal text-slate-500">8-16s delay</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectPreset('turbo')}
                      className={`py-2 px-2 rounded-xl text-[11px] font-bold border transition flex flex-col items-center gap-0.5 ${
                        safetyPreset === 'turbo'
                          ? 'bg-amber-50 text-amber-800 border-amber-300 shadow-xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <span className="flex items-center gap-1">
                        <Flame className="w-3 h-3 text-amber-600" />
                        Turbo
                      </span>
                      <span className="text-[9px] font-normal text-slate-500">4-8s delay</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Advanced Controls Toggle & Accordion */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                  className="text-xs font-semibold text-sky-600 hover:text-sky-700 flex items-center gap-1 transition"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  {showAdvancedSettings ? 'Hide Detailed Anti-Ban Parameters' : 'Fine-Tune Anti-Ban Parameters (Delays, Batching, Typing)'}
                  {showAdvancedSettings ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {showAdvancedSettings && (
                  <div className="mt-3 p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    <div>
                      <label className="font-semibold text-slate-800 block mb-1">
                        Delay Interval (Min - Max seconds)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="2"
                          max="60"
                          value={settings.minDelaySeconds}
                          onChange={(e) =>
                            setSettings((prev) => ({
                              ...prev,
                              minDelaySeconds: parseInt(e.target.value, 10) || 5
                            }))
                          }
                          className="w-16 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900 font-mono text-center shadow-xs"
                        />
                        <span className="text-slate-500">to</span>
                        <input
                          type="number"
                          min="3"
                          max="120"
                          value={settings.maxDelaySeconds}
                          onChange={(e) =>
                            setSettings((prev) => ({
                              ...prev,
                              maxDelaySeconds: parseInt(e.target.value, 10) || 12
                            }))
                          }
                          className="w-16 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900 font-mono text-center shadow-xs"
                        />
                        <span className="text-slate-500 text-[11px]">sec</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">Randomized delay between each message</p>
                    </div>

                    <div>
                      <label className="font-semibold text-slate-800 block mb-1">
                        Batch Size & Cooldown Pause
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="5"
                          max="100"
                          value={settings.batchSize}
                          onChange={(e) =>
                            setSettings((prev) => ({
                              ...prev,
                              batchSize: parseInt(e.target.value, 10) || 20
                            }))
                          }
                          className="w-16 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900 font-mono text-center shadow-xs"
                        />
                        <span className="text-slate-500">msgs, pause</span>
                        <input
                          type="number"
                          min="10"
                          max="600"
                          value={settings.batchPauseSeconds}
                          onChange={(e) =>
                            setSettings((prev) => ({
                              ...prev,
                              batchPauseSeconds: parseInt(e.target.value, 10) || 60
                            }))
                          }
                          className="w-16 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900 font-mono text-center shadow-xs"
                        />
                        <span className="text-slate-500 text-[11px]">sec</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">Cooldown pause after every batch</p>
                    </div>

                    <div className="space-y-2">
                      <label className="font-semibold text-slate-800 block">
                        Advanced Toggles
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-slate-700 text-xs">
                        <input
                          type="checkbox"
                          checked={settings.simulateTyping}
                          onChange={(e) =>
                            setSettings((prev) => ({ ...prev, simulateTyping: e.target.checked }))
                          }
                          className="rounded border-slate-300 accent-sky-600"
                        />
                        <span>Simulate typing presence (composing)</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer text-slate-700 text-xs">
                        <input
                          type="checkbox"
                          checked={settings.skipAlreadySentToday}
                          onChange={(e) =>
                            setSettings((prev) => ({
                              ...prev,
                              skipAlreadySentToday: e.target.checked
                            }))
                          }
                          className="rounded border-slate-300 accent-sky-600"
                        />
                        <span>Skip LIDs messaged in last 24 hours</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Multi-Device Account Dispatcher & Anti-Ban Routing */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">Multi-Device Dispatch & Anti-Ban Routing</h4>
                      <p className="text-[11px] text-slate-500">
                        {devices.filter((d) => d.status === 'connected').length} of {devices.length} account(s) online
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsDeviceManagerOpen(true)}
                    className="px-2.5 py-1 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200 transition shadow-2xs flex items-center gap-1 self-start sm:self-auto"
                  >
                    <Layers className="w-3.5 h-3.5 text-emerald-600" />
                    Manage Accounts
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <label
                    className={`p-3 rounded-xl border cursor-pointer transition flex items-start gap-2.5 ${
                      deviceMode === 'round_robin'
                        ? 'bg-white border-emerald-500 ring-2 ring-emerald-500/10 shadow-xs'
                        : 'bg-white/60 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="bulkDeviceMode"
                      checked={deviceMode === 'round_robin'}
                      onChange={() => setDeviceMode('round_robin')}
                      className="mt-0.5 accent-emerald-600"
                    />
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                        <span>⚡ Smart Multi-Device Rotation</span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          Anti-Ban
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Cycles each message through all connected WhatsApp accounts to distribute velocity and avoid ban.
                      </p>
                    </div>
                  </label>

                  <label
                    className={`p-3 rounded-xl border cursor-pointer transition flex items-start gap-2.5 ${
                      deviceMode === 'single'
                        ? 'bg-white border-emerald-500 ring-2 ring-emerald-500/10 shadow-xs'
                        : 'bg-white/60 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="bulkDeviceMode"
                      checked={deviceMode === 'single'}
                      onChange={() => setDeviceMode('single')}
                      className="mt-0.5 accent-emerald-600"
                    />
                    <div className="space-y-1.5 w-full">
                      <div className="font-bold text-xs text-slate-900">
                        Single Specific Account
                      </div>
                      <select
                        disabled={deviceMode !== 'single'}
                        value={selectedDeviceId}
                        onChange={(e) => setSelectedDeviceId(e.target.value)}
                        className="w-full px-2.5 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 disabled:opacity-50"
                      >
                        {devices.map((dev) => (
                          <option key={dev.session_id} value={dev.session_id}>
                            {dev.alias} ({dev.phone_number || dev.status}) {dev.is_default ? '⭐' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </label>
                </div>
              </div>

              {/* Target LIDs Input Box */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  <label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <Hash className="w-4 h-4 text-sky-600" />
                    Target WhatsApp LIDs List
                  </label>
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-700 font-mono border border-sky-200">
                      {validLids.length} valid LIDs
                    </span>
                    {invalidLids.length > 0 && (
                      <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-mono border border-rose-200">
                        {invalidLids.length} invalid
                      </span>
                    )}
                    {validLids.length > 0 && (
                      <button
                        type="button"
                        onClick={handleDeduplicate}
                        className="px-2 py-0.5 rounded bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-xs transition"
                      >
                        Remove Duplicates
                      </button>
                    )}
                  </div>
                </div>

                <textarea
                  rows={4}
                  value={rawLidsText}
                  onChange={(e) => setRawLidsText(e.target.value)}
                  placeholder="Enter or paste WhatsApp LIDs (one per line, comma or space separated)...&#10;7757465940199@lid&#10;8819204910294@lid&#10;9928104810291"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-sky-500 font-mono resize-none leading-relaxed shadow-xs"
                />
              </div>

              {/* Anti-Repeat & Duplicate Scanning Section */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      Anti-Repeat Protection (No Duplicate Messages)
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Guarantees that recipients who already received messages previously will not be sent duplicate messages.
                    </p>
                  </div>

                  {validLids.length > 0 && (
                    <button
                      type="button"
                      disabled={isScanningDuplicates}
                      onClick={handleScanDuplicates}
                      className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-sky-700 border border-sky-200 text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
                    >
                      <Search className={`w-3.5 h-3.5 ${isScanningDuplicates ? 'animate-spin' : ''}`} />
                      Scan Duplicates & Past Contacts
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
                  {[
                    { id: 'all_time', label: 'All-Time Anti-Repeat', desc: 'Never repeat anyone ever messaged' },
                    { id: 'last_7_days', label: 'Last 7 Days', desc: 'Exclude contacts sent in last 7 days' },
                    { id: 'today', label: 'Last 24 Hours', desc: 'Exclude contacts sent today' },
                    { id: 'none', label: 'No History Check', desc: 'Allow all in this list' }
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setAntiDuplicateScope(opt.id as any)}
                      className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                        antiDuplicateScope === opt.id
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <span className="font-bold text-[11px] block">{opt.label}</span>
                      <span className="text-[9px] text-slate-500 mt-0.5 block">{opt.desc}</span>
                    </button>
                  ))}
                </div>

                {/* Duplicate Scan Results Preview Box */}
                {duplicateScanResult && (
                  <div className="p-3 rounded-xl bg-white border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-slate-600">
                        Total Input: <strong className="text-slate-900 font-mono">{duplicateScanResult.totalInput}</strong>
                      </span>
                      <span>•</span>
                      <span className="text-amber-700">
                        Duplicates in List: <strong className="font-mono">{duplicateScanResult.duplicateInListCount}</strong>
                      </span>
                      <span>•</span>
                      <span className="text-rose-700">
                        Already Contacted: <strong className="font-mono">{duplicateScanResult.alreadySentCount}</strong>
                      </span>
                      <span>•</span>
                      <span className="text-emerald-700">
                        Fresh Eligible: <strong className="font-mono">{duplicateScanResult.cleanEligibleCount}</strong>
                      </span>
                    </div>

                    {duplicateScanResult.alreadySentCount > 0 && (
                      <button
                        type="button"
                        onClick={handleExcludeAlreadyContacted}
                        className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition shadow-xs whitespace-nowrap"
                      >
                        🧹 Exclude {duplicateScanResult.alreadySentCount} Already Contacted
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Message Template & Spintax Assistant */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  <label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <span>Message Template with Spintax & Dynamic Tags</span>
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                      Prevents Spam Detection
                    </span>
                  </label>

                  <div className="flex items-center gap-2">
                    {templatesList.length > 0 && (
                      <select
                        onChange={(e) => {
                          const tpl = templatesList.find((t) => t.id === e.target.value);
                          if (tpl) {
                            setMessage(tpl.content);
                            setSpintaxPreview('');
                          }
                        }}
                        defaultValue=""
                        className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[11px] text-purple-700 font-semibold focus:outline-none focus:border-purple-500 cursor-pointer shadow-xs"
                      >
                        <option value="" disabled>-- Load Saved Template --</option>
                        {templatesList.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.category})
                          </option>
                        ))}
                      </select>
                    )}
                    <span className="text-[11px] text-slate-500 font-mono">{message.length} chars</span>
                  </div>
                </div>

                <textarea
                  rows={4}
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    setSpintaxPreview('');
                  }}
                  placeholder="Use Spintax {Hello|Hi|Hey} and tags {lid}, {name}, {random}..."
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-sky-500 resize-none leading-relaxed shadow-xs"
                />

                {/* Tags helpers & Spintax tester */}
                <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="text-slate-500">Insert:</span>
                    {[
                      { tag: '{lid}', desc: 'LID' },
                      { tag: '{name}', desc: 'Name' },
                      { tag: '{random}', desc: 'Random #' },
                      { tag: '{index}', desc: 'Index' },
                      { tag: '{total}', desc: 'Total' },
                      { tag: '{time}', desc: 'Time' },
                      { tag: '{date}', desc: 'Date' }
                    ].map(({ tag, desc }) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setMessage((prev) => `${prev} ${tag}`)}
                        className="px-2 py-0.5 rounded bg-white hover:bg-slate-50 text-sky-700 border border-slate-200 text-[11px] font-mono transition shadow-xs"
                      >
                        {tag} <span className="text-slate-500 text-[10px]">({desc})</span>
                      </button>
                    ))}

                    {/* Detected CSV Custom Column Variables */}
                    {csvCustomVariables.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setMessage((prev) => `${prev} {${v}}`)}
                        className="px-2 py-0.5 rounded bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-[11px] font-mono transition shadow-xs"
                        title="Custom column mapped from CSV"
                      >
                        {`{${v}}`} <span className="text-purple-600 text-[10px]">(CSV)</span>
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setSpintaxPreview(previewSpintax(message))}
                    className="px-2.5 py-1 rounded bg-white hover:bg-purple-50 text-purple-700 border border-purple-200 text-xs font-semibold flex items-center gap-1 transition shadow-xs"
                  >
                    <Eye className="w-3 h-3 text-purple-600" />
                    Preview Spintax Variation
                  </button>
                </div>

                {/* Spintax live test card */}
                {spintaxPreview && (
                  <div className="mt-3 p-3 rounded-xl bg-purple-50 border border-purple-200 text-xs space-y-1">
                    <span className="text-[10px] uppercase font-bold text-purple-700 block">
                      Sample Generated Message Preview:
                    </span>
                    <p className="text-purple-950 italic">{spintaxPreview}</p>
                  </div>
                )}
              </div>

              {/* Submit / Launch Button */}
              <button
                type="submit"
                disabled={isActionPending || validLids.length === 0 || dailyQuota.isLimitReached}
                className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-sky-600 via-indigo-600 to-emerald-600 hover:from-sky-500 hover:to-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm shadow-md flex items-center justify-center gap-2 transition"
              >
                {isActionPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Initializing Safe Bulk Campaign...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Launch Safe Bulk Campaign ({validLids.length} WhatsApp LIDs)
                  </>
                )}
              </button>
            </form>
          </div>

          {/* ======================================================== */}
          {/* DETAILED RECIPIENTS BREAKDOWN & RESUME CONTROLS TABLE     */}
          {/* ======================================================== */}
          {recipientsList.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <ListFilter className="w-4 h-4 text-sky-600" />
                    Recipient Delivery Details ({recipientsList.length})
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Track real-time delivery status, error reasons, timestamps, and retry individual recipients.
                  </p>
                </div>

                {/* Export & Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadDeliveryReport}
                    className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-600" />
                    Export CSV Report
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyUnsentLids}
                    className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
                  >
                    <Copy className="w-3.5 h-3.5 text-sky-600" />
                    Copy Unsent LIDs
                  </button>
                </div>
              </div>

              {/* Filter Tabs & Search Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <div className="flex border border-slate-200 rounded-xl overflow-hidden text-xs">
                  {[
                    { id: 'all', label: `All (${recipientsList.length})` },
                    { id: 'sent', label: `Sent (${sentInCamp})` },
                    { id: 'failed', label: `Failed (${failedInCamp})` },
                    { id: 'skipped', label: `Skipped (${skippedInCamp})` },
                    { id: 'pending', label: `Pending (${pendingInCamp})` }
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setCampaignFilter(f.id)}
                      className={`px-3 py-1.5 capitalize transition ${
                        campaignFilter === f.id
                          ? 'bg-sky-600 text-white font-semibold'
                          : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search by LID, phone or name..."
                    value={recipientSearch}
                    onChange={(e) => setRecipientSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-sky-500 shadow-xs"
                  />
                </div>
              </div>

              {/* Table of Recipients */}
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[460px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 sticky top-0 text-[11px] font-semibold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-4">#</th>
                      <th className="py-2.5 px-4">Recipient WhatsApp LID</th>
                      <th className="py-2.5 px-4">Phone / Contact</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4">Time Sent</th>
                      <th className="py-2.5 px-4">Error / Message</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredRecipients.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500 text-xs">
                          No recipients match the selected filter.
                        </td>
                      </tr>
                    ) : (
                      filteredRecipients.map((rec, idx) => (
                        <tr key={rec.id} className="hover:bg-slate-50/80 transition">
                          <td className="py-2.5 px-4 text-slate-400 font-mono text-[11px]">
                            {idx + 1}
                          </td>

                          <td className="py-2.5 px-4">
                            <div className="flex items-center gap-1.5">
                              <code className="text-sky-700 font-mono text-[11px] bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">
                                {rec.lid}
                              </code>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(rec.lid);
                                }}
                                className="text-slate-400 hover:text-slate-700 p-0.5"
                                title="Copy LID"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          </td>

                          <td className="py-2.5 px-4">
                            {rec.phone_number ? (
                              <div>
                                <span className="font-mono text-emerald-700 font-semibold block text-[11px]">
                                  {rec.phone_number}
                                </span>
                                {rec.name && (
                                  <span className="text-[10px] text-slate-500">{rec.name}</span>
                                )}
                              </div>
                            ) : rec.name ? (
                              <span className="text-slate-700">{rec.name}</span>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">Anonymous LID</span>
                            )}
                          </td>

                          <td className="py-2.5 px-4">
                            {rec.status === 'sent' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1 w-fit">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                SENT
                              </span>
                            )}
                            {rec.status === 'failed' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 flex items-center gap-1 w-fit">
                                <AlertCircle className="w-3 h-3 text-rose-600" />
                                FAILED
                              </span>
                            )}
                            {rec.status === 'sending' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200 flex items-center gap-1 w-fit">
                                <RefreshCw className="w-3 h-3 text-sky-600 animate-spin" />
                                SENDING
                              </span>
                            )}
                            {rec.status === 'skipped' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1 w-fit">
                                <Shield className="w-3 h-3 text-amber-600" />
                                SKIPPED (24H)
                              </span>
                            )}
                            {rec.status === 'pending' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1 w-fit">
                                <Clock className="w-3 h-3 text-slate-500" />
                                PENDING
                              </span>
                            )}
                          </td>

                          <td className="py-2.5 px-4 text-slate-500 text-[11px]">
                            {rec.sent_at ? new Date(rec.sent_at).toLocaleTimeString() : '—'}
                          </td>

                          <td className="py-2.5 px-4 max-w-xs truncate">
                            {rec.error_message ? (
                              <span className="text-rose-600 text-[11px]" title={rec.error_message}>
                                {rec.error_message}
                              </span>
                            ) : rec.sent_message ? (
                              <button
                                type="button"
                                onClick={() => setSelectedRecipientMsg({ lid: rec.lid, msg: rec.sent_message! })}
                                className="text-sky-600 hover:underline text-[11px] truncate block max-w-xs text-left"
                              >
                                {rec.sent_message}
                              </button>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          <td className="py-2.5 px-4 text-right">
                            {rec.status === 'failed' && (
                              <button
                                type="button"
                                onClick={() => handleRetrySingle(rec.id)}
                                className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold transition shadow-xs"
                              >
                                Retry
                              </button>
                            )}
                            {rec.status === 'sent' && rec.sent_message && (
                              <button
                                type="button"
                                onClick={() => setSelectedRecipientMsg({ lid: rec.lid, msg: rec.sent_message! })}
                                className="p-1 text-slate-400 hover:text-slate-700"
                                title="View sent text"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: CAMPAIGN HISTORY & RESUMPTION                     */}
      {/* ======================================================== */}
      {activeTab === 'campaigns' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-sky-600" />
                Previous Bulk Campaigns
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                All campaigns are safely recorded in SQLite. You can resume unfinished or paused campaigns at any time.
              </p>
            </div>

            <button
              type="button"
              onClick={loadCampaignHistory}
              disabled={isLoadingHistory}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {campaignsHistory.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              No previous campaigns found. Start your first bulk campaign from the "Bulk LID Sender" tab!
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {campaignsHistory.map((c) => (
                <div
                  key={c.id}
                  className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-slate-300 transition"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">{c.name}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          c.status === 'running'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : c.status === 'paused'
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : c.status === 'completed'
                            ? 'bg-sky-100 text-sky-800 border border-sky-200'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-3">
                      <span>Created: {new Date(c.created_at).toLocaleString()}</span>
                      <span>•</span>
                      <span>Total: <strong className="text-slate-900">{c.total_recipients}</strong></span>
                      <span>•</span>
                      <span className="text-emerald-700">Sent: <strong>{c.sent_count}</strong></span>
                      <span>•</span>
                      <span className="text-rose-700">Failed: <strong>{c.failed_count}</strong></span>
                      {c.skipped_count > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-amber-700">Skipped: <strong>{c.skipped_count}</strong></span>
                        </>
                      )}
                      <span>•</span>
                      <span className="text-sky-700 font-semibold">
                        Remaining: <strong className="text-sky-800 font-mono">{Math.max(0, c.total_recipients - (c.sent_count + c.failed_count + c.skipped_count))}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {Math.max(0, c.total_recipients - (c.sent_count + c.failed_count + c.skipped_count)) > 0 && (
                      <button
                        type="button"
                        onClick={async () => {
                          await loadCampaignDetails(c.id);
                          setActiveTab('send');
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
                      >
                        <Zap className="w-3.5 h-3.5 text-amber-300" />
                        Send Next Batch
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={async () => {
                        await loadCampaignDetails(c.id);
                        setActiveTab('send');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition border border-slate-200 shadow-xs"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Details
                    </button>

                    {(c.status === 'paused' || c.status === 'draft') && (
                      <button
                        type="button"
                        onClick={async () => {
                          await loadCampaignDetails(c.id);
                          await api.messages.startCampaign(c.id);
                          setActiveTab('send');
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        Resume
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={async () => {
                        if (window.confirm('Delete this campaign record?')) {
                          await api.messages.deleteCampaign(c.id);
                          loadCampaignHistory();
                        }
                      }}
                      className="p-2 rounded-xl bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200 transition shadow-xs"
                      title="Delete Campaign"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: BULK LID TO REAL PHONE CONVERTER (PRESERVED)      */}
      {/* ======================================================== */}
      {activeTab === 'convert' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  Bulk LID Resolution Engine
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Input WhatsApp LIDs to resolve real international phone numbers from groups, chats, and directory records.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-xl bg-purple-50 border border-purple-200 text-xs font-mono text-purple-700">
                  {validLids.length} LIDs in queue
                </span>
              </div>
            </div>

            <textarea
              rows={4}
              disabled={isResolving}
              value={rawLidsText}
              onChange={(e) => setRawLidsText(e.target.value)}
              placeholder="Paste WhatsApp LIDs (e.g. 7757465940199@lid or pure digits)..."
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-purple-500 font-mono resize-none leading-relaxed shadow-xs"
            />

            {/* Action buttons for resolution */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleBulkResolve(false)}
                disabled={isResolving || validLids.length === 0}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center gap-2 transition shadow-xs"
              >
                {isResolving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Resolving LIDs in Bulk...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                    Resolve LIDs to Real Numbers ({validLids.length})
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleBulkResolve(true)}
                disabled={isResolving || validLids.length === 0 || !isConnected}
                className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center gap-2 transition disabled:opacity-50 shadow-xs"
                title="Scan all groups first for fresh participant mappings before resolving"
              >
                <Database className={`w-3.5 h-3.5 ${isDeepScanning ? 'animate-spin text-purple-600' : 'text-purple-600'}`} />
                {isDeepScanning ? 'Scanning All Groups...' : 'Deep Scan Groups + Resolve'}
              </button>
            </div>
          </div>

          {/* Results Section */}
          {resolutionResults.length > 0 && (
            <div className="pt-6 border-t border-slate-200 space-y-4">
              {/* Summary Stats Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <span className="text-slate-500 text-[10px] uppercase font-bold block">Total LIDs</span>
                  <span className="text-lg font-bold text-slate-900">{resolutionResults.length}</span>
                </div>

                <div className="bg-emerald-50 p-3.5 rounded-xl border border-emerald-200">
                  <span className="text-emerald-700 text-[10px] uppercase font-bold block">Real Phone Numbers</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-lg font-bold text-emerald-700">{resolvedCount}</span>
                    <span className="text-xs text-emerald-600 font-mono">
                      ({Math.round((resolvedCount / resolutionResults.length) * 100)}%)
                    </span>
                  </div>
                </div>

                <div className="bg-amber-50 p-3.5 rounded-xl border border-amber-200">
                  <span className="text-amber-700 text-[10px] uppercase font-bold block">Privacy Masked</span>
                  <span className="text-lg font-bold text-amber-700">{unresolvedCount}</span>
                </div>

                <div className="bg-purple-50 p-3.5 rounded-xl border border-purple-200 flex flex-col justify-center">
                  <span className="text-purple-700 text-[10px] uppercase font-bold block">Database Match</span>
                  <span className="text-xs text-slate-600 mt-0.5">Verified via WhatsApp multi-device directory</span>
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyResolvedPhones}
                    disabled={resolvedCount === 0}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold text-xs flex items-center gap-1.5 transition shadow-xs"
                  >
                    {copiedPhones ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedPhones ? 'Copied Real Numbers!' : `Copy Real Numbers (${resolvedCount})`}
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadResolutionCsv}
                    className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5 text-sky-600" />
                    Download CSV Report
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveResolvedToContacts}
                    disabled={resolvedCount === 0}
                    className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-40 shadow-xs"
                  >
                    <Users className="w-3.5 h-3.5 text-purple-600" />
                    Save Real Numbers to Contacts
                  </button>
                </div>

                {/* Filter and Search */}
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-48">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="Search results..."
                      value={resolutionSearch}
                      onChange={(e) => setResolutionSearch(e.target.value)}
                      className="w-full pl-8 pr-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-purple-500 shadow-xs"
                    />
                  </div>

                  <div className="flex border border-slate-200 rounded-xl overflow-hidden text-xs">
                    {(['all', 'resolved', 'unresolved'] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setResolutionFilter(f)}
                        className={`px-2.5 py-1.5 capitalize transition ${
                          resolutionFilter === f
                            ? 'bg-purple-600 text-white font-semibold'
                            : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Resolved Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 sticky top-0 text-[11px] font-semibold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-4">WhatsApp LID</th>
                      <th className="py-2.5 px-4">Real Phone Number</th>
                      <th className="py-2.5 px-4">WhatsApp Name</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredResolutionResults.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500 text-xs">
                          No items match the selected filter or search.
                        </td>
                      </tr>
                    ) : (
                      filteredResolutionResults.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80 transition">
                          <td className="py-2.5 px-4">
                            <code className="text-sky-700 font-mono text-[11px] bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">
                              {item.lid}
                            </code>
                          </td>

                          <td className="py-2.5 px-4">
                            {item.phone ? (
                              <div className="flex items-center gap-1.5">
                                <code className="text-emerald-700 font-mono text-[11px] font-bold">
                                  {item.phone}
                                </code>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(item.phone!);
                                    alert(`Copied ${item.phone} to clipboard!`);
                                  }}
                                  className="text-slate-400 hover:text-slate-700 p-0.5 transition"
                                  title="Copy phone"
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-amber-700 text-[10px] italic">
                                Masked by WhatsApp Privacy
                              </span>
                            )}
                          </td>

                          <td className="py-2.5 px-4 text-slate-700">
                            {item.name || <span className="text-slate-400">—</span>}
                          </td>

                          <td className="py-2.5 px-4">
                            {item.status === 'resolved' ? (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                RESOLVED
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                MASKED
                              </span>
                            )}
                          </td>

                          <td className="py-2.5 px-4 text-slate-500 font-mono text-[10px]">
                            {item.source || '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Message Content View Modal */}
      {selectedRecipientMsg && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-sky-600" />
                Personalized Message Sent
              </h4>
              <button
                type="button"
                onClick={() => setSelectedRecipientMsg(null)}
                className="text-slate-400 hover:text-slate-700 text-xs px-2"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs font-mono text-slate-800 space-y-1">
              <span className="text-slate-500 text-[10px] block">To: {selectedRecipientMsg.lid}</span>
              <p className="whitespace-pre-wrap leading-relaxed text-slate-900">
                {selectedRecipientMsg.msg}
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(selectedRecipientMsg.msg);
                  alert('Copied message text to clipboard');
                }}
                className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700"
              >
                Copy Text
              </button>
              <button
                type="button"
                onClick={() => setSelectedRecipientMsg(null)}
                className="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white shadow-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Advanced CSV Uploader & Column Mapper Modal */}
      <CsvUploaderModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        onImportToBulkSender={(contacts, customHeaders) => {
          setCsvMappedContacts(contacts);
          setCsvCustomVariables(customHeaders);
          const lids = contacts.map((c) => c.lid);
          setRawLidsText(lids.join('\n'));
          setCampaignName(`CSV Audience Import (${contacts.length} LIDs)`);
          setSuccessBanner(
            `Mapped ${contacts.length} contacts! Custom variable tags ready: ${customHeaders.map((h) => `{${h}}`).join(', ') || 'None'}`
          );
        }}
        onImportToScheduler={(contacts) => {
          if (onScheduleAudience) {
            onScheduleAudience(contacts);
          }
        }}
      />
    </div>
  );
};
