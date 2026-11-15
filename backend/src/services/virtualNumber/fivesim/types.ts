/**
 * 5SIM.NET API Types (Parts 1 - 3)
 * Reference: Official 5SIM Integration Documentation
 */

export interface FiveSimDefaultCountry {
  name: string;
  iso: string;
  prefix: string;
}

export interface FiveSimDefaultOperator {
  name: string;
}

// 2.1 User Profile
export interface FiveSimProfile {
  id: number;
  email: string;
  vendor: string;
  default_forwarding_number: string;
  balance: number;
  rating: number;
  default_country: FiveSimDefaultCountry;
  default_operator: FiveSimDefaultOperator;
  frozen_balance: number;
}

// SMS Record inside Order
export interface FiveSimSmsItem {
  id?: number;
  created_at: string;
  date: string;
  sender: string;
  text: string;
  code: string;
}

// 2.2 Order Item
export type FiveSimOrderStatus =
  | 'PENDING'
  | 'RECEIVED'
  | 'CANCELED'
  | 'TIMEOUT'
  | 'FINISHED'
  | 'BANNED';

export interface FiveSimOrderItem {
  id: number;
  phone: string;
  operator: string;
  product: string;
  price: number;
  status: FiveSimOrderStatus | string;
  expires: string;
  sms: FiveSimSmsItem[] | null;
  created_at: string;
  country: string;
  forwarding?: boolean;
  forwarding_number?: string;
}

// 2.2 Order History Response
export interface FiveSimOrdersResponse {
  Data: FiveSimOrderItem[];
  ProductNames: string[];
  Statuses: string[];
  Total: number;
}

// 2.3 Payments History Item
export interface FiveSimPaymentItem {
  ID: number;
  TypeName: string;
  ProviderName: string;
  Amount: number;
  Balance: number;
  CreatedAt: string;
}

// 2.3 Payments History Response
export interface FiveSimPaymentsResponse {
  Data: FiveSimPaymentItem[];
  PaymentTypes: Array<{ Name: string }>;
  PaymentProviders: Array<{ Name: string }>;
  Total: number;
}

// 3.1 - 3.3 Max Prices (Price Limits)
export interface FiveSimMaxPriceItem {
  id: number;
  product: string;
  price: number;
  CreatedAt?: string;
}

// Provider Configuration record stored in DB
export interface FiveSimProviderConfig {
  id: string;
  apiKey: string;
  baseUrl: string;
  isEnabled: boolean;
  autoSync: boolean;
  maxRequestsPerSec: number;
  balance: number;
  frozenBalance: number;
  rating: number;
  email?: string;
  vendor?: string;
  defaultCountry?: FiveSimDefaultCountry;
  defaultOperator?: FiveSimDefaultOperator;
  defaultForwardingNumber?: string;
  lastSyncAt?: string;
  lastError?: string;
  lastErrorAt?: string;
}

// Rating action points lookup from Part 1.4
export const FIVESIM_RATING_POINTS = {
  ACCOUNT_REPLENISHMENT: +8.0,
  COMPLETED_BEFORE_CODE_ELAPSED: +0.5,
  AUTOMATICALLY_COMPLETED: +0.4,
  TIMEOUT: -0.15,
  CANCELED_PURCHASE: -0.1,
  BANNED_NUMBER: -0.1,
  INITIAL_RATING: 96,
  MAX_RATING: 96
} as const;

// Request limits constants from Part 1.3
export const FIVESIM_LIMITS = {
  MAX_REQUESTS_PER_SECOND: 100,
  BAN_ON_LIMIT_HITS_COUNT: 5,
  BAN_ON_LIMIT_HITS_WINDOW_MINUTES: 10,
  BAN_DURATION_MINUTES: 10,
  MAX_WAITING_TIME_MINUTES: 15,
  TIMEOUT_NO_SMS_MINUTES: 5
} as const;

// =========================================================================
// PART 4: PRODUCTS & PRICES (GUEST ENDPOINTS)
// =========================================================================

export interface FiveSimProductInfo {
  Category: 'activation' | 'hosting';
  Qty: number;
  Price: number;
}

export type FiveSimProductsMap = Record<string, FiveSimProductInfo>;

export interface FiveSimOperatorPrice {
  cost: number;
  count: number;
  rate?: number;
}

export type FiveSimOperatorPricesMap = Record<string, FiveSimOperatorPrice>;

// By country & product: { [country]: { [product]: { [operator]: FiveSimOperatorPrice } } }
export type FiveSimCountryProductPricesMap = Record<string, Record<string, FiveSimOperatorPricesMap>>;

// By product: { [product]: { [country]: { [operator]: FiveSimOperatorPrice } } }
export type FiveSimProductPricesMap = Record<string, Record<string, FiveSimOperatorPricesMap>>;

export interface FiveSimCountryMetadata {
  iso: Record<string, number>;
  prefix: Record<string, number>;
  text_en: string;
  [key: string]: any;
}

export type FiveSimCountriesResponse = Record<string, FiveSimCountryMetadata>;

// =========================================================================
// PART 5: PURCHASE (ACTIVATION, HOSTING, RE-BUY)
// =========================================================================

export interface BuyActivationParams {
  country: string;
  operator: string;
  product: string;
  forwarding?: boolean;
  number?: string;
  reuse?: number;
  voice?: number;
  ref?: string;
  maxPrice?: number;
}

export interface BuyHostingParams {
  country: string;
  operator: string;
  product: string;
}

export interface ReuseNumberParams {
  product: string;
  number: string;
}

// =========================================================================
// PART 6: ORDER MANAGEMENT & SMS INBOX
// =========================================================================

export interface FiveSimHostingSmsItem {
  ID: number;
  created_at: string;
  date: string;
  sender: string;
  text: string;
  code: string;
  is_wave?: boolean;
  wave_uuid?: string;
}

export interface FiveSimHostingInboxResponse {
  Data: FiveSimHostingSmsItem[];
  Total: number;
}


