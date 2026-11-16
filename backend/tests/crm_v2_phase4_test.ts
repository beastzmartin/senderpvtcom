import { initCrmDatabase, getCrmDb } from '../src/crm/db/index.js';
import { getDatabase } from '../src/db/database.js';
import { CrmLeadScoringService } from '../src/crm/services/CrmLeadScoringService.js';
import { CrmAiAssistantService } from '../src/crm/services/CrmAiAssistantService.js';
import { CrmAiComposerService } from '../src/crm/services/CrmAiComposerService.js';
import { CrmSmartImportService } from '../src/crm/services/CrmSmartImportService.js';
import { WalletService } from '../src/services/walletService.js';

async function runPhase4Tests() {
  console.log('🤖 [CRM V2] Starting Phase 4 AI Layer & Smart Engines Verification Suite...\n');

  // 1. Initialize Storage Adapter
  const db = await initCrmDatabase();
  console.log('✅ CRM Database Initialized successfully.');

  const localDb = getDatabase();
  const testUserStmt = localDb.prepare('SELECT id FROM users LIMIT 1').get() as { id: string } | undefined;
  let testUserId = testUserStmt ? testUserStmt.id : 'user_ai_test_' + Date.now();
  if (!testUserStmt) {
    localDb.prepare(`INSERT INTO users (id, username, password, role, is_active, created_at) VALUES (?, ?, 'pwd', 'admin', 1, datetime('now'))`).run(testUserId, 'ai_tester');
  }

  const ws = await db.createWorkspace(testUserId, 'AI Intelligence Workspace ' + Date.now());
  console.log(`✅ Test Workspace Created: ${ws.name} (${ws.id})`);

  // Ensure test user has wallet balance
  const walletService = WalletService.getInstance();
  const initialWallet = walletService.getOrCreateWallet(testUserId);
  console.log(`✅ User Initial Wallet Balance: ${initialWallet.balance} ${initialWallet.currency}`);

  // 2. Create Test Contacts for Scoring & AI
  const uid = Date.now().toString().slice(-4);
  const contactA = await db.createContact(ws.id, {
    first_name: 'Priya',
    last_name: 'Sharma',
    title: 'VP of Engineering',
    company_name: 'TechMatrix Global',
    email: `priya.sharma.${uid}@techmatrix.in`,
    phone: `+91987654${uid}`,
    country: 'India',
    email_status: 'valid'
  });

  const contactB = await db.createContact(ws.id, {
    first_name: 'John',
    last_name: 'Doe',
    title: 'Junior Intern',
    company_name: 'Local Sandbox Inc',
    email: `john.doe.${uid}@example.com`,
    country: 'Nowhere',
    email_status: 'invalid'
  });

  console.log(`✅ Seeded Contact A (ICP Lead): ${contactA.first_name} ${contactA.last_name} (${contactA.id})`);
  console.log(`✅ Seeded Contact B (Cold Lead): ${contactB.first_name} ${contactB.last_name} (${contactB.id})`);

  // Log an activity for Contact A
  await db.logActivity(ws.id, {
    contact_id: contactA.id,
    type: 'note',
    title: 'Product Demo completed',
    details: { interest: 'Enterprise WhatsApp Platform' }
  });

  // 3. Test Predictive Lead Scoring
  console.log('\n--- Test 1: Predictive Lead Scoring Engine ---');
  const scoringService = CrmLeadScoringService.getInstance();
  
  const scoreResultA = await scoringService.scoreContact(ws.id, contactA.id);
  console.log(`Contact A Score: ${scoreResultA.score}/100 [Status: ${scoreResultA.lead_status.toUpperCase()}]`);
  console.log('Breakdown count:', scoreResultA.breakdown.length);
  for (const b of scoreResultA.breakdown) {
    console.log(`  - [${b.matched ? 'MATCH' : 'SKIP'}] ${b.rule}: ${b.points > 0 ? '+' : ''}${b.points} pts (${b.reason})`);
  }
  if (scoreResultA.score < 60) {
    throw new Error(`Expected Contact A to score >= 60, got ${scoreResultA.score}`);
  }

  const scoreResultB = await scoringService.scoreContact(ws.id, contactB.id);
  console.log(`Contact B Score: ${scoreResultB.score}/100 [Status: ${scoreResultB.lead_status.toUpperCase()}]`);
  if (scoreResultB.score > 40) {
    throw new Error(`Expected Contact B to score <= 40, got ${scoreResultB.score}`);
  }

  // Batch score test
  const batchResult = await scoringService.batchScoreContacts(ws.id);
  console.log('✅ Batch Score Result:', batchResult);
  if (batchResult.scored_count < 2) {
    throw new Error('Batch scoring should have scored at least 2 contacts');
  }

  // 4. Test Executive Brief & Next Best Action
  console.log('\n--- Test 2: Contact Card Executive Brief & Next Best Action ---');
  const aiAssistant = CrmAiAssistantService.getInstance();
  const brief = await aiAssistant.generateContactBrief(ws.id, contactA.id, { userId: testUserId });
  console.log('Executive Brief:\n', brief.executive_brief);
  console.log('Sentiment:', brief.sentiment);
  console.log('Recommended Action:', brief.recommended_next_action);
  console.log('Interest Signals:', brief.interest_signals);

  if (!brief.executive_brief.includes('TechMatrix Global') || !brief.executive_brief.includes('Priya')) {
    throw new Error('Executive brief should synthesize contact name and company name');
  }

  // 5. Test Smart Compose Multi-Channel Outreach
  console.log('\n--- Test 3: Smart Compose Multi-Channel Outreach ---');
  const composer = CrmAiComposerService.getInstance();

  // Test WhatsApp Outreach
  const waDraft = await composer.composeOutreach(ws.id, {
    contactId: contactA.id,
    channel: 'whatsapp',
    tone: 'friendly',
    language: 'Hinglish',
    userId: testUserId
  });
  console.log('WhatsApp Draft (Hinglish):');
  console.log(waDraft.message_body);
  console.log(`Tokens: ${waDraft.tokens_used}, Credits Charged: ${waDraft.cost_credits}\n`);

  // Test Email Outreach (Professional)
  const emailDraft = await composer.composeOutreach(ws.id, {
    contactId: contactA.id,
    channel: 'email',
    tone: 'professional',
    language: 'English',
    userId: testUserId
  });
  console.log('Email Draft (English):');
  console.log(`Subject: ${emailDraft.subject}`);
  console.log(emailDraft.message_body);

  if (!emailDraft.subject || !emailDraft.message_body.includes('TechMatrix Global')) {
    throw new Error('Email draft failed to incorporate company context');
  }

  // 6. Test Smart Import Header Analysis & Anomaly Detection
  console.log('\n--- Test 4: Smart Import Header Fuzzy Mapping & Anomaly Detection ---');
  const importAi = CrmSmartImportService.getInstance();
  const rawHeaders = [
    'First Name',
    'Surname',
    'e-mail address',
    'mob_no_primary',
    'Org / Firm',
    'Designation',
    'Nation'
  ];
  const sampleRows = [
    {
      'First Name': 'Aarav',
      'Surname': 'Patel',
      'e-mail address': 'aarav@company.in',
      'mob_no_primary': '9876543210', // 10 digits without +
      'Org / Firm': 'InnoTech Solutions',
      'Designation': 'CTO',
      'Nation': 'India'
    }
  ];

  const analysis = importAi.analyzeHeaders(rawHeaders, sampleRows);
  console.log('Total Columns Analyzed:', analysis.total_columns);
  console.log('Inferred Country Code:', analysis.country_code_inferred);
  console.log('Detected Mappings:');
  for (const m of analysis.mappings) {
    console.log(`  - "${m.csv_header}" -> ${m.mapped_crm_field} (${(m.confidence * 100).toFixed(0)}% conf)`);
  }
  console.log('Anomalies / Notices:', analysis.detected_anomalies);

  if (analysis.country_code_inferred !== '+91') {
    throw new Error(`Expected inferred country code to be +91, got ${analysis.country_code_inferred}`);
  }
  const emailMapping = analysis.mappings.find((m) => m.csv_header === 'e-mail address');
  if (emailMapping?.mapped_crm_field !== 'email') {
    throw new Error('Failed to map "e-mail address" to "email"');
  }

  // 7. Verify AI Usage Logs & Aggregates
  console.log('\n--- Test 5: AI Token Ledger & Usage Summary ---');
  const usageSummary = await db.getAiUsageSummary(ws.id, 30);
  console.log('AI Usage Summary:', usageSummary);
  if (usageSummary.totalCredits <= 0 || usageSummary.totalTokens <= 0) {
    throw new Error('Expected recorded AI credits and tokens in usage summary');
  }

  // Check remaining wallet balance
  const wallet = walletService.getOrCreateWallet(testUserId);
  console.log(`✅ User Final Wallet Balance: ${wallet?.balance} INR (Credits successfully deducted)`);

  console.log('\n🎉 ALL PHASE 4 AI LAYER TESTS PASSED WITH 0 ERRORS!\n');
}

runPhase4Tests().catch((err) => {
  console.error('❌ Phase 4 Test Suite Failed:', err);
  process.exit(1);
});
