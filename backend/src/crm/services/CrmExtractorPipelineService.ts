import { getCrmDb } from '../db/index.js';
import { CrmNormalizer } from './crmNormalizer.js';
import { Contact, ImportDedupeRule } from '../models/types.js';

export class CrmExtractorPipelineService {
  private static instance: CrmExtractorPipelineService | null = null;

  public static getInstance(): CrmExtractorPipelineService {
    if (!CrmExtractorPipelineService.instance) {
      CrmExtractorPipelineService.instance = new CrmExtractorPipelineService();
    }
    return CrmExtractorPipelineService.instance;
  }

  /**
   * Automatically flow extracted records (from Apify actors or Google Maps scraper) into CRM
   */
  public async ingestExtractorResults(
    workspaceId: string,
    listId: string | null,
    records: Record<string, any>[],
    source: string = 'extractor_job',
    sourceId?: string,
    dedupeRule: ImportDedupeRule = 'update'
  ): Promise<{ total: number; inserted: number; updated: number; skipped: number; errors: any[] }> {
    const db = getCrmDb();
    const contactsToUpsert: Partial<Contact>[] = [];
    const contactIdsForList: string[] = [];

    for (const row of records) {
      // 1. Detect Names
      let firstName = row.firstName || row.first_name || '';
      let lastName = row.lastName || row.last_name || '';

      if (!firstName && !lastName && (row.name || row.business_name || row.title_name)) {
        const full = (row.name || row.business_name || row.title_name).trim();
        const parts = full.split(' ');
        if (parts.length === 1) {
          firstName = parts[0];
        } else {
          firstName = parts[0];
          lastName = parts.slice(1).join(' ');
        }
      }

      // 2. Detect Email
      const rawEmail = row.email || row.emailAddress || row.contact_email || row.mail || row.primaryEmail;
      const email = CrmNormalizer.normalizeEmail(rawEmail);

      // 3. Detect Phone
      const rawPhone = row.phone || row.phoneNumber || row.mobile || row.tel || row.phone_number;
      const phone = CrmNormalizer.normalizePhone(rawPhone);

      // Check suppression list
      const isSuppressed = await db.checkSuppressed(workspaceId, {
        email: email || undefined,
        phone: phone || undefined,
        domain: row.website || row.domain || email || undefined
      });

      if (isSuppressed) {
        continue;
      }

      // 4. Company Auto-Link / Creation
      const companyName = row.company || row.companyName || row.business_name || row.organization;
      let companyId: string | null = null;
      if (companyName) {
        const domain = CrmNormalizer.extractDomain(row.website || row.url || row.domain || email);
        try {
          const comp = await db.findOrCreateCompanyByDomain(workspaceId, companyName, domain || undefined);
          companyId = comp.id;
        } catch {}
      }

      // 5. Gather Custom Fields (everything not in top-level contact fields)
      const reservedKeys = new Set([
        'firstName', 'first_name', 'lastName', 'last_name', 'name', 'business_name',
        'email', 'emailAddress', 'contact_email', 'mail', 'primaryEmail',
        'phone', 'phoneNumber', 'mobile', 'tel', 'phone_number',
        'title', 'jobTitle', 'position', 'role',
        'country', 'city', 'state', 'address', 'postalCode', 'zipCode',
        'company', 'companyName', 'website', 'url', 'domain', 'rating', 'reviews'
      ]);

      const customFields: Record<string, any> = {};
      for (const [k, v] of Object.entries(row)) {
        if (!reservedKeys.has(k) && v !== undefined && v !== null && v !== '') {
          customFields[k] = v;
        }
      }

      contactsToUpsert.push({
        first_name: firstName || null,
        last_name: lastName || null,
        email: email || null,
        phone: phone || null,
        company_id: companyId,
        title: row.title || row.jobTitle || row.position || null,
        country: row.country || null,
        city: row.city || null,
        source,
        source_id: sourceId || null,
        status: 'new',
        custom_fields: customFields,
        email_status: email ? 'unknown' : 'invalid'
      });
    }

    if (contactsToUpsert.length === 0) {
      return { total: records.length, inserted: 0, updated: 0, skipped: records.length, errors: [] };
    }

    // Bulk upsert into CRM contacts
    const upsertRes = await db.bulkUpsertContacts(workspaceId, contactsToUpsert, dedupeRule);

    // If list specified, link contacts to the list
    if (listId) {
      // Find IDs of contacts that were touched
      for (const c of contactsToUpsert) {
        if (c.email) {
          const found = await db.listContacts(workspaceId, { search: c.email, pagination: { limit: 1 } });
          if (found.data[0]) {
            contactIdsForList.push(found.data[0].id);
          }
        }
      }

      if (contactIdsForList.length > 0) {
        await db.addContactsToList(workspaceId, listId, contactIdsForList);
      }
    }

    return {
      total: records.length,
      inserted: upsertRes.inserted,
      updated: upsertRes.updated,
      skipped: upsertRes.skipped + (records.length - contactsToUpsert.length),
      errors: upsertRes.errors
    };
  }
}

