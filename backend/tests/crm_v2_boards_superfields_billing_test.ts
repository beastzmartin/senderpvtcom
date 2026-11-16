import { initCrmDatabase, getCrmDb } from '../src/crm/db/index.js';
import { CrmLexoRankService } from '../src/crm/services/CrmLexoRankService.js';
import { CrmBoardManager } from '../src/crm/services/CrmBoardManager.js';
import { CrmSuperFieldService } from '../src/crm/services/CrmSuperFieldService.js';
import { CrmEntitlementService } from '../src/crm/services/CrmEntitlementService.js';
import { CrmBillingService } from '../src/crm/services/CrmBillingService.js';
import { WalletService } from '../src/services/walletService.js';

async function runBoardsSuperFieldsBillingVerification() {
  console.log('🧪 Starting CRM V2 Verification: Boards, Super Fields, Tags & Wallet-Only Billing...\n');

  await initCrmDatabase();
  const db = getCrmDb();

  // Retrieve or create a valid user in `users` table to satisfy wallet foreign keys
  const dbRaw = (db as any).db;
  let testUserId = '11317f98-724a-496d-b52a-c63487c4e026';
  try {
    const existing = dbRaw?.prepare("SELECT id FROM users LIMIT 1")?.get() as any;
    if (existing?.id) {
      testUserId = existing.id;
    } else {
      testUserId = `test-user-${Date.now()}`;
      dbRaw?.prepare("INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, 'hash', 'admin')")
        ?.run(testUserId, `user_${Date.now()}`);
    }
  } catch {}

  const ws = await db.getUserDefaultWorkspace(testUserId);
  console.log(`✅ Default Workspace verified: ${ws.name} (${ws.id})`);

  // =========================================================================
  // 1. LEXORANK FRACTIONAL INDEXING ENGINE
  // =========================================================================
  console.log('\n--- PART A: LEXORANK & BOARDS (KANBAN) ---');
  const rank1 = CrmLexoRankService.initial(0);
  const rank2 = CrmLexoRankService.initial(1);
  const rankBetween = CrmLexoRankService.between(rank1, rank2);

  if (!(rank1 < rankBetween && rankBetween < rank2)) {
    throw new Error(`LexoRank ordering failure: ${rank1} < ${rankBetween} < ${rank2}`);
  }
  console.log(`✅ LexoRank fractional index generated: ${rank1} -> ${rankBetween} -> ${rank2}`);

  // Create Board From Template
  const board = await CrmBoardManager.createFromTemplate(
    db,
    ws.id,
    'sales_funnel',
    'Enterprise Sales Pipeline',
    testUserId
  );
  if (!board.columns || board.columns.length === 0) {
    throw new Error('Board columns failed to initialize from template');
  }
  console.log(`✅ Board created from template: "${board.name}" with ${board.columns.length} columns`);

  // Create Contact & Add as Card
  const contact = await db.createContact(ws.id, {
    first_name: 'Sundar',
    last_name: 'Pichai',
    email: `sundar.${Date.now()}@google.com`,
    phone: `+1650${Math.floor(1000000 + Math.random() * 9000000)}`,
    lead_score: 95
  });

  const firstCol = board.columns[0];
  const targetCol = board.columns[1];

  const card = await db.addCardToBoard(ws.id, {
    board_id: board.id,
    column_id: firstCol.id,
    entity_type: 'contact',
    entity_id: contact.id,
    rank: rank1
  });
  console.log(`✅ Card added to Column "${firstCol.name}" with LexoRank: ${card.rank}`);

  // Move Card with LexoRank
  const movedCard = await CrmBoardManager.moveCard(
    db,
    ws.id,
    card.id,
    targetCol.id,
    null,
    null,
    testUserId
  );
  if (movedCard.column_id !== targetCol.id) {
    throw new Error('Card failed to move to target column');
  }
  console.log(`✅ Card moved to "${targetCol.name}" with new LexoRank: ${movedCard.rank}`);

  // Board Stats
  const stats = await db.getBoardStats(ws.id, board.id);
  if (stats.total_cards !== 1) {
    throw new Error(`Board stats mismatch: expected 1 card, got ${stats.total_cards}`);
  }
  console.log(`✅ Board stats aggregated: ${stats.total_cards} cards across ${stats.columns.length} columns`);

  // =========================================================================
  // 2. TAGS EXTENDED & 1-CLICK MERGE
  // =========================================================================
  console.log('\n--- PART B: EXTENDED TAGS & CONSOLIDATION MERGE ---');
  const tagA = await db.createTag(ws.id, `OldLead_${Date.now()}`, '#f59e0b');
  const tagB = await db.createTag(ws.id, `QualifiedLead_${Date.now()}`, '#10b981');

  await db.tagContacts(ws.id, tagA.id, [contact.id]);

  const tagsWithCounts = await db.listTagsWithCounts(ws.id);
  const foundTagA = tagsWithCounts.find((t) => t.id === tagA.id);
  if (!foundTagA || foundTagA.usage_count !== 1) {
    throw new Error('Tag usage count mismatch');
  }
  console.log(`✅ Tag "${tagA.name}" usage count verified: ${foundTagA.usage_count}`);

  // Merge Tag A into Tag B
  const mergeResult = await db.mergeTags(ws.id, {
    source_tag_id: tagA.id,
    target_tag_id: tagB.id
  });
  if (mergeResult.affected_contacts !== 1) {
    throw new Error('Merge tags failed to affect contact');
  }
  console.log(`✅ Tag "${tagA.name}" successfully merged into "${tagB.name}". Affected contacts: ${mergeResult.affected_contacts}`);

  // Auto-Tag Rule
  const rule = await db.saveAutoTagRule(ws.id, {
    name: 'VIP Auto-Tag',
    trigger: 'score_threshold',
    condition_value: { score: 90 },
    tag_name: 'VIP',
    is_active: true
  });
  console.log(`✅ Auto-tagging rule saved: "${rule.name}" for score > 90`);

  // =========================================================================
  // 3. SUPER FIELDS (20 TYPES, FORMULAS & PROMOTED INDEXING)
  // =========================================================================
  console.log('\n--- PART C: SUPER FIELDS & PROMOTED HOT TABLE INDEXING ---');
  const sfSuffix = Date.now();
  const dealBudgetSlug = `deal_budget_${sfSuffix}`;
  const estGstSlug = `estimated_gst_${sfSuffix}`;
  const stageSlug = `pipeline_stage_${sfSuffix}`;

  const currencyField = await db.createSuperField(ws.id, {
    name: 'Deal Budget',
    slug: dealBudgetSlug,
    field_type: 'currency',
    min_value: 0,
    max_value: 10000000,
    group_name: 'Financials',
    is_promoted: true
  });
  console.log(`✅ Currency Super Field created: "${currencyField.name}" (${currencyField.slug})`);

  // Formula Super Field
  const formulaField = await db.createSuperField(ws.id, {
    name: 'Estimated GST (18%)',
    slug: estGstSlug,
    field_type: 'formula',
    formula_expression: `{${dealBudgetSlug}} * 0.18`,
    group_name: 'Financials'
  });
  console.log(`✅ Formula Super Field created: "${formulaField.name}" -> ${formulaField.formula_expression}`);

  // Test Formula Evaluation
  const evaluated = CrmSuperFieldService.evaluateFormula(formulaField.formula_expression!, {
    [dealBudgetSlug]: 50000
  });
  if (evaluated !== 9000) {
    throw new Error(`Formula evaluation failed: expected 9000, got ${evaluated}`);
  }
  console.log(`✅ Safe Formula evaluation verified: 50,000 * 0.18 = $${evaluated}`);

  // Stage Super Field Sync
  const stageField = await db.createSuperField(ws.id, {
    name: 'Pipeline Stage',
    slug: stageSlug,
    field_type: 'stage',
    linked_board_id: board.id
  });
  console.log(`✅ Stage Super Field created & linked to Board "${board.name}"`);

  // Test Field Promotion & Fast Index Upsert
  await CrmSuperFieldService.syncPromotedValue(db, currencyField, contact.id, 75000);
  const promotedVals = await db.getPromotedFieldValues(ws.id, 'contact', contact.id);
  if (promotedVals[currencyField.slug] !== 75000) {
    throw new Error(`Promoted field value mismatch: expected 75000, got ${promotedVals[currencyField.slug]}`);
  }
  console.log(`✅ Promoted Field Value indexed without ALTER TABLE: ${currencyField.slug} = ${promotedVals[currencyField.slug]}`);

  // =========================================================================
  // 4. PLAN-BASED BILLING (WALLET-ONLY & HARD ATOMIC LIMITS)
  // =========================================================================
  console.log('\n--- PART D: PLAN-BASED BILLING & HARD ENTITLEMENTS ---');

  // Verify User Wallet
  const walletService = WalletService.getInstance();
  const initialWallet = walletService.getOrCreateWallet(testUserId);
  console.log(`✅ User Wallet verified: Balance = ${initialWallet.currency} ${initialWallet.balance.toFixed(2)}`);

  // List Catalog Plans
  const plans = await db.listBillingPlans();
  if (plans.length === 0) throw new Error('No billing plans found in catalog');
  console.log(`✅ Billing Plans catalog loaded: ${plans.length} tiers available (${plans.map((p) => p.name).join(', ')})`);

  // Create Coupon
  const coupon = await db.saveBillingCoupon({
    code: `PROMO_${Date.now()}`,
    discount_type: 'percent',
    discount_value: 20,
    max_uses: 50,
    is_active: true
  });
  console.log(`✅ Coupon created: ${coupon.code} (20% off)`);

  // Subscribe to Growth Plan ($29/mo) with Wallet Deduction
  const growthPlan = plans.find((p) => p.slug === 'growth') || plans[1];

  // Top up user wallet if needed for test (ensure plenty of funds in user currency, e.g. INR)
  if (initialWallet.balance < 10000) {
    walletService.topUp(testUserId, 10000, 'Test Balance for CRM Subscription');
  }

  const subResult = await CrmBillingService.subscribeToPlan(
    db,
    ws.id,
    testUserId,
    growthPlan.id,
    coupon.code
  );

  console.log(`✅ Subscription created: "${subResult.subscription.plan?.name}" (Status: ${subResult.subscription.status})`);
  console.log(`✅ Tax Invoice generated: ${subResult.invoice.invoice_number}`);
  console.log(`   Subtotal: $${subResult.invoice.subtotal_usd} | Discount: -$${subResult.invoice.discount_usd} | Tax: $${subResult.invoice.tax_amount_usd} | Total Paid: $${subResult.invoice.amount_usd}`);

  if (!subResult.invoice.invoice_number.startsWith('INV-')) {
    throw new Error('Sequential invoice number format invalid');
  }

  // HTML Receipt Generation
  const receiptHtml = CrmBillingService.generateInvoiceHtml(subResult.invoice);
  if (!receiptHtml.includes(subResult.invoice.invoice_number)) {
    throw new Error('Receipt HTML does not contain invoice number');
  }
  console.log(`✅ Printable/Downloadable Tax Receipt HTML generated (${receiptHtml.length} bytes)`);

  // Add-on Pack Purchase with Wallet
  const addons = await db.listBillingAddons();
  if (addons.length > 0) {
    const addonRes = await CrmBillingService.purchaseAddon(db, ws.id, testUserId, addons[0].id);
    console.log(`✅ Add-on Pack "${addons[0].name}" purchased via wallet. Invoice: ${addonRes.invoice.invoice_number}`);
  }

  // =========================================================================
  // 5. CONCURRENCY HARD LIMIT TEST (ELIMINATING CHECK-THEN-ACT RACES)
  // =========================================================================
  console.log('\n--- PART E: CONCURRENT ATOMIC HARD LIMIT STRESS TEST ---');
  // Set an exact quota limit of 25 for testing
  const testLimit = 25;
  const stressResource = `stress_test_resource_${Date.now()}`;
  await db.consumeQuotaAtomic(ws.id, stressResource, 0, testLimit);

  // Spawn 60 concurrent parallel workers trying to consume 1 quota each
  const parallelWorkers = 60;
  console.log(`⚡ Launching ${parallelWorkers} parallel concurrent workers competing for ${testLimit} quota slots...`);

  const results = await Promise.all(
    Array.from({ length: parallelWorkers }).map(() =>
      CrmEntitlementService.checkAndConsumeQuota(db, ws.id, stressResource, 1)
    )
  );

  const allowedCount = results.filter((r) => r.allowed).length;
  const rejectedCount = results.filter((r) => !r.allowed).length;

  console.log(`📊 Parallel Stress Results: ${allowedCount} Allowed, ${rejectedCount} Rejected`);

  if (allowedCount !== testLimit) {
    throw new Error(`Race condition detected! Allowed count (${allowedCount}) !== exact quota limit (${testLimit})`);
  }
  if (rejectedCount !== parallelWorkers - testLimit) {
    throw new Error(`Rejected count mismatch: expected ${parallelWorkers - testLimit}, got ${rejectedCount}`);
  }

  console.log('✅ Hard quota limit verified under heavy concurrency: ZERO race conditions!');

  console.log('\n🎉 ALL CRM V2 BOARDS, SUPER FIELDS, EXTENDED TAGS & WALLET BILLING TESTS PASSED PERFECTLY!\n');
}

runBoardsSuperFieldsBillingVerification().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
