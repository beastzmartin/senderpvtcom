import { initCrmDatabase, getCrmDb } from '../src/crm/db/index.js';
import { getDatabase } from '../src/db/database.js';
import { CrmSecurityService } from '../src/crm/services/CrmSecurityService.js';
import { CrmGdprService } from '../src/crm/services/CrmGdprService.js';

async function runPhase7Tests() {
  console.log('🔒 [CRM V2] Starting Phase 7 Security, Compliance & Multi-Tenancy Verification Suite...\n');

  // 1. Initialize Storage
  const db = await initCrmDatabase();
  console.log('✅ CRM Database Initialized successfully.');

  const localDb = getDatabase();
  const testUserStmt = localDb.prepare('SELECT id FROM users LIMIT 1').get() as { id: string } | undefined;
  const testUserId = testUserStmt ? testUserStmt.id : 'user_sec_test_' + Date.now();
  if (!testUserStmt) {
    localDb.prepare(`INSERT INTO users (id, username, password, role, is_active, created_at) VALUES (?, ?, 'pwd', 'admin', 1, datetime('now'))`).run(testUserId, 'sec_tester');
  }

  const ws = await db.createWorkspace(testUserId, 'Security Workspace ' + Date.now());
  console.log(`✅ Test Workspace Created: ${ws.name} (${ws.id})`);

  // 2. Test RBAC Permissions
  console.log('\n--- Test 1: RBAC Granular Role Permissions ---');
  const security = CrmSecurityService.getInstance();
  const permissions = await db.listRolePermissions(ws.id);
  console.log(`Seeded Role Permissions (${permissions.length}):`);
  for (const p of permissions) {
    console.log(`  - Role: ${p.role.toUpperCase()} [export: ${p.can_export}, bulk_del: ${p.can_bulk_delete}, sensitive: ${p.can_view_sensitive_fields}, phones: ${p.can_view_phones}]`);
  }

  const repCanBulkDelete = await security.hasPermission(ws.id, 'rep', 'can_bulk_delete');
  const adminCanBulkDelete = await security.hasPermission(ws.id, 'admin', 'can_bulk_delete');
  console.log(`Permission Check: rep.can_bulk_delete = ${repCanBulkDelete}, admin.can_bulk_delete = ${adminCanBulkDelete}`);

  if (repCanBulkDelete || !adminCanBulkDelete) {
    throw new Error('RBAC permission check failed');
  }

  // 3. Test Field Masking & Sensitive Field Redaction
  console.log('\n--- Test 2: Field Masking & Sensitive Field Redaction ---');
  const uid = Date.now().toString().slice(-4);
  const contact = await db.createContact(ws.id, {
    first_name: 'Ananya',
    last_name: 'Deshmukh',
    email: `ananya.deshmukh.${uid}@financialcorp.in`,
    phone: `+91987654${uid}`,
    custom_fields: {
      salary: 1800000,
      ssn: '123-45-6789',
      aadhaar: '987654321098',
      department: 'Investment Banking'
    }
  });

  // Filter for 'rep' role (should mask sensitive custom fields like salary, ssn, aadhaar)
  const repView = await security.filterContactForRole(ws.id, contact, 'rep');
  console.log('Original Contact Fields:', contact.custom_fields);
  console.log('Rep Filtered Custom Fields:', repView.custom_fields);

  if (repView.custom_fields.salary !== '[REDACTED]') {
    throw new Error(`Expected salary to be [REDACTED], got: ${repView.custom_fields.salary}`);
  }
  if (repView.custom_fields.ssn !== undefined) {
    throw new Error(`Expected ssn to be hidden (undefined), got: ${repView.custom_fields.ssn}`);
  }
  if (!String(repView.custom_fields.aadhaar).startsWith('***')) {
    throw new Error(`Expected aadhaar to be partially masked, got: ${repView.custom_fields.aadhaar}`);
  }
  if (repView.custom_fields.department !== 'Investment Banking') {
    throw new Error('Non-sensitive field was improperly modified');
  }

  // Filter for 'read_only' role (should mask phone and email)
  const readOnlyView = await security.filterContactForRole(ws.id, contact, 'read_only');
  console.log(`Read-Only Email: ${readOnlyView.email}`);
  console.log(`Read-Only Phone: ${readOnlyView.phone}`);

  if (!readOnlyView.email?.includes('***') || !readOnlyView.phone?.includes('***')) {
    throw new Error('Email and phone masking failed for read_only role');
  }

  // Test Reveal Audit Logging
  await security.logRevealAudit(ws.id, testUserId, contact.id, 'salary', '192.168.1.100');
  const auditLogs = await db.listAuditLogs(ws.id, 10);
  const revealLog = auditLogs.find((l) => l.action === 'sensitive_field_revealed');
  console.log('✅ Audit Log recorded sensitive field reveal:', revealLog?.action, revealLog?.changes);
  if (!revealLog) {
    throw new Error('Failed to find recorded sensitive_field_revealed audit log');
  }

  // 4. Test GDPR Data Portability Bundle Export
  console.log('\n--- Test 3: GDPR Article 20 / DPDP Data Portability Bundle ---');
  const gdprService = CrmGdprService.getInstance();

  // Add an activity and task
  await db.logActivity(ws.id, {
    contact_id: contact.id,
    type: 'note',
    title: 'Customer onboarding meeting held'
  });
  await db.createTask(ws.id, {
    contact_id: contact.id,
    title: 'Review compliance documents'
  });

  const bundle = await gdprService.exportSubjectDataBundle(ws.id, contact.id);
  console.log(`Exported Subject Bundle for ${bundle.contact.first_name}:`);
  console.log(`  Activities: ${bundle.activities.length}`);
  console.log(`  Tasks: ${bundle.tasks.length}`);
  console.log(`  Jurisdiction: ${bundle.gdpr_jurisdiction}`);
  if (bundle.activities.length === 0 || bundle.tasks.length === 0) {
    throw new Error('Data subject bundle failed to include associated records');
  }

  // 5. Test GDPR Right to Erasure & Cryptographic Certificate
  console.log('\n--- Test 4: GDPR Right to Erasure & Cryptographic Certificate ---');
  const requesterEmail = contact.email!;
  const cert = await gdprService.executeErasure(ws.id, contact.id, requesterEmail, testUserId);
  console.log(`✅ Issued Erasure Certificate: ${cert.id}`);
  console.log(`  Requester: ${cert.requester_email}`);
  console.log(`  Records Purged: ${cert.records_purged}`);
  console.log(`  SHA-256 Audit Hash: ${cert.audit_hash}`);

  if (!cert.audit_hash || cert.records_purged < 1) {
    throw new Error('Erasure certificate missing valid cryptographic hash or purged count');
  }

  // Verify contact is completely wiped
  const wipedContact = await db.getContact(ws.id, contact.id);
  console.log('Verification: getContact returned:', wipedContact);
  if (wipedContact !== null) {
    throw new Error('Contact record was not physically purged');
  }

  // Verify contact email is placed on suppression list
  const isSuppressed = await db.checkSuppressed(ws.id, { email: requesterEmail });
  console.log(`Verification: Email ${requesterEmail} in suppression list: ${isSuppressed}`);
  if (!isSuppressed) {
    throw new Error('Erased contact email should be placed in suppression list');
  }

  console.log('\n🎉 ALL PHASE 7 SECURITY, COMPLIANCE & PRIVACY TESTS PASSED WITH 0 ERRORS!\n');
}

runPhase7Tests().catch((err) => {
  console.error('❌ Phase 7 Test Suite Failed:', err);
  process.exit(1);
});

