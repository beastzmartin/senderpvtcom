import assert from 'node:assert';
import { initDatabase, getDatabase } from '../src/db/database.js';
import { WhiteLabelSanitizer } from '../src/services/marketplace/WhiteLabelSanitizer.js';
import { MarketplacePricingService } from '../src/services/marketplace/MarketplacePricingService.js';
import { MarketplaceChargingService } from '../src/services/marketplace/MarketplaceChargingService.js';
import { ProviderRegistry } from '../src/services/marketplace/provider/ProviderRegistry.js';
import { MockProviderAdapter } from '../src/services/marketplace/provider/MockProviderAdapter.js';
import { MarketplaceProductService } from '../src/services/marketplace/MarketplaceProductService.js';
import { MarketplaceJobService } from '../src/services/marketplace/MarketplaceJobService.js';
import { MarketplaceJobWorker } from '../src/services/marketplace/MarketplaceJobWorker.js';
import { WalletService } from '../src/services/walletService.js';
import { CurrencyService } from '../src/services/currencyService.js';
import { ProductDefinition } from '../src/types/marketplace.js';

async function runMarketplaceTests() {
  console.log('====================================================');
  console.log('🚀 Starting Data Extraction Marketplace Test Suite');
  console.log('====================================================\n');

  // 1. Initialize Database
  console.log('📦 1. Initializing Database and Verifying Tables...');
  const db = initDatabase();
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as Array<{ name: string }>;
  const tableNames = tables.map(t => t.name);

  const requiredTables = [
    'extraction_marketplace_products',
    'product_pricing_history',
    'marketplace_jobs',
    'marketplace_job_results',
    'marketplace_provider_events',
    'marketplace_settings'
  ];

  for (const table of requiredTables) {
    assert(tableNames.includes(table), `Table ${table} should exist in DB`);
    console.log(`   ✓ Table ${table} verified`);
  }

  // 2. White-Label Sanitizer Leak Audit
  console.log('\n🛡️ 2. Running White-Label Leak Audit...');
  const leakedString = 'Executing on https://api.apify.com/v2/acts/apify~web-scraper with apify-client and actor token';
  const cleanedString = WhiteLabelSanitizer.cleanText(leakedString);
  console.log(`   Original: "${leakedString}"`);
  console.log(`   Cleaned:  "${cleanedString}"`);
  
  assert(!cleanedString.toLowerCase().includes('apify'), 'Cleaned string must not contain "apify"');
  assert(!cleanedString.toLowerCase().includes('actor'), 'Cleaned string must not contain "actor"');
  assert(!cleanedString.includes('api.apify.com'), 'Cleaned string must not contain "api.apify.com"');

  const dirtyPayload = {
    provider_name: 'apify',
    endpoint: 'https://api.apify.com/v2/actor/run',
    actorId: 'compass~crawler',
    details: {
      message: 'Actor failed on apify servers',
      apifyDatasetId: 'ds_12345'
    }
  };
  const sanitizedPayload = WhiteLabelSanitizer.cleanObject(dirtyPayload);
  const serialized = JSON.stringify(sanitizedPayload);
  assert(!serialized.toLowerCase().includes('apify'), 'Sanitized JSON must not contain "apify"');
  assert(!serialized.toLowerCase().includes('actor'), 'Sanitized JSON must not contain "actor"');
  console.log('   ✓ Payload sanitized and purged of all external provider mentions');

  // Customer Product Definition sanitization
  const testProduct: ProductDefinition = {
    slug: 'test-product',
    display_name: 'Lead Extractor',
    tagline: 'Fast leads',
    description_md: 'Extract leads reliably',
    category: 'Leads',
    icon: 'briefcase',
    status: 'active',
    provider: {
      type: 'apify',
      actor_id: 'secret-username~secret-actor',
      build: 'latest'
    },
    input: {
      fields: [
        {
          key: 'query',
          provider_key: 'searchQuery',
          label: 'Search Query',
          help: 'Enter terms',
          type: 'text',
          required: true,
          default: '',
          options: [],
          min: null,
          max: null,
          visible_to_user: true
        }
      ],
      static_overrides: { secret_param: 123 },
      hidden_defaults: { api_key: 'topsecret' }
    },
    limits: {
      min_items: 1,
      max_items_per_run: 500,
      max_concurrent_runs_per_user: 2,
      timeout_secs: 3600,
      memory_mb: 1024
    },
    pricing: {
      mode: 'per_item',
      provider_cost_reference: {
        model: 'pay_per_result',
        usd_per_1000_items: 5,
        usd_per_run_start: 0,
        notes: ''
      },
      sell: {
        per_1000_items: 800,
        per_run_flat: 0
      },
      margin: { type: 'percent', value: 50 },
      min_charge: 50
    },
    access: {
      requires_subscription: false,
      allowed_plan_slugs: []
    },
    output: {
      item_mapping: [{ from: 'title', to: 'name', label: 'Company Name', type: 'string', hidden: false }],
      drop_fields: ['debug_info'],
      preview_columns: ['name'],
      export_formats: ['csv', 'json'],
      sanitize: {
        strip_provider_urls: true,
        strip_emails: false,
        strip_phones: false,
        custom_regex_remove: []
      }
    }
  };

  const customerView = WhiteLabelSanitizer.cleanCustomerProduct(testProduct);
  assert(!('provider' in customerView), 'Customer product view must NOT contain provider credentials/details');
  assert(!('static_overrides' in (customerView.input || {})), 'Customer product view must NOT expose static_overrides');
  console.log('   ✓ Customer product view confirmed completely white-labeled');

  // 3. Pricing Engine Calculations
  console.log('\n💰 3. Testing Pricing Calculation Engine...');
  const pricingService = MarketplacePricingService.getInstance();

  // Test per_item pricing with min_charge
  const est1 = pricingService.calculateEstimatedPrice(testProduct, 10); // 10 items @ 800/1000 = 8, min_charge = 50
  console.log(`   Estimated for 10 items (800/1000 with min 50): ${est1.sellPrice} ${est1.currency}`);
  assert.strictEqual(est1.sellPrice, 50, 'Should enforce minimum charge of 50');

  const est2 = pricingService.calculateEstimatedPrice(testProduct, 100); // 100 items @ 800/1000 = 80
  console.log(`   Estimated for 100 items: ${est2.sellPrice} ${est2.currency}`);
  assert.strictEqual(est2.sellPrice, 80, '100 items at 800/1000 should cost 80');

  // Test per_run pricing
  const perRunProduct: ProductDefinition = {
    ...testProduct,
    pricing: {
      ...testProduct.pricing,
      mode: 'per_run',
      sell: { per_1000_items: 0, per_run_flat: 150 },
      min_charge: 0
    }
  };
  const estRun = pricingService.calculateEstimatedPrice(perRunProduct, 500);
  console.log(`   Estimated for per_run product (flat 150): ${estRun.sellPrice} ${estRun.currency}`);
  assert.strictEqual(estRun.sellPrice, 150, 'Per run product should charge flat 150');

  // Test per_item_plus_run pricing
  const hybridProduct: ProductDefinition = {
    ...testProduct,
    pricing: {
      ...testProduct.pricing,
      mode: 'per_item_plus_run',
      sell: { per_1000_items: 200, per_run_flat: 100 },
      min_charge: 0
    }
  };
  const estHybrid = pricingService.calculateEstimatedPrice(hybridProduct, 500); // 100 flat + (500/1000)*200 = 200
  console.log(`   Estimated for hybrid product (100 flat + 500*0.2 = 200): ${estHybrid.sellPrice} ${estHybrid.currency}`);
  assert.strictEqual(estHybrid.sellPrice, 200, 'Hybrid product should charge run_flat + item cost');

  // Test Margin & Currency Conversion
  const suggestedPrice = pricingService.calculateSuggestedSellPrice(10, 'percent', 40); // $10 + 40% margin
  console.log(`   Suggested Sell Price ($10 USD with 40% margin): ${suggestedPrice} INR`);
  assert(suggestedPrice > 0, 'Suggested sell price must be positive');

  const previewTiers = pricingService.generatePricePreview(testProduct);
  console.log(`   Generated ${previewTiers.length} preview tiers for product`);
  assert.strictEqual(previewTiers.length, 5, 'Should generate 5 preview tiers');
  console.log('   ✓ Pricing calculations verified');

  // 4. Provider Registry and Mock Adapter
  console.log('\n🔌 4. Testing Provider Registry & Mock Adapter...');
  const registry = ProviderRegistry.getInstance();
  const mockAdapter = registry.get('mock');
  assert(mockAdapter instanceof MockProviderAdapter, 'Mock adapter should be registered');
  console.log('   ✓ Mock adapter loaded from registry');

  // Run a mock extraction
  const mockRun = await mockAdapter.startRun(
    'mock-actor',
    { location: 'San Francisco', query: 'Tech Startups' },
    { maxItems: 5, timeoutSecs: 30, memoryMbytes: 512 }
  );
  console.log(`   ✓ Mock run started: Run ID = ${mockRun.runId}, Status = ${mockRun.status}`);
  assert(mockRun.runId, 'Mock run should have an ID');

  const pollStatus = await mockAdapter.getRun(mockRun.runId);
  assert.strictEqual(pollStatus.status, 'SUCCEEDED', 'Mock run should complete immediately');

  const datasetItems = await mockAdapter.fetchResults(mockRun.datasetId || '', { limit: 10 });
  console.log(`   ✓ Mock dataset fetched ${datasetItems.items.length} items`);
  assert.strictEqual(datasetItems.items.length, 5, 'Should return exactly 5 mock items');
  assert(datasetItems.items[0].companyName, 'Mock item should have companyName');

  // 5. Wallet Lifecycle & Job Execution Flow with Mock Provider
  console.log('\n💳 5. Testing End-to-End Extraction Job & Atomic Wallet Flow...');
  const walletService = WalletService.getInstance();
  const productService = MarketplaceProductService.getInstance();
  const jobService = MarketplaceJobService.getInstance();
  const worker = MarketplaceJobWorker.getInstance();

  // Create or get a test user
  const testUserStmt = db.prepare(`SELECT id, username FROM users LIMIT 1`).get() as { id: string; username: string } | undefined;
  let testUserId = testUserStmt ? testUserStmt.id : 'test-user-marketplace';

  if (!testUserStmt) {
    db.prepare(`
      INSERT INTO users (id, username, password, role, is_active, created_at)
      VALUES (?, ?, 'hash', 'customer', 1, CURRENT_TIMESTAMP)
    `).run(testUserId, 'testcustomer');
  }

  // Ensure test user has a clean 1000 INR balance with 0 reservations
  walletService.getOrCreateWallet(testUserId);
  db.prepare(`DELETE FROM marketplace_job_results WHERE job_id IN (SELECT id FROM marketplace_jobs WHERE user_id = ?)`).run(testUserId);
  db.prepare(`DELETE FROM marketplace_jobs WHERE user_id = ?`).run(testUserId);
  db.prepare(`UPDATE user_wallets SET balance = 1000, reserved_balance = 0 WHERE user_id = ?`).run(testUserId);
  const balBefore = walletService.getOrCreateWallet(testUserId).balance;
  console.log(`   User initial wallet balance: ${balBefore} INR`);

  // Retrieve seeded demo product
  const demoProductDef = productService.getProductBySlug('demo-b2b-lead-extractor');
  assert(demoProductDef, 'Demo B2B Lead Extractor must be seeded in DB');
  console.log(`   ✓ Demo product retrieved: "${demoProductDef.display_name}"`);

  // Step A: Create Job (Reserves funds atomically in wallet)
  console.log('   Creating job for 10 items...');
  const job = await jobService.createJob(
    testUserId,
    demoProductDef.slug,
    {
      search_query: 'SaaS Tech Startups',
      location: 'Austin, TX',
      require_email: true
    },
    10
  );
  assert(job.id, 'Job should be created');
  assert.strictEqual(job.status, 'QUEUED', 'Initial job status should be QUEUED');
  console.log(`   ✓ Job created: ID = ${job.id}, Status = ${job.status}, Reserved = ${job.reserved_amount} INR`);

  const walletDuringHold = walletService.getOrCreateWallet(testUserId);
  const availableDuringHold = walletDuringHold.balance - walletDuringHold.reserved_balance;
  assert.strictEqual(availableDuringHold, balBefore - job.reserved_amount, 'Wallet available balance must decrease by reserved amount');
  assert.strictEqual(walletDuringHold.reserved_balance, job.reserved_amount, 'Reserved balance must reflect the held amount');

  // Step B: Worker Processes Job (Runs mock adapter, fetches items, sanitizes & settles wallet)
  console.log('   ⚙️ Processing job through worker...');
  await worker.processJob(job.id);

  const finishedJob = jobService.getJobById(job.id);
  assert(finishedJob, 'Finished job should exist');
  assert.strictEqual(finishedJob.status, 'COMPLETED', 'Job status should be COMPLETED');
  assert(finishedJob.items_delivered > 0, 'Extracted items should be > 0');
  console.log(`   ✓ Job completed: Delivered ${finishedJob.items_delivered} items, Charged = ${finishedJob.charged_amount} INR`);

  const walletAfterComplete = walletService.getOrCreateWallet(testUserId);
  assert.strictEqual(walletAfterComplete.reserved_balance, 0, 'Reserved balance must be cleared to 0 after settlement');
  assert.strictEqual(walletAfterComplete.balance, balBefore - finishedJob.charged_amount, 'Final balance should equal initial minus actual charged amount');
  console.log(`   ✓ Wallet settled: Initial ${balBefore} -> Charged ${finishedJob.charged_amount} -> Balance ${walletAfterComplete.balance} INR`);

  // Step C: Verify Results Stored in DB
  const results = jobService.getJobResults(job.id, testUserId, { page: 1, limit: 10 });
  assert(results.items.length > 0, 'Job results should be persisted in database');
  console.log(`   ✓ Persisted ${results.total} results in DB table marketplace_job_results`);

  // Step D: Export Verification (CSV & JSON)
  const csvExport = await jobService.exportJobResults(job.id, testUserId, 'csv');
  const csvString = typeof csvExport.data === 'string' ? csvExport.data : csvExport.data.toString('utf-8');
  assert(!csvString.toLowerCase().includes('apify'), 'CSV export must not leak "apify"');
  assert(!csvString.toLowerCase().includes('actor'), 'CSV export must not leak "actor"');
  console.log('   ✓ CSV export generated and white-labeled');

  const jsonExport = await jobService.exportJobResults(job.id, testUserId, 'json');
  const jsonString = typeof jsonExport.data === 'string' ? jsonExport.data : jsonExport.data.toString('utf-8');
  assert(!jsonString.toLowerCase().includes('apify'), 'JSON export must not leak "apify"');
  assert(!jsonString.toLowerCase().includes('actor'), 'JSON export must not leak "actor"');
  console.log('   ✓ JSON export generated and white-labeled');

  // 6. Test 100% Refund on Abort
  console.log('\n🛑 6. Testing Full Reservation Refund on Job Abort...');
  const walletBeforeAbort = walletService.getOrCreateWallet(testUserId);
  const balBeforeAbort = walletBeforeAbort.balance;

  const abortJob = await jobService.createJob(
    testUserId,
    demoProductDef.slug,
    { search_query: 'Abort Test', location: 'Nowhere', require_email: false },
    5
  );
  console.log(`   Created second job ${abortJob.id}, reserved ${abortJob.reserved_amount} INR`);

  // Abort the job
  const aborted = await jobService.abortJob(abortJob.id, testUserId);
  assert(aborted, 'Abort should return true');

  const abortedJob = jobService.getJobById(abortJob.id);
  assert.strictEqual(abortedJob.status, 'ABORTED', 'Status should be ABORTED');
  assert.strictEqual(abortedJob.charged_amount, 0, 'Charged amount on aborted job should be 0');

  const walletAfterAbort = walletService.getOrCreateWallet(testUserId);
  assert.strictEqual(walletAfterAbort.reserved_balance, 0, 'Reserved balance must be restored to 0 on abort');
  assert.strictEqual(walletAfterAbort.balance, balBeforeAbort, '100% of balance must be preserved on abort');
  console.log(`   ✓ 100% reservation refunded: Balance preserved at ${walletAfterAbort.balance} INR`);

  console.log('\n====================================================');
  console.log('🎉 ALL MARKETPLACE TESTS PASSED CLEANLY (6/6 SUITES)');
  console.log('====================================================\n');
  process.exit(0);
}

runMarketplaceTests().catch(err => {
  console.error('\n❌ Marketplace Test Failed:', err);
  process.exit(1);
});
