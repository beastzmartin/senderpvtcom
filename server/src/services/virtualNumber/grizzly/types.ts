/**
 * GrizzlySMS Partner Protocol Type Definitions
 * Exact contracts for inbound partner requests and outbound delivery pipelines.
 */

export type GrizzlyPartnerAction =
  | 'GET_SERVICES'
  | 'GET_NUMBER'
  | 'PUSH_SMS'
  | 'PUSH_CALL'
  | 'PUSH_CALL_RECORD'
  | 'FINISH_ACTIVATION';

export type GrizzlyProviderStatus = 'enabled' | 'disabled' | 'maintenance';

/**
 * Official GrizzlySMS Status Codes
 */
export const GRIZZLY_STATUS = {
  PROHIBITED: 1,  // Number issuance prohibited
  SOLD: 3,        // Successfully sold
  CANCELLED: 4,   // Activation cancelled
  RETURNED: 5     // Activation returned / refund
} as const;

export interface GrizzlyProviderConfig {
  id: string;
  provider_id: string;
  name: string;
  slug: string;
  protocol_key: string;
  status: GrizzlyProviderStatus;
  partner_api_endpoint?: string;
  outbound_api_url: string;
  user_agent: string;
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
  number: number; // Ulong numeric e.g. 19157891133 or 447472190082
  activationId: number; // Ulong e.g. 571346
  flashcall: boolean;
  voice: boolean;
  canGetAnotherSms: boolean;
}

export interface GrizzlyGetNumberNoNumbersResponse {
  status: 'NO_NUMBERS';
}

export type GrizzlyGetNumberResponse = GrizzlyGetNumberSuccessResponse | GrizzlyGetNumberNoNumbersResponse;

// 3. PUSH_SMS Outbound Contract (https://api.grizzlysms.com/agent/api/sms)
export interface GrizzlyPushSmsOutboundRequest {
  action: 'PUSH_SMS';
  key: string;
  smsId: number; // Ulong
  phone: number; // Ulong e.g. 447472190082
  phoneFrom: string; // e.g. "447472190099"
  text: string;
}

export interface GrizzlyPushSmsResponse {
  status: 'SUCCESS' | 'ERROR';
  error?: string;
}

export interface GrizzlyPushSmsPayload {
  activationId: number;
  phoneNumber: string;
  sender: string;
  messageContent: string;
  receivedTimestamp?: string;
  smsId?: number;
  phone?: string | number;
  phoneFrom?: string;
  text?: string;
}

export interface GrizzlyPushSmsResult {
  success: boolean;
  messageId?: string;
  status?: string;
  error?: string;
  providerResponse?: any;
}

// 4. PUSH_CALL Outbound Contract (https://api.grizzlysms.com/agent/api/sms)
export interface GrizzlyPushCallOutboundRequest {
  action: 'PUSH_CALL';
  key: string;
  callId: number; // Ulong
  phone: number; // Ulong e.g. 447472190082
  phoneFrom: string; // e.g. "447472190099"
}

export interface GrizzlyPushCallResponse {
  status: 'SUCCESS' | 'ERROR';
  error?: string;
}

// 5. PUSH_CALL_RECORD Outbound Contract (multipart/form-data)
export interface GrizzlyPushCallRecordData {
  recordId: number;
  callId?: number;
  activationId?: number;
  phone: number;
  phoneFrom: string;
  filePath?: string;
  fileBuffer?: Buffer;
  fileName?: string;
  contentType?: string;
}

// 6. FINISH_ACTIVATION Inbound Callback Contract
export interface GrizzlyFinishActivationCallback {
  action: 'FINISH_ACTIVATION';
  key: string;
  activationId: number | string;
  status: number; // 1=prohibited, 3=sold, 4=cancelled, 5=returned
  reason?: string;
  sum?: number;
  reward?: number;
}

export interface GrizzlyFinishActivationCallbackResponse {
  status: 'SUCCESS' | 'ERROR';
  error?: string;
}

// 7. Hardware / SIM Module
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
