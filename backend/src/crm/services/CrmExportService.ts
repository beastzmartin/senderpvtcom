import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { getCrmDb } from '../db/index.js';
import { FilterGroup, ExportFormat } from '../models/types.js';

export class CrmExportService {
  private static instance: CrmExportService | null = null;
  private readonly BATCH_SIZE = 5000;

  public static getInstance(): CrmExportService {
    if (!CrmExportService.instance) {
      CrmExportService.instance = new CrmExportService();
    }
    return CrmExportService.instance;
  }

  public async processExport(exportId: string, workspaceId: string): Promise<void> {
    const db = getCrmDb();
    const job = await db.getExport(workspaceId, exportId);
    if (!job) throw new Error(`Export job not found: ${exportId}`);

    await db.updateExport(workspaceId, exportId, { status: 'processing' });

    const exportsDir = path.resolve('data/crm_exports');
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }

    const filename = `contacts_export_${exportId}.${job.format}`;
    const filePath = path.join(exportsDir, filename);

    try {
      let totalRecords = 0;
      let cursor: string | undefined = undefined;
      let hasMore = true;

      if (job.format === 'csv') {
        const stream = fs.createWriteStream(filePath, { flags: 'w', encoding: 'utf8' });
        // Write CSV Header
        stream.write('ID,FirstName,LastName,Email,Phone,Company,Title,Country,City,Status,LeadScore,Source,CreatedAt\n');

        while (hasMore) {
          const res = await db.listContacts(workspaceId, {
            filter: job.filter_definition || undefined,
            pagination: { limit: this.BATCH_SIZE, cursor }
          });

          for (const c of res.data) {
            totalRecords++;
            const escape = (val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`;
            const line = [
              escape(c.id),
              escape(c.first_name),
              escape(c.last_name),
              escape(c.email),
              escape(c.phone),
              escape(c.company_name),
              escape(c.title),
              escape(c.country),
              escape(c.city),
              escape(c.status),
              escape(c.lead_score),
              escape(c.source),
              escape(c.created_at)
            ].join(',') + '\n';
            stream.write(line);
          }

          hasMore = res.has_more && Boolean(res.next_cursor);
          cursor = res.next_cursor || undefined;
        }

        stream.end();
      } else if (job.format === 'json') {
        const stream = fs.createWriteStream(filePath, { flags: 'w', encoding: 'utf8' });
        stream.write('[\n');
        let isFirst = true;

        while (hasMore) {
          const res = await db.listContacts(workspaceId, {
            filter: job.filter_definition || undefined,
            pagination: { limit: this.BATCH_SIZE, cursor }
          });

          for (const c of res.data) {
            totalRecords++;
            const line = (isFirst ? '' : ',\n') + JSON.stringify(c);
            isFirst = false;
            stream.write(line);
          }

          hasMore = res.has_more && Boolean(res.next_cursor);
          cursor = res.next_cursor || undefined;
        }

        stream.write('\n]');
        stream.end();
      } else if (job.format === 'xlsx') {
        // Stream XLSX via ExcelJS WorkbookWriter
        const workbookWriter = new ExcelJS.stream.xlsx.WorkbookWriter({
          filename: filePath,
          useStyles: true
        });

        const worksheet = workbookWriter.addWorksheet('Contacts');
        worksheet.columns = [
          { header: 'ID', key: 'id', width: 36 },
          { header: 'First Name', key: 'first_name', width: 16 },
          { header: 'Last Name', key: 'last_name', width: 16 },
          { header: 'Email', key: 'email', width: 28 },
          { header: 'Phone', key: 'phone', width: 18 },
          { header: 'Company', key: 'company_name', width: 24 },
          { header: 'Title', key: 'title', width: 20 },
          { header: 'Country', key: 'country', width: 14 },
          { header: 'City', key: 'city', width: 16 },
          { header: 'Status', key: 'status', width: 12 },
          { header: 'Score', key: 'lead_score', width: 10 },
          { header: 'Source', key: 'source', width: 16 },
          { header: 'Created At', key: 'created_at', width: 22 }
        ];

        while (hasMore) {
          const res = await db.listContacts(workspaceId, {
            filter: job.filter_definition || undefined,
            pagination: { limit: this.BATCH_SIZE, cursor }
          });

          for (const c of res.data) {
            totalRecords++;
            worksheet.addRow({
              id: c.id,
              first_name: c.first_name || '',
              last_name: c.last_name || '',
              email: c.email || '',
              phone: c.phone || '',
              company_name: c.company_name || '',
              title: c.title || '',
              country: c.country || '',
              city: c.city || '',
              status: c.status,
              lead_score: c.lead_score,
              source: c.source,
              created_at: c.created_at
            }).commit();
          }

          hasMore = res.has_more && Boolean(res.next_cursor);
          cursor = res.next_cursor || undefined;
        }

        await worksheet.commit();
        await workbookWriter.commit();
      }

      await db.updateExport(workspaceId, exportId, {
        total_records: totalRecords,
        status: 'completed',
        file_path: filePath,
        download_url: `/api/crm/exports/${exportId}/download`
      });
    } catch (err: any) {
      await db.updateExport(workspaceId, exportId, {
        status: 'failed'
      });
      throw err;
    }
  }
}

