import { getCrmDb } from '../db/index.js';
import { Contact, CrmRolePermission } from '../models/types.js';

export class CrmSecurityService {
  private static instance: CrmSecurityService | null = null;

  public static getInstance(): CrmSecurityService {
    if (!CrmSecurityService.instance) {
      CrmSecurityService.instance = new CrmSecurityService();
    }
    return CrmSecurityService.instance;
  }

  /**
   * Masks email string (e.g. "priya.sharma@techmatrix.in" -> "p***@techmatrix.in")
   */
  public maskEmail(email: string | null | undefined): string | null {
    if (!email) return null;
    const parts = email.split('@');
    if (parts.length !== 2) return '***@***.***';
    const name = parts[0];
    const domain = parts[1];
    const maskedName = name.length > 2 ? `${name[0]}***${name[name.length - 1]}` : `${name[0]}***`;
    return `${maskedName}@${domain}`;
  }

  /**
   * Masks phone string (e.g. "+919876543210" -> "+91 98*** ***10")
   */
  public maskPhone(phone: string | null | undefined): string | null {
    if (!phone) return null;
    const clean = phone.trim();
    if (clean.length < 7) return '***-***';
    const prefix = clean.slice(0, 5);
    const suffix = clean.slice(-2);
    return `${prefix}*** ***${suffix}`;
  }

  /**
   * Evaluates if a role has a specific permission in a workspace
   */
  public async hasPermission(
    workspaceId: string,
    role: string,
    permission: keyof Omit<CrmRolePermission, 'id' | 'workspace_id' | 'role' | 'created_at' | 'updated_at'>
  ): Promise<boolean> {
    if (role === 'owner' || role === 'admin') return true;
    const db = getCrmDb();
    const perm = await db.getRolePermission(workspaceId, role);
    if (!perm) return false;
    return Boolean(perm[permission]);
  }

  /**
   * Applies role-based field-level masking and sensitive field redaction to a contact record
   */
  public async filterContactForRole(
    workspaceId: string,
    contact: Contact,
    role: string
  ): Promise<Contact> {
    if (role === 'owner' || role === 'admin') {
      return contact;
    }

    const db = getCrmDb();
    const [perm, sensitiveFields] = await Promise.all([
      db.getRolePermission(workspaceId, role),
      db.listSensitiveFields(workspaceId)
    ]);

    const canViewPhones = perm ? perm.can_view_phones : false;
    const canViewEmails = perm ? perm.can_view_emails : false;
    const canViewSensitive = perm ? perm.can_view_sensitive_fields : false;

    const filtered: Contact = { ...contact };

    // 1. Phone masking
    if (!canViewPhones) {
      if (filtered.phone) filtered.phone = this.maskPhone(filtered.phone);
      if (filtered.phone_e164) filtered.phone_e164 = this.maskPhone(filtered.phone_e164);
    }

    // 2. Email masking
    if (!canViewEmails) {
      if (filtered.email) filtered.email = this.maskEmail(filtered.email);
      if (filtered.email_normalized) filtered.email_normalized = this.maskEmail(filtered.email_normalized);
    }

    // 3. Custom sensitive fields redaction
    if (!canViewSensitive && filtered.custom_fields) {
      const sanitizedCustom = { ...filtered.custom_fields };
      for (const sf of sensitiveFields) {
        if (sanitizedCustom[sf.field_key] !== undefined) {
          if (sf.mask_strategy === 'hidden') {
            delete sanitizedCustom[sf.field_key];
          } else if (sf.mask_strategy === 'partial') {
            sanitizedCustom[sf.field_key] = '***' + String(sanitizedCustom[sf.field_key]).slice(-4);
          } else {
            sanitizedCustom[sf.field_key] = '[REDACTED]';
          }
        }
      }
      filtered.custom_fields = sanitizedCustom;
    }

    return filtered;
  }

  /**
   * Logs an audit record when a user reveals a masked field
   */
  public async logRevealAudit(
    workspaceId: string,
    userId: string,
    contactId: string,
    fieldName: string,
    ipAddress?: string
  ): Promise<void> {
    const db = getCrmDb();
    await db.logAudit({
      workspace_id: workspaceId,
      user_id: userId,
      action: 'sensitive_field_revealed',
      entity_type: 'contact',
      entity_id: contactId,
      changes: { field_revealed: fieldName },
      ip_address: ipAddress || '127.0.0.1'
    });
  }
}
