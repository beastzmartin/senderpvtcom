import React, { useState } from 'react';
import { api } from '../../services/api';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { Send, Phone, Hash, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

interface QuickSenderProps {
  onMessageSent?: () => void;
}

export const QuickSender: React.FC<QuickSenderProps> = ({ onMessageSent }) => {
  const { isConnected, setIsQrModalOpen } = useWhatsApp();

  const [mode, setMode] = useState<'phone' | 'lid'>('phone');
  const [phoneCountry, setPhoneCountry] = useState('+91');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [lid, setLid] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);
  const [errorInfo, setErrorInfo] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessInfo(null);
    setErrorInfo(null);

    if (!isConnected) {
      setErrorInfo('WhatsApp is not connected. Please connect via QR code first.');
      setIsQrModalOpen(true);
      return;
    }

    if (!message.trim()) {
      setErrorInfo('Please enter a message to send.');
      return;
    }

    setLoading(true);

    try {
      if (mode === 'phone') {
        const fullPhone = `${phoneCountry}${phoneNumber.replace(/\D/g, '')}`;
        if (phoneNumber.replace(/\D/g, '').length < 7) {
          throw new Error('Please enter a valid phone number (at least 7 digits).');
        }

        const res = await api.messages.sendPhone(fullPhone, message.trim());
        setSuccessInfo(`Message dispatched to ${fullPhone}! Provider ID: ${res.data.provider_message_id || res.data.id}`);
        setPhoneNumber('');
        setMessage('');
      } else {
        let cleanLid = lid.trim();
        if (!cleanLid) {
          throw new Error('Please enter a WhatsApp LID (e.g. 7757465940199@lid).');
        }
        if (!cleanLid.endsWith('@lid') && /^\d+$/.test(cleanLid)) {
          cleanLid = `${cleanLid}@lid`;
        }

        const res = await api.messages.sendLid(cleanLid, message.trim());
        setSuccessInfo(`Message dispatched to WhatsApp LID ${cleanLid}! Provider ID: ${res.data.provider_message_id || res.data.id}`);
        setLid('');
        setMessage('');
      }

      if (onMessageSent) {
        onMessageSent();
      }
    } catch (err: any) {
      setErrorInfo(err.message || 'Failed to dispatch message via WhatsApp');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">Quick Message Sender</h3>
          <p className="text-xs text-slate-500">Directly dispatch to Phone Number or WhatsApp LID</p>
        </div>

        {/* Mode Selector */}
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            type="button"
            onClick={() => setMode('phone')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              mode === 'phone'
                ? 'bg-white text-emerald-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Phone className="w-3.5 h-3.5" />
            Phone
          </button>
          <button
            type="button"
            onClick={() => setMode('lid')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              mode === 'lid'
                ? 'bg-white text-sky-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Hash className="w-3.5 h-3.5" />
            WhatsApp LID
          </button>
        </div>
      </div>

      {/* Success banner */}
      {successInfo && (
        <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <span className="break-all font-medium">{successInfo}</span>
        </div>
      )}

      {/* Error banner */}
      {errorInfo && (
        <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span className="break-all font-medium">{errorInfo}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === 'phone' ? (
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Recipient Phone Number
            </label>
            <div className="flex gap-2">
              <select
                value={phoneCountry}
                onChange={(e) => setPhoneCountry(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-500 font-medium"
              >
                <option value="+91">India (+91)</option>
                <option value="+1">US/Canada (+1)</option>
                <option value="+44">UK (+44)</option>
                <option value="+971">UAE (+971)</option>
                <option value="+966">Saudi Arabia (+966)</option>
                <option value="+49">Germany (+49)</option>
                <option value="+61">Australia (+61)</option>
                <option value="+65">Singapore (+65)</option>
                <option value="+33">France (+33)</option>
                <option value="+81">Japan (+81)</option>
              </select>
              <input
                type="tel"
                placeholder="e.g. 9876543210"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                required
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:bg-white"
              />
            </div>
            {phoneNumber && (
              <p className="text-[11px] text-slate-500 mt-1">
                Normalized format: <code className="text-emerald-700 font-mono font-semibold">{phoneCountry}{phoneNumber.replace(/\D/g, '')}</code>
              </p>
            )}
          </div>
        ) : (
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
              <span>WhatsApp LID Identifier</span>
              <span className="text-[10px] text-sky-600 font-semibold">Auto-detects @lid suffix</span>
            </label>
            <input
              type="text"
              placeholder="e.g. 7757465940199@lid or 7757465940199"
              value={lid}
              onChange={(e) => setLid(e.target.value)}
              required
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:bg-white font-mono"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              WhatsApp Linked Identifier addresses route via native LID protocol.
            </p>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
            <span>Message Content</span>
            <span className="text-[10px] text-slate-400 font-mono">{message.length} characters</span>
          </label>
          <textarea
            rows={3}
            placeholder="Type your message here..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:bg-white resize-none shadow-2xs"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className={`w-full py-2.5 px-4 rounded-xl font-semibold text-xs text-white flex items-center justify-center gap-2 transition shadow-xs ${
            mode === 'phone'
              ? 'bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50'
              : 'bg-sky-600 hover:bg-sky-500 disabled:opacity-50'
          }`}
        >
          {loading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Dispatching through WhatsApp...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Send {mode === 'phone' ? 'to Phone' : 'to WhatsApp LID'}
            </>
          )}
        </button>
      </form>
    </div>
  );
};
