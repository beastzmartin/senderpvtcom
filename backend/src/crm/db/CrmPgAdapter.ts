import pg from 'pg';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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

const { Pool } = pg;

export class CrmPgAdapter implements CrmStorageAdapter {
  public isPostgres = true;
  private pool: pg.Pool;

  constructor(connectionString?: string) {
    const connStr = connectionString || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/crm_production';
    this.pool = new Pool({
      connectionString: connStr,
      max: parseInt(process.env.PG_MAX_POOL || '20', 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      statement_timeout: 30000
    });
  }

  public async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Execute migration script
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const migrationPath = path.resolve(__dirname, '../../db/migrations/crm_pg/001_create_crm_schema.sql');

      if (fs.existsSync(migrationPath)) {
        const sql = fs.readFileSync(migrationPath, 'utf8');
        await client.query(sql);
      }
    } finally {
      client.release();
    }
  }

  // =========================================================================
  // WORKSPACES
  // =========================================================================
  public async getWorkspace(id: string): Promise<Workspace | null> {
    const res = await this.pool.query('SELECT * FROM crm_workspaces WHERE id = $1', [id]);
    return res.rows[0] || null;
  }

  public async getWorkspaceBySlug(slug: string): Promise<Workspace | null> {
    const res = await this.pool.query('SELECT * FROM crm_workspaces WHERE slug = $1', [slug]);
    return res.rows[0] || null;
  }

  public async getUserDefaultWorkspace(userId: string): Promise<Workspace> {
    const res = await this.pool.query(`
      SELECT w.* FROM crm_workspaces w
      JOIN crm_workspace_members m ON m.workspace_id = w.id
      WHERE m.user_id = $1
      ORDER BY w.created_at ASC
      LIMIT 1
    `, [userId]);

    if (res.rows.length > 0) {
      return res.rows[0];
    }

    return this.createWorkspace(userId, 'My Workspace');
  }

  public async getUserWorkspaces(userId: string): Promise<Workspace[]> {
    const res = await this.pool.query(`
      SELECT w.*, m.role FROM crm_workspaces w
      JOIN crm_workspace_members m ON m.workspace_id = w.id
      WHERE m.user_id = $1
      ORDER BY w.name ASC
    `, [userId]);
    return res.rows;
  }

  public async createWorkspace(userId: string, name: string, slug?: string): Promise<Workspace> {
    const finalSlug = slug || name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now().toString().slice(-4);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const wsRes = await client.query(`
        INSERT INTO crm_workspaces (name, slug, owner_user_id)
        VALUES ($1, $2, $3)
        RETURNING *
      `, [name.trim(), finalSlug, userId]);

      const ws = wsRes.rows[0];
      await client.query(`
        INSERT INTO crm_workspace_members (workspace_id, user_id, role)
        VALUES ($1, $2, 'owner')
      `, [ws.id, userId]);

      await client.query('COMMIT');
      return ws;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async getWorkspaceMemberRole(workspaceId: string, userId: string): Promise<WorkspaceRole | null> {
    const res = await this.pool.query('SELECT role FROM crm_workspace_members WHERE workspace_id = $1 AND user_id = $2', [workspaceId, userId]);
    return res.rows[0]?.role || null;
  }

  public async addWorkspaceMember(workspaceId: string, userId: string, role: WorkspaceRole): Promise<WorkspaceMember> {
    const res = await this.pool.query(`
      INSERT INTO crm_workspace_members (workspace_id, user_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()
      RETURNING *
    `, [workspaceId, userId, role]);
    return res.rows[0];
  }

  public async listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    const res = await this.pool.query('SELECT * FROM crm_workspace_members WHERE workspace_id = $1', [workspaceId]);
    return res.rows;
  }

  // =========================================================================
  // CONTACTS (KEYSET / CURSOR PAGINATION ONLY)
  // =========================================================================
  public async listContacts(workspaceId: string, params: ContactListParams = {}): Promise<PaginatedResult<Contact>> {
    const limit = Math.min(200, Math.max(1, params.pagination?.limit || 50));
    const conditions: string[] = ['c.workspace_id = $1'];
    const sqlParams: any[] = [workspaceId];
    let pIdx = 2;

    if (!params.includeDeleted) {
      conditions.push('c.deleted_at IS NULL');
    }

    if (params.listId) {
      conditions.push(`EXISTS (SELECT 1 FROM crm_list_members lm WHERE lm.contact_id = c.id AND lm.list_id = $${pIdx})`);
      sqlParams.push(params.listId);
      pIdx++;
    }

    if (params.tagId) {
      conditions.push(`EXISTS (SELECT 1 FROM crm_contact_tags ct WHERE ct.contact_id = c.id AND ct.tag_id = $${pIdx})`);
      sqlParams.push(params.tagId);
      pIdx++;
    }

    if (params.search && params.search.trim()) {
      const q = `%${params.search.trim()}%`;
      conditions.push(`(
        c.first_name ILIKE $${pIdx} OR
        c.last_name ILIKE $${pIdx} OR
        c.email ILIKE $${pIdx} OR
        c.phone ILIKE $${pIdx} OR
        comp.name ILIKE $${pIdx}
      )`);
      sqlParams.push(q);
      pIdx++;
    }

    if (params.filter && params.filter.conditions && params.filter.conditions.length > 0) {
      const fragment = CrmFilterBuilder.buildFilterClause(params.filter, true, pIdx);
      if (fragment.sql && fragment.sql !== '1=1') {
        conditions.push(`(${fragment.sql})`);
        sqlParams.push(...fragment.params);
        pIdx += fragment.params.length;
      }
    }

    if (params.pagination?.cursor) {
      const cursor = CrmNormalizer.decodeCursor(params.pagination.cursor);
      if (cursor) {
        conditions.push(`(c.created_at < $${pIdx} OR (c.created_at = $${pIdx} AND c.id < $${pIdx + 1}))`);
        sqlParams.push(cursor.created_at, cursor.id);
        pIdx += 2;
      }
    }

    const whereClause = conditions.join(' AND ');
    sqlParams.push(limit + 1);

    const query = `
      SELECT c.*, comp.name as company_name
      FROM crm_contacts c
      LEFT JOIN crm_companies comp ON comp.id = c.company_id
      WHERE ${whereClause}
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT $${pIdx}
    `;

    const res = await this.pool.query(query, sqlParams);
    const rows = res.rows;
    const hasMore = rows.length > limit;
    const resultRows = hasMore ? rows.slice(0, limit) : rows;

    let nextCursor: string | null = null;
    if (hasMore && resultRows.length > 0) {
      const last = resultRows[resultRows.length - 1];
      nextCursor = CrmNormalizer.encodeCursor({
        created_at: new Date(last.created_at).toISOString(),
        id: last.id
      });
    }

    // Approximate count using reltuples or fast count
    const countRes = await this.pool.query(`
      SELECT count(*) as total FROM crm_contacts WHERE workspace_id = $1 AND deleted_at IS NULL
    `, [workspaceId]);

    return {
      data: resultRows,
      next_cursor: nextCursor,
      prev_cursor: null,
      has_more: hasMore,
      approximate_total: parseInt(countRes.rows[0]?.total || '0', 10)
    };
  }

  public async getContact(workspaceId: string, contactId: string): Promise<Contact | null> {
    const res = await this.pool.query(`
      SELECT c.*, comp.name as company_name
      FROM crm_contacts c
      LEFT JOIN crm_companies comp ON comp.id = c.company_id
      WHERE c.workspace_id = $1 AND c.id = $2
    `, [workspaceId, contactId]);

    if (res.rows.length === 0) return null;
    const contact = res.rows[0];

    const tagRes = await this.pool.query(`
      SELECT t.name FROM crm_tags t
      JOIN crm_contact_tags ct ON ct.tag_id = t.id
      WHERE ct.contact_id = $1
    `, [contactId]);
    contact.tags = tagRes.rows.map((t) => t.name);

    return contact;
  }

  public async createContact(workspaceId: string, data: Partial<Contact>): Promise<Contact> {
    const emailNorm = CrmNormalizer.normalizeEmail(data.email);
    const phoneE164 = CrmNormalizer.normalizePhone(data.phone);

    const res = await this.pool.query(`
      INSERT INTO crm_contacts (
        workspace_id, first_name, last_name, email, email_normalized,
        phone, phone_e164, company_id, title, country, city,
        source, source_id, lead_score, status, custom_fields,
        email_status, verified_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16,
        $17, $18
      )
      RETURNING *
    `, [
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
    ]);

    return res.rows[0];
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

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const c of contacts) {
        try {
          const emailNorm = CrmNormalizer.normalizeEmail(c.email);
          const phoneE164 = CrmNormalizer.normalizePhone(c.phone);

          if (!emailNorm && !phoneE164 && !c.first_name && !c.last_name) {
            skipped++;
            continue;
          }

          // Check existing in workspace
          const existRes = await client.query(`
            SELECT id, custom_fields FROM crm_contacts
            WHERE workspace_id = $1 AND deleted_at IS NULL AND (
              (email_normalized = $2 AND $2 IS NOT NULL) OR
              (phone_e164 = $3 AND $3 IS NOT NULL)
            )
            LIMIT 1
          `, [workspaceId, emailNorm, phoneE164]);

          if (existRes.rows.length > 0) {
            if (dedupeRule === 'skip') {
              skipped++;
              continue;
            }

            const existing = existRes.rows[0];
            const existingCustom = existing.custom_fields || {};
            const mergedCustom = dedupeRule === 'merge'
              ? { ...existingCustom, ...(c.custom_fields || {}) }
              : (c.custom_fields || existingCustom);

            await client.query(`
              UPDATE crm_contacts SET
                first_name = COALESCE($1, first_name),
                last_name = COALESCE($2, last_name),
                phone = COALESCE($3, phone),
                phone_e164 = COALESCE($4, phone_e164),
                company_id = COALESCE($5, company_id),
                title = COALESCE($6, title),
                country = COALESCE($7, country),
                city = COALESCE($8, city),
                status = COALESCE($9, status),
                custom_fields = $10,
                updated_at = NOW()
              WHERE workspace_id = $11 AND id = $12
            `, [
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
            ]);
            updated++;
          } else {
            await client.query(`
              INSERT INTO crm_contacts (
                workspace_id, first_name, last_name, email, email_normalized,
                phone, phone_e164, company_id, title, country, city,
                source, source_id, lead_score, status, custom_fields,
                email_status, verified_at
              ) VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8, $9, $10, $11,
                $12, $13, $14, $15, $16,
                $17, $18
              )
            `, [
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
            ]);
            inserted++;
          }
        } catch (err: any) {
          errors.push({ contact: c, error: err.message });
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return { inserted, updated, skipped, errors };
  }

  public async updateContact(workspaceId: string, contactId: string, data: Partial<Contact>): Promise<Contact> {
    const existing = await this.getContact(workspaceId, contactId);
    if (!existing) throw new Error(`Contact not found: ${contactId}`);

    const emailNorm = data.email !== undefined ? CrmNormalizer.normalizeEmail(data.email) : existing.email_normalized;
    const phoneE164 = data.phone !== undefined ? CrmNormalizer.normalizePhone(data.phone) : existing.phone_e164;
    const customFields = data.custom_fields !== undefined ? { ...existing.custom_fields, ...data.custom_fields } : existing.custom_fields;

    const res = await this.pool.query(`
      UPDATE crm_contacts SET
        first_name = COALESCE($1, first_name),
        last_name = COALESCE($2, last_name),
        email = COALESCE($3, email),
        email_normalized = $4,
        phone = COALESCE($5, phone),
        phone_e164 = $6,
        company_id = COALESCE($7, company_id),
        title = COALESCE($8, title),
        country = COALESCE($9, country),
        city = COALESCE($10, city),
        status = COALESCE($11, status),
        lead_score = COALESCE($12, lead_score),
        custom_fields = $13,
        email_status = COALESCE($14, email_status),
        updated_at = NOW()
      WHERE workspace_id = $15 AND id = $16
      RETURNING *
    `, [
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
    ]);

    return res.rows[0];
  }

  public async deleteContact(workspaceId: string, contactId: string, soft: boolean = true): Promise<boolean> {
    if (soft) {
      await this.pool.query('UPDATE crm_contacts SET deleted_at = NOW(), updated_at = NOW() WHERE workspace_id = $1 AND id = $2', [workspaceId, contactId]);
    } else {
      await this.pool.query('DELETE FROM crm_contacts WHERE workspace_id = $1 AND id = $2', [workspaceId, contactId]);
    }
    return true;
  }

  public async restoreContact(workspaceId: string, contactId: string): Promise<boolean> {
    await this.pool.query('UPDATE crm_contacts SET deleted_at = NULL, updated_at = NOW() WHERE workspace_id = $1 AND id = $2', [workspaceId, contactId]);
    return true;
  }

  public async findDuplicates(workspaceId: string, limit: number = 50): Promise<Array<{ field: string; value: string; contact_ids: string[]; contacts: Contact[] }>> {
    const emailRes = await this.pool.query(`
      SELECT email_normalized as val, array_agg(id) as ids
      FROM crm_contacts
      WHERE workspace_id = $1 AND email_normalized IS NOT NULL AND deleted_at IS NULL
      GROUP BY email_normalized
      HAVING count(*) > 1
      LIMIT $2
    `, [workspaceId, limit]);

    const results: Array<{ field: string; value: string; contact_ids: string[]; contacts: Contact[] }> = [];

    for (const r of emailRes.rows) {
      const contacts: Contact[] = [];
      for (const id of r.ids) {
        const c = await this.getContact(workspaceId, id);
        if (c) contacts.push(c);
      }
      results.push({ field: 'email', value: r.val, contact_ids: r.ids, contacts });
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
    if (!primary || !duplicate) throw new Error('Primary or duplicate contact not found.');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE crm_list_members SET contact_id = $1 WHERE contact_id = $2 ON CONFLICT DO NOTHING', [primaryId, duplicateId]);
      await client.query('UPDATE crm_contact_tags SET contact_id = $1 WHERE contact_id = $2 ON CONFLICT DO NOTHING', [primaryId, duplicateId]);
      await client.query('UPDATE crm_activities SET contact_id = $1 WHERE contact_id = $2', [primaryId, duplicateId]);
      await client.query('UPDATE crm_contacts SET deleted_at = NOW() WHERE workspace_id = $1 AND id = $2', [workspaceId, duplicateId]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return this.updateContact(workspaceId, primaryId, fieldResolutions);
  }

  public async getApproximateContactCount(workspaceId: string, filter?: FilterGroup): Promise<number> {
    if (!filter || !filter.conditions || filter.conditions.length === 0) {
      const res = await this.pool.query('SELECT count(*) as total FROM crm_contacts WHERE workspace_id = $1 AND deleted_at IS NULL', [workspaceId]);
      return parseInt(res.rows[0]?.total || '0', 10);
    }

    const fragment = CrmFilterBuilder.buildFilterClause(filter, true, 2);
    const res = await this.pool.query(`
      SELECT count(*) as total FROM crm_contacts WHERE workspace_id = $1 AND deleted_at IS NULL AND ${fragment.sql}
    `, [workspaceId, ...fragment.params]);
    return parseInt(res.rows[0]?.total || '0', 10);
  }

  // =========================================================================
  // COMPANIES
  // =========================================================================
  public async getCompany(workspaceId: string, companyId: string): Promise<Company | null> {
    const res = await this.pool.query(`
      SELECT comp.*, (SELECT count(*) FROM crm_contacts c WHERE c.company_id = comp.id AND c.deleted_at IS NULL) as contacts_count
      FROM crm_companies comp
      WHERE comp.workspace_id = $1 AND comp.id = $2 AND comp.deleted_at IS NULL
    `, [workspaceId, companyId]);
    return res.rows[0] || null;
  }

  public async listCompanies(workspaceId: string, search?: string, limit: number = 50): Promise<Company[]> {
    let query = `
      SELECT comp.*, (SELECT count(*) FROM crm_contacts c WHERE c.company_id = comp.id AND c.deleted_at IS NULL) as contacts_count
      FROM crm_companies comp
      WHERE comp.workspace_id = $1 AND comp.deleted_at IS NULL
    `;
    const params: any[] = [workspaceId];

    if (search && search.trim()) {
      query += ' AND (comp.name ILIKE $2 OR comp.domain ILIKE $2)';
      params.push(`%${search.trim()}%`);
    }

    query += ` ORDER BY comp.name ASC LIMIT $${params.length + 1}`;
    params.push(limit);

    const res = await this.pool.query(query, params);
    return res.rows;
  }

  public async createCompany(workspaceId: string, data: Partial<Company>): Promise<Company> {
    const domain = CrmNormalizer.extractDomain(data.domain || data.website);
    const res = await this.pool.query(`
      INSERT INTO crm_companies (
        workspace_id, name, domain, industry, size_range,
        country, city, phone, website, linkedin_url, custom_fields
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
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
    ]);
    return res.rows[0];
  }

  public async updateCompany(workspaceId: string, companyId: string, data: Partial<Company>): Promise<Company> {
    const res = await this.pool.query(`
      UPDATE crm_companies SET
        name = COALESCE($1, name),
        domain = COALESCE($2, domain),
        industry = COALESCE($3, industry),
        size_range = COALESCE($4, size_range),
        country = COALESCE($5, country),
        city = COALESCE($6, city),
        phone = COALESCE($7, phone),
        website = COALESCE($8, website),
        linkedin_url = COALESCE($9, linkedin_url),
        custom_fields = COALESCE($10, custom_fields),
        updated_at = NOW()
      WHERE workspace_id = $11 AND id = $12
      RETURNING *
    `, [
      data.name ? data.name.trim() : null,
      data.domain !== undefined ? CrmNormalizer.extractDomain(data.domain) : null,
      data.industry || null,
      data.size_range || null,
      data.country || null,
      data.city || null,
      data.phone || null,
      data.website || null,
      data.linkedin_url || null,
      data.custom_fields ? JSON.stringify(data.custom_fields) : null,
      workspaceId,
      companyId
    ]);
    return res.rows[0];
  }

  public async findOrCreateCompanyByDomain(workspaceId: string, name: string, domainOrUrl?: string): Promise<Company> {
    const domain = CrmNormalizer.extractDomain(domainOrUrl);
    if (domain) {
      const res = await this.pool.query('SELECT * FROM crm_companies WHERE workspace_id = $1 AND domain = $2 AND deleted_at IS NULL', [workspaceId, domain]);
      if (res.rows.length > 0) return res.rows[0];
    }
    return this.createCompany(workspaceId, { name, domain });
  }

  // =========================================================================
  // LISTS & SEGMENTS
  // =========================================================================
  public async listLists(workspaceId: string): Promise<CrmList[]> {
    const res = await this.pool.query('SELECT * FROM crm_lists WHERE workspace_id = $1 ORDER BY name ASC', [workspaceId]);
    return res.rows;
  }

  public async getList(workspaceId: string, listId: string): Promise<CrmList | null> {
    const res = await this.pool.query('SELECT * FROM crm_lists WHERE workspace_id = $1 AND id = $2', [workspaceId, listId]);
    return res.rows[0] || null;
  }

  public async createList(workspaceId: string, name: string, description?: string, isDynamic: boolean = false, filterDef?: FilterGroup): Promise<CrmList> {
    const res = await this.pool.query(`
      INSERT INTO crm_lists (workspace_id, name, description, is_dynamic, filter_definition)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [workspaceId, name.trim(), description || null, isDynamic, filterDef ? JSON.stringify(filterDef) : null]);
    return res.rows[0];
  }

  public async updateList(workspaceId: string, listId: string, data: Partial<CrmList>): Promise<CrmList> {
    const res = await this.pool.query(`
      UPDATE crm_lists SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        filter_definition = COALESCE($3, filter_definition),
        updated_at = NOW()
      WHERE workspace_id = $4 AND id = $5
      RETURNING *
    `, [
      data.name ? data.name.trim() : null,
      data.description !== undefined ? data.description : null,
      data.filter_definition !== undefined ? JSON.stringify(data.filter_definition) : null,
      workspaceId,
      listId
    ]);
    return res.rows[0];
  }

  public async deleteList(workspaceId: string, listId: string): Promise<boolean> {
    await this.pool.query('DELETE FROM crm_lists WHERE workspace_id = $1 AND id = $2', [workspaceId, listId]);
    return true;
  }

  public async addContactsToList(workspaceId: string, listId: string, contactIds: string[]): Promise<number> {
    if (contactIds.length === 0) return 0;
    const client = await this.pool.connect();
    let count = 0;
    try {
      await client.query('BEGIN');
      for (const cid of contactIds) {
        const res = await client.query(`
          INSERT INTO crm_list_members (workspace_id, list_id, contact_id)
          VALUES ($1, $2, $3)
          ON CONFLICT (list_id, contact_id) DO NOTHING
        `, [workspaceId, listId, cid]);
        count += res.rowCount || 0;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    await this.refreshListCount(workspaceId, listId);
    return count;
  }

  public async removeContactsFromList(workspaceId: string, listId: string, contactIds: string[]): Promise<number> {
    if (contactIds.length === 0) return 0;
    const res = await this.pool.query(`
      DELETE FROM crm_list_members WHERE workspace_id = $1 AND list_id = $2 AND contact_id = ANY($3::uuid[])
    `, [workspaceId, listId, contactIds]);
    await this.refreshListCount(workspaceId, listId);
    return res.rowCount || 0;
  }

  public async refreshListCount(workspaceId: string, listId: string): Promise<number> {
    const list = await this.getList(workspaceId, listId);
    if (!list) return 0;

    let count = 0;
    if (list.is_dynamic && list.filter_definition) {
      count = await this.getApproximateContactCount(workspaceId, list.filter_definition);
    } else {
      const res = await this.pool.query('SELECT count(*) as total FROM crm_list_members WHERE list_id = $1', [listId]);
      count = parseInt(res.rows[0]?.total || '0', 10);
    }

    await this.pool.query('UPDATE crm_lists SET cached_count = $1, last_counted_at = NOW() WHERE id = $2', [count, listId]);
    return count;
  }

  // =========================================================================
  // TAGS
  // =========================================================================
  public async listTags(workspaceId: string): Promise<CrmTag[]> {
    const res = await this.pool.query(`
      SELECT t.*, (SELECT count(*) FROM crm_contact_tags ct WHERE ct.tag_id = t.id) as contacts_count
      FROM crm_tags t
      WHERE t.workspace_id = $1
      ORDER BY t.name ASC
    `, [workspaceId]);
    return res.rows;
  }

  public async createTag(workspaceId: string, name: string, color: string = '#3b82f6'): Promise<CrmTag> {
    const res = await this.pool.query(`
      INSERT INTO crm_tags (workspace_id, name, color)
      VALUES ($1, $2, $3)
      ON CONFLICT (workspace_id, name) DO UPDATE SET color = EXCLUDED.color
      RETURNING *
    `, [workspaceId, name.trim(), color]);
    return res.rows[0];
  }

  public async deleteTag(workspaceId: string, tagId: string): Promise<boolean> {
    await this.pool.query('DELETE FROM crm_tags WHERE workspace_id = $1 AND id = $2', [workspaceId, tagId]);
    return true;
  }

  public async tagContacts(workspaceId: string, tagId: string, contactIds: string[]): Promise<number> {
    if (contactIds.length === 0) return 0;
    const client = await this.pool.connect();
    let count = 0;
    try {
      await client.query('BEGIN');
      for (const cid of contactIds) {
        const res = await client.query(`
          INSERT INTO crm_contact_tags (workspace_id, contact_id, tag_id)
          VALUES ($1, $2, $3)
          ON CONFLICT (contact_id, tag_id) DO NOTHING
        `, [workspaceId, cid, tagId]);
        count += res.rowCount || 0;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return count;
  }

  public async untagContacts(workspaceId: string, tagId: string, contactIds: string[]): Promise<number> {
    if (contactIds.length === 0) return 0;
    const res = await this.pool.query(`
      DELETE FROM crm_contact_tags WHERE workspace_id = $1 AND tag_id = $2 AND contact_id = ANY($3::uuid[])
    `, [workspaceId, tagId, contactIds]);
    return res.rowCount || 0;
  }

  // =========================================================================
  // CUSTOM FIELDS
  // =========================================================================
  public async listCustomFields(workspaceId: string, entity: 'contact' | 'company' = 'contact'): Promise<CustomFieldDefinition[]> {
    const res = await this.pool.query(`
      SELECT * FROM crm_custom_field_definitions
      WHERE workspace_id = $1 AND target_entity = $2
      ORDER BY name ASC
    `, [workspaceId, entity]);
    return res.rows;
  }

  public async createCustomField(workspaceId: string, data: Partial<CustomFieldDefinition>): Promise<CustomFieldDefinition> {
    const fieldKey = (data.field_key || data.name || '').toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const res = await this.pool.query(`
      INSERT INTO crm_custom_field_definitions (
        workspace_id, target_entity, name, field_key, field_type, options, is_required
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      workspaceId,
      data.target_entity || 'contact',
      (data.name || fieldKey).trim(),
      fieldKey,
      data.field_type || 'text',
      JSON.stringify(data.options || []),
      Boolean(data.is_required)
    ]);
    return res.rows[0];
  }

  public async deleteCustomField(workspaceId: string, fieldId: string): Promise<boolean> {
    await this.pool.query('DELETE FROM crm_custom_field_definitions WHERE workspace_id = $1 AND id = $2', [workspaceId, fieldId]);
    return true;
  }

  // =========================================================================
  // ACTIVITIES TIMELINE
  // =========================================================================
  public async listActivities(workspaceId: string, contactId: string, limit: number = 50): Promise<ActivityTimelineItem[]> {
    const res = await this.pool.query(`
      SELECT * FROM crm_activities
      WHERE workspace_id = $1 AND contact_id = $2
      ORDER BY created_at DESC
      LIMIT $3
    `, [workspaceId, contactId, limit]);
    return res.rows;
  }

  public async logActivity(workspaceId: string, activity: Partial<ActivityTimelineItem>): Promise<ActivityTimelineItem> {
    const res = await this.pool.query(`
      INSERT INTO crm_activities (workspace_id, contact_id, user_id, type, title, details)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      workspaceId,
      activity.contact_id,
      activity.user_id || null,
      activity.type || 'note',
      activity.title || 'Note',
      JSON.stringify(activity.details || {})
    ]);
    return res.rows[0];
  }

  // =========================================================================
  // IMPORTS
  // =========================================================================
  public async createImport(workspaceId: string, data: Partial<CrmImport>): Promise<CrmImport> {
    const res = await this.pool.query(`
      INSERT INTO crm_imports (
        workspace_id, user_id, filename, file_path, total_rows, dedupe_rule, column_mapping, list_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      workspaceId,
      data.user_id || 'system',
      data.filename || 'import.csv',
      data.file_path || null,
      data.total_rows || 0,
      data.dedupe_rule || 'update',
      JSON.stringify(data.column_mapping || {}),
      data.list_id || null
    ]);
    return res.rows[0];
  }

  public async getImport(workspaceId: string, importId: string): Promise<CrmImport | null> {
    const res = await this.pool.query('SELECT * FROM crm_imports WHERE workspace_id = $1 AND id = $2', [workspaceId, importId]);
    return res.rows[0] || null;
  }

  public async updateImport(workspaceId: string, importId: string, updates: Partial<CrmImport>): Promise<CrmImport> {
    const res = await this.pool.query(`
      UPDATE crm_imports SET
        total_rows = COALESCE($1, total_rows),
        processed_rows = COALESCE($2, processed_rows),
        imported_rows = COALESCE($3, imported_rows),
        updated_rows = COALESCE($4, updated_rows),
        skipped_rows = COALESCE($5, skipped_rows),
        error_rows = COALESCE($6, error_rows),
        status = COALESCE($7, status),
        error_report_url = COALESCE($8, error_report_url),
        error_details = COALESCE($9, error_details),
        completed_at = CASE WHEN $7 IN ('completed', 'failed') THEN NOW() ELSE completed_at END
      WHERE workspace_id = $10 AND id = $11
      RETURNING *
    `, [
      updates.total_rows !== undefined ? updates.total_rows : null,
      updates.processed_rows !== undefined ? updates.processed_rows : null,
      updates.imported_rows !== undefined ? updates.imported_rows : null,
      updates.updated_rows !== undefined ? updates.updated_rows : null,
      updates.skipped_rows !== undefined ? updates.skipped_rows : null,
      updates.error_rows !== undefined ? updates.error_rows : null,
      updates.status || null,
      updates.error_report_url || null,
      updates.error_details || null,
      workspaceId,
      importId
    ]);
    return res.rows[0];
  }

  public async listImports(workspaceId: string, limit: number = 20): Promise<CrmImport[]> {
    const res = await this.pool.query('SELECT * FROM crm_imports WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT $2', [workspaceId, limit]);
    return res.rows;
  }

  // =========================================================================
  // EXPORTS
  // =========================================================================
  public async createExport(workspaceId: string, data: Partial<CrmExport>): Promise<CrmExport> {
    const res = await this.pool.query(`
      INSERT INTO crm_exports (
        workspace_id, user_id, format, total_records, filter_definition, file_path, download_url, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + INTERVAL '7 days')
      RETURNING *
    `, [
      workspaceId,
      data.user_id || 'system',
      data.format || 'csv',
      data.total_records || 0,
      data.filter_definition ? JSON.stringify(data.filter_definition) : null,
      data.file_path || null,
      data.download_url || null
    ]);
    return res.rows[0];
  }

  public async getExport(workspaceId: string, exportId: string): Promise<CrmExport | null> {
    const res = await this.pool.query('SELECT * FROM crm_exports WHERE workspace_id = $1 AND id = $2', [workspaceId, exportId]);
    return res.rows[0] || null;
  }

  public async updateExport(workspaceId: string, exportId: string, updates: Partial<CrmExport>): Promise<CrmExport> {
    const res = await this.pool.query(`
      UPDATE crm_exports SET
        status = COALESCE($1, status),
        total_records = COALESCE($2, total_records),
        file_path = COALESCE($3, file_path),
        download_url = COALESCE($4, download_url),
        completed_at = CASE WHEN $1 IN ('completed', 'failed') THEN NOW() ELSE completed_at END
      WHERE workspace_id = $5 AND id = $6
      RETURNING *
    `, [
      updates.status || null,
      updates.total_records !== undefined ? updates.total_records : null,
      updates.file_path || null,
      updates.download_url || null,
      workspaceId,
      exportId
    ]);
    return res.rows[0];
  }

  public async listExports(workspaceId: string, limit: number = 20): Promise<CrmExport[]> {
    const res = await this.pool.query('SELECT * FROM crm_exports WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT $2', [workspaceId, limit]);
    return res.rows;
  }

  // =========================================================================
  // SUPPRESSION LIST
  // =========================================================================
  public async checkSuppressed(workspaceId: string, params: { email?: string; phone?: string; domain?: string }): Promise<boolean> {
    const emailNorm = CrmNormalizer.normalizeEmail(params.email);
    const phoneE164 = CrmNormalizer.normalizePhone(params.phone);
    const domain = CrmNormalizer.extractDomain(params.domain || params.email);

    const res = await this.pool.query(`
      SELECT 1 FROM crm_suppression_list
      WHERE workspace_id = $1 AND (
        (type = 'email' AND value_normalized = $2 AND $2 IS NOT NULL) OR
        (type = 'phone' AND value_normalized = $3 AND $3 IS NOT NULL) OR
        (type = 'domain' AND value_normalized = $4 AND $4 IS NOT NULL)
      )
      LIMIT 1
    `, [workspaceId, emailNorm, phoneE164, domain]);
    return res.rows.length > 0;
  }

  public async addSuppression(workspaceId: string, record: Partial<SuppressionRecord>): Promise<SuppressionRecord> {
    let val = (record.value_normalized || '').trim().toLowerCase();
    if (record.type === 'phone') {
      val = CrmNormalizer.normalizePhone(val) || val;
    } else if (record.type === 'email') {
      val = CrmNormalizer.normalizeEmail(val) || val;
    }

    const res = await this.pool.query(`
      INSERT INTO crm_suppression_list (workspace_id, type, value_normalized, reason)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (workspace_id, type, value_normalized) DO UPDATE SET reason = EXCLUDED.reason
      RETURNING *
    `, [workspaceId, record.type, val, record.reason || 'unsubscribe']);
    return res.rows[0];
  }

  public async listSuppression(workspaceId: string, limit: number = 100): Promise<SuppressionRecord[]> {
    const res = await this.pool.query('SELECT * FROM crm_suppression_list WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT $2', [workspaceId, limit]);
    return res.rows;
  }

  public async removeSuppression(workspaceId: string, id: string): Promise<boolean> {
    await this.pool.query('DELETE FROM crm_suppression_list WHERE workspace_id = $1 AND id = $2', [workspaceId, id]);
    return true;
  }

  // =========================================================================
  // API KEYS & USAGE LOGS
  // =========================================================================
  public async createApiKey(workspaceId: string, data: Partial<CrmApiKey>): Promise<{ apiKey: CrmApiKey; rawSecretKey: string }> {
    const rawSecret = `crm_${data.is_test ? 'test' : 'live'}_${crypto.randomBytes(24).toString('hex')}`;
    const prefix = rawSecret.slice(0, 12);
    const hash = crypto.createHash('sha256').update(rawSecret).digest('hex');

    const res = await this.pool.query(`
      INSERT INTO crm_api_keys (
        workspace_id, user_id, name, key_prefix, key_hash, scopes,
        rate_limit_rpm, monthly_quota, is_test
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      workspaceId,
      data.user_id || 'system',
      (data.name || 'API Key').trim(),
      prefix,
      hash,
      JSON.stringify(data.scopes || ['contacts:read', 'contacts:write']),
      data.rate_limit_rpm || 600,
      data.monthly_quota || 500000,
      Boolean(data.is_test)
    ]);

    return { apiKey: res.rows[0], rawSecretKey: rawSecret };
  }

  public async getApiKeyByHash(keyHash: string): Promise<CrmApiKey | null> {
    const res = await this.pool.query('SELECT * FROM crm_api_keys WHERE key_hash = $1 AND revoked_at IS NULL', [keyHash]);
    return res.rows[0] || null;
  }

  public async updateApiKeyUsage(apiKeyId: string, incrementRequests: number = 1): Promise<void> {
    await this.pool.query(`
      UPDATE crm_api_keys SET monthly_usage = monthly_usage + $1, last_used_at = NOW() WHERE id = $2
    `, [incrementRequests, apiKeyId]);
  }

  public async listApiKeys(workspaceId: string): Promise<CrmApiKey[]> {
    const res = await this.pool.query('SELECT * FROM crm_api_keys WHERE workspace_id = $1 ORDER BY created_at DESC', [workspaceId]);
    return res.rows;
  }

  public async revokeApiKey(workspaceId: string, apiKeyId: string): Promise<boolean> {
    await this.pool.query('UPDATE crm_api_keys SET revoked_at = NOW() WHERE workspace_id = $1 AND id = $2', [workspaceId, apiKeyId]);
    return true;
  }

  public async logApiUsage(log: Partial<CrmApiUsageLog>): Promise<void> {
    await this.pool.query(`
      INSERT INTO crm_api_usage_logs (
        workspace_id, api_key_id, endpoint, method, status_code,
        response_time_ms, credits_charged, currency, ip_address
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      log.workspace_id,
      log.api_key_id || null,
      log.endpoint || '/',
      log.method || 'GET',
      log.status_code || 200,
      log.response_time_ms || 0,
      log.credits_charged || 0,
      log.currency || 'INR',
      log.ip_address || null
    ]);
  }

  public async getApiUsageStats(workspaceId: string, days: number = 30): Promise<{ totalRequests: number; totalCreditsCharged: number; byEndpoint: Record<string, number> }> {
    const res = await this.pool.query(`
      SELECT endpoint, count(*) as cnt, sum(credits_charged) as total_charged
      FROM crm_api_usage_logs
      WHERE workspace_id = $1 AND created_at >= NOW() - INTERVAL '1 day' * $2
      GROUP BY endpoint
    `, [workspaceId, days]);

    let totalRequests = 0;
    let totalCreditsCharged = 0;
    const byEndpoint: Record<string, number> = {};

    res.rows.forEach((r) => {
      totalRequests += parseInt(r.cnt, 10);
      totalCreditsCharged += parseFloat(r.total_charged || '0');
      byEndpoint[r.endpoint] = parseInt(r.cnt, 10);
    });

    return { totalRequests, totalCreditsCharged, byEndpoint };
  }

  // =========================================================================
  // WEBHOOKS & DELIVERIES
  // =========================================================================
  public async listWebhooks(workspaceId: string): Promise<CrmWebhook[]> {
    const res = await this.pool.query('SELECT * FROM crm_webhooks WHERE workspace_id = $1 ORDER BY created_at DESC', [workspaceId]);
    return res.rows;
  }

  public async getWebhook(workspaceId: string, id: string): Promise<CrmWebhook | null> {
    const res = await this.pool.query('SELECT * FROM crm_webhooks WHERE workspace_id = $1 AND id = $2', [workspaceId, id]);
    return res.rows[0] || null;
  }

  public async createWebhook(workspaceId: string, data: Partial<CrmWebhook>): Promise<CrmWebhook> {
    const secret = `whsec_${crypto.randomBytes(24).toString('hex')}`;
    const res = await this.pool.query(`
      INSERT INTO crm_webhooks (workspace_id, url, description, events, secret)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [
      workspaceId,
      data.url?.trim(),
      data.description || null,
      JSON.stringify(data.events || ['contact.created', 'contact.updated']),
      secret
    ]);
    return res.rows[0];
  }

  public async updateWebhook(workspaceId: string, id: string, data: Partial<CrmWebhook>): Promise<CrmWebhook> {
    const res = await this.pool.query(`
      UPDATE crm_webhooks SET
        url = COALESCE($1, url),
        description = COALESCE($2, description),
        events = COALESCE($3, events),
        is_active = COALESCE($4, is_active)
      WHERE workspace_id = $5 AND id = $6
      RETURNING *
    `, [
      data.url ? data.url.trim() : null,
      data.description !== undefined ? data.description : null,
      data.events ? JSON.stringify(data.events) : null,
      data.is_active !== undefined ? Boolean(data.is_active) : null,
      workspaceId,
      id
    ]);
    return res.rows[0];
  }

  public async deleteWebhook(workspaceId: string, id: string): Promise<boolean> {
    await this.pool.query('DELETE FROM crm_webhooks WHERE workspace_id = $1 AND id = $2', [workspaceId, id]);
    return true;
  }

  public async logWebhookDelivery(delivery: Partial<CrmWebhookDelivery>): Promise<void> {
    await this.pool.query(`
      INSERT INTO crm_webhook_deliveries (
        workspace_id, webhook_id, event_type, payload, status_code,
        response_body, duration_ms, attempt, success
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      delivery.workspace_id,
      delivery.webhook_id,
      delivery.event_type,
      JSON.stringify(delivery.payload || {}),
      delivery.status_code || null,
      delivery.response_body ? delivery.response_body.slice(0, 1000) : null,
      delivery.duration_ms || 0,
      delivery.attempt || 1,
      Boolean(delivery.success)
    ]);
  }

  public async listWebhookDeliveries(workspaceId: string, webhookId: string, limit: number = 50): Promise<CrmWebhookDelivery[]> {
    const res = await this.pool.query(`
      SELECT * FROM crm_webhook_deliveries
      WHERE workspace_id = $1 AND webhook_id = $2
      ORDER BY delivered_at DESC
      LIMIT $3
    `, [workspaceId, webhookId, limit]);
    return res.rows;
  }

  // =========================================================================
  // AUDIT LOG
  // =========================================================================
  public async logAudit(entry: Partial<AuditLogEntry>): Promise<void> {
    await this.pool.query(`
      INSERT INTO crm_audit_log (workspace_id, user_id, action, entity_type, entity_id, changes, ip_address)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      entry.workspace_id,
      entry.user_id || null,
      entry.action || 'update',
      entry.entity_type || 'contact',
      entry.entity_id || '',
      entry.changes ? JSON.stringify(entry.changes) : null,
      entry.ip_address || null
    ]);
  }

  public async listAuditLogs(workspaceId: string, limit: number = 100): Promise<AuditLogEntry[]> {
    const res = await this.pool.query('SELECT * FROM crm_audit_log WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT $2', [workspaceId, limit]);
    return res.rows;
  }
}

