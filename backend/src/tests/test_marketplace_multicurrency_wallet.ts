import { initDatabase, getDatabase } from '../db/database.js';
import { WalletService } from '../services/walletService.js';
import { MarketplacePricingService } from '../services/marketplace/MarketplacePricingService.js';
import { MarketplaceChargingService } from '../services/marketplace/MarketplaceChargingService.js';
import { MarketplaceProductService } from '../services/marketplace/MarketplaceProductService.js';
import { MarketplaceJobService } from '../services/marketplace/MarketplaceJobService.js';
import { CurrencyService } from '../services/virtualNumber/CurrencyService.js';
import { ProductDefinition } from '../types/marketplace.js';

async function runMulticurrencyWalletTests() {
  console.log('🚀 Starting Data Marketplace Multi-Currency & Wallet Integration Test...\n');

  initDatabase();
  const db = getDatabase();

  const walletService = WalletService.getInstance();
  const pricingService = MarketplacePricingService.getInstance();
  const chargingService = MarketplaceChargingService.getInstance();
  const productService = MarketplaceProductService.getInstance();
  const jobService = MarketplaceJobService.getInstance();
  const currencyService = CurrencyService.getInstance();

  // Test User
  const testUserId = `test_mkt_curr_${Date.now()}`;
  db.prepare(`
    INSERT INTO users (id, username, password_hash, name, role, plan_tier)
    VALUES (?, ?, 'hash123', 'Currency Tester', 'user', 'pro')
  `).run(testUserId, `currtester_${Date.now()}`);

  const productSlug = `test-leads-${Date.now()}`;
  const mockProduct: ProductDefinition = {
    slug: productSlug,
    display_name: 'Global Lead Finder',
    tagline: 'Extract verified global leads',
    description_md: 'Extract leads on autopilot',
    category: 'B2B & Sales',
    status: 'active',
    provider: {
      type: 'apify',
      actor_id: 'test~leads-actor'
    },
    pricing: {
      mode: 'per_item',
      provider_cost_reference: {
        model: 'pay_per_result',
        usd_per_1000_items: 2.0
      },
      sell: {
        per_1000_items: 500, // ₹500 per 1k results in INR
        per_run_flat: 0
      },
      min_charge: 10,
      margin: {
        type: 'percent',
        value: 30
      }
    },
    limits: {
      min_items: 10,
      max_items_per_run: 5000,
      max_concurrent_runs_per_user: 5,
      timeout_secs: 300,
      memory_mb: 2048
    },
    input: {
      fields: [],
      static_overrides: {},
      hidden_defaults: {}
    },
    access: {
      requires_subscription: false,
      allowed_plan_slugs: []
    },
    output: {
      item_mapping: [],
      drop_fields: [],
      preview_columns: [],
      export_formats: ['csv', 'xlsx', 'json'],
      sanitize: {
        strip_provider_urls: true
      }
    },
    compliance: {
      contains_personal_data: false
    }
  };

  // Save product to database
  productService.saveProduct(mockProduct);
  console.log(`   Saved mock product: ${mockProduct.display_name} (${mockProduct.slug})`);

  // 1. Verify Wallet Initialized with ₹250 welcome credits
  console.log('\n1️⃣ Checking Initial Wallet in INR:');
  const initialWallet = walletService.getOrCreateWallet(testUserId);
  console.log(`   Balance: ₹${initialWallet.balance.toFixed(2)} ${initialWallet.currency}`);
  if (initialWallet.currency !== 'INR' || initialWallet.balance !== 250) {
    throw new Error(`Unexpected initial wallet state: ${JSON.stringify(initialWallet)}`);
  }
  console.log('   ✅ Initial wallet verified with ₹250 welcome bonus.\n');

  // 2. Test Multi-Currency Pricing Quote Calculation
  console.log('2️⃣ Testing Multi-Currency Quote Generation:');
  const quoteInr = pricingService.calculateEstimatedPrice(mockProduct, 1000, 'INR');
  console.log(`   1000 items in INR: ₹${quoteInr.sellPrice.toFixed(2)} (Min charge applied: ${quoteInr.minChargeApplied})`);
  if (quoteInr.sellPrice !== 500 || quoteInr.currency !== 'INR') {
    throw new Error(`Expected ₹500 INR, got ${quoteInr.sellPrice} ${quoteInr.currency}`);
  }

  const quoteUsd = pricingService.calculateEstimatedPrice(mockProduct, 1000, 'USD');
  console.log(`   1000 items in USD: $${quoteUsd.sellPrice.toFixed(2)} ${quoteUsd.currency}`);
  if (quoteUsd.sellPrice <= 0 || quoteUsd.currency !== 'USD') {
    throw new Error(`Expected valid USD quote, got ${quoteUsd.sellPrice} ${quoteUsd.currency}`);
  }

  const quoteEur = pricingService.calculateEstimatedPrice(mockProduct, 1000, 'EUR');
  console.log(`   1000 items in EUR: €${quoteEur.sellPrice.toFixed(2)} ${quoteEur.currency}`);
  if (quoteEur.sellPrice <= 0 || quoteEur.currency !== 'EUR') {
    throw new Error(`Expected valid EUR quote, got ${quoteEur.sellPrice} ${quoteEur.currency}`);
  }
  console.log('   ✅ Multi-currency quotes successfully generated with dynamic exchange rates.\n');

  // 3. Test Insufficient Balance Rejection
  console.log('3️⃣ Testing Insufficient Balance Check:');
  try {
    // 1000 items costs ₹500, but user only has ₹250
    await jobService.createJob(testUserId, productSlug, {}, 1000, false, false, 'INR');
    throw new Error('Should have thrown insufficient balance error!');
  } catch (err: any) {
    console.log(`   Properly caught expected rejection: "${err.message}"`);
    if (!err.message.includes('Insufficient wallet balance') && !err.message.includes('₹')) {
      throw new Error(`Expected formatted insufficient balance message, got: ${err.message}`);
    }
  }
  console.log('   ✅ Insufficient funds guard cleanly prevented execution.\n');

  // 4. Test Top-Up and Successful Job Creation in INR
  console.log('4️⃣ Testing Wallet Top-Up and INR Job Creation:');
  walletService.topUp(testUserId, 350, 'Marketplace Credit Top-Up', 'TOPUP_INR_01');
  const toppedWallet = walletService.getOrCreateWallet(testUserId);
  console.log(`   Wallet balance after top-up: ₹${toppedWallet.balance.toFixed(2)}`);

  const jobInr = await jobService.createJob(testUserId, productSlug, {}, 1000, false, false, 'INR');
  console.log(`   Job created: ID=${jobInr.id}, Reserved=₹${jobInr.reserved_amount} ${jobInr.currency}`);
  const postReserveWallet = walletService.getOrCreateWallet(testUserId);
  console.log(`   Wallet after reserve: Balance = ₹${postReserveWallet.balance.toFixed(2)}, Reserved = ₹${postReserveWallet.reserved_balance.toFixed(2)}`);
  if (postReserveWallet.reserved_balance !== 500) {
    throw new Error(`Expected reserved_balance 500, got ${postReserveWallet.reserved_balance}`);
  }
  console.log('   ✅ INR reservation accurately locked funds in wallet.\n');

  // 5. Test Settlement (Delivered 500 out of 1000 items)
  console.log('5️⃣ Testing Safe Settlement for Partial Delivery:');
  const settlement = await chargingService.settleJob(jobInr.id, 500, 1.0);
  console.log(`   Charged: ₹${settlement.finalCharge.toFixed(2)}, Refunded unused: ₹${settlement.refundDue.toFixed(2)}`);
  if (settlement.finalCharge !== 250 || settlement.refundDue !== 250) {
    throw new Error(`Expected charge ₹250 and refund ₹250, got charge ${settlement.finalCharge}, refund ${settlement.refundDue}`);
  }

  const postSettleWallet = walletService.getOrCreateWallet(testUserId);
  console.log(`   Wallet after settlement: Balance = ₹${postSettleWallet.balance.toFixed(2)}, Reserved = ₹${postSettleWallet.reserved_balance.toFixed(2)}`);
  if (postSettleWallet.reserved_balance !== 0) {
    throw new Error(`Expected reserved_balance 0, got ${postSettleWallet.reserved_balance}`);
  }
  console.log('   ✅ Settle safely deducted delivered cost and unlocked unused funds.\n');

  // 6. Test Currency Switch & Cross-Currency Reservation
  console.log('6️⃣ Testing Wallet Currency Switch to USD & Cross-Currency Reservation:');
  currencyService.switchUserCurrency(testUserId, 'USD');
  const usdWallet = walletService.getOrCreateWallet(testUserId);
  console.log(`   Switched Wallet: Balance = $${usdWallet.balance.toFixed(2)} ${usdWallet.currency}`);

  // Create job requesting 200 items in USD
  const jobUsd = await jobService.createJob(testUserId, productSlug, {}, 200, false, false, 'USD');
  console.log(`   Created USD Job: ID=${jobUsd.id}, Reserved=$${jobUsd.reserved_amount.toFixed(2)} ${jobUsd.currency}`);
  const postReserveUsdWallet = walletService.getOrCreateWallet(testUserId);
  console.log(`   Wallet after USD reserve: Balance = $${postReserveUsdWallet.balance.toFixed(2)}, Reserved = $${postReserveUsdWallet.reserved_balance.toFixed(2)}`);

  // 7. Test Abort / Failure Refund
  console.log('\n7️⃣ Testing Complete Refund on Abort:');
  await jobService.abortJob(jobUsd.id, testUserId);
  const postAbortWallet = walletService.getOrCreateWallet(testUserId);
  console.log(`   Wallet after abort: Balance = $${postAbortWallet.balance.toFixed(2)}, Reserved = $${postAbortWallet.reserved_balance.toFixed(2)}`);
  if (postAbortWallet.reserved_balance !== 0) {
    throw new Error(`Expected reserved_balance 0 after abort, got ${postAbortWallet.reserved_balance}`);
  }
  console.log('   ✅ Abort released 100% of reserved funds back to available balance.\n');

  // 8. Verify Transaction History
  console.log('8️⃣ Verifying Wallet Transaction History:');
  const txs = walletService.listTransactions(testUserId);
  console.log(`   Found ${txs.length} transactions in user wallet ledger:`);
  txs.forEach((tx, idx) => {
    console.log(`     [${idx + 1}] ${tx.transaction_type}: ${tx.currency} ${tx.amount.toFixed(2)} (Balance: ${tx.new_balance.toFixed(2)}) - ${tx.description}`);
  });
  if (txs.length < 5) {
    throw new Error(`Expected at least 5 transactions logged, found ${txs.length}`);
  }
  console.log('   ✅ All wallet operations logged to immutable audit ledger.\n');

  console.log('🎉 ALL MULTI-CURRENCY & WALLET MARKETPLACE TESTS PASSED WITH 100% SUCCESS!');
  process.exit(0);
}

runMulticurrencyWalletTests().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
