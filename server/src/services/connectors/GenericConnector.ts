import { BaseConnector } from './BaseConnector.js';
import { LeadRecord } from './types.js';

export class GenericLeadConnector extends BaseConnector {
  public id: string;
  public name: string;
  public category: string;
  public description: string;
  public supportedFields: string[];

  constructor(
    id: string,
    name: string,
    category: string,
    description: string,
    supportedFields: string[]
  ) {
    super();
    this.id = id;
    this.name = name;
    this.category = category;
    this.description = description;
    this.supportedFields = supportedFields;
  }

  public validateParams(params: any): { valid: boolean; error?: string } {
    if (!params.keyword && !params.search && !params.query && !params.location) {
      return { valid: false, error: 'A search term or location parameter is required.' };
    }
    return { valid: true };
  }

  public normalizeLead(raw: any, userId: string, jobId?: string): Partial<LeadRecord> {
    const businessName = this.cleanBusinessName(raw.business_name || raw.name || raw.company || raw.title);
    const email = this.cleanEmail(raw.email);
    const phone = this.cleanPhone(raw.phone);
    const website = this.cleanWebsite(raw.website || raw.url);

    return {
      user_id: userId,
      job_id: jobId || null,
      business_name: businessName,
      category: raw.category || this.category,
      industry: raw.industry || raw.category || this.category,
      email: email,
      phone: phone,
      website: website,
      address: raw.address || null,
      city: raw.city || null,
      state: raw.state || null,
      country: raw.country || null,
      postal_code: raw.postal_code || null,
      rating: raw.rating ? Number(raw.rating) : null,
      reviews_count: raw.reviews_count ? Number(raw.reviews_count) : 0,
      source: this.id,
      source_url: raw.source_url || website || null,
      social_profiles: raw.social_profiles || null,
      status: 'new',
      is_verified: !!(email || phone),
      notes: raw.notes || raw.description || null,
      metadata: raw.metadata || {}
    };
  }
}

