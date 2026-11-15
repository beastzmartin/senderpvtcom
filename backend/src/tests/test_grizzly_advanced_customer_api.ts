import http from 'http';
import { initDatabase, getDatabase } from '../db/database.js';
import { GrizzlyCustomerApiClient } from '../services/virtualNumber/grizzly/GrizzlyCustomerApiClient.js';
import { GrizzlyCustomerConfigService } from '../services/virtualNumber/grizzly/GrizzlyCustomerConfigService.js';
import { GrizzlyCustomerPurchaseService } from '../services/virtualNumber/grizzly/GrizzlyCustomerPurchaseService.js';
import { GrizzlyCustomerPricingService } from '../services/virtualNumber/grizzly/GrizzlyCustomerPricingService.js';
import { GrizzlyCustomerReconciliationService } from '../services/virtualNumber/grizzly/GrizzlyCustomerReconciliationService.js';
import { WalletService } from '../services/walletService.js';

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, description: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ [PASS] ${description}`);
  } else {
    console.error(`  ✗ [FAIL] ${description}`);
    throw new Error(`Assertion failed: ${description}`);
  }
}

// Mock HTTP Server simulating GrizzlySMS handler_api.php
let mockResponseBody: any = '';
let mockContentType = 'text/plain';
let mockStatusCode = 200;
const receivedRequests: any[] = [];

const mockServer = http.createServer((req, res) => {
  const urlObj = new URL(req.url || '', `http://${req.headers.host}`);
  receivedRequests.push({
    method: req.method,
    url: req.url,
    searchParams: Object.fromEntries(urlObj.searchParams.entries())
  });

  res.writeHead(mockStatusCode, { 'Content-Type': mockContentType });
  if (typeof mockResponseBody === 'object') {
    res.end(JSON.stringify(mockResponseBody));
  } else {
    res.end(String(mockResponseBody));
  }
});

async function runAdvancedCustomerApiTestSuite() {
  console.log('================================================================================');
  console.log('🐻 GRIZZLYSMS ADVANCED CUSTOMER API (V2/V3, PRICING & RECONCILIATION) TEST SUITE');
  console.log('================================================================================\n');

  initDatabase();
  const db = getDatabase();
  const walletService = WalletService.getInstance();

  const MOCK_PORT = 4998;
  await new Promise<void>((resolve) => {
    mockServer.listen(MOCK_PORT, '127.0.0.1', () => resolve());
  });

  const mockBaseUrl = `http://127.0.0.1:${MOCK_PORT}/stubs/handler_api.php`;
  const testApiKey = 'grizzly_advanced_test_key_abc123';

  // Seed configuration
  db.prepare(`
    INSERT INTO grizzly_customer_config (
      id, is_enabled, api_key, base_url, timeout_seconds, markup_percentage,
      fixed_fee, customer_daily_limit, min_profit, currency_conversion_rate
    ) VALUES ('default', 1, ?, ?, 10, 25.0, 5.0, 50, 2.0, 1.0)
    ON CONFLICT(id) DO UPDATE SET
      api_key = excluded.api_key,
      base_url = excluded.base_url,
      min_profit = 2.0,
      currency_conversion_rate = 1.0
  `).run(testApiKey, mockBaseUrl);

  // Setup Test User
  const testUserId = 'test_user_advanced_grizzly_001';
  db.prepare(`
    INSERT INTO users (id, username, name, email, password_hash, role)
    VALUES (?, 'adv_user_1', 'Advanced Shopper', 'advanced_tester@example.com', 'hash_test', 'user')
    ON CONFLICT(id) DO NOTHING
  `).run(testUserId);

  // Setup Other User for privacy testing
  const otherUserId = 'test_user_other_002';
  db.prepare(`
    INSERT INTO users (id, username, name, email, password_hash, role)
    VALUES (?, 'other_user_2', 'Other Shopper', 'other_tester@example.com', 'hash_test', 'user')
    ON CONFLICT(id) DO NOTHING
  `).run(otherUserId);

  walletService.topUp(testUserId, 200.0, 'Test Balance Credit');

  try {
    // ============================================================================
    // SECTION 1: GET STATUS V2
    // ============================================================================
    console.log('--------------------------------------------------------------------------------');
    console.log('SECTION 1: getStatusV2 (JSON Verification Code & SMS History)');
    console.log('--------------------------------------------------------------------------------');

    // 1.1: Valid SMS Response
    mockContentType = 'application/json';
    mockResponseBody = {
      verificationType: 2,
      sms: {
        dateTime: '2026-02-26 12:05:55',
        code: '852508',
        text: 'Your Telegram verification code is 852508'
      }
    };

    const statusV2Res = await GrizzlyCustomerApiClient.getStatusV2('495357953', testApiKey);
    assert(statusV2Res.success === true, '1.1a. getStatusV2 reports success = true on valid JSON response');
    assert(statusV2Res.hasSms === true, '1.1b. getStatusV2 detects presence of SMS message');
    assert(statusV2Res.verificationType === 2, '1.1c. getStatusV2 parses verificationType = 2 correctly');
    assert(statusV2Res.sms?.code === '852508', '1.1d. getStatusV2 parses code "852508" accurately');
    assert(statusV2Res.sms?.text.includes('852508') === true, '1.1e. getStatusV2 preserves full SMS text');

    // 1.2: Missing SMS object (waiting)
    mockResponseBody = {
      verificationType: 1,
      sms: null
    };
    const waitingRes = await GrizzlyCustomerApiClient.getStatusV2('495357953', testApiKey);
    assert(waitingRes.hasSms === false, '1.2. Null sms object correctly mapped to hasSms = false');
    assert(waitingRes.status === 'WAITING_SMS', '1.2b. Status mapped to WAITING_SMS');

    // 1.3: Plain text STATUS_WAIT_CODE
    mockContentType = 'text/plain';
    mockResponseBody = 'STATUS_WAIT_CODE';
    const plainWaitingRes = await GrizzlyCustomerApiClient.getStatusV2('495357953', testApiKey);
    assert(plainWaitingRes.status === 'WAITING_SMS', '1.3. Plain text STATUS_WAIT_CODE mapped to WAITING_SMS');

    // 1.4: Error mappings: NO_ACTIVATION, BAD_KEY, SERVICE_UNAVAILABLE_REGION
    mockResponseBody = 'NO_ACTIVATION';
    const noActRes = await GrizzlyCustomerApiClient.getStatusV2('999999999', testApiKey);
    assert(noActRes.success === false && noActRes.error === 'NO_ACTIVATION', '1.4. NO_ACTIVATION mapped to error');

    mockResponseBody = 'BAD_KEY';
    const badKeyRes = await GrizzlyCustomerApiClient.getStatusV2('495357953', 'wrong_key');
    assert(badKeyRes.success === false && badKeyRes.error === 'BAD_KEY', '1.5. BAD_KEY mapped to error');

    mockResponseBody = 'SERVICE_UNAVAILABLE_REGION';
    const regionRes = await GrizzlyCustomerApiClient.getStatusV2('495357953', testApiKey);
    assert(regionRes.success === false && regionRes.error === 'SERVICE_UNAVAILABLE_REGION', '1.6. SERVICE_UNAVAILABLE_REGION mapped to error');

    // ============================================================================
    // SECTION 2: GET PRICES (V1)
    // ============================================================================
    console.log('\n--------------------------------------------------------------------------------');
    console.log('SECTION 2: getPrices (Normalized Rate Quotes)');
    console.log('--------------------------------------------------------------------------------');

    mockContentType = 'application/json';
    mockResponseBody = {
      "22": {
        "tg": { "cost": 0.35, "count": 100 },
        "wa": { "cost": 0.45, "count": 50 }
      },
      "6": {
        "tg": { "cost": 0.25, "count": 80 }
      }
    };

    const pricesV1Res = await GrizzlyCustomerApiClient.getPrices({ apiKey: testApiKey });
    assert(pricesV1Res.success === true, '2.1a. getPrices parses valid JSON dictionary');
    assert(pricesV1Res.entries.length === 3, '2.1b. Parsed all 3 country-service price entries');
    const indiaTg = pricesV1Res.entries.find((e) => e.country === '22' && e.service === 'tg');
    assert(indiaTg !== undefined && indiaTg.cost === 0.35 && indiaTg.count === 100, '2.1c. India Telegram quote matches cost 0.35 and count 100');

    // 2.2: Empty response
    mockResponseBody = {};
    const emptyPricesRes = await GrizzlyCustomerApiClient.getPrices({ apiKey: testApiKey });
    assert(emptyPricesRes.success === true && emptyPricesRes.entries.length === 0, '2.2. Empty dictionary handled gracefully without throwing');

    // 2.3: Malformed JSON
    mockContentType = 'text/plain';
    mockResponseBody = '<html>Gateway Timeout</html>';
    const malformedRes = await GrizzlyCustomerApiClient.getPrices({ apiKey: testApiKey });
    assert(malformedRes.success === false, '2.3. Malformed/non-JSON response flagged as error');

    // ============================================================================
    // SECTION 3: GET PRICES V2 (DYNAMIC TIERS)
    // ============================================================================
    console.log('\n--------------------------------------------------------------------------------');
    console.log('SECTION 3: getPricesV2 (Flexible Price Tiers)');
    console.log('--------------------------------------------------------------------------------');

    mockContentType = 'application/json';
    mockResponseBody = {
      "12": {
        "tg": {
          "price1": 10,
          "price2": 5,
          "price3": 2,
          "custom_dynamic_tier_4": 15
        }
      }
    };

    const pricesV2Res = await GrizzlyCustomerApiClient.getPricesV2({ apiKey: testApiKey });
    assert(pricesV2Res.success === true, '3.1a. getPricesV2 parses dynamic tier map');
    assert(pricesV2Res.data['12']?.tg?.price1 === 10, '3.1b. price1 tier quantity 10 preserved');
    assert(pricesV2Res.data['12']?.tg?.custom_dynamic_tier_4 === 15, '3.1c. Dynamic tier key preserved without hardcoding');

    // ============================================================================
    // SECTION 4: GET PRICES V3 & PROVIDER COMPARISON
    // ============================================================================
    console.log('\n--------------------------------------------------------------------------------');
    console.log('SECTION 4: getPricesV3 (Provider Comparison & Routing)');
    console.log('--------------------------------------------------------------------------------');

    mockContentType = 'application/json';
    mockResponseBody = {
      "22": {
        "tg": {
          "price": 0.35,
          "count": 100,
          "providers": {
            "1": {
              "count": 20,
              "price": [0.35, 0.40],
              "provider_id": 1
            },
            "2": {
              "count": 50,
              "price": [0.30],
              "provider_id": 2
            },
            "3": {
              "count": 0, // Zero stock
              "price": [0.28],
              "provider_id": 3
            }
          }
        }
      }
    };

    const pricesV3Res = await GrizzlyCustomerApiClient.getPricesV3({ apiKey: testApiKey });
    assert(pricesV3Res.success === true, '4.1a. getPricesV3 parses multi-provider response');
    const tgData = pricesV3Res.data['22']?.tg;
    assert(tgData?.price === 0.35 && tgData?.count === 100, '4.1b. Overall price 0.35 and count 100 parsed');
    assert(tgData?.normalizedProviders.length === 3, '4.1c. Normalized all 3 providers');

    // Check lowest price ordering
    const prov2 = tgData?.normalizedProviders.find((p) => p.providerId === '2');
    assert(prov2?.lowestPrice === 0.30 && prov2?.count === 50, '4.2. Provider 2 price array [0.30] mapped to lowestPrice 0.30');

    // Sync prices into cache table
    const syncRes = await GrizzlyCustomerPricingService.syncPrices({ endpoint: 'getPricesV3' });
    assert(syncRes.success === true && syncRes.syncedCount >= 1, '4.3. Pricing cache synchronized and persisted');

    // Provider Comparison query: filters zero stock
    const comparison = GrizzlyCustomerPricingService.getProviderComparison('22', 'tg');
    assert(comparison.providers.length === 2, '4.4. Provider comparison excludes zero-stock provider 3 (never advertises unavailable stock)');
    assert(comparison.providers[0].lowestPrice <= comparison.providers[1].lowestPrice, '4.5. Providers ranked by lowest available acquisition price');

    // ============================================================================
    // SECTION 5: GET ACTIVE ACTIVATIONS & RECONCILIATION
    // ============================================================================
    console.log('\n--------------------------------------------------------------------------------');
    console.log('SECTION 5: getActiveActivations & Safe Reconciliation');
    console.log('--------------------------------------------------------------------------------');

    // Create an active local activation to reconcile
    const testLocalActId = `test_recon_act_${Date.now()}`;
    const providerActId = '495367092';
    const testPhone = '19568190051';

    db.prepare(`
      INSERT INTO grizzly_customer_activations (
        id, user_id, provider_id, provider_activation_id, phone_number,
        country_id, service_code, service_name, purchase_request_id,
        customer_selling_price, provider_acquisition_cost, admin_profit,
        status, sms_status, sms_history, created_at, updated_at
      ) VALUES (
        ?, ?, 'grizzlysms', ?, ?,
        '12', 'tg', 'Telegram', 'req_test',
        25.0, 0.35, 24.65,
        'NUMBER_ASSIGNED', 'PENDING', '[]', datetime('now'), datetime('now')
      )
    `).run(testLocalActId, testUserId, providerActId, testPhone);

    mockContentType = 'application/json';
    mockResponseBody = [
      {
        activationCost: 0.35,
        activationId: providerActId, // Matches local activation
        activationStatus: 1,
        activationTime: "2026-05-07 14:18:05",
        canGetAnotherSms: "1",
        countryCode: "12",
        countryName: "USA (2)",
        currency: 840,
        discount: "0.00",
        phoneNumber: testPhone,
        repeated: "0",
        serviceCode: "tg",
        smsCode: "",
        smsText: ""
      },
      {
        activationCost: 0.50,
        activationId: "888999111", // Missing locally
        activationStatus: 1,
        activationTime: "2026-05-07 14:20:00",
        canGetAnotherSms: "1",
        countryCode: "22",
        countryName: "India",
        currency: 643,
        discount: "0.00",
        phoneNumber: "919988776655",
        repeated: "0",
        serviceCode: "wa",
        smsCode: "",
        smsText: ""
      }
    ];

    const activeRes = await GrizzlyCustomerApiClient.getActiveActivations(testApiKey);
    assert(activeRes.success === true && activeRes.activations.length === 2, '5.1. getActiveActivations parses array of 2 remote activations');
    assert(typeof activeRes.activations[0].activationId === 'string', '5.2. Activation ID strictly preserved as string');
    assert(typeof activeRes.activations[0].phoneNumber === 'string', '5.3. Phone number strictly preserved as string');

    // Run reconciliation
    const reconRun = await GrizzlyCustomerReconciliationService.runReconciliation();
    assert(reconRun.success === true && reconRun.summary !== undefined, '5.4. Reconciliation completed successfully');
    assert(reconRun.summary?.matchedCount === 1, '5.5. Matched local activation with remote active list');
    assert(reconRun.summary?.missingLocallyCount === 1, '5.6. Detected 1 activation missing locally without creating fake user');

    // Verify local record was enriched
    const enrichedLocal = db.prepare('SELECT * FROM grizzly_customer_activations WHERE id = ?').get(testLocalActId) as any;
    assert(enrichedLocal.reconciliation_status === 'matched', '5.7. Local activation status marked matched');
    assert(enrichedLocal.currency_numeric === 840, '5.8. Local currency code updated to ISO 840');

    // ============================================================================
    // SECTION 6: MULTI-SMS & DEDUPLICATION (getStatusV2 Workflow)
    // ============================================================================
    console.log('\n--------------------------------------------------------------------------------');
    console.log('SECTION 6: Multi-SMS Polling, History & Deduplication');
    console.log('--------------------------------------------------------------------------------');

    // Mock first SMS code arrival
    mockContentType = 'application/json';
    mockResponseBody = {
      verificationType: 2,
      sms: {
        dateTime: '2026-05-07 14:25:00',
        code: '112233',
        text: 'Your Telegram code is 112233'
      }
    };

    const firstPoll = await GrizzlyCustomerPurchaseService.checkActivationSmsV2(testUserId, testLocalActId);
    assert(firstPoll.status === 'SMS_RECEIVED', '6.1a. First SMS polled successfully');
    assert(firstPoll.code === '112233', '6.1b. First code parsed as 112233');
    assert(firstPoll.smsHistory.length === 1, '6.1c. SMS history contains exactly 1 entry');

    // Repeated poll with the exact same response (Deduplication test)
    const secondPoll = await GrizzlyCustomerPurchaseService.checkActivationSmsV2(testUserId, testLocalActId);
    assert(secondPoll.smsHistory.length === 1, '6.2. Duplicate SMS response prevented from bloating history');

    // Second distinct SMS arrival
    mockResponseBody = {
      verificationType: 2,
      sms: {
        dateTime: '2026-05-07 14:28:00',
        code: '445566',
        text: 'Your second verification code is 445566'
      }
    };

    const thirdPoll = await GrizzlyCustomerPurchaseService.checkActivationSmsV2(testUserId, testLocalActId);
    assert(thirdPoll.smsHistory.length === 2, '6.3. Second distinct SMS appended to history without overwriting previous code');
    assert(thirdPoll.code === '445566', '6.4. Active code updated to newest received code');

    // ============================================================================
    // SECTION 7: SMS PRIVACY & ACCESS CONTROL
    // ============================================================================
    console.log('\n--------------------------------------------------------------------------------');
    console.log('SECTION 7: SMS Privacy & Tenant Isolation');
    console.log('--------------------------------------------------------------------------------');

    let unauthorizedBlocked = false;
    try {
      // Other user tries to access test user's SMS history
      GrizzlyCustomerPurchaseService.getActivationSmsHistory(otherUserId, testLocalActId, false);
    } catch {
      unauthorizedBlocked = true;
    }
    assert(unauthorizedBlocked === true, '7.1. SMS history access strictly forbidden to other non-owner customers');

    // Authorized owner can access
    const ownerHistory = GrizzlyCustomerPurchaseService.getActivationSmsHistory(testUserId, testLocalActId, false);
    assert(ownerHistory.smsHistory.length === 2, '7.2. Authorized owner successfully retrieves their own SMS history');

    // Admin can access
    const adminHistory = GrizzlyCustomerPurchaseService.getActivationSmsHistory('admin_user', testLocalActId, true);
    assert(adminHistory.smsHistory.length === 2, '7.3. Authorized administrator successfully audits SMS history');

    // ============================================================================
    // SECTION 8: ADVANCED PRICING RULES & OVERRIDES
    // ============================================================================
    console.log('\n--------------------------------------------------------------------------------');
    console.log('SECTION 8: Dynamic Pricing Rules, Currency Conversion & Margin Caps');
    console.log('--------------------------------------------------------------------------------');

    // Global pricing test: Provider acquisition ₹10 + 25% markup (₹2.5) + ₹5 fee = ₹17.5 -> ₹18
    const globalPrice = GrizzlyCustomerPricingService.calculateCustomerSellingPrice({
      serviceCode: 'fb',
      rawProviderPrice: 10.0
    });
    assert(globalPrice.sellingPrice === 18, '8.1. Standard pricing calculates base + markup + fee accurately');

    // Save custom Country-Service specific rule: India (22) + Telegram (tg): fixed markup 50%, fee ₹10
    const ruleSave = GrizzlyCustomerPricingService.saveProviderRule({
      scope: 'country_service',
      countryId: '22',
      serviceCode: 'tg',
      markupPercentage: 50,
      fixedFee: 10,
      allowedProviderIds: '1,2',
      excludedProviderIds: '3',
      isActive: true
    });
    assert(ruleSave.success === true, '8.2. Custom country-service routing rule saved');

    // Pricing calculation with custom rule applied:
    // Base ₹10 * 1.0 conversion = ₹10 + 50% (₹5) + ₹10 fee = ₹25
    const overriddenPrice = GrizzlyCustomerPricingService.calculateCustomerSellingPrice({
      countryId: '22',
      serviceCode: 'tg',
      rawProviderPrice: 10.0
    });
    assert(overriddenPrice.sellingPrice === 25, '8.3. Custom rule overrides global markup and fee (Selling Price: ₹25)');
    assert(Boolean(overriddenPrice.appliedRule?.startsWith('country_service:')), '8.4. Precedence engine selected country_service rule over global');

    // Clean up rule
    GrizzlyCustomerPricingService.deleteProviderRule(ruleSave.rule.id);

    console.log('\n================================================================================');
    console.log(`🎉 ALL TESTS COMPLETED: ${passedTests}/${totalTests} CHECKS COMPLIANT!`);
    console.log('================================================================================\n');
  } finally {
    mockServer.close();
  }
}

runAdvancedCustomerApiTestSuite().catch((err) => {
  console.error('\n❌ Test Suite Crashed:', err);
  mockServer.close();
  process.exit(1);
});
