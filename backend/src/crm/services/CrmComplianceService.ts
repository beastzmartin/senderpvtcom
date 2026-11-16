import { getCrmDb } from '../db/index.js';
import { Contact, CrmCompliancePolicy } from '../models/types.js';

export interface CanSendMessageResult {
  canSend: boolean;
  reason?: string;
  isQuietHours?: boolean;
  rateLimitExceeded?: boolean;
  isSuppressed?: boolean;
}

export class CrmComplianceService {
  private static instance: CrmComplianceService | null = null;

  public static getInstance(): CrmComplianceService {
    if (!CrmComplianceService.instance) {
      CrmComplianceService.instance = new CrmComplianceService();
    }
    return CrmComplianceService.instance;
  }

  /**
   * Evaluates if an automated outreach message can be sent to a contact
   * respecting quiet hours, per-day limits, and suppression list.
   */
  public async canSendMessage(
    workspaceId: string,
    contactId: string,
    channel: 'whatsapp' | 'email' = 'whatsapp'
  ): Promise<CanSendMessageResult> {
    const db = getCrmDb();
    const [policy, contact] = await Promise.all([
      db.getCompliancePolicy(workspaceId),
      db.getContact(workspaceId, contactId)
    ]);

    if (!contact) {
      return { canSend: false, reason: 'Contact not found' };
    }

    // 1. Suppression check
    const isSuppressed = await db.checkSuppressed(workspaceId, {
      email: contact.email || undefined,
      phone: contact.phone_e164 || contact.phone || undefined
    });

    if (isSuppressed) {
      return { canSend: false, isSuppressed: true, reason: 'Contact is on the workspace suppression / unsubscribe list' };
    }

    // 2. Quiet hours check
    if (policy.quiet_hours_enabled) {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMin = now.getMinutes();
      const currentTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`;

      const [startHour, startMin] = policy.quiet_hours_start.split(':').map(Number);
      const [endHour, endMin] = policy.quiet_hours_end.split(':').map(Number);

      const inQuietHours = startHour > endHour
        ? (currentHour > startHour || (currentHour === startHour && currentMin >= startMin)) ||
          (currentHour < endHour || (currentHour === endHour && currentMin < endMin))
        : (currentHour > startHour || (currentHour === startHour && currentMin >= startMin)) &&
          (currentHour < endHour || (currentHour === endHour && currentMin < endMin));

      if (inQuietHours) {
        return {
          canSend: false,
          isQuietHours: true,
          reason: `Quiet hours active (${policy.quiet_hours_start} - ${policy.quiet_hours_end})`
        };
      }
    }

    // 3. Per-contact daily message limit check
    const activities = await db.listActivities(workspaceId, contactId, 20);
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const sentTodayCount = activities.filter((a) => {
      const isOutbound = a.type === 'whatsapp' || a.type === 'email' || a.type === 'call' || a.type === 'message';
      const isRecent = new Date(a.created_at).getTime() >= oneDayAgo;
      return isOutbound && isRecent;
    }).length;

    if (sentTodayCount >= policy.max_messages_per_day) {
      return {
        canSend: false,
        rateLimitExceeded: true,
        reason: `Maximum daily messages reached (${sentTodayCount}/${policy.max_messages_per_day})`
      };
    }

    return { canSend: true };
  }

  /**
   * Processes inbound messages for STOP / UNSUBSCRIBE keywords and auto-suppresses
   */
  public async handleInboundKeyword(
    workspaceId: string,
    contactId: string,
    messageText: string
  ): Promise<{ autoOptedOut: boolean; keywordMatched?: string }> {
    const db = getCrmDb();
    const policy = await db.getCompliancePolicy(workspaceId);
    const contact = await db.getContact(workspaceId, contactId);
    if (!contact) return { autoOptedOut: false };

    const matched = policy.auto_opt_out_keywords.find((kw) => {
      const escaped = kw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      return new RegExp(`\\b${escaped}\\b`, 'i').test(messageText);
    });

    if (matched) {
      // 1. Add to suppression list
      if (contact.email) {
        await db.addSuppression(workspaceId, {
          type: 'email',
          value_normalized: contact.email.toLowerCase(),
          reason: 'unsubscribe'
        });
      }
      if (contact.phone || contact.phone_e164) {
        await db.addSuppression(workspaceId, {
          type: 'phone',
          value_normalized: (contact.phone_e164 || contact.phone)!,
          reason: 'unsubscribe'
        });
      }

      // 2. Add 'unsubscribed' tag
      const existingTags = await db.listTags(workspaceId);
      let unsubTag = existingTags.find((t) => t.name.toLowerCase() === 'unsubscribed');
      if (!unsubTag) {
        unsubTag = await db.createTag(workspaceId, 'unsubscribed', '#EF4444');
      }
      await db.tagContacts(workspaceId, unsubTag.id, [contactId]);

      // 3. Log compliance activity
      await db.logActivity(workspaceId, {
        contact_id: contactId,
        type: 'note',
        title: 'Auto-Unsubscribed via Inbound Keyword',
        details: { keyword: matched, raw_message: messageText }
      });

      return { autoOptedOut: true, keywordMatched: matched };
    }

    return { autoOptedOut: false };
  }
}
