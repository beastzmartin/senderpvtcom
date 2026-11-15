import assert from 'assert';
import { getDatabase } from '../db/database.js';
import { initFiveSimDatabase } from '../db/fiveSimSchema.js';
import { FiveSimOrderService } from '../services/virtualNumber/fivesim/FiveSimOrderService.js';
import { FiveSimVendorService } from '../services/virtualNumber/fivesim/FiveSimVendorService.js';
import { FiveSimApiClient } from '../services/virtualNumber/fivesim/FiveSimApiClient.js';
import { FIVESIM_ORDER_STATUS_DESCRIPTIONS } from '../services/virtualNumber/fivesim/types.js';

async function runTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING 5SIM INTEGRATION TEST SUITE (PARTS 6 - 8)');
  console.log('====================================================\n');

  // Initialize DB
  const db = getDatabase();
  initFiveSimDatabase(db);

  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void) {
    try {
      fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  // --- Group 1: Part 6 Smart OTP Code Extraction & Status Descriptions ---
  console.log('--- Test Group 1: Smart OTP Regex Extraction (Part 6) ---');

  test('Extracts WhatsApp hyphenated code "123-456" from text', () => {
    const text = 'Your WhatsApp code: 492-183. Do not share this code with anyone.';
    const otp = FiveSimOrderService.extractOtpFromText(text);
    assert.strictEqual(otp, '492-183');
  });

  test('Extracts Google keyword prefix code "G-829104" or "829104" from text', () => {
    const text = 'G-829104 is your Google verification code.';
    const otp = FiveSimOrderService.extractOtpFromText(text);
    assert.ok(otp.includes('829104'));
  });

  test('Extracts Telegram standalone code "48192"', () => {
    const text = 'Telegram code: 48192. You can also tap on this link to log in.';
    const otp = FiveSimOrderService.extractOtpFromText(text);
    assert.strictEqual(otp, '48192');
  });

  test('Returns empty string when no OTP is in text', () => {
    const text = 'Welcome to the application! We are glad you joined us.';
    const otp = FiveSimOrderService.extractOtpFromText(text);
    assert.strictEqual(otp, '');
  });

  test('All 6 order statuses have valid descriptions and UI colors', () => {
    const statuses = ['PENDING', 'RECEIVED', 'CANCELED', 'TIMEOUT', 'FINISHED', 'BANNED'] as const;
    for (const s of statuses) {
      const desc = FIVESIM_ORDER_STATUS_DESCRIPTIONS[s];
      assert.ok(desc, `Description missing for ${s}`);
      assert.ok(desc.label, `Label missing for ${s}`);
      assert.ok(desc.color, `Color missing for ${s}`);
    }
  });

  // --- Group 2: Part 7 System Notifications & Flash Broadcasts ---
  console.log('\n--- Test Group 2: Flash Notifications (Part 7) ---');

  const client = new FiveSimApiClient();

  try {
    const flash = await client.getFlashNotifications('en');
    test('Flash notifications endpoint returns an object with text field', () => {
      assert.ok(typeof flash === 'object');
      assert.ok('text' in flash);
    });
  } catch (err: any) {
    console.log('  ⚠️ [SKIP] Live 5SIM flash test skipped (offline or network restriction)');
  }

  // --- Group 3: Part 8 Vendor Service, Prices & Payouts Database ---
  console.log('\n--- Test Group 3: Vendor Prices & Payouts (Part 8) ---');

  const vendorService = FiveSimVendorService.getInstance();

  test('Table fivesim_vendor_prices exists in SQLite', () => {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='fivesim_vendor_prices'").get();
    assert.ok(row, 'Table fivesim_vendor_prices must exist');
  });

  test('Table fivesim_vendor_payouts exists in SQLite', () => {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='fivesim_vendor_payouts'").get();
    assert.ok(row, 'Table fivesim_vendor_payouts must exist');
  });

  test('Creates and caches vendor price in database', () => {
    db.prepare(`
      INSERT INTO fivesim_vendor_prices (
        id, country_name, product_name, operator_name, price, count, rate, enabled, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET price = excluded.price
    `).run(99901, 'england', 'whatsapp', 'virtual59', 0.85, 500, 95.5);

    const cached = vendorService.getCachedVendorPrices({ product: 'whatsapp' });
    assert.ok(cached.total >= 1);
    const item = cached.rows.find((r) => r.ID === 99901);
    assert.ok(item, 'Vendor price #99901 not found');
    assert.strictEqual(item?.Price, 0.85);
    assert.strictEqual(item?.CountryName, 'england');
  });

  test('Updates vendor price and toggle enable/disable', () => {
    db.prepare(`
      UPDATE fivesim_vendor_prices
      SET price = 1.25, enabled = 0, updated_at = datetime('now')
      WHERE id = 99901
    `).run();

    const cached = vendorService.getCachedVendorPrices({ enabled: false });
    const item = cached.rows.find((r) => r.ID === 99901);
    assert.ok(item, 'Updated vendor price not found');
    assert.strictEqual(item?.Price, 1.25);
    assert.strictEqual(item?.Enabled, false);
  });

  test('Records vendor withdrawal request in fivesim_vendor_payouts', () => {
    db.prepare(`
      INSERT INTO fivesim_vendor_payouts (receiver, method, amount, fee, status, tx_id, created_at)
      VALUES (?, ?, ?, ?, 'COMPLETED', ?, datetime('now'))
    `).run('P1002345678', 'payeer', 250.0, 'payeer', 'tx_test_999');

    const payouts = vendorService.getCachedPayouts(10);
    assert.ok(payouts.length >= 1);
    const p = payouts.find((x) => x.tx_id === 'tx_test_999');
    assert.ok(p, 'Payout record tx_test_999 not found');
    assert.strictEqual(p.amount, 250.0);
    assert.strictEqual(p.method, 'payeer');
  });

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
