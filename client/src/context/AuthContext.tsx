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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(getAuthToken());
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const initAuth = async () => {
      const existingToken = getAuthToken();
      if (existingToken) {
        try {
          const res = await api.auth.getMe();
          setUser(res.user);
        } catch {
          // If token expired, clear it
          removeAuthToken();
          setTokenState(null);
          setUser(null);
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = async (usernameOrEmail: string, password: string) => {
    const res = await api.auth.login(usernameOrEmail, password);
    setAuthToken(res.token);
    setTokenState(res.token);
    setUser(res.user);
  };

  const register = async (params: RegisterParams | string, password?: string, name?: string) => {
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
        isAuthenticated: !!token && !!user
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

