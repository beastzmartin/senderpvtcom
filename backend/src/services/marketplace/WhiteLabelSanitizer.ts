import { Request, Response, NextFunction } from 'express';

export class WhiteLabelSanitizer {
  // Regex patterns targeting any upstream provider URLs, console links, or identifiers
  private static readonly PROVIDER_URL_REGEX = /https?:\/\/(?:[a-zA-Z0-9-]+\.)*(?:apify\.com|apify-uploads\.s3[a-zA-Z0-9-]*\.amazonaws\.com)[^\s"'<>)]*/gi;
  private static readonly PROVIDER_NAME_REGEX = /\b(apify|actor|actors)\b/gi;

  /**
   * Recursively sanitizes any string, object or array to ensure zero provider references
   */
  public static sanitizeData<T>(data: T): T {
    if (data === null || data === undefined) {
      return data;
    }

    if (typeof data === 'string') {
      let cleaned = data.replace(this.PROVIDER_URL_REGEX, '[secure-resource]');
      cleaned = cleaned.replace(this.PROVIDER_NAME_REGEX, (match) => {
        const lower = match.toLowerCase();
        if (lower === 'actor' || lower === 'actors') return 'extractor';
        return 'cloud-service';
      });
      return cleaned as unknown as T;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.sanitizeData(item)) as unknown as T;
    }

    if (typeof data === 'object') {
      const sanitizedObj: Record<string, any> = {};
      for (const [key, value] of Object.entries(data as Record<string, any>)) {
        // Strip sensitive internal fields from customer objects
        if (
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
}
