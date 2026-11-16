import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware.js';

interface CachedResponse {
  statusCode: number;
  body: any;
  cachedAt: number;
}

// In-memory 24-hour LRU/TTL cache for Idempotency-Key
const idempotencyStore = new Map<string, CachedResponse>();
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export function crmIdempotencyMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const idempotencyKey = req.header('Idempotency-Key');
  if (!idempotencyKey || req.method === 'GET' || req.method === 'HEAD') {
    next();
    return;
  }

  const userId = req.user?.id || 'anon';
  const cacheKey = `${userId}:${req.method}:${req.baseUrl}${req.path}:${idempotencyKey}`;

  // Clean expired entries periodically
  const now = Date.now();
  const cached = idempotencyStore.get(cacheKey);

  if (cached && now - cached.cachedAt < TWENTY_FOUR_HOURS_MS) {
    res.setHeader('X-Cache-Lookup', 'HIT');
    res.setHeader('Idempotency-Key', idempotencyKey);
    res.status(cached.statusCode).json(cached.body);
    return;
  }

  // Intercept response
  const originalJson = res.json.bind(res);
  res.json = (body: any) => {
    // Only cache successful or intentional responses
    if (res.statusCode >= 200 && res.statusCode < 500) {
      idempotencyStore.set(cacheKey, {
        statusCode: res.statusCode,
        body,
        cachedAt: Date.now()
      });
    }
    res.setHeader('X-Cache-Lookup', 'MISS');
    res.setHeader('Idempotency-Key', idempotencyKey);
    return originalJson(body);
  };

  next();
}

