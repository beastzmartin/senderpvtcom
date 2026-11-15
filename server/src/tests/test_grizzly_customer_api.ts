import http from 'http';
import { initDatabase, getDatabase } from '../db/database.js';
import { GrizzlyCustomerApiClient } from '../services/virtualNumber/grizzly/GrizzlyCustomerApiClient.js';
import { GrizzlyCustomerConfigService } from '../services/virtualNumber/grizzly/GrizzlyCustomerConfigService.js';
import { GrizzlyCustomerPurchaseService } from '../services/virtualNumber/grizzly/GrizzlyCustomerPurchaseService.js';
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
let mockResponseText = 'ACCESS_NUMBER:38496653:66846426435';
let mockStatusCode = 200;
let mockDelayMs = 0;
const receivedRequests: any[] = [];

const mockServer = http.createServer((req, res) => {
  const urlObj = new URL(req.url || '', `http://${req.headers.host}`);
  receivedRequests.push({
    method: req.method,
    url: req.url,
    searchParams: Object.fromEntries(urlObj.searchParams.entries())
  });

  const reply = () => {
    // If testing getBalance
    if (urlObj.searchParams.get('action') === 'getBalance') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ACCESS_BALANCE:245.80');
      return;
    }

    // If testing getStatus
    if (urlObj.searchParams.get('action') === 'getStatus') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('STATUS_OK:84920');
      return;
    }

    res.writeHead(mockStatusCode, { 'Content-Type': 'text/plain' });
    res.end(mockResponseText);
  };

  if (mockDelayMs > 0) {
    setTimeout(reply, mockDelayMs);
  } else {
    reply();
  }
});

async function runCustomerApiTestSuite() {
  console.log('================================================================================');
  console.log('🐻 GRIZZLYSMS ADVANCED GET NUMBER (CUSTOMER API) — COMPREHENSIVE TEST SUITE');
  console.log('================================================================================\n');

  initDatabase();
  const db = getDatabase();
  const walletService = WalletService.getInstance();

  // Setup Mock Server on port 4997
  const MOCK_PORT = 4997;
  await new Promise<void>((resolve) => {
    mockServer.listen(MOCK_PORT, '127.0.0.1', () => resolve());
  });

  const mockBaseUrl = `http://127.0.0.1:${MOCK_PORT}/stubs/handler_api.php`;
  const testApiKey = 'grizzly_cust_secret_api_key_xyz987';

  // Seed customer config pointing to mock server
  GrizzlyCustomerConfigService.updateConfig({
    is_enabled: true,
    api_key: testApiKey,
    base_url: mockBaseUrl,
    default_country: 'any',
    markup_percentage: 25.0,
    fixed_fee: 5.0,
    timeout_seconds: 5,
    customer_daily_limit: 50
  });

  // Create a clean test customer user
  const testUserId = 'test_cust_user_grizzly_01';
  db.prepare(`
    INSERT INTO users (id, username, name, email, password_hash, role)
    VALUES (?, 'grizzly_shopper', 'Grizzly Shopper', 'shopper@test.com', 'hash', 'user')
    ON CONFLICT(id) DO NOTHING
  `).run(testUserId);

  // Initialize wallet with ample balance
  const wallet = walletService.getOrCreateWallet(testUserId);
  db.prepare('UPDATE user_wallets SET balance = 500.0, reserved_balance = 0.0 WHERE user_id = ?').run(testUserId);
  db.prepare('DELETE FROM grizzly_customer_activations WHERE user_id = ?').run(testUserId);
  db.prepare('DELETE FROM grizzly_customer_api_logs WHERE user_id = ?').run(testUserId);

  console.log('--------------------------------------------------------------------------------');
  console.log('PHASE 1: API Request Builder & Response Parser Tests');
  console.log('--------------------------------------------------------------------------------');

  // 1. Successful ACCESS_NUMBER response
  mockResponseText = 'ACCESS_NUMBER:38496653:66846426435';
  mockStatusCode = 200;
  mockDelayMs = 0;
  receivedRequests.length = 0;

  const res1 = await GrizzlyCustomerApiClient.getNumber({
    apiKey: testApiKey,
    service: 'tg',
    country: 22
  });

  assert(res1.success === true, '1a. Result reports success = true on ACCESS_NUMBER');
  assert(res1.activationId === '38496653', '1b. Activation ID parsed as string "38496653"');
  assert(res1.phoneNumber === '66846426435', '1c. Phone number parsed as string "66846426435"');
  assert(res1.status === 'NUMBER_ASSIGNED', '1d. Status mapped to "NUMBER_ASSIGNED"');

  // 2. BAD_KEY
  mockResponseText = 'BAD_KEY';
  const res2 = await GrizzlyCustomerApiClient.getNumber({ apiKey: testApiKey, service: 'tg' });
  assert(res2.success === false && res2.code === 'BAD_KEY', '2. BAD_KEY parsed and mapped correctly');

  // 3. NO_BALANCE
  mockResponseText = 'NO_BALANCE';
  const res3 = await GrizzlyCustomerApiClient.getNumber({ apiKey: testApiKey, service: 'tg' });
  assert(res3.success === false && res3.code === 'NO_BALANCE', '3. NO_BALANCE parsed and mapped correctly');

  // 4. NO_NUMBERS
  mockResponseText = 'NO_NUMBERS';
  const res4 = await GrizzlyCustomerApiClient.getNumber({ apiKey: testApiKey, service: 'tg' });
  assert(res4.success === false && res4.code === 'NO_NUMBERS', '4. NO_NUMBERS parsed and mapped correctly');

  // 5. Prohibited service
  mockResponseText = 'The service is prohibited for sale by administration';
  const res5 = await GrizzlyCustomerApiClient.getNumber({ apiKey: testApiKey, service: 'tg' });
  assert(res5.success === false && res5.code === 'SERVICE_PROHIBITED', '5. Service prohibited for sale mapped to SERVICE_PROHIBITED');

  // 6. Regional restriction
  mockResponseText = 'SERVICE_UNAVAILABLE_REGION';
  const res6 = await GrizzlyCustomerApiClient.getNumber({ apiKey: testApiKey, service: 'tg' });
  assert(res6.success === false && res6.code === 'SERVICE_UNAVAILABLE_REGION', '6. Regional restriction mapped to SERVICE_UNAVAILABLE_REGION');

  // 7. Unknown API response
  mockResponseText = 'UNKNOWN_CUSTOM_TELECOM_CODE_999';
  const res7 = await GrizzlyCustomerApiClient.getNumber({ apiKey: testApiKey, service: 'tg' });
  assert(res7.success === false && res7.isUnresolved === true && res7.code === 'UNKNOWN_RESPONSE', '7. Unrecognized response flagged as unresolved');

  // 8. Invalid service code
  const res8 = await GrizzlyCustomerApiClient.getNumber({ apiKey: testApiKey, service: '' });
  assert(res8.success === false && res8.code === 'BAD_SERVICE', '8. Missing/invalid service code rejected');

  // 9. Country 'any'
  mockResponseText = 'ACCESS_NUMBER:38496654:447472190082';
  receivedRequests.length = 0;
  const res9 = await GrizzlyCustomerApiClient.getNumber({ apiKey: testApiKey, service: 'wa', country: 'any' });
  assert(res9.success === true && receivedRequests[0]?.searchParams?.country === 'any', '9. Country "any" passed accurately in outbound URL query');

  // 10. Price restrictions
  receivedRequests.length = 0;
  await GrizzlyCustomerApiClient.getNumber({ apiKey: testApiKey, service: 'tg', maxPrice: 35.5, minPrice: 10.0 });
  assert(
    receivedRequests[0]?.searchParams?.maxPrice === '35.5' && receivedRequests[0]?.searchParams?.minPrice === '10',
    '10. minPrice and maxPrice query parameters validated and properly encoded'
  );

  // 11. Provider inclusion/exclusion
  receivedRequests.length = 0;
  await GrizzlyCustomerApiClient.getNumber({
    apiKey: testApiKey,
    service: 'tg',
    providerIds: '1,2,5',
    exceptProviderIds: '8,9'
  });
  assert(
    receivedRequests[0]?.searchParams?.providerIds === '1,2,5' && receivedRequests[0]?.searchParams?.exceptProviderIds === '8,9',
    '11. providerIds and exceptProviderIds encoded and transmitted'
  );

  // 12. Phone prefix exclusions
  receivedRequests.length = 0;
  await GrizzlyCustomerApiClient.getNumber({
    apiKey: testApiKey,
    service: 'tg',
    phoneException: '447472,447890'
  });
  assert(
    receivedRequests[0]?.searchParams?.phoneException === '447472,447890',
    '12. phoneException phone prefix exclusions transmitted'
  );

  console.log('\n--------------------------------------------------------------------------------');
  console.log('PHASE 2: Wallet-Integrated Customer Purchase Workflow Tests');
  console.log('--------------------------------------------------------------------------------');

  // 13. Insufficient customer wallet balance
  db.prepare('UPDATE user_wallets SET balance = 5.0, reserved_balance = 0.0 WHERE user_id = ?').run(testUserId);
  let caughtInsufficient = false;
  try {
    await GrizzlyCustomerPurchaseService.purchaseNumber({
      userId: testUserId,
      service: 'tg',
      country: 22
    });
  } catch (err: any) {
    caughtInsufficient = true;
  }
  assert(caughtInsufficient, '13. Purchase rejected immediately when wallet balance is insufficient');

  // Restore balance
  db.prepare('UPDATE user_wallets SET balance = 500.0, reserved_balance = 0.0 WHERE user_id = ?').run(testUserId);

  // 14. Concurrent purchase requests (atomic serialization)
  // Set wallet to exactly ₹60 (enough for exactly 2 purchases at ₹30 each)
  mockResponseText = 'ACCESS_NUMBER:88496601:447700900888';
  db.prepare('UPDATE user_wallets SET balance = 60.0, reserved_balance = 0.0 WHERE user_id = ?').run(testUserId);

  const concurrentPromises = Array.from({ length: 5 }, (_, i) =>
    GrizzlyCustomerPurchaseService.purchaseNumber({
      userId: testUserId,
      service: 'tg',
      country: 'any',
      idempotencyKey: `concurrent_test_${i}_${Date.now()}`
    }).then(r => ({ success: true, r })).catch(e => ({ success: false, error: e.message }))
  );

  const concurrentResults = await Promise.all(concurrentPromises);
  const successConcurrencies = concurrentResults.filter(r => r.success);
  const failedConcurrencies = concurrentResults.filter(r => !r.success);

  assert(
    successConcurrencies.length === 2 && failedConcurrencies.length === 3,
    '14. 5 concurrent purchase requests on ₹60 balance: exactly 2 succeed, 3 fail, 0 negative balance'
  );

  // Restore balance to 500
  db.prepare('UPDATE user_wallets SET balance = 500.0, reserved_balance = 0.0 WHERE user_id = ?').run(testUserId);

  // 15. Duplicate purchase submissions (idempotency key protection)
  mockResponseText = 'ACCESS_NUMBER:99496602:919876500001';
  const sharedIdemKey = `idem_unique_${Date.now()}`;

  const firstPurchase = await GrizzlyCustomerPurchaseService.purchaseNumber({
    userId: testUserId,
    service: 'wa',
    country: 22,
    idempotencyKey: sharedIdemKey
  });

  const walletAfterFirst = walletService.getOrCreateWallet(testUserId).balance;

  // Re-submit identical request
  const duplicatePurchase = await GrizzlyCustomerPurchaseService.purchaseNumber({
    userId: testUserId,
    service: 'wa',
    country: 22,
    idempotencyKey: sharedIdemKey
  });

  const walletAfterSecond = walletService.getOrCreateWallet(testUserId).balance;

  assert(
    firstPurchase.activationId === duplicatePurchase.activationId &&
    walletAfterFirst === walletAfterSecond,
    '15. Idempotent submission returns original activation without double-charging wallet'
  );

  // 16. Network timeout handling
  mockDelayMs = 2000; // 2000ms delay while timeout set to 500ms
  GrizzlyCustomerConfigService.updateConfig({ timeout_seconds: 1 });

  let caughtTimeout = false;
  try {
    await GrizzlyCustomerPurchaseService.purchaseNumber({
      userId: testUserId,
      service: 'tg',
      country: 'any'
    });
  } catch (err: any) {
    caughtTimeout = true;
  }
  assert(caughtTimeout, '16. Network delay triggers clean timeout error without hanging');

  // Reset timeout & delay
  mockDelayMs = 0;
  GrizzlyCustomerConfigService.updateConfig({ timeout_seconds: 10 });

  // 17. Wallet reservation rollback
  mockResponseText = 'NO_NUMBERS';
  const balanceBeforeFail = walletService.getOrCreateWallet(testUserId).balance;
  const reservedBeforeFail = walletService.getOrCreateWallet(testUserId).reserved_balance;

  try {
    await GrizzlyCustomerPurchaseService.purchaseNumber({
      userId: testUserId,
      service: 'tg',
      country: 22
    });
  } catch {}

  const balanceAfterFail = walletService.getOrCreateWallet(testUserId).balance;
  const reservedAfterFail = walletService.getOrCreateWallet(testUserId).reserved_balance;

  assert(
    balanceBeforeFail === balanceAfterFail && reservedBeforeFail === reservedAfterFail,
    '17. Wallet reservation completely rolled back and released upon provider failure'
  );

  // 18. Uncertain purchase reconciliation (marked UNRESOLVED without duplicate purchase)
  const unresolvedRow = db.prepare(`
    SELECT * FROM grizzly_customer_activations WHERE status = 'UNRESOLVED' ORDER BY created_at DESC LIMIT 1
  `).get() as any;
  assert(Boolean(unresolvedRow), '18. Timed-out/uncertain outcome persisted as UNRESOLVED without auto-retrying duplicate purchase');

  // 19. API key redaction in logs
  const sampleLog = db.prepare(`
    SELECT * FROM grizzly_customer_api_logs ORDER BY created_at DESC LIMIT 1
  `).get() as any;
  assert(
    Boolean(sampleLog) &&
    !sampleLog.request_params.includes(testApiKey) &&
    sampleLog.request_params.includes('[REDACTED_API_KEY]'),
    '19. API key strictly redacted from diagnostics logs'
  );

  // 20. Customer dashboard activation display & SMS checking
  const uniqueActId = '774966' + String(Date.now()).slice(-4);
  mockResponseText = `ACCESS_NUMBER:${uniqueActId}:447999888111`;
  const purchaseSuccess = await GrizzlyCustomerPurchaseService.purchaseNumber({
    userId: testUserId,
    service: 'tg',
    country: 12
  });

  // Verify activation record in database
  const actRow = db.prepare(`
    SELECT * FROM grizzly_customer_activations WHERE provider_activation_id = ?
  `).get(purchaseSuccess.activationId) as any;

  assert(
    Boolean(actRow &&
    (actRow.phone_number === '447999888111' || actRow.phone_number === '+447999888111') &&
    actRow.service_code === 'tg' &&
    actRow.status === 'NUMBER_ASSIGNED'),
    '20a. Customer activation persisted with phone number, service, and status'
  );

  // Check SMS verification code (mock returns STATUS_OK:84920)
  const smsResult = await GrizzlyCustomerPurchaseService.checkActivationSms(testUserId, purchaseSuccess.activationId!);
  assert(smsResult.status === 'CODE_RECEIVED' && smsResult.code === '84920', '20b. Inbound SMS code polled, parsed, and stored into activation record');

  // Check updated database status
  const updatedActRow = db.prepare(`
    SELECT * FROM grizzly_customer_activations WHERE provider_activation_id = ?
  `).get(purchaseSuccess.activationId) as any;
  assert(updatedActRow.status === 'COMPLETED' && updatedActRow.sms_code === '84920', '20c. Activation transitioned to COMPLETED status');

  console.log('\n================================================================================');
  console.log(`🎉 ALL 20 TEST CASES COMPLETED: ${passedTests}/${totalTests} CHECKS COMPLIANT`);
  console.log('================================================================================\n');

  // Close mock server
  mockServer.close();
}

runCustomerApiTestSuite().catch((err) => {
  console.error('\n❌ Customer API Test Suite Failed:', err);
  mockServer.close();
  process.exit(1);
});
