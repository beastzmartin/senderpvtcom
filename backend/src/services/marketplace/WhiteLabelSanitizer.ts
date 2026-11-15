import { Request, Response, NextFunction } from 'express';

export class WhiteLabelSanitizer {
  // Regex patterns targeting any upstream provider URLs, console links, or identifiers
  private static readonly PROVIDER_URL_REGEX = /https?:\/\/(?:[a-zA-Z0-9-]+\.)*(?:apify\.com|apify-uploads\.s3[a-zA-Z0-9-]*\.amazonaws\.com)[^\s"'<>)]*/gi;
  private static readonly PROVIDER_APIFY_REGEX = /apify/gi;
  private static readonly PROVIDER_ACTOR_REGEX = /\b(actors?)\b/gi;

  /**
   * Recursively sanitizes any string, object or array to ensure zero provider references
   */
  public static sanitizeData<T>(data: T): T {
    if (data === null || data === undefined) {
      return data;
    }

    if (typeof data === 'string') {
      let cleaned = data.replace(this.PROVIDER_URL_REGEX, '[secure-resource]');
      cleaned = cleaned.replace(this.PROVIDER_APIFY_REGEX, 'cloud-service');
      cleaned = cleaned.replace(this.PROVIDER_ACTOR_REGEX, (match) => {
        const lower = match.toLowerCase();
        return lower === 'actors' ? 'engines' : 'engine';
      });
      return cleaned as unknown as T;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.sanitizeData(item)) as unknown as T;
    }

    if (typeof data === 'object') {
      const sanitizedObj: Record<string, any> = {};
      for (const [key, value] of Object.entries(data as Record<string, any>)) {
        const lowerKey = key.toLowerCase();
        // Strip sensitive internal fields and provider keys from customer objects
        if (
          lowerKey.includes('apify') ||
          lowerKey.includes('actor') ||
          key === 'provider_run_id' ||
          key === 'provider_dataset_id' ||
          key === 'provider_cost_usd' ||
          key === 'actor_id' ||
          key === 'actorExecutionId' ||
          key === 'provider'
        ) {
          continue;
        }
        sanitizedObj[key] = this.sanitizeData(value);
      }
      return sanitizedObj as T;
    }

    return data;
  }

  public static cleanText(text: string): string {
    return this.sanitizeData(text);
  }

  public static cleanObject<T>(obj: T): T {
    return this.sanitizeData(obj);
  }

  public static cleanCustomerProduct(product: any): any {
    const sanitized = JSON.parse(JSON.stringify(this.sanitizeData(product)));
    if (sanitized && typeof sanitized === 'object') {
      delete sanitized.provider;
      if (sanitized.input) {
        delete sanitized.input.static_overrides;
        delete sanitized.input.hidden_defaults;
      }
      if (sanitized.pricing?.provider_cost_reference) {
        delete sanitized.pricing.provider_cost_reference;
      }
    }
    return sanitized;
  }

  /**
   * Express middleware for customer API routes that intercepts res.json
   * and guarantees that zero provider branding or raw URLs ever leak.
   */
  public static middleware() {
    return (_req: Request, res: Response, next: NextFunction) => {
      const originalJson = res.json.bind(res);

      res.json = (body: any) => {
        // Sanitize body before sending response
        const sanitized = WhiteLabelSanitizer.sanitizeData(body);
        return originalJson(sanitized);
      };

      next();
    };
  }

  /**
   * Scans text or objects for blocked provider terms
   */
  public static detectLeaks(textOrObj: any): { hasLeak: boolean; matches: string[] } {
    const str = typeof textOrObj === 'string' ? textOrObj : JSON.stringify(textOrObj);
    const matches: string[] = [];
    if (/apify\.com/i.test(str)) matches.push('apify.com');
    if (/api\.apify/i.test(str)) matches.push('api.apify');
    if (/\bapify\b/i.test(str)) matches.push('apify');
    return {
      hasLeak: matches.length > 0,
      matches
    };
  }
}
