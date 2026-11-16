import React, { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../../services/api';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { Contact, ExtractedGroup, ExtractedMember } from '../../types';
import {
  Link2,
  Upload,
  FileSpreadsheet,
  FileText,
  Copy,
  Check,
  ExternalLink,
  Send,
  RefreshCw,
  Search,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  Download,
  Play,
  Pause,
  Square,
  Users,
  Layers,
  ChevronDown,
  Info,
  Trash2,
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  QrCode,
  Zap,
  Globe,
  Sliders
} from 'lucide-react';

export type ProtocolType = 'wa_me' | 'api_whatsapp' | 'web_whatsapp' | 'whatsapp_intent';

export interface LidLinkItem {
  id: string;
  rawInput: string;
  lid: string;
  phone: string | null;
  cleanPhoneDigits: string | null;
  name: string | null;
  businessName: string | null;
  customData?: Record<string, string>;
  status: 'resolved' | 'unresolved';
  source?: string;
  personalizedMessage: string;
  links: {
    waMe: string;
    apiWhatsApp: string;
    webWhatsApp: string;
    appIntent: string;
    directAction: string;
  };
  sendState?: 'idle' | 'sending' | 'sent' | 'failed';
  sendError?: string;
}

interface LidLinkGeneratorViewProps {
  onNavigateToBulkLidSender?: (lids: string[], template?: string) => void;
  onNavigateToConversation?: (conversationId: string) => void;
}

/**
 * Recursive Spintax Parser supporting nested expressions like {Hello|Hi|{Hey|Greetings}}
 */
export function parseSpintax(text: string, seed?: number): string {
  if (!text) return '';
  const spintaxRegex = /\{([^{}]+)\}/g;
  let result = text;
  let safety = 0;
  while (spintaxRegex.test(result) && safety < 10) {
    safety++;
    result = result.replace(spintaxRegex, (_match, group) => {
      const options = group.split('|');
      const idx = seed !== undefined ? Math.abs(seed) % options.length : Math.floor(Math.random() * options.length);
      return options[idx] || '';
    });
  }
  return result;
}

/**
 * Format phone to clean numbers without + or symbols for WhatsApp URLs
 */
export function sanitizePhoneForLink(phone: string): string {
  return (phone || '').replace(/\D/g, '');
}

/**
 * Generate multi-protocol links for a phone and encoded message
 */
export function buildProtocolLinks(cleanPhone: string | null, encodedText: string, lid: string) {
  if (!cleanPhone) {
    return {
      waMe: '',
      apiWhatsApp: '',
      webWhatsApp: '',
      appIntent: '',
      directAction: `app://sender?lid=${encodeURIComponent(lid)}&text=${encodedText}`
    };
  }

  return {
    waMe: `https://wa.me/${cleanPhone}?text=${encodedText}`,
    apiWhatsApp: `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`,
    webWhatsApp: `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`,
    appIntent: `whatsapp://send?phone=${cleanPhone}&text=${encodedText}`,
    directAction: `https://wa.me/${cleanPhone}?text=${encodedText}`
  };
}

export const LidLinkGeneratorView: React.FC<LidLinkGeneratorViewProps> = ({
  onNavigateToBulkLidSender,
  onNavigateToConversation
}) => {
  const { isConnected, setIsQrModalOpen, activeDevice } = useWhatsApp();

  // Ingestion Modes: 'paste' | 'file' | 'group' | 'contacts'
  const [ingestMode, setIngestMode] = useState<'paste' | 'file' | 'group' | 'contacts'>('paste');
  const [rawText, setRawText] = useState<string>('');
  const [defaultCountryCode, setDefaultCountryCode] = useState<string>('91');
  const [appendCountryCode, setAppendCountryCode] = useState<boolean>(false);

  // Template & Personalization
  const [templateText, setTemplateText] = useState<string>(
    '{Hello|Hi|Hey} {name}, *special update* regarding {business_name}! 🚀\nYour verification code is #{random_code}.\nReply to this message to claim your access.'
  );
  const [activeProtocol, setActiveProtocol] = useState<ProtocolType>('wa_me');
  const [enableDynamicSpintax, setEnableDynamicSpintax] = useState<boolean>(true);
  const [spintaxSeedCounter, setSpintaxSeedCounter] = useState<number>(1);

  // Results State
  const [items, setItems] = useState<LidLinkItem[]>([]);
  const [isResolving, setIsResolving] = useState<boolean>(false);
  const [resolveProgress, setResolveProgress] = useState<number>(0);
  const [deepScanRunning, setDeepScanRunning] = useState<boolean>(false);

  // Filters & Table UI
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'resolved' | 'unresolved'>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 50;

  // Modals & Popups
  const [isGroupModalOpen, setIsGroupModalOpen] = useState<boolean>(false);
  const [availableGroups, setAvailableGroups] = useState<ExtractedGroup[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState<boolean>(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');

  // Sequential Opener State
  const [isSequentialRunning, setIsSequentialRunning] = useState<boolean>(false);
  const [sequentialDelaySec, setSequentialDelaySec] = useState<number>(2.0);
  const [sequentialIndex, setSequentialIndex] = useState<number>(0);
  const sequentialTimerRef = useRef<any>(null);

  // Toasts
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Pre-load available groups on mount
  useEffect(() => {
    api.groups.list()
      .then((res) => {
        if (res && res.data) setAvailableGroups(res.data);
      })
      .catch(() => {});
  }, []);

  // Stats Counters
  const totalCount = items.length;
  const resolvedCount = useMemo(() => items.filter((i) => i.status === 'resolved').length, [items]);
  const unresolvedCount = useMemo(() => items.filter((i) => i.status === 'unresolved').length, [items]);

  // Insert Variable into Template
  const handleInsertVariable = (varName: string) => {
    setTemplateText((prev) => `${prev} {${varName}}`);
  };

  const handleInsertFormatting = (prefix: string, suffix: string) => {
    setTemplateText((prev) => `${prev}${prefix}text${suffix}`);
  };

  /**
   * Helper to evaluate personalized message for an item
   */
  const evaluateItemMessage = (
    itemData: { name?: string | null; businessName?: string | null; phone?: string | null; lid?: string | null },
    idx: number
  ) => {
    const today = new Date();
    const dateStr = today.toLocaleDateString();
    const timeStr = today.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const randomCode = Math.floor(100000 + Math.random() * 900000).toString();

    let msg = templateText;
    msg = msg.replace(/\{name\}/gi, itemData.name || 'Friend');
    msg = msg.replace(/\{business_name\}/gi, itemData.businessName || 'Your Business');
    msg = msg.replace(/\{phone\}/gi, itemData.phone || itemData.lid || '');
    msg = msg.replace(/\{lid\}/gi, itemData.lid || '');
    msg = msg.replace(/\{index\}/gi, String(idx + 1));
    msg = msg.replace(/\{date\}/gi, dateStr);
    msg = msg.replace(/\{time\}/gi, timeStr);
    msg = msg.replace(/\{random_code\}/gi, randomCode);

    // Apply Spintax
    return parseSpintax(msg, enableDynamicSpintax ? idx + spintaxSeedCounter : 0);
  };

  /**
   * Re-generate link values whenever template or activeProtocol changes
   */
  const recomputeAllLinks = (currentItems: LidLinkItem[]) => {
    return currentItems.map((item, idx) => {
      const pMsg = evaluateItemMessage(
        {
          name: item.name,
          businessName: item.businessName,
          phone: item.phone,
          lid: item.lid
        },
        idx
      );
      const encoded = encodeURIComponent(pMsg);
      const links = buildProtocolLinks(item.cleanPhoneDigits, encoded, item.lid);

      return {
        ...item,
        personalizedMessage: pMsg,
        links
      };
    });
  };

  // Update links when template changes
  const handleApplyTemplateToExisting = () => {
    if (items.length === 0) return;
    setItems((prev) => recomputeAllLinks(prev));
    showToast('Updated personalized messages for all links');
  };

  /**
   * Primary Ingestion & Resolution Pipeline
   */
  const handleResolveAndGenerate = async (
    inputRecords: Array<{ raw: string; name?: string; businessName?: string }>
  ) => {
    if (inputRecords.length === 0) {
      alert('Please provide at least one LID or phone number to resolve.');
      return;
    }

    try {
      setIsResolving(true);
      setResolveProgress(10);

      // Extract unique LIDs for backend resolution
      const rawLids = inputRecords.map((r) => r.raw.trim()).filter(Boolean);
      setResolveProgress(25);

      const res = await api.contacts.resolveLids(rawLids);
      setResolveProgress(70);

      const resolutionMap = new Map<string, { phone: string | null; name: string | null; status: 'resolved' | 'unresolved'; source?: string }>();

      if (res && res.results) {
        for (const item of res.results) {
          const key = item.lid.toLowerCase().trim();
          resolutionMap.set(key, item);
          // Also set without @lid
          resolutionMap.set(key.replace('@lid', ''), item);
        }
      }

      setResolveProgress(85);

      const newItems: LidLinkItem[] = inputRecords.map((rec, idx) => {
        const raw = rec.raw.trim();
        const cleanLid = raw.endsWith('@lid') ? raw : (raw.includes(':') ? raw.split(':')[0] + '@lid' : `${raw}@lid`);
        const lookupKey = cleanLid.toLowerCase();

        const match = resolutionMap.get(lookupKey) || resolutionMap.get(raw.toLowerCase());

        let finalPhone = match?.phone || null;
        let isResolved = match?.status === 'resolved';

        // Check if raw input was already a clean phone number
        const digits = raw.replace(/\D/g, '');
        if (!finalPhone && !raw.includes('@lid') && digits.length >= 10 && digits.length <= 15) {
          finalPhone = raw.startsWith('+') ? raw : `+${digits}`;
          isResolved = true;
        }

        // Apply country code if enabled and missing
        if (finalPhone && appendCountryCode && defaultCountryCode) {
          const pDigits = finalPhone.replace(/\D/g, '');
          if (!pDigits.startsWith(defaultCountryCode) && pDigits.length === 10) {
            finalPhone = `+${defaultCountryCode}${pDigits}`;
          }
        }

        const cleanDigits = finalPhone ? sanitizePhoneForLink(finalPhone) : null;
        const candidateName = rec.name || match?.name || null;
        const candidateBiz = rec.businessName || null;

        const pMsg = evaluateItemMessage(
          {
            name: candidateName,
            businessName: candidateBiz,
            phone: finalPhone,
            lid: cleanLid
          },
          idx
        );

        const encoded = encodeURIComponent(pMsg);
        const links = buildProtocolLinks(cleanDigits, encoded, cleanLid);

        return {
          id: `link_${idx}_${Date.now()}`,
          rawInput: raw,
          lid: cleanLid,
          phone: finalPhone,
          cleanPhoneDigits: cleanDigits,
          name: candidateName,
          businessName: candidateBiz,
          status: isResolved ? 'resolved' : 'unresolved',
          source: match?.source || (isResolved ? 'direct_phone' : undefined),
          personalizedMessage: pMsg,
          links,
          sendState: 'idle'
        };
      });

      setItems(newItems);
      setResolveProgress(100);
      showToast(`Generated ${newItems.length} WhatsApp links (${newItems.filter(i => i.status === 'resolved').length} resolved)`);
    } catch (err: any) {
      console.error('Error resolving LIDs:', err);
      alert(err.message || 'Failed to resolve LIDs. Please check your connection.');
    } finally {
      setIsResolving(false);
      setTimeout(() => setResolveProgress(0), 1000);
    }
  };

  /**
   * Handle Ingest From Quick Paste
   */
  const handleIngestFromPaste = () => {
    if (!rawText.trim()) {
      alert('Please enter or paste at least one WhatsApp LID or phone number.');
      return;
    }

    const lines = rawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const parsedRecords: Array<{ raw: string; name?: string; businessName?: string }> = [];

    for (const line of lines) {
      // Check if comma or tab separated (e.g. "9876543210@lid, John Doe, Acme Inc")
      if (line.includes(',') || line.includes('\t')) {
        const sep = line.includes('\t') ? '\t' : ',';
        const parts = line.split(sep).map((p) => p.trim());
        parsedRecords.push({
          raw: parts[0],
          name: parts[1] || undefined,
          businessName: parts[2] || undefined
        });
      } else {
        parsedRecords.push({ raw: line });
      }
    }

    handleResolveAndGenerate(parsedRecords);
  };

  /**
   * Handle File Upload (CSV, TXT, XLSX)
   */
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length === 0) return;

      let delimiter = ',';
      if (lines[0].includes('\t')) delimiter = '\t';
      else if (lines[0].includes(';') && !lines[0].includes(',')) delimiter = ';';

      const headers = lines[0].split(delimiter).map((h) => h.replace(/^["']|["']$/g, '').trim().toLowerCase());

      // Auto-detect column indices
      const lidIdx = headers.findIndex((h) => h.includes('lid') || h.includes('jid') || h.includes('identifier'));
      const phoneIdx = headers.findIndex((h) => h.includes('phone') || h.includes('mobile') || h.includes('contact') || h.includes('number'));
      const nameIdx = headers.findIndex((h) => h.includes('name') && !h.includes('business') && !h.includes('company'));
      const bizIdx = headers.findIndex((h) => h.includes('business') || h.includes('company') || h.includes('brand'));

      const targetColIdx = lidIdx !== -1 ? lidIdx : (phoneIdx !== -1 ? phoneIdx : 0);

      const records: Array<{ raw: string; name?: string; businessName?: string }> = [];

      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(delimiter).map((p) => p.replace(/^["']|["']$/g, '').trim());
        const rawVal = parts[targetColIdx];
        if (!rawVal) continue;

        records.push({
          raw: rawVal,
          name: nameIdx !== -1 ? parts[nameIdx] : undefined,
          businessName: bizIdx !== -1 ? parts[bizIdx] : undefined
        });
      }

      handleResolveAndGenerate(records);
    };

    reader.readAsText(file);
    e.target.value = '';
  };

  /**
   * Group Extractor Import Flow
   */
  const handleImportFromSelectedGroup = async () => {
    if (!selectedGroupId) {
      alert('Please select a group to import participant LIDs.');
      return;
    }

    try {
      setIsLoadingGroups(true);
      const res = await api.groups.getMembers(selectedGroupId);
      if (!res || !res.members || res.members.length === 0) {
        alert('No members found in this group.');
        return;
      }

      const records = res.members.map((m) => ({
        raw: m.lid || m.phone || m.jid,
        name: m.name || undefined
      }));

      setIsGroupModalOpen(false);
      handleResolveAndGenerate(records);
    } catch (err: any) {
      alert(err.message || 'Failed to fetch members for group.');
    } finally {
      setIsLoadingGroups(false);
    }
  };

  /**
   * Import from Saved Contacts Directory
   */
  const handleImportFromContacts = async () => {
    try {
      setIsResolving(true);
      const res = await api.contacts.list();
      if (!res || !res.data || res.data.length === 0) {
        alert('No saved contacts found in your directory.');
        return;
      }

      const records = res.data.map((c) => ({
        raw: c.lid || c.phone_number || '',
        name: c.name || undefined
      })).filter((r) => Boolean(r.raw));

      handleResolveAndGenerate(records);
    } catch (err: any) {
      alert(err.message || 'Failed to fetch contacts directory.');
    } finally {
      setIsResolving(false);
    }
  };

  /**
   * Deep Scan via Group Cache (Attempts to uncover phones for unresolved LIDs)
   */
  const handleDeepScanGroups = async () => {
    try {
      setDeepScanRunning(true);
      const res = await api.contacts.syncGroupLids();
      showToast(res.message || 'Group participant deep scan finished!');

      // Re-resolve unresolved items
      const unresolvedItems = items.filter((i) => i.status === 'unresolved');
      if (unresolvedItems.length > 0) {
        const rawLids = unresolvedItems.map((i) => i.lid);
        const resolvedAfter = await api.contacts.resolveLids(rawLids);

        if (resolvedAfter && resolvedAfter.results) {
          const freshMap = new Map(resolvedAfter.results.map((r) => [r.lid.toLowerCase(), r]));
          setItems((prev) =>
            prev.map((item) => {
              const match = freshMap.get(item.lid.toLowerCase());
              if (match && match.status === 'resolved' && match.phone) {
                const cleanD = sanitizePhoneForLink(match.phone);
                const encoded = encodeURIComponent(item.personalizedMessage);
                return {
                  ...item,
                  phone: match.phone,
                  cleanPhoneDigits: cleanD,
                  status: 'resolved',
                  source: 'group_deep_scan',
                  links: buildProtocolLinks(cleanD, encoded, item.lid)
                };
              }
              return item;
            })
          );
        }
      }
    } catch (err: any) {
      alert(err.message || 'Deep scan failed. Make sure WhatsApp is connected.');
    } finally {
      setDeepScanRunning(false);
    }
  };

  /**
   * Direct Dispatch for an Individual Item
   */
  const handleDirectSend = async (item: LidLinkItem) => {
    if (!isConnected) {
      setIsQrModalOpen(true);
      return;
    }

    try {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, sendState: 'sending', sendError: undefined } : i))
      );

      if (item.phone) {
        await api.messages.sendPhone(item.phone, item.personalizedMessage);
      } else {
        await api.messages.sendLid(item.lid, item.personalizedMessage);
      }

      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, sendState: 'sent' } : i))
      );
      showToast(`Dispatched message to ${item.phone || item.lid}`);
    } catch (err: any) {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, sendState: 'failed', sendError: err.message } : i))
      );
      alert(`Send failed: ${err.message || 'Error sending message'}`);
    }
  };

  /**
   * Copy specific link to clipboard
   */
  const handleCopyLink = (url: string) => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    showToast('Copied WhatsApp link to clipboard!');
  };

  /**
   * Copy all links to clipboard
   */
  const handleCopyAllLinks = () => {
    const validLinks = items
      .map((i) => {
        if (activeProtocol === 'wa_me') return i.links.waMe;
        if (activeProtocol === 'api_whatsapp') return i.links.apiWhatsApp;
        if (activeProtocol === 'web_whatsapp') return i.links.webWhatsApp;
        return i.links.appIntent;
      })
      .filter(Boolean);

    if (validLinks.length === 0) {
      alert('No valid WhatsApp links available to copy.');
      return;
    }

    navigator.clipboard.writeText(validLinks.join('\n'));
    showToast(`Copied ${validLinks.length} WhatsApp links to clipboard!`);
  };

  /**
   * Export to CSV
   */
  const handleExportCsv = () => {
    if (items.length === 0) {
      alert('No items to export.');
      return;
    }

    const headers = [
      'LID',
      'Phone',
      'Name',
      'Business_Name',
      'Status',
      'Source',
      'Message_Text',
      'wa_me_link',
      'api_link',
      'web_link',
      'mobile_intent'
    ];

    const escapeCsv = (str: string | null | undefined) => {
      const val = str ?? '';
      return `"${val.replace(/"/g, '""')}"`;
    };

    const rows = items.map((i) => [
      escapeCsv(i.lid),
      escapeCsv(i.phone),
      escapeCsv(i.name),
      escapeCsv(i.businessName),
      escapeCsv(i.status),
      escapeCsv(i.source),
      escapeCsv(i.personalizedMessage),
      escapeCsv(i.links.waMe),
      escapeCsv(i.links.apiWhatsApp),
      escapeCsv(i.links.webWhatsApp),
      escapeCsv(i.links.appIntent)
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `whatsapp_lid_links_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Downloaded CSV link export!');
  };

  /**
   * Export to Excel with Clickable Formulas
   */
  const handleExportExcelFormatted = () => {
    if (items.length === 0) {
      alert('No items to export.');
      return;
    }

    const headers = [
      'LID',
      'Phone',
      'Name',
      'Status',
      'Clickable_WhatsApp_Link',
      'Message_Preview'
    ];

    const escapeCsv = (str: string | null | undefined) => {
      const val = str ?? '';
      return `"${val.replace(/"/g, '""')}"`;
    };

    const rows = items.map((i) => {
      const link = i.links.waMe || i.links.apiWhatsApp || '';
      const formula = link ? `=HYPERLINK("${link}","Chat on WhatsApp")` : 'N/A (LID Only)';
      return [
        escapeCsv(i.lid),
        escapeCsv(i.phone),
        escapeCsv(i.name),
        escapeCsv(i.status),
        formula,
        escapeCsv(i.personalizedMessage)
      ];
    });

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `whatsapp_links_clickable_${Date.now()}.xls`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Downloaded clickable Excel sheet!');
  };

  /**
   * Sequential Tab Opener Logic
   */
  const startSequentialOpener = () => {
    const resolvedItems = items.filter((i) => i.status === 'resolved' && i.cleanPhoneDigits);
    if (resolvedItems.length === 0) {
      alert('No resolved phone numbers available to open.');
      return;
    }

    setIsSequentialRunning(true);
    setSequentialIndex(0);

    let currIdx = 0;
    const launchNext = () => {
      if (currIdx >= resolvedItems.length) {
        setIsSequentialRunning(false);
        showToast('Sequential link opener finished!');
        return;
      }

      const item = resolvedItems[currIdx];
      const link =
        activeProtocol === 'wa_me'
          ? item.links.waMe
          : activeProtocol === 'api_whatsapp'
          ? item.links.apiWhatsApp
          : activeProtocol === 'web_whatsapp'
          ? item.links.webWhatsApp
          : item.links.appIntent;

      if (link) {
        window.open(link, '_blank');
      }

      setSequentialIndex(currIdx + 1);
      currIdx++;
      sequentialTimerRef.current = setTimeout(launchNext, sequentialDelaySec * 1000);
    };

    launchNext();
  };

  const stopSequentialOpener = () => {
    if (sequentialTimerRef.current) {
      clearTimeout(sequentialTimerRef.current);
      sequentialTimerRef.current = null;
    }
    setIsSequentialRunning(false);
    showToast('Sequential opener paused');
  };

  // Push LIDs into BulkLidSenderView
  const handlePushToBulkSender = () => {
    if (items.length === 0) {
      alert('No LIDs to send.');
      return;
    }

    const lids = items.map((i) => i.lid);
    if (onNavigateToBulkLidSender) {
      onNavigateToBulkLidSender(lids, templateText);
    }
  };

  // Filtered & Paginated Items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filterStatus === 'resolved' && item.status !== 'resolved') return false;
      if (filterStatus === 'unresolved' && item.status !== 'unresolved') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesLid = item.lid.toLowerCase().includes(q);
        const matchesPhone = item.phone?.toLowerCase().includes(q);
        const matchesName = item.name?.toLowerCase().includes(q);
        return matchesLid || matchesPhone || matchesName;
      }
      return true;
    });
  }, [items, filterStatus, searchQuery]);

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage) || 1;
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredItems.slice(start, start + itemsPerPage);
  }, [filteredItems, currentPage]);

  // Load sample test data for instant testing
  const handleLoadSampleLids = () => {
    const sample = [
      '216256653340861@lid, Alex Morgan, TechVentures',
      '194857263548192@lid, Sarah Chen, Bright Labs',
      '+919876543210, Michael Scott, Dunder Mifflin',
      '184759283746194@lid, David Wallace, CFO Hub',
      '919811223344, Priya Sharma, Apex Solutions'
    ].join('\n');
    setRawText(sample);
  };

  return (
    <div className="space-y-6 pb-16 animate-fade-in">
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-2xl text-xs font-bold flex items-center gap-2 border border-slate-700 animate-slide-up">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  LID to WhatsApp Message Link Generator
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  MULTI-PROTOCOL DISPATCHER
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Upload or paste WhatsApp LIDs, auto-resolve into verified E.164 phone numbers, apply dynamic Spintax templates, and generate one-click dispatch links.
              </p>
            </div>
          </div>
        </div>

        {/* WhatsApp Connection Pill */}
        <div className="flex items-center gap-3">
          <div className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border ${
            isConnected ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span>{isConnected ? `Connected (${activeDevice?.phone_number || 'Live Session'})` : 'WhatsApp Disconnected'}</span>
          </div>

          {!isConnected && (
            <button
              onClick={() => setIsQrModalOpen(true)}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-sm"
            >
              <QrCode className="w-3.5 h-3.5" /> Pair WhatsApp
            </button>
          )}
        </div>
      </div>

      {/* KPI Counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Total Identifiers</span>
            <span className="text-lg font-black text-slate-900">{totalCount}</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Resolved (Phones)</span>
            <span className="text-lg font-black text-emerald-700">{resolvedCount}</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Unresolved LIDs</span>
            <span className="text-lg font-black text-amber-700">{unresolvedCount}</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Ready Links</span>
            <span className="text-lg font-black text-blue-700">{resolvedCount}</span>
          </div>
        </div>
      </div>

      {/* Main Studio Grid: Ingestion & Template Customization */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Upload & Ingestion Engine (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Upload className="w-4 h-4 text-emerald-600" />
                1. Ingestion Engine
              </h2>
              <span className="text-[11px] text-slate-400 font-semibold">Multiple Input Formats</span>
            </div>

            {/* Ingest Mode Tabs */}
            <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-xl text-xs font-bold text-slate-600">
              <button
                onClick={() => setIngestMode('paste')}
                className={`py-1.5 rounded-lg transition ${ingestMode === 'paste' ? 'bg-white text-slate-900 shadow-sm' : 'hover:text-slate-900'}`}
              >
                Quick Paste
              </button>
              <button
                onClick={() => setIngestMode('file')}
                className={`py-1.5 rounded-lg transition ${ingestMode === 'file' ? 'bg-white text-slate-900 shadow-sm' : 'hover:text-slate-900'}`}
              >
                File Upload
              </button>
              <button
                onClick={() => {
                  setIngestMode('group');
                  setIsGroupModalOpen(true);
                }}
                className={`py-1.5 rounded-lg transition ${ingestMode === 'group' ? 'bg-white text-slate-900 shadow-sm' : 'hover:text-slate-900'}`}
              >
                Group Extractor
              </button>
              <button
                onClick={() => {
                  setIngestMode('contacts');
                  handleImportFromContacts();
                }}
                className={`py-1.5 rounded-lg transition ${ingestMode === 'contacts' ? 'bg-white text-slate-900 shadow-sm' : 'hover:text-slate-900'}`}
              >
                Contacts
              </button>
            </div>

            {/* Paste Mode Input */}
            {ingestMode === 'paste' && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">Paste LIDs or Phone Numbers</label>
                  <button
                    onClick={handleLoadSampleLids}
                    className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" /> Load Sample Data
                  </button>
                </div>
                <textarea
                  rows={7}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder={`Paste one per line, with or without @lid:\n216256653340861@lid\n+919876543210\n184759283746194@lid, John Doe, Acme Corp`}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:bg-white transition"
                />
                <p className="text-[11px] text-slate-400">
                  Tip: Supports comma/tab separation for <code className="bg-slate-100 px-1 rounded">lid, name, company</code>.
                </p>
              </div>
            )}

            {/* File Upload Mode */}
            {ingestMode === 'file' && (
              <div className="space-y-3">
                <div className="border-2 border-dashed border-slate-200 hover:border-emerald-500 rounded-2xl p-6 text-center transition cursor-pointer bg-slate-50/50 relative">
                  <input
                    type="file"
                    accept=".csv,.txt,.tsv"
                    onChange={handleFileUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2.5">
                    <FileSpreadsheet className="w-6 h-6" />
                  </div>
                  <p className="text-xs font-bold text-slate-800">Drag & Drop CSV / TXT / TSV File</p>
                  <p className="text-[11px] text-slate-400 mt-1">Automatic column detection for LID, Phone, Name, and Company</p>
                </div>
              </div>
            )}

            {/* Group Extractor Mode Banner */}
            {ingestMode === 'group' && (
              <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 text-center space-y-2">
                <Layers className="w-8 h-8 text-emerald-600 mx-auto" />
                <p className="text-xs font-bold text-emerald-900">Direct Pipe from Group Extractor</p>
                <p className="text-[11px] text-emerald-700">
                  Extract participant LIDs directly from joined communities and groups.
                </p>
                <button
                  onClick={() => setIsGroupModalOpen(true)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
                >
                  Choose Group to Import
                </button>
              </div>
            )}

            {/* Country Code Settings */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={appendCountryCode}
                  onChange={(e) => setAppendCountryCode(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span className="font-semibold text-slate-700">Prepend Country Code if Missing</span>
              </label>

              {appendCountryCode && (
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400 font-bold">+</span>
                  <input
                    type="text"
                    value={defaultCountryCode}
                    onChange={(e) => setDefaultCountryCode(e.target.value.replace(/\D/g, ''))}
                    className="w-14 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 text-center outline-none focus:border-emerald-500"
                    placeholder="91"
                  />
                </div>
              )}
            </div>

            {/* Resolve Button */}
            <button
              onClick={handleIngestFromPaste}
              disabled={isResolving}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
            >
              {isResolving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Resolving LIDs via Baileys & Database... ({resolveProgress}%)
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Auto-Resolve LIDs & Generate Links
                </>
              )}
            </button>
          </div>

          {/* Deep Scan Action Box (When Unresolved LIDs exist) */}
          {unresolvedCount > 0 && (
            <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 shadow-sm flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
                <ShieldAlert className="w-4 h-4" />
              </div>
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-900">
                    {unresolvedCount} Unresolved Privacy LIDs
                  </span>
                  <button
                    onClick={handleDeepScanGroups}
                    disabled={deepScanRunning || !isConnected}
                    className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold transition flex items-center gap-1 shadow-sm disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${deepScanRunning ? 'animate-spin' : ''}`} />
                    Deep Scan via Groups
                  </button>
                </div>
                <p className="text-[11px] text-amber-700 leading-relaxed">
                  WhatsApp hides phone numbers for privacy in some communities. You can still direct send to these LIDs in-app, or perform a deep group scan to harvest phone numbers from shared mutual groups.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Template & Personalization Engine (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                2. Message Template & Personalization Engine
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-slate-400">
                  {templateText.length} chars | {templateText.split(/\s+/).filter(Boolean).length} words
                </span>
              </div>
            </div>

            {/* Template Formatting Toolbar */}
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-50 p-2 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">FORMAT:</span>
              <button
                type="button"
                onClick={() => handleInsertFormatting('*', '*')}
                className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 transition"
                title="Bold: *text*"
              >
                <b>B</b>
              </button>
              <button
                type="button"
                onClick={() => handleInsertFormatting('_', '_')}
                className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs italic font-bold text-slate-700 transition"
                title="Italic: _text_"
              >
                <i>I</i>
              </button>
              <button
                type="button"
                onClick={() => handleInsertFormatting('~', '~')}
                className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs line-through font-bold text-slate-700 transition"
                title="Strikethrough: ~text~"
              >
                <s>S</s>
              </button>
              <button
                type="button"
                onClick={() => handleInsertFormatting('```', '```')}
                className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-700 transition"
                title="Monospace code"
              >
                {'< >'}
              </button>

              <div className="h-4 w-[1px] bg-slate-200 mx-1" />

              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">VARIABLES:</span>
              {['name', 'phone', 'business_name', 'random_code', 'date', 'index'].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => handleInsertVariable(v)}
                  className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[11px] font-bold transition"
                >
                  {`{${v}}`}
                </button>
              ))}
            </div>

            {/* Template Editor */}
            <div className="space-y-1.5">
              <textarea
                rows={5}
                value={templateText}
                onChange={(e) => setTemplateText(e.target.value)}
                placeholder="Write your message template here..."
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans text-slate-800 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:bg-white transition"
              />
            </div>

            {/* Spintax Controls & Live Preview Card */}
            <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-slate-700">Spintax Rotation</span>
                  <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-bold">
                    {'{Hello|Hi|Hey}'}
                  </span>
                </div>
                <button
                  onClick={() => setSpintaxSeedCounter((c) => c + 1)}
                  className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Test Variation
                </button>
              </div>

              {/* WhatsApp Message Bubble Preview */}
              <div className="bg-[#EFEAE2] p-3 rounded-xl border border-slate-200 shadow-inner">
                <div className="max-w-[85%] bg-white rounded-lg p-2.5 shadow-sm text-xs text-slate-800 relative">
                  <p className="whitespace-pre-line leading-relaxed font-sans">
                    {evaluateItemMessage({ name: 'Alex', businessName: 'TechVentures' }, 0)}
                  </p>
                  <div className="flex items-center justify-end gap-1 text-[9px] text-slate-400 mt-1 font-semibold">
                    <span>12:00 PM</span>
                    <span className="text-emerald-500">✓✓</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={handleApplyTemplateToExisting}
                  className="text-xs font-bold text-slate-700 hover:text-emerald-600 transition flex items-center gap-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Re-apply to all generated links
                </button>

                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableDynamicSpintax}
                      onChange={(e) => setEnableDynamicSpintax(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Dynamic Spintax per row</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Protocol Selector & Bulk Actions Bar */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Protocol Selector Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider mr-2">PROTOCOL:</span>
          {[
            { id: 'wa_me' as ProtocolType, label: 'wa.me (Universal)', badge: 'Recommended' },
            { id: 'api_whatsapp' as ProtocolType, label: 'api.whatsapp.com', badge: 'Official API' },
            { id: 'web_whatsapp' as ProtocolType, label: 'web.whatsapp.com', badge: 'Desktop' },
            { id: 'whatsapp_intent' as ProtocolType, label: 'whatsapp:// (App Intent)', badge: 'Mobile App' }
          ].map((proto) => (
            <button
              key={proto.id}
              onClick={() => setActiveProtocol(proto.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap border ${
                activeProtocol === proto.id
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span>{proto.label}</span>
              {proto.badge && (
                <span className={`text-[9px] px-1 py-0.2 rounded font-extrabold ${
                  activeProtocol === proto.id ? 'bg-emerald-500 text-slate-950' : 'bg-slate-200 text-slate-700'
                }`}>
                  {proto.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Global Bulk Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleCopyAllLinks}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
            title="Copy newline separated URLs to clipboard"
          >
            <Copy className="w-3.5 h-3.5" /> Copy All Links
          </button>

          <button
            onClick={handleExportCsv}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
            title="Export full CSV with all link protocols"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </button>

          <button
            onClick={handleExportExcelFormatted}
            className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
            title="Export Excel sheet with clickable hyperlink formulas"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> Excel Links
          </button>

          {/* Sequential Opener Controller */}
          {isSequentialRunning ? (
            <button
              onClick={stopSequentialOpener}
              className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
            >
              <Pause className="w-3.5 h-3.5" /> Stop Opener ({sequentialIndex}/{resolvedCount})
            </button>
          ) : (
            <button
              onClick={startSequentialOpener}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
              title="Launch links one-by-one in tabs with delay"
            >
              <Play className="w-3.5 h-3.5" /> Sequential Opener
            </button>
          )}

          {/* Push to Bulk LID Sender */}
          <button
            onClick={handlePushToBulkSender}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
            title="Handover to Bulk LID Sender for automated background delivery"
          >
            <Send className="w-3.5 h-3.5 text-emerald-400" />
            Bulk LID Sender Handover
          </button>
        </div>
      </div>

      {/* Sequential Delay Slider (When running or configuring) */}
      <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-600" />
          <span className="font-bold text-slate-700">Sequential Tab Opener Cadence:</span>
          <span className="font-extrabold text-blue-700">{sequentialDelaySec}s delay</span>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="1.0"
            max="6.0"
            step="0.5"
            value={sequentialDelaySec}
            onChange={(e) => setSequentialDelaySec(parseFloat(e.target.value))}
            className="w-36 accent-blue-600"
          />
          <span className="text-[11px] text-slate-400 font-semibold">
            (Helps bypass browser popup blocker)
          </span>
        </div>
      </div>

      {/* Interactive Links Table */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden space-y-4 p-4">
        {/* Table Search & Status Filters */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by LID, phone number, or recipient name..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:bg-white transition"
            />
          </div>

          <div className="flex items-center gap-1.5 w-full md:w-auto">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                filterStatus === 'all'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              All ({totalCount})
            </button>
            <button
              onClick={() => setFilterStatus('resolved')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                filterStatus === 'resolved'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              Resolved ({resolvedCount})
            </button>
            <button
              onClick={() => setFilterStatus('unresolved')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                filterStatus === 'unresolved'
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              Unresolved ({unresolvedCount})
            </button>
          </div>
        </div>

        {/* Table View */}
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-extrabold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-3.5 text-center w-12">#</th>
                <th className="py-3 px-3.5">LID / Identifier</th>
                <th className="py-3 px-3.5">Resolved Phone</th>
                <th className="py-3 px-3.5">Status</th>
                <th className="py-3 px-3.5">Message Preview</th>
                <th className="py-3 px-3.5">Generated Link</th>
                <th className="py-3 px-3.5 text-right w-36">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2">
                      <Link2 className="w-6 h-6" />
                    </div>
                    <p className="font-bold text-slate-700">No links generated yet</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Paste WhatsApp LIDs or phone numbers above and click "Auto-Resolve" to generate links.
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item, idx) => {
                  const currentLink =
                    activeProtocol === 'wa_me'
                      ? item.links.waMe
                      : activeProtocol === 'api_whatsapp'
                      ? item.links.apiWhatsApp
                      : activeProtocol === 'web_whatsapp'
                      ? item.links.webWhatsApp
                      : item.links.appIntent;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-3.5 text-center text-slate-400 font-bold">
                        {(currentPage - 1) * itemsPerPage + idx + 1}
                      </td>

                      <td className="py-3 px-3.5 font-mono text-slate-800">
                        <div className="flex flex-col">
                          <span className="font-bold">{item.lid}</span>
                          {item.name && (
                            <span className="text-[10px] text-slate-400 font-sans">{item.name}</span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-3.5">
                        {item.phone ? (
                          <div className="flex items-center gap-1.5 font-mono font-bold text-emerald-700">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                            <span>{item.phone}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-slate-400 font-sans italic">
                            <span>Hidden by Privacy</span>
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3.5">
                        {item.status === 'resolved' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Verified Phone
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200">
                            Unresolved LID
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3.5 max-w-xs">
                        <p className="truncate text-slate-600 font-sans" title={item.personalizedMessage}>
                          {item.personalizedMessage}
                        </p>
                      </td>

                      <td className="py-3 px-3.5 max-w-sm">
                        {currentLink ? (
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-mono text-[11px] text-blue-600 max-w-[200px]" title={currentLink}>
                              {currentLink}
                            </span>
                            <button
                              onClick={() => handleCopyLink(currentLink)}
                              className="p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-800 transition"
                              title="Copy URL"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">
                            In-app Direct Send Only
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {currentLink ? (
                            <a
                              href={currentLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold transition flex items-center gap-1"
                            >
                              <ExternalLink className="w-3 h-3" /> Open
                            </a>
                          ) : null}

                          <button
                            onClick={() => handleDirectSend(item)}
                            disabled={item.sendState === 'sending'}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-sm ${
                              item.sendState === 'sent'
                                ? 'bg-emerald-600 text-white'
                                : item.sendState === 'failed'
                                ? 'bg-rose-600 text-white'
                                : 'bg-slate-900 hover:bg-slate-800 text-white'
                            }`}
                            title="Directly dispatch message via connected WhatsApp session"
                          >
                            {item.sendState === 'sending' ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : item.sendState === 'sent' ? (
                              <>
                                <Check className="w-3 h-3" /> Sent
                              </>
                            ) : (
                              <>
                                <Send className="w-3 h-3" /> Send
                              </>
                            )}
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

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
            <span>
              Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
              {Math.min(currentPage * itemsPerPage, filteredItems.length)} of {filteredItems.length} items
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => p - 1)}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg font-bold"
              >
                Previous
              </button>
              <span className="px-2 font-bold text-slate-800">
                Page {currentPage} of {totalPages}
              </span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg font-bold"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Group Picker Modal */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-scale-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-600" />
                Select Group to Import LIDs
              </h3>
              <button
                onClick={() => setIsGroupModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Select one of your extracted groups to pull all member LIDs and names into the link generator.
            </p>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {availableGroups.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  No extracted groups found. Go to Group Extractor first to scan your WhatsApp groups.
                </div>
              ) : (
                availableGroups.map((g) => (
                  <label
                    key={g.id}
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${
                      selectedGroupId === g.id
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="radio"
                        name="selectedGroup"
                        checked={selectedGroupId === g.id}
                        onChange={() => setSelectedGroupId(g.id)}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      <div>
                        <span className="font-bold text-xs block">{g.subject}</span>
                        <span className="text-[10px] text-slate-400">{g.size || 0} participants</span>
                      </div>
                    </div>
                    {g.isCommunity && (
                      <span className="text-[9px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-extrabold uppercase">
                        Community
                      </span>
                    )}
                  </label>
                ))
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setIsGroupModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
              >
                Cancel
              </button>
              <button
                onClick={handleImportFromSelectedGroup}
                disabled={isLoadingGroups || !selectedGroupId}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                {isLoadingGroups ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                Import Members
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
