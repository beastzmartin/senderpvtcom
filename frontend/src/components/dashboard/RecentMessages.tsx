import React from 'react';
import { Message } from '../../types';
import {
  Send,
  Inbox,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  Hash,
  Phone
} from 'lucide-react';

interface RecentMessagesProps {
  messages: Array<Message & { display_name?: string; raw_identifier?: string }>;
  onSelectMessage?: (conversationId: string) => void;
}

export const RecentMessages: React.FC<RecentMessagesProps> = ({ messages, onSelectMessage }) => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'read':
        return (
          <span title="Read">
            <CheckCheck className="w-3.5 h-3.5 text-sky-600" />
          </span>
        );
      case 'delivered':
        return (
          <span title="Delivered">
            <CheckCheck className="w-3.5 h-3.5 text-slate-400" />
          </span>
        );
      case 'sent':
        return (
          <span title="Sent by provider">
            <Check className="w-3.5 h-3.5 text-slate-400" />
          </span>
        );
      case 'failed':
        return (
          <span title="Failed">
            <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
          </span>
        );
      case 'pending':
      default:
        return (
          <span title="Pending">
            <Clock className="w-3.5 h-3.5 text-amber-500" />
          </span>
        );
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">Recent Activity</h3>
          <p className="text-xs text-slate-500">Live stream of incoming and outgoing messages</p>
        </div>
        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
          {messages.length} messages
        </span>
      </div>

      {messages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-12 text-center text-slate-400">
          <Inbox className="w-10 h-10 mb-2 stroke-1 text-slate-300" />
          <p className="text-sm font-semibold text-slate-700">No messages yet</p>
          <p className="text-xs text-slate-400">Messages will appear here in real time as they arrive.</p>
        </div>
      ) : (
        <div className="space-y-3 overflow-y-auto max-h-[380px] pr-1">
          {messages.map((msg) => {
            const isOut = msg.direction === 'outgoing';
            const isLid = msg.identifier_type === 'lid';

            return (
              <div
                key={msg.id}
                onClick={() => onSelectMessage && onSelectMessage(msg.conversation_id)}
                className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 hover:border-slate-300 hover:bg-slate-100/70 transition cursor-pointer flex items-start gap-3"
              >
                {/* Direction indicator */}
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                    isOut
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'bg-teal-50 text-teal-600'
                  }`}
                >
                  {isOut ? <Send className="w-4 h-4" /> : <Inbox className="w-4 h-4" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="text-xs font-bold text-slate-900 truncate">
                        {msg.display_name || msg.recipient_identifier}
                      </span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider ${
                          isLid
                            ? 'bg-sky-50 text-sky-700 border border-sky-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {isLid ? 'LID' : 'Phone'}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {formatTime(msg.timestamp)}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 truncate">{msg.body}</p>

                  <div className="flex items-center justify-between mt-1 text-[11px] text-slate-400 font-mono">
                    <span className="truncate">{msg.raw_identifier || msg.recipient_identifier}</span>
                    {isOut && getStatusIcon(msg.status)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
