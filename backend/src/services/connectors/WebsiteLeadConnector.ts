import { BaseConnector } from './BaseConnector.js';
import { LeadRecord, SocialProfiles } from './types.js';

export class WebsiteLeadConnector extends BaseConnector {
  public id = 'website_extractor';
  public name = 'Website Lead Extractor';
  public category = 'Web Scanner';
  public description = 'Scans public web pages and company contact sections for verified business emails, phone numbers, and social channels.';
  public supportedFields = [
    'business_name',
    'email',
    'phone',
    'website',
    'address',
    'social_profiles',
    'company_description'
  ];

  public validateParams(params: any): { valid: boolean; error?: string } {
    if (!params.url && !params.website) {
      return { valid: false, error: 'A valid website URL is required.' };
    }
    return { valid: true };
  }

  public normalizeLead(raw: any, userId: string, jobId?: string): Partial<LeadRecord> {
    const website = this.cleanWebsite(raw.website || raw.url || raw.page_url);
    const domain = this.extractDomain(website);
    
    // Guess business name from domain or raw title if missing
    let businessName = raw.business_name || raw.company_name || raw.title;
    if (!businessName && domain) {
      const parts = domain.split('.')[0];
      businessName = parts.charAt(0).toUpperCase() + parts.slice(1);
    }
    businessName = this.cleanBusinessName(businessName);

    const email = this.cleanEmail(raw.email || (Array.isArray(raw.emails) ? raw.emails[0] : null));
    const phone = this.cleanPhone(raw.phone || (Array.isArray(raw.phones) ? raw.phones[0] : null));

    const socialProfiles: SocialProfiles = {
      linkedin: raw.linkedin || raw.social_profiles?.linkedin || null,
      facebook: raw.facebook || raw.social_profiles?.facebook || null,
      instagram: raw.instagram || raw.social_profiles?.instagram || null,
      twitter: raw.twitter || raw.social_profiles?.twitter || null,
      youtube: raw.youtube || raw.social_profiles?.youtube || null,
      github: raw.github || raw.social_profiles?.github || null
    };

    return {
      user_id: userId,
      job_id: jobId || null,
      business_name: businessName,
      category: raw.category || 'Online Business',
      industry: raw.industry || 'Digital & Web',
      email: email,
      phone: phone,
      website: website,
      address: raw.address ? raw.address.trim() : null,
      city: raw.city || null,
      state: raw.state || null,
      country: raw.country || null,
      source: 'website_extractor',
      source_url: raw.source_url || raw.page_url || website,
      social_profiles: socialProfiles,
      status: 'new',
      is_verified: !!(email || phone),
      notes: raw.description || raw.company_description || null,
      metadata: {
        domain: domain,
        discovered_emails: Array.isArray(raw.emails) ? raw.emails : (email ? [email] : []),
        discovered_phones: Array.isArray(raw.phones) ? raw.phones : (phone ? [phone] : [])
      }
    };
  }
}

