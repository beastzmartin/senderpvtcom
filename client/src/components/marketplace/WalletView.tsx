import React, { useState, useEffect } from 'react';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Sparkles,
  CreditCard,
  Plus,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  ShieldCheck,
  Download,
  Layers,
  ChevronRight
} from 'lucide-react';
import { api } from '../../services/api';
import { UserWallet, WalletTransaction } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { WalletTopUpModal } from './WalletTopUpModal';

interface WalletViewProps {
  onNavigateToMarketplace?: () => void;
  onNavigateToMyExtensions?: () => void;
}

export const WalletView: React.FC<WalletViewProps> = ({
  onNavigateToMarketplace,
  onNavigateToMyExtensions
}) => {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<UserWallet | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);

  // Admin adjustment state
  const [adminUserId, setAdminUserId] = useState<string>('');
  const [adminAmount, setAdminAmount] = useState<string>('');
  const [adminReason, setAdminReason] = useState<string>('');
  const [adminMsg, setAdminMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [walletData, txList] = await Promise.all([
        api.wallet.get(),
        api.wallet.transactions(100)
      ]);
      setWallet(walletData);
      setTransactions(txList || []);
    } catch (err) {
      console.error('Failed to load wallet data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAdminAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminUserId.trim() || !adminAmount || isNaN(Number(adminAmount))) {
      setAdminMsg({ type: 'error', text: 'Valid Target User ID and Amount are required.' });
      return;
    }
    if (!adminReason.trim()) {
      setAdminMsg({ type: 'error', text: 'Audit reason is required for manual balance adjustments.' });
      return;
    }

    try {
      setAdminLoading(true);
      setAdminMsg(null);
      await api.wallet.adminAdjust(adminUserId.trim(), Number(adminAmount), adminReason.trim());
      setAdminMsg({
        type: 'success',
        text: `Successfully adjusted balance for user ${adminUserId} by ₹${adminAmount}!`
      });
      setAdminAmount('');
      setAdminReason('');
      fetchData();
    } catch (err: any) {
      setAdminMsg({ type: 'error', text: err.message || 'Admin adjustment failed.' });
    } finally {
      setAdminLoading(false);
    }
  };

  const filteredTransactions = transactions.filter((tx) => {
    const matchesType = filterType === 'all' || tx.transaction_type === filterType;
    const matchesSearch =
      !searchQuery ||
      tx.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.reference_id?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Hero Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Main Balance Card */}
        <div className="md:col-span-2 bg-gradient-to-r from-emerald-600 via-teal-700 to-cyan-800 rounded-2xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden border border-emerald-500/30 flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-white text-xs font-semibold backdrop-blur-sm">
                <Wallet className="w-3.5 h-3.5" />
                <span>Primary Account Wallet</span>
              </span>
              <button
                onClick={fetchData}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                title="Refresh Ledger"
              >
                <RefreshCw className="w-4 h-4 text-white" />
              </button>
            </div>

            <div className="text-xs text-emerald-100 uppercase tracking-wider font-semibold">
              Available Credits Balance
            </div>
            <div className="text-4xl sm:text-5xl font-black text-white mt-1">
              ₹{(wallet?.balance || 0).toFixed(2)}
            </div>
            <div className="text-xs text-emerald-100 mt-2">
              Automated deduction for lead syncing, verified searches & module activations.
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-white/20 flex flex-wrap items-center gap-3 relative z-10">
            <button
              onClick={() => setIsTopUpOpen(true)}
              className="py-2.5 px-5 bg-white text-emerald-800 font-bold text-xs rounded-xl shadow-lg hover:bg-emerald-50 transition-all flex items-center gap-2"
            >
              <Plus className="w-4 h-4 text-emerald-700" />
              <span>Instant Top-Up</span>
            </button>
            {onNavigateToMarketplace && (
              <button
                onClick={onNavigateToMarketplace}
                className="py-2.5 px-4 bg-white/15 hover:bg-white/25 text-white font-semibold text-xs rounded-xl transition-all flex items-center gap-1.5"
              >
                <span>Browse Extensions</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
            {onNavigateToMyExtensions && (
              <button
                onClick={onNavigateToMyExtensions}
                className="py-2.5 px-4 bg-white/15 hover:bg-white/25 text-white font-semibold text-xs rounded-xl transition-all flex items-center gap-1.5"
              >
                <span>Active Modules</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Financial Overview Cards */}
        <div className="space-y-4 flex flex-col justify-between">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <ArrowDownLeft className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Total Deposited
              </span>
              <div className="text-xl font-bold text-slate-900 mt-0.5">
                ₹{(wallet?.total_topped_up || 0).toFixed(2)}
              </div>
              <div className="text-[11px] text-slate-500">Includes welcome promo credits</div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <ArrowUpRight className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Total Consumed
              </span>
              <div className="text-xl font-bold text-slate-900 mt-0.5">
                ₹{(wallet?.total_spent || 0).toFixed(2)}
              </div>
              <div className="text-[11px] text-slate-500">Module activations & lead extractions</div>
            </div>
          </div>
        </div>
      </div>

      {/* Admin Quick Adjuster */}
      {user?.role === 'admin' && (
        <div className="bg-white p-6 rounded-2xl border border-indigo-100 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-800">
              Admin Manual Wallet Ledger Adjustment
            </h3>
          </div>
          <p className="text-xs text-slate-500">
            Administrators can manually credit or debit any user's wallet with an audited ledger note.
          </p>

          {adminMsg && (
            <div
              className={`p-3 rounded-xl text-xs font-semibold ${
                adminMsg.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}
            >
              {adminMsg.text}
            </div>
          )}

          <form onSubmit={handleAdminAdjust} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input
              type="text"
              placeholder="Target User ID (e.g. user_...)"
              value={adminUserId}
              onChange={(e) => setAdminUserId(e.target.value)}
              className="px-3.5 py-2 text-xs bg-slate-50 rounded-xl border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="number"
              step="0.01"
              placeholder="Amount (e.g. 500 or -100)"
              value={adminAmount}
              onChange={(e) => setAdminAmount(e.target.value)}
              className="px-3.5 py-2 text-xs bg-slate-50 rounded-xl border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="text"
              placeholder="Audit Reason / Note"
              value={adminReason}
              onChange={(e) => setAdminReason(e.target.value)}
              className="px-3.5 py-2 text-xs bg-slate-50 rounded-xl border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={adminLoading}
              className="py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow transition-all flex items-center justify-center gap-1.5"
            >
              {adminLoading ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <span>Post Adjustment</span>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Transactions Ledger Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Ledger Header & Filters */}
        <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-800">Financial Ledger & Audit Trail</h3>
            <p className="text-xs text-slate-500">
              Immutable ledger of all wallet top-ups, per-record usage deductions, and module activations.
            </p>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            {/* Search */}
            <div className="relative flex-1 md:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search transactions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 rounded-xl border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Filter */}
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="py-1.5 px-3 text-xs bg-slate-50 rounded-xl border border-slate-200 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Types</option>
              <option value="usage_deduction">Usage Deductions</option>
              <option value="module_activation">Module Activations</option>
              <option value="extension_activation">Extension Activations</option>
              <option value="wallet_topup">Top-Ups</option>
              <option value="promotional_credit">Promo Credits</option>
              <option value="admin_adjustment">Admin Adjustments</option>
            </select>
          </div>
        </div>

        {/* Table Body */}
        {loading ? (
          <div className="py-16 text-center space-y-2">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-500">Loading ledger...</p>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <Clock className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">No transactions recorded yet</p>
            <p className="text-xs text-slate-500">
              Your activity and usage records will appear here in real time.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-100 font-semibold">
                <tr>
                  <th className="py-3 px-5">Date & Time</th>
                  <th className="py-3 px-5">Type</th>
                  <th className="py-3 px-5">Description</th>
                  <th className="py-3 px-5 text-right">Amount</th>
                  <th className="py-3 px-5 text-right">Balance After</th>
                  <th className="py-3 px-5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredTransactions.map((tx) => {
                  const isCredit =
                    tx.transaction_type === 'wallet_topup' ||
                    tx.transaction_type === 'promotional_credit' ||
                    tx.transaction_type === 'usage_refund' ||
                    (tx.transaction_type === 'admin_adjustment' && tx.amount > 0);

                  return (
                    <tr key={tx.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-5 text-slate-500 whitespace-nowrap">
                        {new Date(tx.created_at).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>

                      <td className="py-3 px-5 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            isCredit
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-indigo-100 text-indigo-800'
                          }`}
                        >
                          {tx.transaction_type.replace('_', ' ')}
                        </span>
                      </td>

                      <td className="py-3 px-5 text-slate-800 max-w-xs truncate">
                        <div>{tx.description}</div>
                        {tx.reference_id && (
                          <div className="text-[10px] text-slate-400 font-mono">
                            Ref: {tx.reference_id}
                          </div>
                        )}
                      </td>

                      <td
                        className={`py-3 px-5 text-right font-bold whitespace-nowrap ${
                          isCredit ? 'text-emerald-600' : 'text-slate-800'
                        }`}
                      >
                        {isCredit ? `+₹${Math.abs(tx.amount).toFixed(2)}` : `-₹${Math.abs(tx.amount).toFixed(2)}`}
                      </td>

                      <td className="py-3 px-5 text-right font-semibold text-slate-700 whitespace-nowrap">
                        ₹{tx.new_balance.toFixed(2)}
                      </td>

                      <td className="py-3 px-5 text-center whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 uppercase">
                          {tx.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Top-Up Modal */}
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

