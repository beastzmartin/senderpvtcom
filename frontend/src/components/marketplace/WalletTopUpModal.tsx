import React, { useState } from 'react';
import { X, CreditCard, Sparkles, CheckCircle2, AlertCircle, ArrowUpRight } from 'lucide-react';
import { api } from '../../services/api';

interface WalletTopUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newBalance: number) => void;
  currentBalance?: number;
}

export const WalletTopUpModal: React.FC<WalletTopUpModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  currentBalance = 0
}) => {
  const [amount, setAmount] = useState<number>(250);
  const [customAmount, setCustomAmount] = useState<string>('250');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const quickAmounts = [100, 250, 500, 1000, 2500];

  const handleSelectQuick = (val: number) => {
    setAmount(val);
    setCustomAmount(String(val));
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    setCustomAmount(val);
    setAmount(Number(val) || 0);
  };

  const handleTopUp = async () => {
    if (amount <= 0) {
      setError('Please enter a valid top-up amount greater than ₹0.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await api.wallet.topUp(
        amount,
        `Instant Wallet Recharge (+₹${amount})`,
        `TXN_${Date.now()}`
      );
      setSuccessMsg(`Successfully credited ₹${amount.toFixed(2)} to your wallet!`);
      setTimeout(() => {
        onSuccess(res.newBalance);
        onClose();
        setSuccessMsg(null);
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Failed to complete wallet recharge.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-100">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 p-6 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
              <CreditCard className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Top-Up Wallet Credits</h2>
              <p className="text-emerald-100 text-sm">Add instant balance for module activations & lead sync</p>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-white/15 flex items-center justify-between text-xs text-emerald-100">
            <span>Current Available Balance:</span>
            <span className="text-sm font-semibold text-white">₹{currentBalance.toFixed(2)}</span>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Select Quick Amount
            </label>
            <div className="grid grid-cols-5 gap-2">
              {quickAmounts.map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleSelectQuick(val)}
                  className={`py-2 px-1 text-sm font-semibold rounded-lg border transition-all ${
                    amount === val
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-500/20'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  ₹{val}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Custom Amount (₹ INR)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-semibold text-lg">
                ₹
              </span>
              <input
                type="text"
                value={customAmount}
                onChange={handleCustomChange}
                placeholder="Enter amount"
                className="w-full pl-8 pr-4 py-3 rounded-xl border border-slate-200 text-lg font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-xs text-slate-600 space-y-1.5">
            <div className="flex justify-between">
              <span>Recharge Amount:</span>
              <span className="font-semibold text-slate-800">₹{amount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Platform Fee:</span>
              <span className="font-semibold text-emerald-600">₹0.00 (Free)</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-slate-200 font-bold text-slate-800">
              <span>Estimated New Balance:</span>
              <span className="text-emerald-700">₹{(currentBalance + amount).toFixed(2)}</span>
            </div>
          </div>

          <button
            onClick={handleTopUp}
            disabled={loading || amount <= 0}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold rounded-xl shadow-lg shadow-emerald-600/20 hover:shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Recharge ₹{amount.toFixed(2)} Instantly</span>
                <ArrowUpRight className="w-4 h-4 ml-auto" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

