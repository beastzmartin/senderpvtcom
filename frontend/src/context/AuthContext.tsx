import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, getAuthToken, setAuthToken, removeAuthToken } from '../services/api';
import { User } from '../types';

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
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(getAuthToken());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isImpersonating, setIsImpersonating] = useState<boolean>(false);
  const [impersonatorAdmin, setImpersonatorAdmin] = useState<{ id?: string; username?: string; name?: string } | null>(null);

  useEffect(() => {
    const initAuth = async () => {
      const backupStr = localStorage.getItem('wa_admin_impersonation_backup');
      if (backupStr) {
        try {
          const backup = JSON.parse(backupStr);
          setIsImpersonating(true);
          setImpersonatorAdmin({ id: backup.user?.id, username: backup.user?.username, name: backup.user?.name });
        } catch {}
      }

      const existingToken = getAuthToken();
      if (existingToken) {
        try {
          const res = await api.auth.getMe();
          setUser(res.user);
        } catch {
          // If token expired, clear it
          localStorage.removeItem('wa_admin_impersonation_backup');
          removeAuthToken();
          setTokenState(null);
          setUser(null);
          setIsImpersonating(false);
          setImpersonatorAdmin(null);
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = async (usernameOrEmail: string, password: string) => {
    localStorage.removeItem('wa_admin_impersonation_backup');
    setIsImpersonating(false);
    setImpersonatorAdmin(null);
    const res = await api.auth.login(usernameOrEmail, password);
    setAuthToken(res.token);
    setTokenState(res.token);
    setUser(res.user);
  };

  const register = async (params: RegisterParams | string, password?: string, name?: string) => {
    localStorage.removeItem('wa_admin_impersonation_backup');
    setIsImpersonating(false);
    setImpersonatorAdmin(null);
    let payload: {
      username: string;
      password: string;
      name?: string;
      email?: string;
      company_name?: string;
      phone?: string;
      plan_tier?: string;
    };

    if (typeof params === 'string') {
      payload = {
        username: params,
        password: password || '',
        name
      };
    } else {
      payload = params;
    }

    const res = await api.auth.register(payload);
    setAuthToken(res.token);
    setTokenState(res.token);
    setUser(res.user);
  };

  const impersonateUser = async (targetUserId: string) => {
    if (!token || !user) throw new Error('You must be logged in as Administrator to impersonate.');
    const res = await api.admin.impersonate(targetUserId);

    // Backup current admin credentials
    const adminBackup = {
      token,
      user
    };
    localStorage.setItem('wa_admin_impersonation_backup', JSON.stringify(adminBackup));

    setAuthToken(res.token);
    setTokenState(res.token);
    setUser(res.user);
    setIsImpersonating(true);
    setImpersonatorAdmin({ id: user.id, username: user.username, name: user.name });
  };

  const stopImpersonation = () => {
    const backupStr = localStorage.getItem('wa_admin_impersonation_backup');
    if (backupStr) {
      try {
        const backup = JSON.parse(backupStr);
        setAuthToken(backup.token);
        setTokenState(backup.token);
        setUser(backup.user);
      } catch {}
      localStorage.removeItem('wa_admin_impersonation_backup');
    }
    setIsImpersonating(false);
    setImpersonatorAdmin(null);
  };

  const refreshUser = async (): Promise<User | null> => {
    try {
      const res = await api.auth.getMe();
      setUser(res.user);
      return res.user;
    } catch {
      return null;
    }
  };

  const logout = () => {
    localStorage.removeItem('wa_admin_impersonation_backup');
    setIsImpersonating(false);
    setImpersonatorAdmin(null);
    removeAuthToken();
    setTokenState(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        register,
        refreshUser,
        logout,
        isAuthenticated: !!token && !!user,
        isImpersonating,
        impersonatorAdmin,
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

