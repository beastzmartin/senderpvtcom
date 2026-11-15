import { getDatabase } from '../db/database.js';
import { initMarginSchema } from '../db/marginSchema.js';
import { WalletService } from '../services/walletService.js';
import { MarginService } from '../services/virtualNumber/MarginService.js';
import { NumberPurchaseService } from '../services/virtualNumber/NumberPurchaseService.js';
import { FiveSimConfigService } from '../services/virtualNumber/fivesim/FiveSimConfigService.js';

async function runPurchaseFlowTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING NUMBER PURCHASE & RECONCILIATION TEST SUITE');
  console.log('====================================================\n');

  const db = getDatabase();
  initMarginSchema(db);

  const walletService = WalletService.getInstance();
  const marginService = MarginService.getInstance();
  const purchaseService = NumberPurchaseService.getInstance();

  let passed = 0;
  let failed = 0;

  function assert(desc: string, cond: boolean) {
    if (cond) {
      console.log(`  ✅ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${desc}`);
      failed++;
    }
  }

  // Setup test user
  const testUserId = 'test-buyer-' + Date.now();
  db.prepare(`
    INSERT INTO users (id, username, password_hash, name, role)
    VALUES (?, ?, 'hash', 'Test Buyer', 'user')
  `).run(testUserId, 'testbuyer_' + Date.now());

  // Ensure test user has 100 wallet balance
  const wallet = walletService.getOrCreateWallet(testUserId);
  if (wallet.balance < 100) {
    walletService.topUp(testUserId, 100 - wallet.balance, 'Test balance top up');
  }

  console.log('--- Test Group 1: Price Calculation & User Masking ---');
  // Configure test margin: global 25% + min_margin 2.0
  marginService.updatePricingSettings({ fx_rate: 1.0, min_margin: 2.0, display_currency: 'INR' });
  marginService.updateMarginRule('default_global_margin', { type: 'percent', percent_value: 25, enabled: true });

  const priceResult = await purchaseService.getPrices('england', 'whatsapp', false);
  assert('Prices endpoint returns operators array', Array.isArray(priceResult.operators) && priceResult.operators.length > 0);
  assert('Sell price is calculated for operators', priceResult.operators[0].sell_price > 0);
  assert('Cost price is strictly hidden when isAdmin = false', (priceResult.operators[0] as any).raw_cost_rub === undefined);

  console.log('\n--- Test Group 2: Insufficient Balance Rejection ---');
  const poorUserId = 'poor-user-' + Date.now();
  db.prepare(`
    INSERT INTO users (id, username, password_hash, name, role)
    VALUES (?, ?, 'hash', 'Poor User', 'user')
  `).run(poorUserId, 'pooruser_' + Date.now());
  // Drain wallet
  const poorWallet = walletService.getOrCreateWallet(poorUserId);
  if (poorWallet.balance > 0) {
    walletService.deduct(poorUserId, poorWallet.balance, 'usage_deduction', 'Drain balance');
  }

  let failedInsufficient = false;
  try {
    await purchaseService.buyNumber(poorUserId, { country: 'england', product: 'whatsapp', operator: 'any' });
  } catch (err: any) {
    failedInsufficient = err.message.toLowerCase().includes('insufficient wallet balance');
  }
  assert('Rejects purchase when wallet balance is insufficient', failedInsufficient);

  console.log('\n--- Test Group 3: Refund Idempotency ---');
  // Manually insert a mock order in DB to test refund pipeline without requiring live 5SIM token
  const mockOrderId = 'mock-ord-' + Date.now();
  const mock5SimId = Math.floor(Date.now() % 10000000) + 1000;
  const balanceBefore = walletService.getOrCreateWallet(testUserId).balance;
  const chargeAmount = 25.0;

  // Deduct from wallet
  const deductRes = walletService.deduct(testUserId, chargeAmount, 'usage_deduction', 'Mock test purchase');

  db.prepare(`
    INSERT INTO number_orders (
      id, user_id, fivesim_order_id, country, operator, product, phone,
      status, cost_price, sell_price, profit, currency, wallet_transaction_id, created_at
    ) VALUES (
      ?, ?, ?, 'england', 'virtual59', 'whatsapp', '+447911122233',
      'PENDING', 20.0, 25.0, 5.0, 'INR', ?, datetime('now')
    )
  `).run(mockOrderId, testUserId, mock5SimId, deductRes.transactionId);

  // First cancellation / refund call
  const cancelRes = await purchaseService.cancelOrder(mockOrderId, testUserId);
  assert('Order cancellation succeeds', cancelRes.success);
  assert('Order status marked as CANCELED', cancelRes.order.status === 'CANCELED');
  assert('Order marked as refunded in DB', cancelRes.order.refunded === true);

  const balanceAfterFirstRefund = walletService.getOrCreateWallet(testUserId).balance;
  assert('User wallet refunded exact amount', Math.abs(balanceAfterFirstRefund - balanceBefore) < 0.01);

  // Calling refundOrderInternal a second time must NOT double refund (idempotency check)
  const secondRefund = purchaseService.refundOrderInternal(mockOrderId, 'Duplicate refund attempt');
  const balanceAfterSecondRefund = walletService.getOrCreateWallet(testUserId).balance;
  assert('Second refund attempt safely skipped (no duplicate money created)', balanceAfterSecondRefund === balanceAfterFirstRefund);

  console.log('\n--- Test Group 4: Finish Order Flow ---');
  const finishOrderId = 'finish-ord-' + Date.now();
  db.prepare(`
    INSERT INTO number_orders (
      id, user_id, fivesim_order_id, country, operator, product, phone,
      status, cost_price, sell_price, profit, currency, otp_code, created_at
    ) VALUES (
      ?, ?, ?, 'england', 'virtual59', 'telegram', '+447911998877',
      'RECEIVED', 15.0, 20.0, 5.0, 'INR', '48192', datetime('now')
    )
  `).run(finishOrderId, testUserId, mock5SimId + 1);

  const finishRes = await purchaseService.finishOrder(finishOrderId, testUserId);
  assert('Finish order sets status to FINISHED', finishRes.order.status === 'FINISHED');
  assert('Finish order preserves profit and does not refund', finishRes.order.refunded === false);

  console.log('\n--- Test Group 5: Profit Report Calculation ---');
  const profitReport = purchaseService.getProfitReport('daily');
  assert('Profit report returns valid summary', profitReport.summary.totalRevenue >= 0);
  assert('Profit report net profit is computed', typeof profitReport.summary.netProfit === 'number');
  assert('Profit report includes periodic breakdown array', Array.isArray(profitReport.breakdown));

  console.log('\n====================================================');
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) process.exit(1);
  process.exit(0);
}

runPurchaseFlowTests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
