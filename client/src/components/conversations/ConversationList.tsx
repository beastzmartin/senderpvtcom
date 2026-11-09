import React, { useState, useEffect } from 'react';
import { Conversation } from '../../types';
import { Search, MessageSquare, Phone, Hash, Plus, Pin, X } from 'lucide-react';

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (conversation: Conversation) => void;
  onStartNewChat: () => void;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  activeId,
  onSelect,
  onStartNewChat
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'phone' | 'lid' | 'unread' | 'pinned'>('all');
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('whatsapp_pinned_conversations');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const togglePin = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setPinnedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
      try {
        localStorage.setItem('whatsapp_pinned_conversations', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const filteredConversations = conversations
    .filter((c) => {
      // Search match
      const term = searchTerm.toLowerCase().trim();
      if (term) {
        const nameMatch = (c.display_name || '').toLowerCase().includes(term);
        const idMatch = c.raw_identifier.toLowerCase().includes(term);
        const lastMsgMatch = (c.last_message_text || '').toLowerCase().includes(term);
        if (!(nameMatch || idMatch || lastMsgMatch)) {
          return false;
        }
      }

      // Filter match
      if (filter === 'phone') return c.identifier_type === 'phone';
      if (filter === 'lid') return c.identifier_type === 'lid';
      if (filter === 'unread') return c.unread_count > 0;
      if (filter === 'pinned') return pinnedIds.includes(c.id);
      return true;
    })
    .sort((a, b) => {
      // Pinned chats appear on top
      const aPinned = pinnedIds.includes(a.id);
      const bPinned = pinnedIds.includes(b.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;

      // Then by last message time
      const timeA = new Date(a.last_message_at || a.created_at).getTime();
      const timeB = new Date(b.last_message_at || b.created_at).getTime();
      return timeB - timeA;
    });

  const formatLastTime = (isoString?: string | null) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();

      if (isToday) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  return (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      {/* Top Header */}
      <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white">
        <div>
          <h3 className="font-bold text-slate-900 text-base">Conversations</h3>
          <p className="text-[11px] text-slate-500 font-medium">
            {conversations.length} total active threads
          </p>
        </div>
        <button
          type="button"
          onClick={onStartNewChat}
          className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-sm flex items-center gap-1 text-xs font-semibold"
          title="Start New Chat"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">New</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="px-3.5 py-2.5 border-b border-slate-200/80 bg-slate-50/60">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search chats, LIDs, or messages..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 shadow-xs"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex gap-1.5 mt-2 overflow-x-auto pb-0.5">
          {[
            { id: 'all', label: 'All' },
            { id: 'unread', label: 'Unread' },
            { id: 'pinned', label: 'Pinned', icon: Pin },
            { id: 'phone', label: 'Phone', icon: Phone },
            { id: 'lid', label: 'LID', icon: Hash }
          ].map((item) => {
            const Icon = item.icon;
            const isSel = filter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id as any)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition whitespace-nowrap ${
                  isSel
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {Icon && <Icon className="w-3 h-3" />}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Conversation Items List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 bg-white">
        {filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400">
            <MessageSquare className="w-8 h-8 mb-2 stroke-1 text-slate-300" />
            <p className="text-xs font-medium text-slate-600">No conversations found</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Try changing filters or search terms</p>
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const isActive = activeId === conv.id;
            const isLid = conv.identifier_type === 'lid';
            const isPinned = pinnedIds.includes(conv.id);

            return (
              <div
                key={conv.id}
                onClick={() => onSelect(conv)}
                className={`p-3.5 flex items-start gap-3 cursor-pointer transition select-none group relative ${
                  isActive
                    ? 'bg-emerald-50/80 border-l-4 border-emerald-600'
                    : 'hover:bg-slate-50'
                }`}
              >
                {/* Contact Avatar */}
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0 font-bold text-sm shadow-xs ${
                    isLid
                      ? 'bg-gradient-to-tr from-sky-600 to-indigo-600'
                      : 'bg-gradient-to-tr from-emerald-600 to-teal-600'
                  }`}
                >
                  {conv.display_name
                    ? conv.display_name.slice(0, 2).toUpperCase()
                    : isLid
                    ? '#'
                    : '+'}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className={`text-xs font-semibold truncate ${isActive ? 'text-emerald-950 font-bold' : 'text-slate-900'}`}>
                        {conv.display_name || conv.raw_identifier}
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

                    <div className="flex items-center gap-1 shrink-0">
                      {isPinned && <Pin className="w-3 h-3 text-amber-500 fill-amber-500" />}
                      <span className="text-[10px] text-slate-400">
                        {formatLastTime(conv.last_message_at || conv.created_at)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-xs truncate ${conv.unread_count > 0 ? 'text-slate-900 font-semibold' : 'text-slate-500'}`}>
                      {conv.last_message_text || 'No messages yet'}
                    </p>

                    <div className="flex items-center gap-1 shrink-0">
                      {/* Pin button on hover */}
                      <button
                        type="button"
                        onClick={(e) => togglePin(e, conv.id)}
                        className={`opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-400 hover:text-slate-700 transition ${
                          isPinned ? 'opacity-100 text-amber-500' : ''
                        }`}
                        title={isPinned ? 'Unpin chat' : 'Pin chat to top'}
                      >
                        <Pin className="w-3.5 h-3.5" />
                      </button>

                      {conv.unread_count > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full bg-emerald-600 text-white font-bold text-[10px]">
                          {conv.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
