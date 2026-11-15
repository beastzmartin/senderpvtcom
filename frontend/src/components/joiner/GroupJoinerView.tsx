import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api';
import { useWhatsApp } from '../../context/WhatsAppContext';
import {
  GroupInviteMetadata,
  GroupJoinCampaign,
  JoinerProgressEvent
} from '../../types';
import {
  UserPlus,
  Link2,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Play,
  Pause,
  Square,
  Trash2,
  Upload,
  ShieldCheck,
  Smartphone,
  RefreshCw,
  FileSpreadsheet,
  Layers,
  Users,
  Sparkles,
  ExternalLink,
  Info
} from 'lucide-react';

interface GroupJoinerViewProps {
  onNavigateToExtractor?: () => void;
}

export const GroupJoinerView: React.FC<GroupJoinerViewProps> = ({ onNavigateToExtractor }) => {
  const { devices, activeSessionId, isConnected, setIsQrModalOpen, socket } = useWhatsApp();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sub-views: 'builder' (paste + inspect + configure) | 'campaigns' (live & history)
  const [viewMode, setViewMode] = useState<'builder' | 'campaigns'>('builder');

  // Input & Parsing
  const [rawInputText, setRawInputText] = useState('');
  const [parsedLinks, setParsedLinks] = useState<string[]>([]);
  const [campaignName, setCampaignName] = useState('');

  // Link Inspector
  const [inspecting, setInspecting] = useState(false);
  const [inspectedResults, setInspectedResults] = useState<GroupInviteMetadata[]>([]);

  // Anti-Ban Settings
  const [deviceMode, setDeviceMode] = useState<'single' | 'round_robin'>('single');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(activeSessionId || 'default');
  const [minDelaySeconds, setMinDelaySeconds] = useState(15);
  const [maxDelaySeconds, setMaxDelaySeconds] = useState(30);
  const [batchSize, setBatchSize] = useState(5);
  const [batchPauseSeconds, setBatchPauseSeconds] = useState(60);
  const [skipAlreadyMember, setSkipAlreadyMember] = useState(true);

  // Campaign Execution & History
  const [campaigns, setCampaigns] = useState<GroupJoinCampaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<GroupJoinCampaign | null>(null);
  const [liveProgress, setLiveProgress] = useState<JoinerProgressEvent | null>(null);
  const [countdown, setCountdown] = useState<number>(0);

  // Status / Errors
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const connectedDevices = devices.filter((d) => d.status === 'connected');

  useEffect(() => {
    if (activeSessionId) {
      setSelectedDeviceId(activeSessionId);
    }
  }, [activeSessionId]);

  // Real-time local link extractor whenever textarea changes
  useEffect(() => {
    const lines = rawInputText.split(/[\r\n,; \t]+/);
    const seen = new Set<string>();
    const extracted: string[] = [];

    for (const line of lines) {
      const clean = line.trim();
      if (!clean) continue;
      const match = clean.match(/(?:chat\.whatsapp\.com\/(?:invite\/)?|invite\/)?([a-zA-Z0-9_-]{15,35})/);
      const code = match ? match[1] : (clean.length >= 18 && clean.length <= 32 && /^[a-zA-Z0-9_-]+$/.test(clean) ? clean : null);
      if (code && !seen.has(code.toLowerCase())) {
        seen.add(code.toLowerCase());
        extracted.push(clean.startsWith('http') ? clean : `https://chat.whatsapp.com/${code}`);
      }
    }
    setParsedLinks(extracted);
  }, [rawInputText]);

  // Load campaigns history
  const fetchCampaigns = async () => {
    try {
      const res = await api.groupJoiner.listCampaigns();
      setCampaigns(res.campaigns || []);
      if (selectedCampaign) {
        const detail = await api.groupJoiner.getCampaign(selectedCampaign.id);
        setSelectedCampaign(detail.campaign);
      } else if (res.campaigns?.length > 0) {
        const running = res.campaigns.find((c) => c.status === 'running') || res.campaigns[0];
        const detail = await api.groupJoiner.getCampaign(running.id);
        setSelectedCampaign(detail.campaign);
      }
    } catch {}
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  // Countdown tick for live anti-ban wait
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [countdown]);

  // Socket.IO live listener for joiner progress
  useEffect(() => {
    if (!socket) return;

    const handleProgress = (evt: JoinerProgressEvent) => {
      setLiveProgress(evt);
      if (evt.countdownSeconds) {
        setCountdown(evt.countdownSeconds);
      } else if (evt.phase !== 'delay' && evt.phase !== 'cooldown') {
        setCountdown(0);
      }

      // Refresh selected campaign items
      if (selectedCampaign?.id === evt.campaignId || viewMode === 'campaigns') {
        api.groupJoiner.getCampaign(evt.campaignId).then((res) => {
          setSelectedCampaign(res.campaign);
          setCampaigns((prev) =>
            prev.map((c) => (c.id === res.campaign.id ? res.campaign : c))
          );
        }).catch(() => {});
      }
    };

    socket.on('joiner:progress', handleProgress);
    return () => {
      socket.off('joiner:progress', handleProgress);
    };
  }, [socket, selectedCampaign?.id, viewMode]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) || '';
      setRawInputText((prev) => (prev ? `${prev}\n${text}` : text));
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleInspectLinks = async () => {
    if (parsedLinks.length === 0) {
      setError('Please paste at least one valid WhatsApp group or community invite link.');
      return;
    }
    if (!isConnected && connectedDevices.length === 0) {
      setError('No WhatsApp device connected. Connect a device first to verify invite links.');
      return;
    }

    setInspecting(true);
    setError(null);
    setInspectedResults([]);
    try {
      const res = await api.groupJoiner.inspectLinks(parsedLinks, selectedDeviceId);
      setInspectedResults(res.results || []);
      setStatusMsg(`Inspected ${res.results.length} link(s) successfully.`);
    } catch (err: any) {
      setError(err.message || 'Failed to inspect links.');
    } finally {
      setInspecting(false);
    }
  };

  const handleFilterValidLinksOnly = () => {
    const validCodes = new Set(
      inspectedResults
        .filter((r) => r.status === 'valid')
        .map((r) => `https://chat.whatsapp.com/${r.code}`)
    );
    if (validCodes.size === 0) {
      setError('No new joinable links found in inspected results.');
      return;
    }
    setRawInputText(Array.from(validCodes).join('\n'));
    setStatusMsg(`Filtered down to ${validCodes.size} valid & unjoined group links!`);
  };

  const handleJoinSingleInstant = async (link: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.groupJoiner.joinSingle(link, selectedDeviceId);
      if (res.result.status === 'joined') {
        setStatusMsg(`Successfully joined group (${res.result.code})!`);
      } else if (res.result.status === 'already_member') {
        setStatusMsg(`Already a member of group (${res.result.code}).`);
      } else if (res.result.status === 'pending_approval') {
        setStatusMsg(`Join request sent to admin for (${res.result.code}).`);
      } else {
        setError(res.result.error || 'Could not join group.');
      }
      // Re-inspect if inspected table is open
      if (inspectedResults.length > 0) {
        setInspectedResults((prev) =>
          prev.map((item) =>
            item.code === res.result.code
              ? { ...item, status: res.result.status === 'joined' || res.result.status === 'already_member' ? 'already_joined' : item.status }
              : item
          )
        );
      }
    } catch (err: any) {
      setError(err.message || 'Failed to join group.');
    } finally {
      setLoading(false);
    }
  };

  const handleLaunchCampaign = async () => {
    if (parsedLinks.length === 0) {
      setError('Please enter at least one valid WhatsApp invite link.');
      return;
    }
    if (!isConnected && connectedDevices.length === 0) {
      setError('Please connect a WhatsApp device before starting the Auto-Joiner.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await api.groupJoiner.createCampaign({
        name: campaignName.trim() || `Join Batch (${parsedLinks.length} Groups)`,
        links: parsedLinks,
        autoStart: true,
        settings: {
          minDelaySeconds,
          maxDelaySeconds,
          batchSize,
          batchPauseSeconds,
          skipAlreadyMember,
          autoExtractMembers: false,
          deviceMode,
          senderDeviceId: selectedDeviceId
        }
      });
      setSelectedCampaign(res.campaign);
      setCampaigns((prev) => [res.campaign, ...prev]);
      setViewMode('campaigns');
      setStatusMsg('Auto-Joiner campaign launched with Anti-Ban protection!');
    } catch (err: any) {
      setError(err.message || 'Failed to launch join campaign.');
    } finally {
      setLoading(false);
    }
  };

  const handleCampaignAction = async (id: string, action: 'start' | 'pause' | 'stop' | 'delete') => {
    try {
      if (action === 'start') await api.groupJoiner.startCampaign(id);
      if (action === 'pause') await api.groupJoiner.pauseCampaign(id);
      if (action === 'stop') await api.groupJoiner.stopCampaign(id);
      if (action === 'delete') {
        await api.groupJoiner.deleteCampaign(id);
        setCampaigns((prev) => prev.filter((c) => c.id !== id));
        if (selectedCampaign?.id === id) setSelectedCampaign(null);
        return;
      }
      const detail = await api.groupJoiner.getCampaign(id);
      setSelectedCampaign(detail.campaign);
      setCampaigns((prev) => prev.map((c) => (c.id === id ? detail.campaign : c)));
    } catch (err: any) {
      setError(err.message || `Failed to ${action} campaign.`);
    }
  };

  const handleExportJoinedCsv = () => {
    if (!selectedCampaign?.items) return;
    const header = 'Invite_Code,Link,Group_Name,Group_JID,Members_Count,Community,Status,Error,Joined_At\n';
    const rows = selectedCampaign.items.map((item) => {
      const name = (item.group_name || '').replace(/"/g, '""');
      const err = (item.error_message || '').replace(/"/g, '""');
      return `"${item.invite_code}","${item.raw_link}","${name}","${item.group_jid || ''}",${item.participant_count},${item.is_community ? 'Yes' : 'No'},"${item.status}","${err}","${item.joined_at || ''}"`;
    }).join('\n');

    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `joined_groups_${selectedCampaign.name.replace(/[^a-z0-9]/gi, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getItemStatusBadge = (status: string) => {
    switch (status) {
      case 'joined':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">Joined</span>;
      case 'already_member':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800">Already Member</span>;
      case 'pending_approval':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">Approval Sent</span>;
      case 'joining':
      case 'inspecting':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-800 animate-pulse">{status}...</span>;
      case 'invalid_link':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700">Expired / Invalid</span>;
      case 'group_full':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-orange-100 text-orange-800">Group Full</span>;
      case 'failed':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700">Failed</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600">Queued</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 rounded-2xl p-6 text-white shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-emerald-500/20 rounded-2xl border border-emerald-400/30">
            <UserPlus className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">Community & Group Auto-Joiner</h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500 text-white uppercase">
                Anti-Ban Engine
              </span>
            </div>
            <p className="text-xs text-emerald-100/80 mt-0.5">
              Inspect invite links, preview member counts & community tags, and auto-join safely with jitter delays
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('builder')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              viewMode === 'builder'
                ? 'bg-white text-slate-900 shadow'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            + New Join Batch
          </button>
          <button
            onClick={() => {
              setViewMode('campaigns');
              fetchCampaigns();
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              viewMode === 'campaigns'
                ? 'bg-white text-slate-900 shadow'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            Live & History ({campaigns.length})
          </button>
        </div>
      </div>

      {/* Warning if not connected */}
      {!isConnected && connectedDevices.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-amber-900 text-sm">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <span>Connect a WhatsApp device to inspect invite links and auto-join groups.</span>
          </div>
          <button
            onClick={() => setIsQrModalOpen(true)}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition shrink-0"
          >
            Connect WhatsApp
          </button>
        </div>
      )}

      {statusMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{statusMsg}</span>
          </div>
          <button onClick={() => setStatusMsg(null)} className="text-xs font-bold underline">Dismiss</button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-xs font-bold underline">Dismiss</button>
        </div>
      )}

      {/* VIEW MODE 1: BUILDER & LINK INSPECTOR */}
      {viewMode === 'builder' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Columns: Paste Links + Inspector Results */}
          <div className="lg:col-span-2 space-y-5">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-emerald-600" />
                    Paste Group & Community Invite Links
                  </h2>
                  <p className="text-xs text-slate-500">
                    Supports messy text — automatically extracts unique <code className="bg-slate-100 px-1 rounded">chat.whatsapp.com/...</code> URLs
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Upload .TXT / .CSV
                  </button>
                  {rawInputText && (
                    <button
                      onClick={() => {
                        setRawInputText('');
                        setInspectedResults([]);
                      }}
                      className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-semibold transition"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <textarea
                rows={7}
                value={rawInputText}
                onChange={(e) => setRawInputText(e.target.value)}
                placeholder={`Paste WhatsApp Group or Community links here (one per line or mixed inside text)...\nExample:\nhttps://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv\nhttps://chat.whatsapp.com/invite/XyZ1234567890AbCdEfGhI`}
                className="w-full p-3.5 text-xs font-mono border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
              />

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                    {parsedLinks.length} Unique Link(s) Detected
                  </span>
                  {parsedLinks.length > 0 && (
                    <span className="text-slate-500">Ready to inspect or auto-join</span>
                  )}
                </div>

                <button
                  onClick={handleInspectLinks}
                  disabled={inspecting || parsedLinks.length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-sm"
                >
                  {inspecting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  {inspecting ? 'Inspecting Links...' : 'Pre-Check & Verify Links'}
                </button>
              </div>
            </div>

            {/* Link Inspector Results Table */}
            {inspectedResults.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Link Verification Report</h3>
                    <p className="text-xs text-slate-500">
                      {inspectedResults.filter((r) => r.status === 'valid').length} Valid &bull;{' '}
                      {inspectedResults.filter((r) => r.status === 'already_joined').length} Already Joined &bull;{' '}
                      {inspectedResults.filter((r) => r.status === 'invalid_or_revoked').length} Dead/Revoked
                    </p>
                  </div>
                  <button
                    onClick={handleFilterValidLinksOnly}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Keep Only Valid Unjoined Links
                  </button>
                </div>

                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 sticky top-0">
                      <tr>
                        <th className="py-2.5 px-4">Group / Community Name</th>
                        <th className="py-2.5 px-4">Type & Info</th>
                        <th className="py-2.5 px-4">Members</th>
                        <th className="py-2.5 px-4">Status</th>
                        <th className="py-2.5 px-4 text-right">Instant</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {inspectedResults.map((item, i) => (
                        <tr key={i} className="hover:bg-slate-50/80">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900">{item.subject}</div>
                            <div className="text-[11px] font-mono text-slate-400">{item.code}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-wrap gap-1">
                              {item.isCommunity ? (
                                <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 text-[10px] font-bold">
                                  Community
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-semibold">
                                  Group
                                </span>
                              )}
                              {item.membershipApprovalMode && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                                  Admin Approval
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-700">
                            {item.size !== undefined ? `${item.size} members` : '-'}
                          </td>
                          <td className="py-3 px-4">
                            {item.status === 'valid' && (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px]">Ready</span>
                            )}
                            {item.status === 'already_joined' && (
                              <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold text-[11px]">Already Member</span>
                            )}
                            {item.status === 'group_full' && (
                              <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 font-bold text-[11px]">Full</span>
                            )}
                            {(item.status === 'invalid_or_revoked' || item.status === 'error') && (
                              <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-bold text-[11px]" title={item.errorMessage}>
                                Dead / Revoked
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {item.status === 'valid' && (
                              <button
                                onClick={() => handleJoinSingleInstant(item.code)}
                                disabled={loading}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold transition"
                              >
                                Join Now
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Anti-Ban Configuration & Launch */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-5 h-fit">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <div>
                <h2 className="text-sm font-bold text-slate-900">Anti-Ban Joiner Settings</h2>
                <p className="text-[11px] text-slate-500">Humanized pacing protects your number</p>
              </div>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Batch Name (Optional)</label>
                <input
                  type="text"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="e.g. Real Estate Groups Batch 1"
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Device Dispatch Mode</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDeviceMode('single')}
                    className={`p-2 rounded-xl border font-semibold transition ${
                      deviceMode === 'single'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    Single Device
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeviceMode('round_robin')}
                    className={`p-2 rounded-xl border font-semibold transition ${
                      deviceMode === 'round_robin'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    Multi-Device Rotate
                  </button>
                </div>
              </div>

              {deviceMode === 'single' && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Target WhatsApp Device</label>
                  <select
                    value={selectedDeviceId}
                    onChange={(e) => setSelectedDeviceId(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl bg-white"
                  >
                    {devices.map((d) => (
                      <option key={d.session_id} value={d.session_id}>
                        {d.alias} ({d.phone_number || d.status})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Min Delay (sec)</label>
                  <input
                    type="number"
                    min={5}
                    max={300}
                    value={minDelaySeconds}
                    onChange={(e) => setMinDelaySeconds(Math.max(5, Number(e.target.value)))}
                    className="w-full p-2 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Max Delay (sec)</label>
                  <input
                    type="number"
                    min={minDelaySeconds}
                    max={600}
                    value={maxDelaySeconds}
                    onChange={(e) => setMaxDelaySeconds(Math.max(minDelaySeconds, Number(e.target.value)))}
                    className="w-full p-2 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Batch Size</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={batchSize}
                    onChange={(e) => setBatchSize(Math.max(1, Number(e.target.value)))}
                    className="w-full p-2 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Cooldown Pause (sec)</label>
                  <input
                    type="number"
                    min={10}
                    max={600}
                    value={batchPauseSeconds}
                    onChange={(e) => setBatchPauseSeconds(Math.max(10, Number(e.target.value)))}
                    className="w-full p-2 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2.5 p-3 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipAlreadyMember}
                  onChange={(e) => setSkipAlreadyMember(e.target.checked)}
                  className="rounded text-emerald-600"
                />
                <span className="font-medium text-slate-700">Skip groups I am already a member of</span>
              </label>

              <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-[11px] text-blue-800 flex gap-2">
                <Info className="w-4 h-4 shrink-0 text-blue-600 mt-0.5" />
                <span>
                  Recommended safe speed: 15–30s delay & pause 60s every 5 groups. Never blast 50+ joins instantly on a fresh SIM.
                </span>
              </div>

              <button
                onClick={handleLaunchCampaign}
                disabled={loading || parsedLinks.length === 0}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold shadow-md transition flex items-center justify-center gap-2"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Start Auto-Joiner ({parsedLinks.length} Links)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW MODE 2: LIVE EXECUTION & HISTORY */}
      {viewMode === 'campaigns' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left List: Past & Active Campaigns */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden h-fit">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Joiner Campaigns</h2>
              <button onClick={fetchCampaigns} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {campaigns.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No join campaigns yet. Create one in "New Join Batch".
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[550px] overflow-y-auto">
                {campaigns.map((camp) => (
                  <div
                    key={camp.id}
                    onClick={() => api.groupJoiner.getCampaign(camp.id).then((r) => setSelectedCampaign(r.campaign))}
                    className={`p-4 cursor-pointer transition hover:bg-slate-50 ${
                      selectedCampaign?.id === camp.id ? 'bg-emerald-50/60 border-l-4 border-emerald-600' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-slate-900 truncate">{camp.name}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          camp.status === 'running'
                            ? 'bg-emerald-100 text-emerald-700 animate-pulse'
                            : camp.status === 'completed'
                            ? 'bg-blue-100 text-blue-700'
                            : camp.status === 'paused'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {camp.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center justify-between">
                      <span>
                        {camp.joined_count}/{camp.total_links} Joined &bull; {camp.failed_count} Failed
                      </span>
                      <span>{new Date(camp.created_at + 'Z').toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right 2 Columns: Selected Campaign Progress & Live Logs */}
          <div className="lg:col-span-2 space-y-5">
            {!selectedCampaign ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
                <Layers className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium text-slate-600">Select a campaign from the left to view live progress.</p>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-bold text-slate-900">{selectedCampaign.name}</h2>
                      <p className="text-xs text-slate-500">
                        Total: {selectedCampaign.total_links} &bull; Joined: <strong className="text-emerald-700">{selectedCampaign.joined_count}</strong> &bull;
                        Skipped: <strong>{selectedCampaign.skipped_count}</strong> &bull;
                        Failed: <strong className="text-red-600">{selectedCampaign.failed_count}</strong>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {selectedCampaign.status === 'running' ? (
                        <button
                          onClick={() => handleCampaignAction(selectedCampaign.id, 'pause')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition"
                        >
                          <Pause className="w-3.5 h-3.5" /> Pause
                        </button>
                      ) : selectedCampaign.status !== 'completed' && selectedCampaign.status !== 'stopped' ? (
                        <button
                          onClick={() => handleCampaignAction(selectedCampaign.id, 'start')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition"
                        >
                          <Play className="w-3.5 h-3.5" /> Resume
                        </button>
                      ) : null}

                      {(selectedCampaign.status === 'running' || selectedCampaign.status === 'paused') && (
                        <button
                          onClick={() => handleCampaignAction(selectedCampaign.id, 'stop')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition"
                        >
                          <Square className="w-3.5 h-3.5" /> Stop
                        </button>
                      )}

                      <button
                        onClick={handleExportJoinedCsv}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" /> Export CSV
                      </button>

                      {onNavigateToExtractor && (
                        <button
                          onClick={onNavigateToExtractor}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> Extract Members
                        </button>
                      )}

                      <button
                        onClick={() => handleCampaignAction(selectedCampaign.id, 'delete')}
                        className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition"
                        title="Delete Campaign"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Progress Bar & Countdown */}
                  {(() => {
                    const total = selectedCampaign.total_links || 1;
                    const done =
                      selectedCampaign.joined_count +
                      selectedCampaign.failed_count +
                      selectedCampaign.skipped_count +
                      selectedCampaign.pending_approval_count;
                    const pct = Math.min(100, Math.round((done / total) * 100));

                    return (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span className="text-slate-700">
                            {selectedCampaign.status === 'running' && countdown > 0 ? (
                              <span className="inline-flex items-center gap-1.5 text-amber-700">
                                <Clock className="w-3.5 h-3.5 animate-spin" />
                                {liveProgress?.phase === 'cooldown'
                                  ? `Batch Cooldown Pause: ${countdown}s remaining...`
                                  : `Anti-Ban Delay: Joining next group in ${countdown}s...`}
                              </span>
                            ) : selectedCampaign.status === 'running' ? (
                              <span className="text-emerald-700">Processing links...</span>
                            ) : (
                              <span>Progress: {done} / {total} links</span>
                            )}
                          </span>
                          <span className="text-slate-900">{pct}%</span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-600 transition-all duration-300"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Live Items Table */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-slate-100 font-bold text-sm text-slate-900">
                    Detailed Join Logs ({selectedCampaign.items?.length || 0})
                  </div>
                  <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 sticky top-0">
                        <tr>
                          <th className="py-2.5 px-4">Group / Invite Code</th>
                          <th className="py-2.5 px-4">Members</th>
                          <th className="py-2.5 px-4">Status</th>
                          <th className="py-2.5 px-4">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedCampaign.items?.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50/70">
                            <td className="py-3 px-4">
                              <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                                {item.group_name || 'Pending Inspection'}
                                {item.is_community && (
                                  <span className="px-1.5 py-0.2 rounded bg-purple-100 text-purple-700 text-[9px] font-bold">
                                    COMMUNITY
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] font-mono text-slate-400">{item.invite_code}</div>
                            </td>
                            <td className="py-3 px-4 text-slate-700 font-medium">
                              {item.participant_count > 0 ? item.participant_count : '-'}
                            </td>
                            <td className="py-3 px-4">{getItemStatusBadge(item.status)}</td>
                            <td className="py-3 px-4 text-slate-500 max-w-xs truncate" title={item.error_message || ''}>
                              {item.error_message || (item.joined_at ? `Joined at ${new Date(item.joined_at + 'Z').toLocaleTimeString()}` : '-')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

