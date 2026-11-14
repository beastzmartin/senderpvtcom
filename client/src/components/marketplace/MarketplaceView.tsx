import React, { useState, useEffect } from 'react';
import {
  Search,
  Sparkles,
  ShoppingBag,
  Filter,
  Layers,
  CheckCircle2,
  Lock,
  ArrowRight,
  Zap,
  Globe,
  Wallet,
  Plus,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Star,
  Download
} from 'lucide-react';
import { MarketplaceExtension, UserWallet } from '../../types';
import { api } from '../../services/api';
import { ExtensionDetailModal } from './ExtensionDetailModal';
import { WalletTopUpModal } from './WalletTopUpModal';

interface MarketplaceViewProps {
  onNavigateToMyExtensions?: () => void;
  onNavigateToWallet?: () => void;
  onNavigateToCRM?: () => void;
}

export const MarketplaceView: React.FC<MarketplaceViewProps> = ({
  onNavigateToMyExtensions,
  onNavigateToWallet,
  onNavigateToCRM
}) => {
  const [extensions, setExtensions] = useState<MarketplaceExtension[]>([]);
  const [wallet, setWallet] = useState<UserWallet | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [selectedExtension, setSelectedExtension] = useState<MarketplaceExtension | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);

  const categories = [
    { id: 'all', label: 'All Extensions' },
    { id: 'Google Maps', label: 'Google Maps' },
    { id: 'Lead Generation', label: 'Lead Generation' },
    { id: 'Business Intelligence', label: 'Business Intelligence' },
    { id: 'Website Research', label: 'Website Research' },
    { id: 'Email Discovery', label: 'Email Discovery' },
    { id: 'Marketing Automation', label: 'Marketing Automation' },
    { id: 'Sales Intelligence', label: 'Sales Intelligence' },
    { id: 'Data Extraction', label: 'Data Extraction' },
    { id: 'Productivity', label: 'Productivity' }
  ];

  const fetchData = async () => {
    try {
      setLoading(true);
      const [extList, walletData] = await Promise.all([
        api.marketplace.listExtensions(
          selectedCategory === 'all' ? undefined : selectedCategory,
          searchQuery || undefined
        ),
        api.wallet.get().catch(() => null)
      ]);
      setExtensions(extList || []);
      if (walletData) setWallet(walletData);
    } catch (err) {
      console.error('Failed to load marketplace data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedCategory]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchData();
  };

  const handleOpenDetail = (ext: MarketplaceExtension) => {
    setSelectedExtension(ext);
    setIsDetailModalOpen(true);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner: Marketplace Hero + Live Wallet Quick Bar */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden border border-slate-800">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Next-Gen Module-Wise Licensing Ecosystem</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Extensions & Lead Marketplace
            </h1>
            <p className="text-slate-300 text-sm leading-relaxed">
              Explore powerful browser extractors, deep enrichment modules, and automated prospectors.
              Activate individual modules dynamically with zero license keys using your centralized wallet balance.
            </p>
          </div>

          {/* Quick Wallet Card */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 sm:p-5 border border-white/15 shrink-0 w-full sm:w-auto min-w-[280px]">
            <div className="flex items-center justify-between text-xs text-indigo-200 mb-1">
              <span className="flex items-center gap-1.5 font-medium">
                <Wallet className="w-3.5 h-3.5" />
                Wallet Credits Balance
              </span>
              <button
                onClick={fetchData}
                className="hover:text-white transition-colors"
                title="Refresh Balance"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white">
              ₹{(wallet?.balance || 0).toFixed(2)}
            </div>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={() => setIsTopUpOpen(true)}
                className="flex-1 py-2 px-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold text-xs rounded-xl shadow transition-all flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Top-Up Balance</span>
              </button>
              {onNavigateToWallet && (
                <button
                  onClick={onNavigateToWallet}
                  className="py-2 px-3 bg-white/10 hover:bg-white/20 text-white font-medium text-xs rounded-xl transition-all"
                >
                  Ledger
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Quick Nav Pills */}
        <div className="flex items-center gap-3 mt-6 pt-5 border-t border-white/10 text-xs">
          <span className="text-slate-400 font-medium">Quick Views:</span>
          {onNavigateToMyExtensions && (
            <button
              onClick={onNavigateToMyExtensions}
              className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-white font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Layers className="w-3.5 h-3.5 text-indigo-300" />
              <span>My Active Extensions & Modules</span>
            </button>
          )}
          {onNavigateToCRM && (
            <button
              onClick={onNavigateToCRM}
              className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-white font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Globe className="w-3.5 h-3.5 text-emerald-300" />
              <span>Lead Intelligence CRM</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="relative w-full md:w-96">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search extensions, modules, or features..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-white rounded-xl border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </form>

        {/* Category Chips Scroll */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full pb-1 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                selectedCategory === cat.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Extension Catalog Grid */}
      {loading ? (
        <div className="py-20 text-center space-y-3">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-500 font-medium">Loading marketplace extensions...</p>
        </div>
      ) : extensions.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 space-y-3">
          <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-lg font-bold text-slate-700">No extensions found</h3>
          <p className="text-sm text-slate-500">Try adjusting your category filter or search terms.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {extensions.map((ext) => (
            <div
              key={ext.id}
              className="bg-white rounded-2xl border border-slate-200 hover:border-indigo-300 shadow-sm hover:shadow-lg transition-all flex flex-col overflow-hidden group"
            >
              {/* Card Header */}
              <div className="p-6 border-b border-slate-100 flex-1">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-3xl shadow-md border border-white/20 group-hover:scale-105 transition-transform">
                    {ext.icon || '🧩'}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
                      {ext.category}
                    </span>
                    {ext.is_activated ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        ACTIVATED
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1">
                        <Lock className="w-3 h-3 text-slate-400" />
                        AVAILABLE
                      </span>
                    )}
                  </div>
                </div>

                <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                  {ext.name}
                </h3>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                  {ext.short_description}
                </p>

                {/* Rating & Browsers */}
                <div className="flex items-center justify-between text-xs text-slate-400 mt-3 pt-3 border-t border-slate-100">
                  <div className="flex items-center gap-1 text-amber-500 font-semibold">
                    <Star className="w-3.5 h-3.5 fill-current" />
                    <span>{ext.rating || 4.9}</span>
                    <span className="text-slate-400 font-normal">({ext.reviews_count || 120})</span>
                  </div>
                  <div className="text-[11px] font-medium text-slate-500">
                    Manifest V3 • Chromium
                  </div>
                </div>

                {/* Module Count & Feature Highlights */}
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700 flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-indigo-500" />
                      Modules Included:
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 font-bold text-xs">
                      {ext.modules?.length || 0} Modules
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {(ext.features || []).slice(0, 3).map((f, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 bg-slate-50 text-slate-600 border border-slate-200 rounded-md text-[10px] font-medium"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Card Footer */}
              <div className="p-4 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                    Base Access
                  </span>
                  <span className="text-sm font-bold text-slate-800">
                    {ext.activation_fee > 0 ? `₹${ext.activation_fee.toFixed(2)}` : 'Free Base'}
                  </span>
                </div>

                <button
                  onClick={() => handleOpenDetail(ext)}
                  className="py-2 px-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5"
                >
                  <span>Explore Modules</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Extension Detail Modal */}
      <ExtensionDetailModal
        extension={selectedExtension}
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedExtension(null);
        }}
        walletBalance={wallet?.balance || 0}
        onRefreshData={fetchData}
        onOpenTopUp={() => setIsTopUpOpen(true)}
      />

      {/* Wallet Top-Up Modal */}
      <WalletTopUpModal
        isOpen={isTopUpOpen}
        onClose={() => setIsTopUpOpen(false)}
        currentBalance={wallet?.balance || 0}
        onSuccess={(newBal) => {
          setWallet((prev) => (prev ? { ...prev, balance: newBal } : null));
          fetchData();
        }}
      />
    </div>
  );
};
