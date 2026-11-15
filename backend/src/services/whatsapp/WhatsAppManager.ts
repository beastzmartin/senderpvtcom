import { EventEmitter } from 'events';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { config } from '../../config.js';
import { IWhatsAppProvider } from './IWhatsAppProvider.js';
import { BaileysWhatsAppProvider } from './BaileysProvider.js';
import {
  WhatsAppConnectionStatus,
  WhatsAppAccountInfo,
  QRState,
  SendMessageResult,
  IncomingMessageEvent,
  MessageContentUpdateEvent,
  MessageStatusUpdateEvent,
  ExtractedGroup,
  ExtractedMember,
  GroupInviteMetadata,
  JoinGroupResult
} from './types.js';
import { getDatabase } from '../../db/database.js';

export interface DeviceSessionRecord {
  id: string;
  user_id?: string | null;
  session_id: string;
  alias: string;
  is_default: boolean;
  status: WhatsAppConnectionStatus;
  phone_number?: string | null;
  jid?: string | null;
  lid?: string | null;
  display_name?: string | null;
  platform?: string | null;
  connected_at?: string | null;
  last_active_at?: string | null;
  created_at: string;
  updated_at: string;
  hasQr?: boolean;
  qrExpiresIn?: number;
}

export class WhatsAppManager extends EventEmitter {
  private static instance: WhatsAppManager | null = null;
  private providers: Map<string, BaileysWhatsAppProvider> = new Map();
  private activeSessionId: string = 'default';
  private roundRobinIndex: number = 0;

  private constructor() {
    super();
    this.initProvidersFromDb();
  }

  public static getInstance(): WhatsAppManager {
    if (!WhatsAppManager.instance) {
      WhatsAppManager.instance = new WhatsAppManager();
    }
    return WhatsAppManager.instance;
  }

  public getSessionUserId(sessionId: string): string | null {
    try {
      const db = getDatabase();
      const row = db.prepare('SELECT user_id FROM whatsapp_sessions WHERE session_id = ?').get(sessionId) as { user_id: string } | undefined;
      return row?.user_id || null;
    } catch {
      return null;
    }
  }

  private initProvidersFromDb(): void {
    try {
      const db = getDatabase();
      const rows = db.prepare('SELECT * FROM whatsapp_sessions ORDER BY is_default DESC, created_at ASC').all() as any[];

      for (const row of rows) {
        this.registerProvider(row.session_id);
        if (row.is_default === 1 && !this.activeSessionId) {
          this.activeSessionId = row.session_id;
        }
      }

      if (rows.length > 0 && !this.activeSessionId) {
        this.activeSessionId = rows[0].session_id;
      }

      console.log(`[WhatsApp Manager] Initialized ${this.providers.size} device session(s). Active default: [${this.activeSessionId}]`);
    } catch (err) {
      console.error('[WhatsApp Manager] Error initializing providers from DB:', err);
    }
  }

  private registerProvider(sessionId: string): BaileysWhatsAppProvider {
    if (this.providers.has(sessionId)) {
      return this.providers.get(sessionId)!;
    }

    const provider = new BaileysWhatsAppProvider(sessionId);

    provider.on('status', (status: WhatsAppConnectionStatus, accountInfo?: WhatsAppAccountInfo | null) => {
      this.syncSessionInDb(sessionId, status, accountInfo || null);
      const userId = this.getSessionUserId(sessionId);
      this.emit('status', status, accountInfo, sessionId, userId);
      this.emit('device:status', { sessionId, userId, status, accountInfo });
      if (userId) {
        this.emit('devices:updated', { userId, devices: this.getAllSessions(userId) });
      }
    });

    provider.on('qr', (qrState: QRState | null) => {
      const userId = this.getSessionUserId(sessionId);
      this.emit('qr', qrState, sessionId, userId);
      this.emit('device:qr', { sessionId, userId, qrState });
    });

    provider.on('message', (msg: IncomingMessageEvent) => {
      const userId = this.getSessionUserId(sessionId);
      this.emit('message', msg, sessionId, userId);
    });

    provider.on('message_update', (update: MessageContentUpdateEvent) => {
      const userId = this.getSessionUserId(sessionId);
      this.emit('message_update', update, sessionId, userId);
    });

    provider.on('message_status', (update: MessageStatusUpdateEvent) => {
      const userId = this.getSessionUserId(sessionId);
      this.emit('message_status', update, sessionId, userId);
    });

    this.providers.set(sessionId, provider);
    return provider;
  }

  private syncSessionInDb(sessionId: string, status: WhatsAppConnectionStatus, accountInfo: WhatsAppAccountInfo | null): void {
    try {
      const db = getDatabase();
      const now = new Date().toISOString();

      const stmt = db.prepare(`
        UPDATE whatsapp_sessions
        SET
          status = ?,
          phone_number = COALESCE(?, phone_number),
          jid = COALESCE(?, jid),
          lid = COALESCE(?, lid),
          display_name = COALESCE(?, display_name),
          platform = COALESCE(?, platform),
          connected_at = CASE WHEN ? = 'connected' THEN ? ELSE connected_at END,
          last_active_at = ?,
          updated_at = ?
        WHERE session_id = ?
      `);

      stmt.run(
        status,
        accountInfo?.phone || null,
        accountInfo?.jid || null,
        accountInfo?.lid || null,
        accountInfo?.name || null,
        accountInfo?.platform || null,
        status,
        now,
        now,
        now,
        sessionId
      );
    } catch (err) {
      console.error(`[WhatsApp Manager] Failed to sync session (${sessionId}) in database:`, err);
    }
  }

  public getProvider(sessionId?: string, userId?: string): BaileysWhatsAppProvider {
    if (sessionId) {
      if (userId) {
        const db = getDatabase();
        const check = db.prepare('SELECT id FROM whatsapp_sessions WHERE session_id = ? AND user_id = ?').get(sessionId, userId);
        if (!check) {
          throw new Error(`Device session [${sessionId}] does not belong to your account.`);
        }
      }
      if (this.providers.has(sessionId)) {
        return this.providers.get(sessionId)!;
      }
      return this.registerProvider(sessionId);
    }

    if (userId) {
      const activeId = this.getActiveSessionId(userId);
      if (activeId && this.providers.has(activeId)) {
        return this.providers.get(activeId)!;
      }
      if (activeId) {
        return this.registerProvider(activeId);
      }
      throw new Error('No WhatsApp account connected. Please connect a WhatsApp device first.');
    }

    if (this.providers.has(this.activeSessionId)) {
      return this.providers.get(this.activeSessionId)!;
    }
    const first = this.providers.values().next().value;
    if (first) return first;
    return this.registerProvider('default');
  }

  public getActiveSessionId(userId?: string): string {
    if (!userId) {
      return this.activeSessionId;
    }
    const db = getDatabase();
    const row = db.prepare('SELECT session_id FROM whatsapp_sessions WHERE user_id = ? ORDER BY is_default DESC, created_at ASC LIMIT 1').get(userId) as { session_id: string } | undefined;
    return row?.session_id || '';
  }

  public getProviderName(sessionId?: string, userId?: string): string {
    try {
      return this.getProvider(sessionId, userId).name;
    } catch {
      return 'baileys';
    }
  }

  public getAllSessions(userId?: string): DeviceSessionRecord[] {
    const db = getDatabase();
    let rows: any[];
    if (userId) {
      rows = db.prepare('SELECT * FROM whatsapp_sessions WHERE user_id = ? ORDER BY is_default DESC, created_at ASC').all(userId) as any[];
    } else {
      rows = db.prepare('SELECT * FROM whatsapp_sessions ORDER BY is_default DESC, created_at ASC').all() as any[];
    }

    return rows.map((row) => {
      const provider = this.providers.get(row.session_id);
      const liveStatus = provider ? provider.getStatus() : (row.status as WhatsAppConnectionStatus);
      const liveAccount = provider ? provider.getAccountInfo() : null;
      const liveQr = provider ? provider.getQR() : null;

      return {
        id: row.id,
        user_id: row.user_id || null,
        session_id: row.session_id,
        alias: row.alias || 'WhatsApp Device',
        is_default: row.is_default === 1,
        status: liveStatus,
        phone_number: liveAccount?.phone || row.phone_number || null,
        jid: liveAccount?.jid || row.jid || null,
        lid: liveAccount?.lid || row.lid || null,
        display_name: liveAccount?.name || row.display_name || null,
        platform: liveAccount?.platform || row.platform || null,
        connected_at: row.connected_at || null,
        last_active_at: row.last_active_at || null,
        created_at: row.created_at,
        updated_at: row.updated_at,
        hasQr: !!liveQr,
        qrExpiresIn: liveQr ? Math.max(0, 60 - Math.floor((Date.now() - liveQr.generatedAt) / 1000)) : 0
      };
    });
  }

  public async createSession(userId: string, alias?: string): Promise<DeviceSessionRecord> {
    const db = getDatabase();
    const id = crypto.randomUUID();
    const sessionId = `dev_${userId.slice(0, 8)}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const userDeviceCount = (db.prepare('SELECT COUNT(*) as count FROM whatsapp_sessions WHERE user_id = ?').get(userId) as { count: number }).count;
    const finalAlias = alias?.trim() || `WhatsApp Account ${userDeviceCount + 1}`;
    const isDefault = userDeviceCount === 0 ? 1 : 0;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO whatsapp_sessions (id, user_id, session_id, alias, is_default, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'disconnected', ?, ?)
    `).run(id, userId, sessionId, finalAlias, isDefault, now, now);

    const provider = this.registerProvider(sessionId);

    // Automatically trigger connection to start QR pairing immediately
    provider.connect().catch((err) => {
      console.warn(`[WhatsApp Manager] Initial connect for new device (${sessionId}) non-fatal error:`, err.message);
    });

    this.emit('devices:updated', { userId, devices: this.getAllSessions(userId) });

    return {
      id,
      user_id: userId,
      session_id: sessionId,
      alias: finalAlias,
      is_default: isDefault === 1,
      status: 'connecting',
      created_at: now,
      updated_at: now,
      hasQr: false,
      qrExpiresIn: 60
    };
  }

  public async deleteSession(sessionId: string, userId?: string): Promise<void> {
    const db = getDatabase();
    if (userId) {
      const check = db.prepare('SELECT id, is_default FROM whatsapp_sessions WHERE session_id = ? AND user_id = ?').get(sessionId, userId) as { id: string; is_default: number } | undefined;
      if (!check) {
        throw new Error('Device not found or not owned by your account.');
      }
    }

    const provider = this.providers.get(sessionId);
    if (provider) {
      try {
        await provider.disconnect();
      } catch {}
      try {
        await provider.clearSessionFiles();
      } catch {}
      this.providers.delete(sessionId);
    }

    if (userId) {
      db.prepare('DELETE FROM whatsapp_sessions WHERE session_id = ? AND user_id = ?').run(sessionId, userId);
      const remaining = db.prepare('SELECT session_id FROM whatsapp_sessions WHERE user_id = ? ORDER BY created_at ASC LIMIT 1').get(userId) as { session_id: string } | undefined;
      if (remaining) {
        db.prepare('UPDATE whatsapp_sessions SET is_default = 1 WHERE session_id = ? AND user_id = ?').run(remaining.session_id, userId);
      }
      this.emit('devices:updated', { userId, devices: this.getAllSessions(userId) });
    } else {
      db.prepare('DELETE FROM whatsapp_sessions WHERE session_id = ?').run(sessionId);
      if (this.activeSessionId === sessionId) {
        const nextSession = db.prepare('SELECT session_id FROM whatsapp_sessions ORDER BY created_at ASC LIMIT 1').get() as { session_id: string } | undefined;
        if (nextSession) {
          db.prepare('UPDATE whatsapp_sessions SET is_default = 1 WHERE session_id = ?').run(nextSession.session_id);
          this.activeSessionId = nextSession.session_id;
        }
      }
      this.emit('devices:updated', { devices: this.getAllSessions() });
    }
  }

  public async setDefaultSession(sessionId: string, userId?: string): Promise<void> {
    const db = getDatabase();
    if (userId) {
      const row = db.prepare('SELECT session_id FROM whatsapp_sessions WHERE session_id = ? AND user_id = ?').get(sessionId, userId);
      if (!row) {
        throw new Error(`Device session [${sessionId}] does not belong to your account.`);
      }

      db.prepare('UPDATE whatsapp_sessions SET is_default = 0 WHERE user_id = ?').run(userId);
      db.prepare('UPDATE whatsapp_sessions SET is_default = 1 WHERE session_id = ? AND user_id = ?').run(sessionId, userId);

      const provider = this.getProvider(sessionId, userId);
      this.emit('status', provider.getStatus(), provider.getAccountInfo(), sessionId, userId);
      this.emit('devices:updated', { userId, devices: this.getAllSessions(userId) });
    } else {
      const row = db.prepare('SELECT session_id FROM whatsapp_sessions WHERE session_id = ?').get(sessionId);
      if (!row) {
        throw new Error(`Device session [${sessionId}] does not exist.`);
      }

      db.prepare('UPDATE whatsapp_sessions SET is_default = 0').run();
      db.prepare('UPDATE whatsapp_sessions SET is_default = 1 WHERE session_id = ?').run(sessionId);

      this.activeSessionId = sessionId;
      const provider = this.getProvider(sessionId);
      this.emit('status', provider.getStatus(), provider.getAccountInfo(), sessionId);
      this.emit('devices:updated', { devices: this.getAllSessions() });
    }
  }

  public async updateSessionAlias(sessionId: string, alias: string, userId?: string): Promise<void> {
    const cleanAlias = alias.trim();
    if (!cleanAlias) {
      throw new Error('Device alias cannot be empty.');
    }

    const db = getDatabase();
    if (userId) {
      const result = db.prepare("UPDATE whatsapp_sessions SET alias = ?, updated_at = datetime('now') WHERE session_id = ? AND user_id = ?").run(cleanAlias, sessionId, userId);
      if (result.changes === 0) {
        throw new Error('Device not found or not owned by your account.');
      }
      this.emit('devices:updated', { userId, devices: this.getAllSessions(userId) });
    } else {
      db.prepare("UPDATE whatsapp_sessions SET alias = ?, updated_at = datetime('now') WHERE session_id = ?").run(cleanAlias, sessionId);
      this.emit('devices:updated', { devices: this.getAllSessions() });
    }
  }

  public getConnectedSessions(userId?: string): BaileysWhatsAppProvider[] {
    const db = getDatabase();
    let userSessionIds: Set<string> | null = null;
    if (userId) {
      const rows = db.prepare('SELECT session_id FROM whatsapp_sessions WHERE user_id = ?').all(userId) as { session_id: string }[];
      userSessionIds = new Set(rows.map((r) => r.session_id));
    }
    return Array.from(this.providers.entries())
      .filter(([id, p]) => (userSessionIds ? userSessionIds.has(id) : true) && p.getStatus() === 'connected')
      .map(([, p]) => p);
  }

  public getRoundRobinProvider(userId?: string): BaileysWhatsAppProvider {
    const connected = this.getConnectedSessions(userId);
    if (connected.length === 0) {
      return this.getProvider(undefined, userId);
    }
    if (connected.length === 1) {
      return connected[0];
    }
    const selected = connected[this.roundRobinIndex % connected.length];
    this.roundRobinIndex = (this.roundRobinIndex + 1) % connected.length;
    return selected;
  }

  public async connect(sessionId?: string, userId?: string): Promise<void> {
    const provider = this.getProvider(sessionId, userId);
    return provider.connect();
  }

  public async disconnect(sessionId?: string, userId?: string): Promise<void> {
    const provider = this.getProvider(sessionId, userId);
    return provider.disconnect();
  }

  public async resetSession(sessionId?: string, userId?: string): Promise<void> {
    const provider = this.getProvider(sessionId, userId);
    return provider.resetSession();
  }

  public getStatus(sessionId?: string, userId?: string): WhatsAppConnectionStatus {
    try {
      const targetSessionId = sessionId || (userId ? this.getActiveSessionId(userId) : this.activeSessionId);
      if (!targetSessionId) {
        return 'disconnected';
      }
      const provider = this.providers.get(targetSessionId);
      return provider ? provider.getStatus() : 'disconnected';
    } catch {
      return 'disconnected';
    }
  }

  public getQR(sessionId?: string, userId?: string): QRState | null {
    try {
      const targetSessionId = sessionId || (userId ? this.getActiveSessionId(userId) : this.activeSessionId);
      if (!targetSessionId) {
        return null;
      }
      const provider = this.providers.get(targetSessionId);
      return provider ? provider.getQR() : null;
    } catch {
      return null;
    }
  }

  public getAccountInfo(sessionId?: string, userId?: string): WhatsAppAccountInfo | null {
    try {
      const targetSessionId = sessionId || (userId ? this.getActiveSessionId(userId) : this.activeSessionId);
      if (!targetSessionId) {
        return null;
      }
      const provider = this.providers.get(targetSessionId);
      return provider ? provider.getAccountInfo() : null;
    } catch {
      return null;
    }
  }

  public async checkNumberExists(phoneNumber: string, sessionId?: string, userId?: string): Promise<{ exists: boolean; jid?: string }> {
    return this.getProvider(sessionId, userId).checkNumberExists(phoneNumber);
  }

  public async sendMessageToPhone(
    phoneNumber: string,
    message: string,
    sessionId?: string,
    useRoundRobin?: boolean,
    userId?: string
  ): Promise<SendMessageResult> {
    const provider = useRoundRobin ? this.getRoundRobinProvider(userId) : this.getProvider(sessionId, userId);
    return provider.sendMessageToPhone(phoneNumber, message);
  }

  public async sendMessageToLid(
    lid: string,
    message: string,
    options?: { simulateTyping?: boolean; typingDelayMs?: number },
    sessionId?: string,
    useRoundRobin?: boolean,
    userId?: string
  ): Promise<SendMessageResult> {
    const provider = useRoundRobin ? this.getRoundRobinProvider(userId) : this.getProvider(sessionId, userId);
    return provider.sendMessageToLid(lid, message, options);
  }

  public async getGroups(sessionId?: string, forceRefresh: boolean = false, userId?: string): Promise<ExtractedGroup[]> {
    return this.getProvider(sessionId, userId).getGroups(forceRefresh);
  }

  public async getGroupMembers(groupJid: string, sessionId?: string, forceRefresh: boolean = false, userId?: string): Promise<ExtractedMember[]> {
    return this.getProvider(sessionId, userId).getGroupMembers(groupJid, forceRefresh);
  }

  public async syncAllGroupLids(sessionId?: string, userId?: string): Promise<{ totalGroups: number; totalScanned: number; newMappings: number; totalMappings: number }> {
    return this.getProvider(sessionId, userId).syncAllGroupLids();
  }

  public async resolveLidsToPhones(lids: string[], sessionId?: string, userId?: string): Promise<Array<{
    lid: string;
    phone: string | null;
    jid: string | null;
    name: string | null;
    status: 'resolved' | 'unresolved';
    source?: string;
  }>> {
    return this.getProvider(sessionId, userId).resolveLidsToPhones(lids);
  }

  public async getGroupInviteInfo(codeOrLink: string, sessionId?: string, userId?: string): Promise<GroupInviteMetadata> {
    return this.getProvider(sessionId, userId).getGroupInviteInfo(codeOrLink);
  }

  public async acceptGroupInvite(codeOrLink: string, sessionId?: string, userId?: string, useRoundRobin: boolean = false): Promise<JoinGroupResult> {
    const provider = useRoundRobin ? this.getRoundRobinProvider(userId) : this.getProvider(sessionId, userId);
    return provider.acceptGroupInvite(codeOrLink);
  }

  public autoConnectPairedSessions(): void {
    for (const [sessionId, provider] of this.providers.entries()) {
      const credsPath = path.resolve(config.sessionsDir, `baileys_${sessionId}`, 'creds.json');
      if (fs.existsSync(credsPath)) {
        try {
          const parsedCreds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
          if (parsedCreds?.me?.id) {
            console.log(`[WhatsApp Manager] Auto-connecting paired device [${sessionId}] (${parsedCreds.me.id})...`);
            provider.connect().catch((err) => {
              console.warn(`[WhatsApp Manager] Auto-connect error for [${sessionId}]:`, err.message);
            });
          }
        } catch {
          // Ignore
        }
      }
    }
  }

  // ========================================================
  // SUPER ADMIN: SESSION CONTROLLER & DEVICE TERMINATOR
  // ========================================================

  private getDirectorySizeBytes(dirPath: string): number {
    let total = 0;
    try {
      if (!fs.existsSync(dirPath)) return 0;
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          total += this.getDirectorySizeBytes(fullPath);
        } else {
          try {
            total += fs.statSync(fullPath).size;
          } catch {}
        }
      }
    } catch {}
    return total;
  }

  public adminGetAllSessions(): Array<any> {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT 
        ws.*,
        u.username, u.name as user_name, u.email as user_email, u.plan_tier as user_plan
      FROM whatsapp_sessions ws
      LEFT JOIN users u ON ws.user_id = u.id
      ORDER BY ws.connected_at DESC, ws.created_at DESC
    `).all() as any[];

    return rows.map((row) => {
      const provider = this.providers.get(row.session_id);
      const liveStatus = provider ? provider.getStatus() : 'disconnected';
      const accountInfo = provider ? provider.getAccountInfo() : null;
      const sessionDir = path.resolve(config.sessionsDir, `baileys_${row.session_id}`);
      const diskBytes = this.getDirectorySizeBytes(sessionDir);

      return {
        id: row.id,
        session_id: row.session_id,
        user_id: row.user_id,
        username: row.username || 'system',
        user_name: row.user_name || 'System',
        user_email: row.user_email || null,
        user_plan: row.user_plan || 'starter',
        alias: row.alias,
        is_default: row.is_default === 1,
        status: liveStatus,
        phone_number: accountInfo?.phone || row.phone_number || null,
        jid: accountInfo?.jid || row.jid || null,
        display_name: accountInfo?.name || row.display_name || null,
        platform: accountInfo?.platform || row.platform || null,
        connected_at: row.connected_at || null,
        last_active_at: row.last_active_at || null,
        created_at: row.created_at,
        disk_bytes: diskBytes
      };
    });
  }

  public async adminDisconnectDevice(sessionId: string): Promise<void> {
    const provider = this.providers.get(sessionId);
    if (provider) {
      await provider.disconnect();
    }
    const db = getDatabase();
    db.prepare("UPDATE whatsapp_sessions SET status = 'disconnected', updated_at = datetime('now') WHERE session_id = ?").run(sessionId);
  }

  public async adminReconnectDevice(sessionId: string): Promise<void> {
    const provider = this.registerProvider(sessionId);
    try {
      await provider.disconnect();
    } catch {}
    await provider.connect();
  }

  public async adminTerminateDevice(sessionId: string): Promise<void> {
    const db = getDatabase();
    const row = db.prepare('SELECT user_id FROM whatsapp_sessions WHERE session_id = ?').get(sessionId) as { user_id?: string } | undefined;

    const provider = this.providers.get(sessionId);
    if (provider) {
      try {
        await provider.resetSession();
      } catch {
        try {
          await provider.disconnect();
        } catch {}
        try {
          await provider.clearSessionFiles();
        } catch {}
      }
      this.providers.delete(sessionId);
    } else {
      const sessionDir = path.resolve(config.sessionsDir, `baileys_${sessionId}`);
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }
    }

    db.prepare('DELETE FROM whatsapp_sessions WHERE session_id = ?').run(sessionId);

    if (row?.user_id) {
      const remaining = db.prepare('SELECT session_id FROM whatsapp_sessions WHERE user_id = ? ORDER BY created_at ASC LIMIT 1').get(row.user_id) as { session_id: string } | undefined;
      if (remaining) {
        db.prepare('UPDATE whatsapp_sessions SET is_default = 1 WHERE session_id = ?').run(remaining.session_id);
      }
      this.emit('devices:updated', { userId: row.user_id, devices: this.getAllSessions(row.user_id) });
    }
  }

  public async adminTerminateAllUserDevices(targetUserId: string): Promise<{ terminatedCount: number }> {
    const db = getDatabase();
    const rows = db.prepare('SELECT session_id FROM whatsapp_sessions WHERE user_id = ?').all(targetUserId) as { session_id: string }[];

    for (const r of rows) {
      await this.adminTerminateDevice(r.session_id);
    }

    return { terminatedCount: rows.length };
  }

  public adminGetSessionsDiskStats(): {
    totalFolders: number;
    totalBytes: number;
    orphanFolders: string[];
    orphanBytes: number;
  } {
    const db = getDatabase();
    const dbRows = db.prepare('SELECT session_id FROM whatsapp_sessions').all() as { session_id: string }[];
    const validDirs = new Set(dbRows.map((r) => `baileys_${r.session_id}`));

    let totalFolders = 0;
    let totalBytes = 0;
    const orphanFolders: string[] = [];
    let orphanBytes = 0;

    try {
      if (fs.existsSync(config.sessionsDir)) {
        const entries = fs.readdirSync(config.sessionsDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && entry.name.startsWith('baileys_')) {
            totalFolders++;
            const size = this.getDirectorySizeBytes(path.join(config.sessionsDir, entry.name));
            totalBytes += size;
            if (!validDirs.has(entry.name)) {
              orphanFolders.push(entry.name);
              orphanBytes += size;
            }
          }
        }
      }
    } catch {}

    return { totalFolders, totalBytes, orphanFolders, orphanBytes };
  }

  public adminPurgeOrphanSessionFolders(): { deletedCount: number; freedBytes: number } {
    const stats = this.adminGetSessionsDiskStats();
    let deletedCount = 0;
    let freedBytes = 0;

    for (const folderName of stats.orphanFolders) {
      const fullPath = path.join(config.sessionsDir, folderName);
      try {
        const size = this.getDirectorySizeBytes(fullPath);
        fs.rmSync(fullPath, { recursive: true, force: true });
        deletedCount++;
        freedBytes += size;
      } catch {}
    }

    return { deletedCount, freedBytes };
  }
}
