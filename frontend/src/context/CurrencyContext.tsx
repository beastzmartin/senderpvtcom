import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';
import { CurrencyRecord } from '../types';
import { useAuth } from './AuthContext';

interface CurrencyContextType {
  currencies: CurrencyRecord[];
  currentCurrency: CurrencyRecord | null;
  currencyCode: string;
  currencySymbol: string;
  activeRate: number; // Rate from USD
  isLoading: boolean;
  switchCurrency: (code: string) => Promise<boolean>;
  convertFromUsd: (usdAmount: number) => number;
  formatUsdAsCurrency: (usdAmount: number) => string;
  convertFromBaseRub: (rubAmount: number) => number;
  formatPrice: (amount: number, overrideSymbol?: string) => string;
  formatRubAsCurrency: (rubAmount: number) => string;
  refreshCurrencies: () => Promise<void>;
}

const DEFAULT_CURRENCY: CurrencyRecord = {
  code: 'USD',
  name: 'US Dollar',
  symbol: '$',
  rate_from_usd: 1.0,
  rate_from_5sim_base: 1.0,
  is_default: 1,
  is_active: 1
};

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [currencies, setCurrencies] = useState<CurrencyRecord[]>([DEFAULT_CURRENCY]);
  const [currentCurrency, setCurrentCurrency] = useState<CurrencyRecord>(DEFAULT_CURRENCY);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Load currencies from backend on mount
  useEffect(() => {
    loadCurrencies();
  }, []);

  // When user profile loads or changes, sync preferred currency if present
  useEffect(() => {
    if (user?.preferred_currency && currencies.length > 0) {
      const matched = currencies.find(
        (c) => c.code.toUpperCase() === user.preferred_currency?.toUpperCase()
      );
      if (matched && matched.code !== currentCurrency.code) {
        setCurrentCurrency(matched);
        localStorage.setItem('preferred_currency', matched.code);
      }
    }
  }, [user?.preferred_currency, currencies]);

  const loadCurrencies = async () => {
    try {
      setIsLoading(true);
      const res = await api.currency.list();
      if (res.success && res.currencies && res.currencies.length > 0) {
        setCurrencies(res.currencies);

        // Find saved preference
        const savedCode = localStorage.getItem('preferred_currency') || user?.preferred_currency;
        let chosen: CurrencyRecord | undefined;

        if (savedCode) {
          chosen = res.currencies.find((c) => c.code.toUpperCase() === savedCode.toUpperCase());
        }

        if (!chosen) {
          // Use default flagged currency or first active
          chosen = res.currencies.find((c) => c.is_default === 1) || res.currencies[0];
        }

        if (chosen) {
          setCurrentCurrency(chosen);
          localStorage.setItem('preferred_currency', chosen.code);
        }
      }
    } catch (err) {
      console.warn('[CurrencyContext] Failed to load currencies, using fallback default:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const switchCurrency = async (code: string): Promise<boolean> => {
    const target = currencies.find((c) => c.code.toUpperCase() === code.toUpperCase());
    if (!target) return false;

    // Instant client-side state update (no page reload)
    setCurrentCurrency(target);
    localStorage.setItem('preferred_currency', target.code);

    try {
      // Sync with backend asynchronously
      if (user) {
        await api.currency.switch(target.code);
      }
      window.dispatchEvent(new CustomEvent('currency:switched', { detail: { code: target.code } }));
      return true;
    } catch (err) {
      console.warn('[CurrencyContext] Failed to sync currency switch with backend:', err);
      window.dispatchEvent(new CustomEvent('currency:switched', { detail: { code: target.code } }));
      return true;
    }
  };

  /**
   * Convert sovereign USD base amount to current active currency
   */
  const convertFromUsd = (usdAmount: number): number => {
    const rate = currentCurrency?.rate_from_usd ?? currentCurrency?.rate_from_5sim_base ?? 1.0;
    return Math.round(Number(usdAmount || 0) * rate * 100) / 100;
  };

  /**
   * Format a USD base price as localized string in user's active currency
   */
  const formatUsdAsCurrency = (usdAmount: number): string => {
    const converted = convertFromUsd(usdAmount);
    return formatPrice(converted);
  };

  /**
   * Backward-compatible ruble converter
   */
  const convertFromBaseRub = (rubAmount: number): number => {
    const rate = currentCurrency?.rate_from_5sim_base || 1.0;
    return Math.round(Number(rubAmount || 0) * rate * 100) / 100;
  };

  /**
   * Format localized price using standard Intl.NumberFormat
   */
  const formatPrice = (amount: number, overrideSymbol?: string): string => {
    const num = Number(amount) || 0;
    const code = currentCurrency?.code || 'USD';

    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: code,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(num);
    } catch {
      const sym = overrideSymbol || currentCurrency?.symbol || '$';
      return `${sym}${num % 1 === 0 ? num : num.toFixed(2)}`;
    }
  };

  const formatRubAsCurrency = (rubAmount: number): string => {
    const converted = convertFromBaseRub(rubAmount);
    return formatPrice(converted);
  };

  const activeRate = currentCurrency?.rate_from_usd ?? currentCurrency?.rate_from_5sim_base ?? 1.0;

  return (
    <CurrencyContext.Provider
      value={{
        currencies,
        currentCurrency,
        currencyCode: currentCurrency?.code || 'USD',
        currencySymbol: currentCurrency?.symbol || '$',
        activeRate,
        isLoading,
        switchCurrency,
        convertFromUsd,
        formatUsdAsCurrency,
        convertFromBaseRub,
        formatPrice,
        formatRubAsCurrency,
        refreshCurrencies: loadCurrencies
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = (): CurrencyContextType => {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
};
