import React from 'react';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { useAuth } from '../../context/AuthContext';
import { StatusBadge } from './StatusBadge';
import {
  MessageSquare,
  LayoutDashboard,
  Send,
  Users,
  QrCode,
  Power,
  LogOut,
  User as UserIcon,
  Layers,
  Hash,
  Calendar,
  FileText
} from 'lucide-react';

export type AppTab = 'dashboard' | 'conversations' | 'sender' | 'bulk' | 'scheduler' | 'templates' | 'extractor' | 'contacts';

interface NavbarProps {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab }) => {
  const { status, isConnected, setIsQrModalOpen, disconnectWhatsApp } = useWhatsApp();
  const { user, logout } = useAuth();

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'sender', label: 'Direct Sender', icon: Send },
    { id: 'bulk', label: 'Bulk LID', icon: Hash },
    { id: 'scheduler', label: 'Scheduler', icon: Calendar },
    { id: 'templates', label: 'Templates', icon: FileText },
    { id: 'extractor', label: 'Extractor', icon: Layers },
    { id: 'contacts', label: 'Contacts', icon: Users },
    { id: 'conversations', label: 'Chats', icon: MessageSquare },
  ] as const;

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-emerald-600/20">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-slate-900 tracking-tight">WhatsApp Messenger</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Phone + LID
                </span>
              </div>
              <p className="text-[11px] text-slate-500">Localhost + Real WhatsApp Connection</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Status & Actions */}
          <div className="flex items-center gap-3">
            {/* Live WhatsApp Status button */}
            <button
              type="button"
              onClick={() => setIsQrModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 transition"
              title="Click to view connection & QR details"
            >
              <StatusBadge status={status} />
              <QrCode className="w-3.5 h-3.5 text-slate-500" />
            </button>

            {/* Disconnect button when connected */}
            {isConnected && (
              <button
                type="button"
                onClick={() => disconnectWhatsApp()}
                className="p-2 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 transition"
                title="Disconnect WhatsApp Session"
              >
                <Power className="w-4 h-4" />
              </button>
            )}

            {/* User profile / Logout */}
            <div className="flex items-center gap-2 pl-3 border-l border-slate-200">
              <div className="hidden lg:flex flex-col text-right">
                <span className="text-xs font-semibold text-slate-900">{user?.name || 'Admin'}</span>
                <span className="text-[10px] text-slate-500">{user?.role || 'admin'}</span>
              </div>
              <button
                type="button"
                onClick={logout}
                className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition"
                title="Logout from dashboard"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Nav Tabs */}
        <div className="md:hidden flex items-center justify-around py-2 border-t border-slate-200">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center gap-1 py-1 px-3 text-xs font-medium transition ${
                  isActive ? 'text-emerald-600 font-semibold' : 'text-slate-500'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};

