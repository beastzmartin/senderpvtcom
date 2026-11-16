import crypto from 'crypto';
import { getDatabase } from '../db/database.js';
import { getSocketIO } from '../socket/socketManager.js';
import { ConnectorRegistry } from './connectors/ConnectorRegistry.js';
import { LeadRecord, LeadStatus, LeadFilterOptions } from './connectors/types.js';
import { CrmExtractorPipelineService } from '../crm/services/CrmExtractorPipelineService.js';
import { getCrmDb } from '../crm/db/index.js';

export class LeadService {
  private static instance: LeadService | null = null;

  public static getInstance(): LeadService {
    if (!LeadService.instance) {
      LeadService.instance = new LeadService();
    }
    return LeadService.instance;
  }

  private mapRow(row: any): LeadRecord {
    return {
      id: row.id,
      user_id: row.user_id,
      job_id: row.job_id || null,
      business_name: row.business_name,
      category: row.category || null,
      industry: row.industry || null,
      email: row.email || null,
      phone: row.phone || null,
      website: row.website || null,
      address: row.address || null,
      city: row.city || null,
      state: row.state || null,
      country: row.country || null,
      postal_code: row.postal_code || null,
      latitude: row.latitude !== null ? Number(row.latitude) : null,
      longitude: row.longitude !== null ? Number(row.longitude) : null,
      rating: row.rating !== null ? Number(row.rating) : null,
      reviews_count: row.reviews_count !== null ? Number(row.reviews_count) : 0,
      operating_status: row.operating_status || null,
      place_id: row.place_id || null,
      listing_url: row.listing_url || null,
      source: row.source || 'google_maps',
      source_url: row.source_url || null,
      social_profiles: row.social_profiles ? JSON.parse(row.social_profiles) : null,
      status: row.status || 'new',
      is_verified: row.is_verified === 1,
      notes: row.notes || null,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      tags: [],
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  /**
   * Check for duplicate lead within a user's workspace
   */
  public findDuplicate(userId: string, data: Partial<LeadRecord>): LeadRecord | null {
    const db = getDatabase();

    // 1. Phone match
    if (data.phone) {
      const cleanDigits = data.phone.replace(/\D/g, '');
      if (cleanDigits.length >= 7) {
        const queryDigits = cleanDigits.slice(-10);
        const match = db
          .prepare(`SELECT * FROM leads WHERE user_id = ? AND REPLACE(REPLACE(phone, '+', ''), ' ', '') LIKE ? LIMIT 1`)
          .get(userId, `%${queryDigits}`) as any;
        if (match) return this.mapRow(match);
      }
    }

    // 2. Email match
    if (data.email) {
      const cleanEmail = data.email.trim().toLowerCase();
      const match = db
        .prepare(`SELECT * FROM leads WHERE user_id = ? AND LOWER(email) = ? LIMIT 1`)
        .get(userId, cleanEmail) as any;
      if (match) return this.mapRow(match);
    }

    // 3. Place ID match
    if (data.place_id) {
      const placeIdStr = typeof data.place_id === 'string' ? data.place_id.trim() : String(data.place_id).trim();
      if (placeIdStr && !placeIdStr.startsWith('[object')) {
        const match = db
          .prepare(`SELECT * FROM leads WHERE user_id = ? AND place_id = ? LIMIT 1`)
          .get(userId, placeIdStr) as any;
        if (match) return this.mapRow(match);
      }
    }

    // 4. Exact business name + city match
    if (data.business_name && (data.city || data.address)) {
      const cleanName = data.business_name.trim().toLowerCase();
      const cleanCity = (data.city || '').trim().toLowerCase();
      if (cleanCity) {
        const match = db
          .prepare(`SELECT * FROM leads WHERE user_id = ? AND LOWER(business_name) = ? AND LOWER(city) = ? LIMIT 1`)
          .get(userId, cleanName, cleanCity) as any;
        if (match) return this.mapRow(match);
      }
    }

    return null;
  }

  /**
   * Create a single lead
   */
  public createLead(userId: string, raw: Partial<LeadRecord>): LeadRecord {
    const db = getDatabase();
    const registry = ConnectorRegistry.getInstance();
    const connector = registry.get(raw.source || 'google_maps') || registry.get('google_maps')!;
    const normalized = connector.normalizeLead(raw, userId, raw.job_id || undefined);

    const existing = this.findDuplicate(userId, normalized);
    if (existing) {
      return existing;
    }

    const id = crypto.randomUUID();
    const stmt = db.prepare(`
      INSERT INTO leads (
        id, user_id, job_id, business_name, category, industry,
        email, phone, website, address, city, state, country, postal_code,
        latitude, longitude, rating, reviews_count, operating_status,
        place_id, listing_url, source, source_url, social_profiles,
        status, is_verified, notes, metadata
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?
      )
    `);

    stmt.run(
      id,
      userId,
      normalized.job_id || null,
      normalized.business_name,
      normalized.category || null,
      normalized.industry || null,
      normalized.email || null,
      normalized.phone || null,
      normalized.website || null,
      normalized.address || null,
      normalized.city || null,
      normalized.state || null,
      normalized.country || null,
      normalized.postal_code || null,
      normalized.latitude ?? null,
      normalized.longitude ?? null,
      normalized.rating ?? null,
      normalized.reviews_count || 0,
      normalized.operating_status || 'Operational',
      normalized.place_id || null,
      normalized.listing_url || null,
      normalized.source || 'google_maps',
      normalized.source_url || null,
      normalized.social_profiles ? JSON.stringify(normalized.social_profiles) : null,
      normalized.status || 'new',
      normalized.is_verified ? 1 : 0,
      normalized.notes || null,
      normalized.metadata ? JSON.stringify(normalized.metadata) : null
    );

    const created = this.getLeadById(userId, id)!;

    // Real-time broadcast
    try {
      getSocketIO()?.to(`user:${userId}`).emit('lead:created', created);
    } catch {}

    return created;
  }

  /**
   * Batch create/sync leads (used by extension and background extraction jobs)
   */
  public batchCreateLeads(
    userId: string,
    rawLeads: Partial<LeadRecord>[],
    jobId?: string
  ): { created: LeadRecord[]; duplicates: number; failed: number } {
    const created: LeadRecord[] = [];
    let duplicates = 0;
    let failed = 0;

    const registry = ConnectorRegistry.getInstance();

    for (const raw of rawLeads) {
      try {
        const connector = registry.get(raw.source || 'google_maps') || registry.get('google_maps')!;
        const normalized = connector.normalizeLead(raw, userId, jobId);

        if (!normalized.business_name) {
          failed++;
          continue;
        }

        const existing = this.findDuplicate(userId, normalized);
        if (existing) {
          duplicates++;
          continue;
        }

        const lead = this.createLead(userId, { ...normalized, job_id: jobId });
        created.push(lead);
      } catch (err) {
        failed++;
      }
    }

    if (created.length > 0) {
      try {
        getSocketIO()?.to(`user:${userId}`).emit('lead:batch_synced', {
          count: created.length,
          duplicates,
          failed,
          jobId
        });
      } catch {}

      // Flow leads into CRM workspace
      try {
        const crmDb = getCrmDb();
        crmDb.getUserDefaultWorkspace(userId).then((ws) => {
          if (ws) {
            CrmExtractorPipelineService.getInstance().ingestExtractorResults(
              ws.id,
              null,
              created,
              'extractor:google_maps',
              jobId,
              'update'
            );
          }
        }).catch(() => {});
      } catch {}
    }

    return { created, duplicates, failed };
  }

  /**
   * Retrieve a lead by ID with assigned tags
   */
  public getLeadById(userId: string, leadId: string): LeadRecord | null {
    const db = getDatabase();
    const row = db.prepare(`SELECT * FROM leads WHERE id = ? AND user_id = ?`).get(leadId, userId) as any;
    if (!row) return null;

    const lead = this.mapRow(row);
    // Fetch tags
    const tags = db
      .prepare(`
        SELECT t.id, t.name, t.color
        FROM lead_tags t
        JOIN lead_tag_mappings m ON m.tag_id = t.id
        WHERE m.lead_id = ?
      `)
      .all(leadId) as Array<{ id: string; name: string; color: string }>;

    lead.tags = tags;
    return lead;
  }

  /**
   * Update lead fields
   */
  public updateLead(userId: string, leadId: string, data: Partial<LeadRecord>): LeadRecord {
    const db = getDatabase();
    const existing = this.getLeadById(userId, leadId);
    if (!existing) {
      throw new Error('Lead not found.');
    }

    const updates: string[] = [];
    const params: any[] = [];

    const allowedFields = [
      'business_name', 'category', 'industry', 'email', 'phone',
      'website', 'address', 'city', 'state', 'country', 'postal_code',
      'rating', 'reviews_count', 'operating_status', 'status', 'is_verified', 'notes'
    ];

    for (const field of allowedFields) {
      if ((data as any)[field] !== undefined) {
        updates.push(`${field} = ?`);
        let val = (data as any)[field];
        if (field === 'is_verified') val = val ? 1 : 0;
        params.push(val);
      }
    }

    if (data.social_profiles !== undefined) {
      updates.push(`social_profiles = ?`);
      params.push(data.social_profiles ? JSON.stringify(data.social_profiles) : null);
    }

    if (data.metadata !== undefined) {
      updates.push(`metadata = ?`);
      params.push(data.metadata ? JSON.stringify(data.metadata) : null);
    }

    if (updates.length > 0) {
      updates.push(`updated_at = datetime('now')`);
      params.push(leadId, userId);
      db.prepare(`UPDATE leads SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).run(...params);
    }

    const updated = this.getLeadById(userId, leadId)!;
    try {
      getSocketIO()?.to(`user:${userId}`).emit('lead:updated', updated);
    } catch {}

    return updated;
  }

  /**
   * Delete single lead
   */
  public deleteLead(userId: string, leadId: string): boolean {
    const db = getDatabase();
    const result = db.prepare(`DELETE FROM leads WHERE id = ? AND user_id = ?`).run(leadId, userId);
    if (result.changes > 0) {
      try {
        getSocketIO()?.to(`user:${userId}`).emit('lead:deleted', { id: leadId });
      } catch {}
      return true;
    }
    return false;
  }

  /**
   * Bulk delete leads
   */
  public bulkDeleteLeads(userId: string, leadIds: string[]): number {
    if (!leadIds || leadIds.length === 0) return 0;
    const db = getDatabase();
    const placeholders = leadIds.map(() => '?').join(',');
    const stmt = db.prepare(`DELETE FROM leads WHERE user_id = ? AND id IN (${placeholders})`);
    const result = stmt.run(userId, ...leadIds);
    try {
      getSocketIO()?.to(`user:${userId}`).emit('lead:bulk_deleted', { ids: leadIds, count: result.changes });
    } catch {}
    return result.changes;
  }

  /**
   * Bulk update status (e.g. 'contacted', 'qualified', 'converted')
   */
  public bulkUpdateStatus(userId: string, leadIds: string[], status: LeadStatus): number {
    if (!leadIds || leadIds.length === 0) return 0;
    const db = getDatabase();
    const placeholders = leadIds.map(() => '?').join(',');
    const stmt = db.prepare(`
      UPDATE leads
      SET status = ?, updated_at = datetime('now')
      WHERE user_id = ? AND id IN (${placeholders})
    `);
    const result = stmt.run(status, userId, ...leadIds);
    try {
      getSocketIO()?.to(`user:${userId}`).emit('lead:status_changed', { ids: leadIds, status });
    } catch {}
    return result.changes;
  }

  /**
   * Query leads with rich filtering, search, sorting, and pagination
   */
  public listLeads(
    userId: string,
    filter: LeadFilterOptions = {}
  ): { leads: LeadRecord[]; total: number; page: number; limit: number; totalPages: number } {
    const db = getDatabase();
    const whereClauses: string[] = ['user_id = ?'];
    const params: any[] = [userId];

    if (filter.search) {
      const q = `%${filter.search.trim().toLowerCase()}%`;
      whereClauses.push(
        `(LOWER(business_name) LIKE ? OR LOWER(category) LIKE ? OR LOWER(city) LIKE ? OR phone LIKE ? OR LOWER(email) LIKE ? OR LOWER(address) LIKE ?)`
      );
      params.push(q, q, q, q, q, q);
    }

    if (filter.source) {
      whereClauses.push('source = ?');
      params.push(filter.source);
    }

    if (filter.status && filter.status !== 'all') {
      whereClauses.push('status = ?');
      params.push(filter.status);
    }

    if (filter.industry) {
      whereClauses.push('(LOWER(industry) LIKE ? OR LOWER(category) LIKE ?)');
      const ind = `%${filter.industry.trim().toLowerCase()}%`;
      params.push(ind, ind);
    }

    if (filter.city) {
      whereClauses.push('LOWER(city) LIKE ?');
      params.push(`%${filter.city.trim().toLowerCase()}%`);
    }

    if (filter.hasPhone) {
      whereClauses.push('phone IS NOT NULL AND LENGTH(phone) > 5');
    }

    if (filter.hasEmail) {
      whereClauses.push('email IS NOT NULL AND LENGTH(email) > 5');
    }

    if (filter.hasWebsite) {
      whereClauses.push('website IS NOT NULL AND LENGTH(website) > 4');
    }

    if (filter.tagId) {
      whereClauses.push('id IN (SELECT lead_id FROM lead_tag_mappings WHERE tag_id = ?)');
      params.push(filter.tagId);
    }

    if (filter.startDate) {
      whereClauses.push('created_at >= ?');
      params.push(filter.startDate);
    }

    if (filter.endDate) {
      whereClauses.push('created_at <= ?');
      params.push(filter.endDate);
    }

    const whereSql = whereClauses.join(' AND ');

    // Total count
    const countRow = db.prepare(`SELECT COUNT(*) as total FROM leads WHERE ${whereSql}`).get(...params) as { total: number };
    const total = countRow.total;

    // Sorting
    const sortBy = filter.sortBy || 'created_at';
    const sortOrder = (filter.sortOrder || 'desc').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Pagination
    const page = Math.max(1, filter.page || 1);
    const limit = Math.max(1, Math.min(200, filter.limit || 50));
    const offset = (page - 1) * limit;

    const rows = db
      .prepare(`
        SELECT * FROM leads
        WHERE ${whereSql}
        ORDER BY ${sortBy} ${sortOrder}
        LIMIT ? OFFSET ?
      `)
      .all(...params, limit, offset) as any[];

    const leadIds = rows.map((r) => r.id);
    const tagMap: Record<string, Array<{ id: string; name: string; color: string }>> = {};

    if (leadIds.length > 0) {
      const placeholders = leadIds.map(() => '?').join(',');
      const tagRows = db
        .prepare(`
          SELECT m.lead_id, t.id, t.name, t.color
          FROM lead_tag_mappings m
          JOIN lead_tags t ON t.id = m.tag_id
          WHERE m.lead_id IN (${placeholders})
        `)
        .all(...leadIds) as any[];

      for (const tr of tagRows) {
        if (!tagMap[tr.lead_id]) tagMap[tr.lead_id] = [];
        tagMap[tr.lead_id].push({ id: tr.id, name: tr.name, color: tr.color });
      }
    }

    const leads = rows.map((r) => {
      const item = this.mapRow(r);
      item.tags = tagMap[item.id] || [];
      return item;
    });

    return {
      leads,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Lead Analytics & Dashboard KPI summary
   */
  public getLeadStats(userId: string): {
    totalLeads: number;
    leadsToday: number;
    verifiedLeads: number;
    withPhone: number;
    withEmail: number;
    bySource: Record<string, number>;
    byStatus: Record<string, number>;
    byIndustry: Record<string, number>;
    byCity: Record<string, number>;
  } {
    const db = getDatabase();

    const totalRow = db.prepare(`SELECT COUNT(*) as count FROM leads WHERE user_id = ?`).get(userId) as { count: number };
    const todayRow = db
      .prepare(`SELECT COUNT(*) as count FROM leads WHERE user_id = ? AND date(created_at) = date('now')`)
      .get(userId) as { count: number };
    const verifiedRow = db.prepare(`SELECT COUNT(*) as count FROM leads WHERE user_id = ? AND is_verified = 1`).get(userId) as { count: number };
    const phoneRow = db.prepare(`SELECT COUNT(*) as count FROM leads WHERE user_id = ? AND phone IS NOT NULL AND LENGTH(phone) > 5`).get(userId) as { count: number };
    const emailRow = db.prepare(`SELECT COUNT(*) as count FROM leads WHERE user_id = ? AND email IS NOT NULL AND LENGTH(email) > 5`).get(userId) as { count: number };

    // Group by source
    const sourceRows = db.prepare(`SELECT source, COUNT(*) as count FROM leads WHERE user_id = ? GROUP BY source`).all(userId) as any[];
    const bySource: Record<string, number> = {};
    for (const r of sourceRows) bySource[r.source || 'other'] = r.count;

    // Group by status
    const statusRows = db.prepare(`SELECT status, COUNT(*) as count FROM leads WHERE user_id = ? GROUP BY status`).all(userId) as any[];
    const byStatus: Record<string, number> = {};
    for (const r of statusRows) byStatus[r.status || 'new'] = r.count;

    // Group by industry/category
    const indRows = db
      .prepare(`
        SELECT COALESCE(category, industry, 'Other') as ind, COUNT(*) as count
        FROM leads WHERE user_id = ?
        GROUP BY ind ORDER BY count DESC LIMIT 8
      `)
      .all(userId) as any[];
    const byIndustry: Record<string, number> = {};
    for (const r of indRows) byIndustry[r.ind] = r.count;

    // Group by city
    const cityRows = db
      .prepare(`
        SELECT COALESCE(city, 'Unknown') as city, COUNT(*) as count
        FROM leads WHERE user_id = ? AND city IS NOT NULL AND city != ''
        GROUP BY city ORDER BY count DESC LIMIT 8
      `)
      .all(userId) as any[];
    const byCity: Record<string, number> = {};
    for (const r of cityRows) byCity[r.city] = r.count;

    return {
      totalLeads: totalRow.count,
      leadsToday: todayRow.count,
      verifiedLeads: verifiedRow.count,
      withPhone: phoneRow.count,
      withEmail: emailRow.count,
      bySource,
      byStatus,
      byIndustry,
      byCity
    };
  }

  /**
   * Export leads to clean CSV format
   */
  public exportLeadsToCsv(userId: string, leadIds?: string[]): string {
    const db = getDatabase();
    let rows: any[] = [];

    if (leadIds && leadIds.length > 0) {
      const placeholders = leadIds.map(() => '?').join(',');
      rows = db.prepare(`SELECT * FROM leads WHERE user_id = ? AND id IN (${placeholders}) ORDER BY created_at DESC`).all(userId, ...leadIds);
    } else {
      rows = db.prepare(`SELECT * FROM leads WHERE user_id = ? ORDER BY created_at DESC`).all(userId);
    }

    const headers = [
      'Business Name',
      'Phone',
      'Email',
      'Category',
      'Industry',
      'Website',
      'Address',
      'City',
      'State',
      'Country',
      'Rating',
      'Reviews Count',
      'Status',
      'Source',
      'Listing URL',
      'Created At'
    ];

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push([
        escapeCsv(r.business_name),
        escapeCsv(r.phone),
        escapeCsv(r.email),
        escapeCsv(r.category),
        escapeCsv(r.industry),
        escapeCsv(r.website),
        escapeCsv(r.address),
        escapeCsv(r.city),
        escapeCsv(r.state),
        escapeCsv(r.country),
        escapeCsv(r.rating),
        escapeCsv(r.reviews_count),
        escapeCsv(r.status),
        escapeCsv(r.source),
        escapeCsv(r.listing_url),
        escapeCsv(r.created_at)
      ].join(','));
    }

    return lines.join('\n');
  }

  /**
   * Enrich single lead with phone cleaning, email syntax, domain deduction
   */
  public enrichLead(userId: string, leadId: string): LeadRecord {
    const lead = this.getLeadById(userId, leadId);
    if (!lead) throw new Error('Lead not found.');

    const registry = ConnectorRegistry.getInstance();
    const base = registry.get('google_maps') as any;

    const cleanedPhone = base.cleanPhone(lead.phone);
    const cleanedEmail = base.cleanEmail(lead.email);
    const cleanedWebsite = base.cleanWebsite(lead.website);
    const domain = base.extractDomain(cleanedWebsite);

    const isVerified = !!(cleanedPhone || (cleanedEmail && cleanedWebsite));

    return this.updateLead(userId, leadId, {
      phone: cleanedPhone || lead.phone,
      email: cleanedEmail || lead.email,
      website: cleanedWebsite || lead.website,
      is_verified: isVerified,
      metadata: {
        ...(lead.metadata || {}),
        enriched_at: new Date().toISOString(),
        domain: domain
      }
    });
  }

  // Tags & Notes methods
  public listTags(userId: string): Array<{ id: string; name: string; color: string }> {
    const db = getDatabase();
    return db.prepare(`SELECT * FROM lead_tags WHERE user_id = ? ORDER BY name ASC`).all(userId) as any[];
  }

  public createTag(userId: string, name: string, color: string = '#10b981'): { id: string; name: string; color: string } {
    const db = getDatabase();
    const id = crypto.randomUUID();
    db.prepare(`INSERT INTO lead_tags (id, user_id, name, color) VALUES (?, ?, ?, ?)`).run(id, userId, name.trim(), color);
    return { id, name: name.trim(), color };
  }

  public tagLead(leadId: string, tagId: string): void {
    const db = getDatabase();
    db.prepare(`INSERT OR IGNORE INTO lead_tag_mappings (lead_id, tag_id) VALUES (?, ?)`).run(leadId, tagId);
  }

  public untagLead(leadId: string, tagId: string): void {
    const db = getDatabase();
    db.prepare(`DELETE FROM lead_tag_mappings WHERE lead_id = ? AND tag_id = ?`).run(leadId, tagId);
  }

  public addNote(userId: string, leadId: string, content: string): { id: string; content: string; created_at: string } {
    const db = getDatabase();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO lead_notes (id, lead_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)`).run(
      id,
      leadId,
      userId,
      content.trim(),
      now
    );
    return { id, content: content.trim(), created_at: now };
  }

  public listNotes(leadId: string): Array<{ id: string; content: string; created_at: string }> {
    const db = getDatabase();
    return db.prepare(`SELECT id, content, created_at FROM lead_notes WHERE lead_id = ? ORDER BY created_at DESC`).all(leadId) as any[];
  }
}

