import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getDatabase } from '../../db/database.js';
import { MarketplaceJobFileRecord } from '../../types/marketplace.js';

export class MarketplaceFileService {
  private static instance: MarketplaceFileService | null = null;
  private storageDir: string;

  private constructor() {
    this.storageDir = path.resolve(process.cwd(), 'data/marketplace_files');
    fs.mkdirSync(this.storageDir, { recursive: true });
  }

  public static getInstance(): MarketplaceFileService {
    if (!MarketplaceFileService.instance) {
      MarketplaceFileService.instance = new MarketplaceFileService();
    }
    return MarketplaceFileService.instance;
  }

  /**
   * Save a file buffer to our own server storage and register in DB
   */
  public saveJobFile(params: {
    jobId: string;
    userId: string;
    fileName: string;
    buffer: Buffer;
    contentType: string;
    recordKey?: string;
    expiresInHours?: number;
  }): MarketplaceJobFileRecord {
    const db = getDatabase();
    const id = `file_${crypto.randomUUID().slice(0, 12)}`;
    const jobFolder = path.join(this.storageDir, params.jobId);
    fs.mkdirSync(jobFolder, { recursive: true });

    // Sanitize file name to neutral white-label name
    let cleanName = params.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    if (/apify/i.test(cleanName)) {
      cleanName = cleanName.replace(/apify/gi, 'extract');
    }
    if (/actor/i.test(cleanName)) {
      cleanName = cleanName.replace(/actor/gi, 'job');
    }

    const filePath = path.join(jobFolder, `${id}_${cleanName}`);
    fs.writeFileSync(filePath, params.buffer);

    // Generate cryptographic tamper-proof download signature
    const signatureToken = crypto.randomBytes(24).toString('hex');
    const hours = params.expiresInHours || 72; // Default 72h signed URL
    const expiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();

    db.prepare(`
      INSERT INTO marketplace_job_files (
        id, job_id, user_id, file_name, content_type, byte_size, storage_path, record_key, signature_token, expires_at, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now')
      )
    `).run(
      id,
      params.jobId,
      params.userId,
      cleanName,
      params.contentType,
      params.buffer.length,
      filePath,
      params.recordKey || null,
      signatureToken,
      expiresAt
    );

    return {
      id,
      job_id: params.jobId,
      user_id: params.userId,
      file_name: cleanName,
      content_type: params.contentType,
      byte_size: params.buffer.length,
      storage_path: filePath,
      record_key: params.recordKey,
      signature_token: signatureToken,
      expires_at: expiresAt,
      created_at: new Date().toISOString(),
      download_url: `/api/marketplace/files/${id}/download?token=${signatureToken}`
    };
  }

  /**
   * List files belonging to a specific extraction job
   */
  public listFilesForJob(jobId: string, userId: string, isAdmin: boolean = false): MarketplaceJobFileRecord[] {
    const db = getDatabase();
    const query = isAdmin
      ? 'SELECT * FROM marketplace_job_files WHERE job_id = ? ORDER BY created_at ASC'
      : 'SELECT * FROM marketplace_job_files WHERE job_id = ? AND user_id = ? ORDER BY created_at ASC';

    const params = isAdmin ? [jobId] : [jobId, userId];
    const rows = db.prepare(query).all(...params) as any[];

    return rows.map((r) => ({
      id: r.id,
      job_id: r.job_id,
      user_id: r.user_id,
      file_name: r.file_name,
      content_type: r.content_type,
      byte_size: r.byte_size,
      storage_path: r.storage_path,
      record_key: r.record_key || undefined,
      signature_token: r.signature_token,
      expires_at: r.expires_at || undefined,
      created_at: r.created_at,
      download_url: `/api/marketplace/files/${r.id}/download?token=${r.signature_token}`
    }));
  }

  /**
   * Retrieve file for download with strict IDOR and signature checks
   */
  public getFileForDownload(
    fileId: string,
    token?: string,
    userId?: string,
    isAdmin: boolean = false
  ): { filePath: string; fileName: string; contentType: string } {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM marketplace_job_files WHERE id = ?').get(fileId) as any;

    if (!row) {
      throw new Error('FILE_NOT_FOUND: The requested file could not be found.');
    }

    // Ownership / IDOR verification
    if (!isAdmin) {
      if (userId && row.user_id !== userId) {
        throw new Error('ACCESS_DENIED: You do not have permission to access this file.');
      }
      if (token && row.signature_token !== token) {
        throw new Error('INVALID_TOKEN: Invalid or expired file download signature.');
      }
    }

    // Expiry check
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      throw new Error('FILE_EXPIRED: The signed download link has expired.');
    }

    if (!fs.existsSync(row.storage_path)) {
      throw new Error('FILE_NOT_FOUND: The file is no longer available in server storage.');
    }

    return {
      filePath: row.storage_path,
      fileName: row.file_name,
      contentType: row.content_type
    };
  }
}
