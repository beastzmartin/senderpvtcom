import Database from 'better-sqlite3';
import crypto from 'crypto';
import { getDatabase } from '../../db/database.js';
import {
  CrmStorageAdapter,
  ContactListParams
} from './CrmStorageAdapter.js';
import {
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
  Contact,
  Company,
  CrmList,
  CrmTag,
  CustomFieldDefinition,
  ActivityTimelineItem,
  CrmImport,
  CrmExport,
  CrmApiKey,
  CrmApiUsageLog,
  CrmWebhook,
  CrmWebhookDelivery,
  SuppressionRecord,
  AuditLogEntry,
  FilterGroup,
  PaginatedResult,
  ImportDedupeRule
} from '../models/types.js';
import { CrmNormalizer } from '../services/crmNormalizer.js';
import { CrmFilterBuilder } from '../services/crmFilterBuilder.js';

export class CrmSqliteAdapter implements CrmStorageAdapter {
  public isPostgres = false;
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
  }

  public async initialize(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS crm_workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        owner_user_id TEXT NOT NULL,
        settings TEXT NOT NULL DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS crm_workspace_members (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'read_only')),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE (workspace_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS crm_companies (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        domain TEXT,
        industry TEXT,
        size_range TEXT,
        country TEXT,
        city TEXT,
        phone TEXT,
        website TEXT,
        linkedin_url TEXT,
        custom_fields TEXT NOT NULL DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        deleted_at TEXT
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_companies_ws_domain ON crm_companies (workspace_id, domain) WHERE domain IS NOT NULL AND deleted_at IS NULL;

      CREATE TABLE IF NOT EXISTS crm_contacts (
        id TEXT NOT NULL,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        first_name TEXT,
        last_name TEXT,
        email TEXT,
        email_normalized TEXT,
        phone TEXT,
        phone_e164 TEXT,
        company_id TEXT REFERENCES crm_companies(id) ON DELETE SET NULL,
        title TEXT,
        country TEXT,
        city TEXT,
        source TEXT NOT NULL DEFAULT 'manual',
        source_id TEXT,
        lead_score INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'customer', 'unresponsive', 'unqualified')),
        custom_fields TEXT NOT NULL DEFAULT '{}',
        email_status TEXT NOT NULL DEFAULT 'unknown' CHECK (email_status IN ('valid', 'invalid', 'risky', 'unknown')),
        verified_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        deleted_at TEXT,
        PRIMARY KEY (workspace_id, id)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_contacts_ws_email ON crm_contacts (workspace_id, email_normalized) WHERE email_normalized IS NOT NULL AND deleted_at IS NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_contacts_ws_phone ON crm_contacts (workspace_id, phone_e164) WHERE phone_e164 IS NOT NULL AND deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_crm_contacts_keyset ON crm_contacts (workspace_id, created_at DESC, id DESC) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_crm_contacts_status ON crm_contacts (workspace_id, status) WHERE deleted_at IS NULL;

      CREATE TABLE IF NOT EXISTS crm_lists (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        is_dynamic INTEGER NOT NULL DEFAULT 0,
        filter_definition TEXT,
        cached_count INTEGER NOT NULL DEFAULT 0,
        last_counted_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS crm_list_members (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        list_id TEXT NOT NULL REFERENCES crm_lists(id) ON DELETE CASCADE,
        contact_id TEXT NOT NULL,
        added_at TEXT DEFAULT (datetime('now')),
        UNIQUE (list_id, contact_id)
      );

      CREATE INDEX IF NOT EXISTS idx_crm_list_members_ws ON crm_list_members(workspace_id, contact_id);

      CREATE TABLE IF NOT EXISTS crm_tags (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#3b82f6',
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE (workspace_id, name)
      );

      CREATE TABLE IF NOT EXISTS crm_contact_tags (
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        contact_id TEXT NOT NULL,
        tag_id TEXT NOT NULL REFERENCES crm_tags(id) ON DELETE CASCADE,
        created_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (contact_id, tag_id)
      );

      CREATE TABLE IF NOT EXISTS crm_custom_field_definitions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        target_entity TEXT NOT NULL DEFAULT 'contact',
        name TEXT NOT NULL,
        field_key TEXT NOT NULL,
        field_type TEXT NOT NULL,
        options TEXT DEFAULT '[]',
        is_required INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE (workspace_id, target_entity, field_key)
      );

      CREATE TABLE IF NOT EXISTS crm_activities (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        contact_id TEXT NOT NULL,
        user_id TEXT,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        details TEXT NOT NULL DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_crm_activities_ws_contact ON crm_activities (workspace_id, contact_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS crm_imports (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        file_path TEXT,
        total_rows INTEGER NOT NULL DEFAULT 0,
        processed_rows INTEGER NOT NULL DEFAULT 0,
        imported_rows INTEGER NOT NULL DEFAULT 0,
        updated_rows INTEGER NOT NULL DEFAULT 0,
        skipped_rows INTEGER NOT NULL DEFAULT 0,
        error_rows INTEGER NOT NULL DEFAULT 0,
        dedupe_rule TEXT NOT NULL DEFAULT 'update',
        column_mapping TEXT NOT NULL,
        list_id TEXT REFERENCES crm_lists(id),
        status TEXT NOT NULL DEFAULT 'pending',
        error_report_url TEXT,
        error_details TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS crm_exports (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        format TEXT NOT NULL,
        total_records INTEGER NOT NULL DEFAULT 0,
        filter_definition TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        file_path TEXT,
        download_url TEXT,
        expires_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS crm_api_keys (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        key_prefix TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        scopes TEXT NOT NULL DEFAULT '["contacts:read","contacts:write"]',
        rate_limit_rpm INTEGER NOT NULL DEFAULT 600,
        monthly_quota INTEGER NOT NULL DEFAULT 500000,
        monthly_usage INTEGER NOT NULL DEFAULT 0,
        is_test INTEGER NOT NULL DEFAULT 0,
        revoked_at TEXT,
        last_used_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS crm_api_usage_logs (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        api_key_id TEXT REFERENCES crm_api_keys(id) ON DELETE SET NULL,
        endpoint TEXT NOT NULL,
        method TEXT NOT NULL,
        status_code INTEGER NOT NULL,
        response_time_ms INTEGER NOT NULL,
        credits_charged REAL NOT NULL DEFAULT 0.0,
        currency TEXT NOT NULL DEFAULT 'INR',
        ip_address TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS crm_webhooks (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        description TEXT,
        events TEXT NOT NULL DEFAULT '["contact.created","contact.updated"]',
        secret TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        failure_count INTEGER NOT NULL DEFAULT 0,
        last_triggered_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS crm_webhook_deliveries (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        webhook_id TEXT NOT NULL REFERENCES crm_webhooks(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        status_code INTEGER,
        response_body TEXT,
        duration_ms INTEGER,
        attempt INTEGER NOT NULL DEFAULT 1,
        success INTEGER NOT NULL,
        delivered_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS crm_suppression_list (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('email', 'phone', 'domain')),
        value_normalized TEXT NOT NULL,
        reason TEXT NOT NULL DEFAULT 'unsubscribe',
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE (workspace_id, type, value_normalized)
      );

      CREATE TABLE IF NOT EXISTS crm_audit_log (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
        user_id TEXT,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        changes TEXT,
        ip_address TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }

  // =========================================================================
  // WORKSPACES
  // =========================================================================
  public async getWorkspace(id: string): Promise<Workspace | null> {
    const row = this.db.prepare('SELECT * FROM crm_workspaces WHERE id = ?').get(id) as any;
    if (!row) return null;
    return {
      ...row,
      settings: JSON.parse(row.settings || '{}')
    };
  }

  public async getWorkspaceBySlug(slug: string): Promise<Workspace | null> {
    const row = this.db.prepare('SELECT * FROM crm_workspaces WHERE slug = ?').get(slug) as any;
    if (!row) return null;
    return {
      ...row,
      settings: JSON.parse(row.settings || '{}')
    };
  }

  public async getUserDefaultWorkspace(userId: string): Promise<Workspace> {
    // Check if member of any workspace
    const memberRow = this.db.prepare(`
      SELECT w.* FROM crm_workspaces w
      JOIN crm_workspace_members m ON m.workspace_id = w.id
      WHERE m.user_id = ?
      ORDER BY w.created_at ASC
      LIMIT 1
    `).get(userId) as any;

    if (memberRow) {
      return {
        ...memberRow,
        settings: JSON.parse(memberRow.settings || '{}')
      };
    }

    // Provision personal default workspace
    const userRow = this.db.prepare('SELECT username, name, company_name FROM users WHERE id = ?').get(userId) as any;
    const name = userRow?.company_name || `${userRow?.name || userRow?.username || 'User'}'s Workspace`;
    const baseSlug = (userRow?.username || 'user').toLowerCase().replace(/[^a-z0-9]/g, '');
    const slug = `${baseSlug}-ws-${Date.now().toString().slice(-4)}`;

    return this.createWorkspace(userId, name, slug);
  }

  public async getUserWorkspaces(userId: string): Promise<Workspace[]> {
    const rows = this.db.prepare(`
      SELECT w.*, m.role FROM crm_workspaces w
      JOIN crm_workspace_members m ON m.workspace_id = w.id
      WHERE m.user_id = ?
      ORDER BY w.name ASC
    `).all(userId) as any[];

    return rows.map((r) => ({
      ...r,
      settings: JSON.parse(r.settings || '{}')
    }));
  }

  public async createWorkspace(userId: string, name: string, slug?: string): Promise<Workspace> {
    const id = crypto.randomUUID();
    const finalSlug = slug || name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now().toString().slice(-4);

    const tx = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO crm_workspaces (id, name, slug, owner_user_id, settings, created_at, updated_at)
        VALUES (?, ?, ?, ?, '{}', datetime('now'), datetime('now'))
      `).run(id, name.trim(), finalSlug, userId);

      const memberId = crypto.randomUUID();
      this.db.prepare(`
        INSERT INTO crm_workspace_members (id, workspace_id, user_id, role, created_at, updated_at)
        VALUES (?, ?, ?, 'owner', datetime('now'), datetime('now'))
      `).run(memberId, id, userId);
    });

    tx();
    return this.getWorkspace(id) as Promise<Workspace>;
  }

  public async getWorkspaceMemberRole(workspaceId: string, userId: string): Promise<WorkspaceRole | null> {
    const row = this.db.prepare('SELECT role FROM crm_workspace_members WHERE workspace_id = ? AND user_id = ?').get(workspaceId, userId) as any;
    return row ? (row.role as WorkspaceRole) : null;
  }

  public async addWorkspaceMember(workspaceId: string, userId: string, role: WorkspaceRole): Promise<WorkspaceMember> {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO crm_workspace_members (id, workspace_id, user_id, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = excluded.role, updated_at = datetime('now')
    `).run(id, workspaceId, userId, role);

    const row = this.db.prepare('SELECT * FROM crm_workspace_members WHERE workspace_id = ? AND user_id = ?').get(workspaceId, userId) as any;
    return row;
  }

  public async listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    return this.db.prepare('SELECT * FROM crm_workspace_members WHERE workspace_id = ?').all(workspaceId) as any[];
  }

  // =========================================================================
  // CONTACTS (KEYSET / CURSOR PAGINATION ONLY)
  // =========================================================================
  public async listContacts(workspaceId: string, params: ContactListParams = {}): Promise<PaginatedResult<Contact>> {
    const limit = Math.min(200, Math.max(1, params.pagination?.limit || 50));
    const conditions: string[] = ['c.workspace_id = ?'];
    const sqlParams: any[] = [workspaceId];

    if (!params.includeDeleted) {
      conditions.push('c.deleted_at IS NULL');
    }

    // List membership filter
    if (params.listId) {
      conditions.push('EXISTS (SELECT 1 FROM crm_list_members lm WHERE lm.contact_id = c.id AND lm.list_id = ?)');
      sqlParams.push(params.listId);
    }

    // Tag filter
    if (params.tagId) {
      conditions.push('EXISTS (SELECT 1 FROM crm_contact_tags ct WHERE ct.contact_id = c.id AND ct.tag_id = ?)');
      sqlParams.push(params.tagId);
    }

    // General text search
    if (params.search && params.search.trim()) {
      const q = `%${params.search.trim()}%`;
      conditions.push(`(
        c.first_name LIKE ? OR
        c.last_name LIKE ? OR
        c.email LIKE ? OR
        c.phone LIKE ? OR
        comp.name LIKE ?
      )`);
      sqlParams.push(q, q, q, q, q);
    }

    // Dynamic Filter Builder
    if (params.filter && params.filter.conditions && params.filter.conditions.length > 0) {
      const fragment = CrmFilterBuilder.buildFilterClause(params.filter, false);
      if (fragment.sql && fragment.sql !== '1=1') {
        conditions.push(`(${fragment.sql})`);
        sqlParams.push(...fragment.params);
      }
    }

    // Keyset (Cursor) Pagination: (created_at, id) < (cursor_created_at, cursor_id)
    if (params.pagination?.cursor) {
      const cursor = CrmNormalizer.decodeCursor(params.pagination.cursor);
      if (cursor) {
        conditions.push('(c.created_at < ? OR (c.created_at = ? AND c.id < ?))');
        sqlParams.push(cursor.created_at, cursor.created_at, cursor.id);
      }
    }

    const whereClause = conditions.join(' AND ');

    // Keyset query + 1 to test if there are more
    const query = `
      SELECT c.*, comp.name as company_name
      FROM crm_contacts c
      LEFT JOIN crm_companies comp ON comp.id = c.company_id
      WHERE ${whereClause}
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT ?
    `;

    sqlParams.push(limit + 1);
    const rows = this.db.prepare(query).all(...sqlParams) as any[];

    const hasMore = rows.length > limit;
    const resultRows = hasMore ? rows.slice(0, limit) : rows;

    let nextCursor: string | null = null;
    if (hasMore && resultRows.length > 0) {
      const last = resultRows[resultRows.length - 1];
      nextCursor = CrmNormalizer.encodeCursor({ created_at: last.created_at, id: last.id });
    }

    const contacts: Contact[] = resultRows.map((r) => this.mapContactRow(r));

    // Approximate total count
    const countRow = this.db.prepare(`SELECT count(*) as total FROM crm_contacts c WHERE c.workspace_id = ? AND c.deleted_at IS NULL`).get(workspaceId) as any;

    return {
      data: contacts,
      next_cursor: nextCursor,
      prev_cursor: null,
      has_more: hasMore,
      approximate_total: countRow?.total || 0
    };
  }

  public async getContact(workspaceId: string, contactId: string): Promise<Contact | null> {
    const row = this.db.prepare(`
      SELECT c.*, comp.name as company_name
      FROM crm_contacts c
      LEFT JOIN crm_companies comp ON comp.id = c.company_id
      WHERE c.workspace_id = ? AND c.id = ?
    `).get(workspaceId, contactId) as any;

    if (!row) return null;
    const contact = this.mapContactRow(row);

    // Fetch tags
    const tagRows = this.db.prepare(`
      SELECT t.name FROM crm_tags t
      JOIN crm_contact_tags ct ON ct.tag_id = t.id
      WHERE ct.contact_id = ?
    `).all(contactId) as any[];
    contact.tags = tagRows.map((t) => t.name);

    return contact;
  }

  public async createContact(workspaceId: string, data: Partial<Contact>): Promise<Contact> {
    const id = data.id || crypto.randomUUID();
    const emailNorm = CrmNormalizer.normalizeEmail(data.email);
    const phoneE164 = CrmNormalizer.normalizePhone(data.phone);

    this.db.prepare(`
      INSERT INTO crm_contacts (
        id, workspace_id, first_name, last_name, email, email_normalized,
        phone, phone_e164, company_id, title, country, city,
        source, source_id, lead_score, status, custom_fields,
        email_status, verified_at, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, datetime('now'), datetime('now')
      )
    `).run(
      id,
      workspaceId,
      CrmNormalizer.cleanText(data.first_name),
      CrmNormalizer.cleanText(data.last_name),
      CrmNormalizer.cleanText(data.email),
      emailNorm,
      CrmNormalizer.cleanText(data.phone),
      phoneE164,
      data.company_id || null,
      CrmNormalizer.cleanText(data.title),
      CrmNormalizer.cleanText(data.country),
      CrmNormalizer.cleanText(data.city),
      data.source || 'manual',
      data.source_id || null,
      Number(data.lead_score || 0),
      data.status || 'new',
      JSON.stringify(data.custom_fields || {}),
      data.email_status || 'unknown',
      data.verified_at || null
    );

    return (await this.getContact(workspaceId, id))!;
  }

  public async bulkUpsertContacts(
    workspaceId: string,
    contacts: Partial<Contact>[],
    dedupeRule: ImportDedupeRule = 'update'
  ): Promise<{ inserted: number; updated: number; skipped: number; errors: any[] }> {
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const errors: any[] = [];

    const insertStmt = this.db.prepare(`
      INSERT INTO crm_contacts (
        id, workspace_id, first_name, last_name, email, email_normalized,
        phone, phone_e164, company_id, title, country, city,
        source, source_id, lead_score, status, custom_fields,
        email_status, verified_at, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, datetime('now'), datetime('now')
      )
    `);

    const updateStmt = this.db.prepare(`
      UPDATE crm_contacts SET
        first_name = COALESCE(?, first_name),
        last_name = COALESCE(?, last_name),
        phone = COALESCE(?, phone),
        phone_e164 = COALESCE(?, phone_e164),
        company_id = COALESCE(?, company_id),
        title = COALESCE(?, title),
        country = COALESCE(?, country),
        city = COALESCE(?, city),
        status = COALESCE(?, status),
        custom_fields = ?,
        updated_at = datetime('now')
      WHERE workspace_id = ? AND id = ?
    `);

    const findByEmailStmt = this.db.prepare(`
      SELECT id, custom_fields FROM crm_contacts
      WHERE workspace_id = ? AND email_normalized = ? AND deleted_at IS NULL
      LIMIT 1
    `);

    const findByPhoneStmt = this.db.prepare(`
      SELECT id, custom_fields FROM crm_contacts
      WHERE workspace_id = ? AND phone_e164 = ? AND deleted_at IS NULL
      LIMIT 1
    `);

    const tx = this.db.transaction(() => {
      for (const c of contacts) {
        try {
          const emailNorm = CrmNormalizer.normalizeEmail(c.email);
          const phoneE164 = CrmNormalizer.normalizePhone(c.phone);

          if (!emailNorm && !phoneE164 && !c.first_name && !c.last_name) {
            skipped++;
            continue;
          }

          let existing: any = null;
          if (emailNorm) {
            existing = findByEmailStmt.get(workspaceId, emailNorm);
          }
          if (!existing && phoneE164) {
            existing = findByPhoneStmt.get(workspaceId, phoneE164);
          }

          if (existing) {
            if (dedupeRule === 'skip') {
              skipped++;
              continue;
            }

            // Merge or update custom fields
            const existingCustom = JSON.parse(existing.custom_fields || '{}');
            const mergedCustom = dedupeRule === 'merge'
              ? { ...existingCustom, ...(c.custom_fields || {}) }
              : (c.custom_fields || existingCustom);

            updateStmt.run(
              CrmNormalizer.cleanText(c.first_name),
              CrmNormalizer.cleanText(c.last_name),
              CrmNormalizer.cleanText(c.phone),
              phoneE164,
              c.company_id || null,
              CrmNormalizer.cleanText(c.title),
              CrmNormalizer.cleanText(c.country),
              CrmNormalizer.cleanText(c.city),
              c.status || null,
              JSON.stringify(mergedCustom),
              workspaceId,
              existing.id
            );
            updated++;
          } else {
            const id = c.id || crypto.randomUUID();
            insertStmt.run(
              id,
              workspaceId,
              CrmNormalizer.cleanText(c.first_name),
              CrmNormalizer.cleanText(c.last_name),
              CrmNormalizer.cleanText(c.email),
              emailNorm,
              CrmNormalizer.cleanText(c.phone),
              phoneE164,
              c.company_id || null,
              CrmNormalizer.cleanText(c.title),
              CrmNormalizer.cleanText(c.country),
              CrmNormalizer.cleanText(c.city),
              c.source || 'import',
              c.source_id || null,
              Number(c.lead_score || 0),
              c.status || 'new',
              JSON.stringify(c.custom_fields || {}),
              c.email_status || 'unknown',
              c.verified_at || null
            );
            inserted++;
          }
        } catch (err: any) {
          errors.push({ contact: c, error: err.message });
        }
      }
    });

    tx();
    return { inserted, updated, skipped, errors };
  }

  public async updateContact(workspaceId: string, contactId: string, data: Partial<Contact>): Promise<Contact> {
    const existing = await this.getContact(workspaceId, contactId);
    if (!existing) {
      throw new Error(`Contact not found: ${contactId}`);
    }

    const emailNorm = data.email !== undefined ? CrmNormalizer.normalizeEmail(data.email) : existing.email_normalized;
    const phoneE164 = data.phone !== undefined ? CrmNormalizer.normalizePhone(data.phone) : existing.phone_e164;
    const customFields = data.custom_fields !== undefined ? { ...existing.custom_fields, ...data.custom_fields } : existing.custom_fields;

    this.db.prepare(`
      UPDATE crm_contacts SET
        first_name = COALESCE(?, first_name),
        last_name = COALESCE(?, last_name),
        email = COALESCE(?, email),
        email_normalized = ?,
        phone = COALESCE(?, phone),
        phone_e164 = ?,
        company_id = COALESCE(?, company_id),
        title = COALESCE(?, title),
        country = COALESCE(?, country),
        city = COALESCE(?, city),
        status = COALESCE(?, status),
        lead_score = COALESCE(?, lead_score),
        custom_fields = ?,
        email_status = COALESCE(?, email_status),
        updated_at = datetime('now')
      WHERE workspace_id = ? AND id = ?
    `).run(
      data.first_name !== undefined ? CrmNormalizer.cleanText(data.first_name) : null,
      data.last_name !== undefined ? CrmNormalizer.cleanText(data.last_name) : null,
      data.email !== undefined ? CrmNormalizer.cleanText(data.email) : null,
      emailNorm,
      data.phone !== undefined ? CrmNormalizer.cleanText(data.phone) : null,
      phoneE164,
      data.company_id !== undefined ? data.company_id : null,
      data.title !== undefined ? CrmNormalizer.cleanText(data.title) : null,
      data.country !== undefined ? CrmNormalizer.cleanText(data.country) : null,
      data.city !== undefined ? CrmNormalizer.cleanText(data.city) : null,
      data.status || null,
      data.lead_score !== undefined ? data.lead_score : null,
      JSON.stringify(customFields),
      data.email_status || null,
      workspaceId,
      contactId
    );

    return (await this.getContact(workspaceId, contactId))!;
  }

  public async deleteContact(workspaceId: string, contactId: string, soft: boolean = true): Promise<boolean> {
    if (soft) {
      this.db.prepare(`
        UPDATE crm_contacts SET deleted_at = datetime('now'), updated_at = datetime('now')
        WHERE workspace_id = ? AND id = ?
      `).run(workspaceId, contactId);
    } else {
      this.db.prepare(`DELETE FROM crm_contacts WHERE workspace_id = ? AND id = ?`).run(workspaceId, contactId);
    }
    return true;
  }

  public async restoreContact(workspaceId: string, contactId: string): Promise<boolean> {
    this.db.prepare(`
      UPDATE crm_contacts SET deleted_at = NULL, updated_at = datetime('now')
      WHERE workspace_id = ? AND id = ?
    `).run(workspaceId, contactId);
    return true;
  }

  public async findDuplicates(workspaceId: string, limit: number = 50): Promise<Array<{ field: string; value: string; contact_ids: string[]; contacts: Contact[] }>> {
    // Duplicates on email
    const emailDupes = this.db.prepare(`
      SELECT email_normalized as val, count(*) as cnt, group_concat(id) as ids
      FROM crm_contacts
      WHERE workspace_id = ? AND email_normalized IS NOT NULL AND deleted_at IS NULL
      GROUP BY email_normalized
      HAVING count(*) > 1
      LIMIT ?
    `).all(workspaceId, limit) as any[];

    // Duplicates on phone
    const phoneDupes = this.db.prepare(`
      SELECT phone_e164 as val, count(*) as cnt, group_concat(id) as ids
      FROM crm_contacts
      WHERE workspace_id = ? AND phone_e164 IS NOT NULL AND deleted_at IS NULL
      GROUP BY phone_e164
      HAVING count(*) > 1
      LIMIT ?
    `).all(workspaceId, limit) as any[];

    const results: Array<{ field: string; value: string; contact_ids: string[]; contacts: Contact[] }> = [];

    for (const d of emailDupes) {
      const ids = d.ids.split(',');
      const contacts: Contact[] = [];
      for (const id of ids) {
        const c = await this.getContact(workspaceId, id);
        if (c) contacts.push(c);
      }
      results.push({ field: 'email', value: d.val, contact_ids: ids, contacts });
    }

    for (const d of phoneDupes) {
      const ids = d.ids.split(',');
      const contacts: Contact[] = [];
      for (const id of ids) {
        const c = await this.getContact(workspaceId, id);
        if (c) contacts.push(c);
      }
      results.push({ field: 'phone', value: d.val, contact_ids: ids, contacts });
    }

    return results;
  }

  public async mergeContacts(
    workspaceId: string,
    primaryId: string,
    duplicateId: string,
    fieldResolutions: Record<string, any> = {}
  ): Promise<Contact> {
    const primary = await this.getContact(workspaceId, primaryId);
    const duplicate = await this.getContact(workspaceId, duplicateId);
    if (!primary || !duplicate) {
      throw new Error('Primary or duplicate contact not found.');
    }

    const mergedData: Partial<Contact> = {
      first_name: fieldResolutions.first_name || primary.first_name || duplicate.first_name,
      last_name: fieldResolutions.last_name || primary.last_name || duplicate.last_name,
      email: fieldResolutions.email || primary.email || duplicate.email,
      phone: fieldResolutions.phone || primary.phone || duplicate.phone,
      company_id: fieldResolutions.company_id || primary.company_id || duplicate.company_id,
      title: fieldResolutions.title || primary.title || duplicate.title,
      country: fieldResolutions.country || primary.country || duplicate.country,
      city: fieldResolutions.city || primary.city || duplicate.city,
      status: fieldResolutions.status || primary.status || duplicate.status,
      custom_fields: { ...duplicate.custom_fields, ...primary.custom_fields, ...(fieldResolutions.custom_fields || {}) }
    };

    const tx = this.db.transaction(() => {
      // Re-link list memberships and tags
      this.db.prepare(`
        INSERT OR IGNORE INTO crm_list_members (id, workspace_id, list_id, contact_id, added_at)
        SELECT lower(hex(randomblob(16))), workspace_id, list_id, ?, added_at
        FROM crm_list_members WHERE contact_id = ?
      `).run(primaryId, duplicateId);

      this.db.prepare(`
        INSERT OR IGNORE INTO crm_contact_tags (workspace_id, contact_id, tag_id, created_at)
        SELECT workspace_id, ?, tag_id, created_at
        FROM crm_contact_tags WHERE contact_id = ?
      `).run(primaryId, duplicateId);

      // Re-link activities
      this.db.prepare('UPDATE crm_activities SET contact_id = ? WHERE contact_id = ?').run(primaryId, duplicateId);

      // Soft delete duplicate
      this.deleteContact(workspaceId, duplicateId, true);
    });

    tx();
    return this.updateContact(workspaceId, primaryId, mergedData);
  }

  public async getApproximateContactCount(workspaceId: string, filter?: FilterGroup): Promise<number> {
    if (!filter || !filter.conditions || filter.conditions.length === 0) {
      const row = this.db.prepare('SELECT count(*) as cnt FROM crm_contacts WHERE workspace_id = ? AND deleted_at IS NULL').get(workspaceId) as any;
      return row?.cnt || 0;
    }

    const fragment = CrmFilterBuilder.buildFilterClause(filter, false);
    const row = this.db.prepare(`SELECT count(*) as cnt FROM crm_contacts WHERE workspace_id = ? AND deleted_at IS NULL AND ${fragment.sql}`).get(workspaceId, ...fragment.params) as any;
    return row?.cnt || 0;
  }

  // =========================================================================
  // COMPANIES
  // =========================================================================
  public async getCompany(workspaceId: string, companyId: string): Promise<Company | null> {
    const row = this.db.prepare(`
      SELECT comp.*, (SELECT count(*) FROM crm_contacts c WHERE c.company_id = comp.id AND c.deleted_at IS NULL) as contacts_count
      FROM crm_companies comp
      WHERE comp.workspace_id = ? AND comp.id = ? AND comp.deleted_at IS NULL
    `).get(workspaceId, companyId) as any;

    if (!row) return null;
    return {
      ...row,
      custom_fields: JSON.parse(row.custom_fields || '{}')
    };
  }

  public async listCompanies(workspaceId: string, search?: string, limit: number = 50): Promise<Company[]> {
    let query = `
      SELECT comp.*, (SELECT count(*) FROM crm_contacts c WHERE c.company_id = comp.id AND c.deleted_at IS NULL) as contacts_count
      FROM crm_companies comp
      WHERE comp.workspace_id = ? AND comp.deleted_at IS NULL
    `;
    const params: any[] = [workspaceId];

    if (search && search.trim()) {
      query += ' AND (comp.name LIKE ? OR comp.domain LIKE ?)';
      params.push(`%${search.trim()}%`, `%${search.trim()}%`);
    }

    query += ' ORDER BY comp.name ASC LIMIT ?';
    params.push(limit);

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map((r) => ({
      ...r,
      custom_fields: JSON.parse(r.custom_fields || '{}')
    }));
  }

  public async createCompany(workspaceId: string, data: Partial<Company>): Promise<Company> {
    const id = data.id || crypto.randomUUID();
    const domain = CrmNormalizer.extractDomain(data.domain || data.website);

    this.db.prepare(`
      INSERT INTO crm_companies (
        id, workspace_id, name, domain, industry, size_range,
        country, city, phone, website, linkedin_url, custom_fields,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        datetime('now'), datetime('now')
      )
    `).run(
      id,
      workspaceId,
      (data.name || 'Unnamed Company').trim(),
      domain,
      data.industry || null,
      data.size_range || null,
      data.country || null,
      data.city || null,
      data.phone || null,
      data.website || null,
      data.linkedin_url || null,
      JSON.stringify(data.custom_fields || {})
    );

    return (await this.getCompany(workspaceId, id))!;
  }

  public async updateCompany(workspaceId: string, companyId: string, data: Partial<Company>): Promise<Company> {
    const existing = await this.getCompany(workspaceId, companyId);
    if (!existing) throw new Error('Company not found');

    this.db.prepare(`
      UPDATE crm_companies SET
        name = COALESCE(?, name),
        domain = COALESCE(?, domain),
        industry = COALESCE(?, industry),
        size_range = COALESCE(?, size_range),
        country = COALESCE(?, country),
        city = COALESCE(?, city),
        phone = COALESCE(?, phone),
        website = COALESCE(?, website),
        linkedin_url = COALESCE(?, linkedin_url),
        custom_fields = ?,
        updated_at = datetime('now')
      WHERE workspace_id = ? AND id = ?
    `).run(
      data.name ? data.name.trim() : null,
      data.domain !== undefined ? CrmNormalizer.extractDomain(data.domain) : null,
      data.industry !== undefined ? data.industry : null,
      data.size_range !== undefined ? data.size_range : null,
      data.country !== undefined ? data.country : null,
      data.city !== undefined ? data.city : null,
      data.phone !== undefined ? data.phone : null,
      data.website !== undefined ? data.website : null,
      data.linkedin_url !== undefined ? data.linkedin_url : null,
      JSON.stringify({ ...existing.custom_fields, ...(data.custom_fields || {}) }),
      workspaceId,
      companyId
    );

    return (await this.getCompany(workspaceId, companyId))!;
  }

  public async findOrCreateCompanyByDomain(workspaceId: string, name: string, domainOrUrl?: string): Promise<Company> {
    const domain = CrmNormalizer.extractDomain(domainOrUrl);
    if (domain) {
      const existing = this.db.prepare('SELECT id FROM crm_companies WHERE workspace_id = ? AND domain = ? AND deleted_at IS NULL').get(workspaceId, domain) as any;
      if (existing) {
        return (await this.getCompany(workspaceId, existing.id))!;
      }
    }

    return this.createCompany(workspaceId, { name, domain });
  }

  // =========================================================================
  // LISTS & SEGMENTS
  // =========================================================================
  public async listLists(workspaceId: string): Promise<CrmList[]> {
    const rows = this.db.prepare('SELECT * FROM crm_lists WHERE workspace_id = ? ORDER BY name ASC').all(workspaceId) as any[];
    return rows.map((r) => ({
      ...r,
      is_dynamic: Boolean(r.is_dynamic),
      filter_definition: r.filter_definition ? JSON.parse(r.filter_definition) : null
    }));
  }

  public async getList(workspaceId: string, listId: string): Promise<CrmList | null> {
    const row = this.db.prepare('SELECT * FROM crm_lists WHERE workspace_id = ? AND id = ?').get(workspaceId, listId) as any;
    if (!row) return null;
    return {
      ...row,
      is_dynamic: Boolean(row.is_dynamic),
      filter_definition: row.filter_definition ? JSON.parse(row.filter_definition) : null
    };
  }

  public async createList(workspaceId: string, name: string, description?: string, isDynamic: boolean = false, filterDef?: FilterGroup): Promise<CrmList> {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO crm_lists (id, workspace_id, name, description, is_dynamic, filter_definition, cached_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
    `).run(id, workspaceId, name.trim(), description || null, isDynamic ? 1 : 0, filterDef ? JSON.stringify(filterDef) : null);

    return (await this.getList(workspaceId, id))!;
  }

  public async updateList(workspaceId: string, listId: string, data: Partial<CrmList>): Promise<CrmList> {
    this.db.prepare(`
      UPDATE crm_lists SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        filter_definition = COALESCE(?, filter_definition),
        updated_at = datetime('now')
      WHERE workspace_id = ? AND id = ?
    `).run(
      data.name ? data.name.trim() : null,
      data.description !== undefined ? data.description : null,
      data.filter_definition !== undefined ? JSON.stringify(data.filter_definition) : null,
      workspaceId,
      listId
    );

    return (await this.getList(workspaceId, listId))!;
  }

  public async deleteList(workspaceId: string, listId: string): Promise<boolean> {
    this.db.prepare('DELETE FROM crm_lists WHERE workspace_id = ? AND id = ?').run(workspaceId, listId);
    return true;
  }

  public async addContactsToList(workspaceId: string, listId: string, contactIds: string[]): Promise<number> {
    let added = 0;
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO crm_list_members (id, workspace_id, list_id, contact_id, added_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `);

    const tx = this.db.transaction(() => {
      for (const cid of contactIds) {
        const res = stmt.run(crypto.randomUUID(), workspaceId, listId, cid);
        if (res.changes > 0) added++;
      }
    });

    tx();
    await this.refreshListCount(workspaceId, listId);
    return added;
  }

  public async removeContactsFromList(workspaceId: string, listId: string, contactIds: string[]): Promise<number> {
    let removed = 0;
    const stmt = this.db.prepare('DELETE FROM crm_list_members WHERE workspace_id = ? AND list_id = ? AND contact_id = ?');

    const tx = this.db.transaction(() => {
      for (const cid of contactIds) {
        const res = stmt.run(workspaceId, listId, cid);
        removed += res.changes;
      }
    });

    tx();
    await this.refreshListCount(workspaceId, listId);
    return removed;
  }

  public async refreshListCount(workspaceId: string, listId: string): Promise<number> {
    const list = await this.getList(workspaceId, listId);
    if (!list) return 0;

    let count = 0;
    if (list.is_dynamic && list.filter_definition) {
      count = await this.getApproximateContactCount(workspaceId, list.filter_definition);
    } else {
      const row = this.db.prepare('SELECT count(*) as cnt FROM crm_list_members WHERE list_id = ?').get(listId) as any;
      count = row?.cnt || 0;
    }

    this.db.prepare('UPDATE crm_lists SET cached_count = ?, last_counted_at = datetime("now") WHERE id = ?').run(count, listId);
    return count;
  }

  // =========================================================================
  // TAGS
  // =========================================================================
  public async listTags(workspaceId: string): Promise<CrmTag[]> {
    const rows = this.db.prepare(`
      SELECT t.*, (SELECT count(*) FROM crm_contact_tags ct WHERE ct.tag_id = t.id) as contacts_count
      FROM crm_tags t
      WHERE t.workspace_id = ?
      ORDER BY t.name ASC
    `).all(workspaceId) as any[];

    return rows;
  }

  public async createTag(workspaceId: string, name: string, color: string = '#3b82f6'): Promise<CrmTag> {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO crm_tags (id, workspace_id, name, color, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT (workspace_id, name) DO UPDATE SET color = excluded.color
    `).run(id, workspaceId, name.trim(), color);

    const row = this.db.prepare('SELECT * FROM crm_tags WHERE workspace_id = ? AND name = ?').get(workspaceId, name.trim()) as any;
    return row;
  }

  public async deleteTag(workspaceId: string, tagId: string): Promise<boolean> {
    this.db.prepare('DELETE FROM crm_tags WHERE workspace_id = ? AND id = ?').run(workspaceId, tagId);
    return true;
  }

  public async tagContacts(workspaceId: string, tagId: string, contactIds: string[]): Promise<number> {
    let tagged = 0;
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO crm_contact_tags (workspace_id, contact_id, tag_id, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `);

    const tx = this.db.transaction(() => {
      for (const cid of contactIds) {
        const res = stmt.run(workspaceId, cid, tagId);
        if (res.changes > 0) tagged++;
      }
    });

    tx();
    return tagged;
  }

  public async untagContacts(workspaceId: string, tagId: string, contactIds: string[]): Promise<number> {
    let removed = 0;
    const stmt = this.db.prepare('DELETE FROM crm_contact_tags WHERE workspace_id = ? AND tag_id = ? AND contact_id = ?');

    const tx = this.db.transaction(() => {
      for (const cid of contactIds) {
        const res = stmt.run(workspaceId, tagId, cid);
        removed += res.changes;
      }
    });

    tx();
    return removed;
  }

  // =========================================================================
  // CUSTOM FIELDS
  // =========================================================================
  public async listCustomFields(workspaceId: string, entity: 'contact' | 'company' = 'contact'): Promise<CustomFieldDefinition[]> {
    const rows = this.db.prepare(`
      SELECT * FROM crm_custom_field_definitions
      WHERE workspace_id = ? AND target_entity = ?
      ORDER BY name ASC
    `).all(workspaceId, entity) as any[];

    return rows.map((r) => ({
      ...r,
      is_required: Boolean(r.is_required),
      options: JSON.parse(r.options || '[]')
    }));
  }

  public async createCustomField(workspaceId: string, data: Partial<CustomFieldDefinition>): Promise<CustomFieldDefinition> {
    const id = crypto.randomUUID();
    const fieldKey = (data.field_key || data.name || '').toLowerCase().replace(/[^a-z0-9_]/g, '_');

    this.db.prepare(`
      INSERT INTO crm_custom_field_definitions (
        id, workspace_id, target_entity, name, field_key, field_type, options, is_required, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      id,
      workspaceId,
      data.target_entity || 'contact',
      (data.name || fieldKey).trim(),
      fieldKey,
      data.field_type || 'text',
      JSON.stringify(data.options || []),
      data.is_required ? 1 : 0
    );

    const row = this.db.prepare('SELECT * FROM crm_custom_field_definitions WHERE id = ?').get(id) as any;
    return {
      ...row,
      is_required: Boolean(row.is_required),
      options: JSON.parse(row.options || '[]')
    };
  }

  public async deleteCustomField(workspaceId: string, fieldId: string): Promise<boolean> {
    this.db.prepare('DELETE FROM crm_custom_field_definitions WHERE workspace_id = ? AND id = ?').run(workspaceId, fieldId);
    return true;
  }

  // =========================================================================
  // ACTIVITIES TIMELINE
  // =========================================================================
  public async listActivities(workspaceId: string, contactId: string, limit: number = 50): Promise<ActivityTimelineItem[]> {
    const rows = this.db.prepare(`
      SELECT * FROM crm_activities
      WHERE workspace_id = ? AND contact_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(workspaceId, contactId, limit) as any[];

    return rows.map((r) => ({
      ...r,
      details: JSON.parse(r.details || '{}')
    }));
  }

  public async logActivity(workspaceId: string, activity: Partial<ActivityTimelineItem>): Promise<ActivityTimelineItem> {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO crm_activities (id, workspace_id, contact_id, user_id, type, title, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      id,
      workspaceId,
      activity.contact_id,
      activity.user_id || null,
      activity.type || 'note',
      activity.title || 'Note',
      JSON.stringify(activity.details || {})
    );

    const row = this.db.prepare('SELECT * FROM crm_activities WHERE id = ?').get(id) as any;
    return {
      ...row,
      details: JSON.parse(row.details || '{}')
    };
  }

  // =========================================================================
  // IMPORTS
  // =========================================================================
  public async createImport(workspaceId: string, data: Partial<CrmImport>): Promise<CrmImport> {
    const id = data.id || crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO crm_imports (
        id, workspace_id, user_id, filename, file_path, total_rows, processed_rows,
        imported_rows, updated_rows, skipped_rows, error_rows, dedupe_rule,
        column_mapping, list_id, status, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, 0,
        0, 0, 0, 0, ?,
        ?, ?, 'pending', datetime('now')
      )
    `).run(
      id,
      workspaceId,
      data.user_id || 'system',
      data.filename || 'import.csv',
      data.file_path || null,
      data.total_rows || 0,
      data.dedupe_rule || 'update',
      JSON.stringify(data.column_mapping || {}),
      data.list_id || null
    );

    return (await this.getImport(workspaceId, id))!;
  }

  public async getImport(workspaceId: string, importId: string): Promise<CrmImport | null> {
    const row = this.db.prepare('SELECT * FROM crm_imports WHERE workspace_id = ? AND id = ?').get(workspaceId, importId) as any;
    if (!row) return null;
    return {
      ...row,
      column_mapping: JSON.parse(row.column_mapping || '{}')
    };
  }

  public async updateImport(workspaceId: string, importId: string, updates: Partial<CrmImport>): Promise<CrmImport> {
    this.db.prepare(`
      UPDATE crm_imports SET
        processed_rows = COALESCE(?, processed_rows),
        imported_rows = COALESCE(?, imported_rows),
        updated_rows = COALESCE(?, updated_rows),
        skipped_rows = COALESCE(?, skipped_rows),
        error_rows = COALESCE(?, error_rows),
        status = COALESCE(?, status),
        error_report_url = COALESCE(?, error_report_url),
        error_details = COALESCE(?, error_details),
        completed_at = CASE WHEN ? IN ('completed', 'failed') THEN datetime('now') ELSE completed_at END
      WHERE workspace_id = ? AND id = ?
    `).run(
      updates.processed_rows !== undefined ? updates.processed_rows : null,
      updates.imported_rows !== undefined ? updates.imported_rows : null,
      updates.updated_rows !== undefined ? updates.updated_rows : null,
      updates.skipped_rows !== undefined ? updates.skipped_rows : null,
      updates.error_rows !== undefined ? updates.error_rows : null,
      updates.status || null,
      updates.error_report_url || null,
      updates.error_details || null,
      updates.status || null,
      workspaceId,
      importId
    );

    return (await this.getImport(workspaceId, importId))!;
  }

  public async listImports(workspaceId: string, limit: number = 20): Promise<CrmImport[]> {
    const rows = this.db.prepare('SELECT * FROM crm_imports WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?').all(workspaceId, limit) as any[];
    return rows.map((r) => ({
      ...r,
      column_mapping: JSON.parse(r.column_mapping || '{}')
    }));
  }

  // =========================================================================
  // EXPORTS
  // =========================================================================
  public async createExport(workspaceId: string, data: Partial<CrmExport>): Promise<CrmExport> {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO crm_exports (
        id, workspace_id, user_id, format, total_records, filter_definition,
        status, file_path, download_url, expires_at, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        'pending', ?, ?, datetime('now', '+7 days'), datetime('now')
      )
    `).run(
      id,
      workspaceId,
      data.user_id || 'system',
      data.format || 'csv',
      data.total_records || 0,
      data.filter_definition ? JSON.stringify(data.filter_definition) : null,
      data.file_path || null,
      data.download_url || null
    );

    return (await this.getExport(workspaceId, id))!;
  }

  public async getExport(workspaceId: string, exportId: string): Promise<CrmExport | null> {
    const row = this.db.prepare('SELECT * FROM crm_exports WHERE workspace_id = ? AND id = ?').get(workspaceId, exportId) as any;
    if (!row) return null;
    return {
      ...row,
      filter_definition: row.filter_definition ? JSON.parse(row.filter_definition) : null
    };
  }

  public async updateExport(workspaceId: string, exportId: string, updates: Partial<CrmExport>): Promise<CrmExport> {
    this.db.prepare(`
      UPDATE crm_exports SET
        status = COALESCE(?, status),
        total_records = COALESCE(?, total_records),
        file_path = COALESCE(?, file_path),
        download_url = COALESCE(?, download_url),
        completed_at = CASE WHEN ? IN ('completed', 'failed') THEN datetime('now') ELSE completed_at END
      WHERE workspace_id = ? AND id = ?
    `).run(
      updates.status || null,
      updates.total_records !== undefined ? updates.total_records : null,
      updates.file_path || null,
      updates.download_url || null,
      updates.status || null,
      workspaceId,
      exportId
    );

    return (await this.getExport(workspaceId, exportId))!;
  }

  public async listExports(workspaceId: string, limit: number = 20): Promise<CrmExport[]> {
    const rows = this.db.prepare('SELECT * FROM crm_exports WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?').all(workspaceId, limit) as any[];
    return rows.map((r) => ({
      ...r,
      filter_definition: r.filter_definition ? JSON.parse(r.filter_definition) : null
    }));
  }

  // =========================================================================
  // SUPPRESSION LIST
  // =========================================================================
  public async checkSuppressed(workspaceId: string, params: { email?: string; phone?: string; domain?: string }): Promise<boolean> {
    const emailNorm = CrmNormalizer.normalizeEmail(params.email);
    const phoneE164 = CrmNormalizer.normalizePhone(params.phone);
    const domain = CrmNormalizer.extractDomain(params.domain || params.email);

    const row = this.db.prepare(`
      SELECT 1 FROM crm_suppression_list
      WHERE workspace_id = ? AND (
        (type = 'email' AND value_normalized = ? AND ? IS NOT NULL) OR
        (type = 'phone' AND value_normalized = ? AND ? IS NOT NULL) OR
        (type = 'domain' AND value_normalized = ? AND ? IS NOT NULL)
      )
      LIMIT 1
    `).get(
      workspaceId,
      emailNorm, emailNorm,
      phoneE164, phoneE164,
      domain, domain
    );

    return Boolean(row);
  }

  public async addSuppression(workspaceId: string, record: Partial<SuppressionRecord>): Promise<SuppressionRecord> {
    const id = crypto.randomUUID();
    let val = (record.value_normalized || '').trim().toLowerCase();
    if (record.type === 'phone') {
      val = CrmNormalizer.normalizePhone(val) || val;
    } else if (record.type === 'email') {
      val = CrmNormalizer.normalizeEmail(val) || val;
    }

    this.db.prepare(`
      INSERT INTO crm_suppression_list (id, workspace_id, type, value_normalized, reason, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT (workspace_id, type, value_normalized) DO UPDATE SET reason = excluded.reason
    `).run(id, workspaceId, record.type, val, record.reason || 'unsubscribe');

    const row = this.db.prepare('SELECT * FROM crm_suppression_list WHERE workspace_id = ? AND type = ? AND value_normalized = ?').get(workspaceId, record.type, val) as any;
    return row;
  }

  public async listSuppression(workspaceId: string, limit: number = 100): Promise<SuppressionRecord[]> {
    return this.db.prepare('SELECT * FROM crm_suppression_list WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?').all(workspaceId, limit) as any[];
  }

  public async removeSuppression(workspaceId: string, id: string): Promise<boolean> {
    this.db.prepare('DELETE FROM crm_suppression_list WHERE workspace_id = ? AND id = ?').run(workspaceId, id);
    return true;
  }

  // =========================================================================
  // API KEYS & USAGE LOGS
  // =========================================================================
  public async createApiKey(workspaceId: string, data: Partial<CrmApiKey>): Promise<{ apiKey: CrmApiKey; rawSecretKey: string }> {
    const id = crypto.randomUUID();
    const rawSecret = `crm_${data.is_test ? 'test' : 'live'}_${crypto.randomBytes(24).toString('hex')}`;
    const prefix = rawSecret.slice(0, 12);
    const hash = crypto.createHash('sha256').update(rawSecret).digest('hex');

    this.db.prepare(`
      INSERT INTO crm_api_keys (
        id, workspace_id, user_id, name, key_prefix, key_hash, scopes,
        rate_limit_rpm, monthly_quota, monthly_usage, is_test, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, 0, ?, datetime('now')
      )
    `).run(
      id,
      workspaceId,
      data.user_id || 'system',
      (data.name || 'API Key').trim(),
      prefix,
      hash,
      JSON.stringify(data.scopes || ['contacts:read', 'contacts:write']),
      data.rate_limit_rpm || 600,
      data.monthly_quota || 500000,
      data.is_test ? 1 : 0
    );

    const apiKey = (await this.getApiKeyByHash(hash))!;
    return { apiKey, rawSecretKey: rawSecret };
  }

  public async getApiKeyByHash(keyHash: string): Promise<CrmApiKey | null> {
    const row = this.db.prepare('SELECT * FROM crm_api_keys WHERE key_hash = ? AND revoked_at IS NULL').get(keyHash) as any;
    if (!row) return null;
    return {
      ...row,
      scopes: JSON.parse(row.scopes || '[]'),
      is_test: Boolean(row.is_test)
    };
  }

  public async updateApiKeyUsage(apiKeyId: string, incrementRequests: number = 1): Promise<void> {
    this.db.prepare(`
      UPDATE crm_api_keys
      SET monthly_usage = monthly_usage + ?, last_used_at = datetime('now')
      WHERE id = ?
    `).run(incrementRequests, apiKeyId);
  }

  public async listApiKeys(workspaceId: string): Promise<CrmApiKey[]> {
    const rows = this.db.prepare('SELECT * FROM crm_api_keys WHERE workspace_id = ? ORDER BY created_at DESC').all(workspaceId) as any[];
    return rows.map((r) => ({
      ...r,
      scopes: JSON.parse(r.scopes || '[]'),
      is_test: Boolean(r.is_test)
    }));
  }

  public async revokeApiKey(workspaceId: string, apiKeyId: string): Promise<boolean> {
    this.db.prepare('UPDATE crm_api_keys SET revoked_at = datetime("now") WHERE workspace_id = ? AND id = ?').run(workspaceId, apiKeyId);
    return true;
  }

  public async logApiUsage(log: Partial<CrmApiUsageLog>): Promise<void> {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO crm_api_usage_logs (
        id, workspace_id, api_key_id, endpoint, method, status_code,
        response_time_ms, credits_charged, currency, ip_address, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      id,
      log.workspace_id,
      log.api_key_id || null,
      log.endpoint || '/',
      log.method || 'GET',
      log.status_code || 200,
      log.response_time_ms || 0,
      log.credits_charged || 0,
      log.currency || 'INR',
      log.ip_address || null
    );
  }

  public async getApiUsageStats(workspaceId: string, days: number = 30): Promise<{ totalRequests: number; totalCreditsCharged: number; byEndpoint: Record<string, number> }> {
    const rows = this.db.prepare(`
      SELECT endpoint, count(*) as cnt, sum(credits_charged) as total_charged
      FROM crm_api_usage_logs
      WHERE workspace_id = ? AND created_at >= datetime('now', '-' || ? || ' days')
      GROUP BY endpoint
    `).all(workspaceId, days) as any[];

    let totalRequests = 0;
    let totalCreditsCharged = 0;
    const byEndpoint: Record<string, number> = {};

    rows.forEach((r) => {
      totalRequests += r.cnt;
      totalCreditsCharged += Number(r.total_charged || 0);
      byEndpoint[r.endpoint] = r.cnt;
    });

    return { totalRequests, totalCreditsCharged, byEndpoint };
  }

  // =========================================================================
  // WEBHOOKS & DELIVERIES
  // =========================================================================
  public async listWebhooks(workspaceId: string): Promise<CrmWebhook[]> {
    const rows = this.db.prepare('SELECT * FROM crm_webhooks WHERE workspace_id = ? ORDER BY created_at DESC').all(workspaceId) as any[];
    return rows.map((r) => ({
      ...r,
      events: JSON.parse(r.events || '[]'),
      is_active: Boolean(r.is_active)
    }));
  }

  public async getWebhook(workspaceId: string, id: string): Promise<CrmWebhook | null> {
    const row = this.db.prepare('SELECT * FROM crm_webhooks WHERE workspace_id = ? AND id = ?').get(workspaceId, id) as any;
    if (!row) return null;
    return {
      ...row,
      events: JSON.parse(row.events || '[]'),
      is_active: Boolean(row.is_active)
    };
  }

  public async createWebhook(workspaceId: string, data: Partial<CrmWebhook>): Promise<CrmWebhook> {
    const id = crypto.randomUUID();
    const secret = `whsec_${crypto.randomBytes(24).toString('hex')}`;

    this.db.prepare(`
      INSERT INTO crm_webhooks (
        id, workspace_id, url, description, events, secret, is_active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))
    `).run(
      id,
      workspaceId,
      data.url?.trim(),
      data.description || null,
      JSON.stringify(data.events || ['contact.created', 'contact.updated']),
      secret
    );

    return (await this.getWebhook(workspaceId, id))!;
  }

  public async updateWebhook(workspaceId: string, id: string, data: Partial<CrmWebhook>): Promise<CrmWebhook> {
    this.db.prepare(`
      UPDATE crm_webhooks SET
        url = COALESCE(?, url),
        description = COALESCE(?, description),
        events = COALESCE(?, events),
        is_active = COALESCE(?, is_active)
      WHERE workspace_id = ? AND id = ?
    `).run(
      data.url ? data.url.trim() : null,
      data.description !== undefined ? data.description : null,
      data.events ? JSON.stringify(data.events) : null,
      data.is_active !== undefined ? (data.is_active ? 1 : 0) : null,
      workspaceId,
      id
    );

    return (await this.getWebhook(workspaceId, id))!;
  }

  public async deleteWebhook(workspaceId: string, id: string): Promise<boolean> {
    this.db.prepare('DELETE FROM crm_webhooks WHERE workspace_id = ? AND id = ?').run(workspaceId, id);
    return true;
  }

  public async logWebhookDelivery(delivery: Partial<CrmWebhookDelivery>): Promise<void> {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO crm_webhook_deliveries (
        id, workspace_id, webhook_id, event_type, payload, status_code,
        response_body, duration_ms, attempt, success, delivered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      id,
      delivery.workspace_id,
      delivery.webhook_id,
      delivery.event_type,
      JSON.stringify(delivery.payload || {}),
      delivery.status_code || null,
      delivery.response_body ? delivery.response_body.slice(0, 1000) : null,
      delivery.duration_ms || 0,
      delivery.attempt || 1,
      delivery.success ? 1 : 0
    );
  }

  public async listWebhookDeliveries(workspaceId: string, webhookId: string, limit: number = 50): Promise<CrmWebhookDelivery[]> {
    const rows = this.db.prepare('SELECT * FROM crm_webhook_deliveries WHERE workspace_id = ? AND webhook_id = ? ORDER BY delivered_at DESC LIMIT ?').all(workspaceId, webhookId, limit) as any[];
    return rows.map((r) => ({
      ...r,
      payload: JSON.parse(r.payload || '{}'),
      success: Boolean(r.success)
    }));
  }

  // =========================================================================
  // AUDIT LOG
  // =========================================================================
  public async logAudit(entry: Partial<AuditLogEntry>): Promise<void> {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO crm_audit_log (id, workspace_id, user_id, action, entity_type, entity_id, changes, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      id,
      entry.workspace_id,
      entry.user_id || null,
      entry.action || 'update',
      entry.entity_type || 'contact',
      entry.entity_id || '',
      entry.changes ? JSON.stringify(entry.changes) : null,
      entry.ip_address || null
    );
  }

  public async listAuditLogs(workspaceId: string, limit: number = 100): Promise<AuditLogEntry[]> {
    const rows = this.db.prepare('SELECT * FROM crm_audit_log WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?').all(workspaceId, limit) as any[];
    return rows.map((r) => ({
      ...r,
      changes: r.changes ? JSON.parse(r.changes) : null
    }));
  }

  private mapContactRow(r: any): Contact {
    return {
      id: r.id,
      workspace_id: r.workspace_id,
      first_name: r.first_name,
      last_name: r.last_name,
      email: r.email,
      email_normalized: r.email_normalized,
      phone: r.phone,
      phone_e164: r.phone_e164,
      company_id: r.company_id,
      company_name: r.company_name || null,
      title: r.title,
      country: r.country,
      city: r.city,
      source: r.source,
      source_id: r.source_id,
      lead_score: Number(r.lead_score || 0),
      status: r.status,
      custom_fields: JSON.parse(r.custom_fields || '{}'),
      email_status: r.email_status,
      verified_at: r.verified_at,
      created_at: r.created_at,
      updated_at: r.updated_at,
      deleted_at: r.deleted_at
    };
  }
}

