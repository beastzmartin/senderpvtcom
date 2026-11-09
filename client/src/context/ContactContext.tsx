import React, { createContext, useContext, useState, useEffect } from 'react';
import { Phone, Check, X, MessageCircle, AlertCircle, Edit3 } from 'lucide-react';

interface ContactContextType {
  phone: string;
  cleanPhone: string;
  getWhatsAppUrl: (customMessage?: string) => string;
  openWhatsApp: (customMessage?: string) => void;
  updatePhone: (newNumber: string) => void;
  openEditModal: () => void;
}

const DEFAULT_PHONE = '+919395889770';
const STORAGE_KEY = 'app_support_whatsapp';

const ContactContext = createContext<ContactContextType | undefined>(undefined);

export const ContactProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [phone, setPhone] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && saved.trim()) return saved.trim();
    } catch {
      // ignore
    }
    return ((import.meta as any).env?.VITE_SUPPORT_WHATSAPP as string) || DEFAULT_PHONE;
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [inputPhone, setInputPhone] = useState(phone);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setInputPhone(phone);
  }, [phone]);

  const cleanPhone = phone.replace(/[^0-9]/g, '');

  const getWhatsAppUrl = (customMessage?: string): string => {
    const targetDigits = cleanPhone || '919395889770';
    const baseUrl = `https://wa.me/${targetDigits}`;
    if (customMessage) {
      return `${baseUrl}?text=${encodeURIComponent(customMessage)}`;
    }
    return baseUrl;
  };

  const openWhatsApp = (customMessage?: string) => {
    const url = getWhatsAppUrl(customMessage);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const updatePhone = (newNumber: string) => {
    const trimmed = newNumber.trim();
    if (!trimmed) {
      setPhone(DEFAULT_PHONE);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
      return;
    }
    setPhone(trimmed);
    try {
      localStorage.setItem(STORAGE_KEY, trimmed);
    } catch {
      // ignore
    }
  };

  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleaned = inputPhone.replace(/[^0-9+]/g, '');
    if (!cleaned || cleaned.length < 7) {
      setError('Please enter a valid phone number with country code (e.g. +919395889770).');
      return;
    }
    updatePhone(cleaned);
    setSuccess(true);
    setTimeout(() => {
      setSuccess(false);
      setIsModalOpen(false);
    }, 600);
  };

  const handleResetDefault = () => {
    setInputPhone(DEFAULT_PHONE);
    updatePhone(DEFAULT_PHONE);
    setSuccess(true);
    setTimeout(() => {
      setSuccess(false);
      setIsModalOpen(false);
    }, 600);
  };

  return (
    <ContactContext.Provider
      value={{
        phone,
        cleanPhone,
        getWhatsAppUrl,
        openWhatsApp,
        updatePhone,
        openEditModal: () => {
          setInputPhone(phone);
          setError(null);
          setSuccess(false);
          setIsModalOpen(true);
        },
      }}
    >
      {children}

      {/* Global Edit Support Contact Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl border border-slate-100 relative space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center">
                  <Phone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Edit Support WhatsApp</h3>
                  <p className="text-xs text-slate-500">Updates the WhatsApp contact number across all views</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>Contact number updated successfully!</span>
              </div>
            )}

            <form onSubmit={handleSaveModal} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  WhatsApp Phone Number (with Country Code)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={inputPhone}
                    onChange={(e) => setInputPhone(e.target.value)}
                    placeholder="+919395889770"
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm font-mono"
                    required
                  />
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Default: <span className="font-mono text-emerald-700 font-semibold">{DEFAULT_PHONE}</span>
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 space-y-1">
                <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                  Live Preview Clickable Link:
                </div>
                <a
                  href={`https://wa.me/${inputPhone.replace(/[^0-9]/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-700 hover:underline font-mono text-[11px] break-all block"
                >
                  https://wa.me/{inputPhone.replace(/[^0-9]/g, '') || '919395889770'}
                </a>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleResetDefault}
                  className="py-2.5 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-600 transition"
                >
                  Reset Default
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm shadow-emerald-600/20"
                >
                  <Check className="w-4 h-4" />
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </ContactContext.Provider>
  );
};

export const useContact = (): ContactContextType => {
  const context = useContext(ContactContext);
  if (!context) {
    throw new Error('useContact must be used within a ContactProvider');
  }
  return context;
};
