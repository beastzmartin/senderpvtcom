import { getCrmDb } from '../db/index.js';
import { Contact, DuplicateCandidate, SurvivorshipStrategy } from '../models/types.js';
import { CrmNormalizer } from './crmNormalizer.js';

export interface ScanDuplicatesOptions {
  autoMergeThreshold?: number; // e.g. 95
  reviewThreshold?: number; // e.g. 70
  survivorshipStrategy?: SurvivorshipStrategy;
  limit?: number;
}

export class CrmIdentityService {
  private static instance: CrmIdentityService | null = null;

  public static getInstance(): CrmIdentityService {
    if (!CrmIdentityService.instance) {
      CrmIdentityService.instance = new CrmIdentityService();
    }
    return CrmIdentityService.instance;
  }

  /**
   * Trigram String Similarity algorithm (0.0 to 1.0)
   */
  public calculateTrigramSimilarity(str1: string, str2: string): number {
    const s1 = (str1 || '').toLowerCase().trim();
    const s2 = (str2 || '').toLowerCase().trim();
    if (!s1 || !s2) return 0;
    if (s1 === s2) return 1.0;

    const getTrigrams = (s: string): Set<string> => {
      const padded = `  ${s} `;
      const trigrams = new Set<string>();
      for (let i = 0; i < padded.length - 2; i++) {
        trigrams.add(padded.slice(i, i + 3));
      }
      return trigrams;
    };

    const t1 = getTrigrams(s1);
    const t2 = getTrigrams(s2);
    let intersection = 0;

    for (const t of t1) {
      if (t2.has(t)) intersection++;
    }

    return (2.0 * intersection) / (t1.size + t2.size);
  }

  /**
   * Evaluate match confidence between two contacts (0 - 100)
   */
  public evaluateMatchConfidence(c1: Contact, c2: Contact): { score: number; reasons: string[] } {
    const reasons: string[] = [];
    let score = 0;

    // Exact email match
    if (c1.email_normalized && c2.email_normalized && c1.email_normalized === c2.email_normalized) {
      score = 98;
      reasons.push('exact_email_match');
      return { score, reasons };
    }

    // Exact phone match (E.164)
    if (c1.phone_e164 && c2.phone_e164 && c1.phone_e164 === c2.phone_e164) {
      score += 85;
      reasons.push('exact_phone_e164_match');
    }

    // Name similarity
    const name1 = `${c1.first_name || ''} ${c1.last_name || ''}`.trim();
    const name2 = `${c2.first_name || ''} ${c2.last_name || ''}`.trim();
    let nameSim = 0;
    if (name1 && name2) {
      nameSim = this.calculateTrigramSimilarity(name1, name2);
      if (nameSim >= 0.85) {
        score += Math.round(nameSim * 45);
        reasons.push(`high_name_similarity_${Math.round(nameSim * 100)}%`);
      } else if (nameSim >= 0.65) {
        score += Math.round(nameSim * 25);
        reasons.push(`moderate_name_similarity_${Math.round(nameSim * 100)}%`);
      }
    }

    // Company match
    let compSim = 0;
    if (c1.company_name && c2.company_name) {
      compSim = this.calculateTrigramSimilarity(c1.company_name, c2.company_name);
      if (compSim >= 0.85) {
        score += 35;
        reasons.push('matching_company');
      }
    }

    // Email username prefix match (e.g. sundar@ vs sundar.pichai@)
    if (c1.email && c2.email) {
      const u1 = c1.email.split('@')[0].replace(/[._-]/g, '');
      const u2 = c2.email.split('@')[0].replace(/[._-]/g, '');
      if (u1 && u2 && (u1.includes(u2) || u2.includes(u1))) {
        score += 20;
        reasons.push('matching_email_handle');
      }
    }

    // Combined high confidence booster (Name >= 90% + Company >= 85%)
    if (nameSim >= 0.90 && compSim >= 0.85) {
      score = Math.max(score, 96);
    }

    const finalScore = Math.min(100, score);
    return { score: finalScore, reasons };
  }

  /**
   * Resolve fields according to golden record survivorship strategy
   */
  public resolveSurvivorship(
    primary: Contact,
    duplicate: Contact,
    strategy: SurvivorshipStrategy = 'most_complete'
  ): Record<string, any> {
    const fields = ['first_name', 'last_name', 'email', 'phone', 'company_id', 'title', 'country', 'city', 'status'];
    const resolved: Record<string, any> = {};

    for (const f of fields) {
      const pVal = (primary as any)[f];
      const dVal = (duplicate as any)[f];

      if (strategy === 'most_recent') {
        const pUpdated = new Date(primary.updated_at || primary.created_at).getTime();
        const dUpdated = new Date(duplicate.updated_at || duplicate.created_at).getTime();
        resolved[f] = (dUpdated > pUpdated && dVal) ? dVal : (pVal || dVal || null);
      } else if (strategy === 'trusted_source') {
        const sourceRank: Record<string, number> = { api: 4, manual: 3, extractor_job: 2, import: 1 };
        const pRank = sourceRank[primary.source] || 0;
        const dRank = sourceRank[duplicate.source] || 0;
        resolved[f] = (dRank > pRank && dVal) ? dVal : (pVal || dVal || null);
      } else {
        // 'most_complete' (default): favor non-null, longer value
        if (!pVal && dVal) {
          resolved[f] = dVal;
        } else if (pVal && dVal && typeof pVal === 'string' && typeof dVal === 'string') {
          resolved[f] = dVal.length > pVal.length ? dVal : pVal;
        } else {
          resolved[f] = pVal || dVal || null;
        }
      }
    }

    resolved.custom_fields = {
      ...(duplicate.custom_fields || {}),
      ...(primary.custom_fields || {})
    };

    return resolved;
  }

  /**
   * Scan workspace contacts for duplicates, auto-merge >= threshold, or queue for review
   */
  public async scanAndResolveDuplicates(
    workspaceId: string,
    options: ScanDuplicatesOptions = {}
  ): Promise<{
    candidates_found: number;
    auto_merged: number;
    queued_for_review: number;
  }> {
    const db = getCrmDb();
    const autoMergeThreshold = options.autoMergeThreshold ?? 95;
    const reviewThreshold = options.reviewThreshold ?? 70;
    const survivorship = options.survivorshipStrategy ?? 'most_complete';
    const limit = options.limit ?? 200;

    const listRes = await db.listContacts(workspaceId, { pagination: { limit } });
    const contacts = listRes.data;

    let candidatesFound = 0;
    let autoMerged = 0;
    let queuedForReview = 0;

    for (let i = 0; i < contacts.length; i++) {
      for (let j = i + 1; j < contacts.length; j++) {
        const c1 = contacts[i];
        const c2 = contacts[j];

        const { score, reasons } = this.evaluateMatchConfidence(c1, c2);

        if (score >= reviewThreshold) {
          candidatesFound++;

          if (score >= autoMergeThreshold) {
            // Auto-merge with survivorship rules
            const resolvedFields = this.resolveSurvivorship(c1, c2, survivorship);
            await db.mergeContacts(workspaceId, c1.id, c2.id, resolvedFields);

            await db.saveDuplicateCandidate(workspaceId, {
              primary_contact_id: c1.id,
              duplicate_contact_id: c2.id,
              confidence_score: score,
              match_reasons: reasons,
              status: 'auto_merged'
            });

            autoMerged++;
          } else {
            // Queue for manual review
            await db.saveDuplicateCandidate(workspaceId, {
              primary_contact_id: c1.id,
              duplicate_contact_id: c2.id,
              confidence_score: score,
              match_reasons: reasons,
              status: 'pending_review'
            });

            queuedForReview++;
          }
        }
      }
    }

    return {
      candidates_found: candidatesFound,
      auto_merged: autoMerged,
      queued_for_review: queuedForReview
    };
  }

  /**
   * Manual Merge with chosen primary, duplicate and optional field overrides
   */
  public async manualMerge(
    workspaceId: string,
    primaryId: string,
    duplicateId: string,
    fieldOverrides?: Record<string, any>,
    strategy: SurvivorshipStrategy = 'most_complete'
  ): Promise<Contact> {
    const db = getCrmDb();
    const primary = await db.getContact(workspaceId, primaryId);
    const duplicate = await db.getContact(workspaceId, duplicateId);
    if (!primary || !duplicate) throw new Error('Primary or duplicate contact not found');

    const resolved = this.resolveSurvivorship(primary, duplicate, strategy);
    const finalFields = { ...resolved, ...(fieldOverrides || {}) };

    const merged = await db.mergeContacts(workspaceId, primaryId, duplicateId, finalFields);

    // Update any candidate status
    const candidates = await db.listDuplicateCandidates(workspaceId, 'pending_review', 100);
    const candidate = candidates.find(
      (c) =>
        (c.primary_contact_id === primaryId && c.duplicate_contact_id === duplicateId) ||
        (c.primary_contact_id === duplicateId && c.duplicate_contact_id === primaryId)
    );
    if (candidate) {
      await db.updateDuplicateCandidateStatus(workspaceId, candidate.id, 'manual_merged', 'user');
    }

    return merged;
  }

  /**
   * 1-Click UNMERGE to restore merged contact
   */
  public async unmerge(workspaceId: string, mergeId: string): Promise<boolean> {
    const db = getCrmDb();
    return db.unmergeContacts(workspaceId, mergeId);
  }
}
