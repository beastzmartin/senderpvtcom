import crypto from 'crypto';
import { parse } from 'csv-parse/sync';
import { getDatabase } from '../db/database.js';

export interface ContactRecord {
  id: string;
  user_id?: string | null;
  name: string;
  phone_number?: string | null;
  lid?: string | null;
  avatar_url?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateContactDTO {
  name: string;
  phone_number?: string | null;
  lid?: string | null;
  avatar_url?: string | null;
  notes?: string | null;
}

export interface UpdateContactDTO {
  name?: string;
  phone_number?: string | null;
  lid?: string | null;
  avatar_url?: string | null;
  notes?: string | null;
}

export interface ImportResult {
  total: number;
  imported: number;
  skipped: number;
  errors: Array<{ row: number; reason: string }>;
}

export class ContactService {
  private static instance: ContactService | null = null;

  public static getInstance(): ContactService {
    if (!ContactService.instance) {
      ContactService.instance = new ContactService();
    }
    return ContactService.instance;
  }

  public getContacts(search?: string, userId?: string): ContactRecord[] {
    const db = getDatabase();
    if (userId) {
      if (search && search.trim()) {
        const term = `%${search.trim().toLowerCase()}%`;
        const stmt = db.prepare(`
          SELECT * FROM contacts
          WHERE user_id = ?
            AND (LOWER(name) LIKE ?
             OR LOWER(COALESCE(phone_number, '')) LIKE ?
             OR LOWER(COALESCE(lid, '')) LIKE ?)
          ORDER BY name ASC
        `);
        return stmt.all(userId, term, term, term) as ContactRecord[];
      }
      const stmt = db.prepare('SELECT * FROM contacts WHERE user_id = ? ORDER BY name ASC');
      return stmt.all(userId) as ContactRecord[];
    }

    if (search && search.trim()) {
      const term = `%${search.trim().toLowerCase()}%`;
      const stmt = db.prepare(`
        SELECT * FROM contacts
        WHERE LOWER(name) LIKE ?
           OR LOWER(COALESCE(phone_number, '')) LIKE ?
           OR LOWER(COALESCE(lid, '')) LIKE ?
        ORDER BY name ASC
      `);
      return stmt.all(term, term, term) as ContactRecord[];
    }

    const stmt = db.prepare('SELECT * FROM contacts ORDER BY name ASC');
    return stmt.all() as ContactRecord[];
  }

  public getContactById(id: string, userId?: string): ContactRecord | null {
    const db = getDatabase();
    if (userId) {
      const stmt = db.prepare('SELECT * FROM contacts WHERE id = ? AND user_id = ?');
      return (stmt.get(id, userId) as ContactRecord) || null;
    }
    const stmt = db.prepare('SELECT * FROM contacts WHERE id = ?');
    return (stmt.get(id) as ContactRecord) || null;
  }

  public createContact(dto: CreateContactDTO, userId?: string): ContactRecord {
    const db = getDatabase();

    if (!dto.name || dto.name.trim().length === 0) {
      throw new Error('Contact name is required.');
    }

    let phone = dto.phone_number ? dto.phone_number.trim() : null;
    if (phone) {
      const clean = phone.replace(/\D/g, '');
      if (clean.length >= 7) {
        phone = `+${clean}`;
      }
    }

    let lid = dto.lid ? dto.lid.trim() : null;
    if (lid) {
      if (!lid.endsWith('@lid') && /^\d+$/.test(lid)) {
        lid = `${lid}@lid`;
      }
    }

    if (!phone && !lid) {
      throw new Error('Contact must have at least a phone number or a WhatsApp LID.');
    }

    if (phone && lid) {
      this.upsertLidMapping(lid, phone, null, dto.name);
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const insertStmt = db.prepare(`
      INSERT INTO contacts (id, user_id, name, phone_number, lid, avatar_url, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(id, userId || null, dto.name.trim(), phone, lid, dto.avatar_url || null, dto.notes || null, now, now);

    // Link any existing conversations that match this phone or LID
    this.linkConversationsToContact(id, phone, lid, dto.name.trim(), userId);

    return this.getContactById(id, userId)!;
  }

  public updateContact(id: string, dto: UpdateContactDTO, userId?: string): ContactRecord {
    const db = getDatabase();
    const existing = this.getContactById(id, userId);
    if (!existing) {
      throw new Error(`Contact with ID ${id} not found.`);
    }

    let phone = dto.phone_number !== undefined ? (dto.phone_number ? dto.phone_number.trim() : null) : existing.phone_number;
    if (phone) {
      const clean = phone.replace(/\D/g, '');
      if (clean.length >= 7) {
        phone = `+${clean}`;
      }
    }

    let lid = dto.lid !== undefined ? (dto.lid ? dto.lid.trim() : null) : existing.lid;
    if (lid) {
      if (!lid.endsWith('@lid') && /^\d+$/.test(lid)) {
        lid = `${lid}@lid`;
      }
    }

    const name = dto.name !== undefined ? dto.name.trim() : existing.name;
    const avatar_url = dto.avatar_url !== undefined ? dto.avatar_url : existing.avatar_url;
    const notes = dto.notes !== undefined ? dto.notes : existing.notes;
    const now = new Date().toISOString();

    if (userId) {
      const updateStmt = db.prepare(`
        UPDATE contacts
        SET name = ?, phone_number = ?, lid = ?, avatar_url = ?, notes = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
      `);
      updateStmt.run(name, phone, lid, avatar_url, notes, now, id, userId);
    } else {
      const updateStmt = db.prepare(`
        UPDATE contacts
        SET name = ?, phone_number = ?, lid = ?, avatar_url = ?, notes = ?, updated_at = ?
        WHERE id = ?
      `);
      updateStmt.run(name, phone, lid, avatar_url, notes, now, id);
    }

    this.linkConversationsToContact(id, phone ?? null, lid ?? null, name, userId);

    return this.getContactById(id, userId)!;
  }

  public deleteContact(id: string, userId?: string): void {
    const db = getDatabase();
    if (userId) {
      const stmt = db.prepare('DELETE FROM contacts WHERE id = ? AND user_id = ?');
      stmt.run(id, userId);
    } else {
      const stmt = db.prepare('DELETE FROM contacts WHERE id = ?');
      stmt.run(id);
    }
  }

  private linkConversationsToContact(contactId: string, phone: string | null, lid: string | null, name: string, userId?: string): void {
    try {
      const db = getDatabase();
      if (phone) {
        const cleanPhone = phone.replace(/\D/g, '');
        const targetJid = `${cleanPhone}@s.whatsapp.net`;
        if (userId) {
          db.prepare(`
            UPDATE conversations
            SET contact_id = ?, display_name = ?
            WHERE user_id = ? AND (recipient_identifier = ? OR raw_identifier = ? OR raw_identifier = ?)
          `).run(contactId, name, userId, targetJid, phone, cleanPhone);
        } else {
          db.prepare(`
            UPDATE conversations
            SET contact_id = ?, display_name = ?
            WHERE recipient_identifier = ? OR raw_identifier = ? OR raw_identifier = ?
          `).run(contactId, name, targetJid, phone, cleanPhone);
        }
      }
      if (lid) {
        if (userId) {
          db.prepare(`
            UPDATE conversations
            SET contact_id = ?, display_name = ?
            WHERE user_id = ? AND (recipient_identifier = ? OR raw_identifier = ?)
          `).run(contactId, name, userId, lid, lid);
        } else {
          db.prepare(`
            UPDATE conversations
            SET contact_id = ?, display_name = ?
            WHERE recipient_identifier = ? OR raw_identifier = ?
          `).run(contactId, name, lid, lid);
        }
      }
    } catch (err) {
      console.error('[Contact Service] Error linking conversation to contact:', err);
    }
  }

  public importCsv(csvContent: string, userId?: string): ImportResult {
    const result: ImportResult = {
      total: 0,
      imported: 0,
      skipped: 0,
      errors: []
    };

    try {
      const records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      }) as Record<string, string>[];

      result.total = records.length;

      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        const rowNum = i + 1;

        // Flexible column mapping (case-insensitive)
        const name = row.name || row.Name || row.NAME || row['Full Name'] || row.contact_name;
        const phone = row.phone || row.Phone || row.PHONE || row.phone_number || row['Phone Number'] || row.mobile;
        const lid = row.lid || row.Lid || row.LID || row.whatsapp_lid || row['WhatsApp LID'];
        const notes = row.notes || row.Notes || row.notes || '';

        if (!name) {
          result.skipped++;
          result.errors.push({ row: rowNum, reason: 'Missing name column/value' });
          continue;
        }

        if (!phone && !lid) {
          result.skipped++;
          result.errors.push({ row: rowNum, reason: 'Row has neither phone nor LID' });
          continue;
        }

        try {
          this.createContact({
            name,
            phone_number: phone || null,
            lid: lid || null,
            notes: notes || null
          }, userId);
          result.imported++;
        } catch (err: any) {
          result.skipped++;
          result.errors.push({ row: rowNum, reason: err.message });
        }
      }
    } catch (err: any) {
      throw new Error(`CSV parsing error: ${err.message}`);
    }

    return result;
  }

  public normalizeLid(lid: string): string {
    let clean = (lid || '').trim();
    if (clean.includes(':')) {
      // Strip device suffix (e.g. 216256653340861:13@lid -> 216256653340861@lid)
      const parts = clean.split(':');
      const num = parts[0];
      clean = clean.endsWith('@lid') ? `${num}@lid` : num;
    }
    if (!clean.endsWith('@lid') && /^\d+$/.test(clean)) {
      clean = `${clean}@lid`;
    }
    return clean;
  }

  public normalizePhone(phoneNumber: string): string | null {
    let clean = (phoneNumber || '').trim();
    if (clean.includes(':')) {
      clean = clean.split(':')[0];
    }
    const digits = clean.replace(/\D/g, '');
    if (digits.length >= 7) {
      return `+${digits}`;
    }
    return null;
  }

  /**
   * Persist or update a bi-directional mapping between a WhatsApp LID and a phone number
   */
  public upsertLidMapping(
    lid: string,
    phoneNumber?: string | null,
    jid?: string | null,
    displayName?: string | null
  ): void {
    const db = getDatabase();
    const cleanLid = this.normalizeLid(lid);
    if (!cleanLid || !cleanLid.endsWith('@lid')) return;

    let cleanPhone = phoneNumber ? this.normalizePhone(phoneNumber) : null;
    let cleanJid = jid ? jid.trim() : null;
    if (cleanJid && cleanJid.includes(':')) {
      cleanJid = cleanJid.split(':')[0] + '@s.whatsapp.net';
    }
    if (!cleanJid && cleanPhone) {
      cleanJid = `${cleanPhone.replace(/\D/g, '')}@s.whatsapp.net`;
    }

    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO lid_mappings (lid, phone_number, jid, display_name, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(lid) DO UPDATE SET
        phone_number = COALESCE(excluded.phone_number, lid_mappings.phone_number),
        jid = COALESCE(excluded.jid, lid_mappings.jid),
        display_name = COALESCE(excluded.display_name, lid_mappings.display_name),
        updated_at = excluded.updated_at
    `);

    stmt.run(cleanLid, cleanPhone, cleanJid, displayName || null, now);

    // Cross-link with contacts table if matching contact exists
    if (cleanPhone) {
      const updateContactLid = db.prepare(`
        UPDATE contacts
        SET lid = ?, updated_at = ?
        WHERE (lid IS NULL OR lid = '')
          AND (REPLACE(REPLACE(REPLACE(phone_number, '+', ''), '-', ''), ' ', '') = ?
               OR REPLACE(REPLACE(REPLACE(phone_number, '+', ''), '-', ''), ' ', '') LIKE ?)
      `);
      const rawDigits = cleanPhone.replace(/\D/g, '');
      updateContactLid.run(cleanLid, now, rawDigits, `%${rawDigits}`);
    }

    if (cleanLid && cleanPhone) {
      const updateContactPhone = db.prepare(`
        UPDATE contacts
        SET phone_number = ?, updated_at = ?
        WHERE (phone_number IS NULL OR phone_number = '')
          AND (lid = ? OR lid LIKE ?)
      `);
      const numericLid = cleanLid.replace('@lid', '');
      updateContactPhone.run(cleanPhone, now, cleanLid, `${numericLid}%`);
    }
  }

  /**
   * Fast bulk upsert of discovered LID mappings inside a single database transaction
   */
  public bulkUpsertLidMappings(
    mappings: Array<{ lid: string; phone: string; jid?: string | null; name?: string | null }>
  ): number {
    if (!mappings || mappings.length === 0) return 0;
    const db = getDatabase();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO lid_mappings (lid, phone_number, jid, display_name, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(lid) DO UPDATE SET
        phone_number = COALESCE(excluded.phone_number, lid_mappings.phone_number),
        jid = COALESCE(excluded.jid, lid_mappings.jid),
        display_name = COALESCE(excluded.display_name, lid_mappings.display_name),
        updated_at = excluded.updated_at
    `);

    const updateContactLid = db.prepare(`
      UPDATE contacts
      SET lid = ?, updated_at = ?
      WHERE (lid IS NULL OR lid = '')
        AND (REPLACE(REPLACE(REPLACE(phone_number, '+', ''), '-', ''), ' ', '') = ?
             OR REPLACE(REPLACE(REPLACE(phone_number, '+', ''), '-', ''), ' ', '') LIKE ?)
    `);

    const updateContactPhone = db.prepare(`
      UPDATE contacts
      SET phone_number = ?, updated_at = ?
      WHERE (phone_number IS NULL OR phone_number = '')
        AND (lid = ? OR lid LIKE ?)
    `);

    let count = 0;
    const runInTx = db.transaction(() => {
      for (const m of mappings) {
        const cleanLid = this.normalizeLid(m.lid);
        const cleanPhone = this.normalizePhone(m.phone);
        if (!cleanLid || !cleanPhone) continue;

        let cleanJid = m.jid ? m.jid.trim() : null;
        if (cleanJid && cleanJid.includes(':')) {
          cleanJid = cleanJid.split(':')[0] + '@s.whatsapp.net';
        }
        if (!cleanJid && cleanPhone) {
          cleanJid = `${cleanPhone.replace(/\D/g, '')}@s.whatsapp.net`;
        }

        stmt.run(cleanLid, cleanPhone, cleanJid, m.name || null, now);

        const rawDigits = cleanPhone.replace(/\D/g, '');
        updateContactLid.run(cleanLid, now, rawDigits, `%${rawDigits}`);

        const numericLid = cleanLid.replace('@lid', '');
        updateContactPhone.run(cleanPhone, now, cleanLid, `${numericLid}%`);
        count++;
      }
    });

    try {
      runInTx();
    } catch (err) {
      console.warn('[Contact Service] bulkUpsertLidMappings transaction error:', err);
    }

    return count;
  }

  /**
   * Fast in-memory map of all known LID -> Phone numbers to avoid thousands of DB queries
   */
  public getAllKnownLidMap(): Map<string, string> {
    const db = getDatabase();
    const map = new Map<string, string>();
    try {
      const rows = db.prepare('SELECT lid, phone_number FROM lid_mappings WHERE phone_number IS NOT NULL').all() as Array<{
        lid: string;
        phone_number: string;
      }>;
      for (const r of rows) {
        if (r.lid && r.phone_number) {
          map.set(r.lid, r.phone_number);
          const numericPart = r.lid.replace('@lid', '');
          map.set(numericPart, r.phone_number);
        }
      }

      // Also pull from contacts table
      const cRows = db.prepare('SELECT lid, phone_number FROM contacts WHERE lid IS NOT NULL AND phone_number IS NOT NULL').all() as Array<{
        lid: string;
        phone_number: string;
      }>;
      for (const r of cRows) {
        if (r.lid && r.phone_number && !map.has(r.lid)) {
          map.set(r.lid, r.phone_number);
          const numericPart = r.lid.replace('@lid', '');
          map.set(numericPart, r.phone_number);
        }
      }
    } catch (err) {
      console.warn('[Contact Service] Error retrieving known LID map:', err);
    }
    return map;
  }

  public getPhoneForLid(lid: string): string | null {
    const db = getDatabase();
    const cleanLid = this.normalizeLid(lid);
    if (!cleanLid) return null;

    // 1. Direct query in lid_mappings
    const stmt = db.prepare('SELECT phone_number FROM lid_mappings WHERE lid = ? LIMIT 1');
    const row = stmt.get(cleanLid) as { phone_number: string | null } | undefined;
    if (row?.phone_number) return row.phone_number;

    // 2. Query by numeric LID prefix (in case stored with device ID)
    const numericPart = cleanLid.replace('@lid', '');
    const prefixStmt = db.prepare('SELECT phone_number FROM lid_mappings WHERE lid LIKE ? LIMIT 1');
    const prefixRow = prefixStmt.get(`${numericPart}%`) as { phone_number: string | null } | undefined;
    if (prefixRow?.phone_number) return prefixRow.phone_number;

    // 3. Fallback to contacts table
    const contactStmt = db.prepare('SELECT phone_number FROM contacts WHERE (lid = ? OR lid LIKE ?) AND phone_number IS NOT NULL LIMIT 1');
    const contactRow = contactStmt.get(cleanLid, `${numericPart}%`) as { phone_number: string | null } | undefined;
    return contactRow?.phone_number || null;
  }

  public getLidForPhone(phoneNumber: string): string | null {
    const db = getDatabase();
    const cleanPhone = this.normalizePhone(phoneNumber);
    if (!cleanPhone) return null;
    const digits = cleanPhone.replace(/\D/g, '');

    const stmt = db.prepare('SELECT lid FROM lid_mappings WHERE phone_number = ? OR phone_number LIKE ? LIMIT 1');
    const row = stmt.get(cleanPhone, `%${digits}`) as { lid: string | null } | undefined;
    if (row?.lid) return row.lid;

    const contactStmt = db.prepare('SELECT lid FROM contacts WHERE (phone_number = ? OR phone_number LIKE ?) AND lid IS NOT NULL LIMIT 1');
    const contactRow = contactStmt.get(cleanPhone, `%${digits}`) as { lid: string | null } | undefined;
    return contactRow?.lid || null;
  }

  /**
   * Bulk resolve a list of LIDs against local database and contacts
   */
  public bulkResolveLidsLocally(lids: string[]): Array<{
    lid: string;
    phone: string | null;
    jid: string | null;
    name: string | null;
    status: 'resolved' | 'unresolved';
    source?: string;
  }> {
    const db = getDatabase();
    const results: Array<{
      lid: string;
      phone: string | null;
      jid: string | null;
      name: string | null;
      status: 'resolved' | 'unresolved';
      source?: string;
    }> = [];

    const stmt = db.prepare(`
      SELECT phone_number, jid, display_name FROM lid_mappings
      WHERE lid = ? OR lid LIKE ?
      LIMIT 1
    `);

    const contactStmt = db.prepare(`
      SELECT phone_number, name FROM contacts
      WHERE (lid = ? OR lid LIKE ?) AND phone_number IS NOT NULL
      LIMIT 1
    `);

    for (const rawLid of lids) {
      const cleanLid = this.normalizeLid(rawLid);
      if (!cleanLid) continue;
      const numericPart = cleanLid.replace('@lid', '');

      const row = stmt.get(cleanLid, `${numericPart}%`) as {
        phone_number: string | null;
        jid: string | null;
        display_name: string | null;
      } | undefined;

      if (row && row.phone_number) {
        results.push({
          lid: cleanLid,
          phone: row.phone_number,
          jid: row.jid || `${row.phone_number.replace(/\D/g, '')}@s.whatsapp.net`,
          name: row.display_name || null,
          status: 'resolved',
          source: 'database'
        });
        continue;
      }

      // Check contacts table
      const cRow = contactStmt.get(cleanLid, `${numericPart}%`) as {
        phone_number: string | null;
        name: string | null;
      } | undefined;

      if (cRow && cRow.phone_number) {
        results.push({
          lid: cleanLid,
          phone: cRow.phone_number,
          jid: `${cRow.phone_number.replace(/\D/g, '')}@s.whatsapp.net`,
          name: cRow.name || null,
          status: 'resolved',
          source: 'contacts_book'
        });
        continue;
      }

      results.push({
        lid: cleanLid,
        phone: null,
        jid: null,
        name: null,
        status: 'unresolved'
      });
    }

    return results;
  }

  /**
   * Get all stored LID mappings with search and pagination
   */
  public getLidMappings(options?: { search?: string; limit?: number; offset?: number }): {
    data: Array<{
      lid: string;
      phone_number: string | null;
      jid: string | null;
      display_name: string | null;
      updated_at: string;
    }>;
    total: number;
  } {
    const db = getDatabase();
    const limit = options?.limit || 100;
    const offset = options?.offset || 0;

    if (options?.search && options.search.trim()) {
      const term = `%${options.search.trim().toLowerCase()}%`;
      const countStmt = db.prepare(`
        SELECT count(*) as count FROM lid_mappings
        WHERE LOWER(lid) LIKE ? OR LOWER(COALESCE(phone_number, '')) LIKE ? OR LOWER(COALESCE(display_name, '')) LIKE ?
      `);
      const total = (countStmt.get(term, term, term) as { count: number }).count;

      const dataStmt = db.prepare(`
        SELECT * FROM lid_mappings
        WHERE LOWER(lid) LIKE ? OR LOWER(COALESCE(phone_number, '')) LIKE ? OR LOWER(COALESCE(display_name, '')) LIKE ?
        ORDER BY updated_at DESC
        LIMIT ? OFFSET ?
      `);
      const data = dataStmt.all(term, term, term, limit, offset) as any[];

      return { data, total };
    }

    const total = (db.prepare('SELECT count(*) as count FROM lid_mappings').get() as { count: number }).count;
    const data = db.prepare('SELECT * FROM lid_mappings ORDER BY updated_at DESC LIMIT ? OFFSET ?').all(limit, offset) as any[];
    return { data, total };
  }
}
