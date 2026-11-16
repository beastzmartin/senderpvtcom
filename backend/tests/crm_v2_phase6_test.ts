import { initCrmDatabase, getCrmDb } from '../src/crm/db/index.js';
import { getDatabase } from '../src/db/database.js';
import { CrmPipelineService } from '../src/crm/services/CrmPipelineService.js';
import { CrmPresenceService } from '../src/crm/services/CrmPresenceService.js';

async function runPhase6Tests() {
  console.log('💼 [CRM V2] Starting Phase 6 Sales Pipeline, Deals & Collaboration Verification Suite...\n');

  // 1. Initialize Storage
  const db = await initCrmDatabase();
  console.log('✅ CRM Database Initialized successfully.');

  const localDb = getDatabase();
  const testUserStmt = localDb.prepare('SELECT id FROM users LIMIT 1').get() as { id: string } | undefined;
  const testUserId = testUserStmt ? testUserStmt.id : 'user_pipe_test_' + Date.now();
  if (!testUserStmt) {
    localDb.prepare(`INSERT INTO users (id, username, password, role, is_active, created_at) VALUES (?, ?, 'pwd', 'admin', 1, datetime('now'))`).run(testUserId, 'pipe_tester');
  }

  const ws = await db.createWorkspace(testUserId, 'Sales Pipeline Workspace ' + Date.now());
  console.log(`✅ Test Workspace Created: ${ws.name} (${ws.id})`);

  // 2. Create Pipelines & Stages
  console.log('\n--- Test 1: Sales Pipelines & Stages ---');
  const pipelines = await db.listPipelines(ws.id);
  console.log(`Default Pipelines initialized: ${pipelines.length}`);
  const defaultPipe = pipelines[0];
  console.log(`Pipeline: "${defaultPipe.name}" (${defaultPipe.id})`);

  const stages = await db.listPipelineStages(ws.id, defaultPipe.id);
  console.log(`Pipeline Stages (${stages.length}):`);
  for (const s of stages) {
    console.log(`  - Stage: ${s.name} [order: ${s.order_index}, win_prob: ${s.win_probability}%, rotten_threshold: ${s.rotten_days}d]`);
  }
  if (stages.length < 5) {
    throw new Error('Expected at least 5 default pipeline stages');
  }

  // 3. Test Multi-Currency Deals & Auto-USD Conversion
  console.log('\n--- Test 2: Multi-Currency Deals & Converted Reporting ---');
  const pipelineService = CrmPipelineService.getInstance();
  const uid = Date.now().toString().slice(-4);

  const contact = await db.createContact(ws.id, {
    first_name: 'Aditya',
    last_name: 'Birla',
    email: `aditya.${uid}@corp.in`,
    phone: `+91999999${uid}`
  });

  const discoveryStage = stages.find((s) => s.name === 'Discovery') || stages[1];
  const proposalStage = stages.find((s) => s.name === 'Proposal Sent') || stages[2];
  const wonStage = stages.find((s) => s.is_won) || stages[stages.length - 2];

  // Deal in USD
  const dealUsd = await pipelineService.saveDeal(ws.id, {
    pipeline_id: defaultPipe.id,
    stage_id: discoveryStage.id,
    contact_id: contact.id,
    name: 'Enterprise Cloud Expansion',
    amount: 15000,
    currency: 'USD'
  });
  console.log(`Deal 1 Created: ${dealUsd.name} -> $${dealUsd.amount} ${dealUsd.currency} (amount_usd: $${dealUsd.amount_usd})`);

  // Deal in INR (Multi-currency auto-conversion)
  const dealInr = await pipelineService.saveDeal(ws.id, {
    pipeline_id: defaultPipe.id,
    stage_id: proposalStage.id,
    contact_id: contact.id,
    name: 'India Regional License',
    amount: 850000,
    currency: 'INR'
  });
  console.log(`Deal 2 Created: ${dealInr.name} -> ₹${dealInr.amount} ${dealInr.currency} (amount_usd: $${dealInr.amount_usd})`);

  if (dealInr.amount_usd <= 0 || dealInr.amount_usd >= 850000) {
    throw new Error('Multi-currency conversion to USD failed');
  }

  // 4. Test Kanban Board Aggregation & Rotten Deals
  console.log('\n--- Test 3: Kanban Board Aggregations & Rotten Deal Alerts ---');
  const kanban = await pipelineService.getKanbanBoard(ws.id, defaultPipe.id);
  console.log(`Total Pipeline Value USD: $${kanban.total_pipeline_value_usd.toLocaleString()}`);
  console.log(`Total Deals in Pipeline: ${kanban.total_deals_count}`);

  for (const col of kanban.columns) {
    if (col.deals_count > 0) {
      console.log(`  Column [${col.stage.name}]: ${col.deals_count} deal(s), Native Total: ${col.total_amount}, USD: $${col.total_amount_usd}`);
    }
  }

  if (kanban.total_pipeline_value_usd <= 0) {
    throw new Error('Expected positive aggregated pipeline USD total');
  }

  // Test stage transition to Closed Won
  const movedDeal = await pipelineService.saveDeal(ws.id, {
    id: dealUsd.id,
    pipeline_id: defaultPipe.id,
    stage_id: wonStage.id
  });
  console.log(`Moved Deal to "${wonStage.name}", Status automatically updated to: "${movedDeal.status}"`);
  if (movedDeal.status !== 'won') {
    throw new Error(`Expected deal status to be 'won' upon moving to winning stage`);
  }

  // 5. Test Tasks with SLA Countdown & Due Date
  console.log('\n--- Test 4: Tasks & SLA Response Timers ---');
  const futureDue = new Date(Date.now() + 120 * 60 * 1000).toISOString(); // 2 hours from now
  const task = await db.createTask(ws.id, {
    deal_id: dealUsd.id,
    contact_id: contact.id,
    title: 'Send Contract Agreement & Counter-Sign SLA',
    due_date: futureDue,
    sla_minutes: 120,
    priority: 'urgent',
    status: 'pending'
  });
  console.log(`Task Created: "${task.title}", priority: ${task.priority}, status: ${task.status}`);

  const activeTasks = await db.listTasks(ws.id, { dealId: dealUsd.id });
  console.log(`Deal Active Tasks: ${activeTasks.length}, Overdue: ${activeTasks[0].is_overdue}, SLA Remaining: ${activeTasks[0].sla_remaining_minutes} min`);
  if (activeTasks.length === 0 || activeTasks[0].is_overdue) {
    throw new Error('Task SLA verification failed');
  }

  // 6. Test Real-Time Collaboration & Collision Detection
  console.log('\n--- Test 5: Collision Detection & Teammate Presence ---');
  const presence = CrmPresenceService.getInstance();
  const userA = 'user_sales_rep_a';
  const userB = 'user_sales_rep_b';

  // User A starts editing contact
  await presence.heartbeat(ws.id, 'contact', contact.id, userA, 'Sarah Connor', 'editing');
  console.log('✅ Registered Presence: User A is editing contact');

  // User B checks collisions on the same contact
  const collisionsForB = await presence.getCollisions(ws.id, 'contact', contact.id, userB);
  console.log('Collision Detection for User B:', collisionsForB);
  if (!collisionsForB.hasCollision || collisionsForB.activeUsers.length === 0) {
    throw new Error('Collision detection failed: Expected active editor collision alert');
  }
  console.log(`  - Detected active editor: ${collisionsForB.activeUsers[0].user_name} (${collisionsForB.activeUsers[0].action})`);

  // User A finishes and leaves
  await presence.leave(ws.id, 'contact', contact.id, userA);
  const collisionsAfterLeave = await presence.getCollisions(ws.id, 'contact', contact.id, userB);
  console.log('Collisions after User A left:', collisionsAfterLeave);
  if (collisionsAfterLeave.hasCollision) {
    throw new Error('Collision should clear after user leaves');
  }

  console.log('\n🎉 ALL PHASE 6 SALES PIPELINE & COLLABORATION TESTS PASSED WITH 0 ERRORS!\n');
}

runPhase6Tests().catch((err) => {
  console.error('❌ Phase 6 Test Suite Failed:', err);
  process.exit(1);
});

