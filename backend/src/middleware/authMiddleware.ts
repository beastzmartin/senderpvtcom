import { Request, Response, NextFunction } from 'express';
import { LicenseService } from '../services/licenseService.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: string;
    name?: string;
    plan_tier?: string;
    daily_message_limit?: number;
    daily_extraction_limit?: number;
    max_devices?: number;
    allowed_pages?: string[] | null;
  };
}

/**
 * Strict License-Key Verification Middleware for Desktop Edition.
 * Replaces old multi-user JWT authentication. Grants full access once a valid license is active.
 */
export function requireActiveLicense(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const licenseService = LicenseService.getInstance();
  const status = licenseService.getActiveLicense();

  if (!status.active) {
    res.status(403).json({
      error: 'Software not activated or license expired. Please enter a valid license key.',
      license_required: true,
      reason: status.reason || 'No active license found',
      hwid: status.hwid
    });
    return;
  }

  // Ensure and fetch local user details
  const localUser = licenseService.getOrCreateLocalUser({
    plan_tier: status.license?.plan_tier,
    daily_message_limit: status.license?.daily_message_limit,
    daily_extraction_limit: status.license?.daily_extraction_limit,
    max_devices: status.license?.max_devices,
    expires_at: status.license?.expires_at,
    license_key: status.license?.license_key
  });

  req.user = {
    id: localUser.id,
    username: localUser.username,
    role: 'admin', // In desktop standalone edition, local user has full administrative privileges
    name: localUser.name,
    plan_tier: status.license?.plan_tier || 'enterprise',
    daily_message_limit: status.license?.daily_message_limit || 10000,
    daily_extraction_limit: status.license?.daily_extraction_limit || 10000,
    max_devices: status.license?.max_devices || 10,
    allowed_pages: null // Full access to all modules
  };

  next();
}

// Alias requireAuth to requireActiveLicense for seamless drop-in backwards compatibility across all route files
export const requireAuth = requireActiveLicense;

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  // On desktop edition, the workstation operator is always the administrator
  next();
}

/**
 * Optional auth middleware: sets req.user if active license is present, continues either way
 */
export function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const licenseService = LicenseService.getInstance();
  const status = licenseService.getActiveLicense();

  if (status.active) {
    const localUser = licenseService.getOrCreateLocalUser({
      plan_tier: status.license?.plan_tier,
      daily_message_limit: status.license?.daily_message_limit,
      daily_extraction_limit: status.license?.daily_extraction_limit,
      max_devices: status.license?.max_devices,
      expires_at: status.license?.expires_at,
      license_key: status.license?.license_key
    });

    req.user = {
      id: localUser.id,
      username: localUser.username,
      role: 'admin',
      name: localUser.name,
      plan_tier: status.license?.plan_tier || 'enterprise',
      daily_message_limit: status.license?.daily_message_limit || 10000,
      daily_extraction_limit: status.license?.daily_extraction_limit || 10000,
      max_devices: status.license?.max_devices || 10,
      allowed_pages: null
    };
  }
  next();
}

