export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'interested'
  | 'converted'
  | 'not_interested'
  | 'archived';

export interface SocialProfiles {
  linkedin?: string;
  facebook?: string;
  instagram?: string;
  twitter?: string;
  youtube?: string;
  github?: string;
}

export interface LeadRecord {
  id: string;
  user_id: string;
  job_id?: string | null;
  business_name: string;
  category?: string | null;
  industry?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postal_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  rating?: number | null;
  reviews_count?: number;
  operating_status?: string | null;
  place_id?: string | null;
  listing_url?: string | null;
  source: string;
  source_url?: string | null;
  social_profiles?: SocialProfiles | null;
  status: LeadStatus;
  is_verified?: boolean;
  notes?: string | null;
  metadata?: Record<string, any> | null;
  tags?: Array<{ id: string; name: string; color: string }>;
  created_at: string;
  updated_at: string;
}

export type ExtractionJobStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'partially_completed'
  | 'failed'
  | 'cancelled';

export interface ExtractionJobRecord {
  id: string;
  user_id: string;
  source: string;
  keyword?: string | null;
  location?: string | null;
  requested_count: number;
  collected_count: number;
  duplicate_count: number;
  failed_count: number;
  status: ExtractionJobStatus;
  current_progress: number;
  settings?: Record<string, any> | null;
  error_message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExtractionSourceRecord {
  id: string;
  name: string;
  category: string;
  description?: string;
  icon?: string;
  badge?: string;
  is_active: boolean;
  supported_fields: string[];
}

export interface LeadFilterOptions {
  search?: string;
  source?: string;
  status?: LeadStatus | 'all';
  industry?: string;
  city?: string;
  tagId?: string;
  jobId?: string;
  allUsers?: boolean;
  hasPhone?: boolean;
  hasEmail?: boolean;
  hasWebsite?: boolean;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  sortBy?: 'created_at' | 'business_name' | 'rating' | 'reviews_count';
  sortOrder?: 'asc' | 'desc';
}

export interface IExtractionConnector {
  id: string;
  name: string;
  category: string;
  description: string;
  supportedFields: string[];
  validateParams(params: any): { valid: boolean; error?: string };
  normalizeLead(raw: any, userId: string, jobId?: string): Partial<LeadRecord>;
  enrichLead?(lead: Partial<LeadRecord>): Promise<Partial<LeadRecord>>;
}

