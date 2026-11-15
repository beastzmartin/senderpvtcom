import React from 'react';
import { DashboardStats } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { useWhatsApp } from '../../context/WhatsAppContext';
import {
  Send,
  Inbox,
  MessageSquare,
  AlertTriangle,
  QrCode,
  Smartphone
} from 'lucide-react';

interface StatsOverviewProps {
  stats: DashboardStats | null;
  onOpenQr: () => void;
}

export const StatsOverview: React.FC<StatsOverviewProps> = ({ stats, onOpenQr }) => {
  const { devices, setIsDeviceManagerOpen, activeDevice } = useWhatsApp();
  const connectedCount = devices.filter((d) => d.status === 'connected').length;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {/* Sent Messages */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs hover:shadow-md transition">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Sent</span>
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Send className="w-4 h-4" />
          </div>
        </div>
        <div className="text-2xl font-black text-slate-900 tracking-tight font-mono">{stats?.totalSent ?? 0}</div>
        <div className="text-[11px] text-emerald-700 font-semibold mt-1 flex items-center gap-1">
          <span>Outgoing messages</span>
        </div>
      </div>

      {/* Received Messages */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs hover:shadow-md transition">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Received</span>
          <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
            <Inbox className="w-4 h-4" />
          </div>
        </div>
        <div className="text-2xl font-black text-slate-900 tracking-tight font-mono">{stats?.totalReceived ?? 0}</div>
        <div className="text-[11px] text-teal-700 font-semibold mt-1 flex items-center gap-1">
          <span>Real-time inbound</span>
        </div>
      </div>

      {/* Active Conversations */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs hover:shadow-md transition">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Conversations</span>
          <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <MessageSquare className="w-4 h-4" />
          </div>
        </div>
        <div className="text-2xl font-black text-slate-900 tracking-tight font-mono">{stats?.activeConversations ?? 0}</div>
        <div className="text-[11px] text-indigo-700 font-semibold mt-1">
          <span>Phone & LID threads</span>
        </div>
      </div>

      {/* Failed Messages */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs hover:shadow-md transition">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Failed Messages</span>
          <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4" />
          </div>
        </div>
        <div className="text-2xl font-black text-slate-900 tracking-tight font-mono">{stats?.failedMessages ?? 0}</div>
        <div className="text-[11px] text-rose-700 font-semibold mt-1">
          <span>Failed delivery logs</span>
        </div>
      </div>

      {/* WhatsApp Status & Multi-Device Card */}
      <div
        onClick={() => setIsDeviceManagerOpen(true)}
        className="bg-white border border-slate-200 hover:border-emerald-500/60 rounded-2xl p-5 shadow-xs hover:shadow-md transition cursor-pointer group"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">WhatsApp Accounts</span>
          <Smartphone className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition" />
        </div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xl font-black text-slate-900 tracking-tight font-mono">
            {connectedCount} <span className="text-xs font-normal text-slate-400">/ {devices.length} Online</span>
          </span>
        </div>
        <div className="text-[11px] text-emerald-700 font-semibold truncate flex items-center gap-1">
          <span>{activeDevice?.alias || 'Manage all devices'} →</span>
        </div>
      </div>
    </div>
  );
};
