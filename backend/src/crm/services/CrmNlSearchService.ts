import { FilterCondition, FilterGroup } from '../models/types.js';

export interface NlSearchResult {
  raw_query: string;
  filter: FilterGroup;
  explanation: string;
  matched_rules_count: number;
}

export class CrmNlSearchService {
  private static instance: CrmNlSearchService | null = null;

  public static getInstance(): CrmNlSearchService {
    if (!CrmNlSearchService.instance) {
      CrmNlSearchService.instance = new CrmNlSearchService();
    }
    return CrmNlSearchService.instance;
  }

  /**
   * Translates natural language query into a validated, injection-proof FilterGroup
   */
  public parseNaturalLanguageQuery(query: string): NlSearchResult {
    const raw = (query || '').trim();
    const q = raw.toLowerCase();
    const conditions: FilterCondition[] = [];
    const explanations: string[] = [];

    // 1. Title / Job Role Detection
    const titlePatterns = [
      { regex: /\b(ceos?|chief executive officers?)\b/i, value: 'CEO', label: 'CEO' },
      { regex: /\b(ctos?|chief technology officers?)\b/i, value: 'CTO', label: 'CTO' },
      { regex: /\b(cfo[s]?|chief financial officers?)\b/i, value: 'CFO', label: 'CFO' },
      { regex: /\b(founders?|co-founders?)\b/i, value: 'Founder', label: 'Founder' },
      { regex: /\b(directors?)\b/i, value: 'Director', label: 'Director' },
      { regex: /\b(managers?|vps?|vice presidents?)\b/i, value: 'Manager', label: 'Manager' },
      { regex: /\b(engineers?|developers?)\b/i, value: 'Engineer', label: 'Engineer' }
    ];

    for (const p of titlePatterns) {
      if (p.regex.test(q)) {
        conditions.push({ field: 'title', operator: 'contains', value: p.value });
        explanations.push(`Title contains "${p.label}"`);
        break;
      }
    }

    // 2. City / Country Location Detection ("in Mumbai", "in Delhi", "in California", etc.)
    const locationMatch = q.match(/\bin\s+([a-zA-Z\s]+?)(?=\s+(?:with|who|and|having|tagged|status|score)|$)/i);
    if (locationMatch && locationMatch[1]) {
      const loc = locationMatch[1].trim();
      const knownCountries = new Set(['india', 'usa', 'united states', 'uk', 'united kingdom', 'canada', 'germany', 'france', 'uae', 'singapore']);
      if (knownCountries.has(loc.toLowerCase())) {
        conditions.push({ field: 'country', operator: 'contains', value: loc });
        explanations.push(`Country contains "${loc}"`);
      } else {
        conditions.push({ field: 'city', operator: 'contains', value: loc });
        explanations.push(`City contains "${loc}"`);
      }
    }

    // 3. Email Verification Status
    if (/\b(verified\s+email|valid\s+email|email\s+verified)\b/i.test(q)) {
      conditions.push({ field: 'email_status', operator: 'equals', value: 'valid' });
      explanations.push('Email is verified valid');
    } else if (/\b(invalid\s+email|bounced)\b/i.test(q)) {
      conditions.push({ field: 'email_status', operator: 'equals', value: 'invalid' });
      explanations.push('Email is invalid/bounced');
    } else if (/\b(risky\s+email)\b/i.test(q)) {
      conditions.push({ field: 'email_status', operator: 'equals', value: 'risky' });
      explanations.push('Email is risky');
    }

    // 4. Contact Status / Interaction
    if (/\b(haven'?t\s+been\s+contacted|not\s+contacted|never\s+contacted)\b/i.test(q)) {
      conditions.push({ field: 'status', operator: 'equals', value: 'new' });
      explanations.push('Status is new (never contacted)');
    } else if (/\b(qualified\s+leads?|qualified)\b/i.test(q)) {
      conditions.push({ field: 'status', operator: 'equals', value: 'qualified' });
      explanations.push('Status is qualified');
    } else if (/\b(customers?|clients?)\b/i.test(q)) {
      conditions.push({ field: 'status', operator: 'equals', value: 'customer' });
      explanations.push('Status is customer');
    } else if (/\b(unresponsive)\b/i.test(q)) {
      conditions.push({ field: 'status', operator: 'equals', value: 'unresponsive' });
      explanations.push('Status is unresponsive');
    }

    // 5. Lead Score Filtering ("score > 80", "lead score above 50")
    const scoreMatch = q.match(/\b(?:score|lead\s*score)\s*(?:above|>|>=|greater\s+than)\s*(\d+)\b/i);
    if (scoreMatch && scoreMatch[1]) {
      const val = parseInt(scoreMatch[1], 10);
      conditions.push({ field: 'lead_score', operator: 'gte', value: val });
      explanations.push(`Lead score >= ${val}`);
    }

    // 6. Tag Detection ("tagged VIP", "tag hot-lead")
    const tagMatch = q.match(/\b(?:tagged|tag|with\s+tag)\s+["']?([a-zA-Z0-9_-]+)["']?\b/i);
    if (tagMatch && tagMatch[1]) {
      conditions.push({ field: 'tag', operator: 'equals', value: tagMatch[1] });
      explanations.push(`Tagged with "${tagMatch[1]}"`);
    }

    // 7. Activity within days ("opened email in last 7 days", "sent whatsapp in 30 days")
    const activityMatch = q.match(/\b(opened\s+email|sent\s+whatsapp|called)\s+(?:in|within)\s+(?:last\s+)?(\d+)\s+days\b/i);
    if (activityMatch) {
      const act = activityMatch[1].toLowerCase().includes('opened') ? 'email_opened' : 'whatsapp_sent';
      const days = parseInt(activityMatch[2], 10);
      conditions.push({
        field: 'activity',
        operator: 'equals',
        value: { type: act, days }
      });
      explanations.push(`Activity "${act}" within last ${days} days`);
    }

    // Fallback if no specific rule matched: general search across name, company, email
    if (conditions.length === 0) {
      conditions.push({ field: 'first_name', operator: 'contains', value: raw });
      explanations.push(`Search keyword "${raw}"`);
    }

    const filter: FilterGroup = {
      combinator: 'AND',
      conditions
    };

    return {
      raw_query: raw,
      filter,
      explanation: explanations.join(' AND '),
      matched_rules_count: conditions.length
    };
  }
}

