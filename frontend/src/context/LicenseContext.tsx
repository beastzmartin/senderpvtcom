import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../services/api';

export interface LicenseDetails {
  license_key: string;
  hwid: string;
  plan_tier: string;
  status: string;
  activated_at: string;
  expires_at: string | null;
  is_lifetime: boolean;
  daily_message_limit: number;
  daily_extraction_limit: number;
  max_devices: number;
  features: string[];
}

export interface LicenseUsage {
  messagesSentToday: number;
  dailyMessageLimit: number;
  extractionsDoneToday: number;
  dailyExtractionLimit: number;
  connectedDevices: number;
  maxDevices: number;
}

export interface LicenseContextType {
  isLicensed: boolean;
  isLoading: boolean;
  hwid: string;
  license: LicenseDetails | null;
  usage: LicenseUsage | null;
  errorReason: string | null;
  activateLicense: (key: string) => Promise<{ success: boolean; message: string }>;
  deactivateLicense: () => Promise<void>;
  refreshLicense: () => Promise<void>;
}

const LicenseContext = createContext<LicenseContextType | undefined>(undefined);

export const LicenseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLicensed, setIsLicensed] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hwid, setHwid] = useState<string>('');
  const [license, setLicense] = useState<LicenseDetails | null>(null);
  const [usage, setUsage] = useState<LicenseUsage | null>(null);
  const [errorReason, setErrorReason] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.license.getStatus();
      setHwid(res.hwid || '');
      if (res.active && res.license) {
        setIsLicensed(true);
        setLicense(res.license);
        setUsage(res.usage || null);
        setErrorReason(null);
      } else {
        setIsLicensed(false);
        setLicense(null);
        setUsage(null);
        setErrorReason(res.reason || 'Software not activated.');
      }
    } catch (err: any) {
      console.warn('[LicenseContext] Status check error:', err);
      // Try to at least get the HWID
      try {
        const hwidRes = await api.license.getHwid();
        if (hwidRes.hwid) setHwid(hwidRes.hwid);
      } catch {}
      setIsLicensed(false);
      setErrorReason(err.message || 'Could not verify license status.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const activateLicense = async (key: string): Promise<{ success: boolean; message: string }> => {
    setIsLoading(true);
    try {
      const res = await api.license.activate(key);
      await fetchStatus();
      return {
        success: true,
        message: res.message || 'License activated successfully!'
      };
    } catch (err: any) {
      setIsLoading(false);
      throw err;
    }
  };

  const deactivateLicense = async (): Promise<void> => {
    setIsLoading(true);
    try {
      await api.license.deactivate();
      await fetchStatus();
    } catch (err) {
      console.error('[LicenseContext] Deactivate error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshLicense = async (): Promise<void> => {
    await fetchStatus();
  };

  return (
    <LicenseContext.Provider
      value={{
        isLicensed,
        isLoading,
        hwid,
        license,
        usage,
        errorReason,
        activateLicense,
        deactivateLicense,
        refreshLicense
      }}
    >
      {children}
    </LicenseContext.Provider>
  );
};

export const useLicense = (): LicenseContextType => {
  const context = useContext(LicenseContext);
  if (!context) {
    throw new Error('useLicense must be used within a LicenseProvider');
  }
  return context;
};
