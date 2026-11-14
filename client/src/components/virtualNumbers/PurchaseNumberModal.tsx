import React, { useState } from 'react';
import { VirtualNumberItem } from '../../types';
import { api } from '../../services/api';
import {
  X,
  Phone,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Wallet,
  Clock,
  Sparkles,
  ArrowRight,
  RefreshCw,
  MessageSquare,
  PhoneCall
} from 'lucide-react';

interface PurchaseNumberModalProps {
  numberItem: VirtualNumberItem | null;
  walletBalance: number;
  onClose: () => void;
  onSuccess: (result: any) => void;
  onTopUpWallet: () => void;
}

export const PurchaseNumberModal: React.FC<PurchaseNumberModalProps> = ({
  numberItem,
  walletBalance,
  onClose,
  onSuccess,
  onTopUpWallet
}) => {
  const [duration, setDuration] = useState<'daily' | 'weekly' | 'monthly' | 'annual'>('monthly');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!numberItem) return null;

  // Calculate pricing based on duration
  const baseMonthly = numberItem.pricing.monthlyPrice || 110.0;
  const activationFee = numberItem.pricing.activationFee || 20.0;

  let rentalPrice = baseMonthly;
  let durationLabel = '30 Days';

  if (duration === 'daily') {
    rentalPrice = Number((baseMonthly / 7).toFixed(2));
    durationLabel = '24 Hours';
  } else if (duration === 'weekly') {
    rentalPrice = Number((baseMonthly / 2.5).toFixed(2));
    durationLabel = '7 Days';
  } else if (duration === 'annual') {
    rentalPrice = Number((baseMonthly * 10).toFixed(2));
    durationLabel = '365 Days (2 Months Free)';
  }

  const totalFirstCharge = Number((activationFee + rentalPrice).toFixed(2));
  const hasSufficientBalance = walletBalance >= totalFirstCharge;
  const remainingAfter = Number((walletBalance - totalFirstCharge).toFixed(2));

  const handlePurchase = async () => {
    if (!hasSufficientBalance) {
      setError('Insufficient wallet balance. Please top up your wallet first.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await api.virtualNumbers.purchaseNumber({
        inventoryId: numberItem.id,
        rentalDuration: duration,
        idempotencyKey: `buy_${numberItem.id}_${Date.now()}`
      });

      if (res && res.success) {
        onSuccess(res);
      } else {
        setError(res?.message || 'Failed to allocate virtual number.');
      }
    } catch (err: any) {
      setError(err.message || 'Purchase transaction failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-3">
            <span className="text-3xl select-none">{numberItem.flagEmoji || '🌐'}</span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 text-base">Purchase Virtual Number</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-100 text-emerald-800">
                  {numberItem.numberType}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                {numberItem.countryName} ({numberItem.countryCode}) • Instant Allocation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Virtual Number Showcase */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50 via-teal-50/40 to-slate-50 border border-emerald-200/80 flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider">
                Assigned Number
              </span>
              <div className="text-xl font-bold font-mono text-slate-900 mt-0.5 tracking-tight flex items-center gap-2">
                <Phone className="w-5 h-5 text-emerald-600" />
                {numberItem.phoneNumber}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Capabilities</span>
              <div className="flex items-center gap-1">
                {numberItem.capabilities.includes('sms') && (
                  <span className="p-1 rounded bg-white border border-slate-200 text-sky-600 shadow-2xs" title="SMS Enabled">
                    <MessageSquare className="w-3.5 h-3.5" />
                  </span>
                )}
                {numberItem.capabilities.includes('voice') && (
                  <span className="p-1 rounded bg-white border border-slate-200 text-emerald-600 shadow-2xs" title="Voice Enabled">
                    <PhoneCall className="w-3.5 h-3.5" />
                  </span>
                )}
                {numberItem.whatsappCompatible && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-600 text-white shadow-2xs">
                    WhatsApp
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Rental Duration Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Select Rental Duration
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setDuration('weekly')}
                className={`p-3 rounded-xl border text-left transition ${
                  duration === 'weekly'
                    ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="text-xs font-bold text-slate-900">7 Days</div>
                <div className="text-sm font-extrabold text-emerald-700 mt-0.5">₹{(baseMonthly / 2.5).toFixed(0)}</div>
                <div className="text-[10px] text-slate-500">Weekly plan</div>
              </button>

              <button
                type="button"
                onClick={() => setDuration('monthly')}
                className={`p-3 rounded-xl border text-left transition relative ${
                  duration === 'monthly'
                    ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <span className="absolute -top-2 right-2 bg-emerald-600 text-white text-[9px] font-extrabold px-1.5 py-0.2 rounded-full uppercase">
                  Popular
                </span>
                <div className="text-xs font-bold text-slate-900">30 Days</div>
                <div className="text-sm font-extrabold text-emerald-700 mt-0.5">₹{baseMonthly.toFixed(0)}</div>
                <div className="text-[10px] text-slate-500">Monthly plan</div>
              </button>

              <button
                type="button"
                onClick={() => setDuration('annual')}
                className={`p-3 rounded-xl border text-left transition relative ${
                  duration === 'annual'
                    ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <span className="absolute -top-2 right-2 bg-amber-500 text-white text-[9px] font-extrabold px-1.5 py-0.2 rounded-full uppercase">
                  Save 17%
                </span>
                <div className="text-xs font-bold text-slate-900">1 Year</div>
                <div className="text-sm font-extrabold text-emerald-700 mt-0.5">₹{(baseMonthly * 10).toFixed(0)}</div>
                <div className="text-[10px] text-slate-500">365 Days</div>
              </button>
            </div>
          </div>

          {/* Pricing Breakdown Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between text-slate-600">
              <span>One-Time Number Activation Fee:</span>
              <span className="font-semibold text-slate-900 font-mono">₹{activationFee.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span>Rental Charge ({durationLabel}):</span>
              <span className="font-semibold text-slate-900 font-mono">₹{rentalPrice.toFixed(2)}</span>
            </div>
            <div className="border-t border-slate-200 pt-2 flex items-center justify-between font-bold text-slate-900 text-sm">
              <span>Total Amount to Pay:</span>
              <span className="font-extrabold text-emerald-700 font-mono text-base">₹{totalFirstCharge.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
              <span>Automatic Renewal Rate:</span>
              <span className="font-mono">₹{numberItem.pricing.renewalPrice.toFixed(2)} / month</span>
            </div>
          </div>

          {/* Wallet Balance Status */}
          <div
            className={`p-3.5 rounded-2xl border flex items-center justify-between ${
              hasSufficientBalance
                ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
                : 'bg-amber-50 border-amber-200 text-amber-950'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  hasSufficientBalance ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'
                }`}
              >
                <Wallet className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                  Platform Wallet Balance
                </span>
                <span className="text-sm font-extrabold font-mono">
                  ₹{walletBalance.toFixed(2)}
                </span>
              </div>
            </div>

            {hasSufficientBalance ? (
              <div className="text-right">
                <span className="text-[11px] text-slate-500 block">Balance after:</span>
                <span className="font-bold text-emerald-700 font-mono text-xs">
                  ₹{remainingAfter.toFixed(2)}
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={onTopUpWallet}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1 shadow-sm"
              >
                <span>Top Up ₹{(totalFirstCharge - walletBalance).toFixed(0)}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Terms Notice */}
          <p className="text-[11px] text-slate-400 leading-relaxed">
            By confirming purchase, ₹{totalFirstCharge.toFixed(2)} will be deducted from your central SaaS wallet. Your virtual number will be allocated immediately and appear in <strong>My Numbers</strong>.
          </p>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-xl transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePurchase}
            disabled={!hasSufficientBalance || isSubmitting}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-950/10 transition flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Allocating Number...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Confirm & Pay ₹{totalFirstCharge.toFixed(2)}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
