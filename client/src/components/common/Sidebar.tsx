import React, { useState } from 'react';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { useAuth } from '../../context/AuthContext';
import { useContact } from '../../context/ContactContext';
import { StatusBadge } from './StatusBadge';
import { ChangePasswordModal } from '../auth/ChangePasswordModal';
import {
  MessageSquare,
  LayoutDashboard,
  Send,
  Users,
  QrCode,
  Power,
  LogOut,
  Layers,
  Hash,
  Calendar,
  FileText,
  Menu,
  X,
  ChevronDown,
  Check,
  Smartphone,
  Plus,
  ArrowRightLeft,
  CreditCard,
  Key,
  Sparkles,
  ArrowRight,
  Phone,
  ExternalLink,
  Edit2,
  MessageCircle,
  ShieldCheck,
  UserPlus
} from 'lucide-react';

export type AppTab =
  | 'dashboard'
  | 'conversations'
  | 'sender'
  | 'bulk'
  | 'scheduler'
  | 'templates'
  | 'extractor'
  | 'joiner'
  | 'contacts'
  | 'subscription'
  | 'admin';

interface SidebarProps {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const {
    status,
    isConnected,
    setIsQrModalOpen,
    disconnectWhatsApp,
    accountInfo,
    devices,
    activeDevice,
    activeSessionId,
    setDefaultDevice,
    setIsDeviceManagerOpen
  } = useWhatsApp();
  const { user, logout } = useAuth();
  const { phone, openWhatsApp } = useContact();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isSwitchingOpen, setIsSwitchingOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  const connectedDevicesCount = devices.filter((d) => d.status === 'connected').length;

  // Grouped Navigation Items
  const navSections = [
    {
      title: 'OVERVIEW',
      items: [
        { id: 'dashboard' as AppTab, label: 'Dashboard', icon: LayoutDashboard },
        { id: 'conversations' as AppTab, label: 'Chat Messenger', icon: MessageSquare, badge: 'Live' }
      ]
    },
    {
      title: 'MESSAGING & DISPATCH',
      items: [
        { id: 'sender' as AppTab, label: 'Direct Sender', icon: Send },
        { id: 'bulk' as AppTab, label: 'Bulk LID Sender', icon: Hash, badge: 'Anti-Ban' },
        { id: 'scheduler' as AppTab, label: 'Broadcast Scheduler', icon: Calendar, badge: 'Drip' },
        { id: 'templates' as AppTab, label: 'Template Library', icon: FileText }
      ]
    },
    {
      title: 'AUDIENCE & EXTRACTOR',
      items: [
        { id: 'extractor' as AppTab, label: 'Group Extractor', icon: Layers },
        { id: 'joiner' as AppTab, label: 'Group & Community Joiner', icon: UserPlus, badge: 'Auto' },
        { id: 'contacts' as AppTab, label: 'Contacts Directory', icon: Users }
      ]
    },
    {
      title: user?.role === 'reseller' ? 'RESELLER PORTAL' : 'LICENSE & ACCESS',
      items: [
        {
          id: 'subscription' as AppTab,
          label: user?.role === 'reseller' ? 'Reseller Panel' : 'License System',
          icon: Key,
          badge: user?.role === 'reseller' ? 'RESELLER' : (user?.role === 'admin' ? 'ADMIN' : (user?.plan_tier ? user.plan_tier.toUpperCase() : 'LICENSE'))
        }
      ]
    },
    ...(user?.role === 'admin'
      ? [
          {
            title: 'SUPER ADMIN',
            items: [
              {
                id: 'admin' as AppTab,
                label: 'Admin Control Center',
                icon: ShieldCheck,
                badge: 'MASTER'
              }
            ]
          }
        ]
      : [])
  ];

  const handleTabClick = (tabId: AppTab) => {
    setActiveTab(tabId);
    setIsMobileOpen(false);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 select-none">
      {/* Brand & Logo Header */}
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-emerald-500 flex items-center justify-center text-white shadow-md shadow-emerald-950/10 shrink-0">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm text-slate-900 tracking-tight">WhatsApp Pro</span>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                v2.0
              </span>
            </div>
            <p className="text-[10px] text-slate-500 font-medium">Multi-Device Phone + LID</p>
          </div>
        </div>

        {/* Mobile close button */}
        <button
          type="button"
          onClick={() => setIsMobileOpen(false)}
          className="md:hidden p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Multi-Device Account Switcher Card */}
      <div className="p-3 m-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5 relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
              WhatsApp Account
            </span>
            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
              {connectedDevicesCount} / {devices.length} Online
            </span>
          </div>
          <StatusBadge status={status} />
        </div>

        {/* Current Active Account summary & 1-Click Switch Button */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsSwitchingOpen(!isSwitchingOpen)}
            className="w-full text-left bg-white hover:bg-slate-50 rounded-xl p-2.5 border border-slate-200 text-xs space-y-1 shadow-2xs transition group"
            title="Click to switch WhatsApp account"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    activeDevice?.status === 'connected' ? 'bg-emerald-500' : 'bg-slate-300'
                  }`}
                />
                <span className="font-bold text-slate-900 truncate max-w-[110px]">
                  {activeDevice?.alias || 'Primary Device'}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                  Switch
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                    isSwitchingOpen ? 'rotate-180' : ''
                  }`}
                />
              </div>
            </div>
            <div className="text-[11px] font-mono text-emerald-700 truncate">
              {activeDevice?.phone_number || <span className="text-slate-400 italic">Not connected</span>}
            </div>
          </button>

          {/* Account Switcher Dropdown Popover */}
          {isSwitchingOpen && (
            <>
              {/* Invisible backdrop to dismiss when clicking outside */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsSwitchingOpen(false)}
              />

              <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 z-50 space-y-1 animate-in fade-in zoom-in-95">
                <div className="flex items-center justify-between px-2 py-1 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <span>Switch Account</span>
                  <span className="text-emerald-700 font-semibold">{devices.length} Total</span>
                </div>

                <div className="max-h-52 overflow-y-auto space-y-1 py-1">
                  {devices.map((dev) => {
                    const isCurrent = dev.session_id === activeSessionId;
                    return (
                      <button
                        key={dev.session_id}
                        type="button"
                        onClick={async () => {
                          if (!isCurrent) {
                            await setDefaultDevice(dev.session_id);
                          }
                          setIsSwitchingOpen(false);
                        }}
                        className={`w-full text-left p-2 rounded-xl text-xs transition flex items-center justify-between gap-2 ${
                          isCurrent
                            ? 'bg-emerald-50 text-emerald-900 font-bold border border-emerald-200/80 shadow-2xs'
                            : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                dev.status === 'connected' ? 'bg-emerald-500' : 'bg-slate-300'
                              }`}
                            />
                            <span className="font-semibold text-slate-900 truncate">
                              {dev.alias}
                            </span>
                            {dev.is_default && (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-amber-50 text-amber-700 font-mono">
                                Default
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] font-mono text-slate-500 truncate pl-3.5">
                            {dev.phone_number || (
                              <span className="italic text-slate-400">Offline ({dev.status})</span>
                            )}
                          </div>
                        </div>

                        {isCurrent ? (
                          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <ArrowRightLeft className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="pt-1 border-t border-slate-100 flex items-center justify-between gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSwitchingOpen(false);
                      setIsDeviceManagerOpen(true);
                    }}
                    className="flex-1 py-1.5 px-2 rounded-lg hover:bg-slate-100 text-[11px] font-semibold text-slate-700 text-center transition flex items-center justify-center gap-1"
                  >
                    <Layers className="w-3 h-3 text-slate-500" />
                    Manage All
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSwitchingOpen(false);
                      setIsQrModalOpen(true);
                    }}
                    className="flex-1 py-1.5 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-[11px] font-semibold text-white text-center transition shadow-2xs flex items-center justify-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    New Account
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 pt-1 border-t border-slate-200">
          <button
            type="button"
            onClick={() => setIsDeviceManagerOpen(true)}
            className="flex-1 py-1.5 px-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-[11px] font-semibold text-slate-700 flex items-center justify-center gap-1.5 transition shadow-2xs"
            title="Open Multi-Device Manager"
          >
            <Layers className="w-3.5 h-3.5 text-emerald-600" />
            Manage Devices
          </button>

          <button
            type="button"
            onClick={() => setIsQrModalOpen(true)}
            className="p-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-sky-600 transition shadow-2xs"
            title="Scan QR Code"
          >
            <QrCode className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Nav Menu Items */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-5">
        {navSections.map((sec) => (
          <div key={sec.title} className="space-y-1">
            <span className="px-2.5 text-[10px] font-bold text-slate-400 tracking-wider uppercase">
              {sec.title}
            </span>
            <div className="space-y-0.5 mt-1">
              {sec.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleTabClick(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition group ${
                      isActive
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon
                        className={`w-4 h-4 transition ${
                          isActive
                            ? 'text-emerald-600'
                            : 'text-slate-400 group-hover:text-slate-600'
                        }`}
                      />
                      <span>{item.label}</span>
                    </div>

                    {item.badge && (
                      <span
                        className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider ${
                          item.badge === 'Anti-Ban'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : item.badge === 'Drip'
                            ? 'bg-purple-50 text-purple-700 border border-purple-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Trial Account Callout */}
      {(user?.plan_tier === 'trial' || user?.subscription_status === 'trialing') && (
        <div
          onClick={() => handleTabClick('subscription')}
          className="m-3 p-3 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-200 rounded-2xl cursor-pointer hover:bg-amber-50 transition"
        >
          <div className="flex items-center justify-between text-xs font-bold text-amber-900">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              Trial Account
            </span>
            <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-extrabold">
              {user?.days_remaining !== null && user?.days_remaining !== undefined ? `${user.days_remaining}d Left` : 'Active'}
            </span>
          </div>
          <p className="text-[11px] text-amber-800/80 mt-1">
            Unlock multi-devices, higher broadcast & extraction limits.
          </p>
          <div className="mt-2 text-[10px] font-extrabold text-amber-700 flex items-center gap-1">
            Upgrade License <ArrowRight className="w-3 h-3" />
          </div>
        </div>
      )}

      {/* WhatsApp Support & Direct Contact Widget */}
      <div className="mx-3 my-2 p-3 bg-gradient-to-br from-emerald-50 via-teal-50/40 to-slate-50 border border-emerald-200/90 rounded-2xl shadow-2xs">
        <div className="flex items-center gap-1.5 mb-1.5">
          <div className="w-5 h-5 rounded-md bg-emerald-600 flex items-center justify-center text-white shrink-0">
            <MessageCircle className="w-3 h-3" />
          </div>
          <span className="text-[11px] font-bold text-emerald-950 uppercase tracking-wider">
            WhatsApp Support
          </span>
        </div>

        <a
          href={`https://wa.me/${phone.replace(/[^0-9]/g, '')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-bold text-slate-800 hover:text-emerald-700 font-mono flex items-center gap-1 transition"
          title="Click to chat on WhatsApp"
        >
          <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
          <span>{phone}</span>
        </a>

        <button
          type="button"
          onClick={() => openWhatsApp('Hello! I am reaching out for support with WhatsApp Sender.')}
          className="w-full mt-2 py-1.5 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition flex items-center justify-center gap-1.5 shadow-xs shadow-emerald-700/10 cursor-pointer"
        >
          <span>Chat on WhatsApp</span>
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>

      {/* Footer Profile & Logout Area */}
      <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
        <div
          onClick={() => handleTabClick('subscription')}
          className="flex items-center gap-2.5 min-w-0 cursor-pointer hover:opacity-80 transition group"
          title="Click to view subscription & account details"
        >
          <div className={`w-8 h-8 rounded-xl border flex items-center justify-center font-bold text-xs shrink-0 transition ${
            user?.plan_tier === 'trial'
              ? 'bg-amber-100 border-amber-300 text-amber-700 group-hover:bg-amber-200'
              : 'bg-purple-100 border-purple-200 text-purple-700 group-hover:bg-purple-200'
          }`}>
            {user?.name ? user.name[0].toUpperCase() : 'A'}
          </div>
          <div className="min-w-0">
            <span className="text-xs font-semibold text-slate-800 block truncate">
              {user?.name || 'Administrator'}
            </span>
            <div className="flex items-center gap-1 mt-0.5">
              <span className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase border ${
                user?.plan_tier === 'trial'
                  ? 'bg-amber-50 text-amber-700 border-amber-300'
                  : 'bg-purple-50 text-purple-700 border-purple-200'
              }`}>
                {user?.plan_tier === 'trial' ? 'FREE TRIAL' : (user?.plan_tier ? user.plan_tier : 'STARTER')}
              </span>
              {user?.company_name && (
                <span className="text-[10px] text-slate-400 truncate max-w-[80px]">
                  {user.company_name}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setIsChangePasswordOpen(true)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition"
            title="Change Account Password"
          >
            <Key className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={logout}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar (Fixed Left) */}
      <aside className="hidden md:block w-64 h-screen sticky top-0 shrink-0 z-30 shadow-xs">
        {sidebarContent}
      </aside>

      {/* Mobile Top Header with Hamburger */}
      <div className="md:hidden sticky top-0 z-40 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsMobileOpen(true)}
            className="p-1.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center text-white">
              <MessageSquare className="w-4 h-4" />
            </div>
            <span className="font-bold text-sm text-slate-900 capitalize">{activeTab}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => openWhatsApp('Hello! I need support with WhatsApp Sender.')}
            className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 transition shadow-2xs"
            title={`WhatsApp Support: ${phone}`}
          >
            <MessageCircle className="w-4 h-4 text-emerald-600" />
          </button>

          <button
            type="button"
            onClick={() => setIsDeviceManagerOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-xs font-semibold text-emerald-800 transition shadow-2xs"
            title="Switch WhatsApp Account"
          >
            <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
            <span className="max-w-[100px] truncate">{activeDevice?.alias || 'Accounts'}</span>
            <ChevronDown className="w-3 h-3 text-emerald-600" />
          </button>
        </div>
      </div>

      {/* Mobile Drawer Overlay */}
      {isMobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
            onClick={() => setIsMobileOpen(false)}
          />
          <div className="relative w-72 max-w-[80vw] h-full z-10 shadow-2xl">
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Change Password Dialog */}
      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />
    </>
  );
};
