export type NumberType = 'mobile' | 'geographic' | 'toll_free' | 'dedicated' | 'temporary';
export type RentalDuration = 'daily' | 'weekly' | 'monthly' | 'annual' | 'custom';
export type RentalStatus =
  | 'pending'
  | 'processing'
  | 'active'
  | 'renewal_due'
  | 'expired'
  | 'suspended'
  | 'releasing'
  | 'released'
  | 'failed';

export interface ProviderCountry {
  isoCode: string;
  name: string;
  dialCode: string;
  flagEmoji: string;
  supportedCapabilities: string[];
}

export interface ProviderNumberItem {
  phoneNumber: string;
  countryCode: string;
  numberType: NumberType;
  capabilities: string[];
  whatsappCompatible: boolean;
  otpCompatible: boolean;
  baseCost: number; // in INR
  activationFee: number;
  monthlyPrice: number;
  renewalPrice: number;
  providerRef: string;
  metadata?: Record<string, any>;
}

export interface NumberAllocationRequest {
  orderId: string;
  userId: string;
  workspaceId?: string | null;
  countryCode: string;
  numberType?: NumberType;
  capabilities?: string[];
  specificNumber?: string;
  inventoryId?: string;
  rentalDuration: RentalDuration;
  durationDays: number;
}

export interface NumberAllocationResult {
  success: boolean;
  allocatedNumber?: string;
  providerNumberRef?: string;
  activationDate?: string;
  expirationDate?: string;
  renewalDate?: string;
  error?: string;
  metadata?: Record<string, any>;
}

export interface NumberRenewalRequest {
  rentalId: string;
  userId: string;
  providerNumberRef: string;
  phoneNumber: string;
  durationDays: number;
}

export interface NumberRenewalResult {
  success: boolean;
  newExpirationDate?: string;
  providerRenewalRef?: string;
  error?: string;
}

export interface NumberReleaseRequest {
  rentalId: string;
  providerNumberRef: string;
  phoneNumber: string;
}

export interface NumberReleaseResult {
  success: boolean;
  error?: string;
}

export interface IncomingMessageItem {
  messageId: string;
  toPhoneNumber: string;
  fromSender: string;
  messageText: string;
  receivedAt: string;
  rawPayload?: any;
}

export interface CallRecordItem {
  callId: string;
  virtualNumber: string;
  callerNumber: string;
  direction: 'inbound' | 'outbound';
  durationSeconds: number;
  callStatus: 'completed' | 'missed' | 'busy' | 'failed' | 'voicemail';
  feeCharged?: number;
  startedAt: string;
  rawPayload?: any;
}

export interface ProviderWebhookResult {
  processed: boolean;
  eventType: string;
  data?: any;
  error?: string;
  handled?: boolean;
  responsePayload?: any;
}

export interface CalculatedPricing {
  baseCost: number;
  activationFee: number;
  markupAmount: number;
  markupPercentage: number;
  rentalPrice: number;
  totalFirstCharge: number;
  renewalPrice: number;
  currency: string;
  pricingRuleId?: string;
}
