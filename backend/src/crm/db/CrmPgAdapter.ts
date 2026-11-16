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
  ImportDedupeRule,
  CustomObjectDefinition,
  CustomObjectFieldDefinition,
  CustomObjectRecord,
  ObjectRelationshipDefinition,
  ObjectAssociation,
  FieldChangeHistory,
  CrmOutboxEvent,
  ContactMergeRecord,
  DuplicateCandidate,
  FieldVerificationResult,
  EnrichmentProviderConfig,
  DataHealthMetrics,
  CrmSavedView,
  CrmBulkJob,
  CrmAiUsageLog,
  CrmScoringRule,
  CrmWorkflow,
  CrmWorkflowRun,
  CrmWorkflowStepLog,
  CrmCompliancePolicy,
  CrmPipeline,
  CrmPipelineStage,
  CrmDeal,
  CrmTask,
  CrmPresenceSession,
  CrmRolePermission,
  CrmSensitiveField,
  CrmErasureCertificate,
  FunnelMetrics,
  FunnelStageMetric,
  AttributionSummary,
  AttributionSourceRow,
  CohortRow,
  CustomReportSpec,
  CustomReportResult
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
      // Execute migration scripts in sequence
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const migrationDir = path.resolve(__dirname, '../../db/migrations/crm_pg');

      const files = [
        '001_create_crm_schema.sql',
        '002_crm_v2_foundation.sql',
        '003_crm_v2_identity_and_quality.sql',
        '004_crm_v2_segmentation_and_bulk.sql',
        '005_crm_v2_ai_layer.sql',
        '006_crm_v2_automation_engine.sql',
        '007_crm_v2_sales_pipeline.sql',
        '008_crm_v2_security_and_compliance.sql'
      ];
      for (const file of files) {
        const filePath = path.join(migrationDir, file);
        if (fs.existsSync(filePath)) {
          const sql = fs.readFileSync(filePath, 'utf8');
          await client.query(sql);
        }
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

    let companyId = data.company_id || null;
    if (!companyId && data.company_name) {
      try {
        const comp = await this.findOrCreateCompanyByDomain(workspaceId, data.company_name);
        companyId = comp.id;
      } catch {}
    }

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
      companyId,
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

    const contact = res.rows[0];
    this.emitOutboxEvent(workspaceId, 'contact.created', 'contact', contact.id, contact).catch(() => {});
    return contact;
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

    const updated = res.rows[0];

    // Log delta field changes
    const previous = existing as Record<string, any>;
    const current = updated as Record<string, any>;
    for (const key of Object.keys(data)) {
      if (key === 'custom_fields') {
        const oldCustom = previous.custom_fields || {};
        const newCustom = current.custom_fields || {};
        for (const [cfKey, cfVal] of Object.entries(data.custom_fields || {})) {
          if (oldCustom[cfKey] !== cfVal) {
            this.logFieldChange(workspaceId, {
              entity_type: 'contact',
              entity_id: contactId,
              field_name: cfKey,
              old_value: oldCustom[cfKey] ?? null,
              new_value: cfVal,
              source: 'manual_ui'
            }).catch(() => {});
          }
        }
      } else if (previous[key] !== current[key]) {
        this.logFieldChange(workspaceId, {
          entity_type: 'contact',
          entity_id: contactId,
          field_name: key,
          old_value: previous[key] ?? null,
          new_value: current[key] ?? null,
          source: 'manual_ui'
        }).catch(() => {});
      }
    }

    this.emitOutboxEvent(workspaceId, 'contact.updated', 'contact', contactId, { previous: existing, current: updated }).catch(() => {});

    return updated;
  }

  public async deleteContact(workspaceId: string, contactId: string, soft: boolean = true): Promise<boolean> {
    if (soft) {
      await this.pool.query('UPDATE crm_contacts SET deleted_at = NOW(), updated_at = NOW() WHERE workspace_id = $1 AND id = $2', [workspaceId, contactId]);
    } else {
      await this.pool.query('DELETE FROM crm_contacts WHERE workspace_id = $1 AND id = $2', [workspaceId, contactId]);
    }
    this.emitOutboxEvent(workspaceId, 'contact.deleted', 'contact', contactId, { soft }).catch(() => {});
    return true;
  }

  public async restoreContact(workspaceId: string, contactId: string): Promise<boolean> {
    await this.pool.query('UPDATE crm_contacts SET deleted_at = NULL, updated_at = NOW() WHERE workspace_id = $1 AND id = $2', [workspaceId, contactId]);
    this.emitOutboxEvent(workspaceId, 'contact.restored', 'contact', contactId, { restored: true }).catch(() => {});
    return true;
  }

  public async archiveContact(workspaceId: string, contactId: string): Promise<boolean> {
    const res = await this.pool.query(`
      UPDATE crm_contacts 
      SET is_archived = TRUE, archived_at = NOW(), updated_at = NOW() 
      WHERE workspace_id = $1 AND id = $2
    `, [workspaceId, contactId]);
    if ((res.rowCount ?? 0) > 0) {
      this.emitOutboxEvent(workspaceId, 'contact.archived', 'contact', contactId, { is_archived: true }).catch(() => {});
      return true;
    }
    return false;
  }

  public async unarchiveContact(workspaceId: string, contactId: string): Promise<boolean> {
    const res = await this.pool.query(`
      UPDATE crm_contacts 
      SET is_archived = FALSE, archived_at = NULL, updated_at = NOW() 
      WHERE workspace_id = $1 AND id = $2
    `, [workspaceId, contactId]);
    if ((res.rowCount ?? 0) > 0) {
      this.emitOutboxEvent(workspaceId, 'contact.unarchived', 'contact', contactId, { is_archived: false }).catch(() => {});
      return true;
    }
    return false;
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
      
      // Record merge audit with snapshot for UNMERGE
      await client.query(`
        INSERT INTO crm_contact_merges (
          workspace_id, primary_contact_id, merged_contact_id, merged_contact_snapshot, survivorship_rules_applied
        ) VALUES ($1, $2, $3, $4, $5)
      `, [workspaceId, primaryId, duplicateId, JSON.stringify(duplicate), JSON.stringify(fieldResolutions)]);

      await client.query('UPDATE crm_contacts SET deleted_at = NOW() WHERE workspace_id = $1 AND id = $2', [workspaceId, duplicateId]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const updated = await this.updateContact(workspaceId, primaryId, fieldResolutions);
    this.emitOutboxEvent(workspaceId, 'contact.merged', 'contact', primaryId, { primary_id: primaryId, duplicate_id: duplicateId }).catch(() => {});
    return updated;
  }

  public async getApproximateContactCount(workspaceId: string, filter?: FilterGroup): Promise<number> {
    if (!filter || !filter.conditions || filter.conditions.length === 0) {
      const res = await this.pool.query('SELECT count(*) as total FROM crm_contacts WHERE workspace_id = $1 AND deleted_at IS NULL', [workspaceId]);
      return parseInt(res.rows[0]?.total || '0', 10);
    }

    const fragment = CrmFilterBuilder.buildFilterClause(filter, true, 2);
    const res = await this.pool.query(`
      SELECT count(*) as total 
      FROM crm_contacts c
      LEFT JOIN crm_companies comp ON comp.id = c.company_id
      WHERE c.workspace_id = $1 AND c.deleted_at IS NULL AND ${fragment.sql}
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

  // =========================================================================
  // CRM V2 PHASE 1: CUSTOM OBJECTS & RECORDS
  // =========================================================================
  public async listCustomObjects(workspaceId: string): Promise<CustomObjectDefinition[]> {
    const res = await this.pool.query(
      'SELECT * FROM crm_custom_objects WHERE workspace_id = $1 ORDER BY name ASC',
      [workspaceId]
    );
    return res.rows;
  }

  public async getCustomObject(workspaceId: string, idOrSlug: string): Promise<CustomObjectDefinition | null> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
    let res;
    if (isUuid) {
      res = await this.pool.query(
        'SELECT * FROM crm_custom_objects WHERE workspace_id = $1 AND (id = $2 OR slug = $3)',
        [workspaceId, idOrSlug, idOrSlug]
      );
    } else {
      res = await this.pool.query(
        'SELECT * FROM crm_custom_objects WHERE workspace_id = $1 AND slug = $2',
        [workspaceId, idOrSlug]
      );
    }
    return res.rows[0] || null;
  }

  public async createCustomObject(workspaceId: string, data: Partial<CustomObjectDefinition>): Promise<CustomObjectDefinition> {
    const slug = (data.slug || data.name || 'custom_object').toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const res = await this.pool.query(`
      INSERT INTO crm_custom_objects (
        workspace_id, name, singular_label, plural_label, slug, description, icon, primary_field_key
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      workspaceId,
      data.name || 'Custom Object',
      data.singular_label || data.name || 'Item',
      data.plural_label || `${data.name || 'Item'}s`,
      slug,
      data.description || null,
      data.icon || 'Boxes',
      data.primary_field_key || 'name'
    ]);
    return res.rows[0];
  }

  public async deleteCustomObject(workspaceId: string, id: string): Promise<boolean> {
    await this.pool.query('DELETE FROM crm_custom_objects WHERE workspace_id = $1 AND id = $2', [workspaceId, id]);
    return true;
  }

  public async listCustomObjectFields(workspaceId: string, objectId: string): Promise<CustomObjectFieldDefinition[]> {
    const res = await this.pool.query(
      'SELECT * FROM crm_custom_object_fields WHERE workspace_id = $1 AND object_id = $2 ORDER BY created_at ASC',
      [workspaceId, objectId]
    );
    return res.rows.map((r: any) => ({
      ...r,
      is_required: Boolean(r.is_required),
      is_unique: Boolean(r.is_unique),
      options: typeof r.options === 'string' ? JSON.parse(r.options) : (r.options || [])
    }));
  }

  public async createCustomObjectField(workspaceId: string, data: Partial<CustomObjectFieldDefinition>): Promise<CustomObjectFieldDefinition> {
    const res = await this.pool.query(`
      INSERT INTO crm_custom_object_fields (
        workspace_id, object_id, name, field_key, field_type, options, currency_code, formula_expression, is_required, is_unique
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      workspaceId,
      data.object_id,
      data.name || 'Field',
      data.field_key,
      data.field_type || 'text',
      JSON.stringify(data.options || []),
      data.currency_code || 'USD',
      data.formula_expression || null,
      Boolean(data.is_required),
      Boolean(data.is_unique)
    ]);
    const row = res.rows[0];
    return {
      ...row,
      is_required: Boolean(row.is_required),
      is_unique: Boolean(row.is_unique),
      options: typeof row.options === 'string' ? JSON.parse(row.options) : (row.options || [])
    };
  }

  public async deleteCustomObjectField(workspaceId: string, fieldId: string): Promise<boolean> {
    await this.pool.query('DELETE FROM crm_custom_object_fields WHERE workspace_id = $1 AND id = $2', [workspaceId, fieldId]);
    return true;
  }

  public async listCustomObjectRecords(
    workspaceId: string,
    objectId: string,
    params: { limit?: number; cursor?: string } = {}
  ): Promise<PaginatedResult<CustomObjectRecord>> {
    const limit = Math.min(100, Math.max(1, params.limit || 25));
    const conditions: string[] = ['workspace_id = $1', 'object_id = $2', 'deleted_at IS NULL'];
    const sqlParams: any[] = [workspaceId, objectId];
    let pIdx = 3;

    if (params.cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(params.cursor, 'base64').toString('utf8'));
        if (decoded?.created_at) {
          conditions.push(`created_at < $${pIdx}`);
          sqlParams.push(decoded.created_at);
          pIdx++;
        }
      } catch {}
    }

    sqlParams.push(limit + 1);
    const query = `
      SELECT * FROM crm_custom_object_records
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${pIdx}
    `;

    const res = await this.pool.query(query, sqlParams);
    const rows = res.rows;
    const hasMore = rows.length > limit;
    const data = (hasMore ? rows.slice(0, limit) : rows).map((r: any) => ({
      ...r,
      properties: typeof r.properties === 'string' ? JSON.parse(r.properties) : (r.properties || {})
    }));

    return {
      data,
      next_cursor: hasMore && data.length > 0 ? Buffer.from(JSON.stringify({ created_at: data[data.length - 1].created_at, id: data[data.length - 1].id })).toString('base64') : null,
      prev_cursor: null,
      has_more: hasMore,
      approximate_total: data.length
    };
  }

  public async getCustomObjectRecord(workspaceId: string, recordId: string): Promise<CustomObjectRecord | null> {
    const res = await this.pool.query(
      'SELECT * FROM crm_custom_object_records WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL',
      [workspaceId, recordId]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      ...row,
      properties: typeof row.properties === 'string' ? JSON.parse(row.properties) : (row.properties || {})
    };
  }

  public async createCustomObjectRecord(workspaceId: string, objectId: string, properties: Record<string, any>): Promise<CustomObjectRecord> {
    const res = await this.pool.query(`
      INSERT INTO crm_custom_object_records (workspace_id, object_id, properties)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [workspaceId, objectId, JSON.stringify(properties || {})]);
    const record = {
      ...res.rows[0],
      properties: typeof res.rows[0].properties === 'string' ? JSON.parse(res.rows[0].properties) : (res.rows[0].properties || {})
    };
    this.emitOutboxEvent(workspaceId, 'custom_object.record_created', objectId, record.id, record).catch(() => {});
    return record;
  }

  public async updateCustomObjectRecord(workspaceId: string, recordId: string, properties: Record<string, any>): Promise<CustomObjectRecord> {
    const existing = await this.getCustomObjectRecord(workspaceId, recordId);
    if (!existing) throw new Error(`Custom object record not found: ${recordId}`);
    const merged = { ...existing.properties, ...properties };

    const res = await this.pool.query(`
      UPDATE crm_custom_object_records
      SET properties = $1, updated_at = NOW()
      WHERE workspace_id = $2 AND id = $3
      RETURNING *
    `, [JSON.stringify(merged), workspaceId, recordId]);

    const updated = {
      ...res.rows[0],
      properties: typeof res.rows[0].properties === 'string' ? JSON.parse(res.rows[0].properties) : (res.rows[0].properties || {})
    };
    this.emitOutboxEvent(workspaceId, 'custom_object.record_updated', existing.object_id, recordId, { previous: existing, current: updated }).catch(() => {});
    return updated;
  }

  public async deleteCustomObjectRecord(workspaceId: string, recordId: string): Promise<boolean> {
    await this.pool.query('UPDATE crm_custom_object_records SET deleted_at = NOW() WHERE workspace_id = $1 AND id = $2', [workspaceId, recordId]);
    this.emitOutboxEvent(workspaceId, 'custom_object.record_deleted', 'custom_object', recordId, { deleted: true }).catch(() => {});
    return true;
  }

  // =========================================================================
  // OBJECT RELATIONSHIPS & ASSOCIATIONS
  // =========================================================================
  public async createObjectRelationship(workspaceId: string, data: Partial<ObjectRelationshipDefinition>): Promise<ObjectRelationshipDefinition> {
    const res = await this.pool.query(`
      INSERT INTO crm_object_relationships (
        workspace_id, source_object, target_object, relationship_type, name, inverse_name
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      workspaceId,
      data.source_object,
      data.target_object,
      data.relationship_type || 'one_to_many',
      data.name || 'Relationship',
      data.inverse_name || 'Inverse'
    ]);
    return res.rows[0];
  }

  public async listObjectRelationships(workspaceId: string): Promise<ObjectRelationshipDefinition[]> {
    const res = await this.pool.query(
      'SELECT * FROM crm_object_relationships WHERE workspace_id = $1 ORDER BY created_at ASC',
      [workspaceId]
    );
    return res.rows;
  }

  public async associateObjects(
    workspaceId: string,
    relationshipId: string,
    sourceEntityType: string,
    sourceEntityId: string,
    targetEntityType: string,
    targetEntityId: string,
    metadata: Record<string, any> = {}
  ): Promise<ObjectAssociation> {
    const res = await this.pool.query(`
      INSERT INTO crm_object_associations (
        workspace_id, relationship_id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      workspaceId,
      relationshipId,
      sourceEntityType,
      sourceEntityId,
      targetEntityType,
      targetEntityId,
      JSON.stringify(metadata)
    ]);
    const row = res.rows[0];
    return {
      ...row,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {})
    };
  }

  public async listAssociatedObjects(workspaceId: string, entityType: string, entityId: string): Promise<ObjectAssociation[]> {
    const res = await this.pool.query(`
      SELECT * FROM crm_object_associations
      WHERE workspace_id = $1 AND (
        (source_entity_type = $2 AND source_entity_id = $3) OR
        (target_entity_type = $2 AND target_entity_id = $3)
      )
    `, [workspaceId, entityType, entityId]);
    return res.rows.map((r: any) => ({
      ...r,
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata || {})
    }));
  }

  public async removeAssociation(workspaceId: string, associationId: string): Promise<boolean> {
    await this.pool.query('DELETE FROM crm_object_associations WHERE workspace_id = $1 AND id = $2', [workspaceId, associationId]);
    return true;
  }

  // =========================================================================
  // FIELD-LEVEL DELTA HISTORY & RESTORE
  // =========================================================================
  public async logFieldChange(workspaceId: string, change: Partial<FieldChangeHistory>): Promise<FieldChangeHistory> {
    const res = await this.pool.query(`
      INSERT INTO crm_field_history (
        workspace_id, entity_type, entity_id, field_name, old_value, new_value, changed_by, source
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      workspaceId,
      change.entity_type || 'contact',
      change.entity_id,
      change.field_name,
      change.old_value !== undefined ? JSON.stringify(change.old_value) : null,
      change.new_value !== undefined ? JSON.stringify(change.new_value) : null,
      change.changed_by || null,
      change.source || 'manual_ui'
    ]);
    const row = res.rows[0];
    return {
      ...row,
      old_value: row.old_value ? (typeof row.old_value === 'string' ? JSON.parse(row.old_value) : row.old_value) : null,
      new_value: row.new_value ? (typeof row.new_value === 'string' ? JSON.parse(row.new_value) : row.new_value) : null
    };
  }

  public async getFieldHistory(workspaceId: string, entityType: string, entityId: string): Promise<FieldChangeHistory[]> {
    const res = await this.pool.query(`
      SELECT * FROM crm_field_history
      WHERE workspace_id = $1 AND entity_type = $2 AND entity_id = $3
      ORDER BY created_at DESC
    `, [workspaceId, entityType, entityId]);
    return res.rows.map((r: any) => ({
      ...r,
      old_value: r.old_value ? (typeof r.old_value === 'string' ? JSON.parse(r.old_value) : r.old_value) : null,
      new_value: r.new_value ? (typeof r.new_value === 'string' ? JSON.parse(r.new_value) : r.new_value) : null
    }));
  }

  public async restoreFieldHistory(workspaceId: string, historyId: string): Promise<boolean> {
    const res = await this.pool.query(
      'SELECT * FROM crm_field_history WHERE workspace_id = $1 AND id = $2',
      [workspaceId, historyId]
    );
    if (res.rows.length === 0) throw new Error('Field history entry not found');
    const row = res.rows[0];
    const oldValue = row.old_value ? (typeof row.old_value === 'string' ? JSON.parse(row.old_value) : row.old_value) : null;

    if (row.entity_type === 'contact') {
      const field = row.field_name;
      const contact = await this.getContact(workspaceId, row.entity_id);
      if (!contact) return false;

      const updates: any = {};
      if (['first_name', 'last_name', 'email', 'phone', 'title', 'company_name', 'status', 'city', 'country'].includes(field)) {
        updates[field] = oldValue;
      } else {
        const custom = contact.custom_fields || {};
        custom[field] = oldValue;
        updates.custom_fields = custom;
      }
      await this.updateContact(workspaceId, row.entity_id, updates);
      return true;
    }
    return false;
  }

  // =========================================================================
  // TRANSACTIONAL EVENT OUTBOX
  // =========================================================================
  public async emitOutboxEvent(
    workspaceId: string,
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    payload: Record<string, any>
  ): Promise<CrmOutboxEvent> {
    const res = await this.pool.query(`
      INSERT INTO crm_outbox_events (
        workspace_id, event_type, aggregate_type, aggregate_id, payload, status, retry_count
      ) VALUES ($1, $2, $3, $4, $5, 'pending', 0)
      RETURNING *
    `, [
      workspaceId,
      eventType,
      aggregateType,
      aggregateId,
      JSON.stringify(payload || {})
    ]);
    const row = res.rows[0];
    return {
      ...row,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : (row.payload || {})
    };
  }

  public async fetchPendingOutboxEvents(limit: number = 50): Promise<CrmOutboxEvent[]> {
    const res = await this.pool.query(`
      SELECT * FROM crm_outbox_events
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT $1
    `, [limit]);
    return res.rows.map((r: any) => ({
      ...r,
      payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : (rowPayload(r.payload))
    }));
  }

  public async markOutboxEventPublished(eventId: string): Promise<boolean> {
    const res = await this.pool.query(`
      UPDATE crm_outbox_events
      SET status = 'published', published_at = NOW()
      WHERE id = $1
    `, [eventId]);
    return (res.rowCount ?? 0) > 0;
  }

  public async markOutboxEventFailed(eventId: string, errorMessage: string): Promise<boolean> {
    const res = await this.pool.query(`
      UPDATE crm_outbox_events
      SET status = 'failed', retry_count = retry_count + 1, error_message = $1
      WHERE id = $2
    `, [errorMessage, eventId]);
    return (res.rowCount ?? 0) > 0;
  }

  // =========================================================================
  // CRM V2 PHASE 2: IDENTITY RESOLUTION, GOLDEN RECORD & UNMERGE
  // =========================================================================
  public async recordMerge(
    workspaceId: string,
    primaryId: string,
    duplicateId: string,
    snapshot: any,
    rules: any
  ): Promise<ContactMergeRecord> {
    const res = await this.pool.query(`
      INSERT INTO crm_contact_merges (
        workspace_id, primary_contact_id, merged_contact_id, merged_contact_snapshot, survivorship_rules_applied
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [workspaceId, primaryId, duplicateId, JSON.stringify(snapshot), JSON.stringify(rules || {})]);

    const row = res.rows[0];
    return {
      ...row,
      merged_contact_snapshot: snapshot,
      survivorship_rules_applied: rules || {}
    };
  }

  public async unmergeContacts(workspaceId: string, mergeId: string): Promise<boolean> {
    const res = await this.pool.query(
      'SELECT * FROM crm_contact_merges WHERE workspace_id = $1 AND id = $2 AND unmerged_at IS NULL',
      [workspaceId, mergeId]
    );
    if (res.rows.length === 0) return false;

    const row = res.rows[0];
    const duplicateId = row.merged_contact_id;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE crm_contacts SET deleted_at = NULL, updated_at = NOW() WHERE workspace_id = $1 AND id = $2', [workspaceId, duplicateId]);
      await client.query('UPDATE crm_contact_merges SET unmerged_at = NOW() WHERE workspace_id = $1 AND id = $2', [workspaceId, mergeId]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    this.emitOutboxEvent(workspaceId, 'contact.unmerged', 'contact', duplicateId, { merge_id: mergeId, contact_id: duplicateId }).catch(() => {});
    return true;
  }

  public async listMerges(workspaceId: string, limit: number = 50): Promise<ContactMergeRecord[]> {
    const res = await this.pool.query(`
      SELECT * FROM crm_contact_merges
      WHERE workspace_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [workspaceId, limit]);

    return res.rows.map((r: any) => ({
      ...r,
      merged_contact_snapshot: typeof r.merged_contact_snapshot === 'string' ? JSON.parse(r.merged_contact_snapshot) : r.merged_contact_snapshot,
      survivorship_rules_applied: typeof r.survivorship_rules_applied === 'string' ? JSON.parse(r.survivorship_rules_applied) : r.survivorship_rules_applied
    }));
  }

  public async saveDuplicateCandidate(workspaceId: string, candidate: Partial<DuplicateCandidate>): Promise<DuplicateCandidate> {
    const res = await this.pool.query(`
      INSERT INTO crm_duplicate_candidates (
        workspace_id, primary_contact_id, duplicate_contact_id, confidence_score, match_reasons, status
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (workspace_id, primary_contact_id, duplicate_contact_id)
      DO UPDATE SET confidence_score = EXCLUDED.confidence_score, match_reasons = EXCLUDED.match_reasons, status = EXCLUDED.status
      RETURNING *
    `, [
      workspaceId,
      candidate.primary_contact_id,
      candidate.duplicate_contact_id,
      candidate.confidence_score || 0,
      JSON.stringify(candidate.match_reasons || []),
      candidate.status || 'pending_review'
    ]);

    const row = res.rows[0];
    return {
      ...row,
      confidence_score: Number(row.confidence_score),
      match_reasons: typeof row.match_reasons === 'string' ? JSON.parse(row.match_reasons) : (row.match_reasons || [])
    };
  }

  public async listDuplicateCandidates(workspaceId: string, status?: string, limit: number = 50): Promise<DuplicateCandidate[]> {
    let query = 'SELECT * FROM crm_duplicate_candidates WHERE workspace_id = $1';
    const params: any[] = [workspaceId];
    let pIdx = 2;
    if (status) {
      query += ` AND status = $${pIdx}`;
      params.push(status);
      pIdx++;
    }
    query += ` ORDER BY confidence_score DESC LIMIT $${pIdx}`;
    params.push(limit);

    const res = await this.pool.query(query, params);
    const results: DuplicateCandidate[] = [];

    for (const r of res.rows) {
      const primary = await this.getContact(workspaceId, r.primary_contact_id);
      const duplicate = await this.getContact(workspaceId, r.duplicate_contact_id);
      results.push({
        ...r,
        confidence_score: Number(r.confidence_score),
        match_reasons: typeof r.match_reasons === 'string' ? JSON.parse(r.match_reasons) : (r.match_reasons || []),
        primary_contact: primary || undefined,
        duplicate_contact: duplicate || undefined
      });
    }

    return results;
  }

  public async updateDuplicateCandidateStatus(workspaceId: string, id: string, status: string, reviewedBy?: string): Promise<boolean> {
    const res = await this.pool.query(`
      UPDATE crm_duplicate_candidates
      SET status = $1, reviewed_at = NOW(), reviewed_by = $2
      WHERE workspace_id = $3 AND id = $4
    `, [status, reviewedBy || null, workspaceId, id]);
    return (res.rowCount ?? 0) > 0;
  }

  // =========================================================================
  // CRM V2 PHASE 2: VERIFICATION & LOGS
  // =========================================================================
  public async logVerification(workspaceId: string, result: Partial<FieldVerificationResult>): Promise<FieldVerificationResult> {
    const res = await this.pool.query(`
      INSERT INTO crm_verification_logs (
        workspace_id, contact_id, field_name, field_value, provider, status, confidence, details
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      workspaceId,
      result.contact_id,
      result.field_name || 'email',
      result.field_value || '',
      result.provider || 'native_mx_e164',
      result.status || 'unknown',
      result.confidence !== undefined ? result.confidence : 1.0,
      JSON.stringify(result.details || {})
    ]);

    const row = res.rows[0];
    return {
      ...row,
      confidence: Number(row.confidence),
      details: typeof row.details === 'string' ? JSON.parse(row.details) : (row.details || {})
    };
  }

  public async listVerifications(workspaceId: string, contactId: string): Promise<FieldVerificationResult[]> {
    const res = await this.pool.query(`
      SELECT * FROM crm_verification_logs
      WHERE workspace_id = $1 AND contact_id = $2
      ORDER BY created_at DESC
    `, [workspaceId, contactId]);

    return res.rows.map((r: any) => ({
      ...r,
      confidence: Number(r.confidence),
      details: typeof r.details === 'string' ? JSON.parse(r.details) : (r.details || {})
    }));
  }

  // =========================================================================
  // CRM V2 PHASE 2: ENRICHMENT WATERFALL & CACHING
  // =========================================================================
  public async listEnrichmentProviders(workspaceId: string): Promise<EnrichmentProviderConfig[]> {
    const res = await this.pool.query(`
      SELECT * FROM crm_enrichment_providers
      WHERE workspace_id = $1
      ORDER BY priority_order ASC
    `, [workspaceId]);

    if (res.rows.length === 0) {
      const defaults = [
        { provider_name: 'local_intelligence', priority_order: 1, cost_per_lookup_credits: 0.1 },
        { provider_name: 'hunter', priority_order: 2, cost_per_lookup_credits: 1.0 },
        { provider_name: 'apollo', priority_order: 3, cost_per_lookup_credits: 2.0 },
        { provider_name: 'clearbit', priority_order: 4, cost_per_lookup_credits: 2.5 }
      ];
      for (const d of defaults) {
        await this.saveEnrichmentProvider(workspaceId, d);
      }
      return this.listEnrichmentProviders(workspaceId);
    }

    return res.rows.map((r: any) => ({
      ...r,
      cost_per_lookup_credits: Number(r.cost_per_lookup_credits),
      is_active: Boolean(r.is_active)
    }));
  }

  public async saveEnrichmentProvider(workspaceId: string, config: Partial<EnrichmentProviderConfig>): Promise<EnrichmentProviderConfig> {
    const res = await this.pool.query(`
      INSERT INTO crm_enrichment_providers (
        workspace_id, provider_name, priority_order, is_active, api_key_encrypted, cost_per_lookup_credits, rate_limit_rpm
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (workspace_id, provider_name)
      DO UPDATE SET priority_order = EXCLUDED.priority_order, is_active = EXCLUDED.is_active, api_key_encrypted = EXCLUDED.api_key_encrypted, cost_per_lookup_credits = EXCLUDED.cost_per_lookup_credits, rate_limit_rpm = EXCLUDED.rate_limit_rpm, updated_at = NOW()
      RETURNING *
    `, [
      workspaceId,
      config.provider_name,
      config.priority_order || 1,
      config.is_active !== undefined ? Boolean(config.is_active) : true,
      config.api_key_encrypted || null,
      config.cost_per_lookup_credits || 1.0,
      config.rate_limit_rpm || 60
    ]);

    const row = res.rows[0];
    return {
      ...row,
      cost_per_lookup_credits: Number(row.cost_per_lookup_credits),
      is_active: Boolean(row.is_active)
    };
  }

  public async getEnrichmentCache(lookupKey: string): Promise<any | null> {
    const res = await this.pool.query(`
      SELECT * FROM crm_enrichment_cache
      WHERE lookup_key = $1 AND expires_at > NOW()
    `, [lookupKey]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return typeof row.enriched_data === 'string' ? JSON.parse(row.enriched_data) : row.enriched_data;
  }

  public async setEnrichmentCache(lookupKey: string, providerName: string, data: any, ttlSeconds: number = 86400 * 30): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    await this.pool.query(`
      INSERT INTO crm_enrichment_cache (
        lookup_key, provider_name, enriched_data, expires_at
      ) VALUES ($1, $2, $3, $4)
      ON CONFLICT (lookup_key)
      DO UPDATE SET provider_name = EXCLUDED.provider_name, enriched_data = EXCLUDED.enriched_data, expires_at = EXCLUDED.expires_at
    `, [lookupKey, providerName, JSON.stringify(data || {}), expiresAt]);
  }

  // =========================================================================
  // CRM V2 PHASE 2: DATA HEALTH METRICS
  // =========================================================================
  public async getDataHealthMetrics(workspaceId: string): Promise<DataHealthMetrics> {
    const totalRes = await this.pool.query(`
      SELECT 
        count(*)::int as total,
        sum(CASE WHEN is_archived = false THEN 1 ELSE 0 END)::int as active,
        sum(CASE WHEN is_archived = true THEN 1 ELSE 0 END)::int as archived,
        sum(CASE WHEN email_status = 'valid' THEN 1 ELSE 0 END)::int as email_valid,
        sum(CASE WHEN email_status = 'risky' THEN 1 ELSE 0 END)::int as email_risky,
        sum(CASE WHEN email_status = 'invalid' THEN 1 ELSE 0 END)::int as email_invalid,
        sum(CASE WHEN email_status = 'unknown' OR email_status IS NULL THEN 1 ELSE 0 END)::int as email_unknown,
        sum(CASE WHEN phone_e164 IS NOT NULL AND length(phone_e164) > 4 THEN 1 ELSE 0 END)::int as phone_valid,
        sum(CASE WHEN phone IS NULL OR length(phone) = 0 THEN 1 ELSE 0 END)::int as phone_missing,
        sum(CASE WHEN email IS NULL OR length(email) = 0 THEN 1 ELSE 0 END)::int as email_missing,
        sum(CASE WHEN company_id IS NULL THEN 1 ELSE 0 END)::int as company_missing,
        sum(CASE WHEN title IS NULL OR length(title) = 0 THEN 1 ELSE 0 END)::int as title_missing,
        sum(CASE WHEN updated_at < NOW() - INTERVAL '180 days' THEN 1 ELSE 0 END)::int as stale_count
      FROM crm_contacts
      WHERE workspace_id = $1 AND deleted_at IS NULL
    `, [workspaceId]);

    const row = totalRes.rows[0] || {};
    const total = row.total || 0;
    const active = row.active || 0;
    const archived = row.archived || 0;
    const emailValid = row.email_valid || 0;
    const emailRisky = row.email_risky || 0;
    const emailInvalid = row.email_invalid || 0;
    const emailUnknown = row.email_unknown || 0;
    const emailValidPct = total > 0 ? Math.round((emailValid / total) * 100) : 100;

    const phoneValid = row.phone_valid || 0;
    const phoneMissing = row.phone_missing || 0;
    const phoneValidPct = total > 0 ? Math.round((phoneValid / total) * 100) : 100;

    const staleCount = row.stale_count || 0;
    const stalePct = total > 0 ? Math.round((staleCount / total) * 100) : 0;

    const dupeRes = await this.pool.query(`
      SELECT 
        count(*)::int as detected,
        sum(CASE WHEN status = 'pending_review' THEN 1 ELSE 0 END)::int as pending,
        sum(CASE WHEN status = 'auto_merged' THEN 1 ELSE 0 END)::int as auto_merged
      FROM crm_duplicate_candidates
      WHERE workspace_id = $1
    `, [workspaceId]);
    const dupeStats = dupeRes.rows[0] || {};

    const sourceRes = await this.pool.query(`
      SELECT 
        source,
        count(*)::int as total,
        sum(CASE WHEN email_status = 'valid' THEN 1 ELSE 0 END)::int as valid_emails
      FROM crm_contacts
      WHERE workspace_id = $1 AND deleted_at IS NULL
      GROUP BY source
      ORDER BY total DESC
    `, [workspaceId]);

    const sourceQuality = sourceRes.rows.map((sr: any) => ({
      source: sr.source || 'manual',
      total: sr.total,
      valid_email_rate: sr.total > 0 ? Math.round((sr.valid_emails / sr.total) * 100) : 0
    }));

    let qualityScore = 100;
    if (total > 0) {
      const emailScore = (emailValid / total) * 40;
      const phoneScore = (phoneValid / total) * 20;
      const completenessScore = ((total - ((row.email_missing || 0) + (row.company_missing || 0)) / 2) / total) * 25;
      const freshnessScore = ((total - staleCount) / total) * 15;
      qualityScore = Math.max(10, Math.min(100, Math.round(emailScore + phoneScore + completenessScore + freshnessScore)));
    }

    return {
      total_contacts: total,
      active_contacts: active,
      archived_contacts: archived,
      data_quality_score: qualityScore,
      email_health: {
        valid_count: emailValid,
        risky_count: emailRisky,
        invalid_count: emailInvalid,
        unknown_count: emailUnknown,
        valid_percentage: emailValidPct
      },
      phone_health: {
        e164_valid_count: phoneValid,
        missing_count: phoneMissing,
        valid_percentage: phoneValidPct
      },
      duplicates: {
        detected_count: dupeStats.detected || 0,
        pending_review_count: dupeStats.pending || 0,
        auto_merged_count: dupeStats.auto_merged || 0
      },
      missing_fields: {
        missing_email_count: row.email_missing || 0,
        missing_phone_count: row.phone_missing || 0,
        missing_company_count: row.company_missing || 0,
        missing_title_count: row.title_missing || 0
      },
      stale_records: {
        older_than_180_days: staleCount,
        percentage: stalePct
      },
      source_quality: sourceQuality
    };
  }

  // =========================================================================
  // CRM V2 PHASE 3: SAVED VIEWS & DYNAMIC SEGMENTS
  // =========================================================================
  public async listSavedViews(workspaceId: string): Promise<CrmSavedView[]> {
    const res = await this.pool.query(
      'SELECT * FROM crm_saved_views WHERE workspace_id = $1 ORDER BY created_at DESC',
      [workspaceId]
    );

    return res.rows.map((r: any) => ({
      ...r,
      is_dynamic: Boolean(r.is_dynamic),
      is_shared: Boolean(r.is_shared),
      cached_count: parseInt(r.cached_count || '0', 10),
      filter_definition: typeof r.filter_definition === 'string' ? JSON.parse(r.filter_definition) : (r.filter_definition || {}),
      visible_columns: typeof r.visible_columns === 'string' ? JSON.parse(r.visible_columns) : (r.visible_columns || [])
    }));
  }

  public async getSavedView(workspaceId: string, id: string): Promise<CrmSavedView | null> {
    const res = await this.pool.query(
      'SELECT * FROM crm_saved_views WHERE workspace_id = $1 AND id = $2',
      [workspaceId, id]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      ...r,
      is_dynamic: Boolean(r.is_dynamic),
      is_shared: Boolean(r.is_shared),
      cached_count: parseInt(r.cached_count || '0', 10),
      filter_definition: typeof r.filter_definition === 'string' ? JSON.parse(r.filter_definition) : (r.filter_definition || {}),
      visible_columns: typeof r.visible_columns === 'string' ? JSON.parse(r.visible_columns) : (r.visible_columns || [])
    };
  }

  public async createSavedView(workspaceId: string, view: Partial<CrmSavedView>): Promise<CrmSavedView> {
    const res = await this.pool.query(`
      INSERT INTO crm_saved_views (
        workspace_id, user_id, name, description, filter_definition, sort_by, sort_direction, visible_columns, is_dynamic, is_shared, cached_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      workspaceId,
      view.user_id || null,
      view.name || 'Untitled View',
      view.description || null,
      JSON.stringify(view.filter_definition || {}),
      view.sort_by || 'created_at',
      view.sort_direction || 'desc',
      JSON.stringify(view.visible_columns || ['name', 'email', 'phone', 'company_name', 'status']),
      view.is_dynamic !== undefined ? Boolean(view.is_dynamic) : true,
      view.is_shared !== undefined ? Boolean(view.is_shared) : false,
      view.cached_count || 0
    ]);

    const r = res.rows[0];
    return {
      ...r,
      is_dynamic: Boolean(r.is_dynamic),
      is_shared: Boolean(r.is_shared),
      cached_count: parseInt(r.cached_count || '0', 10),
      filter_definition: typeof r.filter_definition === 'string' ? JSON.parse(r.filter_definition) : (r.filter_definition || {}),
      visible_columns: typeof r.visible_columns === 'string' ? JSON.parse(r.visible_columns) : (r.visible_columns || [])
    };
  }

  public async updateSavedView(workspaceId: string, id: string, updates: Partial<CrmSavedView>): Promise<CrmSavedView> {
    const existing = await this.getSavedView(workspaceId, id);
    if (!existing) throw new Error('Saved view not found');

    const res = await this.pool.query(`
      UPDATE crm_saved_views SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        filter_definition = $3,
        sort_by = COALESCE($4, sort_by),
        sort_direction = COALESCE($5, sort_direction),
        visible_columns = $6,
        is_dynamic = COALESCE($7, is_dynamic),
        is_shared = COALESCE($8, is_shared),
        cached_count = COALESCE($9, cached_count),
        last_refreshed_at = NOW(),
        updated_at = NOW()
      WHERE workspace_id = $10 AND id = $11
      RETURNING *
    `, [
      updates.name || null,
      updates.description || null,
      updates.filter_definition !== undefined ? JSON.stringify(updates.filter_definition) : JSON.stringify(existing.filter_definition),
      updates.sort_by || null,
      updates.sort_direction || null,
      updates.visible_columns !== undefined ? JSON.stringify(updates.visible_columns) : JSON.stringify(existing.visible_columns),
      updates.is_dynamic !== undefined ? Boolean(updates.is_dynamic) : null,
      updates.is_shared !== undefined ? Boolean(updates.is_shared) : null,
      updates.cached_count !== undefined ? updates.cached_count : null,
      workspaceId,
      id
    ]);

    const r = res.rows[0];
    return {
      ...r,
      is_dynamic: Boolean(r.is_dynamic),
      is_shared: Boolean(r.is_shared),
      cached_count: parseInt(r.cached_count || '0', 10),
      filter_definition: typeof r.filter_definition === 'string' ? JSON.parse(r.filter_definition) : (r.filter_definition || {}),
      visible_columns: typeof r.visible_columns === 'string' ? JSON.parse(r.visible_columns) : (r.visible_columns || [])
    };
  }

  public async deleteSavedView(workspaceId: string, id: string): Promise<boolean> {
    await this.pool.query('DELETE FROM crm_saved_views WHERE workspace_id = $1 AND id = $2', [workspaceId, id]);
    return true;
  }

  // =========================================================================
  // CRM V2 PHASE 3: BULK ACTIONS ENGINE
  // =========================================================================
  public async createBulkJob(workspaceId: string, job: Partial<CrmBulkJob>): Promise<CrmBulkJob> {
    const res = await this.pool.query(`
      INSERT INTO crm_bulk_jobs (
        workspace_id, user_id, action_type, filter_criteria, action_payload, status, total_matched, undo_snapshot_available, undo_snapshot_path
      ) VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8)
      RETURNING *
    `, [
      workspaceId,
      job.user_id || null,
      job.action_type || 'bulk_update',
      JSON.stringify(job.filter_criteria || {}),
      JSON.stringify(job.action_payload || {}),
      job.total_matched || 0,
      job.undo_snapshot_available !== false,
      job.undo_snapshot_path || null
    ]);

    const r = res.rows[0];
    return {
      ...r,
      total_matched: parseInt(r.total_matched || '0', 10),
      processed_count: parseInt(r.processed_count || '0', 10),
      success_count: parseInt(r.success_count || '0', 10),
      error_count: parseInt(r.error_count || '0', 10),
      undo_snapshot_available: Boolean(r.undo_snapshot_available),
      filter_criteria: typeof r.filter_criteria === 'string' ? JSON.parse(r.filter_criteria) : (r.filter_criteria || {}),
      action_payload: typeof r.action_payload === 'string' ? JSON.parse(r.action_payload) : (r.action_payload || {}),
      error_details: typeof r.error_details === 'string' ? JSON.parse(r.error_details) : (r.error_details || [])
    };
  }

  public async getBulkJob(workspaceId: string, jobId: string): Promise<CrmBulkJob | null> {
    const res = await this.pool.query('SELECT * FROM crm_bulk_jobs WHERE workspace_id = $1 AND id = $2', [workspaceId, jobId]);
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      ...r,
      total_matched: parseInt(r.total_matched || '0', 10),
      processed_count: parseInt(r.processed_count || '0', 10),
      success_count: parseInt(r.success_count || '0', 10),
      error_count: parseInt(r.error_count || '0', 10),
      undo_snapshot_available: Boolean(r.undo_snapshot_available),
      filter_criteria: typeof r.filter_criteria === 'string' ? JSON.parse(r.filter_criteria) : (r.filter_criteria || {}),
      action_payload: typeof r.action_payload === 'string' ? JSON.parse(r.action_payload) : (r.action_payload || {}),
      error_details: typeof r.error_details === 'string' ? JSON.parse(r.error_details) : (r.error_details || [])
    };
  }

  public async updateBulkJobProgress(jobId: string, progress: Partial<CrmBulkJob>): Promise<void> {
    const updates: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (progress.status) {
      updates.push(`status = $${pIdx}`);
      params.push(progress.status);
      pIdx++;
      if (progress.status === 'running') updates.push('started_at = NOW()');
      if (progress.status === 'completed' || progress.status === 'failed' || progress.status === 'cancelled') updates.push('completed_at = NOW()');
      if (progress.status === 'undone') updates.push('undone_at = NOW()');
    }
    if (progress.processed_count !== undefined) {
      updates.push(`processed_count = $${pIdx}`);
      params.push(progress.processed_count);
      pIdx++;
    }
    if (progress.success_count !== undefined) {
      updates.push(`success_count = $${pIdx}`);
      params.push(progress.success_count);
      pIdx++;
    }
    if (progress.error_count !== undefined) {
      updates.push(`error_count = $${pIdx}`);
      params.push(progress.error_count);
      pIdx++;
    }
    if (progress.error_details !== undefined) {
      updates.push(`error_details = $${pIdx}`);
      params.push(JSON.stringify(progress.error_details));
      pIdx++;
    }
    if (progress.undo_snapshot_path !== undefined) {
      updates.push(`undo_snapshot_path = $${pIdx}`);
      params.push(progress.undo_snapshot_path);
      pIdx++;
    }

    if (updates.length === 0) return;
    params.push(jobId);
    await this.pool.query(`UPDATE crm_bulk_jobs SET ${updates.join(', ')} WHERE id = $${pIdx}`, params);
  }

  public async listBulkJobs(workspaceId: string, limit: number = 20): Promise<CrmBulkJob[]> {
    const res = await this.pool.query(
      'SELECT * FROM crm_bulk_jobs WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT $2',
      [workspaceId, limit]
    );

    return res.rows.map((r: any) => ({
      ...r,
      total_matched: parseInt(r.total_matched || '0', 10),
      processed_count: parseInt(r.processed_count || '0', 10),
      success_count: parseInt(r.success_count || '0', 10),
      error_count: parseInt(r.error_count || '0', 10),
      undo_snapshot_available: Boolean(r.undo_snapshot_available),
      filter_criteria: typeof r.filter_criteria === 'string' ? JSON.parse(r.filter_criteria) : (r.filter_criteria || {}),
      action_payload: typeof r.action_payload === 'string' ? JSON.parse(r.action_payload) : (r.action_payload || {}),
      error_details: typeof r.error_details === 'string' ? JSON.parse(r.error_details) : (r.error_details || [])
    }));
  }

  // =========================================================================
  // CRM V2 PHASE 4: AI LAYER & SMART ENGINES
  // =========================================================================
  public async logAiUsage(workspaceId: string, log: Partial<CrmAiUsageLog>): Promise<CrmAiUsageLog> {
    const res = await this.pool.query(`
      INSERT INTO crm_ai_usage_logs (
        workspace_id, user_id, action_type, model_tier, prompt_tokens, completion_tokens, credits_charged, currency
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      workspaceId,
      log.user_id || null,
      log.action_type || 'contact_brief',
      log.model_tier || 'gemini-1.5-flash',
      log.prompt_tokens || 0,
      log.completion_tokens || 0,
      log.credits_charged || 0,
      log.currency || 'INR'
    ]);
    const r = res.rows[0];
    return {
      ...r,
      credits_charged: parseFloat(r.credits_charged || '0'),
      prompt_tokens: parseInt(r.prompt_tokens || '0', 10),
      completion_tokens: parseInt(r.completion_tokens || '0', 10)
    };
  }

  public async getAiUsageSummary(workspaceId: string, days: number = 30): Promise<{ totalCredits: number; totalTokens: number; countByAction: Record<string, number> }> {
    const sumRes = await this.pool.query(`
      SELECT 
        COALESCE(SUM(credits_charged), 0) as total_credits,
        COALESCE(SUM(prompt_tokens + completion_tokens), 0) as total_tokens
      FROM crm_ai_usage_logs
      WHERE workspace_id = $1 AND created_at >= NOW() - ($2 || ' days')::INTERVAL
    `, [workspaceId, days]);

    const actRes = await this.pool.query(`
      SELECT action_type, COUNT(*) as cnt
      FROM crm_ai_usage_logs
      WHERE workspace_id = $1 AND created_at >= NOW() - ($2 || ' days')::INTERVAL
      GROUP BY action_type
    `, [workspaceId, days]);

    const countByAction: Record<string, number> = {};
    for (const r of actRes.rows) {
      countByAction[r.action_type] = parseInt(r.cnt || '0', 10);
    }

    return {
      totalCredits: parseFloat(sumRes.rows[0]?.total_credits || '0'),
      totalTokens: parseInt(sumRes.rows[0]?.total_tokens || '0', 10),
      countByAction
    };
  }

  public async listScoringRules(workspaceId: string): Promise<CrmScoringRule[]> {
    const res = await this.pool.query(
      'SELECT * FROM crm_scoring_rules WHERE workspace_id = $1 ORDER BY created_at ASC',
      [workspaceId]
    );

    if (res.rows.length === 0) {
      const defaults: Array<Partial<CrmScoringRule>> = [
        { name: 'Executive Title (ICP)', rule_type: 'icp_title', criteria: { titles: ['CEO', 'CTO', 'Founder', 'Director', 'VP'] }, points_change: 25 },
        { name: 'Tier 1 Country', rule_type: 'country_tier', criteria: { countries: ['United States', 'USA', 'India', 'United Kingdom', 'Canada', 'UAE'] }, points_change: 15 },
        { name: 'Verified Valid Email', rule_type: 'verified_email', criteria: { email_status: 'valid' }, points_change: 20 },
        { name: 'Direct Phone Available', rule_type: 'phone_present', criteria: { required: true }, points_change: 15 },
        { name: 'Recent Activity (< 7 days)', rule_type: 'activity_recency', criteria: { within_days: 7 }, points_change: 15 },
        { name: 'Inactivity Decay (> 30 days)', rule_type: 'time_decay', criteria: { inactive_days: 30 }, points_change: -15 }
      ];
      for (const d of defaults) {
        await this.saveScoringRule(workspaceId, d);
      }
      return this.listScoringRules(workspaceId);
    }

    return res.rows.map((r: any) => ({
      ...r,
      is_active: Boolean(r.is_active),
      criteria: typeof r.criteria === 'string' ? JSON.parse(r.criteria) : (r.criteria || {})
    }));
  }

  public async saveScoringRule(workspaceId: string, rule: Partial<CrmScoringRule>): Promise<CrmScoringRule> {
    const res = await this.pool.query(`
      INSERT INTO crm_scoring_rules (
        id, workspace_id, name, rule_type, criteria, points_change, is_active, created_at, updated_at
      ) VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        rule_type = EXCLUDED.rule_type,
        criteria = EXCLUDED.criteria,
        points_change = EXCLUDED.points_change,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING *
    `, [
      rule.id || null,
      workspaceId,
      rule.name || 'Custom Scoring Rule',
      rule.rule_type || 'icp_title',
      JSON.stringify(rule.criteria || {}),
      rule.points_change !== undefined ? rule.points_change : 10,
      rule.is_active !== undefined ? rule.is_active : true
    ]);
    const r = res.rows[0];
    return {
      ...r,
      is_active: Boolean(r.is_active),
      criteria: typeof r.criteria === 'string' ? JSON.parse(r.criteria) : (r.criteria || {})
    };
  }

  public async deleteScoringRule(workspaceId: string, id: string): Promise<boolean> {
    await this.pool.query('DELETE FROM crm_scoring_rules WHERE workspace_id = $1 AND id = $2', [workspaceId, id]);
    return true;
  }

  // =========================================================================
  // CRM V2 PHASE 5: WORKFLOWS & AUTOMATIONS
  // =========================================================================
  public async listWorkflows(workspaceId: string): Promise<CrmWorkflow[]> {
    const res = await this.pool.query(
      'SELECT * FROM crm_workflows WHERE workspace_id = $1 ORDER BY created_at DESC',
      [workspaceId]
    );

    return res.rows.map((r: any) => ({
      ...r,
      total_runs: parseInt(r.total_runs || '0', 10),
      is_active: Boolean(r.is_active),
      trigger_config: typeof r.trigger_config === 'string' ? JSON.parse(r.trigger_config) : (r.trigger_config || {}),
      filter_criteria: typeof r.filter_criteria === 'string' ? JSON.parse(r.filter_criteria) : (r.filter_criteria || {}),
      steps: typeof r.steps === 'string' ? JSON.parse(r.steps) : (r.steps || [])
    }));
  }

  public async getWorkflow(workspaceId: string, id: string): Promise<CrmWorkflow | null> {
    const res = await this.pool.query(
      'SELECT * FROM crm_workflows WHERE workspace_id = $1 AND id = $2',
      [workspaceId, id]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];

    return {
      ...r,
      total_runs: parseInt(r.total_runs || '0', 10),
      is_active: Boolean(r.is_active),
      trigger_config: typeof r.trigger_config === 'string' ? JSON.parse(r.trigger_config) : (r.trigger_config || {}),
      filter_criteria: typeof r.filter_criteria === 'string' ? JSON.parse(r.filter_criteria) : (r.filter_criteria || {}),
      steps: typeof r.steps === 'string' ? JSON.parse(r.steps) : (r.steps || [])
    };
  }

  public async createWorkflow(workspaceId: string, data: Partial<CrmWorkflow>): Promise<CrmWorkflow> {
    const res = await this.pool.query(`
      INSERT INTO crm_workflows (
        workspace_id, name, description, is_active, trigger_type, trigger_config, filter_criteria, steps, total_runs
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0)
      RETURNING *
    `, [
      workspaceId,
      data.name || 'Untitled Workflow',
      data.description || null,
      data.is_active !== undefined ? data.is_active : true,
      data.trigger_type || 'contact_created',
      JSON.stringify(data.trigger_config || {}),
      JSON.stringify(data.filter_criteria || {}),
      JSON.stringify(data.steps || [])
    ]);

    const r = res.rows[0];
    return {
      ...r,
      total_runs: parseInt(r.total_runs || '0', 10),
      is_active: Boolean(r.is_active),
      trigger_config: typeof r.trigger_config === 'string' ? JSON.parse(r.trigger_config) : (r.trigger_config || {}),
      filter_criteria: typeof r.filter_criteria === 'string' ? JSON.parse(r.filter_criteria) : (r.filter_criteria || {}),
      steps: typeof r.steps === 'string' ? JSON.parse(r.steps) : (r.steps || [])
    };
  }

  public async updateWorkflow(workspaceId: string, id: string, updates: Partial<CrmWorkflow>): Promise<CrmWorkflow> {
    const fields: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${pIdx++}`);
      params.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${pIdx++}`);
      params.push(updates.description);
    }
    if (updates.is_active !== undefined) {
      fields.push(`is_active = $${pIdx++}`);
      params.push(updates.is_active);
    }
    if (updates.trigger_type !== undefined) {
      fields.push(`trigger_type = $${pIdx++}`);
      params.push(updates.trigger_type);
    }
    if (updates.trigger_config !== undefined) {
      fields.push(`trigger_config = $${pIdx++}`);
      params.push(JSON.stringify(updates.trigger_config));
    }
    if (updates.filter_criteria !== undefined) {
      fields.push(`filter_criteria = $${pIdx++}`);
      params.push(JSON.stringify(updates.filter_criteria));
    }
    if (updates.steps !== undefined) {
      fields.push(`steps = $${pIdx++}`);
      params.push(JSON.stringify(updates.steps));
    }
    if (updates.total_runs !== undefined) {
      fields.push(`total_runs = $${pIdx++}`);
      params.push(updates.total_runs);
    }

    if (fields.length > 0) {
      fields.push('updated_at = NOW()');
      params.push(workspaceId, id);
      await this.pool.query(
        `UPDATE crm_workflows SET ${fields.join(', ')} WHERE workspace_id = $${pIdx++} AND id = $${pIdx++}`,
        params
      );
    }

    return (await this.getWorkflow(workspaceId, id))!;
  }

  public async deleteWorkflow(workspaceId: string, id: string): Promise<boolean> {
    await this.pool.query('DELETE FROM crm_workflows WHERE workspace_id = $1 AND id = $2', [workspaceId, id]);
    return true;
  }

  // =========================================================================
  // WORKFLOW RUNS & TIMERS
  // =========================================================================
  public async createWorkflowRun(workspaceId: string, data: Partial<CrmWorkflowRun>): Promise<CrmWorkflowRun> {
    const res = await this.pool.query(`
      INSERT INTO crm_workflow_runs (
        workspace_id, workflow_id, contact_id, status, current_step_index, next_execution_at, execution_context
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      workspaceId,
      data.workflow_id,
      data.contact_id,
      data.status || 'running',
      data.current_step_index || 0,
      data.next_execution_at || null,
      JSON.stringify(data.execution_context || {})
    ]);

    // Increment workflow total_runs counter
    await this.pool.query('UPDATE crm_workflows SET total_runs = total_runs + 1 WHERE id = $1', [data.workflow_id]);

    const r = res.rows[0];
    return {
      ...r,
      current_step_index: parseInt(r.current_step_index || '0', 10),
      execution_context: typeof r.execution_context === 'string' ? JSON.parse(r.execution_context) : (r.execution_context || {})
    };
  }

  public async getWorkflowRun(workspaceId: string, runId: string): Promise<CrmWorkflowRun | null> {
    const res = await this.pool.query(
      'SELECT * FROM crm_workflow_runs WHERE workspace_id = $1 AND id = $2',
      [workspaceId, runId]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];

    return {
      ...r,
      current_step_index: parseInt(r.current_step_index || '0', 10),
      execution_context: typeof r.execution_context === 'string' ? JSON.parse(r.execution_context) : (r.execution_context || {})
    };
  }

  public async updateWorkflowRun(runId: string, updates: Partial<CrmWorkflowRun>): Promise<void> {
    const fields: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (updates.status !== undefined) {
      fields.push(`status = $${pIdx++}`);
      params.push(updates.status);
      if (['completed', 'failed', 'cancelled'].includes(updates.status)) {
        fields.push('completed_at = NOW()');
      }
    }
    if (updates.current_step_index !== undefined) {
      fields.push(`current_step_index = $${pIdx++}`);
      params.push(updates.current_step_index);
    }
    if (updates.next_execution_at !== undefined) {
      fields.push(`next_execution_at = $${pIdx++}`);
      params.push(updates.next_execution_at);
    }
    if (updates.execution_context !== undefined) {
      fields.push(`execution_context = $${pIdx++}`);
      params.push(JSON.stringify(updates.execution_context));
    }
    if (updates.error_message !== undefined) {
      fields.push(`error_message = $${pIdx++}`);
      params.push(updates.error_message);
    }

    if (fields.length === 0) return;
    params.push(runId);
    await this.pool.query(`UPDATE crm_workflow_runs SET ${fields.join(', ')} WHERE id = $${pIdx++}`, params);
  }

  public async listPendingWorkflowRuns(limit: number = 100): Promise<CrmWorkflowRun[]> {
    const res = await this.pool.query(`
      SELECT * FROM crm_workflow_runs
      WHERE status = 'waiting_delay' AND next_execution_at <= NOW()
      ORDER BY next_execution_at ASC
      LIMIT $1
    `, [limit]);

    return res.rows.map((r: any) => ({
      ...r,
      current_step_index: parseInt(r.current_step_index || '0', 10),
      execution_context: typeof r.execution_context === 'string' ? JSON.parse(r.execution_context) : (r.execution_context || {})
    }));
  }

  public async listWorkflowRuns(workspaceId: string, workflowId?: string, limit: number = 50): Promise<CrmWorkflowRun[]> {
    const sql = workflowId
      ? 'SELECT * FROM crm_workflow_runs WHERE workspace_id = $1 AND workflow_id = $2 ORDER BY started_at DESC LIMIT $3'
      : 'SELECT * FROM crm_workflow_runs WHERE workspace_id = $1 ORDER BY started_at DESC LIMIT $2';
    const params = workflowId ? [workspaceId, workflowId, limit] : [workspaceId, limit];
    const res = await this.pool.query(sql, params);

    return res.rows.map((r: any) => ({
      ...r,
      current_step_index: parseInt(r.current_step_index || '0', 10),
      execution_context: typeof r.execution_context === 'string' ? JSON.parse(r.execution_context) : (r.execution_context || {})
    }));
  }

  // =========================================================================
  // STEP LOGS
  // =========================================================================
  public async logWorkflowStepExecution(log: Partial<CrmWorkflowStepLog>): Promise<CrmWorkflowStepLog> {
    const res = await this.pool.query(`
      INSERT INTO crm_workflow_step_logs (
        run_id, workflow_id, step_index, action_type, status, input_payload, output_payload, error_message, duration_ms
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      log.run_id,
      log.workflow_id,
      log.step_index || 0,
      log.action_type || 'condition',
      log.status || 'success',
      JSON.stringify(log.input_payload || {}),
      JSON.stringify(log.output_payload || {}),
      log.error_message || null,
      log.duration_ms || 0
    ]);

    const r = res.rows[0];
    return {
      ...r,
      step_index: parseInt(r.step_index || '0', 10),
      duration_ms: parseInt(r.duration_ms || '0', 10),
      input_payload: typeof r.input_payload === 'string' ? JSON.parse(r.input_payload) : (r.input_payload || {}),
      output_payload: typeof r.output_payload === 'string' ? JSON.parse(r.output_payload) : (r.output_payload || {})
    };
  }

  public async listWorkflowStepLogs(runId: string): Promise<CrmWorkflowStepLog[]> {
    const res = await this.pool.query(
      'SELECT * FROM crm_workflow_step_logs WHERE run_id = $1 ORDER BY step_index ASC, created_at ASC',
      [runId]
    );

    return res.rows.map((r: any) => ({
      ...r,
      step_index: parseInt(r.step_index || '0', 10),
      duration_ms: parseInt(r.duration_ms || '0', 10),
      input_payload: typeof r.input_payload === 'string' ? JSON.parse(r.input_payload) : (r.input_payload || {}),
      output_payload: typeof r.output_payload === 'string' ? JSON.parse(r.output_payload) : (r.output_payload || {})
    }));
  }

  // =========================================================================
  // COMPLIANCE POLICY SETTINGS
  // =========================================================================
  public async getCompliancePolicy(workspaceId: string): Promise<CrmCompliancePolicy> {
    const res = await this.pool.query('SELECT * FROM crm_compliance_policies WHERE workspace_id = $1', [workspaceId]);
    if (res.rows.length === 0) {
      const insRes = await this.pool.query(`
        INSERT INTO crm_compliance_policies (
          workspace_id, max_messages_per_day, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, auto_opt_out_keywords
        ) VALUES ($1, 3, TRUE, '21:00', '09:00', '["STOP", "UNSUBSCRIBE", "CANCEL", "ROK DO"]'::jsonb)
        ON CONFLICT (workspace_id) DO NOTHING
        RETURNING *
      `, [workspaceId]);
      if (insRes.rows.length > 0) {
        const r = insRes.rows[0];
        return {
          ...r,
          max_messages_per_day: parseInt(r.max_messages_per_day || '3', 10),
          quiet_hours_enabled: Boolean(r.quiet_hours_enabled),
          auto_opt_out_keywords: typeof r.auto_opt_out_keywords === 'string' ? JSON.parse(r.auto_opt_out_keywords) : (r.auto_opt_out_keywords || [])
        };
      }
      return this.getCompliancePolicy(workspaceId);
    }

    const r = res.rows[0];
    return {
      ...r,
      max_messages_per_day: parseInt(r.max_messages_per_day || '3', 10),
      quiet_hours_enabled: Boolean(r.quiet_hours_enabled),
      auto_opt_out_keywords: typeof r.auto_opt_out_keywords === 'string' ? JSON.parse(r.auto_opt_out_keywords) : (r.auto_opt_out_keywords || [])
    };
  }

  public async saveCompliancePolicy(workspaceId: string, policy: Partial<CrmCompliancePolicy>): Promise<CrmCompliancePolicy> {
    const fields: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (policy.max_messages_per_day !== undefined) {
      fields.push(`max_messages_per_day = $${pIdx++}`);
      params.push(policy.max_messages_per_day);
    }
    if (policy.quiet_hours_enabled !== undefined) {
      fields.push(`quiet_hours_enabled = $${pIdx++}`);
      params.push(policy.quiet_hours_enabled);
    }
    if (policy.quiet_hours_start !== undefined) {
      fields.push(`quiet_hours_start = $${pIdx++}`);
      params.push(policy.quiet_hours_start);
    }
    if (policy.quiet_hours_end !== undefined) {
      fields.push(`quiet_hours_end = $${pIdx++}`);
      params.push(policy.quiet_hours_end);
    }
    if (policy.auto_opt_out_keywords !== undefined) {
      fields.push(`auto_opt_out_keywords = $${pIdx++}`);
      params.push(JSON.stringify(policy.auto_opt_out_keywords));
    }

    if (fields.length > 0) {
      fields.push('updated_at = NOW()');
      params.push(workspaceId);
      await this.pool.query(
        `UPDATE crm_compliance_policies SET ${fields.join(', ')} WHERE workspace_id = $${pIdx++}`,
        params
      );
    }

    return this.getCompliancePolicy(workspaceId);
  }

  // =========================================================================
  // CRM V2 PHASE 6: PIPELINES & STAGES
  // =========================================================================
  public async listPipelines(workspaceId: string): Promise<CrmPipeline[]> {
    const res = await this.pool.query(
      'SELECT * FROM crm_pipelines WHERE workspace_id = $1 ORDER BY created_at ASC',
      [workspaceId]
    );

    if (res.rows.length === 0) {
      const p = await this.createPipeline(workspaceId, 'Sales Pipeline', true);
      return [p];
    }

    return res.rows.map((r: any) => ({ ...r, is_default: Boolean(r.is_default) }));
  }

  public async getPipeline(workspaceId: string, id: string): Promise<CrmPipeline | null> {
    const res = await this.pool.query('SELECT * FROM crm_pipelines WHERE workspace_id = $1 AND id = $2', [workspaceId, id]);
    if (res.rows.length === 0) return null;
    return { ...res.rows[0], is_default: Boolean(res.rows[0].is_default) };
  }

  public async createPipeline(workspaceId: string, name: string, isDefault: boolean = true): Promise<CrmPipeline> {
    const res = await this.pool.query(`
      INSERT INTO crm_pipelines (workspace_id, name, is_default)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [workspaceId, name, isDefault]);

    const pipeline = res.rows[0];

    const defaultStages = [
      { name: 'Lead In', order_index: 0, win_probability: 10, rotten_days: 7 },
      { name: 'Discovery', order_index: 1, win_probability: 25, rotten_days: 14 },
      { name: 'Proposal Sent', order_index: 2, win_probability: 60, rotten_days: 10 },
      { name: 'Negotiation', order_index: 3, win_probability: 80, rotten_days: 7 },
      { name: 'Closed Won', order_index: 4, win_probability: 100, rotten_days: 999, is_won: true },
      { name: 'Closed Lost', order_index: 5, win_probability: 0, rotten_days: 999, is_lost: true }
    ];

    for (const s of defaultStages) {
      await this.createPipelineStage(workspaceId, { ...s, pipeline_id: pipeline.id });
    }

    return { ...pipeline, is_default: Boolean(pipeline.is_default) };
  }

  public async listPipelineStages(workspaceId: string, pipelineId: string): Promise<CrmPipelineStage[]> {
    const res = await this.pool.query(`
      SELECT * FROM crm_pipeline_stages WHERE workspace_id = $1 AND pipeline_id = $2 ORDER BY order_index ASC
    `, [workspaceId, pipelineId]);

    return res.rows.map((r: any) => ({
      ...r,
      order_index: parseInt(r.order_index || '0', 10),
      win_probability: parseInt(r.win_probability || '0', 10),
      rotten_days: parseInt(r.rotten_days || '14', 10),
      is_won: Boolean(r.is_won),
      is_lost: Boolean(r.is_lost)
    }));
  }

  public async createPipelineStage(workspaceId: string, stage: Partial<CrmPipelineStage>): Promise<CrmPipelineStage> {
    const res = await this.pool.query(`
      INSERT INTO crm_pipeline_stages (
        workspace_id, pipeline_id, name, order_index, win_probability, rotten_days, is_won, is_lost
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      workspaceId,
      stage.pipeline_id,
      stage.name || 'Stage',
      stage.order_index || 0,
      stage.win_probability || 10,
      stage.rotten_days || 14,
      stage.is_won || false,
      stage.is_lost || false
    ]);

    const r = res.rows[0];
    return {
      ...r,
      order_index: parseInt(r.order_index || '0', 10),
      win_probability: parseInt(r.win_probability || '0', 10),
      rotten_days: parseInt(r.rotten_days || '14', 10),
      is_won: Boolean(r.is_won),
      is_lost: Boolean(r.is_lost)
    };
  }

  public async updatePipelineStage(workspaceId: string, id: string, stage: Partial<CrmPipelineStage>): Promise<CrmPipelineStage> {
    const fields: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (stage.name !== undefined) {
      fields.push(`name = $${pIdx++}`);
      params.push(stage.name);
    }
    if (stage.order_index !== undefined) {
      fields.push(`order_index = $${pIdx++}`);
      params.push(stage.order_index);
    }
    if (stage.win_probability !== undefined) {
      fields.push(`win_probability = $${pIdx++}`);
      params.push(stage.win_probability);
    }
    if (stage.rotten_days !== undefined) {
      fields.push(`rotten_days = $${pIdx++}`);
      params.push(stage.rotten_days);
    }
    if (stage.is_won !== undefined) {
      fields.push(`is_won = $${pIdx++}`);
      params.push(stage.is_won);
    }
    if (stage.is_lost !== undefined) {
      fields.push(`is_lost = $${pIdx++}`);
      params.push(stage.is_lost);
    }

    if (fields.length > 0) {
      fields.push('updated_at = NOW()');
      params.push(workspaceId, id);
      await this.pool.query(
        `UPDATE crm_pipeline_stages SET ${fields.join(', ')} WHERE workspace_id = $${pIdx++} AND id = $${pIdx++}`,
        params
      );
    }

    const res = await this.pool.query('SELECT * FROM crm_pipeline_stages WHERE workspace_id = $1 AND id = $2', [workspaceId, id]);
    const r = res.rows[0];
    return {
      ...r,
      order_index: parseInt(r.order_index || '0', 10),
      win_probability: parseInt(r.win_probability || '0', 10),
      rotten_days: parseInt(r.rotten_days || '14', 10),
      is_won: Boolean(r.is_won),
      is_lost: Boolean(r.is_lost)
    };
  }

  // =========================================================================
  // DEALS (OPPORTUNITIES)
  // =========================================================================
  public async listDeals(
    workspaceId: string,
    filter: { pipelineId?: string; stageId?: string; contactId?: string; status?: string } = {}
  ): Promise<CrmDeal[]> {
    const conditions = ['d.workspace_id = $1'];
    const params: any[] = [workspaceId];
    let pIdx = 2;

    if (filter.pipelineId) {
      conditions.push(`d.pipeline_id = $${pIdx++}`);
      params.push(filter.pipelineId);
    }
    if (filter.stageId) {
      conditions.push(`d.stage_id = $${pIdx++}`);
      params.push(filter.stageId);
    }
    if (filter.contactId) {
      conditions.push(`d.contact_id = $${pIdx++}`);
      params.push(filter.contactId);
    }
    if (filter.status) {
      conditions.push(`d.status = $${pIdx++}`);
      params.push(filter.status);
    }

    const res = await this.pool.query(`
      SELECT d.*, s.name as stage_name, s.rotten_days
      FROM crm_deals d
      LEFT JOIN crm_pipeline_stages s ON s.id = d.stage_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY d.created_at DESC
    `, params);

    const now = Date.now();
    return res.rows.map((r: any) => {
      const lastAct = r.last_activity_at ? new Date(r.last_activity_at).getTime() : new Date(r.updated_at).getTime();
      const inactiveDays = (now - lastAct) / (1000 * 3600 * 24);
      const isRotten = r.status === 'open' && r.rotten_days ? inactiveDays > r.rotten_days : false;

      return {
        ...r,
        amount: parseFloat(r.amount || '0'),
        amount_usd: parseFloat(r.amount_usd || '0'),
        custom_fields: typeof r.custom_fields === 'string' ? JSON.parse(r.custom_fields) : (r.custom_fields || {}),
        is_rotten: isRotten
      };
    });
  }

  public async getDeal(workspaceId: string, id: string): Promise<CrmDeal | null> {
    const res = await this.pool.query(`
      SELECT d.*, s.name as stage_name, s.rotten_days
      FROM crm_deals d
      LEFT JOIN crm_pipeline_stages s ON s.id = d.stage_id
      WHERE d.workspace_id = $1 AND d.id = $2
    `, [workspaceId, id]);

    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    const now = Date.now();
    const lastAct = r.last_activity_at ? new Date(r.last_activity_at).getTime() : new Date(r.updated_at).getTime();
    const inactiveDays = (now - lastAct) / (1000 * 3600 * 24);
    const isRotten = r.status === 'open' && r.rotten_days ? inactiveDays > r.rotten_days : false;

    return {
      ...r,
      amount: parseFloat(r.amount || '0'),
      amount_usd: parseFloat(r.amount_usd || '0'),
      custom_fields: typeof r.custom_fields === 'string' ? JSON.parse(r.custom_fields) : (r.custom_fields || {}),
      is_rotten: isRotten
    };
  }

  public async createDeal(workspaceId: string, deal: Partial<CrmDeal>): Promise<CrmDeal> {
    const res = await this.pool.query(`
      INSERT INTO crm_deals (
        workspace_id, pipeline_id, stage_id, contact_id, company_id, name, amount, currency, amount_usd,
        expected_close_date, status, owner_user_id, custom_fields
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      workspaceId,
      deal.pipeline_id,
      deal.stage_id,
      deal.contact_id || null,
      deal.company_id || null,
      deal.name || 'New Opportunity',
      deal.amount || 0.0,
      deal.currency || 'USD',
      deal.amount_usd || deal.amount || 0.0,
      deal.expected_close_date || null,
      deal.status || 'open',
      deal.owner_user_id || null,
      JSON.stringify(deal.custom_fields || {})
    ]);

    const r = res.rows[0];
    return {
      ...r,
      amount: parseFloat(r.amount || '0'),
      amount_usd: parseFloat(r.amount_usd || '0'),
      custom_fields: typeof r.custom_fields === 'string' ? JSON.parse(r.custom_fields) : (r.custom_fields || {})
    };
  }

  public async updateDeal(workspaceId: string, id: string, updates: Partial<CrmDeal>): Promise<CrmDeal> {
    const fields: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (updates.pipeline_id !== undefined) {
      fields.push(`pipeline_id = $${pIdx++}`);
      params.push(updates.pipeline_id);
    }
    if (updates.stage_id !== undefined) {
      fields.push(`stage_id = $${pIdx++}`);
      params.push(updates.stage_id);
    }
    if (updates.contact_id !== undefined) {
      fields.push(`contact_id = $${pIdx++}`);
      params.push(updates.contact_id);
    }
    if (updates.company_id !== undefined) {
      fields.push(`company_id = $${pIdx++}`);
      params.push(updates.company_id);
    }
    if (updates.name !== undefined) {
      fields.push(`name = $${pIdx++}`);
      params.push(updates.name);
    }
    if (updates.amount !== undefined) {
      fields.push(`amount = $${pIdx++}`);
      params.push(updates.amount);
    }
    if (updates.currency !== undefined) {
      fields.push(`currency = $${pIdx++}`);
      params.push(updates.currency);
    }
    if (updates.amount_usd !== undefined) {
      fields.push(`amount_usd = $${pIdx++}`);
      params.push(updates.amount_usd);
    }
    if (updates.expected_close_date !== undefined) {
      fields.push(`expected_close_date = $${pIdx++}`);
      params.push(updates.expected_close_date);
    }
    if (updates.status !== undefined) {
      fields.push(`status = $${pIdx++}`);
      params.push(updates.status);
    }
    if (updates.owner_user_id !== undefined) {
      fields.push(`owner_user_id = $${pIdx++}`);
      params.push(updates.owner_user_id);
    }
    if (updates.custom_fields !== undefined) {
      fields.push(`custom_fields = $${pIdx++}`);
      params.push(JSON.stringify(updates.custom_fields));
    }

    if (fields.length > 0) {
      fields.push('last_activity_at = NOW()', 'updated_at = NOW()');
      params.push(workspaceId, id);
      await this.pool.query(
        `UPDATE crm_deals SET ${fields.join(', ')} WHERE workspace_id = $${pIdx++} AND id = $${pIdx++}`,
        params
      );
    }

    return (await this.getDeal(workspaceId, id))!;
  }

  public async deleteDeal(workspaceId: string, id: string): Promise<boolean> {
    await this.pool.query('DELETE FROM crm_deals WHERE workspace_id = $1 AND id = $2', [workspaceId, id]);
    return true;
  }

  // =========================================================================
  // TASKS & SLA
  // =========================================================================
  public async listTasks(
    workspaceId: string,
    filter: { contactId?: string; dealId?: string; status?: string; assignedTo?: string } = {}
  ): Promise<CrmTask[]> {
    const conditions = ['workspace_id = $1'];
    const params: any[] = [workspaceId];
    let pIdx = 2;

    if (filter.contactId) {
      conditions.push(`contact_id = $${pIdx++}`);
      params.push(filter.contactId);
    }
    if (filter.dealId) {
      conditions.push(`deal_id = $${pIdx++}`);
      params.push(filter.dealId);
    }
    if (filter.status) {
      conditions.push(`status = $${pIdx++}`);
      params.push(filter.status);
    }
    if (filter.assignedTo) {
      conditions.push(`assigned_to_user_id = $${pIdx++}`);
      params.push(filter.assignedTo);
    }

    const res = await this.pool.query(`
      SELECT * FROM crm_tasks WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC
    `, params);

    const now = Date.now();
    return res.rows.map((r: any) => {
      let isOverdue = false;
      let remainingMin: number | null = null;

      if (r.due_date && r.status !== 'completed' && r.status !== 'cancelled') {
        const due = new Date(r.due_date).getTime();
        isOverdue = due < now;
        remainingMin = Math.round((due - now) / (1000 * 60));
      }

      return {
        ...r,
        sla_minutes: r.sla_minutes ? parseInt(r.sla_minutes, 10) : null,
        is_overdue: isOverdue,
        sla_remaining_minutes: remainingMin
      };
    });
  }

  public async createTask(workspaceId: string, task: Partial<CrmTask>): Promise<CrmTask> {
    const res = await this.pool.query(`
      INSERT INTO crm_tasks (
        workspace_id, deal_id, contact_id, title, description, assigned_to_user_id, due_date, sla_minutes,
        priority, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      workspaceId,
      task.deal_id || null,
      task.contact_id || null,
      task.title || 'Untitled Task',
      task.description || null,
      task.assigned_to_user_id || null,
      task.due_date || null,
      task.sla_minutes || null,
      task.priority || 'medium',
      task.status || 'pending'
    ]);

    const r = res.rows[0];
    return {
      ...r,
      sla_minutes: r.sla_minutes ? parseInt(r.sla_minutes, 10) : null
    };
  }

  public async updateTask(workspaceId: string, id: string, updates: Partial<CrmTask>): Promise<CrmTask> {
    const fields: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (updates.title !== undefined) {
      fields.push(`title = $${pIdx++}`);
      params.push(updates.title);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${pIdx++}`);
      params.push(updates.description);
    }
    if (updates.assigned_to_user_id !== undefined) {
      fields.push(`assigned_to_user_id = $${pIdx++}`);
      params.push(updates.assigned_to_user_id);
    }
    if (updates.due_date !== undefined) {
      fields.push(`due_date = $${pIdx++}`);
      params.push(updates.due_date);
    }
    if (updates.sla_minutes !== undefined) {
      fields.push(`sla_minutes = $${pIdx++}`);
      params.push(updates.sla_minutes);
    }
    if (updates.priority !== undefined) {
      fields.push(`priority = $${pIdx++}`);
      params.push(updates.priority);
    }
    if (updates.status !== undefined) {
      fields.push(`status = $${pIdx++}`);
      params.push(updates.status);
      if (updates.status === 'completed') {
        fields.push('completed_at = NOW()');
      }
    }

    if (fields.length > 0) {
      fields.push('updated_at = NOW()');
      params.push(workspaceId, id);
      await this.pool.query(
        `UPDATE crm_tasks SET ${fields.join(', ')} WHERE workspace_id = $${pIdx++} AND id = $${pIdx++}`,
        params
      );
    }

    const res = await this.pool.query('SELECT * FROM crm_tasks WHERE workspace_id = $1 AND id = $2', [workspaceId, id]);
    const r = res.rows[0];
    return {
      ...r,
      sla_minutes: r.sla_minutes ? parseInt(r.sla_minutes, 10) : null
    };
  }

  public async deleteTask(workspaceId: string, id: string): Promise<boolean> {
    await this.pool.query('DELETE FROM crm_tasks WHERE workspace_id = $1 AND id = $2', [workspaceId, id]);
    return true;
  }

  // =========================================================================
  // PRESENCE & COLLISION DETECTION
  // =========================================================================
  public async upsertPresence(session: Partial<CrmPresenceSession>): Promise<void> {
    const expiresAt = session.expires_at || new Date(Date.now() + 60000).toISOString();

    await this.pool.query(`
      INSERT INTO crm_presence_sessions (
        workspace_id, user_id, user_name, entity_type, entity_id, action, expires_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (workspace_id, entity_type, entity_id, user_id) DO UPDATE SET
        user_name = EXCLUDED.user_name,
        action = EXCLUDED.action,
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
    `, [
      session.workspace_id,
      session.user_id,
      session.user_name || 'Teammate',
      session.entity_type || 'contact',
      session.entity_id,
      session.action || 'viewing',
      expiresAt
    ]);
  }

  public async getPresentUsers(
    workspaceId: string,
    entityType: 'contact' | 'deal',
    entityId: string
  ): Promise<CrmPresenceSession[]> {
    const res = await this.pool.query(`
      SELECT * FROM crm_presence_sessions
      WHERE workspace_id = $1 AND entity_type = $2 AND entity_id = $3 AND expires_at > NOW()
      ORDER BY updated_at DESC
    `, [workspaceId, entityType, entityId]);

    return res.rows;
  }

  public async clearPresence(workspaceId: string, entityType: string, entityId: string, userId: string): Promise<void> {
    await this.pool.query(`
      DELETE FROM crm_presence_sessions
      WHERE workspace_id = $1 AND entity_type = $2 AND entity_id = $3 AND user_id = $4
    `, [workspaceId, entityType, entityId, userId]);
  }

  // =========================================================================
  // CRM V2 PHASE 7: RBAC, PRIVACY & GDPR ERASURE
  // =========================================================================
  public async listRolePermissions(workspaceId: string): Promise<CrmRolePermission[]> {
    const res = await this.pool.query('SELECT * FROM crm_role_permissions WHERE workspace_id = $1', [workspaceId]);
    if (res.rows.length === 0) {
      const defaultRoles = [
        { role: 'owner', can_export: true, can_bulk_delete: true, can_view_phones: true, can_view_emails: true, can_view_sensitive_fields: true, can_merge_contacts: true, can_manage_api_keys: true, can_manage_billing: true },
        { role: 'admin', can_export: true, can_bulk_delete: true, can_view_phones: true, can_view_emails: true, can_view_sensitive_fields: true, can_merge_contacts: true, can_manage_api_keys: true, can_manage_billing: true },
        { role: 'manager', can_export: true, can_bulk_delete: false, can_view_phones: true, can_view_emails: true, can_view_sensitive_fields: true, can_merge_contacts: true, can_manage_api_keys: false, can_manage_billing: false },
        { role: 'rep', can_export: false, can_bulk_delete: false, can_view_phones: true, can_view_emails: true, can_view_sensitive_fields: false, can_merge_contacts: false, can_manage_api_keys: false, can_manage_billing: false },
        { role: 'read_only', can_export: false, can_bulk_delete: false, can_view_phones: false, can_view_emails: false, can_view_sensitive_fields: false, can_merge_contacts: false, can_manage_api_keys: false, can_manage_billing: false }
      ];

      for (const r of defaultRoles) {
        await this.saveRolePermission(workspaceId, r);
      }
      return this.listRolePermissions(workspaceId);
    }

    return res.rows.map((r: any) => ({
      ...r,
      can_export: Boolean(r.can_export),
      can_bulk_delete: Boolean(r.can_bulk_delete),
      can_view_phones: Boolean(r.can_view_phones),
      can_view_emails: Boolean(r.can_view_emails),
      can_view_sensitive_fields: Boolean(r.can_view_sensitive_fields),
      can_merge_contacts: Boolean(r.can_merge_contacts),
      can_manage_api_keys: Boolean(r.can_manage_api_keys),
      can_manage_billing: Boolean(r.can_manage_billing)
    }));
  }

  public async getRolePermission(workspaceId: string, role: string): Promise<CrmRolePermission | null> {
    const permissions = await this.listRolePermissions(workspaceId);
    return permissions.find((p) => p.role === role) || null;
  }

  public async saveRolePermission(workspaceId: string, perm: Partial<CrmRolePermission>): Promise<CrmRolePermission> {
    const res = await this.pool.query(`
      INSERT INTO crm_role_permissions (
        workspace_id, role, can_export, can_bulk_delete, can_view_phones, can_view_emails,
        can_view_sensitive_fields, can_merge_contacts, can_manage_api_keys, can_manage_billing, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      ON CONFLICT (workspace_id, role) DO UPDATE SET
        can_export = EXCLUDED.can_export,
        can_bulk_delete = EXCLUDED.can_bulk_delete,
        can_view_phones = EXCLUDED.can_view_phones,
        can_view_emails = EXCLUDED.can_view_emails,
        can_view_sensitive_fields = EXCLUDED.can_view_sensitive_fields,
        can_merge_contacts = EXCLUDED.can_merge_contacts,
        can_manage_api_keys = EXCLUDED.can_manage_api_keys,
        can_manage_billing = EXCLUDED.can_manage_billing,
        updated_at = NOW()
      RETURNING *
    `, [
      workspaceId,
      perm.role || 'rep',
      Boolean(perm.can_export),
      Boolean(perm.can_bulk_delete),
      Boolean(perm.can_view_phones),
      Boolean(perm.can_view_emails),
      Boolean(perm.can_view_sensitive_fields),
      Boolean(perm.can_merge_contacts),
      Boolean(perm.can_manage_api_keys),
      Boolean(perm.can_manage_billing)
    ]);

    const r = res.rows[0];
    return {
      ...r,
      can_export: Boolean(r.can_export),
      can_bulk_delete: Boolean(r.can_bulk_delete),
      can_view_phones: Boolean(r.can_view_phones),
      can_view_emails: Boolean(r.can_view_emails),
      can_view_sensitive_fields: Boolean(r.can_view_sensitive_fields),
      can_merge_contacts: Boolean(r.can_merge_contacts),
      can_manage_api_keys: Boolean(r.can_manage_api_keys),
      can_manage_billing: Boolean(r.can_manage_billing)
    };
  }

  public async listSensitiveFields(workspaceId: string): Promise<CrmSensitiveField[]> {
    const res = await this.pool.query('SELECT * FROM crm_sensitive_fields WHERE workspace_id = $1', [workspaceId]);
    if (res.rows.length === 0) {
      const defaults = [
        { field_key: 'salary', entity_type: 'contact', mask_strategy: 'redact' as const },
        { field_key: 'ssn', entity_type: 'contact', mask_strategy: 'hidden' as const },
        { field_key: 'aadhaar', entity_type: 'contact', mask_strategy: 'partial' as const },
        { field_key: 'credit_score', entity_type: 'contact', mask_strategy: 'redact' as const }
      ];
      for (const d of defaults) {
        await this.addSensitiveField(workspaceId, d);
      }
      return this.listSensitiveFields(workspaceId);
    }
    return res.rows;
  }

  public async addSensitiveField(workspaceId: string, field: Partial<CrmSensitiveField>): Promise<CrmSensitiveField> {
    const res = await this.pool.query(`
      INSERT INTO crm_sensitive_fields (workspace_id, field_key, entity_type, mask_strategy)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (workspace_id, entity_type, field_key) DO UPDATE SET
        mask_strategy = EXCLUDED.mask_strategy
      RETURNING *
    `, [workspaceId, field.field_key, field.entity_type || 'contact', field.mask_strategy || 'redact']);

    return res.rows[0];
  }

  public async removeSensitiveField(workspaceId: string, id: string): Promise<boolean> {
    await this.pool.query('DELETE FROM crm_sensitive_fields WHERE workspace_id = $1 AND id = $2', [workspaceId, id]);
    return true;
  }

  public async saveErasureCertificate(cert: Partial<CrmErasureCertificate>): Promise<CrmErasureCertificate> {
    const res = await this.pool.query(`
      INSERT INTO crm_erasure_certificates (
        workspace_id, contact_id, requester_email, records_purged, audit_hash, erased_by_user_id
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      cert.workspace_id,
      cert.contact_id,
      cert.requester_email,
      cert.records_purged || 1,
      cert.audit_hash,
      cert.erased_by_user_id || null
    ]);

    const r = res.rows[0];
    return {
      ...r,
      records_purged: parseInt(r.records_purged || '1', 10)
    };
  }

  public async getErasureCertificate(id: string): Promise<CrmErasureCertificate | null> {
    const res = await this.pool.query('SELECT * FROM crm_erasure_certificates WHERE id = $1', [id]);
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      ...r,
      records_purged: parseInt(r.records_purged || '1', 10)
    };
  }

  public async hardDeleteContact(workspaceId: string, contactId: string): Promise<number> {
    const client = await this.pool.connect();
    let purgedCount = 0;
    try {
      await client.query('BEGIN');

      const r1 = await client.query('DELETE FROM crm_contact_tags WHERE workspace_id = $1 AND contact_id = $2', [workspaceId, contactId]);
      purgedCount += r1.rowCount || 0;

      const r2 = await client.query('DELETE FROM crm_list_members WHERE workspace_id = $1 AND contact_id = $2', [workspaceId, contactId]);
      purgedCount += r2.rowCount || 0;

      const r3 = await client.query('DELETE FROM crm_activities WHERE workspace_id = $1 AND contact_id = $2', [workspaceId, contactId]);
      purgedCount += r3.rowCount || 0;

      const r4 = await client.query("DELETE FROM crm_field_history WHERE workspace_id = $1 AND entity_type = 'contact' AND entity_id = $2", [workspaceId, contactId]);
      purgedCount += r4.rowCount || 0;

      const r5 = await client.query('DELETE FROM crm_tasks WHERE workspace_id = $1 AND contact_id = $2', [workspaceId, contactId]);
      purgedCount += r5.rowCount || 0;

      await client.query("DELETE FROM crm_presence_sessions WHERE workspace_id = $1 AND entity_type = 'contact' AND entity_id = $2", [workspaceId, contactId]);

      const r7 = await client.query('DELETE FROM crm_contacts WHERE workspace_id = $1 AND id = $2', [workspaceId, contactId]);
      purgedCount += r7.rowCount || 0;

      await client.query('COMMIT');
      return purgedCount;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // =========================================================================
  // CRM V2 PHASE 9: ANALYTICS, FUNNELS, ATTRIBUTION & COHORTS
  // =========================================================================
  public async getFunnelMetrics(workspaceId: string, pipelineId?: string): Promise<FunnelMetrics> {
    let targetPipelineId = pipelineId;
    if (!targetPipelineId) {
      const pRes = await this.pool.query(
        'SELECT id FROM crm_pipelines WHERE workspace_id = $1 ORDER BY is_default DESC, created_at ASC LIMIT 1',
        [workspaceId]
      );
      targetPipelineId = pRes.rows[0]?.id;
    }
    if (!targetPipelineId) {
      return {
        pipeline_id: '',
        stages: [],
        overall_win_rate: 0,
        avg_sales_cycle_days: 0,
        win_rate_by_source: {}
      };
    }

    const stagesRes = await this.pool.query(
      `SELECT id, name, order_index, is_won, is_lost 
       FROM crm_pipeline_stages 
       WHERE workspace_id = $1 AND pipeline_id = $2 
       ORDER BY order_index ASC`,
      [workspaceId, targetPipelineId]
    );
    const stages = stagesRes.rows;

    const dealsRes = await this.pool.query(
      `SELECT d.id, d.stage_id, d.amount_usd, d.status, d.created_at, d.updated_at, COALESCE(c.source, 'manual') as source
       FROM crm_deals d
       LEFT JOIN crm_contacts c ON d.contact_id = c.id
       WHERE d.workspace_id = $1 AND d.pipeline_id = $2`,
      [workspaceId, targetPipelineId]
    );
    const deals = dealsRes.rows;

    const stageMetrics: FunnelStageMetric[] = [];
    let prevCount = 0;

    for (let i = 0; i < stages.length; i++) {
      const st = stages[i];
      const dealsInStage = deals.filter(d => d.stage_id === st.id);
      const dealCount = dealsInStage.length;
      const totalVal = dealsInStage.reduce((sum, d) => sum + (Number(d.amount_usd) || 0), 0);
      
      let conv = 100;
      if (i > 0) {
        conv = prevCount > 0 ? Math.round((dealCount / prevCount) * 100) : (dealCount > 0 ? 100 : 0);
      }
      prevCount = dealCount;

      stageMetrics.push({
        stage_id: st.id,
        stage_name: st.name,
        deal_count: dealCount,
        total_value_usd: Math.round(totalVal),
        conversion_from_previous: conv,
        drop_off_rate: Math.max(0, 100 - conv)
      });
    }

    const wonDeals = deals.filter(d => d.status === 'won');
    const totalDeals = deals.length;
    const overallWinRate = totalDeals > 0 ? Math.round((wonDeals.length / totalDeals) * 100) : 0;

    const cycleDaysList = wonDeals.map(d => {
      const diff = new Date(d.updated_at).getTime() - new Date(d.created_at).getTime();
      return Math.max(0, diff / (1000 * 3600 * 24));
    });
    const avgCycle = cycleDaysList.length > 0 ? Math.round(cycleDaysList.reduce((a, b) => a + b, 0) / cycleDaysList.length) : 0;

    const sourceMap: Record<string, { total: number; won: number }> = {};
    for (const d of deals) {
      const s = d.source || 'manual';
      if (!sourceMap[s]) sourceMap[s] = { total: 0, won: 0 };
      sourceMap[s].total++;
      if (d.status === 'won') sourceMap[s].won++;
    }
    const winRateBySource: Record<string, number> = {};
    for (const s in sourceMap) {
      winRateBySource[s] = Math.round((sourceMap[s].won / sourceMap[s].total) * 100);
    }

    return {
      pipeline_id: targetPipelineId,
      stages: stageMetrics,
      overall_win_rate: overallWinRate,
      avg_sales_cycle_days: avgCycle,
      win_rate_by_source: winRateBySource
    };
  }

  public async getAttributionMetrics(workspaceId: string): Promise<AttributionSummary> {
    const contactRes = await this.pool.query(
      `SELECT COALESCE(source, 'manual') as src, count(*) as count
       FROM crm_contacts
       WHERE workspace_id = $1 AND deleted_at IS NULL
       GROUP BY COALESCE(source, 'manual')`,
      [workspaceId]
    );

    const dealRes = await this.pool.query(
      `SELECT 
        COALESCE(c.source, 'manual') as src, 
        count(d.id) as deals_count, 
        sum(CASE WHEN d.status = 'won' THEN d.amount_usd ELSE 0 END) as won_val
       FROM crm_contacts c
       LEFT JOIN crm_deals d ON d.contact_id = c.id AND d.workspace_id = c.workspace_id
       WHERE c.workspace_id = $1 AND c.deleted_at IS NULL
       GROUP BY COALESCE(c.source, 'manual')`,
      [workspaceId]
    );

    const dealMap: Record<string, { deals_count: number; won_val: number }> = {};
    for (const dr of dealRes.rows) {
      dealMap[dr.src] = {
        deals_count: Number(dr.deals_count) || 0,
        won_val: Number(dr.won_val) || 0
      };
    }

    let totalContacts = 0;
    let totalWonValue = 0;
    const bySource: AttributionSourceRow[] = [];

    for (const cr of contactRes.rows) {
      const src = cr.src;
      const count = Number(cr.count) || 0;
      const deals = dealMap[src]?.deals_count || 0;
      const won = dealMap[src]?.won_val || 0;

      totalContacts += count;
      totalWonValue += won;

      bySource.push({
        source: src,
        contacts_count: count,
        deals_count: deals,
        won_value_usd: Math.round(won),
        conversion_rate: count > 0 ? Math.round((deals / count) * 100) : 0
      });
    }

    return {
      by_source: bySource,
      total_contacts: totalContacts,
      total_won_value_usd: Math.round(totalWonValue)
    };
  }

  public async getCohortRetention(workspaceId: string, months: number = 6): Promise<CohortRow[]> {
    const contactsRes = await this.pool.query(
      `SELECT id, to_char(created_at, 'YYYY-MM') as cohort_month, created_at
       FROM crm_contacts
       WHERE workspace_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [workspaceId]
    );

    const actRes = await this.pool.query(
      `SELECT a.contact_id, a.created_at
       FROM crm_activities a
       WHERE a.workspace_id = $1`,
      [workspaceId]
    );

    const actByContact: Record<string, string[]> = {};
    for (const a of actRes.rows) {
      if (!actByContact[a.contact_id]) actByContact[a.contact_id] = [];
      actByContact[a.contact_id].push(a.created_at);
    }

    const cohortMap: Record<string, any[]> = {};
    for (const c of contactsRes.rows) {
      const m = c.cohort_month || 'Unknown';
      if (!cohortMap[m]) cohortMap[m] = [];
      cohortMap[m].push(c);
    }

    const cohortMonths = Object.keys(cohortMap).sort().reverse().slice(0, months);
    const result: CohortRow[] = [];

    for (const m of cohortMonths) {
      const group = cohortMap[m];
      const total = group.length;

      let m0Active = 0;
      let m1Active = 0;
      let m2Active = 0;
      let m3Active = 0;

      for (const c of group) {
        const cTime = new Date(c.created_at).getTime();
        const acts = actByContact[c.id] || [];

        let hasM0 = false;
        let hasM1 = false;
        let hasM2 = false;
        let hasM3 = false;

        for (const actDate of acts) {
          const aTime = new Date(actDate).getTime();
          const diffDays = (aTime - cTime) / (1000 * 3600 * 24);

          if (diffDays >= 0 && diffDays <= 30) hasM0 = true;
          else if (diffDays > 30 && diffDays <= 60) hasM1 = true;
          else if (diffDays > 60 && diffDays <= 90) hasM2 = true;
          else if (diffDays > 90 && diffDays <= 120) hasM3 = true;
        }

        if (hasM0) m0Active++;
        if (hasM1) m1Active++;
        if (hasM2) m2Active++;
        if (hasM3) m3Active++;
      }

      result.push({
        cohort_month: m,
        total_contacts: total,
        active_m0_pct: total > 0 ? Math.round((m0Active / total) * 100) : 0,
        active_m1_pct: total > 0 ? Math.round((m1Active / total) * 100) : 0,
        active_m2_pct: total > 0 ? Math.round((m2Active / total) * 100) : 0,
        active_m3_pct: total > 0 ? Math.round((m3Active / total) * 100) : 0
      });
    }

    return result;
  }

  public async runCustomReport(workspaceId: string, spec: CustomReportSpec): Promise<CustomReportResult> {
    let rows: any[] = [];

    if (spec.dimension === 'stage') {
      const res = await this.pool.query(
        `SELECT 
          s.name as dim_val,
          count(d.id) as cnt,
          COALESCE(sum(d.amount_usd), 0) as total_val,
          COALESCE(avg(d.amount_usd), 0) as avg_val
        FROM crm_pipeline_stages s
        LEFT JOIN crm_deals d ON d.stage_id = s.id AND d.workspace_id = s.workspace_id
        WHERE s.workspace_id = $1
        GROUP BY s.name
        ORDER BY cnt DESC`,
        [workspaceId]
      );
      rows = res.rows;
    } else {
      let dimExpr = 'c.country';
      if (spec.dimension === 'source') dimExpr = "COALESCE(c.source, 'manual')";
      else if (spec.dimension === 'status') dimExpr = "COALESCE(c.status, 'lead')";
      else if (spec.dimension === 'created_month') dimExpr = "to_char(c.created_at, 'YYYY-MM')";

      const res = await this.pool.query(
        `SELECT 
          ${dimExpr} as dim_val,
          count(DISTINCT c.id) as cnt,
          COALESCE(sum(d.amount_usd), 0) as total_val,
          COALESCE(avg(d.amount_usd), 0) as avg_val
        FROM crm_contacts c
        LEFT JOIN crm_deals d ON d.contact_id = c.id AND d.workspace_id = c.workspace_id
        WHERE c.workspace_id = $1 AND c.deleted_at IS NULL
        GROUP BY ${dimExpr}
        ORDER BY cnt DESC`,
        [workspaceId]
      );
      rows = res.rows;
    }

    return {
      dimension: spec.dimension,
      chart_type: spec.chart_type || 'bar',
      generated_at: new Date().toISOString(),
      rows: rows.map(r => ({
        dimension_value: r.dim_val || 'Unknown',
        metrics: {
          ...(spec.metrics.includes('count') ? { count: Number(r.cnt) || 0 } : {}),
          ...(spec.metrics.includes('total_deal_value') ? { total_deal_value: Math.round(Number(r.total_val) || 0) } : {}),
          ...(spec.metrics.includes('avg_deal_value') ? { avg_deal_value: Math.round(Number(r.avg_val) || 0) } : {})
        }
      }))
    };
  }
}

function rowPayload(val: any): any {
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return {};
    }
  }
  return val || {};
}

