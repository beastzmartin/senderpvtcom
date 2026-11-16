/**
 * CRM V2: Entitlement & Hard Limits Engine (Race-Condition-Free)
 * Enforces atomic row-level limits across contacts, boards, super fields,
 * tags, team members, automations, and API calls.
 */

import { BillingResourceType, QuotaCheckResult } from '../models/types.js';
import { CrmStorageAdapter } from '../db/CrmStorageAdapter.js';

export class CrmEntitlementService {
  /**
   * Check if workspace has sufficient quota and atomically consume it.
   * Eliminates check-then-act race conditions across concurrent requests.
   */
  public static async checkAndConsumeQuota(
    storage: CrmStorageAdapter,
    workspaceId: string,
    resourceType: BillingResourceType | string,
    quantity: number = 1
  ): Promise<QuotaCheckResult> {
    // 1. Check if subscription is expired (Read-Only Mode)
    const sub = await storage.getActiveSubscription(workspaceId);
    if (sub) {
      const now = new Date();
      const expiresAt = new Date(sub.ends_at);
      const graceEndsAt = sub.grace_ends_at ? new Date(sub.grace_ends_at) : expiresAt;

      if (now > graceEndsAt && sub.status === 'expired') {
        return {
          allowed: false,
          resource_type: resourceType,
          used_count: 0,
          quota_limit: 0,
          remaining: 0,
          rejection_reason: `Workspace subscription has expired. Workspace is in READ-ONLY mode. Please top up your wallet to renew.`
        };
      }
    }

    // 2. Determine default quota limit if counter not yet initialized
    let defaultQuota = 1000;
    if (sub?.plan) {
      if (resourceType === 'contacts') defaultQuota = sub.custom_quotas?.contacts ?? sub.plan.quota_contacts;
      else if (resourceType === 'boards') defaultQuota = sub.custom_quotas?.boards ?? sub.plan.quota_boards;
      else if (resourceType === 'super_fields') defaultQuota = sub.custom_quotas?.super_fields ?? sub.plan.quota_super_fields;
      else if (resourceType === 'tags') defaultQuota = sub.custom_quotas?.tags ?? sub.plan.quota_tags;
      else if (resourceType === 'team_seats') defaultQuota = sub.custom_quotas?.team_seats ?? sub.plan.quota_team_seats;
      else if (resourceType === 'automations') defaultQuota = sub.custom_quotas?.automations ?? sub.plan.quota_automations_per_month;
      else if (resourceType === 'api_calls') defaultQuota = sub.custom_quotas?.api_calls ?? sub.plan.quota_api_calls_per_month;
    }

    // 3. Atomically consume quota via storage adapter
    const result = await storage.consumeQuotaAtomic(workspaceId, resourceType, quantity, defaultQuota);

    if (!result.success) {
      return {
        allowed: false,
        resource_type: resourceType,
        used_count: result.used_count,
        quota_limit: result.quota_limit,
        remaining: Math.max(0, result.quota_limit - result.used_count),
        rejection_reason: `Hard quota limit reached for '${resourceType}'. Used: ${result.used_count}, Limit: ${result.quota_limit}. Please upgrade your plan or purchase an add-on pack.`
      };
    }

    return {
      allowed: true,
      resource_type: resourceType,
      used_count: result.used_count,
      quota_limit: result.quota_limit,
      remaining: result.quota_limit === -1 ? 999999999 : Math.max(0, result.quota_limit - result.used_count)
    };
  }

  /**
   * Check read-only status for a workspace
   */
  public static async isWorkspaceReadOnly(storage: CrmStorageAdapter, workspaceId: string): Promise<boolean> {
    const sub = await storage.getActiveSubscription(workspaceId);
    if (!sub) return false; // Default free tier or unmanaged
    if (sub.status === 'suspended' || sub.status === 'cancelled') return true;

    if (sub.status === 'expired') {
      const now = new Date();
      const grace = sub.grace_ends_at ? new Date(sub.grace_ends_at) : new Date(sub.ends_at);
      if (now > grace) return true;
    }
    return false;
  }

  /**
   * Split bulk items to respect remaining quota (Partial Acceptance)
   */
  public static calculateBulkImportQuotaSlice<T>(
    items: T[],
    currentUsed: number,
    quotaLimit: number,
    policy: 'partial_accept' | 'reject_batch' = 'partial_accept'
  ): { accepted: T[]; rejected: T[]; totalAttempted: number } {
    if (quotaLimit === -1) {
      return { accepted: items, rejected: [], totalAttempted: items.length };
    }

    const remaining = Math.max(0, quotaLimit - currentUsed);
    if (items.length <= remaining) {
      return { accepted: items, rejected: [], totalAttempted: items.length };
    }

    if (policy === 'reject_batch') {
      return { accepted: [], rejected: items, totalAttempted: items.length };
    }

    // Partial accept
    return {
      accepted: items.slice(0, remaining),
      rejected: items.slice(remaining),
      totalAttempted: items.length
    };
  }
}
