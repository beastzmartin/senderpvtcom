import React, { useState } from 'react';
import { Message } from '../../types';
import { Check, CheckCheck, Clock, AlertCircle, Copy, Check as CopiedCheck } from 'lucide-react';

interface MessageBubbleProps {
  message: Message;
  searchQuery?: string;
  isHighlighted?: boolean;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  searchQuery,
  isHighlighted = false
}) => {
  const [copied, setCopied] = useState(false);
  const isOut = message.direction === 'outgoing';

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(message.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderStatus = () => {
    switch (message.status) {
      case 'read':
        return (
          <span title="Read">
            <CheckCheck className="w-3.5 h-3.5 text-sky-200" />
          </span>
        );
      case 'delivered':
        return (
          <span title="Delivered">
            <CheckCheck className="w-3.5 h-3.5 text-emerald-100" />
          </span>
        );
      case 'sent':
        return (
          <span title="Sent by WhatsApp provider">
            <Check className="w-3.5 h-3.5 text-emerald-100" />
          </span>
        );
      case 'failed':
        return (
          <span title={message.error_message || 'Delivery failed'}>
            <AlertCircle className="w-3.5 h-3.5 text-rose-300" />
          </span>
        );
      case 'pending':
      default:
        return (
          <span title="Pending transmission">
            <Clock className="w-3 h-3 text-emerald-100/70" />
          </span>
        );
    }
  };

  // Highlight search term in text
  const renderHighlightedText = (text: string) => {
    if (!searchQuery || !searchQuery.trim()) {
      return renderLinks(text);
    }

    const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-amber-300 text-slate-900 rounded px-0.5 font-semibold">
          {part}
        </mark>
      ) : (
        renderLinks(part)
      )
    );
  };

  // Convert URLs into clickable anchors
  const renderLinks = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    return parts.map((part, i) => {
      if (part.match(urlRegex)) {
        return (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className={`underline hover:opacity-80 break-all font-medium ${
              isOut ? 'text-emerald-100' : 'text-sky-600'
            }`}
          >
            {part}
          </a>
        );
      }
      return part;
    });
  };

  return (
    <div
      className={`flex w-full ${isOut ? 'justify-end' : 'justify-start'} my-1 group transition-all duration-200 ${
        isHighlighted ? 'scale-[1.01]' : ''
      }`}
    >
      <div
        className={`relative max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-2 text-sm shadow-xs transition-all ${
          isHighlighted ? 'ring-2 ring-amber-400' : ''
        } ${
          isOut
            ? 'bg-emerald-600 text-white rounded-tr-none'
            : 'bg-white text-slate-800 rounded-tl-none border border-slate-200/90 shadow-xs'
        }`}
      >
        {/* Identifier Badge if LID */}
        {message.identifier_type === 'lid' && (
          <div
            className={`text-[10px] font-mono mb-0.5 font-medium ${
              isOut ? 'text-emerald-100/80' : 'text-sky-600'
            }`}
          >
            LID: {message.recipient_identifier}
          </div>
        )}

        {/* Message body */}
        <p className="whitespace-pre-wrap break-words leading-relaxed text-[13.5px]">
          {renderHighlightedText(message.body)}
        </p>

        {/* Error message caption if failed */}
        {message.status === 'failed' && message.error_message && (
          <div className="mt-1 text-[11px] text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
            Error: {message.error_message}
          </div>
        )}

        {/* Footer timestamp & ticks + Copy button */}
        <div
          className={`flex items-center justify-end gap-1.5 mt-1 text-[10px] select-none ${
            isOut ? 'text-emerald-100/80' : 'text-slate-400'
          }`}
        >
          {/* Quick copy on hover */}
          <button
            type="button"
            onClick={handleCopy}
            className={`opacity-0 group-hover:opacity-100 transition p-0.5 rounded hover:bg-black/10 ${
              copied ? 'text-emerald-200' : ''
            }`}
            title="Copy message"
          >
            {copied ? <CopiedCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          </button>

          <span>{formatTime(message.timestamp)}</span>
          {isOut && renderStatus()}
        </div>
      </div>
    </div>
  );
};
