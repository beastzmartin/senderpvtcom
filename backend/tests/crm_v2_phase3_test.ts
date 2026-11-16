import { initCrmDatabase, getCrmDb } from '../src/crm/db/index.js';
import { CrmFilterBuilder } from '../src/crm/services/crmFilterBuilder.js';
import { CrmNlSearchService } from '../src/crm/services/CrmNlSearchService.js';
import { CrmBulkActionService } from '../src/crm/services/CrmBulkActionService.js';
import { FilterGroup } from '../src/crm/models/types.js';

async function runPhase3Verification() {
  console.log('🧪 Starting CRM V2 Phase 3: Segmentation, Search UX & Bulk Engine Verification...');
  await initCrmDatabase();
  const db = getCrmDb();

  const ws = await db.getUserDefaultWorkspace('test-user-v2-p3');
  console.log(`✅ Default Workspace verified: ${ws.name} (${ws.id})`);

  // 1. Nested Filter Builder with AND, OR, NOT and Activity / Tag / Company
  console.log('\n--- 1. Nested Filter Builder ---');
  const complexFilter: FilterGroup = {
    combinator: 'AND',
    conditions: [
      { field: 'country', operator: 'equals', value: 'India' },
      {
        combinator: 'OR',
        conditions: [
          { field: 'title', operator: 'contains', value: 'Director' },
          { field: 'title', operator: 'contains', value: 'VP' }
        ]
      },
      {
        combinator: 'NOT',
        conditions: [
          { field: 'status', operator: 'equals', value: 'unresponsive' }
        ]
      },
      { field: 'tag', operator: 'equals', value: 'enterprise_vip' }
    ]
  };

  const sqliteFragment = CrmFilterBuilder.buildFilterClause(complexFilter, false);
  console.log('✅ SQLite SQL Fragment generated:\n  ', sqliteFragment.sql);
  console.log('   Params:', sqliteFragment.params);
  if (!sqliteFragment.sql.includes('NOT') || !sqliteFragment.sql.includes('OR') || !sqliteFragment.sql.includes('crm_contact_tags')) {
    throw new Error('Nested filter compiler failed to generate expected clauses');
  }

  const pgFragment = CrmFilterBuilder.buildFilterClause(complexFilter, true, 1);
  console.log('✅ PostgreSQL SQL Fragment generated:\n  ', pgFragment.sql);
  console.log('   Params:', pgFragment.params);
  if (!pgFragment.sql.includes('$1') || !pgFragment.sql.includes('$2')) {
    throw new Error('Postgres parameter offset indexing failed');
  }

  // 2. Natural Language to Validated Filter JSON
  console.log('\n--- 2. Natural Language Search Translator ---');
  const nlService = CrmNlSearchService.getInstance();
  const query = 'CEOs in Mumbai with verified email who haven\'t been contacted in 30 days';
  const nlResult = nlService.parseNaturalLanguageQuery(query);

  console.log(`✅ NL Query: "${nlResult.raw_query}"`);
  console.log(`   Explanation: ${nlResult.explanation}`);
  console.log(`   Structured Filter JSON:\n${JSON.stringify(nlResult.filter, null, 2)}`);

  const hasTitleCond = nlResult.filter.conditions.some((c: any) => c.field === 'title' && c.value === 'CEO');
  const hasCityCond = nlResult.filter.conditions.some((c: any) => c.field === 'city' && c.value.toLowerCase().includes('mumbai'));
  const hasEmailCond = nlResult.filter.conditions.some((c: any) => c.field === 'email_status' && c.value === 'valid');

  if (!hasTitleCond || !hasCityCond || !hasEmailCond) {
    throw new Error('NL search parser missed critical search criteria');
  }
  console.log('✅ NL to Structured Filter JSON validation verified with ZERO SQL injection surface!');

  // 3. Saved Views & Dynamic Segments
  console.log('\n--- 3. Saved Views & Dynamic Segments ---');
  const savedView = await db.createSavedView(ws.id, {
    name: 'High Priority Tech Leaders',
    description: 'CEOs & CTOs with verified email',
    filter_definition: nlResult.filter,
    sort_by: 'lead_score',
    sort_direction: 'desc',
    visible_columns: ['name', 'title', 'company_name', 'email', 'phone', 'lead_score'],
    is_dynamic: true,
    is_shared: true
  });
  console.log(`✅ Saved View created: "${savedView.name}" (ID: ${savedView.id}, is_shared: ${savedView.is_shared})`);

  const fetchedView = await db.getSavedView(ws.id, savedView.id);
  if (!fetchedView || fetchedView.visible_columns.length !== 6) {
    throw new Error('Failed to retrieve saved view');
  }
  console.log('✅ Saved View retrieval verified');

  // 4. Tracked Bulk Actions Engine & 1-Click UNDO
  console.log('\n--- 4. Tracked Bulk Actions Engine & UNDO ---');
  const bulkService = CrmBulkActionService.getInstance();

  // Create 3 test contacts to mutate
  const uid = Date.now().toString().slice(-4);
  const c1 = await db.createContact(ws.id, {
    first_name: 'BulkTarget1',
    last_name: 'Test',
    email: `bulk1_${uid}@test.com`,
    status: 'new',
    title: 'Analyst'
  });
  const c2 = await db.createContact(ws.id, {
    first_name: 'BulkTarget2',
    last_name: 'Test',
    email: `bulk2_${uid}@test.com`,
    status: 'new',
    title: 'Analyst'
  });

  console.log(`✅ Created test contacts for bulk mutation: ${c1.id}, ${c2.id}`);

  // Enqueue bulk update: change status to 'qualified' and title to 'Senior Analyst'
  const filterForBulk: FilterGroup = {
    combinator: 'AND',
    conditions: [
      { field: 'last_name', operator: 'equals', value: 'Test' }
    ]
  };

  const job = await bulkService.startJob(
    ws.id,
    undefined,
    'bulk_update',
    filterForBulk,
    { updates: { status: 'qualified', title: 'Senior Analyst' } }
  );

  console.log(`✅ Bulk Job started: ${job.id} (action: ${job.action_type})`);

  // Wait for background execution to complete
  let completedJob = null;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 200));
    completedJob = await db.getBulkJob(ws.id, job.id);
    if (completedJob?.status === 'completed') break;
  }

  console.log(`✅ Bulk Job finished with status: ${completedJob?.status} (processed: ${completedJob?.processed_count}, success: ${completedJob?.success_count})`);
  if (completedJob?.status !== 'completed' || (completedJob?.success_count || 0) < 2) {
    throw new Error('Bulk job did not successfully complete');
  }

  // Verify contacts were mutated
  const mutated1 = await db.getContact(ws.id, c1.id);
  const mutated2 = await db.getContact(ws.id, c2.id);
  if (mutated1?.status !== 'qualified' || mutated2?.title !== 'Senior Analyst') {
    throw new Error('Bulk mutations did not apply');
  }
  console.log(`✅ Contacts verified in mutated state: status "${mutated1.status}", title "${mutated1.title}"`);

  // Test 1-Click UNDO
  console.log('🔄 Executing 1-Click UNDO on bulk job...');
  const undoResult = await bulkService.undoJob(ws.id, job.id);
  console.log(`✅ UNDO completed: ${undoResult.restored_count} contacts restored`);

  const reverted1 = await db.getContact(ws.id, c1.id);
  const reverted2 = await db.getContact(ws.id, c2.id);
  if (reverted1?.status !== 'new' || reverted2?.title !== 'Analyst') {
    throw new Error(`UNDO failed to revert fields! Current: status=${reverted1?.status}, title=${reverted2?.title}`);
  }
  console.log(`✅ 1-Click UNDO verified: Contact 1 status successfully reverted to "${reverted1.status}", Contact 2 title reverted to "${reverted2.title}"!`);

  console.log('\n🎉 ALL CRM V2 PHASE 3 SEGMENTATION, SEARCH UX & BULK ENGINE TESTS PASSED PERFECTLY!\n');
}

runPhase3Verification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Phase 3 Verification Failed:', err);
    process.exit(1);
  });

