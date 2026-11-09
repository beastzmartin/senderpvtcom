import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { BroadcastSchedule, BroadcastRecipient, MessageTemplate } from '../../types';
import { CsvUploaderModal, MappedContact } from '../common/CsvUploaderModal';
import {
  Calendar,
  Clock,
  Play,
  Pause,
  Trash2,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Users,
  Eye,
  FileText,
  ShieldCheck,
  Zap,
  ArrowRight,
  ListFilter,
  Smartphone,
  Layers
} from 'lucide-react';

interface SchedulerViewProps {
  initialAudience?: MappedContact[];
  initialTemplateText?: string;
  onNavigateToSender?: () => void;
}

export const SchedulerView: React.FC<SchedulerViewProps> = ({
  initialAudience,
  initialTemplateText,
  onNavigateToSender
}) => {
  const { isConnected, setIsQrModalOpen, socket, devices, activeSessionId, setIsDeviceManagerOpen } = useWhatsApp();

  const [schedulerDeviceMode, setSchedulerDeviceMode] = useState<'round_robin' | 'single'>('round_robin');
  const [schedulerSelectedDevice, setSchedulerSelectedDevice] = useState<string>(activeSessionId);

  const [schedules, setSchedules] = useState<BroadcastSchedule[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Create Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);

  // Form State
  const [formName, setFormName] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [templateContent, setTemplateContent] = useState<string>('');
  const [dailyLimit, setDailyLimit] = useState<number>(20); // default 20 per day
  const [scheduledTime, setScheduledTime] = useState<string>('10:00'); // default 10:00 AM
  const [rawAudienceText, setRawAudienceText] = useState<string>('');
  const [parsedAudience, setParsedAudience] = useState<MappedContact[]>([]);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState<boolean>(false);

  // Detailed Schedule View (Recipients Drawer)
  const [selectedSchedule, setSelectedSchedule] = useState<{
    schedule: BroadcastSchedule;
    recipients: BroadcastRecipient[];
  } | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState<boolean>(false);
  const [recipientFilter, setRecipientFilter] = useState<string>('all');

  // Notifications
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    loadSchedules();
    loadTemplates();
  }, []);

  // Pre-fill initial audience if passed
  useEffect(() => {
    if (initialAudience && initialAudience.length > 0) {
      setParsedAudience(initialAudience);
      setRawAudienceText(initialAudience.map((c) => c.lid).join('\n'));
      setIsCreateModalOpen(true);
    }
  }, [initialAudience]);

  useEffect(() => {
    if (initialTemplateText) {
      setTemplateContent(initialTemplateText);
      setIsCreateModalOpen(true);
    }
  }, [initialTemplateText]);

  // Socket listener for real-time schedule updates
  useEffect(() => {
    if (!socket) return;

    const handleStatusChanged = () => {
      loadSchedules();
    };

    const handleBatchCompleted = (data: {
      scheduleId: string;
      sent: number;
      failed: number;
      remaining: number;
      nextRunAt?: string | null;
      isCompleted: boolean;
    }) => {
      loadSchedules();
      setSuccessBanner(
        `Daily batch finished for schedule! Sent: ${data.sent}, Failed: ${data.failed}. (${data.remaining} remaining)`
      );
      if (selectedSchedule && selectedSchedule.schedule.id === data.scheduleId) {
        loadScheduleDetails(data.scheduleId);
      }
    };

    socket.on('scheduler:status_changed', handleStatusChanged);
    socket.on('scheduler:batch_completed', handleBatchCompleted);

    return () => {
      socket.off('scheduler:status_changed', handleStatusChanged);
      socket.off('scheduler:batch_completed', handleBatchCompleted);
    };
  }, [socket, selectedSchedule]);

  const loadSchedules = async () => {
    setIsLoading(true);
    try {
      const res = await api.scheduler.list();
      setSchedules(res.data || []);
    } catch (err: any) {
      console.error('Failed to load schedules:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const res = await api.templates.list();
      setTemplates(res.data || []);
    } catch {
      // Non-fatal
    }
  };

  const loadScheduleDetails = async (id: string) => {
    setIsLoadingDetails(true);
    try {
      const res = await api.scheduler.get(id);
      setSelectedSchedule(res.data);
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to load schedule recipients');
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleTemplateSelect = (tplId: string) => {
    setSelectedTemplateId(tplId);
    const found = templates.find((t) => t.id === tplId);
    if (found) {
      setTemplateContent(found.content);
    }
  };

  const handleLoadSavedContacts = async () => {
    try {
      const res = await api.contacts.list();
      const lidContacts = res.data
        .filter((c) => Boolean(c.lid))
        .map((c) => ({
          lid: c.lid!,
          phone: c.phone_number || undefined,
          name: c.name || undefined
        }));

      if (lidContacts.length === 0) {
        alert('No contacts with WhatsApp LIDs found in address book.');
        return;
      }

      setParsedAudience(lidContacts);
      setRawAudienceText(lidContacts.map((c) => c.lid).join('\n'));
      setSuccessBanner(`Loaded ${lidContacts.length} contacts from address book.`);
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to load contacts');
    }
  };

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);
    setSuccessBanner(null);

    // Parse raw audience if entered manually
    let finalAudience = parsedAudience;
    if (finalAudience.length === 0 && rawAudienceText.trim()) {
      const lines = rawAudienceText
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => (s.endsWith('@lid') ? s : /^\d+$/.test(s) ? `${s}@lid` : s))
        .filter((s) => s.endsWith('@lid'));

      finalAudience = Array.from(new Set(lines)).map((lid) => ({ lid }));
    }

    if (finalAudience.length === 0) {
      setErrorBanner('Please provide at least 1 valid WhatsApp LID in the audience list.');
      return;
    }

    if (!templateContent.trim()) {
      setErrorBanner('Template content cannot be empty.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await api.scheduler.create({
        name: formName.trim() || `Daily Broadcast (${dailyLimit} users/day)`,
        templateId: selectedTemplateId || undefined,
        templateContent: templateContent.trim(),
        dailyLimit,
        scheduledTime,
        recipients: finalAudience,
        settings: {
          deviceMode: schedulerDeviceMode,
          senderDeviceId: schedulerDeviceMode === 'single' ? schedulerSelectedDevice : undefined
        }
      });

      setSuccessBanner(
        `Scheduled broadcast "${res.data.name}" created! It will automatically send ${dailyLimit} messages every day at ${scheduledTime}.`
      );
      setIsCreateModalOpen(false);
      // Reset form
      setFormName('');
      setTemplateContent('');
      setRawAudienceText('');
      setParsedAudience([]);
      await loadSchedules();
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to create broadcast schedule');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRunNow = async (id: string) => {
    if (!isConnected) {
      setErrorBanner('WhatsApp is disconnected. Connect via QR code to execute batch.');
      setIsQrModalOpen(true);
      return;
    }

    if (!window.confirm('Send today\'s scheduled batch immediately right now?')) return;

    try {
      setSuccessBanner('Executing batch in background with safe rate-limiting...');
      await api.scheduler.runNow(id);
      await loadSchedules();
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to trigger batch');
    }
  };

  const handlePause = async (id: string) => {
    try {
      await api.scheduler.pause(id);
      await loadSchedules();
      setSuccessBanner('Schedule paused.');
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to pause');
    }
  };

  const handleResume = async (id: string) => {
    try {
      await api.scheduler.resume(id);
      await loadSchedules();
      setSuccessBanner('Schedule resumed.');
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to resume');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete broadcast schedule "${name}"?`)) return;
    try {
      await api.scheduler.delete(id);
      if (selectedSchedule?.schedule.id === id) {
        setSelectedSchedule(null);
      }
      await loadSchedules();
      setSuccessBanner('Schedule deleted.');
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to delete');
    }
  };

  const filteredRecipients = selectedSchedule?.recipients.filter((r) => {
    if (recipientFilter === 'all') return true;
    return r.status === recipientFilter;
  }) || [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Automated Broadcast Scheduler</h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-purple-600" />
              Daily Drip Engine
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Send a set number of messages (e.g. 10 or 20 users per day) automatically at a fixed time to keep your account 100% ban-proof.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setIsCreateModalOpen(true);
            setDailyLimit(20);
            setScheduledTime('10:00');
          }}
          className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center gap-2 transition shadow-xs self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Schedule Daily Broadcast
        </button>
      </div>

      {/* Notification Banners */}
      {errorBanner && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-2 shadow-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorBanner}</span>
          </div>
          <button type="button" onClick={() => setErrorBanner(null)} className="text-rose-600 px-2">
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
          <button type="button" onClick={() => setSuccessBanner(null)} className="text-emerald-600 px-2">
            ✕
          </button>
        </div>
      )}

      {/* Schedules Cards List */}
      {isLoading ? (
        <div className="py-16 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
          <RefreshCw className="w-6 h-6 animate-spin text-purple-600" />
          <span className="text-xs">Loading scheduled broadcasts...</span>
        </div>
      ) : schedules.length === 0 ? (
        <div className="py-16 text-center text-slate-500 bg-white border border-slate-200 rounded-2xl p-8 space-y-3 shadow-xs">
          <Calendar className="w-10 h-10 text-slate-400 mx-auto" />
          <h4 className="text-sm font-bold text-slate-800">No Scheduled Broadcasts Yet</h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Take a list of 100 or 500 contacts and broadcast e.g. 10 or 20 messages per day automatically to avoid WhatsApp ban.
          </p>
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-xs"
          >
            Create Your First Schedule
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {schedules.map((s) => {
            const total = s.total_recipients || 0;
            const sent = s.sent_recipients || 0;
            const remaining = Math.max(0, total - sent);
            const daysPlanned = Math.ceil(total / (s.daily_limit || 1));
            const daysElapsed = Math.floor(sent / (s.daily_limit || 1));
            const progress = total > 0 ? Math.round((sent / total) * 100) : 0;

            return (
              <div
                key={s.id}
                className="bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-5 shadow-xs space-y-4 transition"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-base">{s.name}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          s.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : s.status === 'paused'
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : 'bg-sky-100 text-sky-800 border border-sky-200'
                        }`}
                      >
                        {s.status}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <span className="flex items-center gap-1 text-purple-700 font-semibold">
                        <Clock className="w-3.5 h-3.5 text-purple-600" />
                        {s.daily_limit} users / day at {s.scheduled_time}
                      </span>
                      <span>•</span>
                      <span>
                        Total: <strong className="text-slate-900">{total} contacts</strong>
                      </span>
                      <span>•</span>
                      <span>
                        Est. Duration: <strong className="text-slate-900">{daysPlanned} days</strong> ({daysElapsed}/{daysPlanned} completed)
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    {s.status === 'active' && remaining > 0 && (
                      <button
                        type="button"
                        onClick={() => handleRunNow(s.id)}
                        className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
                        title="Dispatch today's batch immediately"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        Run Today's Batch ({Math.min(remaining, s.daily_limit)})
                      </button>
                    )}

                    {s.status === 'active' ? (
                      <button
                        type="button"
                        onClick={() => handlePause(s.id)}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-amber-800 text-xs font-semibold flex items-center gap-1.5 transition border border-slate-200"
                      >
                        <Pause className="w-3.5 h-3.5" />
                        Pause
                      </button>
                    ) : s.status === 'paused' ? (
                      <button
                        type="button"
                        onClick={() => handleResume(s.id)}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-emerald-800 text-xs font-semibold flex items-center gap-1.5 transition border border-slate-200"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Resume
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => loadScheduleDetails(s.id)}
                      className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition border border-slate-200 shadow-xs"
                    >
                      <Eye className="w-3.5 h-3.5 text-sky-600" />
                      View Breakdown
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(s.id, s.name)}
                      className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                      title="Delete Schedule"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Progress bar & details */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-slate-600">
                      Progress: <strong className="text-slate-900">{sent}</strong> of {total} sent ({remaining} remaining)
                    </span>
                    <span className="text-purple-600 font-mono font-bold">{progress}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 via-indigo-500 to-emerald-500 transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* Status footer banner */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="text-slate-600">
                    Next Batch:{' '}
                    {s.next_run_at ? (
                      <span className="text-slate-900 font-mono font-bold">
                        {new Date(s.next_run_at).toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-emerald-700 font-bold">All Batches Completed</span>
                    )}
                  </div>

                  <div className="text-[11px] text-slate-500 truncate max-w-md italic">
                    Template: "{s.template_content}"
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ======================================================== */}
      {/* DETAILED RECIPIENTS BREAKDOWN MODAL                       */}
      {/* ======================================================== */}
      {selectedSchedule && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-4xl w-full p-6 space-y-4 shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <ListFilter className="w-4 h-4 text-purple-600" />
                  Broadcast Schedule Breakdown: {selectedSchedule.schedule.name}
                </h3>
                <span className="text-xs text-slate-500">
                  {selectedSchedule.schedule.daily_limit} users per day at {selectedSchedule.schedule.scheduled_time}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSchedule(null)}
                className="text-slate-400 hover:text-slate-700 px-2 text-xs"
              >
                ✕
              </button>
            </div>

            {/* Filter buttons */}
            <div className="flex items-center gap-2 text-xs">
              {(['all', 'sent', 'pending', 'failed'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setRecipientFilter(st)}
                  className={`px-3 py-1 rounded-xl capitalize transition font-medium ${
                    recipientFilter === st
                      ? 'bg-purple-600 text-white font-semibold shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            {/* Table */}
            <div className="flex-1 overflow-y-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 sticky top-0 text-[11px] font-semibold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">WhatsApp LID</th>
                    <th className="py-2.5 px-3">Name / Phone</th>
                    <th className="py-2.5 px-3">Batch Day</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Sent Time / Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredRecipients.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        No recipients in this category.
                      </td>
                    </tr>
                  ) : (
                    filteredRecipients.map((rec, i) => (
                      <tr key={rec.id} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">{i + 1}</td>
                        <td className="py-2.5 px-3 font-mono text-sky-700 font-semibold">{rec.lid}</td>
                        <td className="py-2.5 px-3 text-slate-700">
                          {rec.name || rec.phone_number || <span className="text-slate-400">—</span>}
                        </td>
                        <td className="py-2.5 px-3">
                          {rec.batch_day > 0 ? (
                            <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-bold">
                              Day {rec.batch_day}
                            </span>
                          ) : (
                            <span className="text-slate-500 text-[11px]">Upcoming</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          {rec.status === 'sent' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              SENT
                            </span>
                          )}
                          {rec.status === 'failed' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                              FAILED
                            </span>
                          )}
                          {rec.status === 'pending' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                              PENDING
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                          {rec.sent_at ? (
                            new Date(rec.sent_at).toLocaleString()
                          ) : rec.error_message ? (
                            <span className="text-rose-600">{rec.error_message}</span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedSchedule(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
              >
                Close Breakdown
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* CREATE NEW SCHEDULE MODAL                                */}
      {/* ======================================================== */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-purple-600" />
                Schedule a Daily Broadcast Campaign
              </h4>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 px-2 text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSchedule} className="space-y-4">
              {/* Campaign Name */}
              <div>
                <label className="text-xs font-semibold text-slate-800 block mb-1">
                  Schedule Name
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. VIP Member Outreach (20/day)"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-purple-500 shadow-xs"
                />
              </div>

              {/* Cadence: Daily Limit & Time */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-purple-50/50 border border-purple-200/80">
                <div>
                  <label className="text-xs font-semibold text-purple-900 block mb-1 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-purple-600" />
                    Daily Sending Batch Size
                  </label>
                  <div className="flex items-center gap-2">
                    {[10, 20, 30].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setDailyLimit(num)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                          dailyLimit === num
                            ? 'bg-purple-600 text-white shadow-xs'
                            : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
                        }`}
                      >
                        {num} / day
                      </button>
                    ))}
                    <input
                      type="number"
                      min="5"
                      max="100"
                      value={dailyLimit}
                      onChange={(e) => setDailyLimit(parseInt(e.target.value, 10) || 10)}
                      className="w-16 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 font-mono text-center shadow-xs"
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    e.g. 100 contacts at 20/day = 5 days total duration
                  </span>
                </div>

                <div>
                  <label className="text-xs font-semibold text-purple-900 block mb-1 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-purple-600" />
                    Scheduled Time of Day
                  </label>
                  <input
                    type="time"
                    required
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 font-mono focus:outline-none focus:border-purple-500 shadow-xs"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Runs every day automatically at this time
                  </span>
                </div>
              </div>

              {/* Multi-Device Account Dispatcher for Schedule */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-slate-800">Dispatching Account / Anti-Ban</span>
                  </div>
                  <span className="text-[10px] text-slate-500">
                    {devices.filter((d) => d.status === 'connected').length} connected
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <label
                    className={`p-2.5 rounded-lg border cursor-pointer transition flex items-start gap-2 ${
                      schedulerDeviceMode === 'round_robin'
                        ? 'bg-white border-emerald-500 ring-1 ring-emerald-500 shadow-2xs'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="schedDeviceMode"
                      checked={schedulerDeviceMode === 'round_robin'}
                      onChange={() => setSchedulerDeviceMode('round_robin')}
                      className="mt-0.5 accent-emerald-600"
                    />
                    <div>
                      <span className="font-bold text-slate-900 block">⚡ Smart Device Rotation</span>
                      <span className="text-[10px] text-slate-500">Rotate daily drip batches across all connected accounts</span>
                    </div>
                  </label>

                  <label
                    className={`p-2.5 rounded-lg border cursor-pointer transition flex items-start gap-2 ${
                      schedulerDeviceMode === 'single'
                        ? 'bg-white border-emerald-500 ring-1 ring-emerald-500 shadow-2xs'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="schedDeviceMode"
                      checked={schedulerDeviceMode === 'single'}
                      onChange={() => setSchedulerDeviceMode('single')}
                      className="mt-0.5 accent-emerald-600"
                    />
                    <div className="w-full space-y-1">
                      <span className="font-bold text-slate-900 block">Single Account</span>
                      <select
                        disabled={schedulerDeviceMode !== 'single'}
                        value={schedulerSelectedDevice}
                        onChange={(e) => setSchedulerSelectedDevice(e.target.value)}
                        className="w-full px-2 py-0.5 bg-slate-50 border border-slate-300 rounded text-[11px] font-semibold text-slate-800 disabled:opacity-50"
                      >
                        {devices.map((dev) => (
                          <option key={dev.session_id} value={dev.session_id}>
                            {dev.alias} ({dev.phone_number || dev.status})
                          </option>
                        ))}
                      </select>
                    </div>
                  </label>
                </div>
              </div>

              {/* Template Picker */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-800">
                    Message Template
                  </label>
                  {templates.length > 0 && (
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => handleTemplateSelect(e.target.value)}
                      className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] text-purple-700 focus:outline-none shadow-xs"
                    >
                      <option value="">-- Load from Template Library --</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.category})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <textarea
                  rows={4}
                  required
                  value={templateContent}
                  onChange={(e) => setTemplateContent(e.target.value)}
                  placeholder="Message content with {Hello|Hi} and {lid}, {name}, {random}..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 font-mono resize-none focus:outline-none focus:bg-white focus:border-purple-500 shadow-xs"
                />
              </div>

              {/* Audience Input */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-800">
                    Audience Recipients (WhatsApp LIDs)
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsCsvModalOpen(true)}
                      className="text-[11px] text-sky-600 hover:underline flex items-center gap-1 font-semibold"
                    >
                      <FileSpreadsheet className="w-3 h-3" />
                      Upload CSV
                    </button>
                    <button
                      type="button"
                      onClick={handleLoadSavedContacts}
                      className="text-[11px] text-purple-600 hover:underline flex items-center gap-1 font-semibold"
                    >
                      <Users className="w-3 h-3" />
                      From Contacts
                    </button>
                  </div>
                </div>

                <textarea
                  rows={3}
                  value={rawAudienceText}
                  onChange={(e) => setRawAudienceText(e.target.value)}
                  placeholder="Paste WhatsApp LIDs (one per line, e.g. 7757465940199@lid)..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono placeholder-slate-400 resize-none focus:outline-none focus:bg-white focus:border-purple-500 shadow-xs"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  {parsedAudience.length > 0
                    ? `${parsedAudience.length} mapped contacts loaded from CSV/Contacts.`
                    : 'Paste LIDs or upload a CSV file with columns.'}
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition"
                >
                  {isSubmitting ? 'Scheduling...' : 'Activate Daily Broadcast Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Uploader Modal */}
      <CsvUploaderModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        onImportToScheduler={(contacts) => {
          setParsedAudience(contacts);
          setRawAudienceText(contacts.map((c) => c.lid).join('\n'));
          setSuccessBanner(`Loaded ${contacts.length} recipients with custom variables from CSV.`);
        }}
      />
    </div>
  );
};

