import React, { createContext, useContext, useMemo } from 'react';
import { User } from '../types';
import { useLicense } from './LicenseContext';

export interface RegisterParams {
  username: string;
  password: string;
  name?: string;
  email?: string;
  company_name?: string;
  phone?: string;
  plan_tier?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (usernameOrEmail: string, password: string) => Promise<void>;
  register: (params: RegisterParams | string, password?: string, name?: string) => Promise<void>;
  refreshUser: () => Promise<User | null>;
  logout: () => void;
  isAuthenticated: boolean;
  isImpersonating: boolean;
  impersonatorAdmin: { id?: string; username?: string; name?: string } | null;
  impersonateUser: (targetUserId: string) => Promise<void>;
  stopImpersonation: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLicensed, isLoading, license, deactivateLicense, refreshLicense } = useLicense();

  const user: User | null = useMemo(() => {
    if (!isLicensed) return null;

    return {
      id: 'local_user',
      username: 'local_user',
      email: 'user@desktop.local',
      name: 'Desktop User',
      company_name: 'Local Workstation',
      phone: '',
      role: 'admin', // Full administrator rights on desktop workstation
      plan_tier: (license?.plan_tier as any) || 'enterprise',
      subscription_status: 'active',
      subscription_expires_at: license?.expires_at || null,
      max_devices: license?.max_devices || 10,
      daily_message_limit: license?.daily_message_limit || 10000,
      daily_extraction_limit: license?.daily_extraction_limit || 10000,
      messages_sent_today: 0,
      last_message_date: null,
      active_license_code: license?.license_key || 'ACTIVE',
      reseller_license_quota: 0,
      allowed_pages: null, // Full access to all features
      is_active: true,
      created_at: license?.activated_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }, [isLicensed, license]);

  const login = async () => {
    console.warn('[AuthContext] Login is deprecated in Desktop Edition. Software is activated via License Key.');
  };

  const register = async () => {
    console.warn('[AuthContext] Registration is deprecated in Desktop Edition. Software is activated via License Key.');
  };

  const refreshUser = async (): Promise<User | null> => {
    await refreshLicense();
    return user;
  };

  const logout = () => {
    // In desktop edition, logout prompts deactivating or changing the license
    deactivateLicense();
  };

  const impersonateUser = async () => {};
  const stopImpersonation = () => {};

  return (
    <AuthContext.Provider
      value={{
        user,
        token: isLicensed ? 'desktop_active_session' : null,
        isLoading,
        login,
        register,
        refreshUser,
        logout,
        isAuthenticated: isLicensed,
        isImpersonating: false,
        impersonatorAdmin: null,
        impersonateUser,
        stopImpersonation
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
