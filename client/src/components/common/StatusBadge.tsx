import React from 'react';
import { WhatsAppStatus } from '../../types';
import { RefreshCw } from 'lucide-react';

interface StatusBadgeProps {
  status: WhatsAppStatus;
  showText?: boolean;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, showText = true, className = '' }) => {
  switch (status) {
    case 'connected':
      return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 ${className}`}>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          {showText && <span>Connected</span>}
        </span>
      );

    case 'connecting':
      return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 ${className}`}>
          <RefreshCw className="w-3 h-3 animate-spin text-amber-600" />
          {showText && <span>Connecting</span>}
        </span>
      );

    case 'reconnecting':
      return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200 ${className}`}>
          <RefreshCw className="w-3 h-3 animate-spin text-sky-600" />
          {showText && <span>Reconnecting</span>}
        </span>
      );

    case 'disconnected':
    default:
      return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200 ${className}`}>
          <span className="h-2 w-2 rounded-full bg-slate-400"></span>
          {showText && <span>Disconnected</span>}
        </span>
      );
  }
};
