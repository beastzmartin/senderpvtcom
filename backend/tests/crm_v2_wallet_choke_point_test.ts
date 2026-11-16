/**
 * CRM V2: Part 1 - Wallet-Only Billing & Hard Choke Point Test Suite
 * Mandatory automated verification of single choke point, zero bypass paths,
 * idempotency, integer money correctness, mid-transaction rollback, and 50-worker concurrency.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getDatabase } from '../src/db/database.js';
import { WalletService } from '../src/services/walletService.js';
import { CurrencyMinorUnits } from '../src/services/currency/CurrencyMinorUnits.js';
import { CrmSqliteAdapter } from '../src/crm/db/CrmSqliteAdapter.js';
import { CrmBillingService } from '../src/crm/services/CrmBillingService.js';
import { CrmSuperFieldService } from '../src/crm/services/CrmSuperFieldService.js';

async function runWalletChokePointSuite() {
  console.log('🧪 Starting CRM V2 Part 1: Wallet-Only Billing & Choke Point Verification...\n');

  const db = getDatabase();
  const storage = new CrmSqliteAdapter();
  await storage.initialize();

  const walletService = WalletService.getInstance();

  // Pick or create test user
  const adminUser = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get() as any;
  if (!adminUser) throw new Error('No admin user found in database');
  const testUserId = adminUser.id;

  // Verify / initialize workspace
  const ws = await storage.getUserDefaultWorkspace(testUserId);

  // Ensure default plans exist
  const catalogPlans = await storage.listBillingPlans();
  if (catalogPlans.length === 0) throw new Error('No billing plans found in catalog');
  const testPlan = catalogPlans.find((p) => p.slug === 'growth') || catalogPlans[0];
  console.log(`✅ Billing plan catalog loaded. Using "${testPlan.name}" ($${testPlan.price_usd} USD)`);

  // =========================================================================
  // TEST 1: STATIC CODE SCANNER - ZERO BYPASS PATHS & NO DIRECT BALANCE UPDATES
  // =========================================================================
  console.log('\n--- TEST 1: STATIC AUDIT SCANNER (ZERO BYPASS ENFORCEMENT) ---');
  const backendSrcDir = path.resolve('backend/src');
  const violations: string[] = [];

  function scanDir(dir: string) {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      const fullPath = path.join(dir, f);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scanDir(fullPath);
      } else if (f.endsWith('.ts') && !f.endsWith('.d.ts')) {
        const content = fs.readFileSync(fullPath, 'utf8');

        // Check 1: No payment gateway imports in CRM code
        if (fullPath.includes('/crm/')) {
          const lower = content.toLowerCase();
          if (
            lower.includes('stripe') ||
            lower.includes('razorpay') ||
            lower.includes('cashfree') ||
            lower.includes('paypal')
          ) {
            violations.push(`Payment gateway reference found in CRM code: ${fullPath}`);
          }
        }

        // Check 2: No direct balance modifications outside walletService.ts, CurrencyService.ts (display switch), and database.ts (schema migration)
        const relPath = path.relative(backendSrcDir, fullPath);
        if (
          relPath !== 'services/walletService.ts' &&
          relPath !== 'services/virtualNumber/CurrencyService.ts' &&
          relPath !== 'db/database.ts'
        ) {
          if (/UPDATE\s+user_wallets\s+SET\s+balance/i.test(content)) {
            violations.push(`Illegal direct balance update SQL in ${relPath}`);
          }
        }
      }
    }
  }

  scanDir(backendSrcDir);
  if (violations.length > 0) {
    throw new Error(`Static Scanner Violations Found:\n${violations.join('\n')}`);
  }
  console.log('✅ Static Scanner Audit: ZERO external payment gateways and ZERO rogue balance updates found across all backend source files!');

  // =========================================================================
  // TEST 2: PURCHASE WITH ZERO / LOW BALANCE (MUST BE REJECTED)
  // =========================================================================
  console.log('\n--- TEST 2: LOW BALANCE REJECTION & ZERO SUBSCRIPTION CREATION ---');
  // Create a poor test user
  const poorUserId = crypto.randomUUID();
  const poorEmail = `poor_${Date.now()}@test.com`;
  db.prepare(`
    INSERT INTO users (id, username, email, password_hash, name, role)
    VALUES (?, ?, ?, 'hash', 'Poor User', 'user')
  `).run(poorUserId, poorEmail, poorEmail);

  // Initialize poor user's wallet with ₹0.00
  db.prepare(`
    INSERT INTO user_wallets (user_id, balance, currency, base_balance, base_currency, total_spent, total_topped_up)
    VALUES (?, 0.0, 'INR', 0.0, 'INR', 0.0, 0.0)
  `).run(poorUserId);

  const poorWs = await storage.getUserDefaultWorkspace(poorUserId);

  let lowBalanceRejected = false;
  try {
    await CrmBillingService.subscribeToPlan(storage, poorWs.id, poorUserId, testPlan.id);
  } catch (err: any) {
    if (err.code === 'INSUFFICIENT_WALLET_BALANCE' || err.message.includes('Insufficient wallet balance')) {
      lowBalanceRejected = true;
      console.log(`✅ Successfully rejected purchase: "${err.message}"`);
      if (err.shortfall !== undefined) {
        console.log(`   Detailed Shortfall: Need ${err.currency} ${err.shortfall.toFixed(2)} more`);
      }
    } else {
      throw err;
    }
  }

  if (!lowBalanceRejected) {
    throw new Error('FAILED: Purchase succeeded with 0 balance! Security check failed.');
  }

  // Ensure no subscription was created for poor user
  const realSubInDb = db.prepare("SELECT * FROM crm_subscriptions WHERE workspace_id = ? AND plan_id = ?").get(poorWs.id, testPlan.id);
  if (realSubInDb) {
    throw new Error('FAILED: Subscription record was created despite insufficient balance!');
  }
  console.log('✅ Verified: No subscription was created on low balance.');

  // =========================================================================
  // TEST 3: SERVER-SIDE AUTHORITY (PRICE TAMPERING GUARD & FORMULA DYNAMICS)
  // =========================================================================
  console.log('\n--- TEST 3: SERVER-SIDE AUTHORITY & PRICE TAMPERING GUARD ---');
  // Top up user wallet
  walletService.topUp(testUserId, 20000, 'Top-up for Server Authority Test');

  // Attempt purchase with tampered client price ($1.00 instead of $29.00)
  let priceTamperRejected = false;
  try {
    await CrmBillingService.subscribeToPlan(
      storage,
      ws.id,
      testUserId,
      testPlan.id,
      undefined,
      true,
      1.0 // Client claims it costs $1.00!
    );
  } catch (err: any) {
    if (err.code === 'PRICE_CHANGED' || err.message.includes('Price has changed')) {
      priceTamperRejected = true;
      console.log(`✅ Tampered price ($1.00 vs actual) was rejected: "${err.message}"`);
    } else {
      throw err;
    }
  }
  if (!priceTamperRejected) {
    throw new Error('FAILED: Server accepted tampered client expected price!');
  }

  // Test SuperField dynamic formula (reads dynamic tax setting instead of hardcoded 0.18)
  const billingSettings = await storage.getBillingSettings();
  billingSettings.gst_vat_rate_percent = 28.0; // 28% Luxury tax
  await storage.updateBillingSettings(billingSettings);

  const formulaResult = CrmSuperFieldService.evaluateFormula(
    '{deal_value} * ({tax_rate} / 100)',
    { deal_value: 10000 },
    billingSettings
  );
  if (formulaResult !== 2800) {
    throw new Error(`Dynamic formula evaluation failed: expected 2800, got ${formulaResult}`);
  }
  console.log(`✅ SuperField formula evaluated dynamically against admin tax rate (${billingSettings.gst_vat_rate_percent}%): 10,000 * 28% = ${formulaResult}`);

  // Restore tax rate to 18%
  billingSettings.gst_vat_rate_percent = 18.0;
  await storage.updateBillingSettings(billingSettings);

  // =========================================================================
  // TEST 4: IDEMPOTENCY KEY (DOUBLE-CLICK / RETRY PROTECTION)
  // =========================================================================
  console.log('\n--- TEST 4: IDEMPOTENCY KEY PROTECTION (DOUBLE CHARGE GUARD) ---');
  const initialWallet = walletService.getOrCreateWallet(testUserId);
  const idempotencyKey = `idempotency_test_${Date.now()}`;

  // First purchase
  const sub1 = await CrmBillingService.subscribeToPlan(
    storage,
    ws.id,
    testUserId,
    testPlan.id,
    undefined,
    true,
    undefined,
    idempotencyKey
  );

  const walletAfterFirst = walletService.getOrCreateWallet(testUserId);
  const chargedAmount = initialWallet.balance - walletAfterFirst.balance;
  console.log(`✅ First Call: Charged ${initialWallet.currency} ${chargedAmount.toFixed(2)}, Invoice: ${sub1.invoice.invoice_number}`);

  // Immediate retry with the EXACT same idempotency key (simulating network retry or double-click)
  const sub2 = await CrmBillingService.subscribeToPlan(
    storage,
    ws.id,
    testUserId,
    testPlan.id,
    undefined,
    true,
    undefined,
    idempotencyKey
  );

  const walletAfterSecond = walletService.getOrCreateWallet(testUserId);
  if (walletAfterFirst.balance !== walletAfterSecond.balance) {
    throw new Error(`Double charge detected! Balance changed from ${walletAfterFirst.balance} to ${walletAfterSecond.balance}`);
  }
  console.log(`✅ Second Call (Idempotent Retry): Balance unchanged (${walletAfterSecond.balance.toFixed(2)}). ZERO double charge!`);

  // =========================================================================
  // TEST 5: MID-TRANSACTION CRASH SIMULATION & ROLLBACK INTEGRITY
  // =========================================================================
  console.log('\n--- TEST 5: CRASH SIMULATION MID-TRANSACTION & ZERO HALF-STATES ---');
  const balanceBeforeCrash = walletService.getOrCreateWallet(testUserId).balance;
  let crashAborted = false;

  try {
    await walletService.debit({
      userId: testUserId,
      amountMinorUnits: 5000,
      currency: 'USD',
      reason: 'Crash Simulation Debit',
      referenceType: 'test_crash',
      referenceId: 'crash_ref_01',
      businessEffect: () => {
        // Simulate unexpected DB crash or exception during business side effect
        throw new Error('SIMULATED_CRASH_MID_TRANSACTION');
      }
    });
  } catch (err: any) {
    if (err.message === 'SIMULATED_CRASH_MID_TRANSACTION') {
      crashAborted = true;
    } else {
      throw err;
    }
  }

  if (!crashAborted) {
    throw new Error('Simulated crash did not abort transaction!');
  }

  const balanceAfterCrash = walletService.getOrCreateWallet(testUserId).balance;
  if (balanceBeforeCrash !== balanceAfterCrash) {
    throw new Error(`Transaction rollback failure! Balance changed despite crash: ${balanceBeforeCrash} -> ${balanceAfterCrash}`);
  }

  // Ensure no orphaned transaction was recorded in ledger
  const orphanTx = db.prepare("SELECT * FROM wallet_transactions WHERE reference_id = 'crash_ref_01'").get();
  if (orphanTx) {
    throw new Error('Orphan transaction found in ledger despite rollback!');
  }
  console.log('✅ Crash Simulation Verified: Database completely rolled back. Zero orphaned charges, zero half-state!');

  // =========================================================================
  // TEST 6: 50 PARALLEL CONCURRENT DEBITS AGAINST 10-CAPACITY WALLET
  // =========================================================================
  console.log('\n--- TEST 6: 50 PARALLEL CONCURRENT DEBITS (RACE CONDITION GUARD) ---');
  // Create isolated user with EXACT balance for 10 debits of $1.00 USD each
  const raceUserId = crypto.randomUUID();
  const raceEmail = `race_${Date.now()}@test.com`;
  db.prepare(`
    INSERT INTO users (id, username, email, password_hash, name, role)
    VALUES (?, ?, ?, 'hash', 'Race User', 'user')
  `).run(raceUserId, raceEmail, raceEmail);

  const debitCostCents = 100; // $1.00 USD = 100 cents
  const totalSlots = 10;
  const totalAllowedBudgetUsd = totalSlots * 1.0;

  // Insert wallet with exactly 10 USD (or equivalent INR)
  db.prepare(`
    INSERT INTO user_wallets (user_id, balance, currency, base_balance, base_currency, total_spent, total_topped_up)
    VALUES (?, ?, 'USD', ?, 'USD', 0.0, ?)
  `).run(raceUserId, totalAllowedBudgetUsd, totalAllowedBudgetUsd, totalAllowedBudgetUsd);

  console.log(`⚡ Launching 50 concurrent parallel debit requests against wallet with balance for exactly 10...`);
  const concurrencyCount = 50;

  const results = await Promise.allSettled(
    Array.from({ length: concurrencyCount }).map((_, idx) =>
      walletService.debit({
        userId: raceUserId,
        amountMinorUnits: debitCostCents,
        currency: 'USD',
        reason: `Concurrent Slot Attempt #${idx + 1}`,
        referenceType: 'stress_test',
        referenceId: `stress_${idx + 1}`
      })
    )
  );

  const successfulDebits = results.filter((r) => r.status === 'fulfilled').length;
  const failedDebits = results.filter((r) => r.status === 'rejected').length;
  const finalRaceWallet = walletService.getOrCreateWallet(raceUserId);

  console.log(`📊 Concurrency Results: ${successfulDebits} Succeeded, ${failedDebits} Rejected (Insufficient Funds)`);
  console.log(`   Final Wallet Balance: $${finalRaceWallet.balance.toFixed(2)} USD`);

  if (successfulDebits !== totalSlots) {
    throw new Error(`Race condition detected! Exactly ${totalSlots} debits should have succeeded, but ${successfulDebits} succeeded.`);
  }
  if (failedDebits !== concurrencyCount - totalSlots) {
    throw new Error(`Mismatched rejected count: expected ${concurrencyCount - totalSlots}, got ${failedDebits}`);
  }
  if (finalRaceWallet.balance < 0) {
    throw new Error(`CRITICAL: Wallet balance became negative: ${finalRaceWallet.balance}`);
  }
  if (finalRaceWallet.balance !== 0) {
    throw new Error(`Wallet balance should be exactly 0, got ${finalRaceWallet.balance}`);
  }
  console.log('✅ Hard Concurrency Test Passed: EXACTLY 10 debits succeeded, zero negative balance, zero race conditions!');

  // =========================================================================
  // TEST 7: DB-LEVEL SAFETY (TRIGGER PREVENTS NEGATIVE BALANCE EVEN VIA SQL)
  // =========================================================================
  console.log('\n--- TEST 7: DB-LEVEL TRIGGER (PREVENTS NEGATIVE BALANCE AT SQL LEVEL) ---');
  let triggerBlocked = false;
  try {
    db.prepare('UPDATE user_wallets SET balance = -50.0 WHERE user_id = ?').run(raceUserId);
  } catch (err: any) {
    if (err.message.includes('INSUFFICIENT_FUNDS') || err.message.includes('Wallet balance cannot be negative')) {
      triggerBlocked = true;
      console.log(`✅ SQLite Trigger successfully aborted direct negative balance update: "${err.message}"`);
    } else {
      throw err;
    }
  }
  if (!triggerBlocked) {
    throw new Error('FAILED: SQLite trigger did not prevent direct negative balance update!');
  }

  // =========================================================================
  // TEST 8: REFUND, COMPLIMENTARY GRANT & LEDGER BALANCE RECONCILIATION
  // =========================================================================
  console.log('\n--- TEST 8: COMPLIMENTARY GRANT, REFUND & LEDGER RECONCILIATION ---');
  // Complimentary grant
  const compResult = await CrmBillingService.grantComplimentaryPlan(
    storage,
    ws.id,
    testUserId,
    testPlan.id,
    60,
    'Strategic Partnership Complimentary Access'
  );
  if (compResult.invoice.amount_usd !== 0) {
    throw new Error('Complimentary invoice amount must be 0');
  }
  console.log(`✅ Complimentary grant issued with $0 invoice: ${compResult.invoice.invoice_number}`);

  // Create clean isolated user for exact ledger-to-balance reconciliation
  const auditUserId = crypto.randomUUID();
  const auditEmail = `audit_${Date.now()}@test.com`;
  db.prepare(`
    INSERT INTO users (id, username, email, password_hash, name, role)
    VALUES (?, ?, ?, 'hash', 'Audit User', 'user')
  `).run(auditUserId, auditEmail, auditEmail);

  walletService.topUp(auditUserId, 500, 'Initial Top Up for Audit User');
  console.log('✅ Audit User initialized with ₹500.00 top-up');

  // Perform a plan debit via canonical choke point
  const planDebitRes = await walletService.debit({
    userId: auditUserId,
    amountMinorUnits: 20000, // ₹200.00 = 20000 paise
    currency: 'INR',
    reason: 'Monthly CRM Access',
    referenceType: 'crm_plan',
    referenceId: ws.id
  });
  console.log(`✅ Plan debit executed: Charged ₹${planDebitRes.amountCharged.toFixed(2)}, New Balance: ₹${planDebitRes.newBalance.toFixed(2)}`);

  // Process a refund
  const refundRes = walletService.refund({
    userId: auditUserId,
    amountMinorUnits: 5000, // ₹50.00 refund
    currency: 'INR',
    reason: 'Prorated Plan Credit Adjustment',
    referenceType: 'crm_credit_note',
    referenceId: 'sub_test_01'
  });
  console.log(`✅ Refund applied to wallet. Transaction: ${refundRes.transactionId}, New Balance: ₹${refundRes.newBalance.toFixed(2)}`);

  // Audit reconciliation (Initial 500 - 200 + 50 = 350)
  const audit = walletService.auditLedgerBalance(auditUserId);
  console.log(`📊 Ledger Audit: Wallet Balance = ₹${audit.walletBalance.toFixed(2)}, Ledger Balance = ₹${audit.ledgerBalance.toFixed(2)}, Delta = ${audit.delta}`);
  if (!audit.matches || audit.delta !== 0) {
    throw new Error(`Ledger audit mismatch: Wallet Balance (${audit.walletBalance}) !== Ledger Balance (${audit.ledgerBalance})`);
  }
  console.log('✅ Ledger Reconciliation: ZERO mismatch between wallet balance and immutable ledger history!');

  console.log('\n🎉 ALL CRM V2 PART 1 WALLET-ONLY BILLING & CHOKE POINT TESTS PASSED 100%!\n');
}

runWalletChokePointSuite().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
