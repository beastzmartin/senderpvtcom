/**
 * ProductDefinition Schema (v1) and Marketplace Data Types
 * White-Label Data Extraction Marketplace
 */

export type ProductStatus = 'draft' | 'active' | 'disabled';
export type ProviderType = 'apify' | 'mock';

export type InputFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'multiselect'
  | 'boolean'
  | 'url'
  | 'url_list'
  | 'string_list';

export interface InputFieldDefinition {
  key: string;
  provider_key: string;
  label: string;
  help?: string;
  type: InputFieldType;
  required: boolean;
  default?: any;
  options?: Array<{ label: string; value: string | number }>;
  min?: number | null;
  max?: number | null;
  visible_to_user: boolean;
}

export interface ProductInputDefinition {
  fields: InputFieldDefinition[];
  static_overrides: Record<string, any>;
  hidden_defaults: Record<string, any>;
}

export interface ProductLimits {
  min_items: number;
  max_items_per_run: number;
  max_concurrent_runs_per_user: number;
  timeout_secs: number;
  memory_mb: number;
}

export type PricingMode = 'per_item' | 'per_run' | 'per_item_plus_run';
export type ProviderCostModel = 'pay_per_result' | 'pay_per_event' | 'rental' | 'free_usage_based';
export type MarginType = 'percent' | 'fixed' | 'none';

export interface ProviderCostReference {
  model: ProviderCostModel;
  usd_per_1000_items?: number | null;
  usd_per_run_start?: number | null;
  notes?: string;
}

export interface ProductPricing {
  mode: PricingMode;
  provider_cost_reference: ProviderCostReference;
  sell: {
    per_1000_items: number; // in platform currency (e.g. INR)
    per_run_flat: number;   // in platform currency
  };
  margin: {
    type: MarginType;
    value: number;
  };
  min_charge: number; // in platform currency
}

export interface ProductAccess {
  requires_subscription: boolean;
  allowed_plan_slugs: string[];
}

export interface OutputItemMapping {
  from: string;
  to: string;
  label: string;
  type: 'string' | 'number' | 'bool' | 'url' | 'date';
  hidden?: boolean;
}

export interface ProductOutputDefinition {
  item_mapping: OutputItemMapping[];
  drop_fields: string[];
  preview_columns: string[];
  export_formats: ('csv' | 'xlsx' | 'json')[];
  sanitize: {
    strip_provider_urls: boolean;
  };
}

export interface ProductCompliance {
  contains_personal_data: boolean;
  disclaimer_md?: string;
  notes?: string;
}

/**
 * Exact ProductDefinition Schema (v1)
 */
export interface ProductDefinition {
  slug: string;
  display_name: string;
  tagline: string;
  description_md: string;
  category: string;
  icon?: string;
  status: ProductStatus;

  provider: {
    type: ProviderType;
    actor_id: string; // username~actor-name OR actor id
    build?: string;
  };

  input: ProductInputDefinition;
  limits: ProductLimits;
  pricing: ProductPricing;
  access: ProductAccess;
  output: ProductOutputDefinition;
  compliance: ProductCompliance;
}

export interface MarketplaceProductRecord {
  id: string;
  slug: string;
  display_name: string;
  tagline: string;
  description_md: string;
  category: string;
  icon: string | null;
  status: ProductStatus;
  definition: ProductDefinition;
  created_at: string;
  updated_at: string;
}

export type JobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'ABORTED';

export interface MarketplaceJobRecord {
  id: string;
  user_id: string;
  product_id: string;
  product_slug: string;
  product_name: string;
  input_data: Record<string, any>;
  requested_items: number;
  status: JobStatus;
  provider_type: ProviderType;
  provider_run_id?: string | null;
  provider_dataset_id?: string | null;
  items_delivered: number;
  reserved_amount: number;
  charged_amount: number;
  provider_cost_usd: number;
  provider_cost_converted: number;
  currency: string;
  reservation_tx_id?: string | null;
  settle_tx_id?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarketplaceJobResultItem {
  id: string;
  job_id: string;
  row_index: number;
  data: Record<string, any>;
  created_at: string;
}
