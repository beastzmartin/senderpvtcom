import crypto from 'crypto';
import { initDatabase, getDatabase } from '../db/database.js';
import { WalletService } from '../services/walletService.js';
import { AdvancedMarginEngine, MarginRuleV3, PromoCoupon } from '../services/marketplace/AdvancedMarginEngine.js';
import { MarketplacePricingService } from '../services/marketplace/MarketplacePricingService.js';
import { MarketplaceProductService } from '../services/marketplace/MarketplaceProductService.js';
import { MarketplaceJobService } from '../services/marketplace/MarketplaceJobService.js';
import { WhiteLabelSanitizer } from '../services/marketplace/WhiteLabelSanitizer.js';
import { CurrencyService } from '../services/CurrencyService.js';
import { getCrmDb } from '../crm/db/index.js';

async function runV3MasterVerification() {
  console.log('========================================================================');
  console.log('🚀 MASTER PROMPT v3 — WALLET PAYMENTS + ADVANCED MARGIN ENGINE + STUDIO');
  console.log('========================================================================\n');

  initDatabase();
  const db = getDatabase();

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, message: string) {
    totalTests++;
    if (!condition) {
      console.error(`❌ FAILED: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    } else {
      console.log(`   ✅ PASS: ${message}`);
      passedTests++;
    }
  }

  // Setup test user
  const testUserId = 'usr_v3_verify_' + Date.now();
  const testUsername = 'v3_tester_' + Date.now();
  db.prepare(`
    INSERT INTO users (id, name, username, password_hash, role)
    VALUES (?, ?, ?, 'hash_v3_test', 'user')
  `).run(testUserId, 'V3 Verification User', testUsername);

  // ---------------------------------------------------------------------------
  // SUITE 1: WALLET NATIVE LEDGER & SPEND LIMITS (PART A)
  // ---------------------------------------------------------------------------
  console.log('🧪 1. Testing Wallet Native Ledger, Available Balances & Spend Limits');

  const walletService = WalletService.getInstance();

  // 1.1 Initial balance & available balance (includes welcome credit ₹250)
  const initialWallet = walletService.getOrCreateWallet(testUserId);
  const startBal = initialWallet.balance;
  assert(startBal >= 0, `Initial wallet balance verified: ₹${startBal}`);
  assert(initialWallet.available_balance === startBal, `Initial available_balance matches balance (₹${startBal})`);

  // 1.2 Top-up wallet by 100
  walletService.topUp(testUserId, 100, 'Test initial credit');
  const w1 = walletService.getOrCreateWallet(testUserId);
  assert(w1.balance === Number((startBal + 100).toFixed(2)), `Wallet credited by 100 to ${w1.balance}`);
  assert(w1.available_balance === w1.balance, 'Available balance is balance - 0 reserved');

  // 1.3 Reserve funds (Hold) of 40
  const currentAvail = w1.available_balance;
  const holdRes = walletService.reserveFunds(testUserId, 40, 'Hold for extraction job #1');
  assert(holdRes.success === true, 'Successfully reserved 40 hold');
  const w2 = walletService.getOrCreateWallet(testUserId);
  assert(w2.balance === w1.balance, 'Total ledger balance remains identical during hold');
  assert(w2.reserved_balance === 40, 'Reserved balance is 40');
  assert(w2.available_balance === Number((currentAvail - 40).toFixed(2)), `Available balance strictly reduced by 40 (${w2.available_balance})`);

  // 1.4 Over-reservation attempt
  let overReserveThrew = false;
  try {
    walletService.reserveFunds(testUserId, w2.available_balance + 100, 'Exceed available');
  } catch (err) {
    overReserveThrew = true;
  }
  assert(overReserveThrew === true, 'Cannot reserve more than available balance (throws error)');

  // 1.5 Settle job with partial release ($25 actual cost out of $40 hold)
  const commitRes = walletService.commitReservation(testUserId, 25, holdRes.reservationId, 'Settle extraction job #1');
  assert(commitRes.success === true, 'Successfully committed 25 settlement and released remainder');
  const w3 = walletService.getOrCreateWallet(testUserId);
  assert(w3.balance === Number((w1.balance - 25).toFixed(2)), `Balance reduced only by actual spent 25 (now ${w3.balance})`);
  assert(w3.reserved_balance === 0, 'Reserved balance cleanly returned to 0');
  assert(w3.available_balance === w3.balance, 'Available balance restored');

  // 1.6 Release whole hold on job failure/cancellation
  const balBeforeHold2 = w3.balance;
  const hold2 = walletService.reserveFunds(testUserId, 30, 'Hold for job #2 (to cancel)');
  const wHold = walletService.getOrCreateWallet(testUserId);
  assert(wHold.available_balance === Number((balBeforeHold2 - 30).toFixed(2)), 'Available balance drops during hold #2');
  const relRes = walletService.releaseReservation(testUserId, 30, hold2.reservationId, 'Release cancelled hold');
  assert(relRes.success === true, 'Successfully released reservation #2');
  const wReleased = walletService.getOrCreateWallet(testUserId);
  assert(wReleased.balance === balBeforeHold2, 'Balance intact after release');
  assert(wReleased.reserved_balance === 0, 'Reserved balance cleared to 0');
  assert(wReleased.available_balance === balBeforeHold2, 'Available balance restored');

  // 1.7 Spend Limits (Per-job limit)
  walletService.setSpendLimits(testUserId, {
    perJob: 50,
    daily: 100,
    monthly: 500
  });

  const limitStatus = walletService.getSpendLimitStatus(testUserId);
  assert(limitStatus.perJobLimit === 50, 'Per-job limit set to 50');
  assert(limitStatus.dailyLimit === 100, 'Daily limit set to 100');

  // Job within limit (45 <= 50)
  const holdJobWithin = walletService.reserveFunds(testUserId, 45, 'Job within limit');
  assert(holdJobWithin.success === true, 'Job costing 45 is allowed under 50 per-job limit');
  walletService.releaseReservation(testUserId, 45, holdJobWithin.reservationId, 'Clean test hold');

  // Job exceeding limit (60 > 50)
  let spendLimitThrew = false;
  let spendLimitReason = '';
  try {
    walletService.reserveFunds(testUserId, 60, 'Job exceeding limit');
  } catch (err: any) {
    spendLimitThrew = true;
    spendLimitReason = err.message || '';
  }
  assert(spendLimitThrew === true, 'Job costing 60 is blocked by per-job limit (throws error)');
  assert(spendLimitReason.includes('Per-job spend limit'), `Reason specifies per-job limit (${spendLimitReason})`);

  // 1.8 Stale hold auto-reconciliation
  // Insert an orphaned hold in wallet_transactions linked to a finished job
  const dummyJobId = 'job_stale_' + Date.now();
  const orphanResId = 'res_orphan_' + Date.now();

  db.prepare(`
    INSERT INTO wallet_transactions (
      id, user_id, transaction_type, amount, currency, previous_balance, new_balance, reference_id, description, status, created_at
    ) VALUES (
      ?, ?, 'usage_reservation', 15.0, 'INR', 325.0, 325.0, ?, 'Orphaned pending hold', 'pending', datetime('now', '-2 days')
    )
  `).run(orphanResId, testUserId, dummyJobId);

  // Artificially inflate reserved_balance
  db.prepare('UPDATE user_wallets SET reserved_balance = 15 WHERE user_id = ?').run(testUserId);
  const wBeforeReconcile = walletService.getOrCreateWallet(testUserId);
  assert(wBeforeReconcile.reserved_balance === 15, 'Orphaned 15 hold in place');

  // Run reconciliation
  const reconResult = walletService.reconcileUserWallet(testUserId);
  assert(reconResult.repaired === true, 'Reconcile detected orphaned hold and repaired wallet');
  assert(reconResult.orphansReleased >= 1, 'At least 1 orphaned reservation released');
  const wAfterReconcile = walletService.getOrCreateWallet(testUserId);
  assert(wAfterReconcile.reserved_balance === 0, 'Reserved balance successfully reset to 0 active holds');

  // ---------------------------------------------------------------------------
  // SUITE 2: ADVANCED MARGIN & COSTING ENGINE (PART B)
  // ---------------------------------------------------------------------------
  console.log('\n🧪 2. Testing Advanced Margin Engine: 10-Step Hierarchy, Volume Tiers, Coupons & Hard Floors');

  // Clean test margin rules
  db.prepare("DELETE FROM marketplace_margin_rules_v3 WHERE target_value LIKE '%test%' OR name LIKE '%Test%'").run();

  // Create Product Definition
  const testProductSlug = 'test-b2b-leads-' + Date.now();
  const testProductDef = {
    slug: testProductSlug,
    display_name: 'Test B2B Leads Extractor',
    tagline: 'High quality business data',
    description_md: 'Verification product',
    category: 'business',
    input: {
      fields: [
        { key: 'query', label: 'Search Query', type: 'string', required: true, visible_to_user: true }
      ]
    },
    pricing: {
      model: 'PER_RESULT',
      provider_cost_usd: 0.01, // $0.01 raw provider cost
      default_sell_price_usd: 0.03, // 300% default
      currency_code: 'USD',
      min_charge_usd: 1.00
    }
  };

  // Rule 1: Product-specific rule with 50% margin and volume tiers
  AdvancedMarginEngine.saveRule({
    name: 'Test B2B Product Margin Rule',
    rule_type: 'PRODUCT',
    target_value: testProductSlug,
    priority: 100,
    cost_overhead_usd: 0.002, // $0.002 overhead per run
    fx_buffer_percent: 2.0,   // 2% FX buffer
    margin_type: 'PERCENTAGE',
    margin_value: 50.0,       // 50% margin
    min_margin_percent: 25.0, // Hard floor 25%
    min_sell_price: 0.02,     // Hard floor $0.02/unit
    volume_tiers_json: JSON.stringify([
      { min_volume: 1, max_volume: 100, discount_percent: 0 },
      { min_volume: 101, max_volume: 500, discount_percent: 10 },
      { min_volume: 501, discount_percent: 20 }
    ]),
    volume_tier_mode: 'MARGINAL',
    rounding_strategy: 'NONE',
    maker_user_id: testUserId,
    approval_status: 'APPROVED'
  });

  // 2.1 Low Volume Quote (50 items)
  const quote50 = AdvancedMarginEngine.resolveQuote({
    productDef: testProductDef as any,
    requestedItems: 50,
    currencyCode: 'USD'
  });

  assert(quote50.requestedItems === 50, 'Quote items = 50');
  assert(quote50.appliedRule?.ruleType === 'PRODUCT', 'Applied Product-specific margin rule');
  assert(quote50.loadedCostUsd > 0.01, `Loaded cost includes overhead & FX buffer ($${quote50.loadedCostUsd.toFixed(4)})`);
  assert(quote50.marginPercent >= 25, `Margin is above hard floor 25% (got ${quote50.marginPercent.toFixed(1)}%)`);
  assert(quote50.trace.length >= 5, `Trace recorded ${quote50.trace.length} waterfall calculation steps`);

  // 2.2 Volume Tier Discount (Marginal) - 600 items
  const quote600 = AdvancedMarginEngine.resolveQuote({
    productDef: testProductDef as any,
    requestedItems: 600,
    currencyCode: 'USD'
  });

  assert(quote600.unitPrice < quote50.unitPrice, `Volume tier discount lowered unit price ($${quote600.unitPrice.toFixed(4)} < $${quote50.unitPrice.toFixed(4)})`);
  assert(quote600.marginPercent >= 25, `Volume discount did not breach 25% hard margin floor (${quote600.marginPercent.toFixed(1)}%)`);

  // 2.3 Promo Coupon Application
  const testCouponCode = 'SAVE50_' + Date.now();
  AdvancedMarginEngine.saveCoupon({
    code: testCouponCode,
    discount_type: 'PERCENT',
    discount_value: 50.0, // 50% discount
    max_uses: 100,
    min_spend_usd: 1.0,
    is_active: true
  });

  const quoteWithCoupon = AdvancedMarginEngine.resolveQuote({
    productDef: testProductDef as any,
    requestedItems: 50,
    currencyCode: 'USD',
    couponCode: testCouponCode
  });

  assert(quoteWithCoupon.appliedCoupon?.code === testCouponCode, 'Coupon successfully applied');
  assert(quoteWithCoupon.appliedCoupon?.discountUsd > 0, `Discount calculated ($${quoteWithCoupon.appliedCoupon?.discountUsd.toFixed(2)})`);

  // 2.4 Hard Floor Protection (Min Margin Floor)
  // Ensure that even with 50% coupon, the margin never drops below min_margin_percent (25%)
  assert(quoteWithCoupon.marginPercent >= 25.0, `Hard floor prevents margin breach: final margin is ${quoteWithCoupon.marginPercent.toFixed(1)}% >= 25%`);
  assert(quoteWithCoupon.unitPrice >= 0.02, `Hard floor prevents price breach: unit price $${quoteWithCoupon.unitPrice.toFixed(4)} >= $${0.02}`);

  // 2.5 Psychological Rounding Strategy (.99)
  AdvancedMarginEngine.saveRule({
    name: 'Test Rounding Rule',
    rule_type: 'GLOBAL',
    target_value: '*',
    priority: 1,
    margin_type: 'PERCENTAGE',
    margin_value: 40.0,
    min_margin_percent: 20.0,
    rounding_strategy: 'ROUND_99',
    maker_user_id: testUserId,
    approval_status: 'APPROVED'
  });

  const productForRounding = {
    ...testProductDef,
    slug: 'slug-for-rounding-' + Date.now()
  };

  const quoteRounded = AdvancedMarginEngine.resolveQuote({
    productDef: productForRounding as any,
    requestedItems: 100,
    currencyCode: 'USD'
  });

  const totalStr = quoteRounded.totalSellPrice.toFixed(2);
  assert(totalStr.endsWith('.99'), `Psychological rounding rounded total price to .99 (got $${totalStr})`);

  // ---------------------------------------------------------------------------
  // SUITE 3: PRICING PARITY ACROSS SERVICES (PART B & STEP 0)
  // ---------------------------------------------------------------------------
  console.log('\n🧪 3. Testing Strict Pricing Parity Across Engine, PricingService, & Quotes');

  const pricingService = new MarketplacePricingService();
  const psQuote = await pricingService.getQuote(testProductSlug, 100, 'USD', testCouponCode);
  const meQuote = AdvancedMarginEngine.resolveQuote({
    productDef: testProductDef as any,
    requestedItems: 100,
    currencyCode: 'USD',
    couponCode: testCouponCode
  });

  assert(Math.abs(psQuote.estimated_total - meQuote.totalSellPrice) < 0.0001, `Parity check: PricingService total ($${psQuote.estimated_total}) === AdvancedMarginEngine total ($${meQuote.totalSellPrice})`);
  assert(Math.abs(psQuote.unit_price - meQuote.unitPrice) < 0.0001, `Parity check: PricingService unit price ($${psQuote.unit_price}) === AdvancedMarginEngine unit price ($${meQuote.unitPrice})`);

  // ---------------------------------------------------------------------------
  // SUITE 4: EXTRACTION STUDIO POWER FEATURES (PART D)
  // ---------------------------------------------------------------------------
  console.log('\n🧪 4. Testing Studio Power Features: 72h Signed Links, Schedules, and CRM Bridge');

  const jobService = new MarketplaceJobService();

  // Create completed extraction job with dummy extracted rows
  const testJobId = 'job_verify_' + Date.now();
  db.prepare(`
    INSERT INTO marketplace_jobs (
      id, user_id, product_slug, product_name, status, requested_items, items_delivered, charged_amount, hold_amount, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'COMPLETED', 3, 3, 2.50, 4.00, datetime('now'), datetime('now'))
  `).run(testJobId, testUserId, testProductSlug, testProductDef.display_name);

  // Insert extracted rows
  const sampleRows = [
    { name: 'Alice Smith', email: 'alice@acme.inc', phone: '+1-555-0101', company: 'Acme Corp', title: 'VP Growth', city: 'San Francisco' },
    { name: 'Bob Jones', email: 'bob@techcorp.io', phone: '+1-555-0102', company: 'TechCorp', title: 'Founder', city: 'Austin' },
    { name: 'Charlie Day', email: 'charlie@ventures.co', phone: '+1-555-0103', company: 'Ventures Co', title: 'Head of Sales', city: 'New York' }
  ];

  sampleRows.forEach((row, idx) => {
    db.prepare(`
      INSERT INTO marketplace_job_results (id, job_id, row_index, data_json, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(`res_${testJobId}_${idx}`, testJobId, idx, JSON.stringify(row));
  });

  // 4.1 Signed Expiring Share Link (72 Hours)
  const shareData = jobService.createShareLink(testJobId, testUserId, 72);
  assert(!!shareData.token, `Share token generated (${shareData.token})`);
  assert(shareData.shareUrl.startsWith('/shared/extraction/'), `Share URL is clean: ${shareData.shareUrl}`);

  // Retrieve public shared job results
  const sharedRetrieval = jobService.getSharedJob(shareData.token);
  assert(sharedRetrieval.job.product_name === testProductDef.display_name, 'Shared job title matches');
  assert(sharedRetrieval.results.length === 3, `Delivered ${sharedRetrieval.results.length} results via signed share`);
  assert(sharedRetrieval.results[0].email === 'alice@acme.inc', 'First record matches extracted item');

  // Verify view count increment
  const linkRow = db.prepare('SELECT views_count FROM marketplace_shared_links WHERE token = ?').get(shareData.token) as any;
  assert(linkRow.views_count >= 1, `View count accurately tracked (${linkRow.views_count})`);

  // 4.2 Recurring Scheduled Run Creation
  const scheduleId = 'sched_' + Date.now();
  db.prepare(`
    INSERT INTO marketplace_scheduled_runs (
      id, user_id, product_slug, name, cron_expression, input_json, requested_items, max_budget_usd, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, 'Weekly Tech Leads', '0 9 * * 1', '{"query":"fintech"}', 100, 10.0, 1, datetime('now'), datetime('now'))
  `).run(scheduleId, testUserId, testProductSlug);

  const schedRow = db.prepare('SELECT * FROM marketplace_scheduled_runs WHERE id = ?').get(scheduleId) as any;
  assert(schedRow.cron_expression === '0 9 * * 1', 'Cron expression saved correctly');
  assert(schedRow.is_active === 1, 'Schedule is active');

  // 4.3 Flow Extracted Results directly into CRM Contacts List
  const crmDb = getCrmDb();
  // Get or create workspace for user
  const ws = await crmDb.getOrCreateWorkspaceForUser(testUserId);
  assert(!!ws?.id, `CRM Workspace initialized (${ws.id})`);

  // Create CRM list
  const crmList = await crmDb.createList(ws.id, 'Data Extraction Qualified Leads');
  assert(!!crmList?.id, `CRM Target List created: ${crmList.name}`);

  // Trigger syncJobToCrm
  const syncResult = await jobService.syncJobToCrm(testJobId, testUserId, {
    workspaceId: ws.id,
    listId: crmList.id,
    dedupeRule: 'update'
  });

  assert(syncResult.inserted === 3, `CRM sync inserted 3 leads (got ${syncResult.inserted})`);
  assert(syncResult.total === 3, 'CRM sync processed all 3 records');

  // Verify contacts exist in CRM
  const listMembers = await crmDb.listContacts(ws.id, { listId: crmList.id });
  assert(listMembers.contacts.length === 3, `CRM List contains 3 verified contacts`);
  assert(listMembers.contacts.some(c => c.email === 'alice@acme.inc'), 'Alice Smith successfully stored as contact in CRM list');

  // ---------------------------------------------------------------------------
  // SUITE 5: ZERO PROVIDER BRANDING & WHITE-LABEL PURITY AUDIT
  // ---------------------------------------------------------------------------
  console.log('\n🧪 5. Testing Absolute White-Label Purity & Zero Upstream Brand Leaks');

  const bannedKeywords = ['apify', 'actor', 'dataset_id', 'actId', 'kbc.apify.com'];
  const testPayloadString = JSON.stringify({
    shared: sharedRetrieval,
    quote: quote50,
    psQuote
  }).toLowerCase();

  for (const word of bannedKeywords) {
    const leaked = testPayloadString.includes(word);
    assert(!leaked, `Audit: Customer payload contains zero occurrences of "${word}"`);
  }

  // Cleanup test user
  try {
    db.prepare('DELETE FROM users WHERE id = ?').run(testUserId);
    db.prepare('DELETE FROM user_wallets WHERE user_id = ?').run(testUserId);
    db.prepare('DELETE FROM marketplace_jobs WHERE id = ?').run(testJobId);
  } catch {}

  console.log('\n========================================================================');
  console.log(`🏆 ALL ${passedTests}/${totalTests} MASTER PROMPT v3 VERIFICATION TESTS PASSED!`);
  console.log('========================================================================\n');
}

runV3MasterVerification().catch((err) => {
  console.error('\n❌ MASTER PROMPT v3 VERIFICATION FAILED:', err);
  process.exit(1);
});
