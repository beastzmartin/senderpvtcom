import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../services/api';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { useContact } from '../../context/ContactContext';
import { DashboardStats } from '../../types';
import { StatsOverview } from './StatsOverview';
import { QuickSender } from './QuickSender';
import { RecentMessages } from './RecentMessages';
import { RefreshCw, QrCode, MessageCircle, Phone, Edit2 } from 'lucide-react';

interface DashboardViewProps {
  onNavigateToConversation: (conversationId: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigateToConversation }) => {
  const { isConnected, setIsQrModalOpen, socket } = useWhatsApp();
  const { phone, getWhatsAppUrl, openEditModal } = useContact();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const data = await api.messages.getDashboardStats();
      setStats(data);
    } catch (err) {
      console.error('[Dashboard] Error fetching stats:', err);
    }
  }, []);

  useEffect(() => {
    fetchStats();

    if (!socket) return;

    const handleUpdate = () => {
      fetchStats();
    };

    socket.on('message:sent', handleUpdate);
    socket.on('message:received', handleUpdate);
    socket.on('message:failed', handleUpdate);
    socket.on('message:status', handleUpdate);
    socket.on('whatsapp:status', handleUpdate);

    return () => {
      socket.off('message:sent', handleUpdate);
      socket.off('message:received', handleUpdate);
      socket.off('message:failed', handleUpdate);
      socket.off('message:status', handleUpdate);
      socket.off('whatsapp:status', handleUpdate);
    };
  }, [fetchStats, socket]);

  const handleManualRefresh = async () => {
    setLoading(true);
    await fetchStats();
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner if disconnected */}
      {!isConnected && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-amber-950">WhatsApp Account Not Connected</h4>
              <p className="text-xs text-amber-800">
                Scan the dynamic QR code with your WhatsApp mobile app to start sending and receiving real messages.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsQrModalOpen(true)}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs transition shadow-xs shrink-0 flex items-center justify-center gap-2"
          >
            <QrCode className="w-4 h-4" />
            Connect WhatsApp
          </button>
        </div>
      )}

      {/* Header with Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Overview Dashboard</h2>
          <p className="text-xs text-slate-500">Real-time metrics, quick sender and recent logs</p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={getWhatsAppUrl('Hello! I have a question about WhatsApp Sender.')}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-xs font-bold text-emerald-800 transition border border-emerald-200 shadow-2xs font-mono"
            title={`WhatsApp Support: ${phone}`}
          >
            <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden sm:inline">WhatsApp:</span>
            <span>{phone}</span>
          </a>

          <button
            type="button"
            onClick={openEditModal}
            className="p-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-400 hover:text-emerald-700 transition border border-slate-200 shadow-2xs"
            title="Edit WhatsApp number"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleManualRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition border border-slate-200 shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Stats
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <StatsOverview stats={stats} onOpenQr={() => setIsQrModalOpen(true)} />

      {/* Split view: Quick Sender (left) & Recent Messages (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-5">
          <QuickSender onMessageSent={fetchStats} />
        </div>
        <div className="lg:col-span-7">
          <RecentMessages
            messages={stats?.recentMessages || []}
            onSelectMessage={onNavigateToConversation}
          />
        </div>
      </div>

      {/* Quick Help & Contact Card */}
      <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-3xl shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
            <MessageCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-white">Need Technical Support or High-Volume Licenses?</h4>
              <button
                type="button"
                onClick={openEditModal}
                className="text-slate-400 hover:text-white p-0.5"
                title="Edit WhatsApp number"
              >
                <Edit2 className="w-3 h-3" />
              </button>
            </div>
            <p className="text-xs text-slate-300">
              Get immediate assistance for multi-device setup, LID messaging, anti-ban guidelines, and custom quotas.
            </p>
          </div>
        </div>
        <a
          href={getWhatsAppUrl('Hello! I am reaching out from the WhatsApp Sender dashboard.')}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full sm:w-auto px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition flex items-center justify-center gap-2 shrink-0 font-mono shadow-xs"
        >
          <Phone className="w-3.5 h-3.5 text-slate-950" />
          <span>Chat {phone}</span>
        </a>
      </div>
    </div>
  );
};

