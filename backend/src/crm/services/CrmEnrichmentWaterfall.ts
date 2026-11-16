import { getCrmDb } from '../db/index.js';
import { Contact, Company, EnrichmentProviderConfig } from '../models/types.js';
import { WalletService } from '../../services/walletService.js';

export interface EnrichedPersonResult {
  first_name?: string;
  last_name?: string;
  title?: string;
  company_name?: string;
  phone?: string;
  city?: string;
  country?: string;
  linkedin_url?: string;
  custom_fields?: Record<string, any>;
  raw_provider_data?: Record<string, any>;
}

export interface IEnrichmentProviderAdapter {
  name: string;
  enrichPerson(email: string, domain?: string): Promise<EnrichedPersonResult | null>;
}

/**
 * Local Lead Intelligence & Internal Knowledge Base Adapter
 */
export class LocalIntelligenceAdapter implements IEnrichmentProviderAdapter {
  public name = 'local_intelligence';

  async enrichPerson(email: string, _domain?: string): Promise<EnrichedPersonResult | null> {
    const domain = email.split('@')[1];
    if (!domain) return null;

    // Infer title and company from domain if known
    let companyName = domain.split('.')[0];
    companyName = companyName.charAt(0).toUpperCase() + companyName.slice(1);

    return {
      company_name: companyName,
      custom_fields: {
        enriched_by: 'local_intelligence',
        domain_identified: domain
      }
    };
  }
}

/**
 * Hunter.io Adapter
 */
export class HunterEnrichmentAdapter implements IEnrichmentProviderAdapter {
  public name = 'hunter';

  async enrichPerson(email: string, _domain?: string): Promise<EnrichedPersonResult | null> {
    const apiKey = process.env.HUNTER_API_KEY;
    if (!apiKey) {
      // Mock enrichment fallback for development / offline environments
      const domain = email.split('@')[1];
      return {
        company_name: domain ? domain.split('.')[0].toUpperCase() : undefined,
        custom_fields: {
          hunter_confidence: 88,
          provider: 'hunter_mock'
        }
      };
    }

    try {
      const resp = await fetch(`https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${apiKey}`, {
        signal: AbortSignal.timeout(5000)
      });
      if (!resp.ok) return null;
      const json: any = await resp.json();
      const data = json?.data;
      if (!data) return null;

      return {
        custom_fields: {
          hunter_status: data.status,
          hunter_score: data.score
        },
        raw_provider_data: data
      };
    } catch {
      return null;
    }
  }
}

/**
 * Apollo.io Adapter
 */
export class ApolloEnrichmentAdapter implements IEnrichmentProviderAdapter {
  public name = 'apollo';

  async enrichPerson(email: string, domain?: string): Promise<EnrichedPersonResult | null> {
    const apiKey = process.env.APOLLO_API_KEY;
    if (!apiKey) {
      // Offline fallback
      return {
        title: 'Executive',
        custom_fields: { apollo_enriched: true, provider: 'apollo_mock' }
      };
    }

    try {
      const resp = await fetch('https://api.apollo.io/v1/people/match', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Api-Key': apiKey
        },
        body: JSON.stringify({ email, domain }),
        signal: AbortSignal.timeout(5000)
      });
      if (!resp.ok) return null;
      const json: any = await resp.json();
      const person = json?.person;
      if (!person) return null;

      return {
        first_name: person.first_name,
        last_name: person.last_name,
        title: person.title,
        company_name: person.organization?.name,
        city: person.city,
        country: person.country,
        linkedin_url: person.linkedin_url,
        custom_fields: {
          headline: person.headline,
          seniority: person.seniority
        },
        raw_provider_data: person
      };
    } catch {
      return null;
    }
  }
}

/**
 * Clearbit Adapter
 */
export class ClearbitEnrichmentAdapter implements IEnrichmentProviderAdapter {
  public name = 'clearbit';

  async enrichPerson(email: string): Promise<EnrichedPersonResult | null> {
    const apiKey = process.env.CLEARBIT_API_KEY;
    if (!apiKey) {
      return null;
    }

    try {
      const resp = await fetch(`https://person.clearbit.com/v2/people/find?email=${encodeURIComponent(email)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(5000)
      });
      if (!resp.ok) return null;
      const person: any = await resp.json();
      return {
        first_name: person?.name?.givenName,
        last_name: person?.name?.familyName,
        title: person?.employment?.title,
        company_name: person?.employment?.name,
        linkedin_url: person?.linkedin?.handle ? `https://linkedin.com/in/${person.linkedin.handle}` : undefined,
        raw_provider_data: person
      };
    } catch {
      return null;
    }
  }
}

/**
 * Waterfall Enrichment Orchestrator
 */
export class CrmEnrichmentWaterfall {
  private static instance: CrmEnrichmentWaterfall | null = null;
  private adapters: Map<string, IEnrichmentProviderAdapter> = new Map();

  private constructor() {
    this.registerAdapter(new LocalIntelligenceAdapter());
    this.registerAdapter(new HunterEnrichmentAdapter());
    this.registerAdapter(new ApolloEnrichmentAdapter());
    this.registerAdapter(new ClearbitEnrichmentAdapter());
  }

  public static getInstance(): CrmEnrichmentWaterfall {
    if (!CrmEnrichmentWaterfall.instance) {
      CrmEnrichmentWaterfall.instance = new CrmEnrichmentWaterfall();
    }
    return CrmEnrichmentWaterfall.instance;
  }

  public registerAdapter(adapter: IEnrichmentProviderAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  /**
   * Run the enrichment waterfall on a contact
   */
  public async enrichContact(
    workspaceId: string,
    contactId: string,
    userId?: string
  ): Promise<{
    enriched: boolean;
    provider_used?: string;
    fields_added: string[];
    cost_charged: number;
    updated_contact: Contact;
  }> {
    const db = getCrmDb();
    const contact = await db.getContact(workspaceId, contactId);
    if (!contact) throw new Error(`Contact not found: ${contactId}`);
    if (!contact.email) throw new Error('Contact email is required for enrichment');

    const lookupKey = `email:${contact.email.toLowerCase()}`;

    // 1. Check Enrichment Cache first (0 cost, immediate)
    const cached = await db.getEnrichmentCache(lookupKey);
    if (cached) {
      const mergedFields = this.mergeEnrichedData(contact, cached);
      const updated = await db.updateContact(workspaceId, contact.id, mergedFields);
      return {
        enriched: true,
        provider_used: 'cache',
        fields_added: Object.keys(mergedFields),
        cost_charged: 0,
        updated_contact: updated
      };
    }

    // 2. Fetch Active Providers in Priority Order
    const providers = await db.listEnrichmentProviders(workspaceId);
    const activeSorted = providers.filter((p) => p.is_active).sort((a, b) => a.priority_order - b.priority_order);

    let providerUsed: string | undefined;
    let costCharged = 0;
    let enrichedData: EnrichedPersonResult | null = null;

    for (const provConfig of activeSorted) {
      const adapter = this.adapters.get(provConfig.provider_name);
      if (!adapter) continue;

      try {
        const result = await adapter.enrichPerson(contact.email, contact.company_name || undefined);
        if (result && (result.title || result.company_name || result.phone || result.first_name || result.linkedin_url)) {
          enrichedData = result;
          providerUsed = provConfig.provider_name;
          costCharged = provConfig.cost_per_lookup_credits;

          // Deduct credits via platform WalletService if user exists
          if (userId && costCharged > 0) {
            try {
              const walletService = WalletService.getInstance();
              walletService.deduct(
                userId,
                costCharged,
                'usage_deduction',
                `CRM Contact Enrichment (${provConfig.provider_name}): ${contact.email}`,
                { customData: { contact_id: contactId, provider: provConfig.provider_name } }
              );
            } catch (walletErr: any) {
              console.warn('[CrmEnrichmentWaterfall] Wallet deduction warning:', walletErr.message);
            }
          }

          // Cache result for 30 days
          await db.setEnrichmentCache(lookupKey, provConfig.provider_name, result, 86400 * 30);
          break; // Stop waterfall on first successful rich payload!
        }
      } catch (err) {
        console.warn(`[CrmEnrichmentWaterfall] Provider ${provConfig.provider_name} failed:`, err);
      }
    }

    if (!enrichedData) {
      return {
        enriched: false,
        fields_added: [],
        cost_charged: 0,
        updated_contact: contact
      };
    }

    const merged = this.mergeEnrichedData(contact, enrichedData);
    const updatedContact = await db.updateContact(workspaceId, contact.id, merged);
    db.emitOutboxEvent(workspaceId, 'contact.enriched', 'contact', contact.id, {
      provider: providerUsed,
      cost: costCharged,
      fields: Object.keys(merged)
    }).catch(() => {});

    return {
      enriched: true,
      provider_used: providerUsed,
      fields_added: Object.keys(merged),
      cost_charged: costCharged,
      updated_contact: updatedContact
    };
  }

  private mergeEnrichedData(contact: Contact, data: EnrichedPersonResult): Partial<Contact> {
    const updates: Partial<Contact> = {};

    if (!contact.first_name && data.first_name) updates.first_name = data.first_name;
    if (!contact.last_name && data.last_name) updates.last_name = data.last_name;
    if (!contact.title && data.title) updates.title = data.title;
    if (!contact.city && data.city) updates.city = data.city;
    if (!contact.country && data.country) updates.country = data.country;
    if (!contact.phone && data.phone) updates.phone = data.phone;

    const existingCustom = contact.custom_fields || {};
    const newCustom = { ...existingCustom, ...(data.custom_fields || {}) };
    if (data.linkedin_url) newCustom.linkedin_url = data.linkedin_url;
    updates.custom_fields = newCustom;

    return updates;
  }
}
