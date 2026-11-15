import assert from 'assert';
import { getDatabase } from '../db/database.js';
import { CurrencyService } from '../services/virtualNumber/CurrencyService.js';
import { WalletService } from '../services/walletService.js';
import crypto from 'crypto';

async function runCurrencyTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING CURRENCY CONVERSION & SWITCHING TEST SUITE');
  console.log('====================================================\n');

  const db = getDatabase();
  const currencyService = CurrencyService.getInstance(db);
  const walletService = WalletService.getInstance();

  // Test 1: Active currencies list
  console.log('--- Test Group 1: Currencies List & Default ---');
  const currencies = currencyService.getAllCurrencies(true);
  assert(currencies.length >= 5, 'Should have multiple seeded active currencies');
  const inr = currencyService.getCurrency('INR');
  assert(inr !== null, 'INR must exist');
  assert.strictEqual(inr?.symbol, '₹');
  console.log(`  ✅ [PASS] Loaded ${currencies.length} active currencies with symbols`);

  // Test 2: 5SIM Base Conversion
  console.log('\n--- Test Group 2: 5SIM Base Cost Conversion ---');
  // Suppose a 5SIM number costs 10 RUB
  const inrConv = currencyService.convertFrom5SimBase(10, 'INR');
  assert.strictEqual(inrConv.currency, 'INR');
  assert(inrConv.amount > 0, 'Converted amount in INR should be > 0');
  console.log(`  ✅ [PASS] 10 5SIM RUB converted to INR: ₹${inrConv.amount} (Rate: ${inrConv.rate})`);

  const usdConv = currencyService.convertFrom5SimBase(10, 'USD');
  assert.strictEqual(usdConv.currency, 'USD');
  assert(usdConv.amount > 0, 'Converted amount in USD should be > 0');
  console.log(`  ✅ [PASS] 10 5SIM RUB converted to USD: $${usdConv.amount} (Rate: ${usdConv.rate})`);

  // Test 3: Admin Rate Update
  console.log('\n--- Test Group 3: Admin Rate Management ---');
  currencyService.updateCurrency('USD', { rate_from_5sim_base: 0.015 });
  const updatedUsd = currencyService.getCurrency('USD');
  assert.strictEqual(updatedUsd?.rate_from_5sim_base, 0.015);
  console.log(`  ✅ [PASS] Admin successfully updated USD rate to 0.015`);

  // Reset USD rate
  currencyService.updateCurrency('USD', { rate_from_5sim_base: 0.012 });

  // Test 4: User Currency Switching & Wallet Balance Conversion
  console.log('\n--- Test Group 4: User Currency Switching & Wallet Conversion ---');
  const testUserId = `test-curr-user-${Date.now()}`;
  db.prepare(`
    INSERT INTO users (id, username, password_hash, name, role)
    VALUES (?, ?, 'hash123', 'Currency Switcher', 'user')
  `).run(testUserId, `user_${Date.now()}`);

  const initWallet = walletService.getOrCreateWallet(testUserId);
  assert.strictEqual(initWallet.currency, 'INR');
  assert(initWallet.balance > 0, 'Initial wallet should have starting balance');
  const oldBalance = initWallet.balance; // e.g. 250 INR

  // User switches to USD
  const switchRes = currencyService.switchUserCurrency(testUserId, 'USD');
  assert.strictEqual(switchRes.success, true);
  assert.strictEqual(switchRes.oldCurrency, 'INR');
  assert.strictEqual(switchRes.newCurrency, 'USD');
  assert.strictEqual(switchRes.oldBalance, oldBalance);
  assert(switchRes.newBalance > 0, 'New balance in USD should be > 0');
  console.log(`  ✅ [PASS] User wallet converted from ${oldBalance} INR to $${switchRes.newBalance} USD (Rate: ${switchRes.rate.toFixed(4)})`);

  const verifyWallet = walletService.getOrCreateWallet(testUserId);
  assert.strictEqual(verifyWallet.currency, 'USD');
  assert.strictEqual(verifyWallet.balance, switchRes.newBalance);
  console.log(`  ✅ [PASS] Wallet record reflects new currency 'USD' with converted balance`);

  console.log('\n====================================================');
  console.log('SUMMARY: ALL CURRENCY CONVERSION TESTS PASSED');
  console.log('====================================================\n');
}

runCurrencyTests().catch((err) => {
  console.error('Currency test failed:', err);
  process.exit(1);
});
