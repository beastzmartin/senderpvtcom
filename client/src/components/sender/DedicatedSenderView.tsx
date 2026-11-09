import React, { useState } from 'react';
import { api } from '../../services/api';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { Message } from '../../types';
import {
  Phone,
  Hash,
  Send,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  MessageSquare,
  ShieldCheck,
  Info,
  Smartphone,
  Layers
} from 'lucide-react';

interface DedicatedSenderViewProps {
  onNavigateToConversation?: (conversationId: string) => void;
}

const COUNTRY_CODES = [
  { code: '+91', country: 'India', flag: '🇮🇳' },
  { code: '+1', country: 'USA / Canada', flag: '🇺🇸' },
  { code: '+44', country: 'United Kingdom', flag: '🇬🇧' },
  { code: '+971', country: 'United Arab Emirates', flag: '🇦🇪' },
  { code: '+966', country: 'Saudi Arabia', flag: '🇸🇦' },
  { code: '+49', country: 'Germany', flag: '🇩🇪' },
  { code: '+61', country: 'Australia', flag: '🇦🇺' },
  { code: '+65', country: 'Singapore', flag: '🇸🇬' },
  { code: '+33', country: 'France', flag: '🇫🇷' },
  { code: '+81', country: 'Japan', flag: '🇯🇵' },
  { code: '+55', country: 'Brazil', flag: '🇧🇷' },
  { code: '+27', country: 'South Africa', flag: '🇿🇦' },
  { code: '+60', country: 'Malaysia', flag: '🇲🇾' },
  { code: '+92', country: 'Pakistan', flag: '🇵🇰' },
  { code: '+880', country: 'Bangladesh', flag: '🇧🇩' },
];

export const DedicatedSenderView: React.FC<DedicatedSenderViewProps> = ({
  onNavigateToConversation
}) => {
  const { isConnected, setIsQrModalOpen, devices, activeSessionId, setIsDeviceManagerOpen } = useWhatsApp();

  const [selectedSessionId, setSelectedSessionId] = useState<string>(activeSessionId);
  const [activeTab, setActiveTab] = useState<'phone' | 'lid'>('phone');

  // Phone Form State
  const [countryCode, setCountryCode] = useState('+91');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneMessage, setPhoneMessage] = useState('Hello! This is a test message from WhatsApp Messenger.');
  const [checkingNumber, setCheckingNumber] = useState(false);
  const [numberCheckResult, setNumberCheckResult] = useState<{ exists?: boolean; error?: string } | null>(null);

  // LID Form State
  const [lid, setLid] = useState('7757465940199@lid');
  const [lidMessage, setLidMessage] = useState('Hello from WhatsApp LID sender! Validating direct LID dispatch.');

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successResult, setSuccessResult] = useState<{
    message: string;
    record: Message;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const cleanPhoneDigits = phoneNumber.replace(/\D/g, '');
  const normalizedFullPhone = cleanPhoneDigits ? `${countryCode}${cleanPhoneDigits}` : '';

  // Validate on WhatsApp
  const handleCheckOnWhatsApp = async () => {
    if (!cleanPhoneDigits || cleanPhoneDigits.length < 7) {
      setNumberCheckResult({ error: 'Please enter at least 7 digits to check.' });
      return;
    }

    if (!isConnected) {
      setNumberCheckResult({ error: 'WhatsApp must be connected to check availability.' });
      setIsQrModalOpen(true);
      return;
    }

    setCheckingNumber(true);
    setNumberCheckResult(null);

    try {
      const res = await api.whatsapp.checkNumber(normalizedFullPhone);
      setNumberCheckResult({ exists: res.exists });
    } catch (err: any) {
      setNumberCheckResult({ error: err.message || 'Check failed' });
    } finally {
      setCheckingNumber(false);
    }
  };

  // Submit Phone Message
  const handleSendPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessResult(null);
    setErrorMessage(null);

    if (!isConnected) {
      setErrorMessage('WhatsApp is not connected. Connect via QR code first.');
      setIsQrModalOpen(true);
      return;
    }

    if (cleanPhoneDigits.length < 7) {
      setErrorMessage('Please enter a valid phone number (at least 7 digits).');
      return;
    }

    if (!phoneMessage.trim()) {
      setErrorMessage('Message content cannot be empty.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await api.messages.sendPhone(normalizedFullPhone, phoneMessage.trim(), selectedSessionId);
      setSuccessResult({
        message: `Successfully sent message to phone number ${normalizedFullPhone}`,
        record: res.data
      });
      setPhoneNumber('');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to dispatch message to phone number.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit LID Message
  const handleSendLid = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessResult(null);
    setErrorMessage(null);

    if (!isConnected) {
      setErrorMessage('WhatsApp is not connected. Connect via QR code first.');
      setIsQrModalOpen(true);
      return;
    }

    let targetLid = lid.trim();
    if (!targetLid) {
      setErrorMessage('WhatsApp LID identifier is required.');
      return;
    }

    // Auto-detect & normalize @lid suffix without touching numeric portion
    if (!targetLid.endsWith('@lid') && /^\d+$/.test(targetLid)) {
      targetLid = `${targetLid}@lid`;
    }

    if (!targetLid.endsWith('@lid')) {
      setErrorMessage('Invalid LID format. Must be formatted as <digits>@lid (e.g. 7757465940199@lid).');
      return;
    }

    if (!lidMessage.trim()) {
      setErrorMessage('Message content cannot be empty.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await api.messages.sendLid(targetLid, lidMessage.trim(), selectedSessionId);
      setSuccessResult({
        message: `Successfully sent message to WhatsApp LID ${targetLid}`,
        record: res.data
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to dispatch message to WhatsApp LID.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Direct Message Dispatcher</h2>
        <p className="text-xs text-slate-500">
          Send validated messages via real WhatsApp connection to international phone numbers or WhatsApp LIDs.
        </p>
      </div>

      {/* Multi-Device Account Dispatcher Bar */}
      <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-200">
            <Smartphone className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-900 block">Dispatching Account:</span>
            <span className="text-[11px] text-slate-500">Pick which connected WhatsApp number dispatches this message</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedSessionId}
            onChange={(e) => setSelectedSessionId(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-emerald-500 shadow-2xs"
          >
            {devices.map((dev) => (
              <option key={dev.session_id} value={dev.session_id}>
                {dev.alias} ({dev.phone_number || dev.status}) {dev.is_default ? '⭐' : ''}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setIsDeviceManagerOpen(true)}
            className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition border border-slate-200 flex items-center gap-1 shrink-0"
            title="Manage WhatsApp accounts"
          >
            <Layers className="w-3.5 h-3.5 text-slate-600" />
            Accounts
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shadow-xs">
        <button
          type="button"
          onClick={() => {
            setActiveTab('phone');
            setSuccessResult(null);
            setErrorMessage(null);
          }}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition ${
            activeTab === 'phone'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white'
          }`}
        >
          <Phone className="w-4 h-4" />
          Send to Phone Number
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('lid');
            setSuccessResult(null);
            setErrorMessage(null);
          }}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition ${
            activeTab === 'lid'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white'
          }`}
        >
          <Hash className="w-4 h-4" />
          Send to WhatsApp LID (Privacy Address)
        </button>
      </div>

      {/* Feedback Banners */}
      {successResult && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm shadow-xs space-y-2">
          <div className="flex items-center gap-2 font-semibold text-emerald-700">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>{successResult.message}</span>
          </div>
          <div className="bg-white p-3 rounded-xl border border-emerald-200 text-xs font-mono space-y-1 text-slate-700 shadow-xs">
            <div>
              <span className="text-slate-500">Provider Message ID: </span>
              <span className="text-emerald-700 font-semibold">{successResult.record.provider_message_id || successResult.record.id}</span>
            </div>
            <div>
              <span className="text-slate-500">Recipient: </span>
              <span className="font-semibold text-slate-900">{successResult.record.recipient_identifier}</span>
            </div>
            <div>
              <span className="text-slate-500">Type: </span>
              <span className="uppercase text-sky-700 font-bold">{successResult.record.identifier_type}</span>
            </div>
            <div>
              <span className="text-slate-500">Status: </span>
              <span className="capitalize text-emerald-700 font-bold">{successResult.record.status}</span>
            </div>
          </div>
          {onNavigateToConversation && (
            <button
              type="button"
              onClick={() => onNavigateToConversation(successResult.record.conversation_id)}
              className="inline-flex items-center gap-1.5 text-xs text-emerald-700 hover:text-emerald-800 font-semibold underline pt-1"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Open conversation in chat view
            </button>
          )}
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm shadow-xs flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-semibold text-rose-800">Transmission Failed</h4>
            <p className="text-xs text-rose-700 mt-0.5">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Tab 1: Phone Number Form */}
      {activeTab === 'phone' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
          <form onSubmit={handleSendPhone} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
              {/* Country Code */}
              <div className="sm:col-span-5">
                <label className="block text-xs font-semibold text-slate-800 mb-2">
                  Country Code Selector
                </label>
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-500 shadow-xs"
                >
                  {COUNTRY_CODES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.country} ({c.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Phone Input */}
              <div className="sm:col-span-7">
                <label className="block text-xs font-semibold text-slate-800 mb-2 flex items-center justify-between">
                  <span>Phone Number</span>
                  <span className="text-[11px] text-slate-500 font-normal">Digits only, e.g. 9876543210</span>
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    placeholder="Enter phone number..."
                    value={phoneNumber}
                    onChange={(e) => {
                      setPhoneNumber(e.target.value);
                      setNumberCheckResult(null);
                    }}
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 font-mono shadow-xs"
                  />
                  {phoneNumber && (
                    <button
                      type="button"
                      onClick={handleCheckOnWhatsApp}
                      disabled={checkingNumber}
                      className="absolute right-2 top-2 px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 text-[11px] text-slate-700 border border-slate-200 flex items-center gap-1 transition shadow-xs"
                    >
                      {checkingNumber ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                      ) : (
                        <Search className="w-3.5 h-3.5 text-emerald-600" />
                      )}
                      Check WhatsApp
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Normalized Preview & Availability Feedback */}
            {normalizedFullPhone && (
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-600">International Normalized E.164:</span>
                  <code className="px-2 py-0.5 rounded bg-white border border-slate-200 font-mono text-emerald-700 font-bold shadow-xs">
                    {normalizedFullPhone}
                  </code>
                </div>

                {numberCheckResult && (
                  <div>
                    {numberCheckResult.exists === true && (
                      <span className="text-emerald-700 flex items-center gap-1 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Registered on WhatsApp
                      </span>
                    )}
                    {numberCheckResult.exists === false && (
                      <span className="text-amber-700 flex items-center gap-1 font-semibold">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600" /> Not registered or private
                      </span>
                    )}
                    {numberCheckResult.error && (
                      <span className="text-rose-600 text-[11px] font-medium">
                        {numberCheckResult.error}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Message Body */}
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-2 flex items-center justify-between">
                <span>Message Textarea</span>
                <span className="text-[11px] text-slate-500">{phoneMessage.length} characters</span>
              </label>
              <textarea
                rows={4}
                value={phoneMessage}
                onChange={(e) => setPhoneMessage(e.target.value)}
                placeholder="Type your WhatsApp message..."
                required
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 resize-none shadow-xs leading-relaxed"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-300 text-white font-semibold text-sm shadow-md flex items-center justify-center gap-2 transition"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Dispatching to Real WhatsApp Account...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send Message to Phone Number
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Tab 2: WhatsApp LID Form */}
      {activeTab === 'lid' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
          {/* LID Informational Banner */}
          <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 text-xs text-sky-900 flex items-start gap-3">
            <Info className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h5 className="font-semibold text-sky-950">About WhatsApp LID (Linked Identity)</h5>
              <p className="text-sky-900 leading-relaxed">
                A WhatsApp LID (e.g. <code className="bg-sky-100 px-1.5 py-0.5 rounded font-mono text-sky-900">7757465940199@lid</code>) is an internal cryptographic identifier used by WhatsApp Multi-Device to route messages directly to an account while keeping phone numbers private.
              </p>
              <p className="text-sky-800 text-[11px]">
                This application handles LID addressing natively through Baileys without stripping or modifying the identifier.
              </p>
            </div>
          </div>

          <form onSubmit={handleSendLid} className="space-y-6">
            {/* LID Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-2 flex items-center justify-between">
                <span>WhatsApp LID Identifier</span>
                <span className="text-[11px] text-sky-600 font-mono">Format: &lt;digits&gt;@lid</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="e.g. 7757465940199@lid or 7757465940199"
                  value={lid}
                  onChange={(e) => setLid(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-sky-500 font-mono shadow-xs"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                Automatically detects <code className="text-sky-600 font-mono">@lid</code>. Raw LID is preserved in database records.
              </p>
            </div>

            {/* Message Body */}
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-2 flex items-center justify-between">
                <span>Message Textarea</span>
                <span className="text-[11px] text-slate-500">{lidMessage.length} characters</span>
              </label>
              <textarea
                rows={4}
                value={lidMessage}
                onChange={(e) => setLidMessage(e.target.value)}
                placeholder="Type your message to the WhatsApp LID..."
                required
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-sky-500 resize-none shadow-xs leading-relaxed"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-6 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:bg-sky-300 text-white font-semibold text-sm shadow-md flex items-center justify-center gap-2 transition"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Routing via WhatsApp LID Protocol...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send Message using WhatsApp LID
                </>
              )}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

