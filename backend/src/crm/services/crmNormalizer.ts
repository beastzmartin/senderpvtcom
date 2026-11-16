import { KeysetCursor } from '../models/types.js';

export class CrmNormalizer {
  /**
   * Normalize an email address:
   * Trim whitespace, convert to lowercase.
   */
  public static normalizeEmail(rawEmail?: string | null): string | null {
    if (!rawEmail) return null;
    const clean = rawEmail.trim().toLowerCase();
    // Basic RFC 5322 validation check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(clean)) return null;
    return clean;
  }

  /**
   * Normalize a phone number to E.164 standard (+[country_code][subscriber_number])
   */
  public static normalizePhone(rawPhone?: string | null, defaultCountryCode: string = '91'): string | null {
    if (!rawPhone) return null;
    let clean = rawPhone.replace(/[^\d+]/g, '').trim();
    if (!clean) return null;

    if (clean.startsWith('00')) {
      clean = '+' + clean.substring(2);
    }

    if (!clean.startsWith('+')) {
      // If starts with 0 and 11 digits (e.g. UK/AUS local), strip leading 0
      if (clean.startsWith('0') && clean.length > 10) {
        clean = clean.substring(1);
      }
      clean = `+${defaultCountryCode}${clean}`;
    }

    // Must be between 7 and 16 digits
    const digitsOnly = clean.replace(/\D/g, '');
    if (digitsOnly.length < 7 || digitsOnly.length > 15) {
      return null;
    }

    return clean;
  }

  /**
   * Trim and clean text strings
   */
  public static cleanText(val?: string | null): string | null {
    if (val === undefined || val === null) return null;
    const trimmed = String(val).trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  /**
   * Extract or clean domain name from URL or email
   */
  public static extractDomain(urlOrEmail?: string | null): string | null {
    if (!urlOrEmail) return null;
    let raw = urlOrEmail.trim().toLowerCase();

    // If it's an email
    if (raw.includes('@')) {
      return raw.split('@')[1] || null;
    }

    // If it's a URL
    try {
      if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
        raw = 'https://' + raw;
      }
      const parsed = new URL(raw);
      let hostname = parsed.hostname;
      if (hostname.startsWith('www.')) {
        hostname = hostname.substring(4);
      }
      return hostname;
    } catch {
      return null;
    }
  }

  /**
   * Encode keyset cursor to opaque URL-safe base64 string
   */
  public static encodeCursor(cursor: KeysetCursor): string {
    const json = JSON.stringify(cursor);
    return Buffer.from(json, 'utf8').toString('base64url');
  }

  /**
   * Decode opaque base64url cursor
   */
  public static decodeCursor(cursorStr?: string | null): KeysetCursor | null {
    if (!cursorStr) return null;
    try {
      const json = Buffer.from(cursorStr, 'base64url').toString('utf8');
      const parsed = JSON.parse(json);
      if (parsed && typeof parsed.created_at === 'string' && typeof parsed.id === 'string') {
        return parsed as KeysetCursor;
      }
      return null;
    } catch {
      return null;
    }
  }
}

