import { getCrmDb } from '../db/index.js';
import { DataHealthMetrics } from '../models/types.js';
import { CrmNormalizer } from './crmNormalizer.js';
import { CrmIdentityService } from './CrmIdentityService.js';
import { CrmVerificationPipeline } from './CrmVerificationPipeline.js';

export class CrmDataHealthService {
  private static instance: CrmDataHealthService | null = null;

  public static getInstance(): CrmDataHealthService {
    if (!CrmDataHealthService.instance) {
      CrmDataHealthService.instance = new CrmDataHealthService();
    }
    return CrmDataHealthService.instance;
  }

  public async getHealthDashboard(workspaceId: string): Promise<DataHealthMetrics> {
    const db = getCrmDb();
    return db.getDataHealthMetrics(workspaceId);
  }

  /**
   * One-Click Fix: Clean Whitespace & Normalize E.164 / Emails
   */
  public async cleanAndNormalizeJob(workspaceId: string): Promise<{ examined: number; fixed: number }> {
    const db = getCrmDb();
    const list = await db.listContacts(workspaceId, { pagination: { limit: 1000 } });
    let fixed = 0;

    for (const c of list.data) {
      let needsUpdate = false;
      const updates: any = {};

      const cleanFirst = CrmNormalizer.cleanText(c.first_name);
      if (cleanFirst !== c.first_name) {
        updates.first_name = cleanFirst;
        needsUpdate = true;
      }

      const cleanLast = CrmNormalizer.cleanText(c.last_name);
      if (cleanLast !== c.last_name) {
        updates.last_name = cleanLast;
        needsUpdate = true;
      }

      const normEmail = CrmNormalizer.normalizeEmail(c.email);
      if (normEmail && normEmail !== c.email_normalized) {
        updates.email_normalized = normEmail;
        needsUpdate = true;
      }

      const normPhone = CrmNormalizer.normalizePhone(c.phone);
      if (normPhone && normPhone !== c.phone_e164) {
        updates.phone_e164 = normPhone;
        needsUpdate = true;
      }

      if (needsUpdate) {
        await db.updateContact(workspaceId, c.id, updates);
        fixed++;
      }
    }

    return { examined: list.data.length, fixed };
  }

  /**
   * One-Click Fix: Batch Verify Unverified Emails
   */
  public async batchVerifyEmailsJob(workspaceId: string, limit: number = 200): Promise<{ processed: number; valid: number; invalid: number; risky: number }> {
    const pipeline = CrmVerificationPipeline.getInstance();
    return pipeline.batchVerifyContacts(workspaceId, limit);
  }

  /**
   * One-Click Fix: Auto-Merge High-Confidence Duplicates (>= 95%)
   */
  public async autoMergeDuplicatesJob(workspaceId: string, threshold: number = 95): Promise<{ candidates_found: number; auto_merged: number }> {
    const identityService = CrmIdentityService.getInstance();
    const res = await identityService.scanAndResolveDuplicates(workspaceId, {
      autoMergeThreshold: threshold,
      reviewThreshold: 70,
      survivorshipStrategy: 'most_complete'
    });
    return {
      candidates_found: res.candidates_found,
      auto_merged: res.auto_merged
    };
  }

  /**
   * One-Click Fix: Archive Stale Contacts into Cold Tier (> 365 days)
   */
  public async archiveStaleContactsJob(workspaceId: string, daysInactive: number = 365): Promise<{ archived_count: number }> {
    const db = getCrmDb();
    const list = await db.listContacts(workspaceId, { pagination: { limit: 1000 } });
    const cutoff = Date.now() - daysInactive * 86400 * 1000;
    let archivedCount = 0;

    for (const c of list.data) {
      if (c.is_archived) continue;
      const lastActive = new Date(c.updated_at || c.created_at).getTime();
      if (lastActive < cutoff) {
        await db.archiveContact(workspaceId, c.id);
        archivedCount++;
      }
    }

    return { archived_count: archivedCount };
  }
}

