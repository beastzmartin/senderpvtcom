import dns from 'dns';
import { getCrmDb } from '../db/index.js';
import { Contact, FieldVerificationResult } from '../models/types.js';

const DISPOSABLE_DOMAINS = new Set([
  'tempmail.com', '10minutemail.com', 'mailinator.com', 'guerrillamail.com',
  'sharklasers.com', 'dispostable.com', 'yopmail.com', 'getairmail.com',
  'throwawaymail.com', 'trashmail.com', 'fakeinbox.com', 'temp-mail.org',
  'burnermail.io', 'inboxkitten.com', 'mytemp.email', 'tempmailaddress.com'
]);

const ROLE_BASED_PREFIXES = new Set([
  'admin', 'administrator', 'support', 'help', 'info', 'contact',
  'billing', 'sales', 'marketing', 'team', 'office', 'jobs', 'careers',
  'press', 'media', 'compliance', 'security', 'privacy', 'hello', 'hi'
]);

export interface EmailVerificationDetail {
  syntax_valid: boolean;
  is_disposable: boolean;
  is_role_based: boolean;
  has_mx: boolean;
  mx_records: string[];
  status: 'valid' | 'invalid' | 'risky' | 'unknown';
  confidence: number;
}

export class CrmVerificationPipeline {
  private static instance: CrmVerificationPipeline | null = null;

  public static getInstance(): CrmVerificationPipeline {
    if (!CrmVerificationPipeline.instance) {
      CrmVerificationPipeline.instance = new CrmVerificationPipeline();
    }
    return CrmVerificationPipeline.instance;
  }

  /**
   * Verify email address using RFC syntax, disposable detection, role detection, and DNS MX resolution
   */
  public async verifyEmail(email: string): Promise<EmailVerificationDetail> {
    const raw = (email || '').trim().toLowerCase();
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

    if (!emailRegex.test(raw)) {
      return {
        syntax_valid: false,
        is_disposable: false,
        is_role_based: false,
        has_mx: false,
        mx_records: [],
        status: 'invalid',
        confidence: 1.0
      };
    }

    const [localPart, domain] = raw.split('@');
    const isDisposable = DISPOSABLE_DOMAINS.has(domain);
    const isRoleBased = ROLE_BASED_PREFIXES.has(localPart);

    if (isDisposable) {
      return {
        syntax_valid: true,
        is_disposable: true,
        is_role_based: isRoleBased,
        has_mx: false,
        mx_records: [],
        status: 'invalid',
        confidence: 0.98
      };
    }

    // Resolve MX records via DNS
    let hasMx = false;
    let mxHosts: string[] = [];
    try {
      const records = await dns.promises.resolveMx(domain);
      if (records && records.length > 0) {
        hasMx = true;
        mxHosts = records.map((r) => r.exchange);
      }
    } catch {
      hasMx = false;
    }

    let status: 'valid' | 'invalid' | 'risky' | 'unknown' = 'valid';
    let confidence = 0.95;

    if (!hasMx) {
      status = 'invalid';
      confidence = 0.90;
    } else if (isRoleBased) {
      status = 'risky';
      confidence = 0.75;
    }

    return {
      syntax_valid: true,
      is_disposable: isDisposable,
      is_role_based: isRoleBased,
      has_mx: hasMx,
      mx_records: mxHosts,
      status,
      confidence
    };
  }

  /**
   * Verify phone number (E.164 standard, country code, line type heuristic)
   */
  public verifyPhone(phone: string): {
    is_e164: boolean;
    country_code?: string;
    line_type: 'mobile' | 'fixed_line' | 'voip' | 'unknown';
    status: 'valid' | 'invalid' | 'unknown';
    confidence: number;
  } {
    const raw = (phone || '').trim();
    const e164Regex = /^\+[1-9]\d{6,14}$/;

    if (!e164Regex.test(raw)) {
      return {
        is_e164: false,
        line_type: 'unknown',
        status: 'invalid',
        confidence: 0.95
      };
    }

    let countryCode = '';
    if (raw.startsWith('+1')) countryCode = 'US/CA';
    else if (raw.startsWith('+91')) countryCode = 'IN';
    else if (raw.startsWith('+44')) countryCode = 'UK';
    else if (raw.startsWith('+971')) countryCode = 'UAE';
    else countryCode = raw.slice(0, 3);

    return {
      is_e164: true,
      country_code: countryCode,
      line_type: 'mobile', // Heuristic default for modern communication
      status: 'valid',
      confidence: 0.90
    };
  }

  /**
   * Verify domain liveness via DNS and HTTP HEAD
   */
  public async verifyDomain(domainOrUrl: string): Promise<{
    is_alive: boolean;
    status_code?: number;
    dns_resolved: boolean;
    latency_ms: number;
  }> {
    const raw = (domainOrUrl || '').replace(/^https?:\/\//i, '').split('/')[0].trim();
    if (!raw) return { is_alive: false, dns_resolved: false, latency_ms: 0 };

    let dnsResolved = false;
    try {
      const addresses = await dns.promises.resolve4(raw);
      dnsResolved = Boolean(addresses && addresses.length > 0);
    } catch {
      dnsResolved = false;
    }

    if (!dnsResolved) {
      return { is_alive: false, dns_resolved: false, latency_ms: 0 };
    }

    const start = Date.now();
    try {
      const resp = await fetch(`https://${raw}`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'CRM-Domain-Verifier/2.0' }
      });
      return {
        is_alive: resp.ok || resp.status < 500,
        status_code: resp.status,
        dns_resolved: true,
        latency_ms: Date.now() - start
      };
    } catch {
      return {
        is_alive: dnsResolved, // At least DNS resolved
        dns_resolved: true,
        latency_ms: Date.now() - start
      };
    }
  }

  /**
   * Verify a single contact and record all results in DB
   */
  public async verifyContact(workspaceId: string, contactId: string): Promise<{
    email_verification?: EmailVerificationDetail;
    phone_verification?: any;
    updated_contact: Contact;
  }> {
    const db = getCrmDb();
    const contact = await db.getContact(workspaceId, contactId);
    if (!contact) throw new Error(`Contact not found: ${contactId}`);

    let emailVerif: EmailVerificationDetail | undefined;
    let phoneVerif: any = undefined;

    // Verify email if present
    if (contact.email) {
      emailVerif = await this.verifyEmail(contact.email);
      await db.logVerification(workspaceId, {
        contact_id: contact.id,
        field_name: 'email',
        field_value: contact.email,
        provider: 'native_mx_dns',
        status: emailVerif.status,
        confidence: emailVerif.confidence,
        details: emailVerif
      });
    }

    // Verify phone if present
    if (contact.phone) {
      phoneVerif = this.verifyPhone(contact.phone);
      await db.logVerification(workspaceId, {
        contact_id: contact.id,
        field_name: 'phone',
        field_value: contact.phone,
        provider: 'native_e164',
        status: phoneVerif.status,
        confidence: phoneVerif.confidence,
        details: phoneVerif
      });
    }

    // Update contact email_status and verified_at
    const updated = await db.updateContact(workspaceId, contact.id, {
      email_status: emailVerif ? emailVerif.status : contact.email_status,
      verified_at: new Date().toISOString()
    });

    return {
      email_verification: emailVerif,
      phone_verification: phoneVerif,
      updated_contact: updated
    };
  }

  /**
   * Batch verification for unverified or stale contacts in a workspace
   */
  public async batchVerifyContacts(
    workspaceId: string,
    limit: number = 100
  ): Promise<{ processed: number; valid: number; invalid: number; risky: number }> {
    const db = getCrmDb();
    const contactsRes = await db.listContacts(workspaceId, { pagination: { limit } });
    const unverified = contactsRes.data.filter((c) => !c.verified_at || c.email_status === 'unknown');

    let processed = 0;
    let valid = 0;
    let invalid = 0;
    let risky = 0;

    for (const c of unverified) {
      try {
        const res = await this.verifyContact(workspaceId, c.id);
        processed++;
        const st = res.email_verification?.status;
        if (st === 'valid') valid++;
        else if (st === 'invalid') invalid++;
        else if (st === 'risky') risky++;
      } catch (err) {
        console.warn(`[CrmVerificationPipeline] Error verifying contact ${c.id}:`, err);
      }
    }

    return { processed, valid, invalid, risky };
  }
}

