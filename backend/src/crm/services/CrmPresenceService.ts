import { getCrmDb } from '../db/index.js';
import { CrmPresenceSession } from '../models/types.js';

export class CrmPresenceService {
  private static instance: CrmPresenceService | null = null;

  public static getInstance(): CrmPresenceService {
    if (!CrmPresenceService.instance) {
      CrmPresenceService.instance = new CrmPresenceService();
    }
    return CrmPresenceService.instance;
  }

  /**
   * Heartbeat to signal user is viewing or editing a contact or deal
   */
  public async heartbeat(
    workspaceId: string,
    entityType: 'contact' | 'deal',
    entityId: string,
    userId: string,
    userName: string,
    action: 'viewing' | 'editing' = 'viewing'
  ): Promise<void> {
    const db = getCrmDb();
    const expiresAt = new Date(Date.now() + 45000).toISOString(); // 45s TTL

    await db.upsertPresence({
      workspace_id: workspaceId,
      entity_type: entityType,
      entity_id: entityId,
      user_id: userId,
      user_name: userName,
      action,
      expires_at: expiresAt
    });
  }

  /**
   * Checks collisions: returns other teammates currently active on this record
   */
  public async getCollisions(
    workspaceId: string,
    entityType: 'contact' | 'deal',
    entityId: string,
    currentUserId?: string
  ): Promise<{ hasCollision: boolean; activeUsers: CrmPresenceSession[] }> {
    const db = getCrmDb();
    const allPresent = await db.getPresentUsers(workspaceId, entityType, entityId);
    const others = currentUserId ? allPresent.filter((s) => s.user_id !== currentUserId) : allPresent;

    return {
      hasCollision: others.some((s) => s.action === 'editing'),
      activeUsers: others
    };
  }

  public async leave(
    workspaceId: string,
    entityType: 'contact' | 'deal',
    entityId: string,
    userId: string
  ): Promise<void> {
    const db = getCrmDb();
    await db.clearPresence(workspaceId, entityType, entityId, userId);
  }
}

