import fs from 'fs';
import path from 'path';
import { getCrmDb } from '../crm/db/index.js';
import { CrmImportService } from '../crm/services/CrmImportService.js';

async function testUploadAndImport() {
  console.log('Testing CRM file upload & import pipeline...');
  const db = getCrmDb();
  const ws = await db.createWorkspace('admin', 'Upload Test Workspace');

  // Create a sample CSV file
  const testDir = path.resolve('data/crm_imports/uploads');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  const sampleCsvPath = path.join(testDir, `test_upload_${Date.now()}.csv`);
  const csvContent = `First Name,Last Name,Email Address,Phone Number,Company,Job Title
Alice,Smith,alice.upload@example.com,+15551112233,Acme Corp,Director
Bob,Jones,bob.upload@example.com,+15552223344,Globex Inc,VP Sales
Charlie,Brown,charlie.upload@example.com,+15553334455,Initech,Lead Engineer`;

  fs.writeFileSync(sampleCsvPath, csvContent, 'utf8');
  console.log(`Created sample upload file at: ${sampleCsvPath}`);

  // Create import job as executeImport does
  const importJob = await db.createImport(ws.id, {
    user_id: 'admin',
    filename: path.basename(sampleCsvPath),
    file_path: sampleCsvPath,
    column_mapping: {
      'First Name': 'first_name',
      'Last Name': 'last_name',
      'Email Address': 'email',
      'Phone Number': 'phone',
      'Company': 'company_name',
      'Job Title': 'title'
    },
    dedupe_rule: 'update',
    total_rows: 3
  });

  console.log(`Created import job ${importJob.id}. Processing streaming import...`);

  await CrmImportService.getInstance().processImport(importJob.id, ws.id);

  const updatedJob = await db.getImport(ws.id, importJob.id);
  console.log('Updated import job status:', updatedJob);

  if (updatedJob?.status !== 'completed') {
    throw new Error(`Import failed with status: ${updatedJob?.status}, details: ${updatedJob?.error_details}`);
  }

  // Verify contacts inserted
  const contacts = await db.listContacts(ws.id, { pagination: { limit: 10 } });
  console.log(`Verified inserted contacts count: ${contacts.data.length}`);

  if (contacts.data.length !== 3) {
    throw new Error(`Expected 3 contacts, found ${contacts.data.length}`);
  }

  console.log('Sample contact:', contacts.data[0]);

  // Clean up
  if (fs.existsSync(sampleCsvPath)) {
    fs.unlinkSync(sampleCsvPath);
  }

  console.log('✅ Upload & streaming import test passed 100%!');
}

testUploadAndImport().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});

