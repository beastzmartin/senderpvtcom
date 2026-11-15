import React, { useEffect, useRef, useState } from 'react';
import { Conversation, Message, MessageTemplate } from '../../types';
import { api } from '../../services/api';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { MessageBubble } from './MessageBubble';
import {
  Send,
  RefreshCw,
  Phone,
  Hash,
  Smile,
  AlertCircle,
  Search,
  X,
  Download,
  Info,
  FileText,
  Copy,
  Check,
  Sparkles,
  ChevronDown
} from 'lucide-react';

interface ChatWindowProps {
  conversation: Conversation;
  messages: Message[];
  loadingMessages: boolean;
  onSendMessage: (text: string) => Promise<void>;
  onRefreshMessages: () => void;
  onNavigateToSender?: (rawIdentifier: string) => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  conversation,
  messages,
  loadingMessages,
  onSendMessage,
  onRefreshMessages,
  onNavigateToSender
}) => {
  const { isConnected, setIsQrModalOpen, devices, activeSessionId, setDefaultDevice } = useWhatsApp();
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // In-chat Search State
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Contact Info Drawer State
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [contactNotes, setContactNotes] = useState(conversation.notes || '');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notesSuccess, setNotesSuccess] = useState(false);

  // Template Picker State
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [isTemplateMenuOpen, setIsTemplateMenuOpen] = useState(false);

  const [copiedIdentifier, setCopiedIdentifier] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isLid = conversation.identifier_type === 'lid';

  // Load templates on mount
  useEffect(() => {
    api.templates
      .list()
      .then((res) => setTemplates(res.data || []))
      .catch(() => {});
  }, []);

  // Update notes if conversation changes
  useEffect(() => {
    setContactNotes(conversation.notes || '');
    setSearchQuery('');
    setIsSearchOpen(false);
  }, [conversation]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current && !searchQuery) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, searchQuery]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isSending) return;

    setSendError(null);

    if (!isConnected) {
      setSendError('WhatsApp is disconnected. Please connect your account first.');
      setIsQrModalOpen(true);
      return;
    }

    const text = inputText.trim();
    setIsSending(true);

    try {
      await onSendMessage(text);
      setInputText('');
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    } catch (err: any) {
      setSendError(err.message || 'Failed to dispatch message via WhatsApp');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const addEmoji = (emoji: string) => {
    setInputText((prev) => prev + emoji);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const insertTemplate = (content: string) => {
    // Interpolate known vars
    const interpolated = content
      .replace(/\{name\}/gi, conversation.display_name || 'there')
      .replace(/\{phone\}/gi, conversation.identifier_type === 'phone' ? conversation.raw_identifier : '')
      .replace(/\{lid\}/gi, conversation.identifier_type === 'lid' ? conversation.raw_identifier : '');

    setInputText(interpolated);
    setIsTemplateMenuOpen(false);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleExportChat = () => {
    if (messages.length === 0) return;
    const header = `WhatsApp Chat Transcript with ${conversation.display_name || conversation.raw_identifier}\nExported at: ${new Date().toLocaleString()}\n------------------------------------------------------------\n\n`;
    const lines = messages
      .map((m) => {
        const time = new Date(m.timestamp).toLocaleString();
        const sender = m.direction === 'outgoing' ? 'Me' : conversation.display_name || conversation.raw_identifier;
        return `[${time}] ${sender}: ${m.body}`;
      })
      .join('\n\n');

    const blob = new Blob([header + lines], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat_${conversation.raw_identifier.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyIdentifier = () => {
    navigator.clipboard.writeText(conversation.raw_identifier);
    setCopiedIdentifier(true);
    setTimeout(() => setCopiedIdentifier(false), 2000);
  };

  // Filter messages if in-chat search query exists
  const matchedMessages = searchQuery.trim()
    ? messages.filter((m) => m.body.toLowerCase().includes(searchQuery.toLowerCase().trim()))
    : messages;

  return (
    <div className="flex h-full bg-slate-50 relative overflow-hidden">
      {/* Main Chat Pane */}
      <div className="flex flex-col flex-1 h-full min-w-0">
        {/* Chat Header */}
        <div className="px-5 py-3 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 shadow-xs z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-xs ${
                isLid
                  ? 'bg-gradient-to-tr from-sky-600 to-indigo-600'
                  : 'bg-gradient-to-tr from-emerald-600 to-teal-600'
              }`}
            >
              {conversation.display_name
                ? conversation.display_name.slice(0, 2).toUpperCase()
                : isLid
                ? '#'
                : '+'}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-slate-900 text-sm truncate">
                  {conversation.display_name || conversation.raw_identifier}
                </h4>
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
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
                <span className="truncate">{conversation.raw_identifier}</span>
                <button
                  type="button"
                  onClick={handleCopyIdentifier}
                  className="hover:text-slate-800 transition"
                  title="Copy identifier"
                >
                  {copiedIdentifier ? (
                    <Check className="w-3 h-3 text-emerald-600" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Header Action Tools */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIsSearchOpen(!isSearchOpen)}
              className={`p-2 rounded-xl transition ${
                isSearchOpen
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
              title="Search in this chat"
            >
              <Search className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleExportChat}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
              title="Export chat as text file"
            >
              <Download className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onRefreshMessages}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
              title="Refresh conversation thread"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setIsInfoOpen(!isInfoOpen)}
              className={`p-2 rounded-xl transition ${
                isInfoOpen
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
              title="Toggle Contact Profile"
            >
              <Info className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Animated In-Chat Search Bar */}
        {isSearchOpen && (
          <div className="px-4 py-2 bg-amber-50/80 border-b border-amber-200/80 flex items-center justify-between gap-3 text-xs shrink-0 animate-in slide-in-from-top-2 duration-150">
            <div className="flex items-center gap-2 flex-1">
              <Search className="w-4 h-4 text-amber-700 shrink-0" />
              <input
                type="text"
                autoFocus
                placeholder="Search messages in this thread..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-amber-200 rounded-lg px-3 py-1 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-400 shadow-2xs"
              />
            </div>
            {searchQuery && (
              <span className="text-[11px] font-semibold text-amber-800 shrink-0">
                {matchedMessages.length} match(es)
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setIsSearchOpen(false);
              }}
              className="p-1 text-amber-700 hover:text-amber-900 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Messages Thread Body */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2 bg-slate-100/70 [background-image:radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:20px_20px]"
        >
          {loadingMessages ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin text-emerald-600 mb-2" />
              <span className="text-xs font-medium">Loading message history...</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-slate-400">
              <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-center mb-3">
                {isLid ? (
                  <Hash className="w-7 h-7 text-sky-600" />
                ) : (
                  <Phone className="w-7 h-7 text-emerald-600" />
                )}
              </div>
              <p className="text-sm font-bold text-slate-800">No messages in this chat yet</p>
              <p className="text-xs text-slate-500 max-w-xs mt-1">
                Type a message below or select a saved template to start chatting.
              </p>
            </div>
          ) : matchedMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-slate-400">
              <Search className="w-8 h-8 text-slate-300 mb-2" />
              <p className="text-xs font-semibold text-slate-700">
                No messages matched "{searchQuery}"
              </p>
            </div>
          ) : (
            matchedMessages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                searchQuery={searchQuery}
                isHighlighted={Boolean(
                  searchQuery.trim() && msg.body.toLowerCase().includes(searchQuery.toLowerCase().trim())
                )}
              />
            ))
          )}
        </div>

        {/* Error alert if send failed */}
        {sendError && (
          <div className="px-4 py-2 bg-rose-50 border-t border-rose-200 text-rose-700 text-xs flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="flex-1 font-medium">{sendError}</span>
            <button
              type="button"
              onClick={() => setSendError(null)}
              className="text-rose-700 hover:text-rose-900 text-xs font-bold underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Quick Canned Responses & Quick Emoji bar */}
        <div className="px-4 py-2 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {devices.length > 1 && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] mr-1 shrink-0">
                <span className="text-emerald-700 font-semibold">Via:</span>
                <select
                  value={activeSessionId}
                  onChange={(e) => setDefaultDevice(e.target.value)}
                  className="bg-transparent font-bold text-emerald-900 text-[11px] focus:outline-none cursor-pointer"
                >
                  {devices.map((d) => (
                    <option key={d.session_id} value={d.session_id}>
                      {d.alias} {d.phone_number ? `(${d.phone_number})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <span className="text-[11px] font-bold text-slate-400 mr-1">Quick:</span>
            {[
              '👋 Hello!',
              '✅ Received, thank you!',
              '📞 Will call you shortly.',
              '🙏 Have a great day!'
            ].map((quick) => (
              <button
                key={quick}
                type="button"
                onClick={() => setInputText(quick)}
                className="px-2.5 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium transition"
              >
                {quick}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 text-sm">
            {['👋', '👍', '✅', '🙏', '🔥', '🚀', '❤️'].map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => addEmoji(emoji)}
                className="hover:scale-125 transition transform"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {/* Chat Message Input Composer */}
        <div className="p-3 sm:p-4 bg-white border-t border-slate-200 shrink-0">
          <form onSubmit={handleSend} className="flex items-end gap-2 relative">
            {/* Template Library Inserter Popover Button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsTemplateMenuOpen(!isTemplateMenuOpen)}
                className="h-[42px] px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center gap-1.5 transition shrink-0"
                title="Insert saved template"
              >
                <FileText className="w-4 h-4 text-purple-600" />
                <span className="hidden sm:inline">Templates</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {isTemplateMenuOpen && (
                <div className="absolute bottom-12 left-0 w-72 max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-xl p-2 z-30 space-y-1">
                  <div className="flex items-center justify-between px-2 py-1 border-b border-slate-100">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Select Template
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsTemplateMenuOpen(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {templates.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">
                      No templates saved yet. Create one in the Template Library.
                    </div>
                  ) : (
                    templates.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => insertTemplate(tpl.content)}
                        className="w-full text-left p-2 rounded-xl hover:bg-slate-100 transition group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-900 group-hover:text-emerald-700">
                            {tpl.name}
                          </span>
                          <span className="text-[9px] px-1 rounded bg-slate-100 text-slate-500 uppercase">
                            {tpl.category}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          {tpl.content}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Input Textarea */}
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${conversation.display_name || conversation.raw_identifier}... (Enter to send)`}
              className="flex-1 max-h-32 min-h-[42px] px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:bg-white resize-none leading-relaxed transition shadow-inner"
            />

            {/* Send Button */}
            <button
              type="submit"
              disabled={isSending || !inputText.trim()}
              className="h-[42px] px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white font-semibold transition shadow-md shadow-emerald-950/20 flex items-center justify-center gap-1.5 shrink-0"
            >
              {isSending ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span className="hidden sm:inline text-xs">Send</span>
            </button>
          </form>
        </div>
      </div>

      {/* Collapsible Contact Profile Drawer (Right-side) */}
      {isInfoOpen && (
        <div className="w-72 sm:w-80 h-full bg-white border-l border-slate-200 flex flex-col shrink-0 animate-in slide-in-from-right duration-200 shadow-lg z-20">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <h4 className="font-bold text-slate-900 text-sm">Contact Profile</h4>
            <button
              type="button"
              onClick={() => setIsInfoOpen(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 flex-1 overflow-y-auto space-y-5">
            {/* Avatar & Display Name */}
            <div className="flex flex-col items-center text-center">
              <div
                className={`w-16 h-16 rounded-3xl flex items-center justify-center text-white font-bold text-xl shadow-md mb-2.5 ${
                  isLid
                    ? 'bg-gradient-to-tr from-sky-600 to-indigo-600'
                    : 'bg-gradient-to-tr from-emerald-600 to-teal-600'
                }`}
              >
                {conversation.display_name
                  ? conversation.display_name.slice(0, 2).toUpperCase()
                  : isLid
                  ? '#'
                  : '+'}
              </div>
              <h4 className="font-bold text-slate-900 text-base">
                {conversation.display_name || 'Unnamed Recipient'}
              </h4>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider mt-1 ${
                  isLid
                    ? 'bg-sky-50 text-sky-700 border border-sky-200'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}
              >
                {isLid ? 'WhatsApp LID Account' : 'Phone Account'}
              </span>
            </div>

            {/* Identifier Details */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Identifier:</span>
                <span className="font-mono text-slate-800 break-all font-semibold">
                  {conversation.raw_identifier}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Messages:</span>
                <span className="font-bold text-slate-800 font-mono">{messages.length}</span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Last Active:</span>
                <span className="text-slate-600">
                  {conversation.last_message_at
                    ? new Date(conversation.last_message_at).toLocaleString()
                    : '—'}
                </span>
              </div>
            </div>

            {/* Notes Section */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                Internal Notes for Contact
              </label>
              <textarea
                rows={3}
                value={contactNotes}
                onChange={(e) => setContactNotes(e.target.value)}
                placeholder="Add private CRM notes about this contact..."
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:bg-white resize-none"
              />
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  disabled={isSavingNotes}
                  onClick={async () => {
                    setIsSavingNotes(true);
                    setNotesSuccess(false);
                    try {
                      if (conversation.contact_id) {
                        await api.contacts.update(conversation.contact_id, { notes: contactNotes });
                      }
                      setNotesSuccess(true);
                      setTimeout(() => setNotesSuccess(false), 2000);
                    } catch {
                      // ignore
                    } finally {
                      setIsSavingNotes(false);
                    }
                  }}
                  className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold"
                >
                  {isSavingNotes ? 'Saving...' : 'Save Note'}
                </button>
                {notesSuccess && (
                  <span className="text-[11px] text-emerald-600 font-semibold">Saved!</span>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="pt-2 border-t border-slate-200 space-y-2">
              <button
                type="button"
                onClick={handleCopyIdentifier}
                className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy {isLid ? 'LID' : 'Phone'}
              </button>

              <button
                type="button"
                onClick={handleExportChat}
                className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
              >
                <Download className="w-3.5 h-3.5" />
                Export Chat (.txt)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
