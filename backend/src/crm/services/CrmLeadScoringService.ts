import { getCrmDb } from '../db/index.js';
import { Contact, CrmScoringRule, FilterGroup } from '../models/types.js';

export interface ScoreBreakdownItem {
  rule: string;
  rule_type: string;
  points: number;
  matched: boolean;
  reason: string;
}

export interface LeadScoreResult {
  contact_id: string;
  score: number;
  lead_status: 'hot' | 'warm' | 'cold';
  breakdown: ScoreBreakdownItem[];
  scored_at: string;
}

export class CrmLeadScoringService {
  private static instance: CrmLeadScoringService | null = null;

  public static getInstance(): CrmLeadScoringService {
    if (!CrmLeadScoringService.instance) {
      CrmLeadScoringService.instance = new CrmLeadScoringService();
    }
    return CrmLeadScoringService.instance;
  }

  /**
   * Evaluates rules against a single contact, persists the lead_score, and returns the breakdown
   */
  public async scoreContact(workspaceId: string, contactId: string): Promise<LeadScoreResult> {
    const storage = getCrmDb();
    const contact = await storage.getContact(workspaceId, contactId);
    if (!contact) {
      throw new Error(`Contact ${contactId} not found`);
    }

    const rules = await storage.listScoringRules(workspaceId);
    const activeRules = rules.filter((r: CrmScoringRule) => r.is_active);

    const activities = await storage.listActivities(workspaceId, contactId, 10);
    const latestActivity = activities.length > 0 ? activities[0] : null;

    let totalScore = 20; // baseline score
    const breakdown: ScoreBreakdownItem[] = [
      {
        rule: 'Base Starting Score',
        rule_type: 'baseline',
        points: 20,
        matched: true,
        reason: 'Initial baseline for lead evaluation'
      }
    ];

    for (const rule of activeRules) {
      const matchResult = this.evaluateRule(rule, contact, latestActivity);
      if (matchResult.matched) {
        totalScore += rule.points_change;
      }
      breakdown.push({
        rule: rule.name,
        rule_type: rule.rule_type,
        points: rule.points_change,
        matched: matchResult.matched,
        reason: matchResult.reason
      });
    }

    // Clamp score strictly between 0 and 100
    const finalScore = Math.max(0, Math.min(100, Math.round(totalScore)));

    // Categorize
    let leadStatus: 'hot' | 'warm' | 'cold' = 'warm';
    if (finalScore >= 75) leadStatus = 'hot';
    else if (finalScore < 40) leadStatus = 'cold';

    // Update contact record with new lead_score and touch updated_at
    await storage.updateContact(workspaceId, contactId, {
      lead_score: finalScore
    });

    return {
      contact_id: contactId,
      score: finalScore,
      lead_status: leadStatus,
      breakdown,
      scored_at: new Date().toISOString()
    };
  }

  /**
   * Batch scores all contacts matching an optional filter group
   */
  public async batchScoreContacts(
    workspaceId: string,
    filter?: FilterGroup,
    limit: number = 500
  ): Promise<{ scored_count: number; avg_score: number; distribution: { hot: number; warm: number; cold: number } }> {
    const storage = getCrmDb();
    const result = await storage.listContacts(workspaceId, {
      filter,
      pagination: { limit }
    });

    let totalScoreSum = 0;
    const distribution = { hot: 0, warm: 0, cold: 0 };

    for (const contact of result.data) {
      const res = await this.scoreContact(workspaceId, contact.id);
      totalScoreSum += res.score;
      distribution[res.lead_status]++;
    }

    const scoredCount = result.data.length;
    const avgScore = scoredCount > 0 ? Math.round(totalScoreSum / scoredCount) : 0;

    return {
      scored_count: scoredCount,
      avg_score: avgScore,
      distribution
    };
  }

  /**
   * Evaluates individual scoring rule criteria
   */
  private evaluateRule(
    rule: CrmScoringRule,
    contact: Contact,
    latestActivity: any
  ): { matched: boolean; reason: string } {
    const criteria = rule.criteria || {};

    switch (rule.rule_type) {
      case 'icp_title': {
        const titles: string[] = criteria.titles || ['CEO', 'CTO', 'Founder', 'Director', 'VP'];
        const currentTitle = (contact.title || '').toLowerCase();
        if (!currentTitle) return { matched: false, reason: 'No job title defined' };

        const matchedTitle = titles.find((t) => currentTitle.includes(t.toLowerCase()));
        if (matchedTitle) {
          return { matched: true, reason: `Matched ICP title keyword: "${matchedTitle}"` };
        }
        return { matched: false, reason: `Job title "${contact.title}" did not match target ICP titles` };
      }

      case 'country_tier': {
        const countries: string[] = criteria.countries || ['United States', 'USA', 'India', 'United Kingdom', 'Canada', 'UAE'];
        const contactCountry = (contact.country || '').trim().toLowerCase();
        if (!contactCountry) return { matched: false, reason: 'No country defined' };

        const matchedCountry = countries.find((c) => contactCountry.includes(c.toLowerCase()) || c.toLowerCase().includes(contactCountry));
        if (matchedCountry) {
          return { matched: true, reason: `Located in Tier 1 market (${matchedCountry})` };
        }
        return { matched: false, reason: `Country "${contact.country}" not in Tier 1 list` };
      }

      case 'verified_email': {
        const targetStatus = criteria.email_status || 'valid';
        if (contact.email_status === targetStatus) {
          return { matched: true, reason: `Email verification passed status: ${targetStatus}` };
        }
        if (contact.email && contact.email_status !== 'invalid') {
          return { matched: true, reason: 'Valid email format available' };
        }
        return { matched: false, reason: `Email is missing or unverified (${contact.email_status || 'unknown'})` };
      }

      case 'phone_present': {
        const hasPhone = !!(contact.phone || contact.phone_e164);
        if (hasPhone) {
          return { matched: true, reason: 'Direct contact phone number is present' };
        }
        return { matched: false, reason: 'No phone number available' };
      }

      case 'activity_recency': {
        const withinDays = criteria.within_days || 7;
        if (!latestActivity) return { matched: false, reason: 'No recorded interactions' };

        const activityTime = new Date(latestActivity.created_at).getTime();
        const diffDays = (Date.now() - activityTime) / (1000 * 60 * 60 * 24);
        if (diffDays <= withinDays) {
          return { matched: true, reason: `Active within last ${Math.round(diffDays)} day(s)` };
        }
        return { matched: false, reason: `Last interaction was ${Math.round(diffDays)} days ago` };
      }

      case 'time_decay': {
        const inactiveDays = criteria.inactive_days || 30;
        const lastActionTime = latestActivity ? new Date(latestActivity.created_at).getTime() : new Date(contact.updated_at).getTime();
        const diffDays = (Date.now() - lastActionTime) / (1000 * 60 * 60 * 24);
        if (diffDays >= inactiveDays) {
          return { matched: true, reason: `No outbound engagement for ${Math.round(diffDays)} days (inactivity penalty)` };
        }
        return { matched: false, reason: `Contact is actively refreshed within ${inactiveDays} days` };
      }

      default:
        return { matched: false, reason: 'Unknown rule criteria' };
    }
  }
}
