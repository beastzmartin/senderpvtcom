import React, { useEffect, useState, useCallback } from 'react';
import { Conversation, Message } from '../../types';
import { api } from '../../services/api';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { ConversationList } from './ConversationList';
import { ChatWindow } from './ChatWindow';
import { MessageSquare, Plus } from 'lucide-react';

interface ConversationsViewProps {
  initialConversationId?: string | null;
  onNavigateToSender?: () => void;
}

export const ConversationsView: React.FC<ConversationsViewProps> = ({
  initialConversationId,
  onNavigateToSender
}) => {
  const { socket } = useWhatsApp();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState<boolean>(false);
  const [isClearing, setIsClearing] = useState<boolean>(false);

  // Fetch list of conversations
  const fetchConversations = useCallback(async () => {
    try {
      const res = await api.conversations.list();
      setConversations(res.data);

      if (initialConversationId) {
        const target = res.data.find((c) => c.id === initialConversationId);
        if (target) {
          setActiveConversation(target);
        }
      } else if (!activeConversation && res.data.length > 0) {
        setActiveConversation(res.data[0]);
      }
    } catch (err) {
      console.error('[Conversations] Failed to fetch conversations:', err);
    }
  }, [initialConversationId]);

  // Fetch messages for active conversation
  const fetchMessages = useCallback(async (conversationId: string) => {
    setLoadingMessages(true);
    try {
      const res = await api.conversations.getMessages(conversationId);
      setMessages(res.messages);
    } catch (err) {
      console.error('[Conversations] Failed to load messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (activeConversation) {
      fetchMessages(activeConversation.id);
    } else {
      setMessages([]);
    }
  }, [activeConversation, fetchMessages]);

  // Listen to Socket.IO events for live messaging updates
  useEffect(() => {
    if (!socket) return;

    const handleMessageReceived = (msg: any) => {
      fetchConversations();
      if (activeConversation && msg.from) {
        // If message belongs to active chat, refresh or append
        fetchMessages(activeConversation.id);
      }
    };

    const handleMessageSent = (msg: Message) => {
      fetchConversations();
      if (activeConversation && msg.conversation_id === activeConversation.id) {
        setMessages((prev) => {
          const exists = prev.some((m) => m.id === msg.id);
          if (exists) {
            return prev.map((m) => (m.id === msg.id ? msg : m));
          }
          return [...prev, msg];
        });
      }
    };

    const handleStatusUpdate = (update: { providerMessageId: string; status: any }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.provider_message_id === update.providerMessageId
            ? { ...m, status: update.status }
            : m
        )
      );
    };

    socket.on('message:received', handleMessageReceived);
    socket.on('message:sent', handleMessageSent);
    socket.on('message:status', handleStatusUpdate);

    return () => {
      socket.off('message:received', handleMessageReceived);
      socket.off('message:sent', handleMessageSent);
      socket.off('message:status', handleStatusUpdate);
    };
  }, [socket, activeConversation, fetchConversations, fetchMessages]);

  const handleSendMessage = async (text: string) => {
    if (!activeConversation) return;

    const res = await api.messages.send(
      activeConversation.raw_identifier,
      text,
      activeConversation.identifier_type
    );

    // Append to messages list
    setMessages((prev) => [...prev, res.data]);
    fetchConversations();
  };

  const handleDeleteConversation = async (id: string) => {
    if (!window.confirm('Delete this chat from website storage? (Your phone WhatsApp messages will NOT be deleted).')) {
      return;
    }
    try {
      await api.conversations.delete(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversation?.id === id) {
        setActiveConversation(null);
        setMessages([]);
      }
    } catch (err) {
      console.error('[Conversations] Failed to delete chat:', err);
    }
  };

  const handleClearAllConversations = async () => {
    if (
      !window.confirm(
        'Clear ALL live chats & message history from the website panel to free storage?\n\nNote: This ONLY removes data from the website database. Your WhatsApp mobile app chats remain 100% safe and untouched.'
      )
    ) {
      return;
    }
    setIsClearing(true);
    try {
      await api.conversations.deleteAll();
      setConversations([]);
      setActiveConversation(null);
      setMessages([]);
    } catch (err) {
      console.error('[Conversations] Failed to clear all chats:', err);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="h-[calc(100vh-6.5rem)] rounded-2xl overflow-hidden border border-slate-200 shadow-sm flex bg-white">
      {/* Left Conversations Sidebar */}
      <div className="w-full sm:w-80 md:w-96 shrink-0 h-full">
        <ConversationList
          conversations={conversations}
          activeId={activeConversation?.id || null}
          onSelect={(conv) => setActiveConversation(conv)}
          onStartNewChat={() => {
            if (onNavigateToSender) onNavigateToSender();
          }}
          onDeleteConversation={handleDeleteConversation}
          onClearAllConversations={handleClearAllConversations}
          isClearing={isClearing}
        />
      </div>

      {/* Right Active Chat Pane */}
      <div className="flex-1 h-full hidden sm:block">
        {activeConversation ? (
          <ChatWindow
            conversation={activeConversation}
            messages={messages}
            loadingMessages={loadingMessages}
            onSendMessage={handleSendMessage}
            onRefreshMessages={() => {
              if (activeConversation) fetchMessages(activeConversation.id);
            }}
            onNavigateToSender={onNavigateToSender}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-slate-50 text-slate-400">
            <div className="w-16 h-16 rounded-3xl bg-white border border-slate-200 shadow-xs flex items-center justify-center mb-4">
              <MessageSquare className="w-8 h-8 text-emerald-600" />
            </div>
            <h3 className="text-base font-bold text-slate-800 mb-1">WhatsApp Real-Time Messenger</h3>
            <p className="text-xs text-slate-500 max-w-sm mb-5">
              Select an existing thread on the left, or compose a new message using Phone or WhatsApp LID.
            </p>
            {onNavigateToSender && (
              <button
                type="button"
                onClick={onNavigateToSender}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-2 shadow-xs"
              >
                <Plus className="w-4 h-4" />
                Start a New Chat
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

