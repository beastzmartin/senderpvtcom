import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse';
import ExcelJS from 'exceljs';
import { getCrmDb } from '../db/index.js';
import { CrmNormalizer } from './crmNormalizer.js';
import { Contact, ImportDedupeRule } from '../models/types.js';
import { getSocketIO } from '../../socket/socketManager.js';

export class CrmImportService {
  private static instance: CrmImportService | null = null;
  private readonly CHUNK_SIZE = 5000;

  public static getInstance(): CrmImportService {
    if (!CrmImportService.instance) {
      CrmImportService.instance = new CrmImportService();
    }
    return CrmImportService.instance;
  }

  /**
   * Process an import job asynchronously in streaming chunks
   */
  public async processImport(importId: string, workspaceId: string): Promise<void> {
    const db = getCrmDb();
    const job = await db.getImport(workspaceId, importId);
    if (!job || !job.file_path || !fs.existsSync(job.file_path)) {
      throw new Error(`Import file not found for job: ${importId}`);
    }

    await db.updateImport(workspaceId, importId, { status: 'processing' });
    this.emitProgress(workspaceId, importId, 0, 0, 'Starting import...');

    const isXlsx = job.filename.toLowerCase().endsWith('.xlsx');
    const mapping = job.column_mapping || {};
    const dedupeRule: ImportDedupeRule = job.dedupe_rule || 'update';

    // Prepare error report file
    const reportsDir = path.resolve('data/crm_imports/reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    const errorReportPath = path.join(reportsDir, `error_report_${importId}.csv`);
    const errorStream = fs.createWriteStream(errorReportPath, { flags: 'w' });
    errorStream.write('RowNumber,RawData,Reason\n');

    let totalProcessed = 0;
    let totalImported = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    let chunk: Partial<Contact>[] = [];
    const addedContactIds: string[] = [];

    const flushChunk = async () => {
      if (chunk.length === 0) return;
      try {
        const res = await db.bulkUpsertContacts(workspaceId, chunk, dedupeRule);
        totalImported += res.inserted;
        totalUpdated += res.updated;
        totalSkipped += res.skipped;
        totalErrors += res.errors.length;

        for (const err of res.errors) {
          errorStream.write(`${totalProcessed},"${JSON.stringify(err.contact).replace(/"/g, '""')}","${err.error}"\n`);
        }

        chunk = [];
        await db.updateImport(workspaceId, importId, {
          processed_rows: totalProcessed,
          imported_rows: totalImported,
          updated_rows: totalUpdated,
          skipped_rows: totalSkipped,
          error_rows: totalErrors
        });

        this.emitProgress(workspaceId, importId, totalProcessed, job.total_rows, `Imported ${totalImported}, Updated ${totalUpdated}...`);
      } catch (err: any) {
        totalErrors += chunk.length;
        errorStream.write(`${totalProcessed},"Chunk Batch Error","${err.message}"\n`);
        chunk = [];
      }
    };

    try {
      if (isXlsx) {
        // Stream XLSX via ExcelJS WorkbookReader
        const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(job.file_path, {
          entries: 'emit',
          sharedStrings: 'cache',
          hyperlinks: 'ignore',
          worksheets: 'emit'
        });

        let headerRow: string[] = [];
        for await (const worksheetReader of workbookReader) {
          for await (const row of worksheetReader) {
            const values = (row.values as any[]).slice(1); // ExcelJS 1-indexed
            if (headerRow.length === 0) {
              headerRow = values.map((v) => String(v || '').trim());
              continue;
            }

            totalProcessed++;
            const rowObj: Record<string, any> = {};
            headerRow.forEach((col, idx) => {
              if (col) rowObj[col] = values[idx];
            });

            const contact = this.mapRowToContact(rowObj, mapping);
            if (contact) {
              chunk.push(contact);
            } else {
              totalSkipped++;
            }

            if (chunk.length >= this.CHUNK_SIZE) {
              await flushChunk();
            }
          }
        }
      } else {
        // Stream CSV via csv-parse
        const parser = fs.createReadStream(job.file_path).pipe(
          parse({
            columns: true,
            skip_empty_lines: true,
            trim: true,
            relax_column_count: true
          })
        );

        for await (const record of parser) {
          totalProcessed++;
          const contact = this.mapRowToContact(record, mapping);
          if (contact) {
            chunk.push(contact);
          } else {
            totalSkipped++;
          }

          if (chunk.length >= this.CHUNK_SIZE) {
            await flushChunk();
          }
        }
      }

      // Flush remaining
      await flushChunk();
      errorStream.end();

      // If target list was provided, link contacts
      if (job.list_id && addedContactIds.length > 0) {
        await db.addContactsToList(workspaceId, job.list_id, addedContactIds);
      }

      const errorReportUrl = totalErrors > 0 ? `/api/crm/imports/${importId}/error-report` : null;

      await db.updateImport(workspaceId, importId, {
        total_rows: totalProcessed,
        processed_rows: totalProcessed,
        imported_rows: totalImported,
        updated_rows: totalUpdated,
        skipped_rows: totalSkipped,
        error_rows: totalErrors,
        status: 'completed',
        error_report_url: errorReportUrl
      });

      this.emitProgress(workspaceId, importId, totalProcessed, totalProcessed, 'Import completed successfully!');
    } catch (err: any) {
      errorStream.end();
      await db.updateImport(workspaceId, importId, {
        status: 'failed',
        error_details: err.message
      });
      this.emitProgress(workspaceId, importId, totalProcessed, totalProcessed, `Import failed: ${err.message}`);
    }
  }

  private mapRowToContact(row: Record<string, any>, mapping: Record<string, string>): Partial<Contact> | null {
    // Robust bi-directional mapping: supports both { crmField: fileCol } and { fileCol: crmField }
    const getValue = (crmField: string): any => {
      if (mapping[crmField] && row[mapping[crmField]] !== undefined) {
        return row[mapping[crmField]];
      }
      for (const [k, v] of Object.entries(mapping)) {
        if (v === crmField && row[k] !== undefined) {
          return row[k];
        }
      }
      return row[crmField];
    };

    let firstName = getValue('first_name');
    let lastName = getValue('last_name');

    if (!firstName && !lastName && getValue('name')) {
      const full = String(getValue('name')).trim();
      const parts = full.split(' ');
      firstName = parts[0];
      lastName = parts.slice(1).join(' ');
    }

    const email = CrmNormalizer.normalizeEmail(getValue('email'));
    const phone = CrmNormalizer.normalizePhone(getValue('phone'));

    if (!email && !phone && !firstName && !lastName) {
      return null;
    }

    // Capture extra custom fields
    const customFields: Record<string, any> = {};
    const mappedCols = new Set<string>();
    for (const [k, v] of Object.entries(mapping)) {
      mappedCols.add(k);
      mappedCols.add(v);
    }

    for (const [col, val] of Object.entries(row)) {
      if (!mappedCols.has(col) && val !== undefined && val !== null && val !== '') {
        customFields[col] = val;
      }
    }

    return {
      first_name: CrmNormalizer.cleanText(firstName),
      last_name: CrmNormalizer.cleanText(lastName),
      email: email || null,
      phone: phone || null,
      company_name: CrmNormalizer.cleanText(getValue('company_name') || getValue('company')),
      title: CrmNormalizer.cleanText(getValue('title') || getValue('job_title')),
      country: CrmNormalizer.cleanText(getValue('country')),
      city: CrmNormalizer.cleanText(getValue('city')),
      source: 'import',
      status: getValue('status') || 'new',
      custom_fields: customFields,
      email_status: email ? 'unknown' : 'invalid'
    };
  }

  private emitProgress(workspaceId: string, importId: string, current: number, total: number, message: string) {
    try {
      getSocketIO()?.to(`workspace:${workspaceId}`).emit('crm:import_progress', {
        importId,
        current,
        total,
        message
      });
    } catch {}
  }
}

