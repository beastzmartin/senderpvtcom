import React, { createContext, useContext, useState } from 'react';

interface ContactContextType {
  phone: string;
  cleanPhone: string;
  getWhatsAppUrl: (customMessage?: string) => string;
  openWhatsApp: (customMessage?: string) => void;
  updatePhone?: (newNumber: string) => void;
  openEditModal?: () => void;
}

const DEFAULT_PHONE = '+919395889770';

const ContactContext = createContext<ContactContextType | undefined>(undefined);

export const ContactProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [phone] = useState<string>(() => {
    return ((import.meta as any).env?.VITE_SUPPORT_WHATSAPP as string) || DEFAULT_PHONE;
  });

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

  return (
    <ContactContext.Provider
      value={{
        phone,
        cleanPhone,
        getWhatsAppUrl,
        openWhatsApp
      }}
    >
      {children}
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
