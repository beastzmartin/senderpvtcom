import crypto from 'crypto';
import { initDatabase, getDatabase } from '../db/database.js';
import { LinkParser } from '../services/marketplace/LinkParser.js';
import { SchemaMapper } from '../services/marketplace/SchemaMapper.js';
import { OutputFlattener } from '../services/marketplace/OutputFlattener.js';
import { DraftProductGenerator } from '../services/marketplace/DraftProductGenerator.js';
import { WhiteLabelSanitizer } from '../services/marketplace/WhiteLabelSanitizer.js';
import { MarketplacePricingService } from '../services/marketplace/MarketplacePricingService.js';
import { MarketplaceProductService } from '../services/marketplace/MarketplaceProductService.js';
import { ActorProfileService, CapabilityDetector, CompatibilityClassifier } from '../services/marketplace/ActorProfileService.js';
import { MarketplaceCircuitBreakerService } from '../services/marketplace/MarketplaceCircuitBreakerService.js';
import { MarketplaceFileService } from '../services/marketplace/MarketplaceFileService.js';
import { MockProviderAdapter } from '../services/marketplace/provider/MockProviderAdapter.js';

async function runV2MasterVerification() {
  console.log('========================================================================');
  console.log('🚀 MASTER PROMPT v2 — UNIVERSAL ACTOR & EXTRACTION STUDIO VERIFICATION');
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

  // ---------------------------------------------------------------------------
  // TEST SUITE 1: LINKPARSER & PROVIDER INGESTION (PART 1)
  // ---------------------------------------------------------------------------
  console.log('🧪 1. Testing LinkParser URL Normalization, Bulk Imports & Duplicates');

  // 1.1 Store URL with deep subpath and query parameters
  const ref1 = LinkParser.parseActorRef('https://apify.com/clearpath/shopify-store-leads/input-schema?fpr=partner&campaign=test#readme');
  assert(ref1.isValid, 'Store URL with subpath & hash parsed as valid');
  assert(ref1.normalizedActorId === 'clearpath~shopify-store-leads', `Normalized to clearpath~shopify-store-leads (got ${ref1.normalizedActorId})`);
  assert(ref1.username === 'clearpath', 'Extracted username "clearpath"');
  assert(ref1.actorName === 'shopify-store-leads', 'Extracted actorName "shopify-store-leads"');

  // 1.2 Slash-separated username/actor-name
  const ref2 = LinkParser.parseActorRef('ecommerce_leads/store-leads-14m-e-commerce-leads');
  assert(ref2.isValid, 'Slash-separated username/actor-name parsed as valid');
  assert(ref2.normalizedActorId === 'ecommerce_leads~store-leads-14m-e-commerce-leads', 'Converted slash to tilde format');

  // 1.3 Console deep-link format
  const ref3 = LinkParser.parseActorRef('https://console.apify.com/actors/kVYdvNOefemtiDXO5/info/readme?build=latest');
  assert(ref3.isValid, 'Console link parsed as valid');
  assert(ref3.normalizedActorId === 'kVYdvNOefemtiDXO5', `Extracted actor ID kVYdvNOefemtiDXO5 (got ${ref3.normalizedActorId})`);

  // 1.4 Raw ID format
  const ref4 = LinkParser.parseActorRef('a1b2c3d4e5f6g7h8');
  assert(ref4.isValid, 'Raw actor ID string parsed as valid');
  assert(ref4.normalizedActorId === 'a1b2c3d4e5f6g7h8', 'Raw ID normalized cleanly');

  // 1.5 Invalid link rejection
  const refInvalid = LinkParser.parseActorRef('https://google.com/search?q=test');
  assert(!refInvalid.isValid, 'Invalid non-provider URL rejected');
  assert(Boolean(refInvalid.error), 'Clear rejection error provided');

  // 1.6 Bulk parsing with deduplication
  const bulkInput = `
    https://apify.com/clearpath/shopify-store-leads
    scrapesage/ycombinator-scraper
    clearpath/shopify-store-leads
    https://apify.com/invalid-link-without-actor
  `;
  const batch = LinkParser.parseBatch(bulkInput);
  assert(batch.length === 4, 'Parsed 4 batch lines');
  assert(Boolean(batch[0].isValid && !batch[0].isDuplicate), 'Batch item 1 is valid & unique');
  assert(Boolean(batch[1].isValid && !batch[1].isDuplicate), 'Batch item 2 is valid & unique');
  assert(Boolean(batch[2].isDuplicate), 'Batch item 3 duplicate correctly flagged');
  assert(!batch[3].isValid, 'Batch item 4 invalid correctly flagged');

  console.log('');

  // ---------------------------------------------------------------------------
  // TEST SUITE 2: CAPABILITY DETECTION & COMPATIBILITY CLASSIFIER (PART 2)
  // ---------------------------------------------------------------------------
  console.log('🧪 2. Testing CapabilityDetector & CompatibilityClassifier across 10 Mock Archetypes');

  const mockAdapter = new MockProviderAdapter();

  // Archetype 1: Keyword + PPR
  const pprMeta = await mockAdapter.getActorInfo('fixture~keyword-ppr');
  const pprCaps = CapabilityDetector.detect(pprMeta as any);
  const pprCompat = CompatibilityClassifier.classify(pprCaps, pprMeta as any);
  assert(pprCaps.pricing_model === 'pay_per_result', 'PPR pricing model detected');
  assert(pprCaps.supports_max_items === true, 'supports_max_items detected');
  assert(pprCaps.input_kinds.includes('keyword'), 'keyword input kind detected');
  assert(pprCompat.classification === 'FULLY_SUPPORTED', `fixture~keyword-ppr classified as FULLY_SUPPORTED (got ${pprCompat.classification})`);

  // Archetype 2: Nested Objects
  const nestedMeta = await mockAdapter.getActorInfo('fixture~nested-objects');
  const nestedCaps = CapabilityDetector.detect(nestedMeta as any);
  assert(nestedCaps.input_kinds.includes('nested_objects'), 'nested_objects input kind detected');

  // Archetype 3: URL List
  const urlMeta = await mockAdapter.getActorInfo('fixture~url-list');
  const urlCaps = CapabilityDetector.detect(urlMeta as any);
  assert(urlCaps.input_kinds.includes('url_list'), 'url_list input kind detected');

  // Archetype 4: Pay-Per-Event Multi-Event
  const ppeMeta = await mockAdapter.getActorInfo('fixture~ppe-events');
  const ppeCaps = CapabilityDetector.detect(ppeMeta as any);
  const ppeCompat = CompatibilityClassifier.classify(ppeCaps, ppeMeta as any);
  assert(ppeCaps.pricing_model === 'pay_per_event', 'PPE pricing model detected');
  assert(ppeCompat.classification === 'FULLY_SUPPORTED', 'fixture~ppe-events classified as FULLY_SUPPORTED');

  // Archetype 5: Rental / Subscription
  const rentalMeta = await mockAdapter.getActorInfo('fixture~rental');
  const rentalCaps = CapabilityDetector.detect(rentalMeta as any);
  const rentalCompat = CompatibilityClassifier.classify(rentalCaps, rentalMeta as any);
  assert(rentalCaps.pricing_model === 'rental', 'Rental pricing model detected');
  assert(rentalCompat.classification === 'FULLY_SUPPORTED', 'fixture~rental classified as FULLY_SUPPORTED');

  // Archetype 6: Files-Only KV Store Output
  const filesMeta = await mockAdapter.getActorInfo('fixture~files-only');
  const filesCaps = CapabilityDetector.detect(filesMeta as any);
  const filesCompat = CompatibilityClassifier.classify(filesCaps, filesMeta as any);
  assert(filesCaps.output_kinds.includes('key_value_files'), 'key_value_files output kind detected');
  assert(filesCaps.kv_collections.length > 0, `Detected ${filesCaps.kv_collections.length} KV collections`);
  assert(filesCompat.classification === 'FULLY_SUPPORTED', 'fixture~files-only classified as FULLY_SUPPORTED');

  // Archetype 7: Multi-Dataset Views
  const viewsMeta = await mockAdapter.getActorInfo('fixture~multi-views');
  const viewsCaps = CapabilityDetector.detect(viewsMeta as any);
  assert(viewsCaps.dataset_views.length === 2, `Detected 2 dataset views (got ${viewsCaps.dataset_views.length})`);
  assert(viewsCaps.dataset_views[0].title === 'Overview View', 'First dataset view titled Overview View');
  assert(viewsCaps.dataset_views[1].title === 'Social & Marketing View', 'Second dataset view titled Social & Marketing View');

  // Archetype 8: Custom Code + Credentials + Proxy
  const riskyMeta = await mockAdapter.getActorInfo('fixture~code-credentials-proxy');
  const riskyCaps = CapabilityDetector.detect(riskyMeta as any);
  const riskyCompat = CompatibilityClassifier.classify(riskyCaps, riskyMeta as any);
  assert(riskyCaps.has_custom_code_inputs === true, 'Custom code input flag detected (pageFunction)');
  assert(riskyCaps.has_credentials_inputs === true, 'Credentials input flag detected (loginCookies)');
  assert(riskyCaps.has_proxy_input === true, 'Proxy input flag detected');
  assert(
    riskyCompat.classification === 'ADMIN_REVIEW_REQUIRED' || riskyCompat.classification === 'SUPPORTED_WITH_LIMITS',
    `Risky actor requires admin review or limits (got ${riskyCompat.classification})`
  );

  // Archetype 9: Full-Permission Actor
  const fullPermMeta = await mockAdapter.getActorInfo('fixture~full-permission');
  const fullPermCaps = CapabilityDetector.detect(fullPermMeta as any);
  const fullPermCompat = CompatibilityClassifier.classify(fullPermCaps, fullPermMeta as any);
  assert(fullPermCaps.permission_level === 'full', 'Full permission level detected');
  assert(
    fullPermCompat.classification === 'ADMIN_REVIEW_REQUIRED' || fullPermCompat.classification === 'UNSUPPORTED',
    `Full permission actor blocked or gated for admin review (got ${fullPermCompat.classification})`
  );

  // Archetype 10: Standby-Mode Actor
  const standbyMeta = await mockAdapter.getActorInfo('fixture~standby-mode');
  const standbyCaps = CapabilityDetector.detect(standbyMeta as any);
  const standbyCompat = CompatibilityClassifier.classify(standbyCaps, standbyMeta as any);
  assert(standbyCaps.mode === 'standby', 'Standby mode detected');
  assert(standbyCompat.classification === 'UNSUPPORTED', `Standby actor classified as UNSUPPORTED (got ${standbyCompat.classification})`);

  // Test Admin Classification Override
  const originalProfile = ActorProfileService.buildProfile(standbyMeta as any);
  assert(originalProfile.compatibility.classification === 'UNSUPPORTED', 'Initial classification is UNSUPPORTED');
  const overriddenProfile = ActorProfileService.applyAdminOverride(
    originalProfile,
    'SUPPORTED_WITH_LIMITS',
    'admin_user_001',
    'Super-admin explicitly verified sandbox limits and container timeout.'
  );
  assert(overriddenProfile.compatibility.classification === 'SUPPORTED_WITH_LIMITS', 'Override updated classification to SUPPORTED_WITH_LIMITS');
  assert(overriddenProfile.compatibility.admin_override?.overridden_by === 'admin_user_001', 'Recorded admin userId in audit trail');
  assert(overriddenProfile.compatibility.admin_override?.original_classification === 'UNSUPPORTED', 'Recorded original classification in audit trail');

  console.log('');

  // ---------------------------------------------------------------------------
  // TEST SUITE 3: UNIVERSAL SCHEMAMAPPER & BULK INPUT PARSER (PART 3)
  // ---------------------------------------------------------------------------
  console.log('🧪 3. Testing SchemaMapper Bulk Input Parsing & Syntax Validation');

  // Test 3.1: Bulk URL parser with duplicates and syntax errors
  const rawBulkUrls = `
    https://apple.com
    google.com
    https://apple.com
    ftp://invalid-protocol.com
    not-a-valid-url!
    https://microsoft.com
  `;
  const urlParseResult = SchemaMapper.parseBulkTextOrCsv(rawBulkUrls, 'url', 100);
  assert(urlParseResult.items.length === 3, `Extracted 3 unique valid URLs (got ${urlParseResult.items.length})`);
  assert(urlParseResult.items.includes('https://apple.com/'), 'Normalized apple.com');
  assert(urlParseResult.items.includes('https://google.com/'), 'Auto-prepended https:// to google.com');
  assert(urlParseResult.duplicatesRemoved === 1, `Removed 1 duplicate (got ${urlParseResult.duplicatesRemoved})`);
  assert(urlParseResult.invalidRows.length >= 2, `Caught ${urlParseResult.invalidRows.length} invalid URL rows with line numbers`);

  // Test 3.2: Bulk String tags / keywords parser with CSV format
  const rawBulkCsv = 'shoes, sneakers, running gear, shoes, apparel, "outdoor jackets"';
  const tagParseResult = SchemaMapper.parseBulkTextOrCsv(rawBulkCsv, 'string', 50);
  assert(tagParseResult.items.length === 5, `Extracted 5 unique tags (got ${tagParseResult.items.length})`);
  assert(tagParseResult.duplicatesRemoved === 1, 'Removed 1 duplicate tag');
  assert(tagParseResult.items.includes('outdoor jackets'), 'Parsed quoted CSV token');

  // Test 3.3: Server-side payload validation with hidden defaults
  const sampleInputDef: any = {
    fields: [
      { key: 'targetQuery', provider_key: 'query', label: 'Query', type: 'text', required: true },
      { key: 'limitCount', provider_key: 'maxItems', label: 'Limit', type: 'number', min: 1, max: 500, default: 20 },
      { key: 'includeBio', provider_key: 'bio', label: 'Include Bio', type: 'boolean', default: false }
    ],
    hidden_defaults: {
      useApifyProxy: true,
      internalTimeoutSecs: 300
    },
    static_overrides: {
      outputFormat: 'json'
    }
  };

  const validPayloadBuild = SchemaMapper.buildProviderPayload(sampleInputDef, {
    targetQuery: 'ecommerce stores',
    limitCount: 50
  });
  assert(validPayloadBuild.errors.length === 0, 'Zero errors on valid payload submission');
  assert(validPayloadBuild.payload.query === 'ecommerce stores', 'Mapped user field to provider_key');
  assert(validPayloadBuild.payload.maxItems === 50, 'Mapped number field');
  assert(validPayloadBuild.payload.useApifyProxy === true, 'Injected hidden default');
  assert(validPayloadBuild.payload.outputFormat === 'json', 'Injected static override');

  const invalidPayloadBuild = SchemaMapper.buildProviderPayload(sampleInputDef, {
    targetQuery: '', // required but empty
    limitCount: 9999 // exceeds max 500
  });
  assert(invalidPayloadBuild.errors.length === 2, `Caught 2 validation errors (got ${invalidPayloadBuild.errors.length})`);

  console.log('');

  // ---------------------------------------------------------------------------
  // TEST SUITE 4: UNIVERSAL PRICING ENGINE (PART 4)
  // ---------------------------------------------------------------------------
  console.log('🧪 4. Testing Universal Pricing Engine (PPR, PPE, Rental, Multi-Currency Matrix)');

  const pricingService = MarketplacePricingService.getInstance();

  const dummyPprProduct: any = {
    slug: 'verify-ppr-product',
    pricing: {
      mode: 'per_item',
      currency_basis: 'BASE',
      provider_cost_reference: {
        model: 'pay_per_result',
        usd_per_1000_items: 2.50
      },
      sell: {
        per_1000_items: 399.0,
        per_run_flat: 0
      },
      min_charge: 10.0,
      quote_ttl_secs: 300,
      fx_safety_buffer_percent: 5
    }
  };

  // Test 4.1: Guaranteed Price Quote with TTL and Signature
  const pprQuote = pricingService.generatePriceQuote(dummyPprProduct, 1000, 'INR');
  assert(Boolean(pprQuote.quoteId), `Generated quoteId: ${pprQuote.quoteId}`);
  assert(pprQuote.sellPrice === 399.0, `Calculated sell price ₹${pprQuote.sellPrice}`);
  assert(pprQuote.currency === 'INR', 'Currency matches INR');
  assert(pprQuote.fxBufferAmount > 0, `FX buffer included: ₹${pprQuote.fxBufferAmount}`);
  assert(Boolean(pprQuote.signature), `HMAC signature present: ${pprQuote.signature}`);

  // Test 4.2: Pay-Per-Event Worst-Case Estimator
  const dummyPpeProduct: any = {
    slug: 'verify-ppe-product',
    pricing: {
      mode: 'per_item',
      currency_basis: 'BASE',
      provider_cost_reference: {
        model: 'pay_per_event',
        usd_per_run_start: 0.10,
        pricing_per_event: {
          actorChargeEvents: {
            start_run: { eventTitle: 'Start', eventPriceUsd: 0.10 },
            extract_lead: { eventTitle: 'Extract Lead', eventPriceUsd: 0.005, isPrimaryEvent: true }
          }
        }
      },
      sell: {
        per_1000_items: 699.0,
        per_run_flat: 50.0
      },
      min_charge: 25.0
    }
  };

  const ppeEstimate = pricingService.calculateEstimatedPrice(dummyPpeProduct, 500, 'INR');
  assert(ppeEstimate.providerCostUsd > 0, `Estimated upstream PPE cost: $${ppeEstimate.providerCostUsd}`);
  assert(ppeEstimate.sellPrice > 0, `Estimated sell price: ₹${ppeEstimate.sellPrice}`);
  assert(!ppeEstimate.isBelowCost, 'Pricing provides healthy gross margin');

  // Test 4.3: Rental Break-Even Calculator
  const rentalBreakEven = pricingService.calculateRentalBreakEven(49.0, 1999.0, 'INR');
  assert(rentalBreakEven.rentalCostConverted > 0, `Converted $49/mo rental to ₹${rentalBreakEven.rentalCostConverted}`);
  assert(rentalBreakEven.breakEvenSubscribers >= 2, `Break-even requires ${rentalBreakEven.breakEvenSubscribers} subscribers`);

  // Test 4.4: Multi-Currency Pricing Matrix
  const multiMatrix = pricingService.generateMultiCurrencyMatrix(dummyPprProduct);
  assert(Boolean(multiMatrix['INR']), 'Matrix includes INR');
  assert(Boolean(multiMatrix['INR'][100]), 'Matrix includes 100 items tier');
  assert(Boolean(multiMatrix['INR'][1000]), 'Matrix includes 1000 items tier');
  assert(Boolean(multiMatrix['INR'][10000]), 'Matrix includes 10000 items tier');

  console.log('');

  // ---------------------------------------------------------------------------
  // TEST SUITE 5: SAFETY & CIRCUIT BREAKER (PART 5)
  // ---------------------------------------------------------------------------
  console.log('🧪 5. Testing Autonomous Circuit Breaker Threshold & Auto-Pause');

  const testCircuitSlug = `circuit-test-${Date.now()}`;

  // Initial state should be CLOSED
  const initialStatus = MarketplaceCircuitBreakerService.getStatus(testCircuitSlug);
  assert(initialStatus.state === 'CLOSED', 'Circuit starts in CLOSED state');
  assert(initialStatus.failureCount === 0, 'Initial failure count is 0');

  // Record 4 consecutive failures (threshold is 5)
  for (let i = 1; i <= 4; i++) {
    const s = MarketplaceCircuitBreakerService.recordFailure(testCircuitSlug, `Simulated provider timeout ${i}`);
    assert(s.state === 'CLOSED', `Failure ${i}/5: Circuit remains CLOSED`);
    assert(s.failureCount === i, `Failure count recorded as ${i}`);
  }

  // 5th failure must trip circuit to OPEN
  const trippedStatus = MarketplaceCircuitBreakerService.recordFailure(testCircuitSlug, 'Fatal provider API rate limit');
  assert(trippedStatus.state === 'OPEN', '5th consecutive failure tripped circuit to OPEN');
  assert(Boolean(trippedStatus.tripReason), `Trip reason recorded: "${trippedStatus.tripReason}"`);

  // Verify isOpen check
  const isTripOpen = MarketplaceCircuitBreakerService.getStatus(testCircuitSlug).state === 'OPEN';
  assert(isTripOpen, 'Circuit Breaker reports OPEN');

  // Verify recovery reset
  MarketplaceCircuitBreakerService.recordSuccess(testCircuitSlug);
  const recoveredStatus = MarketplaceCircuitBreakerService.getStatus(testCircuitSlug);
  assert(recoveredStatus.state === 'CLOSED', 'Successful run reset circuit to CLOSED');
  assert(recoveredStatus.failureCount === 0, 'Failure count reset to 0');

  console.log('');

  // ---------------------------------------------------------------------------
  // TEST SUITE 6: SECURE FILE STORAGE & IDOR PREVENTION (PART 6)
  // ---------------------------------------------------------------------------
  console.log('🧪 6. Testing Secure File Service, Signed Tokens & IDOR Protection');

  const fileService = MarketplaceFileService.getInstance();
  const adminUser = (db.prepare('SELECT id FROM users LIMIT 1').get() as any) || { id: 'admin' };
  const existingProd = (db.prepare('SELECT id, slug, display_name FROM extraction_marketplace_products LIMIT 1').get() as any) || {
    id: 'prod_test',
    slug: 'prod-test',
    display_name: 'Test Product'
  };

  const testJobId = `job_test_${Date.now()}`;
  const testUserId = adminUser.id;
  const dummyFileContent = Buffer.from('PDF Report Mock File Content for Verification');

  // Insert mock parent job in marketplace_jobs to satisfy foreign key constraints
  db.prepare(`
    INSERT INTO marketplace_jobs (
      id, user_id, product_id, product_slug, product_name, input_json, requested_items,
      status, provider_type, reserved_amount, charged_amount
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'COMPLETED', 'mock', 100, 100)
  `).run(testJobId, testUserId, existingProd.id, existingProd.slug, existingProd.display_name, '{}', 50);

  // 6.1 Save job file with signed access token
  const savedFile = fileService.saveJobFile({
    jobId: testJobId,
    userId: testUserId,
    fileName: 'actor-apify-screenshot.pdf',
    buffer: dummyFileContent,
    contentType: 'application/pdf',
    expiresInHours: 24
  });

  assert(Boolean(savedFile.id), `Generated file ID: ${savedFile.id}`);
  assert(Boolean(savedFile.signature_token), 'Generated secure signature token');
  assert(!savedFile.file_name.toLowerCase().includes('apify'), 'Sanitized provider name from file name');
  assert(!savedFile.file_name.toLowerCase().includes('actor'), 'Sanitized actor name from file name');

  // 6.2 Valid file access via token
  const validFetch = fileService.getFileForDownload(savedFile.id, savedFile.signature_token);
  assert(Boolean(validFetch.filePath), 'Valid file access with correct token succeeded');
  const fileDiskContent = (await import('fs')).readFileSync(validFetch.filePath, 'utf-8');
  assert(fileDiskContent === 'PDF Report Mock File Content for Verification', 'Retrieved identical file content');

  // 6.3 IDOR / Invalid token rejection
  let idorBlocked = false;
  try {
    fileService.getFileForDownload(savedFile.id, 'tampered-invalid-token');
  } catch (err: any) {
    idorBlocked = err.message.includes('INVALID_TOKEN');
  }
  assert(idorBlocked, 'IDOR Protection: Rejected tampered signature token');

  // 6.4 List files for job
  const jobFiles = fileService.listFilesForJob(testJobId, testUserId);
  assert(jobFiles.length === 1, `Listed 1 file for job ${testJobId}`);
  assert(jobFiles[0].id === savedFile.id, 'Listed file matches saved ID');

  // Clean up mock test job
  db.prepare('DELETE FROM marketplace_jobs WHERE id = ?').run(testJobId);

  console.log('');

  // ---------------------------------------------------------------------------
  // TEST SUITE 7: OUTPUT FLATTENER & CSV FORMULA INJECTION SANITIZATION (PART 7)
  // ---------------------------------------------------------------------------
  console.log('🧪 7. Testing OutputFlattener & CSV Formula Injection Sanitization');

  // Test 7.1: Neutralize Excel/Sheets formula execution vectors
  const dangerousFormulas = [
    '=CMD|"/C calc"!A0',
    '+1+2',
    '-100*5',
    '@SUM(A1:A10)',
    '\t=1+1',
    '\r=1+1'
  ];

  for (const formula of dangerousFormulas) {
    const sanitized = OutputFlattener.sanitizeForCsvFormulaInjection(formula);
    assert(sanitized.startsWith("'"), `Neutralized formula "${formula}" by prefixing single-quote (got "${sanitized}")`);
  }

  // Safe strings should not be modified
  const safeText = 'John Doe, Founder & CEO';
  assert(OutputFlattener.sanitizeForCsvFormulaInjection(safeText) === safeText, 'Safe text remains untouched');

  // Test 7.2: Dot notation & array predicate flattening
  const nestedLeadRecord = {
    _internalId: 'internal_secret_998',
    actorExecutionId: 'run_hidden_001',
    company: {
      name: 'Alpha Robotics',
      socials: {
        linkedin: 'https://linkedin.com/company/alpha-robotics'
      }
    },
    team: [
      { role: 'CTO', email: 'cto@alpha.io' },
      { role: 'CEO', email: 'ceo@alpha.io' }
    ]
  };

  const itemMappings = [
    { from: 'company.name', to: 'company_name' },
    { from: 'company.socials.linkedin', to: 'linkedin_url' },
    { from: 'team[role=CEO].email', to: 'ceo_email' }
  ];

  const flattenedResult = OutputFlattener.flattenItem(nestedLeadRecord, itemMappings, ['_internalId', 'actorExecutionId']);
  assert(flattenedResult.company_name === 'Alpha Robotics', 'Resolved dot path company.name');
  assert(flattenedResult.linkedin_url === 'https://linkedin.com/company/alpha-robotics', 'Resolved nested dot path linkedin');
  assert(flattenedResult.ceo_email === 'ceo@alpha.io', 'Resolved array predicate team[role=CEO].email');
  assert(!('_internalId' in flattenedResult), 'Filtered _internalId drop field');

  console.log('');

  // ---------------------------------------------------------------------------
  // TEST SUITE 8: WHITE-LABEL SANITIZER AUDIT (ADDENDUM D)
  // ---------------------------------------------------------------------------
  console.log('🧪 8. Testing White-Label Sanitizer across Customer Facing Entities');

  const leakedCustomerResponse = {
    title: 'Apify Actor Shopify Extractor',
    description: 'This Apify actor runs on api.apify.com to scrape ecommerce stores.',
    actor_id: 'clearpath~shopify-store-leads',
    provider_url: 'https://apify.com/clearpath/shopify-store-leads',
    status: 'actor_ready'
  };

  const sanitizedCustomerView = WhiteLabelSanitizer.cleanCustomerProduct(leakedCustomerResponse as any);
  const leakCheck = WhiteLabelSanitizer.detectLeaks(sanitizedCustomerView);
  assert(!leakCheck.hasLeak, `Customer view completely sanitized (matches: ${leakCheck.matches.join(', ') || 'none'})`);

  console.log('');

  // ---------------------------------------------------------------------------
  // TEST SUITE 9: LIVE SMOKE TEST WITH LIVE API KEY (4 MANDATORY TARGET ACTORS)
  // ---------------------------------------------------------------------------
  console.log('🧪 9. LIVE SMOKE TEST: Importing 4 Mandatory Target Actors with Real Key');

  const dbTokenSetting = (db.prepare("SELECT value FROM marketplace_settings WHERE key = 'apify_api_token'").get() as any)?.value;
  const liveToken = process.env.APIFY_API_TOKEN || dbTokenSetting || '';
  if (!liveToken) {
    throw new Error('APIFY_API_TOKEN must be configured in environment or marketplace_settings table.');
  }
  process.env.APIFY_API_TOKEN = liveToken;

  const targetActors = [
    { label: 'Actor 1 (Shopify Leads)', input: 'https://apify.com/clearpath/shopify-store-leads' },
    { label: 'Actor 2 (14M Leads)', input: 'ecommerce_leads/store-leads-14m-e-commerce-leads' },
    { label: 'Actor 3 (YC Scraper)', input: 'scrapesage/ycombinator-scraper' },
    { label: 'Actor 4 (Console URL)', input: 'https://console.apify.com/actors/kVYdvNOefemtiDXO5/info/readme?build=latest' }
  ];

  const productService = MarketplaceProductService.getInstance();

  for (const target of targetActors) {
    console.log(`\n   🔍 Testing Live Import for: ${target.label} ("${target.input}")`);
    try {
      const parsedRef = LinkParser.parseActorRef(target.input);
      assert(parsedRef.isValid, `Valid actor reference: ${parsedRef.normalizedActorId}`);

      const draft = await productService.importFromProvider('apify', target.input);
      assert(Boolean(draft.slug), `Draft generated with slug: "${draft.slug}"`);
      assert(Boolean(draft.display_name), `Clean title: "${draft.display_name}"`);
      assert(Boolean(draft.input?.fields && draft.input.fields.length > 0), `Mapped ${draft.input?.fields?.length} fields`);
      assert(Boolean(draft.pricing && (draft.pricing.sell?.per_1000_items || 0) > 0), `Sell price calculated: ₹${draft.pricing?.sell?.per_1000_items} / 1k`);
      assert(Boolean(draft.wizard_gates), 'Initialized 10 Review & Activate Wizard gates');
      assert(Boolean(draft.profile), 'Draft has ActorProfile generated');
      assert(Boolean(draft.profile?.capabilities), 'Profile contains detected capabilities');
      assert(Boolean(draft.profile?.compatibility?.classification), `Compatibility classified as ${draft.profile?.compatibility?.classification}`);

      // Save product to database to verify persistence in profile_json column
      const savedRecord = productService.saveProduct(draft);
      assert(Boolean(savedRecord.id), 'Draft product saved to database');

      // Verify ActorProfile was created and stored
      const productRow = db.prepare('SELECT profile_json FROM extraction_marketplace_products WHERE slug = ?').get(draft.slug) as any;
      assert(Boolean(productRow?.profile_json), 'ActorProfile persisted in profile_json column');
      const loadedProfile = JSON.parse(productRow.profile_json);
      assert(Boolean(loadedProfile.capabilities), 'Profile contains detected capabilities');
      assert(Boolean(loadedProfile.compatibility?.classification), `Compatibility classified as ${loadedProfile.compatibility?.classification}`);

      // White-label verification check on customer-facing view
      const customerDef = WhiteLabelSanitizer.cleanCustomerProduct(draft);
      const wlCheck = WhiteLabelSanitizer.detectLeaks(customerDef);
      assert(!wlCheck.hasLeak, `Zero white-label leaks in customer view (matches: ${wlCheck.matches.join(', ') || 'none'})`);

      console.log(`   ✨ Successfully imported and verified ${target.label}!`);
    } catch (err: any) {
      console.error(`   ❌ Failed on ${target.label}:`, err.message);
      throw err;
    }
  }

  console.log('\n========================================================================');
  console.log(`🎉 ALL ${passedTests} / ${totalTests} TESTS PASSED WITH 100% SUCCESS!`);
  console.log('========================================================================\n');
}

runV2MasterVerification().catch((err) => {
  console.error('Fatal Verification Error:', err);
  process.exit(1);
});
