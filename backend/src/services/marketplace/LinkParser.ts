import { getDatabase } from '../../db/database.js';

export interface ParsedActorRef {
  originalInput: string;
  normalizedActorId: string; // e.g. "username~actor-name" or raw ID "R9SL2PPdhdhLQwdck"
  username?: string;
  actorName?: string;
  isValid: boolean;
  error?: string;
  isDuplicate?: boolean;
  existingProductSlug?: string;
}

export class LinkParser {
  /**
   * Parse and normalize a single Apify link, slug, or ID
   */
  public static parseActorRef(input: string, checkDb: boolean = false): ParsedActorRef {
    const raw = (input || '').trim();
    if (!raw) {
      return {
        originalInput: raw,
        normalizedActorId: '',
        isValid: false,
        error: 'Input string cannot be empty.'
      };
    }

    try {
      let cleaned = raw;

      // Handle full URLs
      if (/^https?:\/\//i.test(cleaned)) {
        const parsedUrl = new URL(cleaned);
        const host = parsedUrl.hostname.toLowerCase();
        let pathname = parsedUrl.pathname.replace(/^\/+|\/+$/g, '');

        if (host.includes('console.apify.com')) {
          // e.g. console.apify.com/actors/kVYdvNOefemtiDXO5/info/readme
          const parts = pathname.split('/');
          const actorsIdx = parts.indexOf('actors');
          if (actorsIdx !== -1 && parts[actorsIdx + 1]) {
            cleaned = parts[actorsIdx + 1];
          } else {
            cleaned = parts[parts.length - 1];
          }
        } else if (host.includes('apify.com')) {
          // e.g. apify.com/clearpath/shopify-store-leads/pricing?fpr=123
          const parts = pathname.split('/');
          // Filter out sub-pages
          const subPageKeywords = new Set([
            'input-schema',
            'api',
            'pricing',
            'runs',
            'builds',
            'issues',
            'changelog',
            'integrations',
            'source-code'
          ]);

          const filteredParts = parts.filter((p) => !subPageKeywords.has(p.toLowerCase()));
          if (filteredParts.length >= 2) {
            cleaned = `${filteredParts[0]}~${filteredParts[1]}`;
          } else if (filteredParts.length === 1) {
            cleaned = filteredParts[0];
          }
        }
      }

      // Handle slash to tilde normalization (e.g. "clearpath/shopify-store-leads" -> "clearpath~shopify-store-leads")
      cleaned = cleaned.replace(/^actors\//i, '').replace(/\/+$/, '');
      if (cleaned.includes('/') && !cleaned.includes('~')) {
        const parts = cleaned.split('/');
        if (parts.length === 2) {
          cleaned = `${parts[0].trim()}~${parts[1].trim()}`;
        }
      }

      // Remove query parameters or hash remnants
      cleaned = cleaned.split('?')[0].split('#')[0].trim();

      // Validation check
      if (!cleaned || cleaned.length < 2) {
        return {
          originalInput: raw,
          normalizedActorId: '',
          isValid: false,
          error: 'Could not extract valid Actor identifier or slug from link.'
        };
      }

      // Check if username~name format
      let username: string | undefined;
      let actorName: string | undefined;
      if (cleaned.includes('~')) {
        const [u, a] = cleaned.split('~');
        username = u;
        actorName = a;
      }

      // Check duplicate in database if requested
      let existing: { slug: string } | undefined;
      if (checkDb) {
        try {
          const db = getDatabase();
          existing = db.prepare(`
            SELECT slug FROM extraction_marketplace_products 
            WHERE json_extract(definition_json, '$.provider.actor_id') = ?
               OR slug = ?
               OR json_extract(definition_json, '$.provider.actor_id') LIKE ?
          `).get(cleaned, cleaned, `%${cleaned}%`) as { slug: string } | undefined;
        } catch {}
      }

      return {
        originalInput: raw,
        normalizedActorId: cleaned,
        username,
        actorName,
        isValid: true,
        isDuplicate: Boolean(existing),
        existingProductSlug: existing?.slug
      };
    } catch (err: any) {
      return {
        originalInput: raw,
        normalizedActorId: '',
        isValid: false,
        error: err.message || 'Failed to parse link.'
      };
    }
  }

  /**
   * Parse multiple links pasted in a batch (separated by newlines, commas, semicolons, or array)
   */
  public static parseBatch(multiLineInput: string | string[]): ParsedActorRef[] {
    const rawTokens = Array.isArray(multiLineInput)
      ? multiLineInput.map((t) => (t || '').trim()).filter(Boolean)
      : (multiLineInput || '')
          .split(/[\r\n,;]+/)
          .map((t) => t.trim())
          .filter(Boolean);

    const seenIds = new Set<string>();
    const results: ParsedActorRef[] = [];

    for (const token of rawTokens) {
      const parsed = this.parseActorRef(token);
      if (parsed.isValid) {
        if (seenIds.has(parsed.normalizedActorId)) {
          results.push({
            ...parsed,
            isDuplicate: true,
            error: 'Duplicate link in current batch'
          });
          continue;
        }
        seenIds.add(parsed.normalizedActorId);
      }
      results.push(parsed);
    }

    return results;
  }
}
