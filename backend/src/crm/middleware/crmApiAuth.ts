import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getCrmDb } from '../db/index.js';
import { CrmApiKey, ApiKeyScope } from '../models/types.js';
import { WalletService } from '../../services/walletService.js';

export interface CrmApiRequest extends Request {
  crmApiKey?: CrmApiKey;
  crmWorkspaceId?: string;
  crmUserId?: string;
  crmCreditCost?: number;
}

// In-Memory Token Bucket Rate Limiter
interface TokenBucket {
  tokens: number;
  lastRefill: number;
}
const rateLimitBuckets = new Map<string, TokenBucket>();

// Idempotency cache: key -> { statusCode, body, headers }
const idempotencyCache = new Map<string, { statusCode: number; body: any; timestamp: number }>();

export function requireCrmApiKey(requiredScope?: ApiKeyScope) {
  return async (req: CrmApiRequest, res: Response, next: NextFunction): Promise<void> => {
    const rawKey = (req.header('X-API-Key') || req.header('x-api-key') || req.header('Authorization')?.replace('Bearer ', ''))?.trim();

    if (!rawKey || !rawKey.startsWith('crm_')) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Valid CRM API key required. Pass via X-API-Key header or Authorization: Bearer <key>.'
      });
      return;
    }

    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const db = getCrmDb();
    const apiKey = await db.getApiKeyByHash(keyHash);

    if (!apiKey) {
      res.status(401).json({
        error: 'INVALID_API_KEY',
        message: 'The provided API key is invalid or has been revoked.'
      });
      return;
    }

    // Check scope if required
    if (requiredScope && !apiKey.scopes.includes(requiredScope)) {
      res.status(403).json({
        error: 'INSUFFICIENT_SCOPE',
        message: `This endpoint requires the scope "${requiredScope}". Your key possesses: ${apiKey.scopes.join(', ')}.`
      });
      return;
    }

    // Token Bucket Rate Limiting
    const now = Date.now();
    const maxRpm = apiKey.rate_limit_rpm || 600;
    const bucketKey = apiKey.id;
    let bucket = rateLimitBuckets.get(bucketKey);

    if (!bucket) {
      bucket = { tokens: maxRpm, lastRefill: now };
      rateLimitBuckets.set(bucketKey, bucket);
    } else {
      const elapsedSeconds = (now - bucket.lastRefill) / 1000;
      const refillAmount = elapsedSeconds * (maxRpm / 60);
      bucket.tokens = Math.min(maxRpm, bucket.tokens + refillAmount);
      bucket.lastRefill = now;
    }

    if (bucket.tokens < 1) {
      res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: `Rate limit of ${maxRpm} requests per minute exceeded. Please back off and retry.`,
        retry_after_seconds: 2
      });
      return;
    }
    bucket.tokens -= 1;

    // Monthly Quota Check
    if (apiKey.monthly_usage >= apiKey.monthly_quota) {
      res.status(429).json({
        error: 'MONTHLY_QUOTA_EXCEEDED',
        message: `Monthly API quota of ${apiKey.monthly_quota} calls has been reached for this key.`
      });
      return;
    }

    // Wallet & Credit Balance Check
    const walletService = WalletService.getInstance();
    const userWallet = walletService.getOrCreateWallet(apiKey.user_id);
    const estimatedCost = 0.05; // Base API call cost (₹0.05 / $0.0006)

    if (userWallet.balance < estimatedCost && !apiKey.is_test) {
      res.status(402).json({
        error: 'INSUFFICIENT_CREDITS',
        message: `Insufficient platform wallet balance. Please top up your wallet credits to continue using the API.`,
        current_balance: userWallet.balance,
        currency: userWallet.currency
      });
      return;
    }

    // Idempotency-Key support for writes
    const idempotencyKey = req.header('Idempotency-Key');
    if (idempotencyKey && req.method !== 'GET') {
      const cached = idempotencyCache.get(`${apiKey.workspace_id}:${idempotencyKey}`);
      if (cached && (now - cached.timestamp) < 86400000) {
        res.setHeader('X-Idempotent-Replay', 'true');
        res.status(cached.statusCode).json(cached.body);
        return;
      }
    }

    req.crmApiKey = apiKey;
    req.crmWorkspaceId = apiKey.workspace_id;
    req.crmUserId = apiKey.user_id;
    req.crmCreditCost = estimatedCost;

    const startTime = Date.now();

    // Hook response finish to log usage, deduct credits, and cache idempotency
    res.on('finish', async () => {
      const duration = Date.now() - startTime;
      const statusCode = res.statusCode;

      // Charge wallet if successful write or read
      if (!apiKey.is_test && statusCode < 400 && req.crmCreditCost && req.crmCreditCost > 0) {
        try {
          walletService.deduct(
            apiKey.user_id,
            req.crmCreditCost,
            'usage_deduction',
            `CRM REST API Call: ${req.method} ${req.path}`,
            {
              referenceId: `api_${Date.now()}`,
              customData: {
                key_id: apiKey.id,
                workspace_id: apiKey.workspace_id,
                endpoint: `${req.method} ${req.path}`
              }
            }
          );
        } catch {}
      }

      // Update API Key usage stats
      db.updateApiKeyUsage(apiKey.id, 1).catch(() => {});

      // Log to usage table
      db.logApiUsage({
        workspace_id: apiKey.workspace_id,
        api_key_id: apiKey.id,
        endpoint: req.originalUrl || req.path,
        method: req.method,
        status_code: statusCode,
        response_time_ms: duration,
        credits_charged: apiKey.is_test ? 0 : (req.crmCreditCost || 0),
        currency: userWallet.currency,
        ip_address: req.ip || (req.headers['x-forwarded-for'] as string) || null
      }).catch(() => {});
    });

    next();
  };
}

/**
 * Cache an idempotent response
 */
export function cacheIdempotentResponse(workspaceId: string, idempotencyKey: string | undefined, statusCode: number, body: any): void {
  if (!idempotencyKey) return;
  idempotencyCache.set(`${workspaceId}:${idempotencyKey}`, {
    statusCode,
    body,
    timestamp: Date.now()
  });
}
