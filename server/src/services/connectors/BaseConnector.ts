import { IExtractionConnector, LeadRecord } from './types.js';

export abstract class BaseConnector implements IExtractionConnector {
  abstract id: string;
  abstract name: string;
  abstract category: string;
  abstract description: string;
  abstract supportedFields: string[];

  abstract validateParams(params: any): { valid: boolean; error?: string };
  abstract normalizeLead(raw: any, userId: string, jobId?: string): Partial<LeadRecord>;

  /**
   * Cleans and formats phone numbers to E.164 pure digits or formatted standard
   */
  public cleanPhone(rawPhone?: string | null): string | null {
    if (!rawPhone) return null;
    let cleaned = rawPhone.trim().replace(/[^\d+]/g, '');
    if (cleaned.startsWith('00')) {
      cleaned = '+' + cleaned.substring(2);
    }
    // Remove repeated plus signs
    cleaned = cleaned.replace(/\+{2,}/g, '+');
    // If only digits without leading +, retain valid international sequence
    const digitsOnly = cleaned.replace(/\D/g, '');
    if (digitsOnly.length < 6 || digitsOnly.length > 16) {
      return null;
    }
    return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
  }

  /**
   * Validates standard business email syntax and filters out image assets or dummy emails
   */
  public cleanEmail(rawEmail?: string | null): string | null {
    if (!rawEmail) return null;
    const email = rawEmail.trim().toLowerCase();
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) return null;

    // Filter out common dummy or static assets mistaken as emails
    const blacklisted = ['domain.com', 'example.com', 'yourname@', 'test@test.com', 'sentry.io'];
    if (blacklisted.some(bl => email.includes(bl))) return null;
    if (email.endsWith('.png') || email.endsWith('.jpg') || email.endsWith('.svg') || email.endsWith('.webp')) return null;

    return email;
  }

  /**
   * Normalizes website URL with proper https protocol
   */
  public cleanWebsite(rawUrl?: string | null): string | null {
    if (!rawUrl) return null;
    let url = rawUrl.trim();
    if (!url) return null;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }
    try {
      const parsed = new URL(url);
      return parsed.origin.toLowerCase() === 'null' ? null : `${parsed.protocol}//${parsed.hostname.toLowerCase()}${parsed.pathname === '/' ? '' : parsed.pathname}`;
    } catch {
      return null;
    }
  }

  /**
   * Extracts clean root domain from website
   */
  public extractDomain(websiteUrl?: string | null): string | null {
    if (!websiteUrl) return null;
    try {
      const url = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
      return null;
    }
  }

  /**
   * Generates a unique deduplication fingerprint based on Phone, Email, or Business Name + City
   */
  public generateDeduplicationKey(lead: Partial<LeadRecord>): string {
    if (lead.phone) {
      const digits = lead.phone.replace(/\D/g, '');
      if (digits.length >= 7) return `phone:${digits.slice(-10)}`;
    }
    if (lead.email) {
      return `email:${lead.email.trim().toLowerCase()}`;
    }
    if (lead.place_id) {
      return `place:${lead.place_id.trim()}`;
    }
    const cleanName = (lead.business_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanCity = (lead.city || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return `name_city:${cleanName}_${cleanCity}`;
  }

  /**
   * Normalizes business name by stripping redundant trailing punctuation and excess whitespace
   */
  public cleanBusinessName(rawName?: string | null): string {
    if (!rawName) return 'Unknown Business';
    return rawName.trim().replace(/\s+/g, ' ');
  }
}
