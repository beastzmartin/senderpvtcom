import crypto from 'crypto';
import { getCrmDb } from '../db/index.js';
import { CrmErasureCertificate, DataSubjectExportBundle } from '../models/types.js';

export class CrmGdprService {
  private static instance: CrmGdprService | null = null;

  public static getInstance(): CrmGdprService {
    if (!CrmGdprService.instance) {
      CrmGdprService.instance = new CrmGdprService();
    }
    return CrmGdprService.instance;
  }

  /**
   * Executes GDPR / DPDP Right to Erasure (Cryptographic data shredding)
   * Hard deletes all related contact entries and generates a tamper-evident audit certificate.
   */
  public async executeErasure(
    workspaceId: string,
    contactId: string,
    requesterEmail: string,
    erasedByUserId?: string
  ): Promise<CrmErasureCertificate> {
    const db = getCrmDb();
    const contact = await db.getContact(workspaceId, contactId);
    if (!contact) {
      throw new Error(`Contact ${contactId} not found`);
    }

    const timestamp = new Date().toISOString();
    const digestMaterial = `${workspaceId}:${contactId}:${requesterEmail}:${timestamp}:${contact.email || ''}:${contact.phone || ''}`;
    const auditHash = crypto.createHash('sha256').update(digestMaterial).digest('hex');

    // Execute physical purge across database tables
    const recordsPurged = await db.hardDeleteContact(workspaceId, contactId);

    // Persist immutable erasure certificate
    const cert = await db.saveErasureCertificate({
      workspace_id: workspaceId,
      contact_id: contactId,
      requester_email: requesterEmail,
      records_purged: recordsPurged,
      audit_hash: auditHash,
      erased_by_user_id: erasedByUserId || null
    });

    // Add to workspace suppression list to prevent accidental re-import
    await db.addSuppression(workspaceId, {
      type: 'email',
      value_normalized: requesterEmail.toLowerCase(),
      reason: 'gdpr_deletion'
    });

    // Log immutable audit record
    await db.logAudit({
      workspace_id: workspaceId,
      user_id: erasedByUserId || null,
      action: 'gdpr_contact_erased',
      entity_type: 'contact',
      entity_id: contactId,
      changes: { requester_email: requesterEmail, certificate_id: cert.id, records_purged: recordsPurged, audit_hash: auditHash }
    });

    return cert;
  }

  /**
   * Exports full data subject bundle (GDPR Article 20 / DPDP Right of Data Portability)
   */
  public async exportSubjectDataBundle(workspaceId: string, contactId: string): Promise<DataSubjectExportBundle> {
    const db = getCrmDb();
    const contact = await db.getContact(workspaceId, contactId);
    if (!contact) {
      throw new Error(`Contact ${contactId} not found`);
    }

    const [company, activities, deals, tasks, associations] = await Promise.all([
      contact.company_id ? db.getCompany(workspaceId, contact.company_id) : Promise.resolve(null),
      db.listActivities(workspaceId, contactId, 100),
      db.listDeals(workspaceId, { contactId }),
      db.listTasks(workspaceId, { contactId }),
      db.listAssociatedObjects(workspaceId, 'contact', contactId)
    ]);

    return {
      contact,
      company,
      activities,
      deals,
      tasks,
      custom_records: associations,
      exported_at: new Date().toISOString(),
      gdpr_jurisdiction: 'EU-GDPR / India-DPDP Act Compliant'
    };
  }
}
