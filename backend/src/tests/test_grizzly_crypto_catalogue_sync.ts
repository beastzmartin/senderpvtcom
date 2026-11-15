import http from 'http';
import crypto from 'crypto';
import { initDatabase, getDatabase } from '../db/database.js';
import { GrizzlyCustomerApiClient } from '../services/virtualNumber/grizzly/GrizzlyCustomerApiClient.js';
import { GrizzlyCustomerConfigService } from '../services/virtualNumber/grizzly/GrizzlyCustomerConfigService.js';
import { GrizzlyCryptoFundingService } from '../services/virtualNumber/grizzly/GrizzlyCryptoFundingService.js';
import { GrizzlyCatalogSyncService } from '../services/virtualNumber/grizzly/GrizzlyCatalogSyncService.js';
import { GrizzlyCustomerPricingService } from '../services/virtualNumber/grizzly/GrizzlyCustomerPricingService.js';
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

// Mock HTTP Server simulating GrizzlySMS endpoints:
// - /public/crypto/wallet
// - /stubs/handler_api.php
let mockResponseBody: any = '';
let mockContentType = 'application/json';
let mockStatusCode = 200;
let mockDelayMs = 0;
const receivedRequests: any[] = [];

const mockServer = http.createServer((req, res) => {
  const urlObj = new URL(req.url || '', `http://${req.headers.host}`);
  receivedRequests.push({
    method: req.method,
    url: req.url,
    pathname: urlObj.pathname,
    searchParams: Object.fromEntries(urlObj.searchParams.entries())
  });

  const reply = () => {
    res.writeHead(mockStatusCode, { 'Content-Type': mockContentType });
    if (typeof mockResponseBody === 'object') {
      res.end(JSON.stringify(mockResponseBody));
    } else {
      res.end(String(mockResponseBody));
    }
  };

  if (mockDelayMs > 0) {
    setTimeout(reply, mockDelayMs);
  } else {
    reply();
  }
});

async function runCryptoCatalogueSyncTestSuite() {
  console.log('================================================================================');
  console.log('🐻 GRIZZLYSMS — CRYPTO WALLET, SERVICE CATALOGUE & MULTILINGUAL SYNC TEST SUITE');
  console.log('================================================================================\n');

  initDatabase();
  const db = getDatabase();
  const walletService = WalletService.getInstance();

  const MOCK_PORT = 4996;
  await new Promise<void>((resolve) => {
    mockServer.listen(MOCK_PORT, '127.0.0.1', () => resolve());
  });

  const mockBaseUrl = `http://127.0.0.1:${MOCK_PORT}/stubs/handler_api.php`;
  const testApiKey = 'grizzly_secret_api_key_test_crypto_sync_99';

  // Seed customer config pointing to mock server
  GrizzlyCustomerConfigService.updateConfig({
    is_enabled: true,
    api_key: testApiKey,
    base_url: mockBaseUrl,
    timeout_seconds: 5,
    markup_percentage: 25.0,
    fixed_fee: 5.0,
    crypto_threshold_usd: 50.0
  });

  // Create isolated test user
  const testUserId = `test_crypto_user_${Date.now()}`;
  db.prepare(`
    INSERT INTO users (id, username, name, email, password_hash, role)
    VALUES (?, ?, 'Crypto User', ?, 'hash', 'user')
  `).run(testUserId, `usr_${Date.now()}`, `user_${Date.now()}@example.com`);
  walletService.getOrCreateWallet(testUserId);
  walletService.topUp(testUserId, 200.0, 'Initial Test Balance');

  try {
    // ============================================================================
    // SECTION 1: STATIC CRYPTO WALLET FOR PAYMENT (MODULE 1)
    // ============================================================================
    console.log('--------------------------------------------------------------------------------');
    console.log('SECTION 1: getStaticCryptoWallet & Deposit Security');
    console.log('--------------------------------------------------------------------------------');

    // 1.1 Successful wallet response
    mockStatusCode = 200;
    mockContentType = 'application/json';
    mockResponseBody = {
      wallet_address: "TReiqL2AkD1euTgjXmrtKLnwDAbNPgTstU"
    };

    receivedRequests.length = 0;
    const walletRes = await GrizzlyCustomerApiClient.getStaticCryptoWallet({
      apiKey: testApiKey,
      coin: 'usdt',
      network: 'tron'
    });

    assert(walletRes.success === true, '1.1a. getStaticCryptoWallet reports success = true on valid response');
    assert(walletRes.walletAddress === 'TReiqL2AkD1euTgjXmrtKLnwDAbNPgTstU', '1.1b. Valid TRC-20 wallet address parsed');
    assert(walletRes.coin === 'usdt' && walletRes.network === 'tron', '1.1c. Asset coin USDT and network tron preserved');
    assert(receivedRequests[0]?.pathname === '/public/crypto/wallet', '1.1d. Dispatched to official /public/crypto/wallet path');
    assert(receivedRequests[0]?.searchParams?.coin === 'usdt', '1.1e. Outbound query encoded coin parameter');
    assert(receivedRequests[0]?.searchParams?.network === 'tron', '1.1f. Outbound query encoded network parameter');

    // 1.2 Missing or empty wallet address
    mockResponseBody = { wallet_address: "" };
    const emptyWalletRes = await GrizzlyCustomerApiClient.getStaticCryptoWallet({ apiKey: testApiKey });
    assert(emptyWalletRes.success === false, '1.2. Empty wallet address returned by provider flagged as failure');

    // 1.3 Invalid / non-JSON response
    mockContentType = 'text/plain';
    mockResponseBody = 'ERROR_GATEWAY_TIMEOUT';
    const nonJsonRes = await GrizzlyCustomerApiClient.getStaticCryptoWallet({ apiKey: testApiKey });
    assert(nonJsonRes.success === false, '1.3. Malformed/non-JSON provider response rejected');

    // 1.4 Missing API key
    const missingKeyRes = await GrizzlyCustomerApiClient.getStaticCryptoWallet({ apiKey: '' });
    assert(missingKeyRes.success === false && Boolean(missingKeyRes.error?.includes('Missing')), '1.4. Missing API key rejected prior to outbound call');

    // 1.5 Network timeout handling
    mockDelayMs = 150;
    const oldTimeout = GrizzlyCustomerConfigService.getConfig(false).timeout_seconds;
    db.prepare("UPDATE grizzly_customer_config SET timeout_seconds = 0.05 WHERE id = 'default'").run(); // 50ms timeout
    const timeoutRes = await GrizzlyCustomerApiClient.getStaticCryptoWallet({ apiKey: testApiKey });
    assert(timeoutRes.success === false && Boolean(timeoutRes.error?.includes('timed out')), '1.5. Slow network triggers clean timeout error without hanging');
    mockDelayMs = 0;
    db.prepare("UPDATE grizzly_customer_config SET timeout_seconds = ? WHERE id = 'default'").run(oldTimeout || 5);

    // 1.6 Refresh address and persistence in config and crypto history
    mockStatusCode = 200;
    mockContentType = 'application/json';
    mockResponseBody = { wallet_address: "TRefreshAddress998877665544332211" };

    const refreshRes = await GrizzlyCryptoFundingService.refreshCryptoWallet({ coin: 'usdt', network: 'tron', apiKey: testApiKey });
    assert(refreshRes.success === true, '1.6a. refreshCryptoWallet returns success');
    assert(refreshRes.walletInfo?.walletAddress === 'TRefreshAddress998877665544332211', '1.6b. Refreshed address stored in active info');

    const configAfter = GrizzlyCustomerConfigService.getConfig(false);
    assert(configAfter.crypto_wallet_address === 'TRefreshAddress998877665544332211', '1.6c. Master address persisted in grizzly_customer_config');

    const history = GrizzlyCryptoFundingService.getWalletHistory(5);
    assert(history.length >= 1 && history[0].wallet_address === 'TRefreshAddress998877665544332211', '1.6d. Address verification logged to grizzly_crypto_wallets history table');

    // 1.7 Payment threshold configuration (default $50 USD)
    const walletInfo = GrizzlyCryptoFundingService.getCryptoWalletInfo();
    assert(walletInfo.automaticCreditThresholdUsd === 50, '1.7a. Default automatic credit threshold is $50 USD');
    assert(walletInfo.warnings.some(w => w.includes('$50 USD')), '1.7b. Clear warning displayed regarding $50 USD threshold');

    GrizzlyCryptoFundingService.updateThreshold(100);
    const updatedWalletInfo = GrizzlyCryptoFundingService.getCryptoWalletInfo();
    assert(updatedWalletInfo.automaticCreditThresholdUsd === 100, '1.7c. Automatic credit threshold successfully updated to $100');

    // 1.8 Financial isolation: customer wallet balance is NEVER credited by crypto address retrieval
    const balanceBefore = walletService.getOrCreateWallet(testUserId).balance;
    GrizzlyCryptoFundingService.getCryptoWalletInfo();
    await GrizzlyCryptoFundingService.refreshCryptoWallet({ apiKey: testApiKey });
    const balanceAfter = walletService.getOrCreateWallet(testUserId).balance;
    assert(balanceBefore === balanceAfter, '1.8. Financial security verified: customer wallet balance remains strictly unaffected by master deposit address retrieval');

    // ============================================================================
    // SECTION 2: AUTOMATIC GET SERVICES LIST (MODULE 2)
    // ============================================================================
    console.log('\n--------------------------------------------------------------------------------');
    console.log('SECTION 2: getServicesList & Services Catalogue Sync');
    console.log('--------------------------------------------------------------------------------');

    // Ensure kt is active before testing
    db.prepare("UPDATE grizzly_services SET is_active = 1, status = 'active' WHERE provider_service_code = 'kt'").run();

    // 2.1 Successful service import
    mockStatusCode = 200;
    mockContentType = 'application/json';
    mockResponseBody = {
      status: "success",
      services: [
        { code: "kt", name: "KakaoTalk" },
        { code: "tg", name: "Telegram" },
        { code: "wa", name: "WhatsApp" },
        { code: "novel_svc", name: "Novel App Service" }, // Newly discovered service
        { code: "kt", name: "KakaoTalk Duplicate" }, // Duplicate code in response
        { code: "", name: "Invalid Empty Code" }      // Invalid code
      ]
    };

    const servicesApiRes = await GrizzlyCustomerApiClient.getServicesList(testApiKey);
    assert(servicesApiRes.success === true, '2.1a. getServicesList parses success response');
    assert(servicesApiRes.services.length === 4, '2.1b. Parsed exactly 4 valid unique services (duplicates and empty codes filtered)');
    assert(servicesApiRes.services[0].code === 'kt' && servicesApiRes.services[0].name === 'KakaoTalk', '2.1c. KakaoTalk code kt and official name parsed');

    // Run catalog sync
    const syncServicesRes = await GrizzlyCatalogSyncService.syncServicesCatalogue(testApiKey);
    assert(syncServicesRes.success === true, '2.2a. syncServicesCatalogue completed successfully');
    assert(syncServicesRes.inserted >= 1 || syncServicesRes.updated >= 1 || syncServicesRes.unchanged >= 1, '2.2b. Upserted official service records');

    // Verify database record
    const ktRow = db.prepare('SELECT * FROM grizzly_services WHERE provider_service_code = ?').get('kt') as any;
    assert(ktRow !== undefined, '2.2c. KakaoTalk persisted in grizzly_services');
    assert(ktRow.service_name === 'KakaoTalk', '2.2d. Official name KakaoTalk preserved');
    assert(ktRow.provider === 'grizzlysms', '2.2e. Source provider marked as grizzlysms');
    assert(ktRow.status === 'active', '2.2f. Service status initialized as active');

    // 2.3 Protection of custom admin display name override
    db.prepare(`
      UPDATE grizzly_services
      SET display_name = 'KakaoTalk Premium VIP'
      WHERE provider_service_code = 'kt'
    `).run();

    // Re-sync services with original official name
    await GrizzlyCatalogSyncService.syncServicesCatalogue(testApiKey);
    const ktRowAfterSync = db.prepare('SELECT * FROM grizzly_services WHERE provider_service_code = ?').get('kt') as any;
    assert(ktRowAfterSync.service_name === 'KakaoTalk', '2.3a. Official provider name retained without change');
    assert(ktRowAfterSync.display_name === 'KakaoTalk Premium VIP', '2.3b. Custom admin display name preserved and protected from overwrite');

    // 2.4 Service deactivation: missing service from complete successful catalogue marked inactive/review instead of deleted
    mockResponseBody = {
      status: "success",
      services: [
        { code: "tg", name: "Telegram" },
        { code: "wa", name: "WhatsApp" }
        // "kt" omitted
      ]
    };

    const deactSync = await GrizzlyCatalogSyncService.syncServicesCatalogue(testApiKey);
    assert(deactSync.markedInactive >= 1, '2.4a. Disappeared service detected and marked inactive');
    const ktDeactivated = db.prepare('SELECT * FROM grizzly_services WHERE provider_service_code = ?').get('kt') as any;
    assert(ktDeactivated.is_active === 0, '2.4b. Disappeared service is_active set to 0');
    assert(ktDeactivated.status === 'review_required', '2.4c. Disappeared service status transitioned to review_required');

    // 2.5 API failure resilience: existing catalogue is NEVER deleted on provider failure
    mockStatusCode = 500;
    mockResponseBody = 'SERVER_ERROR';
    let failedCleanly = false;
    try {
      await GrizzlyCatalogSyncService.syncServicesCatalogue(testApiKey);
    } catch {
      failedCleanly = true;
    }
    const ktStillExists = db.prepare('SELECT * FROM grizzly_services WHERE provider_service_code = ?').get('kt') as any;
    assert(ktStillExists !== undefined, '2.5. Catalogue integrity preserved: existing services retained during temporary API failure');

    // ============================================================================
    // SECTION 3: MULTILINGUAL COUNTRIES CATALOGUE (MODULE 3)
    // ============================================================================
    console.log('\n--------------------------------------------------------------------------------');
    console.log('SECTION 3: getCountries & Multilingual Translation Engine');
    console.log('--------------------------------------------------------------------------------');

    mockStatusCode = 200;
    mockContentType = 'application/json';
    mockResponseBody = [
      {
        id: 112,
        rus: "Панама",
        eng: "Panama",
        chn: "巴拿马",
        tur: "Panama",
        spa: "Panamá",
        hin: "पनामा",
        ara: "بنما",
        fra: "Panama"
      },
      {
        id: 22,
        rus: "Индия",
        eng: "India",
        chn: "印度",
        tur: "Hindistan",
        spa: "India",
        hin: "भारत",
        ara: "الهند",
        fra: "Inde"
      },
      {
        id: 10351, // Special ID > 10000
        eng: "Singapore",
        rus: "Сингапур"
      }
    ];

    const countriesApiRes = await GrizzlyCustomerApiClient.getCountries(testApiKey);
    assert(countriesApiRes.success === true, '3.1a. getCountries parses multilingual country list');
    assert(countriesApiRes.countries.length === 3, '3.1b. Parsed all 3 country objects');
    assert(countriesApiRes.countries[0].id === 112, '3.1c. Official country ID 112 preserved as number');
    assert(countriesApiRes.countries[0].hin === 'पनामा', '3.1d. Hindi translation "पनामा" preserved');
    assert(countriesApiRes.countries[0].ara === 'بنما', '3.1e. Arabic translation "بنما" preserved');
    assert(countriesApiRes.countries[0].chn === '巴拿马', '3.1f. Chinese translation "巴拿马" preserved');
    assert(countriesApiRes.countries[2].id === 10351, '3.1g. High special numeric ID 10351 preserved without truncation');

    // Run country sync
    const syncCountriesRes = await GrizzlyCatalogSyncService.syncCountriesCatalogue(testApiKey);
    assert(syncCountriesRes.success === true, '3.2a. syncCountriesCatalogue executed cleanly');
    assert(syncCountriesRes.inserted >= 1 || syncCountriesRes.updated >= 1 || syncCountriesRes.unchanged >= 1, '3.2b. Inserted/updated country rows');

    // Multilingual resolution test
    const indiaRow = db.prepare('SELECT * FROM grizzly_countries WHERE provider_country_id = 22').get() as any;
    assert(indiaRow !== undefined, '3.3a. India (22) stored in grizzly_countries');

    const nameHin = GrizzlyCatalogSyncService.resolveLocalizedCountryName(indiaRow, 'hin');
    assert(nameHin === 'भारत', '3.3b. Hindi localized name resolves to "भारत"');

    const nameFra = GrizzlyCatalogSyncService.resolveLocalizedCountryName(indiaRow, 'fra');
    assert(nameFra === 'Inde', '3.3c. French localized name resolves to "Inde"');

    const nameEng = GrizzlyCatalogSyncService.resolveLocalizedCountryName(indiaRow, 'eng');
    assert(nameEng === 'India', '3.3d. English localized name resolves to "India"');

    // 3.4 Language fallback order: User selected -> English -> Custom name -> Official ID
    const panamaRow = {
      provider_country_id: 112,
      country_name: 'Panama',
      eng: 'Panama',
      rus: 'Панама',
      custom_display_name: 'Panama Express'
    };
    // Language with missing translation falls back to English
    const fallbackTur = GrizzlyCatalogSyncService.resolveLocalizedCountryName(panamaRow, 'tur');
    assert(fallbackTur === 'Panama', '3.4a. Missing Turkish translation falls back to English');

    // Missing English falls back to custom display name
    const missingEngRow = { provider_country_id: 999, custom_display_name: 'Custom Isle' };
    const fallbackCustom = GrizzlyCatalogSyncService.resolveLocalizedCountryName(missingEngRow, 'spa');
    assert(fallbackCustom === 'Custom Isle', '3.4b. Missing translations fall back to custom display name');

    // Missing everything falls back to Official ID string
    const bareRow = { provider_country_id: 777 };
    const fallbackId = GrizzlyCatalogSyncService.resolveLocalizedCountryName(bareRow, 'chn');
    assert(fallbackId === 'Country 777', '3.4c. Final fallback resolves to "Country 777"');

    // 3.5 Multilingual search
    const searchHin = GrizzlyCatalogSyncService.searchCountries({ query: 'भारत' });
    assert(searchHin.rows.length >= 1 && searchHin.rows[0].provider_country_id === 22, '3.5a. Country found by searching in Hindi "भारत"');

    const searchId = GrizzlyCatalogSyncService.searchCountries({ query: '112' });
    assert(searchId.rows.length >= 1 && searchId.rows[0].provider_country_id === 112, '3.5b. Country found by searching exact official ID 112');

    // ============================================================================
    // SECTION 4: UNIFIED SERVICE-COUNTRY AVAILABILITY (MODULE 4)
    // ============================================================================
    console.log('\n--------------------------------------------------------------------------------');
    console.log('SECTION 4: Unified Availability Model & Purchase Mapping');
    console.log('--------------------------------------------------------------------------------');

    // Clean existing price record for India + Telegram and insert canonical entry
    db.prepare(`DELETE FROM grizzly_customer_prices WHERE country_id = '22' AND service_code = 'tg'`).run();
    db.prepare(`
      INSERT INTO grizzly_customer_prices (
        id, country_id, country_name, service_code, service_name, pricing_source,
        overall_price, overall_quantity, providers_data, lowest_provider_price, highest_provider_price,
        raw_response, last_synced_at, created_at, updated_at
      ) VALUES (
        '22_tg', '22', 'India', 'tg', 'Telegram', 'getPricesV3',
        0.30, 45, '[{"providerId":1,"count":45,"lowestPrice":0.30}]', 0.30, 0.30,
        '{}', datetime('now'), datetime('now'), datetime('now')
      )
    `).run();

    const avail = GrizzlyCatalogSyncService.getUnifiedAvailability({
      countryId: '22',
      serviceCode: 'tg',
      lang: 'hin'
    });

    assert(avail.items.length === 1, '4.1a. Unified availability model returns matched pair');
    const matched = avail.items[0];
    assert(matched.countryId === 22, '4.1b. Official country ID 22 mapped');
    assert(matched.countryName === 'भारत', '4.1c. Localized Hindi country name "भारत" returned in availability model');
    assert(matched.serviceCode === 'tg', '4.1d. Official service code tg mapped');
    assert(matched.providerStock === 45, '4.1e. Live stock of 45 numbers verified');
    assert(matched.isAvailable === true, '4.1f. isAvailable flag set to true based on live stock > 0');
    assert(matched.customerSellingPrice > 0, '4.1g. Calculated selling price attached');

    // 4.2 Purchase request mapping: verify exact numerical country ID and service code are transmitted
    mockContentType = 'text/plain';
    mockResponseBody = 'ACCESS_NUMBER:554433221:919876543210';
    receivedRequests.length = 0;

    const purchaseRes = await GrizzlyCustomerPurchaseService.purchaseNumber({
      userId: testUserId,
      service: 'tg',
      country: 22,
      idempotencyKey: `pur_map_test_${Date.now()}`
    });

    assert(purchaseRes.success === true, '4.2a. Purchase executed successfully');
    const getNumReq = receivedRequests.find(r => r.searchParams?.action === 'getNumber' || r.searchParams?.action === 'getNumberV2');
    assert(getNumReq !== undefined, '4.2b. Dispatched getNumberV2 outbound call');
    assert(getNumReq.searchParams.country === '22', '4.2c. Outbound country parameter strictly set to official ID 22');
    assert(getNumReq.searchParams.service === 'tg', '4.2d. Outbound service parameter strictly set to official code tg');

    // ============================================================================
    // SECTION 5: DATA SYNCHRONIZATION CONTROL CENTER & WORKER LOCKS (MODULE 5)
    // ============================================================================
    console.log('\n--------------------------------------------------------------------------------');
    console.log('SECTION 5: Synchronization Control Center & Worker Locks');
    console.log('--------------------------------------------------------------------------------');

    const jobs = GrizzlyCatalogSyncService.getSyncJobsStatus();
    assert(jobs.length === 6, '5.1a. Control Center manages all 6 official synchronization jobs');
    const countriesJob = jobs.find(j => j.jobType === 'countries');
    assert(countriesJob?.status === 'completed', '5.1b. Countries job status reported as completed');
    const servicesJob = jobs.find(j => j.jobType === 'services');
    assert(servicesJob?.status === 'failed', '5.1c. Failed services sync accurately logged in Control Center');

    // 5.2 Worker locks: prevent conflicting concurrent sync execution
    db.prepare("UPDATE grizzly_sync_jobs SET is_locked = 1, locked_at = datetime('now') WHERE job_type = 'services'").run();
    let lockBlocked = false;
    try {
      await GrizzlyCatalogSyncService.syncServicesCatalogue(testApiKey);
    } catch (err: any) {
      if (err.message?.includes('already running')) {
        lockBlocked = true;
      }
    }
    assert(lockBlocked === true, '5.2. Worker lock strictly prevents conflicting concurrent sync runs');
    db.prepare("UPDATE grizzly_sync_jobs SET is_locked = 0, locked_at = NULL WHERE job_type = 'services'").run();

    // 5.3 Export functions
    const csvServices = GrizzlyCatalogSyncService.exportServices('csv');
    assert(csvServices.includes('Official Code') && csvServices.includes('"tg"'), '5.3a. Services successfully exported to CSV');

    const jsonServices = GrizzlyCatalogSyncService.exportServices('json');
    assert(JSON.parse(jsonServices).length >= 1, '5.3b. Services successfully exported to JSON');

    const csvCountries = GrizzlyCatalogSyncService.exportCountries('csv');
    assert(csvCountries.includes('Grizzly ID') && csvCountries.includes('22'), '5.3c. Countries successfully exported to CSV with multilingual headers');

    const jsonCountries = GrizzlyCatalogSyncService.exportCountries('json');
    assert(JSON.parse(jsonCountries).length >= 1, '5.3d. Countries successfully exported to JSON');

    console.log('\n================================================================================');
    console.log(`🎉 ALL TESTS COMPLETED: ${passedTests}/${totalTests} CHECKS COMPLIANT!`);
    console.log('================================================================================\n');
  } finally {
    mockServer.close();
  }
}

runCryptoCatalogueSyncTestSuite().catch((err) => {
  console.error('\n❌ Test Suite Crashed:', err);
  mockServer.close();
  process.exit(1);
});
