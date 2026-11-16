import { initCrmDatabase, getCrmDb } from '../src/crm/db/index.js';
import { getDatabase } from '../src/db/database.js';
import { CrmWorkflowEngine } from '../src/crm/services/CrmWorkflowEngine.js';
import { CrmComplianceService } from '../src/crm/services/CrmComplianceService.js';
import { CrmWorkflow } from '../src/crm/models/types.js';

async function runPhase5Tests() {
  console.log('⚡ [CRM V2] Starting Phase 5 Automation Engine Verification Suite...\n');

  // 1. Initialize Storage
  const db = await initCrmDatabase();
  console.log('✅ CRM Database Initialized successfully.');

  const localDb = getDatabase();
  const testUserStmt = localDb.prepare('SELECT id FROM users LIMIT 1').get() as { id: string } | undefined;
  const testUserId = testUserStmt ? testUserStmt.id : 'user_wf_test_' + Date.now();
  if (!testUserStmt) {
    localDb.prepare(`INSERT INTO users (id, username, password, role, is_active, created_at) VALUES (?, ?, 'pwd', 'admin', 1, datetime('now'))`).run(testUserId, 'wf_tester');
  }

  const ws = await db.createWorkspace(testUserId, 'Automation Workspace ' + Date.now());
  console.log(`✅ Test Workspace Created: ${ws.name} (${ws.id})`);

  // 2. Create Target Contacts
  const uid = Date.now().toString().slice(-4);
  const contact = await db.createContact(ws.id, {
    first_name: 'Vikram',
    last_name: 'Singhania',
    title: 'Managing Director',
    company_name: 'Apex Industrial Corp',
    email: `vikram.${uid}@apexcorp.in`,
    phone: `+91981111${uid}`,
    lead_score: 85,
    country: 'India',
    status: 'new'
  });
  console.log(`✅ Seeded Contact: ${contact.first_name} ${contact.last_name} (${contact.id}), Lead Score: ${contact.lead_score}`);

  // 3. Test Deliverability & Compliance Policies
  console.log('\n--- Test 1: Deliverability & Compliance Policies ---');
  const compliance = CrmComplianceService.getInstance();
  
  // Set policy with quiet hours disabled for testing daytime checks
  const policy = await db.saveCompliancePolicy(ws.id, {
    max_messages_per_day: 2,
    quiet_hours_enabled: false,
    auto_opt_out_keywords: ['STOP', 'UNSUBSCRIBE', 'ROK DO']
  });
  console.log('✅ Saved Compliance Policy:', policy);

  // Check can send message (should be true initially)
  const canSendInitial = await compliance.canSendMessage(ws.id, contact.id, 'whatsapp');
  console.log('Initial canSendMessage check:', canSendInitial);
  if (!canSendInitial.canSend) {
    throw new Error(`Expected canSendMessage to be true, got reason: ${canSendInitial.reason}`);
  }

  // 4. Test Inbound Keyword Auto-Opt-Out
  console.log('\n--- Test 2: Inbound Keyword Auto-Opt-Out (STOP / UNSUBSCRIBE) ---');
  const optOutContact = await db.createContact(ws.id, {
    first_name: 'Sneha',
    last_name: 'Roy',
    email: `sneha.${uid}@domain.com`,
    phone: `+91982222${uid}`
  });

  const optOutResult = await compliance.handleInboundKeyword(ws.id, optOutContact.id, 'Please STOP sending messages');
  console.log('Inbound Keyword Opt-Out Result:', optOutResult);
  if (!optOutResult.autoOptedOut || optOutResult.keywordMatched !== 'STOP') {
    throw new Error('Failed to auto-opt-out contact on STOP keyword');
  }

  // Verify that contact is now suppressed
  const isNowSuppressed = await compliance.canSendMessage(ws.id, optOutContact.id, 'whatsapp');
  console.log('Suppressed Contact canSendMessage check:', isNowSuppressed);
  if (isNowSuppressed.canSend || !isNowSuppressed.isSuppressed) {
    throw new Error('Contact should be blocked due to suppression');
  }

  // 5. Test Workflow Builder: Condition, Tag, Durable Delay, Send WhatsApp, Update Field
  console.log('\n--- Test 3: Visual Workflow Engine & Durable Delays ---');
  const engine = CrmWorkflowEngine.getInstance();

  const workflow = await db.createWorkflow(ws.id, {
    name: 'High Intent Lead Onboarding Journey',
    trigger_type: 'contact_created',
    is_active: true,
    steps: [
      {
        id: 'step_1_condition',
        name: 'Check High Lead Score',
        action_type: 'condition',
        config: { field: 'lead_score', operator: 'gte', value: 70 }
      },
      {
        id: 'step_2_tag',
        name: 'Tag as VIP Prospect',
        action_type: 'add_tag',
        config: { tag: 'vip_prospect' }
      },
      {
        id: 'step_3_delay',
        name: 'Wait 1 Second (Durable Timer)',
        action_type: 'delay',
        config: { delay_seconds: 1 }
      },
      {
        id: 'step_4_wa',
        name: 'Send VIP Welcome WhatsApp',
        action_type: 'send_whatsapp',
        config: { message_template: 'Hi {{first_name}}, welcome to Apex partner network!' }
      },
      {
        id: 'step_5_update',
        name: 'Mark Contacted',
        action_type: 'update_field',
        config: { field_name: 'status', field_value: 'contacted' }
      }
    ]
  });

  console.log(`✅ Workflow Created: ${workflow.name} (${workflow.id}) with ${workflow.steps.length} steps`);

  // Trigger workflow for contact
  const triggeredRuns = await engine.triggerEvent(ws.id, 'contact_created', contact.id, { source: 'api' });
  console.log(`✅ Triggered ${triggeredRuns.length} workflow run(s)`);
  if (triggeredRuns.length === 0) {
    throw new Error('Expected workflow to be triggered for contact_created event');
  }

  const runId = triggeredRuns[0].id;

  // Give short delay for steps 1 & 2 to run and pause at step 3 (delay)
  await new Promise((r) => setTimeout(r, 300));

  const runState1 = await db.getWorkflowRun(ws.id, runId);
  console.log(`Run status after hitting delay step: "${runState1?.status}", current step: ${runState1?.current_step_index}, next_execution_at: ${runState1?.next_execution_at}`);
  if (runState1?.status !== 'waiting_delay') {
    throw new Error(`Expected run status to be "waiting_delay", got "${runState1?.status}"`);
  }

  // Wait 1.1s for timer to mature
  console.log('⏳ Waiting for durable timer to mature...');
  await new Promise((r) => setTimeout(r, 1200));

  // Run engine tick
  const resumedCount = await engine.tick();
  console.log(`✅ Scheduler Tick executed: Resumed ${resumedCount} matured workflow run(s)`);
  if (resumedCount < 1) {
    throw new Error('Scheduler tick should have resumed the waiting run');
  }

  // Verify run completion
  const completedRun = await db.getWorkflowRun(ws.id, runId);
  console.log(`Final Run Status: "${completedRun?.status}", completed_step_index: ${completedRun?.current_step_index}`);
  if (completedRun?.status !== 'completed') {
    throw new Error(`Expected workflow run to be completed, got status: "${completedRun?.status}", error: ${completedRun?.error_message}`);
  }

  // 6. Test Step-by-Step Execution Logs
  console.log('\n--- Test 4: Visual Step-by-Step Execution Logs ---');
  const stepLogs = await db.listWorkflowStepLogs(runId);
  console.log(`Logged ${stepLogs.length} step execution records:`);
  for (const log of stepLogs) {
    console.log(`  - Step ${log.step_index} [${log.action_type}]: status=${log.status} (duration=${log.duration_ms}ms)`);
  }
  if (stepLogs.length < 4) {
    throw new Error(`Expected at least 4 step execution logs, got ${stepLogs.length}`);
  }

  // Verify contact mutations from workflow
  const updatedContact = await db.getContact(ws.id, contact.id);
  console.log(`Updated Contact Status: "${updatedContact?.status}", Tags:`, updatedContact?.tags);
  if (updatedContact?.status !== 'contacted') {
    throw new Error(`Expected contact status to be updated to 'contacted', got "${updatedContact?.status}"`);
  }
  if (!updatedContact?.tags?.includes('vip_prospect')) {
    throw new Error(`Expected contact tags to include 'vip_prospect'`);
  }

  console.log('\n🎉 ALL PHASE 5 AUTOMATION ENGINE TESTS PASSED WITH 0 ERRORS!\n');
}

runPhase5Tests().catch((err) => {
  console.error('❌ Phase 5 Test Suite Failed:', err);
  process.exit(1);
});

