import { getDatabase } from '../db/database.js';
import { FiveSimConfigService } from '../services/virtualNumber/fivesim/FiveSimConfigService.js';
import { FiveSimUserService } from '../services/virtualNumber/fivesim/FiveSimUserService.js';
import { FiveSimPriceLimitsService } from '../services/virtualNumber/fivesim/FiveSimPriceLimitsService.js';
import { ProviderRegistry } from '../services/virtualNumber/ProviderRegistry.js';
import { FIVESIM_RATING_POINTS, FIVESIM_LIMITS } from '../services/virtualNumber/fivesim/types.js';

async function runTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING 5SIM INTEGRATION TEST SUITE (PARTS 0 - 3)');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${desc}`);
      failed++;
    }
  }

  const db = getDatabase();

  // Test 1: Database tables created
  console.log('\n--- Test Group 1: Database Schema & Provider Registration (Part 0) ---');
  const configTable = db.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='fivesim_provider_config'").get() as any;
  assert(configTable.count === 1, 'Table fivesim_provider_config exists');

  const ordersTable = db.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='fivesim_orders'").get() as any;
  assert(ordersTable.count === 1, 'Table fivesim_orders exists');

  const paymentsTable = db.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='fivesim_payments'").get() as any;
  assert(paymentsTable.count === 1, 'Table fivesim_payments exists');

  const maxPricesTable = db.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='fivesim_max_prices'").get() as any;
  assert(maxPricesTable.count === 1, 'Table fivesim_max_prices exists');

  const providerRow = db.prepare("SELECT * FROM virtual_number_providers WHERE slug = 'fivesim'").get() as any;
  assert(providerRow !== undefined && providerRow.slug === 'fivesim', '5SIM provider registered in virtual_number_providers');

  // Test 2: Rating & Limits Constants (Part 1)
  console.log('\n--- Test Group 2: Limits & Rating System Constants (Part 1) ---');
  assert(FIVESIM_LIMITS.MAX_REQUESTS_PER_SECOND === 100, 'Max requests limit is 100 req/sec');
  assert(FIVESIM_LIMITS.BAN_DURATION_MINUTES === 10, 'Temporary ban duration is 10 minutes');
  assert(FIVESIM_RATING_POINTS.INITIAL_RATING === 96, 'Initial rating starts at 96');
  assert(FIVESIM_RATING_POINTS.ACCOUNT_REPLENISHMENT === 8, 'Account replenishment gives +8 rating points');
  assert(FIVESIM_RATING_POINTS.COMPLETED_BEFORE_CODE_ELAPSED === 0.5, 'Quick code finish gives +0.5 rating points');
  assert(FIVESIM_RATING_POINTS.TIMEOUT === -0.15, 'Timeout penalizes -0.15 rating points');
  assert(FIVESIM_RATING_POINTS.CANCELED_PURCHASE === -0.1, 'Canceled purchase penalizes -0.1 rating points');

  // Test 3: Provider Registry (Part 0/1)
  console.log('\n--- Test Group 3: Provider Registry Integration ---');
  const registry = ProviderRegistry.getInstance();
  const fivesimAdapter = registry.getProvider('fivesim');
  assert(fivesimAdapter !== undefined, 'FiveSimProviderAdapter retrieved from ProviderRegistry');
  assert(fivesimAdapter.providerId === 'fivesim', 'Adapter providerId is fivesim');
  assert(!fivesimAdapter.isMock, 'Adapter is registered as real provider (isMock = false)');

  // Test 4: Configuration Service (Part 1)
  console.log('\n--- Test Group 4: 5SIM Config Service ---');
  const configService = FiveSimConfigService.getInstance();
  const config = configService.getConfig();
  assert(config !== null, 'Config service loads active configuration');
  assert(config?.baseUrl === 'https://5sim.net/v1', 'Config baseUrl defaults to https://5sim.net/v1');

  // Test 5: User Service Orders Caching (Part 2.2)
  console.log('\n--- Test Group 5: User Orders Caching & Retrieval (Part 2.2) ---');
  const userService = new FiveSimUserService();

  const testOrders: any[] = [
    {
      id: 999901,
      phone: '+447350690991',
      operator: 'vodafone',
      product: 'whatsapp',
      price: 25.5,
      status: 'FINISHED',
      expires: '2026-11-15T18:00:00Z',
      sms: [
        {
          id: 101,
          created_at: '2026-11-15T17:45:00Z',
          date: '2026-11-15T17:44:00Z',
          sender: 'WhatsApp',
          text: 'Your WhatsApp code: 492-104',
          code: '492104'
        }
      ],
      created_at: '2026-11-15T17:40:00Z',
      country: 'england'
    },
    {
      id: 999902,
      phone: '+12025550188',
      operator: 'virtual60',
      product: 'telegram',
      price: 18.0,
      status: 'RECEIVED',
      expires: '2026-11-15T18:15:00Z',
      sms: [],
      created_at: '2026-11-15T17:50:00Z',
      country: 'usa'
    }
  ];

  userService.saveOrdersToDb('activation', testOrders);
  const cachedOrders = userService.getCachedOrders({ category: 'activation', search: 'whatsapp' });
  assert(cachedOrders.total >= 1, 'Cached activation order found by product search');
  assert(cachedOrders.rows[0].product === 'whatsapp', 'Cached order product matches');
  assert(cachedOrders.rows[0].sms?.length === 1, 'Cached order parsed nested SMS array properly');
  assert(cachedOrders.rows[0].sms?.[0].code === '492104', 'Cached SMS code retrieved accurately');

  // Test 6: User Service Payments Caching (Part 2.3)
  console.log('\n--- Test Group 6: User Payments Caching & Retrieval (Part 2.3) ---');
  const testPayments: any[] = [
    {
      ID: 888801,
      TypeName: 'charge',
      ProviderName: 'payeer',
      Amount: 500,
      Balance: 1250,
      CreatedAt: '2026-11-15T16:00:00Z'
    }
  ];
  userService.savePaymentsToDb(testPayments);
  const cachedPayments = userService.getCachedPayments({ limit: 10 });
  assert(cachedPayments.total >= 1, 'Cached payment record retrieved');
  const payRecord = cachedPayments.rows.find((p) => p.ID === 888801);
  assert(payRecord !== undefined, 'Specific payment record ID 888801 found');
  assert(payRecord?.Amount === 500, 'Payment amount matches 500');

  // Test 7: Max Prices Service (Part 3)
  console.log('\n--- Test Group 7: Price Limits (Max Prices) Management (Part 3) ---');
  const priceLimitsService = new FiveSimPriceLimitsService();

  const sampleLimits: any[] = [
    { id: 1, product: 'whatsapp', price: 30, CreatedAt: '2026-11-15T12:00:00Z' },
    { id: 2, product: 'telegram', price: 20, CreatedAt: '2026-11-15T12:00:00Z' }
  ];
  priceLimitsService.saveMaxPricesToDb(sampleLimits);

  const cachedLimits = priceLimitsService.getCachedMaxPrices();
  assert(cachedLimits.length === 2, 'Max prices cached correctly (count = 2)');
  assert(cachedLimits.some((l) => l.product === 'whatsapp' && l.price === 30), 'WhatsApp max price limit verified');

  // Test local delete simulation
  db.prepare("DELETE FROM fivesim_max_prices WHERE product = 'telegram'").run();
  const limitsAfterDel = priceLimitsService.getCachedMaxPrices();
  assert(limitsAfterDel.length === 1, 'Max price limit deleted properly');

  // Clean test fixtures
  db.prepare('DELETE FROM fivesim_orders WHERE id IN (999901, 999902)').run();
  db.prepare('DELETE FROM fivesim_payments WHERE id = 888801').run();
  db.prepare('DELETE FROM fivesim_max_prices WHERE id IN (1, 2)').run();

  console.log('\n====================================================');
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});

