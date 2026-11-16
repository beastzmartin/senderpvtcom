import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getDatabase } from '../../db/database.js';
import { ProviderRegistry } from './provider/ProviderRegistry.js';

export interface AdminContext {
  id: string;
  username: string;
  role?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface CaptureJobParams {
  module: string; // 'marketplace' | 'lead_extractor' | string
  sourceType: string; // 'apify' | 'connector' | string
  userId: string;
  jobId: string;
  productId?: string;
  productSlug?: string;
  productName?: string;
  status: 'completed' | 'failed' | 'partial' | 'aborted' | 'running';
  input: Record<string, any>;
  rowCount?: number;
  resultsData?: any[];
  sizeBytes?: number;
  storageUri?: string;
  files?: Array<{
    kind: string;
    fileName: string;
    storagePath: string;
    byteSize: number;
    contentType?: string;
  }>;
  providerRunId?: string;
  providerDatasetId?: string;
  providerCostUsd?: number;
  chargedAmount?: number;
  currency?: string;
  tags?: string[];
  notes?: string;
}

export interface VaultRecord {
  id: string;
  module: string;
  source_type: string;
  user_id: string;
  user_email?: string;
  user_name?: string;
  product_id?: string;
  product_slug?: string;
  product_name?: string;
  job_id: string;
  status: 'completed' | 'failed' | 'partial' | 'aborted' | 'running';
  input_json: string;
  masked_input?: Record<string, any>;
  has_masked_secrets?: boolean;
  row_count: number;
  size_bytes: number;
  storage_uri?: string;
  checksum?: string;
  provider_run_id?: string;
  provider_dataset_id?: string;
  provider_cost_usd: number;
  charged_amount: number;
  currency: string;
  hidden_from_customer: number;
  legal_hold: number;
  legal_hold_reason?: string;
  legal_hold_by?: string;
  tags: string[];
  notes?: string;
  created_at: string;
  deleted_at?: string;
  purge_at?: string;
  purged_at?: string;
  files?: VaultFileRecord[];
}

export interface VaultFileRecord {
  id: string;
  record_id: string;
  kind: string;
  file_name: string;
  storage_path: string;
  byte_size: number;
  content_type: string;
  created_at: string;
}

export interface VaultAccessLogRecord {
  id: string;
  admin_user_id: string;
  admin_username: string;
  record_id?: string;
  action: string;
  reason?: string;
  ip_address?: string;
  user_agent?: string;
  details_json?: string;
  created_at: string;
}

export interface RetentionPolicyRecord {
  id: string;
  name: string;
  scope: 'global' | 'module' | 'product' | 'user_tier';
  target_id?: string;
  retention_days: number;
  trash_grace_days: number;
  auto_purge_enabled: number;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface DeletionReceiptRecord {
  id: string;
  request_id: string;
  admin_user_id: string;
  reason: string;
  scope: string;
  target_user_id?: string;
  jobs_deleted_count: number;
  rows_deleted_count: number;
  files_deleted_count: number;
  bytes_reclaimed: number;
  steps_completed_json: string;
  provider_purge_status: string;
  provider_purge_errors?: string;
  created_at: string;
}

// Secret Encryption Helpers
const ENCRYPTION_KEY = crypto.createHash('sha256').update(process.env.VAULT_SECRET_KEY || 'pvtsender-vault-secure-key-3.1').digest();
const SENSITIVE_KEY_REGEX = /(password|token|secret|key|cookie|auth|credential|api_key|access_token|private)/i;

function encryptSecret(text: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  let enc = cipher.update(text, 'utf8', 'hex');
  enc += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${enc}`;
}

function decryptSecret(cipherText: string): string {
  try {
    const parts = cipherText.split(':');
    if (parts.length !== 3) return cipherText;
    const [ivHex, tagHex, dataHex] = parts;
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    let dec = decipher.update(dataHex, 'hex', 'utf8');
    dec += decipher.final('utf8');
    return dec;
  } catch {
    return '[Decryption failed]';
  }
}

/**
 * Vault Source Registry for registering data producing modules
 */
export class VaultRegistry {
  private static sources = new Map<string, { module: string; onDataProduced?: (data: any) => Promise<void> | void }>();

  public static registerVaultSource(source: { module: string; onDataProduced?: (data: any) => Promise<void> | void }) {
    this.sources.set(source.module, source);
  }

  public static getSource(module: string) {
    return this.sources.get(module);
  }

  public static listSources() {
    return Array.from(this.sources.keys());
  }
}

/**
 * VaultService: Admin Data Vault implementation
 */
export class VaultService {
  private static instance: VaultService | null = null;

  public static getInstance(): VaultService {
    if (!VaultService.instance) {
      VaultService.instance = new VaultService();
    }
    return VaultService.instance;
  }

  private constructor() {
    // Register standard default sources
    VaultRegistry.registerVaultSource({ module: 'marketplace' });
    VaultRegistry.registerVaultSource({ module: 'lead_extractor' });
  }

  /**
   * Mask credentials inside input object and store encrypted mapping
   */
  public prepareSecuredInput(input: Record<string, any>): { inputJson: string; hasSecrets: boolean } {
    const masked: Record<string, any> = {};
    const encryptedSecrets: Record<string, string> = {};
    let hasSecrets = false;

    for (const [k, v] of Object.entries(input || {})) {
      if (SENSITIVE_KEY_REGEX.test(k) && typeof v === 'string' && v.trim().length > 0) {
        hasSecrets = true;
        masked[k] = '••••••••';
        encryptedSecrets[k] = encryptSecret(v);
      } else {
        masked[k] = v;
      }
    }

    const payload = {
      ...masked,
      _vault_secrets: Object.keys(encryptedSecrets).length > 0 ? encryptedSecrets : undefined
    };

    return {
      inputJson: JSON.stringify(payload),
      hasSecrets
    };
  }

  /**
   * Log an immutable event to vault_access_log
   */
  public logAccess(params: {
    admin: AdminContext;
    action: string;
    recordId?: string;
    reason?: string;
    details?: Record<string, any>;
  }): void {
    const db = getDatabase();
    const id = `val_${crypto.randomUUID().slice(0, 16)}`;
    try {
      db.prepare(`
        INSERT INTO vault_access_log (
          id, admin_user_id, admin_username, record_id, action,
          reason, ip_address, user_agent, details_json, created_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, datetime('now')
        )
      `).run(
        id,
        params.admin.id,
        params.admin.username,
        params.recordId || null,
        params.action,
        params.reason || null,
        params.admin.ipAddress || null,
        params.admin.userAgent || null,
        params.details ? JSON.stringify(params.details) : null
      );
    } catch (err) {
      console.error('[VaultService] Failed to record access log:', err);
    }
  }

  /**
   * Capture an extraction run / job result automatically into the Data Vault
   */
  public captureJobRun(params: CaptureJobParams): VaultRecord {
    const db = getDatabase();
    const { inputJson } = this.prepareSecuredInput(params.input);

    let rowCount = params.rowCount ?? 0;
    let sizeBytes = params.sizeBytes ?? 0;
    let checksum = '';

    // Calculate rowCount, size, and checksum if resultsData provided
    if (params.resultsData && Array.isArray(params.resultsData)) {
      rowCount = params.resultsData.length;
      const jsonStr = JSON.stringify(params.resultsData);
      sizeBytes = Buffer.byteLength(jsonStr, 'utf8');
      checksum = crypto.createHash('sha256').update(jsonStr).digest('hex');
    } else if (params.module === 'marketplace' && !params.rowCount) {
      // Derive from existing results table if available
      try {
        const cnt = db.prepare('SELECT count(*) as c FROM marketplace_job_results WHERE job_id = ?').get(params.jobId) as any;
        rowCount = cnt?.c || 0;
      } catch {}
    }

    // Include files byte size
    if (params.files && params.files.length > 0) {
      for (const f of params.files) {
        sizeBytes += f.byteSize || 0;
      }
    }

    const storageUri = params.storageUri || `sqlite://marketplace_job_results?job_id=${params.jobId}`;

    // Check if vault record already exists for this job_id
    const existing = db.prepare('SELECT id FROM vault_records WHERE job_id = ?').get(params.jobId) as any;
    const vaultId = existing ? existing.id : `vlt_${crypto.randomUUID().slice(0, 16)}`;

    if (existing) {
      db.prepare(`
        UPDATE vault_records
        SET status = ?,
            input_json = ?,
            row_count = ?,
            size_bytes = ?,
            storage_uri = ?,
            checksum = COALESCE(NULLIF(?, ''), checksum),
            provider_run_id = COALESCE(?, provider_run_id),
            provider_dataset_id = COALESCE(?, provider_dataset_id),
            provider_cost_usd = COALESCE(?, provider_cost_usd),
            charged_amount = COALESCE(?, charged_amount),
            currency = COALESCE(?, currency),
            tags = ?,
            notes = COALESCE(?, notes)
        WHERE id = ?
      `).run(
        params.status,
        inputJson,
        rowCount,
        sizeBytes,
        storageUri,
        checksum,
        params.providerRunId || null,
        params.providerDatasetId || null,
        params.providerCostUsd ?? 0.0,
        params.chargedAmount ?? 0.0,
        params.currency || 'INR',
        JSON.stringify(params.tags || []),
        params.notes || null,
        vaultId
      );
    } else {
      db.prepare(`
        INSERT INTO vault_records (
          id, module, source_type, user_id, product_id, product_slug, product_name,
          job_id, status, input_json, row_count, size_bytes, storage_uri, checksum,
          provider_run_id, provider_dataset_id, provider_cost_usd, charged_amount,
          currency, tags, notes, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, datetime('now')
        )
      `).run(
        vaultId,
        params.module,
        params.sourceType,
        params.userId,
        params.productId || null,
        params.productSlug || null,
        params.productName || null,
        params.jobId,
        params.status,
        inputJson,
        rowCount,
        sizeBytes,
        storageUri,
        checksum || null,
        params.providerRunId || null,
        params.providerDatasetId || null,
        params.providerCostUsd ?? 0.0,
        params.chargedAmount ?? 0.0,
        params.currency || 'INR',
        JSON.stringify(params.tags || []),
        params.notes || null
      );
    }

    // Insert associated files into vault_files
    if (params.files && params.files.length > 0) {
      const insertFileStmt = db.prepare(`
        INSERT OR IGNORE INTO vault_files (
          id, record_id, kind, file_name, storage_path, byte_size, content_type, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, datetime('now')
        )
      `);

      for (const file of params.files) {
        const fileId = `vf_${crypto.randomUUID().slice(0, 16)}`;
        insertFileStmt.run(
          fileId,
          vaultId,
          file.kind || 'output_file',
          file.fileName,
          file.storagePath,
          file.byteSize,
          file.contentType || 'application/octet-stream'
        );
      }
    }

    return this.getVaultRecordInternal(vaultId)!;
  }

  /**
   * Backfill existing extraction jobs into Data Vault (Idempotent)
   */
  public backfillExistingJobs(): { backfilledMarketplace: number; backfilledLeadExtractor: number } {
    const db = getDatabase();
    let backfilledMarketplace = 0;
    let backfilledLeadExtractor = 0;

    // 1. Backfill Marketplace Jobs
    const unvaultedMarketplace = db.prepare(`
      SELECT j.*, p.display_name as product_title
      FROM marketplace_jobs j
      LEFT JOIN extraction_marketplace_products p ON j.product_id = p.id
      WHERE j.id NOT IN (SELECT job_id FROM vault_records)
    `).all() as any[];

    for (const job of unvaultedMarketplace) {
      let files: any[] = [];
      try {
        if (job.output_files_json) {
          const parsed = JSON.parse(job.output_files_json);
          if (Array.isArray(parsed)) {
            files = parsed.map((f: any) => ({
              kind: 'output_file',
              fileName: f.file_name || 'output',
              storagePath: f.storage_path || '',
              byteSize: f.byte_size || 0,
              contentType: f.content_type
            }));
          }
        }
      } catch {}

      // Calculate row count from marketplace_job_results
      const cnt = (db.prepare('SELECT count(*) as c FROM marketplace_job_results WHERE job_id = ?').get(job.id) as any)?.c || 0;

      this.captureJobRun({
        module: 'marketplace',
        sourceType: job.provider_type || 'apify',
        userId: job.user_id,
        jobId: job.id,
        productId: job.product_id,
        productSlug: job.product_slug,
        productName: job.product_title || job.product_slug,
        status: (job.status?.toLowerCase() as any) || 'completed',
        input: JSON.parse(job.input_json || '{}'),
        rowCount: cnt || Number(job.items_delivered || 0),
        sizeBytes: (cnt || 1) * 256,
        providerRunId: job.provider_run_id,
        providerDatasetId: job.provider_dataset_id,
        providerCostUsd: Number(job.provider_cost_usd || 0),
        chargedAmount: Number(job.charged_amount || 0),
        currency: job.currency || 'INR',
        files
      });

      backfilledMarketplace++;
    }

    // 2. Backfill Lead Extractor Jobs
    try {
      const unvaultedLeads = db.prepare(`
        SELECT * FROM extraction_jobs
        WHERE id NOT IN (SELECT job_id FROM vault_records)
      `).all() as any[];

      for (const ej of unvaultedLeads) {
        this.captureJobRun({
          module: 'lead_extractor',
          sourceType: ej.source || 'browser_connector',
          userId: ej.user_id,
          jobId: ej.id,
          productName: `Lead Extractor (${ej.source || 'connector'})`,
          status: ej.status === 'completed' ? 'completed' : ej.status === 'failed' ? 'failed' : 'aborted',
          input: {
            keyword: ej.keyword,
            location: ej.location,
            source: ej.source,
            requested_count: ej.requested_count,
            settings: ej.settings ? JSON.parse(ej.settings) : undefined
          },
          rowCount: Number(ej.collected_count || 0),
          sizeBytes: Number(ej.collected_count || 0) * 128
        });

        backfilledLeadExtractor++;
      }
    } catch {}

    return { backfilledMarketplace, backfilledLeadExtractor };
  }

  /**
   * Internal mapper for vault records
   */
  private getVaultRecordInternal(id: string): VaultRecord | null {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT vr.*, u.email as user_email, u.name as user_name
      FROM vault_records vr
      LEFT JOIN users u ON vr.user_id = u.id
      WHERE vr.id = ?
    `).get(id) as any;

    if (!row) return null;

    let parsedInput: Record<string, any> = {};
    let hasMaskedSecrets = false;
    try {
      const raw = JSON.parse(row.input_json || '{}');
      if (raw._vault_secrets) {
        hasMaskedSecrets = true;
      }
      parsedInput = raw;
    } catch {}

    const files = db.prepare('SELECT * FROM vault_files WHERE record_id = ?').all(row.id) as VaultFileRecord[];

    let tags: string[] = [];
    try {
      tags = JSON.parse(row.tags || '[]');
    } catch {}

    return {
      id: row.id,
      module: row.module,
      source_type: row.source_type,
      user_id: row.user_id,
      user_email: row.user_email,
      user_name: row.user_name,
      product_id: row.product_id,
      product_slug: row.product_slug,
      product_name: row.product_name,
      job_id: row.job_id,
      status: row.status,
      input_json: row.input_json,
      masked_input: parsedInput,
      has_masked_secrets: hasMaskedSecrets,
      row_count: Number(row.row_count || 0),
      size_bytes: Number(row.size_bytes || 0),
      storage_uri: row.storage_uri,
      checksum: row.checksum,
      provider_run_id: row.provider_run_id,
      provider_dataset_id: row.provider_dataset_id,
      provider_cost_usd: Number(row.provider_cost_usd || 0),
      charged_amount: Number(row.charged_amount || 0),
      currency: row.currency || 'INR',
      hidden_from_customer: Number(row.hidden_from_customer || 0),
      legal_hold: Number(row.legal_hold || 0),
      legal_hold_reason: row.legal_hold_reason,
      legal_hold_by: row.legal_hold_by,
      tags,
      notes: row.notes,
      created_at: row.created_at,
      deleted_at: row.deleted_at,
      purge_at: row.purge_at,
      purged_at: row.purged_at,
      files
    };
  }

  /**
   * List vault records with rich multi-filter & pagination
   */
  public listVaultRecords(filters: {
    userId?: string;
    productSlug?: string;
    productId?: string;
    module?: string;
    status?: string;
    legalHold?: boolean;
    inTrash?: boolean;
    dateFrom?: string;
    dateTo?: string;
    tag?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): {
    records: VaultRecord[];
    total: number;
    page: number;
    limit: number;
    totalSizeBytes: number;
  } {
    const db = getDatabase();
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(200, filters.limit || 25);
    const offset = (page - 1) * limit;

    const conditions: string[] = ['vr.purged_at IS NULL'];
    const params: any[] = [];

    // Trash filter: if inTrash is true, deleted_at IS NOT NULL. If false/omitted, deleted_at IS NULL
    if (filters.inTrash === true) {
      conditions.push('vr.deleted_at IS NOT NULL');
    } else {
      conditions.push('vr.deleted_at IS NULL');
    }

    if (filters.userId) {
      conditions.push('vr.user_id = ?');
      params.push(filters.userId);
    }
    if (filters.productSlug) {
      conditions.push('vr.product_slug = ?');
      params.push(filters.productSlug);
    }
    if (filters.productId) {
      conditions.push('vr.product_id = ?');
      params.push(filters.productId);
    }
    if (filters.module && filters.module !== 'all') {
      conditions.push('vr.module = ?');
      params.push(filters.module);
    }
    if (filters.status && filters.status !== 'all') {
      conditions.push('vr.status = ?');
      params.push(filters.status.toLowerCase());
    }
    if (typeof filters.legalHold === 'boolean') {
      conditions.push('vr.legal_hold = ?');
      params.push(filters.legalHold ? 1 : 0);
    }
    if (filters.dateFrom) {
      conditions.push('vr.created_at >= ?');
      params.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      conditions.push('vr.created_at <= ?');
      params.push(filters.dateTo);
    }
    if (filters.tag) {
      conditions.push('vr.tags LIKE ?');
      params.push(`%"${filters.tag}"%`);
    }
    if (filters.search && filters.search.trim()) {
      const q = `%${filters.search.trim()}%`;
      conditions.push(`(
        vr.job_id LIKE ? OR
        vr.product_name LIKE ? OR
        vr.product_slug LIKE ? OR
        vr.notes LIKE ? OR
        u.email LIKE ? OR
        u.name LIKE ?
      )`);
      params.push(q, q, q, q, q, q);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = db.prepare(`
      SELECT count(*) as total, COALESCE(SUM(vr.size_bytes), 0) as totalBytes
      FROM vault_records vr
      LEFT JOIN users u ON vr.user_id = u.id
      ${whereClause}
    `).get(...params) as any;

    const total = countRow?.total || 0;
    const totalSizeBytes = countRow?.totalBytes || 0;

    const rows = db.prepare(`
      SELECT vr.id
      FROM vault_records vr
      LEFT JOIN users u ON vr.user_id = u.id
      ${whereClause}
      ORDER BY vr.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as Array<{ id: string }>;

    const records = rows.map((r) => this.getVaultRecordInternal(r.id)!);

    return {
      records,
      total,
      page,
      limit,
      totalSizeBytes
    };
  }

  /**
   * Get single VaultRecord with access logging
   */
  public getVaultRecord(idOrJobId: string, admin: AdminContext, reason?: string): VaultRecord | null {
    const db = getDatabase();
    const row = db.prepare('SELECT id FROM vault_records WHERE id = ? OR job_id = ?').get(idOrJobId, idOrJobId) as any;
    if (!row) return null;

    const record = this.getVaultRecordInternal(row.id);
    if (record) {
      this.logAccess({
        admin,
        action: 'view_record',
        recordId: record.id,
        reason: reason || 'Inspected vault record detail in admin console'
      });
    }

    return record;
  }

  /**
   * Reveal encrypted credential with audited reason prompt
   */
  public revealSecret(
    recordId: string,
    fieldKey: string,
    admin: AdminContext,
    reason: string
  ): { fieldKey: string; cleartextValue: string } {
    if (!reason || reason.trim().length < 3) {
      throw new Error('AUDIT_REASON_REQUIRED: A valid audit reason is required to reveal credentials.');
    }

    // Role check: support role cannot reveal secrets
    if (admin.role === 'support') {
      throw new Error('ACCESS_DENIED: Support role is not authorized to reveal credentials.');
    }

    const record = this.getVaultRecordInternal(recordId);
    if (!record) {
      throw new Error('RECORD_NOT_FOUND: Vault record does not exist.');
    }

    let inputObj: any = {};
    try {
      inputObj = JSON.parse(record.input_json || '{}');
    } catch {}

    const encrypted = inputObj?._vault_secrets?.[fieldKey];
    if (!encrypted) {
      // Check if raw value exists in input
      const rawVal = inputObj[fieldKey];
      if (rawVal && rawVal !== '••••••••') {
        this.logAccess({
          admin,
          action: 'reveal_secret',
          recordId,
          reason,
          details: { fieldKey }
        });
        return { fieldKey, cleartextValue: String(rawVal) };
      }
      throw new Error(`SECRET_NOT_FOUND: No encrypted credential found for key "${fieldKey}".`);
    }

    const cleartext = decryptSecret(encrypted);

    this.logAccess({
      admin,
      action: 'reveal_secret',
      recordId,
      reason,
      details: { fieldKey }
    });

    return { fieldKey, cleartextValue: cleartext };
  }

  /**
   * Update notes or tags on a VaultRecord
   */
  public updateMetadata(
    recordId: string,
    admin: AdminContext,
    updates: { notes?: string; tags?: string[] }
  ): VaultRecord {
    const db = getDatabase();
    const record = this.getVaultRecordInternal(recordId);
    if (!record) throw new Error('RECORD_NOT_FOUND');

    const newTags = updates.tags !== undefined ? JSON.stringify(updates.tags) : JSON.stringify(record.tags);
    const newNotes = updates.notes !== undefined ? updates.notes : record.notes;

    db.prepare(`
      UPDATE vault_records
      SET tags = ?, notes = ?
      WHERE id = ?
    `).run(newTags, newNotes || null, recordId);

    this.logAccess({
      admin,
      action: 'update_metadata',
      recordId,
      details: { tags: updates.tags, notes: updates.notes }
    });

    return this.getVaultRecordInternal(recordId)!;
  }

  /**
   * Toggle Legal Hold on a record
   */
  public toggleLegalHold(
    recordId: string,
    legalHold: boolean,
    reason: string,
    admin: AdminContext
  ): VaultRecord {
    const db = getDatabase();
    const record = this.getVaultRecordInternal(recordId);
    if (!record) throw new Error('RECORD_NOT_FOUND');

    if (!reason || reason.trim().length < 3) {
      throw new Error('AUDIT_REASON_REQUIRED: A valid reason is required to toggle Legal Hold.');
    }

    db.prepare(`
      UPDATE vault_records
      SET legal_hold = ?,
          legal_hold_reason = ?,
          legal_hold_by = ?
      WHERE id = ?
    `).run(
      legalHold ? 1 : 0,
      legalHold ? reason : null,
      legalHold ? admin.username : null,
      recordId
    );

    this.logAccess({
      admin,
      action: legalHold ? 'enable_legal_hold' : 'release_legal_hold',
      recordId,
      reason
    });

    return this.getVaultRecordInternal(recordId)!;
  }

  /**
   * Stage 2 Deletion: Move to Trash (Soft Delete)
   */
  public softDelete(
    recordIds: string[],
    admin: AdminContext,
    reason?: string
  ): { affectedCount: number; blockedCount: number; blockedReasons: string[] } {
    const db = getDatabase();
    let affectedCount = 0;
    let blockedCount = 0;
    const blockedReasons: string[] = [];

    // Get configured trash grace days from policy or settings
    let graceDays = 30;
    try {
      const setting = db.prepare("SELECT value FROM marketplace_settings WHERE key = 'vault_trash_grace_days'").get() as any;
      if (setting?.value) graceDays = Math.max(1, parseInt(setting.value, 10));
    } catch {}

    const tx = db.transaction(() => {
      for (const id of recordIds) {
        const record = this.getVaultRecordInternal(id);
        if (!record) continue;

        if (record.legal_hold === 1) {
          blockedCount++;
          blockedReasons.push(`Record ${record.job_id} is under active Legal Hold.`);
          continue;
        }

        db.prepare(`
          UPDATE vault_records
          SET deleted_at = datetime('now'),
              purge_at = datetime('now', '+' || ? || ' days')
          WHERE id = ?
        `).run(graceDays, record.id);

        // Also mark customer job as customer_hidden / deleted
        db.prepare(`
          UPDATE marketplace_jobs
          SET deleted_at = datetime('now'),
              customer_hidden = 1
          WHERE id = ?
        `).run(record.job_id);

        this.logAccess({
          admin,
          action: 'soft_delete_to_trash',
          recordId: record.id,
          reason: reason || 'Moved extraction to Vault Trash'
        });

        affectedCount++;
      }
    });

    tx();

    return { affectedCount, blockedCount, blockedReasons };
  }

  /**
   * Restore records from Trash
   */
  public restoreFromTrash(recordIds: string[], admin: AdminContext): { restoredCount: number } {
    const db = getDatabase();
    let restoredCount = 0;

    const tx = db.transaction(() => {
      for (const id of recordIds) {
        const res = db.prepare(`
          UPDATE vault_records
          SET deleted_at = NULL, purge_at = NULL
          WHERE id = ? AND deleted_at IS NOT NULL
        `).run(id);

        if (res.changes > 0) {
          const rec = this.getVaultRecordInternal(id);
          if (rec) {
            db.prepare(`
              UPDATE marketplace_jobs
              SET deleted_at = NULL, customer_hidden = 0
              WHERE id = ?
            `).run(rec.job_id);

            this.logAccess({
              admin,
              action: 'restore_from_trash',
              recordId: rec.id,
              reason: 'Restored record from Trash back to Active'
            });
            restoredCount++;
          }
        }
      }
    });

    tx();

    return { restoredCount };
  }

  /**
   * Stage 3 Deletion: Irreversible Hard Purge
   */
  public async hardPurge(
    recordIds: string[],
    admin: AdminContext,
    reason: string,
    confirmationText: string
  ): Promise<DeletionReceiptRecord> {
    if (confirmationText !== 'DELETE') {
      throw new Error('CONFIRMATION_FAILED: Exact text "DELETE" is required to execute irreversible Hard Purge.');
    }
    if (!reason || reason.trim().length < 3) {
      throw new Error('AUDIT_REASON_REQUIRED: A valid audit reason is required for hard purge.');
    }

    const db = getDatabase();
    const recordsToPurge: VaultRecord[] = [];

    for (const id of recordIds) {
      const rec = this.getVaultRecordInternal(id);
      if (rec) {
        if (rec.legal_hold === 1) {
          throw new Error(`LEGAL_HOLD_BLOCKED: Record ${rec.job_id} is under Legal Hold and cannot be hard purged.`);
        }
        recordsToPurge.push(rec);
      }
    }

    if (recordsToPurge.length === 0) {
      throw new Error('NO_RECORDS: No valid records found to purge.');
    }

    let jobsCount = 0;
    let rowsCount = 0;
    let filesCount = 0;
    let bytesReclaimed = 0;
    const stepsCompleted: string[] = [];
    const providerPurgeErrors: string[] = [];

    // Step 1: Upstream Provider-Side Deletion (Apify run / dataset / store)
    for (const rec of recordsToPurge) {
      if (rec.provider_dataset_id || rec.provider_run_id) {
        try {
          const adapter = ProviderRegistry.getInstance().getAdapter(rec.source_type);
          if (rec.provider_dataset_id && adapter.deleteDataset) {
            await adapter.deleteDataset(rec.provider_dataset_id);
          }
          if (rec.provider_run_id && adapter.deleteRun) {
            await adapter.deleteRun(rec.provider_run_id);
          }
          stepsCompleted.push(`Provider resources deleted for job ${rec.job_id}`);
        } catch (err: any) {
          providerPurgeErrors.push(`Failed upstream provider purge for job ${rec.job_id}: ${err.message}`);
        }
      }
    }

    // Step 2: Delete Files from Disk Storage
    for (const rec of recordsToPurge) {
      if (rec.files && rec.files.length > 0) {
        for (const file of rec.files) {
          if (file.storage_path && fs.existsSync(file.storage_path)) {
            try {
              fs.unlinkSync(file.storage_path);
              bytesReclaimed += file.byte_size || 0;
              filesCount++;
            } catch (err) {
              console.warn(`[VaultService] Could not unlink file ${file.storage_path}:`, err);
            }
          }
        }
      }
      // Also check directory in data/marketplace_files
      const jobDir = path.resolve(process.cwd(), 'data/marketplace_files', rec.job_id);
      if (fs.existsSync(jobDir)) {
        try {
          fs.rmSync(jobDir, { recursive: true, force: true });
        } catch {}
      }
    }

    // Step 3: Delete DB Rows (marketplace_job_results, vault_files, vault_records, jobs)
    const purgeTx = db.transaction(() => {
      for (const rec of recordsToPurge) {
        // Delete job results
        const resDel = db.prepare('DELETE FROM marketplace_job_results WHERE job_id = ?').run(rec.job_id);
        rowsCount += resDel.changes;
        bytesReclaimed += rec.size_bytes || 0;

        // Delete files rows
        db.prepare('DELETE FROM vault_files WHERE record_id = ?').run(rec.id);
        db.prepare('DELETE FROM marketplace_job_files WHERE job_id = ?').run(rec.job_id);

        // Delete shared links
        db.prepare('DELETE FROM marketplace_shared_links WHERE job_id = ?').run(rec.job_id);

        // Delete from marketplace_jobs
        db.prepare('DELETE FROM marketplace_jobs WHERE id = ?').run(rec.job_id);

        // Delete from extraction_jobs if lead_extractor
        if (rec.module === 'lead_extractor') {
          db.prepare('DELETE FROM extraction_jobs WHERE id = ?').run(rec.job_id);
        }

        // Mark vault_record as purged (or remove completely, keeping receipt as immutable audit)
        db.prepare(`
          UPDATE vault_records
          SET purged_at = datetime('now'),
              status = 'aborted',
              row_count = 0,
              size_bytes = 0,
              storage_uri = NULL
          WHERE id = ?
        `).run(rec.id);

        jobsCount++;
      }
    });

    purgeTx();

    stepsCompleted.push(`Purged ${jobsCount} jobs, ${rowsCount} result rows, ${filesCount} files from database and storage.`);

    // Step 4: Generate Immutable Deletion Receipt
    const receiptId = `drec_${crypto.randomUUID().slice(0, 16)}`;
    const receiptRow: DeletionReceiptRecord = {
      id: receiptId,
      request_id: `req_${crypto.randomUUID().slice(0, 12)}`,
      admin_user_id: admin.id,
      reason,
      scope: `hard_purge_${jobsCount}_records`,
      target_user_id: recordsToPurge.length === 1 ? recordsToPurge[0].user_id : undefined,
      jobs_deleted_count: jobsCount,
      rows_deleted_count: rowsCount,
      files_deleted_count: filesCount,
      bytes_reclaimed: bytesReclaimed,
      steps_completed_json: JSON.stringify(stepsCompleted),
      provider_purge_status: providerPurgeErrors.length > 0 ? 'partial_errors' : 'completed',
      provider_purge_errors: providerPurgeErrors.length > 0 ? JSON.stringify(providerPurgeErrors) : undefined,
      created_at: new Date().toISOString()
    };

    db.prepare(`
      INSERT INTO deletion_receipts (
        id, request_id, admin_user_id, reason, scope, target_user_id,
        jobs_deleted_count, rows_deleted_count, files_deleted_count,
        bytes_reclaimed, steps_completed_json, provider_purge_status,
        provider_purge_errors, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, datetime('now')
      )
    `).run(
      receiptRow.id,
      receiptRow.request_id,
      receiptRow.admin_user_id,
      receiptRow.reason,
      receiptRow.scope,
      receiptRow.target_user_id || null,
      receiptRow.jobs_deleted_count,
      receiptRow.rows_deleted_count,
      receiptRow.files_deleted_count,
      receiptRow.bytes_reclaimed,
      receiptRow.steps_completed_json,
      receiptRow.provider_purge_status,
      receiptRow.provider_purge_errors || null
    );

    this.logAccess({
      admin,
      action: 'hard_purge',
      reason,
      details: {
        receiptId,
        jobsPurged: jobsCount,
        bytesReclaimed,
        records: recordIds
      }
    });

    return receiptRow;
  }

  /**
   * GDPR / DPDP User Data Erasure ("Right to be Forgotten")
   * Erases all extraction data, files, and PII while keeping financial transactions intact
   */
  public async executeUserErasure(
    targetUserId: string,
    admin: AdminContext,
    reason: string,
    confirmationText: string
  ): Promise<DeletionReceiptRecord> {
    if (confirmationText !== 'ERASE') {
      throw new Error('CONFIRMATION_FAILED: Exact text "ERASE" is required to execute User Erasure.');
    }
    if (!reason || reason.trim().length < 3) {
      throw new Error('AUDIT_REASON_REQUIRED: A valid audit reason is required for User Erasure.');
    }

    const db = getDatabase();

    // Check for Legal Hold
    const legalHoldCount = (db.prepare(`
      SELECT count(*) as c FROM vault_records
      WHERE user_id = ? AND legal_hold = 1 AND purged_at IS NULL
    `).get(targetUserId) as any)?.c || 0;

    if (legalHoldCount > 0) {
      throw new Error(`LEGAL_HOLD_BLOCKED: User has ${legalHoldCount} record(s) under Legal Hold. Release Legal Holds first before executing erasure.`);
    }

    // Get all vault record IDs for user
    const userRecords = db.prepare(`
      SELECT id FROM vault_records
      WHERE user_id = ? AND purged_at IS NULL
    `).all(targetUserId) as Array<{ id: string }>;

    const recordIds = userRecords.map((r) => r.id);

    let receipt: DeletionReceiptRecord;
    if (recordIds.length > 0) {
      receipt = await this.hardPurge(recordIds, admin, `[USER_ERASURE] ${reason}`, 'DELETE');
    } else {
      // Create empty receipt
      const receiptId = `drec_${crypto.randomUUID().slice(0, 16)}`;
      receipt = {
        id: receiptId,
        request_id: `req_${crypto.randomUUID().slice(0, 12)}`,
        admin_user_id: admin.id,
        reason: `[USER_ERASURE] ${reason}`,
        scope: `user_erasure_${targetUserId}`,
        target_user_id: targetUserId,
        jobs_deleted_count: 0,
        rows_deleted_count: 0,
        files_deleted_count: 0,
        bytes_reclaimed: 0,
        steps_completed_json: JSON.stringify(['No active extraction records found for user.']),
        provider_purge_status: 'completed',
        created_at: new Date().toISOString()
      };
      db.prepare(`
        INSERT INTO deletion_receipts (
          id, request_id, admin_user_id, reason, scope, target_user_id,
          jobs_deleted_count, rows_deleted_count, files_deleted_count,
          bytes_reclaimed, steps_completed_json, provider_purge_status, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          0, 0, 0, 0, ?, 'completed', datetime('now')
        )
      `).run(receipt.id, receipt.request_id, receipt.admin_user_id, receipt.reason, receipt.scope, receipt.target_user_id, receipt.steps_completed_json);
    }

    // Anonymize user PII in users table (keeping financial wallet transactions intact)
    try {
      db.prepare(`
        UPDATE users
        SET name = 'Erased User',
            email = 'erased_' || id || '@erased.local',
            phone = NULL
        WHERE id = ?
      `).run(targetUserId);
    } catch {}

    this.logAccess({
      admin,
      action: 'user_data_erasure',
      reason,
      details: { targetUserId, receiptId: receipt.id }
    });

    return receipt;
  }

  /**
   * Retention Cleaner & Automated Purge Cycle
   */
  public async executeRetentionCycle(): Promise<{
    trashedCount: number;
    purgedCount: number;
    receipt?: DeletionReceiptRecord;
  }> {
    const db = getDatabase();
    let trashedCount = 0;
    let purgedCount = 0;

    // 1. Move expired active records into Trash based on policy
    // Default 90 days retention if not specified
    const activePolicies = db.prepare('SELECT * FROM retention_policies WHERE enabled = 1').all() as RetentionPolicyRecord[];
    const defaultRetentionDays = 90;
    const defaultTrashGraceDays = 30;

    const globalPolicy = activePolicies.find((p) => p.scope === 'global') || {
      retention_days: defaultRetentionDays,
      trash_grace_days: defaultTrashGraceDays
    };

    // Find active records older than retention_days with legal_hold = 0
    const oldRecords = db.prepare(`
      SELECT id, job_id FROM vault_records
      WHERE deleted_at IS NULL
        AND purged_at IS NULL
        AND legal_hold = 0
        AND created_at < datetime('now', '-' || ? || ' days')
      LIMIT 100
    `).all(globalPolicy.retention_days) as any[];

    if (oldRecords.length > 0) {
      const ids = oldRecords.map((r) => r.id);
      const res = this.softDelete(ids, { id: 'system', username: 'RetentionAutomation' }, 'Automated policy retention expiration');
      trashedCount = res.affectedCount;
    }

    // 2. Hard purge expired trash records where purge_at <= now
    const expiredTrash = db.prepare(`
      SELECT id FROM vault_records
      WHERE deleted_at IS NOT NULL
        AND purged_at IS NULL
        AND purge_at <= datetime('now')
        AND legal_hold = 0
      LIMIT 50
    `).all() as any[];

    let receipt: DeletionReceiptRecord | undefined;
    if (expiredTrash.length > 0) {
      const ids = expiredTrash.map((r) => r.id);
      receipt = await this.hardPurge(
        ids,
        { id: 'system', username: 'RetentionAutomation' },
        'Automated trash grace period expiration',
        'DELETE'
      );
      purgedCount = ids.length;
    }

    return { trashedCount, purgedCount, receipt };
  }

  /**
   * Preview retention purge impact (dry run)
   */
  public previewRetentionPurge(): {
    eligibleForTrashCount: number;
    eligibleForPurgeCount: number;
    protectedByLegalHoldCount: number;
    estimatedBytesToReclaim: number;
  } {
    const db = getDatabase();
    let retentionDays = 90;
    try {
      const row = db.prepare("SELECT value FROM marketplace_settings WHERE key = 'vault_default_retention_days'").get() as any;
      if (row?.value) retentionDays = parseInt(row.value, 10);
    } catch {}

    const eligibleTrashRow = db.prepare(`
      SELECT count(*) as c FROM vault_records
      WHERE deleted_at IS NULL
        AND purged_at IS NULL
        AND legal_hold = 0
        AND created_at < datetime('now', '-' || ? || ' days')
    `).get(retentionDays) as any;

    const eligiblePurgeRow = db.prepare(`
      SELECT count(*) as c, COALESCE(SUM(size_bytes), 0) as bytes FROM vault_records
      WHERE deleted_at IS NOT NULL
        AND purged_at IS NULL
        AND purge_at <= datetime('now')
        AND legal_hold = 0
    `).get() as any;

    const legalHoldRow = db.prepare(`
      SELECT count(*) as c FROM vault_records
      WHERE legal_hold = 1 AND purged_at IS NULL
    `).get() as any;

    return {
      eligibleForTrashCount: eligibleTrashRow?.c || 0,
      eligibleForPurgeCount: eligiblePurgeRow?.c || 0,
      protectedByLegalHoldCount: legalHoldRow?.c || 0,
      estimatedBytesToReclaim: eligiblePurgeRow?.bytes || 0
    };
  }

  /**
   * Retention Policies Management
   */
  public getRetentionPolicies(): RetentionPolicyRecord[] {
    const db = getDatabase();
    return db.prepare('SELECT * FROM retention_policies ORDER BY created_at ASC').all() as RetentionPolicyRecord[];
  }

  public saveRetentionPolicy(policy: Partial<RetentionPolicyRecord>): RetentionPolicyRecord {
    const db = getDatabase();
    const id = policy.id || `ret_${crypto.randomUUID().slice(0, 12)}`;

    db.prepare(`
      INSERT INTO retention_policies (
        id, name, scope, target_id, retention_days, trash_grace_days, auto_purge_enabled, enabled, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, datetime('now')
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        scope = excluded.scope,
        target_id = excluded.target_id,
        retention_days = excluded.retention_days,
        trash_grace_days = excluded.trash_grace_days,
        auto_purge_enabled = excluded.auto_purge_enabled,
        enabled = excluded.enabled,
        updated_at = datetime('now')
    `).run(
      id,
      policy.name || 'Standard Retention Policy',
      policy.scope || 'global',
      policy.target_id || null,
      policy.retention_days ?? 90,
      policy.trash_grace_days ?? 30,
      policy.auto_purge_enabled ?? 1,
      policy.enabled ?? 1
    );

    return db.prepare('SELECT * FROM retention_policies WHERE id = ?').get(id) as RetentionPolicyRecord;
  }

  public deleteRetentionPolicy(id: string): boolean {
    const db = getDatabase();
    const res = db.prepare('DELETE FROM retention_policies WHERE id = ?').run(id);
    return res.changes > 0;
  }

  /**
   * Deletion Receipts query
   */
  public listDeletionReceipts(limit: number = 50): DeletionReceiptRecord[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM deletion_receipts
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit) as DeletionReceiptRecord[];
  }

  /**
   * Access Audit Log query
   */
  public listAccessLogs(options?: {
    recordId?: string;
    adminUserId?: string;
    action?: string;
    limit?: number;
    offset?: number;
  }): { logs: VaultAccessLogRecord[]; total: number } {
    const db = getDatabase();
    const limit = Math.min(200, options?.limit || 50);
    const offset = Math.max(0, options?.offset || 0);

    const conditions: string[] = [];
    const params: any[] = [];

    if (options?.recordId) {
      conditions.push('record_id = ?');
      params.push(options.recordId);
    }
    if (options?.adminUserId) {
      conditions.push('admin_user_id = ?');
      params.push(options.adminUserId);
    }
    if (options?.action) {
      conditions.push('action = ?');
      params.push(options.action);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRow = db.prepare(`SELECT count(*) as c FROM vault_access_log ${whereClause}`).get(...params) as any;
    const total = countRow?.c || 0;

    const logs = db.prepare(`
      SELECT * FROM vault_access_log
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as VaultAccessLogRecord[];

    return { logs, total };
  }

  /**
   * Get Overall Vault Statistics for Dashboard
   */
  public getVaultOverviewStats(): {
    totalRecords: number;
    totalRows: number;
    totalSizeBytes: number;
    inTrashCount: number;
    inTrashBytes: number;
    legalHoldCount: number;
    breakdownByModule: Array<{ module: string; count: number; sizeBytes: number }>;
    topProducts: Array<{ product_slug: string; product_name: string; count: number; sizeBytes: number }>;
    topUsers: Array<{ user_id: string; email: string; count: number; sizeBytes: number }>;
  } {
    const db = getDatabase();

    const totals = db.prepare(`
      SELECT
        count(*) as totalRecords,
        COALESCE(SUM(row_count), 0) as totalRows,
        COALESCE(SUM(size_bytes), 0) as totalSizeBytes
      FROM vault_records
      WHERE deleted_at IS NULL AND purged_at IS NULL
    `).get() as any;

    const trash = db.prepare(`
      SELECT
        count(*) as count,
        COALESCE(SUM(size_bytes), 0) as sizeBytes
      FROM vault_records
      WHERE deleted_at IS NOT NULL AND purged_at IS NULL
    `).get() as any;

    const legalHold = db.prepare(`
      SELECT count(*) as count
      FROM vault_records
      WHERE legal_hold = 1 AND purged_at IS NULL
    `).get() as any;

    const moduleRows = db.prepare(`
      SELECT module, count(*) as count, COALESCE(SUM(size_bytes), 0) as sizeBytes
      FROM vault_records
      WHERE purged_at IS NULL
      GROUP BY module
      ORDER BY count DESC
    `).all() as any[];

    const productRows = db.prepare(`
      SELECT product_slug, product_name, count(*) as count, COALESCE(SUM(size_bytes), 0) as sizeBytes
      FROM vault_records
      WHERE purged_at IS NULL AND product_slug IS NOT NULL
      GROUP BY product_slug
      ORDER BY count DESC
      LIMIT 5
    `).all() as any[];

    const userRows = db.prepare(`
      SELECT vr.user_id, COALESCE(u.email, vr.user_id) as email, count(*) as count, COALESCE(SUM(vr.size_bytes), 0) as sizeBytes
      FROM vault_records vr
      LEFT JOIN users u ON vr.user_id = u.id
      WHERE vr.purged_at IS NULL
      GROUP BY vr.user_id
      ORDER BY sizeBytes DESC
      LIMIT 5
    `).all() as any[];

    return {
      totalRecords: totals?.totalRecords || 0,
      totalRows: totals?.totalRows || 0,
      totalSizeBytes: totals?.totalSizeBytes || 0,
      inTrashCount: trash?.count || 0,
      inTrashBytes: trash?.sizeBytes || 0,
      legalHoldCount: legalHold?.count || 0,
      breakdownByModule: moduleRows,
      topProducts: productRows,
      topUsers: userRows
    };
  }

  /**
   * Asynchronous Bulk Export
   */
  public async createAsyncExport(
    filters: any,
    format: 'json' | 'csv',
    admin: AdminContext
  ): Promise<{ exportId: string; downloadToken: string }> {
    const db = getDatabase();
    const exportId = `exp_${crypto.randomUUID().slice(0, 16)}`;
    const downloadToken = crypto.randomBytes(32).toString('hex');
    const exportsDir = path.resolve(process.cwd(), 'data/vault_exports');
    fs.mkdirSync(exportsDir, { recursive: true });

    const filePath = path.join(exportsDir, `${exportId}.${format}`);
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString(); // 24 hours

    db.prepare(`
      INSERT INTO vault_exports (
        id, admin_user_id, filter_json, format, status, file_path, download_token, expires_at, created_at
      ) VALUES (
        ?, ?, ?, ?, 'pending', ?, ?, ?, datetime('now')
      )
    `).run(
      exportId,
      admin.id,
      JSON.stringify(filters || {}),
      format,
      filePath,
      downloadToken,
      expiresAt
    );

    // Fetch records and write file asynchronously
    setTimeout(async () => {
      try {
        db.prepare("UPDATE vault_exports SET status = 'processing' WHERE id = ?").run(exportId);
        const listRes = this.listVaultRecords({ ...filters, limit: 10000 });
        let content = '';

        if (format === 'json') {
          content = JSON.stringify(listRes.records, null, 2);
        } else {
          // CSV headers
          const headers = ['id', 'module', 'job_id', 'user_email', 'product_name', 'status', 'row_count', 'size_bytes', 'charged_amount', 'currency', 'created_at'];
          const lines = [headers.join(',')];
          for (const rec of listRes.records) {
            lines.push([
              rec.id,
              rec.module,
              rec.job_id,
              `"${rec.user_email || ''}"`,
              `"${rec.product_name || ''}"`,
              rec.status,
              rec.row_count,
              rec.size_bytes,
              rec.charged_amount,
              rec.currency,
              rec.created_at
            ].join(','));
          }
          content = '\uFEFF' + lines.join('\n');
        }

        fs.writeFileSync(filePath, content, 'utf8');
        const byteSize = Buffer.byteLength(content, 'utf8');

        db.prepare(`
          UPDATE vault_exports
          SET status = 'completed',
              total_records = ?,
              byte_size = ?
          WHERE id = ?
        `).run(listRes.records.length, byteSize, exportId);
      } catch (err: any) {
        db.prepare(`
          UPDATE vault_exports
          SET status = 'failed',
              error_message = ?
          WHERE id = ?
        `).run(err.message || 'Export failed', exportId);
      }
    }, 50);

    this.logAccess({
      admin,
      action: 'create_bulk_export',
      details: { exportId, format, filters }
    });

    return { exportId, downloadToken };
  }

  /**
   * Download Export by token
   */
  public getExportByToken(token: string): { filePath: string; format: string } | null {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT * FROM vault_exports
      WHERE download_token = ? AND status = 'completed' AND expires_at > datetime('now')
    `).get(token) as any;

    if (!row || !fs.existsSync(row.file_path)) return null;

    return {
      filePath: row.file_path,
      format: row.format
    };
  }
}
