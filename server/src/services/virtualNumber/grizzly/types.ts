/**
 * GrizzlySMS Partner Protocol Type Definitions
 * Exact documented contracts for inbound partner requests and outbound responses.
 */

export type GrizzlyPartnerAction = 'GET_SERVICES' | 'GET_NUMBER' | 'PUSH_SMS' | 'FINISH_ACTIVATION';

export type GrizzlyProviderStatus = 'enabled' | 'disabled' | 'maintenance';

export interface GrizzlyProviderConfig {
  id: string;
  provider_id: string;
  name: string;
  slug: string;
  protocol_key: string;
  status: GrizzlyProviderStatus;
  partner_api_endpoint?: string;
  priority: number;
  max_active_numbers: number;
  min_payout: number;
  max_payout: number;
  ip_allowlist: string[];
  last_successful_request_at?: string;
  last_error?: string;
  last_error_at?: string;
  total_requests_count: number;
  successful_requests_count: number;
  failed_requests_count: number;
}

// 1. GET_SERVICES Contracts
export interface GrizzlyGetServicesRequest {
  action: 'GET_SERVICES';
  key: string;
}

export interface GrizzlyOperatorServiceCount {
  [serviceCode: string]: number; // e.g. "tg": 3, "wa": 10
}

export interface GrizzlyOperatorMap {
  [operatorName: string]: GrizzlyOperatorServiceCount; // e.g. "any": { "tg": 3, "wa": 10 }
}

export interface GrizzlyCountryServicesItem {
  country: number; // Numeric country code, e.g. 12
  operatorMap: GrizzlyOperatorMap;
}

export interface GrizzlyGetServicesResponse {
  countryList: GrizzlyCountryServicesItem[];
  status: 'SUCCESS';
}

// 2. GET_NUMBER Contracts
export interface GrizzlyGetNumberRequest {
  action: 'GET_NUMBER';
  key: string;
  country: number;
  operator: string;
  service: string;
  sum: number;
  exceptionPhoneSet?: string[];
  canGetAnotherSms?: boolean;
}

export interface GrizzlyGetNumberSuccessResponse {
  status: 'SUCCESS';
  number: number; // e.g. 19157891133
  activationId: number; // e.g. 571346
  flashcall: boolean;
  voice: boolean;
  canGetAnotherSms: boolean;
}

export interface GrizzlyGetNumberNoNumbersResponse {
  status: 'NO_NUMBERS';
}

export type GrizzlyGetNumberResponse = GrizzlyGetNumberSuccessResponse | GrizzlyGetNumberNoNumbersResponse;

// 3. PUSH_SMS (Pending Complete Documentation)
export interface GrizzlyPushSmsPayload {
  activationId: number;
  phoneNumber: string;
  sender: string;
  messageContent: string;
  receivedTimestamp: string;
}

export interface GrizzlyPushSmsResult {
  success: boolean;
  status: 'forwarded' | 'pending_docs' | 'failed';
  providerResponse?: any;
  error?: string;
}

// 4. FINISH_ACTIVATION (Pending Complete Documentation)
export interface GrizzlyFinishActivationPayload {
  activationId: number;
  statusCode?: number; // 3 represents successful registration
  rewardAmount?: number;
  providerRef?: string;
  notes?: string;
}

export interface GrizzlyFinishActivationResult {
  success: boolean;
  activationId: number;
  newStatus: string;
  rewardRecorded: boolean;
  hardwareSlotReleased: boolean;
  notes?: string;
}

// 5. Hardware / SIM Module
export interface GrizzlyHardwareModule {
  id: string;
  slotNumber: number;
  name: string;
  simIccid?: string;
  phoneNumber?: string;
  countryId: number;
  operator: string;
  supportedServices: string[];
  status: 'active' | 'occupied' | 'failed' | 'maintenance' | 'idle';
  maxConcurrentChannels: number;
  activeActivationId?: string;
}
